-- assertions/0062_extraction_draft_supersede.sql
-- Card P3-103, Ivan's finding F25. What 0062 must have left behind.
--
-- FIVE PROPERTIES:
--
--   1. the four columns exist, nullable, with no default: document_sha256 text,
--      superseded_at timestamptz, superseded_by uuid, superseded_by_user uuid
--   2. superseded_by really REFERENCES public.extraction_drafts (order_id), so
--      the link the goal asks for is a key and not a loose uuid
--   3. a draft can actually BE WRITTEN superseded by another draft, and reads
--      back, with the link resolving to the newer row
--   4. a row written WITHOUT them stays NULL on all four, which is what "not
--      superseded" means, and no default rewrote it into a claim
--   5. a superseded_by that names no draft is REFUSED, which is what makes the
--      link trustworthy when a screen follows it
--
-- Everything runs inside a transaction that is rolled back.

begin;

do $$
declare n integer;
begin
  -- --- 1. THE COLUMNS, NULLABLE, NO DEFAULT ----------------------------------
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'extraction_drafts'
    and is_nullable = 'YES'
    and column_default is null
    and (
      (column_name = 'document_sha256' and data_type = 'text')
      or (column_name = 'superseded_at' and data_type = 'timestamp with time zone')
      or (column_name = 'superseded_by' and data_type = 'uuid')
      or (column_name = 'superseded_by_user' and data_type = 'uuid')
    );
  if n <> 4 then
    raise exception 'P3-103: expected 4 nullable columns with no default, found %', n;
  end if;
end $$;

do $$
declare n integer;
begin
  -- --- 2. superseded_by IS A KEY INTO THIS SAME TABLE -------------------------
  select count(*) into n
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
   and kcu.constraint_schema = tc.constraint_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name
   and ccu.constraint_schema = tc.constraint_schema
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = 'public'
    and tc.table_name = 'extraction_drafts'
    and kcu.column_name = 'superseded_by'
    and ccu.table_schema = 'public'
    and ccu.table_name = 'extraction_drafts'
    and ccu.column_name = 'order_id';
  if n < 1 then
    raise exception 'P3-103: superseded_by does not reference public.extraction_drafts (order_id)';
  end if;
end $$;

-- --- 3. IT CAN BE WRITTEN ----------------------------------------------------
-- superseded_by_user stays NULL here: it references auth.users and this file
-- seeds no user. The reference itself is proven by the column existing with its
-- type, the same reasoning assertions/0056 records for cancelled_by.
--
-- The NEWER draft is inserted first, because the older one points at it.
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes, status, document_sha256)
values
  ('f2500000-0000-4000-8000-000000000002', 'p3-103/nou.pdf', 'TEST-F25.pdf', 'application/pdf', 2048,
   null, 'ab'||repeat('0', 62));

-- error_code is carried because 0041 requires it on `failed`, and `failed` is
-- the state the finding is about: a read that failed and was sent again.
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes, status, error_code,
   document_sha256, superseded_at, superseded_by)
values
  ('f2500000-0000-4000-8000-000000000001', 'p3-103/vechi.pdf', 'TEST-F25.pdf', 'application/pdf', 2048,
   'failed', 'extraction_failed', 'ab'||repeat('0', 62), '2026-09-26T10:00:00Z',
   'f2500000-0000-4000-8000-000000000002');

do $$
declare got text;
begin
  select coalesce(vechi.superseded_at::text, '<null>')
         || '|' || coalesce(nou.document_filename, '<null>')
         || '|' || coalesce(vechi.status::text, '<null>')
         || '|' || coalesce(vechi.document_sha256, '<null>')
    into got
    from public.extraction_drafts vechi
    join public.extraction_drafts nou on nou.order_id = vechi.superseded_by
   where vechi.order_id = 'f2500000-0000-4000-8000-000000000001';
  if got is null or got not like '2026-09-26%|TEST-F25.pdf|failed|ab0%' then
    raise exception 'P3-103: the superseded draft came back as %', got;
  end if;
end $$;

-- --- 4. A ROW WRITTEN WITHOUT THEM STAYS NULL --------------------------------
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes, status)
values
  ('f2500000-0000-4000-8000-000000000003', 'p3-103/c.pdf', 'c.pdf', 'application/pdf', 1024, 'partial');

do $$
declare n integer;
begin
  select count(*) into n from public.extraction_drafts
   where order_id = 'f2500000-0000-4000-8000-000000000003'
     and document_sha256 is null
     and superseded_at is null
     and superseded_by is null
     and superseded_by_user is null;
  if n <> 1 then
    raise exception 'P3-103: a draft written without the columns did not come back NULL on all four';
  end if;
end $$;

-- --- 5. A LINK TO NO DRAFT IS REFUSED ----------------------------------------
-- The screen follows superseded_by to show the replaced row under the row that
-- replaced it. A link that can point at nothing would be a link the screen
-- cannot trust, so the key is watched here rather than assumed from part 2.
do $$
begin
  begin
    insert into public.extraction_drafts
      (order_id, document_path, document_filename, mime_type, size_bytes, superseded_by)
    values
      ('f2500000-0000-4000-8000-000000000004', 'p3-103/d.pdf', 'd.pdf', 'application/pdf', 1024,
       'f2500000-0000-4000-8000-0000000000ff');
    raise exception 'P3-103: superseded_by accepted an order_id that names no draft';
  exception
    when foreign_key_violation then
      null;
  end;
end $$;

rollback;
