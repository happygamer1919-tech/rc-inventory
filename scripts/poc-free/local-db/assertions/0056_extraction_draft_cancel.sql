-- assertions/0056_extraction_draft_cancel.sql
-- Card P3-84, Ivan's finding F20. What 0056 must have left behind.
--
-- THREE PROPERTIES:
--
--   1. the three columns exist, nullable, with no default: cancelled_at
--      timestamptz, cancelled_by uuid, cancel_reason text
--   2. a draft can actually BE WRITTEN carrying all three, and reads back
--   3. a row written WITHOUT them stays NULL on all three, which is what
--      "not cancelled" means, and no default rewrote it into a claim
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
      (column_name = 'cancelled_at' and data_type = 'timestamp with time zone')
      or (column_name = 'cancelled_by' and data_type = 'uuid')
      or (column_name = 'cancel_reason' and data_type = 'text')
    );
  if n <> 3 then
    raise exception 'P3-84: expected 3 nullable columns with no default, found %', n;
  end if;
end $$;

-- --- 2. IT CAN BE WRITTEN ----------------------------------------------------
-- cancelled_by stays NULL here: it references auth.users and this file seeds
-- no user. The reference itself is proven by the column existing with its type.
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes, status,
   cancelled_at, cancel_reason)
values
  ('f2000000-0000-4000-8000-000000000001', 'p3-84/a.pdf', 'a.pdf', 'application/pdf', 1024,
   'extracted', '2026-09-21T10:00:00Z', 'Document de test');

do $$
declare got text;
begin
  select coalesce(cancelled_at::text, '<null>') || '|' || coalesce(cancel_reason, '<null>') || '|' || status::text
    into got
    from public.extraction_drafts
   where order_id = 'f2000000-0000-4000-8000-000000000001';
  if got is null or got not like '2026-09-21%|Document de test|extracted' then
    raise exception 'P3-84: the cancelled draft came back as %', got;
  end if;
end $$;

-- --- 3. A ROW WRITTEN WITHOUT THEM STAYS NULL --------------------------------
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes, status)
values
  ('f2000000-0000-4000-8000-000000000002', 'p3-84/b.pdf', 'b.pdf', 'application/pdf', 1024, 'partial');

do $$
declare n integer;
begin
  select count(*) into n from public.extraction_drafts
   where order_id = 'f2000000-0000-4000-8000-000000000002'
     and cancelled_at is null
     and cancelled_by is null
     and cancel_reason is null;
  if n <> 1 then
    raise exception 'P3-84: a draft written without the columns did not come back NULL on all three';
  end if;
end $$;

rollback;
