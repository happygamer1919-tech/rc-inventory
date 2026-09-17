-- assertions/0042_error_code_document_too_large.sql
-- Card EXT-28. What 0042 must have left behind.
--
-- THREE PROPERTIES, the same three 0034's file asserted for the eighth label:
--
--   1. the label exists on public.extraction_error_code
--   2. the eight codes that were there before are ALL still there, and
--      document_too_large is the NINTH
--   3. a draft row can actually BE WRITTEN carrying it, as `failed`, and the
--      0041 constraint still refuses it on `extracted`
--
-- Everything runs inside a transaction that is rolled back.

begin;

do $$
declare
  n        integer;
  missing  text;
begin
  -- --- 1. THE LABEL EXISTS ---------------------------------------------------
  select count(*) into n
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'extraction_error_code' and e.enumlabel = 'document_too_large';
  if n <> 1 then
    raise exception 'EXT-28: document_too_large is not a label on extraction_error_code (found %)', n;
  end if;

  -- --- 2. NOTHING WAS LOST, AND THIS ONE IS THE NINTH -------------------------
  select string_agg(x, ', ' order by x) into missing
  from unnest(array[
    'download_failed','url_expired','unsupported_format','unreadable_document',
    'extraction_failed','invalid_output','timeout','reconciliation_failed'
  ]) as x
  where not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'extraction_error_code' and e.enumlabel = x
  );
  if missing is not null then
    raise exception 'EXT-28: the enum LOST pre-existing labels: %. An addition must add, never replace', missing;
  end if;

  -- THE WHOLE SET IS NO LONGER PINNED HERE, AND THAT IS docs/LEARNINGS.md's RULE.
  -- This block read, until card P3-71 added 0051:
  --
  --   select string_agg(e.enumlabel, ',' order by e.enumsortorder) into ordered
  --   from pg_enum e join pg_type t on t.oid = e.enumtypid
  --   where t.typname = 'extraction_error_code';
  --   if ordered is distinct from
  --      'download_failed,url_expired,unsupported_format,unreadable_document,extraction_failed,invalid_output,timeout,reconciliation_failed,document_too_large' then
  --     raise exception 'EXT-28: extraction_error_code is %, expected the eight labels of 0008 and 0034 followed by document_too_large', ordered;
  --   end if;
  --
  -- apply.mjs runs every assertion file against the FINISHED schema, so that
  -- comparison was true only until the next label arrived, and 0051 appended
  -- config_error. An assertion pins what its own migration did; the whole set is
  -- pinned by the assertion of the NEWEST migration that changed it, which is now
  -- assertions/0051_error_code_config_error.sql. This is the same narrowing 0042
  -- performed on 0034's file, for the same reason, one label later.
  -- What stays here is 0042's own fact: document_too_large is the NINTH label.
  select count(*) into n
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'extraction_error_code'
    and e.enumlabel = 'document_too_large'
    and e.enumsortorder > (
      select e3.enumsortorder from pg_enum e3
      where e3.enumtypid = e.enumtypid and e3.enumlabel = 'reconciliation_failed'
    );
  if n <> 1 then
    raise exception 'EXT-28: document_too_large does not sort after reconciliation_failed, so it is not the ninth label';
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
