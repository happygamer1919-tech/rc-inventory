-- assertions/0045_product_image.sql
-- Card P3-56. The product picture column, the shape its path must take, the
-- owner-only delete in rc-docs widened to product/, and the bucket that already
-- accepts the three picture types.
--
-- WHAT THIS FILE CANNOT PROVE, SAID HERE SO NOBODY READS IT AS PROVEN. It runs on
-- a bare postgres with a shim for the storage schema, so it proves what the
-- policy and the bucket row SAY, not that the storage server obeys them. That
-- half is tests/e2e/product-image.spec.ts, against a real local Supabase stack.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n integer;
begin
  -- --- the column: text, nullable, no default --------------------------------
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products' and column_name = 'image_path'
    and data_type = 'text' and is_nullable = 'YES' and column_default is null;
  if n <> 1 then
    raise exception 'P3-56: products.image_path is not a nullable text column without a default';
  end if;

  -- --- the path constraint exists ---------------------------------------------
  select count(*) into n
  from pg_constraint
  where conrelid = 'public.products'::regclass
    and conname = 'products_image_path_shape' and contype = 'c';
  if n <> 1 then
    raise exception 'P3-56: the products_image_path_shape constraint is missing';
  end if;

  -- --- the delete reaches client/, project/ and product/, owners only ---------
  select count(*) into n
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'rc_docs_delete'
    and cmd = 'DELETE'
    and roles = '{authenticated}'::name[]
    and qual like '%rc-docs%'
    and qual like '%is_owner()%'
    and position('''client/%''' in qual) > 0
    and position('''project/%''' in qual) > 0
    and position('''product/%''' in qual) > 0;
  if n <> 1 then
    raise exception 'P3-56: rc_docs_delete is not an owner-only delete in rc-docs under client/, project/ and product/';
  end if;

  -- --- the bucket accepts the three picture types, at 10 MB or more -----------
  select count(*) into n
  from storage.buckets
  where id = 'rc-docs' and public = false and file_size_limit >= 10485760
    and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']::text[];
  if n <> 1 then
    raise exception 'P3-56: rc-docs does not accept image/jpeg, image/png and image/webp up to 10 MB';
  end if;
end
$$;


-- ===========================================================================
-- 2. WHAT A PICTURE PATH MAY BE
-- ===========================================================================

insert into auth.users (id, email) values
  ('e3560000-0000-4000-8000-000000000001', 'p3-56-owner@rc-inventory.local'),
  ('e3560000-0000-4000-8000-000000000002', 'p3-56-manager@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3560000-0000-4000-8000-000000000001', 'p3-56-owner@rc-inventory.local', 'owner', true),
  ('e3560000-0000-4000-8000-000000000002', 'p3-56-manager@rc-inventory.local', 'account_manager', true);

insert into public.categories (id, name)
values ('e3561000-0000-4000-8000-000000000001', 'Test P3-56');

insert into public.products (id, sku, name, category_id, unit) values
  ('e3562000-0000-4000-8000-000000000001', 'P356-CU-IMAGINE', 'Produs cu imagine',
   'e3561000-0000-4000-8000-000000000001', 'pcs'),
  ('e3562000-0000-4000-8000-000000000002', 'P356-ALT', 'Alt produs',
   'e3561000-0000-4000-8000-000000000001', 'pcs');

-- --- A PRODUCT WITH NO PICTURE, AND EACH OF THE FOUR EXTENSIONS, ARE ACCEPTED --
do $$
declare
  ext text;
  got text;
begin
  select image_path into got from public.products where id = 'e3562000-0000-4000-8000-000000000002';
  if got is not null then
    raise exception 'P3-56: a new product carries image_path %, expected null', got;
  end if;

  foreach ext in array array['jpg', 'jpeg', 'png', 'webp'] loop
    begin
      update public.products
      set image_path = 'product/e3562000-0000-4000-8000-000000000001/e3563000-0000-4000-8000-000000000001.' || ext
      where id = 'e3562000-0000-4000-8000-000000000001';
    exception when check_violation then
      raise exception 'P3-56: a picture path with extension % in the product''s own folder was REFUSED', ext;
    end;
  end loop;
