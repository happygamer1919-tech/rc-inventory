-- assertions/0051_error_code_config_error.sql
-- Card P3-71, Ivan's finding F3. What 0051 must have left behind.
--
-- THREE PROPERTIES, the same three 0034's and 0042's files asserted for the
-- eighth and ninth labels:
--
--   1. the label exists on public.extraction_error_code
--   2. the WHOLE SET is exactly these ten, in this order. This file pins the set
--      because 0051 is now the newest migration that changed it, per the
--      docs/LEARNINGS.md entry "An old assertion that pins a whole enum set
--      fails the day a later migration appends a label". 0042's file is narrowed
--      in the same pull request to pin only its own label, exactly as 0042
--      narrowed 0034's.
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
  where t.typname = 'extraction_error_code' and e.enumlabel = 'config_error';
  if n <> 1 then
    raise exception 'P3-71: config_error is not a label on extraction_error_code (found %)', n;
  end if;

  -- --- 2. THE WHOLE SET, IN ORDER --------------------------------------------
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into ordered
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'extraction_error_code';
  if ordered is distinct from
     'download_failed,url_expired,unsupported_format,unreadable_document,extraction_failed,invalid_output,timeout,reconciliation_failed,document_too_large,config_error' then
    raise exception 'P3-71: extraction_error_code is %, expected the nine labels of 0008, 0034 and 0042 followed by config_error', ordered;
  end if;
end $$;

-- --- 3. IT CAN ACTUALLY BE WRITTEN -------------------------------------------
-- Separate statement, outside the DO block, so the value travels through the
-- real column type and the real constraint that 0041 left.
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes, status, error_code, reason)
values
  ('f3000000-0000-4000-8000-000000000001', 'p3-71/a.pdf', 'a.pdf', 'application/pdf', 1024,
   'failed', 'config_error', 'Variabila de mediu MAKE_WEBHOOK_URL lipseste.');

do $$
declare got text;
begin
  select error_code::text into got from public.extraction_drafts
   where order_id = 'f3000000-0000-4000-8000-000000000001';
  if got is distinct from 'config_error' then
    raise exception 'P3-71: the row came back with error_code %, expected config_error', got;
  end if;

  -- AND THE CONSTRAINT STILL BITES: extracted with a code is still forbidden.
  begin
    insert into public.extraction_drafts
      (order_id, document_path, document_filename, mime_type, size_bytes, status, error_code)
    values
      ('f3000000-0000-4000-8000-000000000002', 'p3-71/b.pdf', 'b.pdf', 'application/pdf', 1024,
       'extracted', 'config_error');
    raise exception 'P3-71: extracted + config_error was accepted. The 0041 constraint must still refuse it';
  exception
    when check_violation then null;
  end;
end $$;

rollback;
