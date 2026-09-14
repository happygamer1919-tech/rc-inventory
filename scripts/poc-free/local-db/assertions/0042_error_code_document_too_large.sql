-- assertions/0042_error_code_document_too_large.sql
-- Card EXT-28. What 0042 must have left behind.
--
-- THREE PROPERTIES, the same three 0034's file asserted for the eighth label:
--
--   1. the label exists on public.extraction_error_code
--   2. the WHOLE SET is exactly these nine, in this order. This file pins the
--      set because 0042 is now the newest migration that changed it, per the
--      docs/LEARNINGS.md entry "An old assertion that pins a whole enum set
--      fails the day a later migration appends a label". 0034's file was
--      narrowed in the same pull request to pin only its own label.
--   3. a draft row can actually BE WRITTEN carrying it, as `failed`, and the
--      0041 constraint still refuses it on `extracted`
--
-- Everything runs inside a transaction that is rolled back.

begin;

do $$
declare
  n        integer;
  ordered  text;
begin
  -- --- 1. THE LABEL EXISTS ---------------------------------------------------
  select count(*) into n
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'extraction_error_code' and e.enumlabel = 'document_too_large';
  if n <> 1 then
    raise exception 'EXT-28: document_too_large is not a label on extraction_error_code (found %)', n;
  end if;

  -- --- 2. THE WHOLE SET, IN ORDER --------------------------------------------
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into ordered
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'extraction_error_code';
  if ordered is distinct from
     'download_failed,url_expired,unsupported_format,unreadable_document,extraction_failed,invalid_output,timeout,reconciliation_failed,document_too_large' then
    raise exception 'EXT-28: extraction_error_code is %, expected the eight labels of 0008 and 0034 followed by document_too_large', ordered;
  end if;
end $$;

-- --- 3. IT CAN ACTUALLY BE WRITTEN -------------------------------------------
-- Separate statement, outside the DO block, so the value travels through the
-- real column type and the real constraint that 0041 left.
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes, status, error_code, reason)
values
  ('e2800000-0000-4000-8000-000000000001', 'ext-28/a.pdf', 'a.pdf', 'application/pdf', 1024,
   'failed', 'document_too_large', 'Documentul are 120 de pagini.');

do $$
declare got text;
begin
  select error_code::text into got from public.extraction_drafts
   where order_id = 'e2800000-0000-4000-8000-000000000001';
  if got is distinct from 'document_too_large' then
    raise exception 'EXT-28: the row came back with error_code %, expected document_too_large', got;
  end if;

  -- AND THE CONSTRAINT STILL BITES: extracted with a code is still forbidden.
  begin
    insert into public.extraction_drafts
      (order_id, document_path, document_filename, mime_type, size_bytes, status, error_code)
    values
      ('e2800000-0000-4000-8000-000000000002', 'ext-28/b.pdf', 'b.pdf', 'application/pdf', 1024,
       'extracted', 'document_too_large');
    raise exception 'EXT-28: extracted + document_too_large was accepted. The 0041 constraint must still refuse it';
  exception
    when check_violation then null;
  end;
end $$;

rollback;
