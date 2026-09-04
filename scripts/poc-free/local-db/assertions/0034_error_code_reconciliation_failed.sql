-- assertions/0034_error_code_reconciliation_failed.sql
-- Card EXT-16. What 0034 must have left behind.
--
-- THREE PROPERTIES, AND THE THIRD IS THE ONE A FUTURE READER WILL DOUBT.
--
--   1. the label exists on public.extraction_error_code
--   2. the seven codes that were there before are ALL still there
--   3. a draft row can actually BE WRITTEN carrying it, together with the
--      status the contract pairs it with
--
-- Property 2 is asserted because an enum is the one schema object where "added a
-- value" and "replaced the set" look identical from a single-label check, and a
-- lost label would silently turn every historical row of that kind unreadable.
--
-- Property 3 is asserted BY WRITING, not by reading pg_enum. A label that exists
-- but violates the error_code/status constraint from 0008 is a label the
-- application cannot use, and the difference only shows up on the write.

begin;

do $$
declare
  n        integer;
  missing  text;
begin
  -- --- 1. THE LABEL EXISTS ---------------------------------------------------
  select count(*) into n
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'extraction_error_code' and e.enumlabel = 'reconciliation_failed';
  if n <> 1 then
    raise exception 'EXT-16: reconciliation_failed is not a label on extraction_error_code (found %)', n;
  end if;

  -- --- 2. NOTHING WAS LOST ---------------------------------------------------
  select string_agg(x, ', ' order by x) into missing
  from unnest(array[
    'download_failed','url_expired','unsupported_format','unreadable_document',
    'extraction_failed','invalid_output','timeout'
  ]) as x
  where not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'extraction_error_code' and e.enumlabel = x
  );
  if missing is not null then
    raise exception 'EXT-16: the enum LOST pre-existing labels: %. An addition must add, never replace', missing;
  end if;

  select count(*) into n
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'extraction_error_code';
  if n <> 8 then
    raise exception 'EXT-16: extraction_error_code holds % labels, expected exactly 8', n;
  end if;
end $$;

-- --- 3. IT CAN ACTUALLY BE WRITTEN -------------------------------------------
-- Separate statement, outside the DO block, because the value has to travel
-- through the real column type and the real CHECK constraint that 0008 wrote:
-- error_code is non-null exactly when status is failed or partial.
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes, status, error_code)
values
  ('e1600000-0000-4000-8000-000000000001', 'ext-16/a.pdf', 'a.pdf', 'application/pdf', 1024,
   'failed', 'reconciliation_failed');

do $$
declare got text;
begin
  select error_code::text into got from public.extraction_drafts
   where order_id = 'e1600000-0000-4000-8000-000000000001';
  if got is distinct from 'reconciliation_failed' then
    raise exception 'EXT-16: the row came back with error_code %, expected reconciliation_failed', got;
  end if;

  -- AND THE CONSTRAINT STILL BITES. The new label must not have widened what the
  -- table accepts: extracted with a non-null error_code is still forbidden.
  begin
    insert into public.extraction_drafts
      (order_id, document_path, document_filename, mime_type, size_bytes, status, error_code)
    values
      ('e1600000-0000-4000-8000-000000000002', 'ext-16/b.pdf', 'b.pdf', 'application/pdf', 1024,
       'extracted', 'reconciliation_failed');
    raise exception 'EXT-16: extracted + reconciliation_failed was accepted. The 0008 constraint must still refuse it';
  exception
    when check_violation then null;
  end;
end $$;

rollback;
