-- assertions/0054_extraction_derived_partial.sql
-- Card P3-80, Ivan's finding F6. What 0054 must have left behind.
--
-- THREE PROPERTIES:
--
--   1. the column exists, boolean, nullable, with no default
--   2. a partial draft with no error_code can actually BE WRITTEN carrying true,
--      and a draft carrying false, and both read back
--   3. a row written WITHOUT it stays NULL, which is what "our rule did not
--      run" means, and no default rewrote it into a claim
--
-- Everything runs inside a transaction that is rolled back.

begin;

do $$
declare n integer;
begin
  -- --- 1. THE COLUMN, BOOLEAN, NULLABLE, NO DEFAULT --------------------------
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'extraction_drafts'
    and column_name = 'platform_derived_partial'
    and data_type = 'boolean'
    and is_nullable = 'YES'
    and column_default is null;
  if n <> 1 then
    raise exception 'P3-80: expected 1 nullable boolean column with no default, found %', n;
  end if;
end $$;

-- --- 2. IT CAN BE WRITTEN ----------------------------------------------------
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes, status, error_code, platform_derived_partial)
values
  ('f6000000-0000-4000-8000-000000000001', 'p3-80/a.pdf', 'a.pdf', 'application/pdf', 1024,
   'partial', null, true),
  ('f6000000-0000-4000-8000-000000000002', 'p3-80/b.pdf', 'b.pdf', 'application/pdf', 1024,
   'extracted', null, false);

do $$
declare got text;
begin
  select string_agg(status::text || ':' || coalesce(platform_derived_partial::text, '<null>'), ',' order by order_id)
    into got
    from public.extraction_drafts
   where order_id in ('f6000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000002');
  if got is distinct from 'partial:true,extracted:false' then
    raise exception 'P3-80: the drafts came back as %', got;
  end if;
end $$;

-- --- 3. A ROW WRITTEN WITHOUT IT STAYS NULL ----------------------------------
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes, status)
values
  ('f6000000-0000-4000-8000-000000000003', 'p3-80/c.pdf', 'c.pdf', 'application/pdf', 1024, 'extracted');

do $$
declare got boolean;
begin
  select platform_derived_partial into got from public.extraction_drafts
   where order_id = 'f6000000-0000-4000-8000-000000000003';
  if got is not null then
    raise exception 'P3-80: a draft written without the column came back with %, expected NULL', got;
  end if;
end $$;

rollback;
