-- assertions/0052_extraction_line_math.sql
-- Card P3-75, Ivan's finding F7. What 0052 must have left behind.
--
-- FOUR PROPERTIES:
--
--   1. the three columns exist, nullable, with no default
--   2. a draft and a line can actually BE WRITTEN carrying them, and read back
--   3. the constraints bite: an unknown outcome, a negative difference and a
--      negative count are each refused
--   4. a row written WITHOUT them stays NULL, which is what "our check did not
--      run" means, and no default rewrote it into a claim
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
    and is_nullable = 'YES'
    and column_default is null
    and (
      (table_name = 'extraction_draft_lines' and column_name in ('platform_math_outcome', 'platform_math_diff'))
      or (table_name = 'extraction_drafts' and column_name = 'platform_line_math_failed')
    );
  if n <> 3 then
    raise exception 'P3-75: expected 3 nullable columns with no default, found %', n;
  end if;
end $$;

-- --- 2. THEY CAN BE WRITTEN --------------------------------------------------
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes, status, platform_line_math_failed)
values
  ('f7000000-0000-4000-8000-000000000001', 'p3-75/a.pdf', 'a.pdf', 'application/pdf', 1024,
   'extracted', 2);

insert into public.extraction_draft_lines
  (order_id, line_no, product_name, quantity, unit_price, line_total, platform_math_outcome, platform_math_diff)
values
  ('f7000000-0000-4000-8000-000000000001', 1, 'P3-75 a', 3, 10, 40, 'failed', 10),
  ('f7000000-0000-4000-8000-000000000001', 2, 'P3-75 b', 2, 25, 50, 'passed', 0),
  ('f7000000-0000-4000-8000-000000000001', 3, 'P3-75 c', 2, null, 50, 'not_run', null),
  ('f7000000-0000-4000-8000-000000000001', 4, 'P3-75 d', 1, 1, 1, null, null);

do $$
declare
  got_count integer;
  got text;
begin
  select platform_line_math_failed into got_count from public.extraction_drafts
   where order_id = 'f7000000-0000-4000-8000-000000000001';
  if got_count is distinct from 2 then
    raise exception 'P3-75: platform_line_math_failed came back %, expected 2', got_count;
  end if;

  select string_agg(coalesce(platform_math_outcome, '<null>') || ':' || coalesce(platform_math_diff::text, '<null>'), ',' order by line_no)
    into got
    from public.extraction_draft_lines
   where order_id = 'f7000000-0000-4000-8000-000000000001';
  if got is distinct from 'failed:10,passed:0,not_run:<null>,<null>:<null>' then
    raise exception 'P3-75: the lines came back as %', got;
  end if;

  -- --- 3. THE CONSTRAINTS BITE ---------------------------------------------
  begin
    insert into public.extraction_draft_lines (order_id, line_no, product_name, platform_math_outcome)
    values ('f7000000-0000-4000-8000-000000000001', 9, 'P3-75 bad', 'maybe');
    raise exception 'P3-75: an unknown platform_math_outcome was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.extraction_draft_lines (order_id, line_no, product_name, platform_math_diff)
    values ('f7000000-0000-4000-8000-000000000001', 9, 'P3-75 bad', -1);
    raise exception 'P3-75: a negative platform_math_diff was accepted';
  exception when check_violation then null;
  end;

  begin
    update public.extraction_drafts set platform_line_math_failed = -1
     where order_id = 'f7000000-0000-4000-8000-000000000001';
    raise exception 'P3-75: a negative platform_line_math_failed was accepted';
  exception when check_violation then null;
  end;
end $$;

-- --- 4. A ROW WRITTEN WITHOUT THEM STAYS NULL ---------------------------------
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes, status)
values
  ('f7000000-0000-4000-8000-000000000002', 'p3-75/b.pdf', 'b.pdf', 'application/pdf', 1024, 'extracted');

do $$
declare got integer;
begin
  select platform_line_math_failed into got from public.extraction_drafts
   where order_id = 'f7000000-0000-4000-8000-000000000002';
  if got is not null then
    raise exception 'P3-75: a draft written without the column came back with %, expected NULL', got;
  end if;
end $$;

rollback;