end
$$;

-- --- EVERY OTHER SHAPE IS REFUSED -------------------------------------------
do $$
declare
  bad text;
begin
  foreach bad in array array[
    -- another product's folder
    'product/e3562000-0000-4000-8000-000000000002/e3563000-0000-4000-8000-000000000001.png',
    -- the original file name instead of a uuid
    'product/e3562000-0000-4000-8000-000000000001/Poza mea.png',
    -- a type the card does not accept
    'product/e3562000-0000-4000-8000-000000000001/e3563000-0000-4000-8000-000000000001.gif',
    'product/e3562000-0000-4000-8000-000000000001/e3563000-0000-4000-8000-000000000001.pdf',
    -- outside product/
    'client/e3562000-0000-4000-8000-000000000001/e3563000-0000-4000-8000-000000000001.png',
    -- a folder climbed out of
    'product/e3562000-0000-4000-8000-000000000001/../e3563000-0000-4000-8000-000000000001.png',
    -- an empty string is not "no picture"
    ''
  ] loop
    begin
      update public.products set image_path = bad where id = 'e3562000-0000-4000-8000-000000000001';
      raise exception 'P3-56: the picture path "%" was ACCEPTED, and products_image_path_shape must refuse it', bad;
    exception when check_violation then
      null; -- expected
    end;
  end loop;
end
$$;


-- ===========================================================================
-- 3. WHO MAY DELETE A PICTURE FROM THE BUCKET
-- ===========================================================================
--
-- THE GRANT IS SUPABASE'S, NOT A LOOSENING, the same line and the same reason as
-- in assertions/0044_documents.sql. Supabase grants delete on storage.objects to
-- authenticated and leaves the refusing to the policies; the shim grants only
-- select, insert and update, so without this line every delete below is refused by
-- the missing privilege ("permission denied for table objects", run 35025464643)
-- and the policy is never consulted. The 0044 file's grant is rolled back with its
-- own transaction, so it does not carry into this one. This one is rolled back too.

grant delete on storage.objects to authenticated;

insert into storage.objects (id, bucket_id, name) values
  ('e3564000-0000-4000-8000-000000000001', 'rc-docs',
   'product/e3562000-0000-4000-8000-000000000001/e3563000-0000-4000-8000-000000000002.png'),
  ('e3564000-0000-4000-8000-000000000002', 'rc-docs',
   'inbound/e3565000-0000-4000-8000-000000000001/confirmare-furnizor.pdf');

-- An account manager, on both.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e3560000-0000-4000-8000-000000000002","role":"authenticated"}';

delete from storage.objects where id in (
  'e3564000-0000-4000-8000-000000000001',
  'e3564000-0000-4000-8000-000000000002');

reset role;

do $$
declare
  n integer;
begin
  select count(*) into n from storage.objects where id::text like 'e3564000-%';
  if n <> 2 then
    raise exception 'P3-56: an account manager deleted a stored object (% of 2 left)', n;
  end if;
end
$$;

-- The owner, on both.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e3560000-0000-4000-8000-000000000001","role":"authenticated"}';

delete from storage.objects where id in (
  'e3564000-0000-4000-8000-000000000001',
  'e3564000-0000-4000-8000-000000000002');

reset role;

do $$
declare
  n integer;
begin
  select count(*) into n from storage.objects where id = 'e3564000-0000-4000-8000-000000000001';
  if n <> 0 then
    raise exception 'P3-56: the owner could not delete a product picture under product/';
  end if;
  select count(*) into n from storage.objects where id = 'e3564000-0000-4000-8000-000000000002';
  if n <> 1 then
    raise exception 'P3-56: the owner deleted an inbound order document; rc_docs_delete must never reach inbound/';
  end if;
end
$$;

rollback;
