-- assertions/0053_extraction_inbound_fields.sql
-- Card EXT-34, Ivan's finding F4. What 0053 must have left behind.
--
-- FOUR PROPERTIES:
--
--   1. the five columns exist, text, nullable, with no default
--   2. a draft and its lines can actually BE WRITTEN carrying them, and read back
--   3. no constraint judges them: a line_total_source outside printed and
--      derived is stored, because the card stores the field as sent
--   4. a row written WITHOUT them stays NULL, and no default rewrote it
--
-- Everything runs inside a transaction that is rolled back.

begin;

do $$
declare n integer;
begin
  -- --- 1. THE COLUMNS, TEXT, NULLABLE, NO DEFAULT -----------------------------
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public'
    and data_type = 'text'
    and is_nullable = 'YES'
    and column_default is null
    and (
      (table_name = 'extraction_drafts' and column_name in ('document_type', 'client_ref'))
      or (table_name = 'extraction_draft_lines' and column_name in ('supplier_code', 'description', 'line_total_source'))
    );
  if n <> 5 then
    raise exception 'EXT-34: expected 5 nullable text columns with no default, found %', n;
  end if;
end $$;

-- --- 2. THEY CAN BE WRITTEN --------------------------------------------------
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes, status, document_type, client_ref)
values
  ('e3400000-0000-4000-8000-000000000001', 'ext-34/a.pdf', 'a.pdf', 'application/pdf', 1024,
   'extracted', 'invoice', 'RC-2026-0042');

insert into public.extraction_draft_lines
  (order_id, line_no, product_name, supplier_code, description, line_total_source)
values
  ('e3400000-0000-4000-8000-000000000001', 1, 'EXT-34 a', 'BK-C045', 'Tigla metalica', 'printed'),
  ('e3400000-0000-4000-8000-000000000001', 2, 'EXT-34 b', 'SA-4835', 'Surub autoforant', 'derived'),
  -- 3. NO CONSTRAINT: a value outside the two is stored, not refused.
  ('e3400000-0000-4000-8000-000000000001', 3, 'EXT-34 c', null, null, 'estimated'),
  ('e3400000-0000-4000-8000-000000000001', 4, 'EXT-34 d', null, null, null);

do $$
declare got text;
begin
  select document_type || '|' || client_ref into got from public.extraction_drafts
   where order_id = 'e3400000-0000-4000-8000-000000000001';
  if got is distinct from 'invoice|RC-2026-0042' then
    raise exception 'EXT-34: the draft came back as %', got;
  end if;

  select string_agg(
           coalesce(supplier_code, '<null>') || ':' || coalesce(description, '<null>') || ':' || coalesce(line_total_source, '<null>'),
           ',' order by line_no)
    into got
    from public.extraction_draft_lines
   where order_id = 'e3400000-0000-4000-8000-000000000001';
  if got is distinct from
     'BK-C045:Tigla metalica:printed,SA-4835:Surub autoforant:derived,<null>:<null>:estimated,<null>:<null>:<null>' then
    raise exception 'EXT-34: the lines came back as %', got;
  end if;
end $$;

-- --- 4. A ROW WRITTEN WITHOUT THEM STAYS NULL ---------------------------------
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes, status)
values
  ('e3400000-0000-4000-8000-000000000002', 'ext-34/b.pdf', 'b.pdf', 'application/pdf', 1024, 'extracted');

insert into public.extraction_draft_lines (order_id, line_no, product_name)
values ('e3400000-0000-4000-8000-000000000002', 1, 'EXT-34 e');

do $$
declare n integer;
begin
  select count(*) into n from public.extraction_drafts
   where order_id = 'e3400000-0000-4000-8000-000000000002'
     and document_type is null and client_ref is null;
  if n <> 1 then
    raise exception 'EXT-34: a draft written without the columns did not come back NULL';
  end if;

  select count(*) into n from public.extraction_draft_lines
   where order_id = 'e3400000-0000-4000-8000-000000000002'
     and supplier_code is null and description is null and line_total_source is null;
  if n <> 1 then
    raise exception 'EXT-34: a line written without the columns did not come back NULL';
  end if;
end $$;

rollback;
