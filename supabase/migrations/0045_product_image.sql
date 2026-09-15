-- 0045_product_image.sql
-- RC Inventory phase 3, card P3-56. One picture per product, kept in the rc-docs
-- bucket beside the documents of P3-15 and shown at the bottom of the product
-- panel.
--
-- WHAT IT CHANGES, AND IT REMOVES NOTHING
--
--   column      public.products.image_path          text, null: where the picture is stored
--   constraint  products_image_path_shape           the path sits in the product's own folder
--   policy      rc_docs_delete on storage.objects   owner only, now client/, project/ and product/
--   check       the rc-docs bucket row              already accepts JPEG, PNG and WEBP, asserted
--
-- NO DELETE, NO DROP AND NO TRUNCATE RUN IN THIS FILE, and no row is written:
-- every existing product keeps image_path null, which means "no picture".
--
-- ===========================================================================
-- THE THREE DECISIONS THIS FILE CARRIES
-- ===========================================================================
--
-- 1. THE BUCKET IS NOT REWRITTEN. The card asks that rc-docs accept image/jpeg,
--    image/png and image/webp. 0044 already set it to eight types, those three
--    among them, and 20 MB. Writing the same array again would be an UPDATE that
--    changes nothing and hides that it changes nothing, so section 3 ASSERTS the
--    three types instead and refuses to commit if one is missing.
--
-- 2. THE DELETE REACH IS WIDENED ON THE EXISTING POLICY, NOT ON A SECOND ONE.
--    Replacing a picture removes the old object, which needs an owner delete
--    under product/. rc_docs_delete from 0044 already is the owner-only delete
--    for rc-docs, narrowed to client/ and project/ on the owner's answer q013.
--    ALTER POLICY adds product/ to that same or clause, and the card allows
--    either shape. A second rc_docs_* policy would break the 0044 assertions,
--    which pin the exact set of four. inbound/ stays undeletable by every role,
--    owner included, as 0002 decided.
--
-- 3. THE PATH IS STRUCTURED AND TIED TO ITS OWN ROW, the same rule as
--    documents_storage_path_shape in 0044: product/<product_id>/<uuid>.<ext>,
--    with ext one of jpg, jpeg, png, webp. The original file name never reaches
--    storage, and a product cannot point at another product's picture.
--
-- ===========================================================================
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. The application code
-- that reads the new column ships in the same merge and asks first whether it
-- exists (hasProductImage in lib/data/schema-capability.ts), so in the minutes
-- between the code landing and this file landing the product form and panel
-- look exactly as they do today.
--
-- IT RUNS AS ONE TRANSACTION and is NOT safe to run twice: a second run fails on
-- ADD COLUMN and rolls the whole file back.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs
-- scripts/poc-free/local-db/assertions/0045_product_image.sql.

begin;


-- ===========================================================================
-- 1. THE COLUMN
-- ===========================================================================
--
-- NULLABLE AND WITHOUT A DEFAULT. Most products have no picture, and a default
-- would write a claim onto every product that predates this file.

alter table public.products add column image_path text null;

comment on column public.products.image_path is
  'Where the product picture is stored in the private rc-docs bucket: product/<product id>/<uuid>.<jpg|jpeg|png|webp>. Null means no picture. Read only through a short-lived signed link. Card P3-56.';

alter table public.products add constraint products_image_path_shape
  check (
    image_path is null
    or image_path ~ (
      '^product/' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
    )
  );


-- ===========================================================================
-- 2. WHO MAY DELETE IN rc-docs: THE OWNER, UNDER client/, project/ AND product/
-- ===========================================================================

alter policy rc_docs_delete on storage.objects
  using (
    bucket_id = 'rc-docs'
    and public.is_owner()
    and (name like 'client/%' or name like 'project/%' or name like 'product/%')
  );


-- ===========================================================================
-- 3. THE BUCKET ALREADY ACCEPTS THE PICTURES
-- ===========================================================================
--
-- A check, not a change. Supabase refuses a file outside the bucket's own types
-- before the application sees it, so a bucket without these three would make
-- every picture upload fail for a reason nobody could see.

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'rc-docs'
      and public = false
      and file_size_limit >= 10485760
      and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']::text[]
  ) then
    raise exception 'P3-56: the rc-docs bucket is missing, public, under 10 MB, or does not accept image/jpeg, image/png and image/webp';
  end if;
end
$$;

commit;


-- ===========================================================================
-- 4. VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect image_path as nullable text with no default, the
-- products_image_path_shape constraint, rc_docs_delete naming client/, project/
-- and product/, and rc-docs still private at 20971520 with its eight types.

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'products' and column_name = 'image_path';

select conname
from pg_constraint
where conrelid = 'public.products'::regclass and conname = 'products_image_path_shape';

select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname = 'rc_docs_delete';

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'rc-docs';
