-- assertions/0033_extraction_draft_page_count.sql
-- Card EXT-09. What 0033 must have left behind, checked against the finished
-- schema on a bare postgres:16.
--
-- FOUR PROPERTIES, AND THE THIRD IS THE ONE THAT MATTERS MOST.
--
--   1. the column exists, is integer, and is NULLABLE
--   2. it has NO DEFAULT
--   3. the check constraint REFUSES zero and negative and ACCEPTS null
--   4. the meta column comment no longer promises characters_extracted
--
-- Property 2 is asserted because a default is the exact failure this column
-- exists to catch, installed by the column itself: a default of 1 would make
-- every row that reported nothing indistinguishable from a row whose model said
-- one page. Asserting a negative is the only way a defect nobody wrote can be
-- caught, and "there is no default" is a negative.
--
-- Property 3 is asserted BY TRYING THE WRITES, not by reading the constraint
-- definition as text. A constraint that exists and does not fire is a constraint
-- that is not there, and the string form of a check expression is exactly the
-- kind of thing that reads correct while behaving otherwise.

begin;

-- A parent row, because every assertion below writes to extraction_drafts and
-- the table's own NOT NULL columns have to be satisfied first. Every column that
-- is structurally required by 0008 is given a value; everything the contract
-- calls nullable is left null on purpose, which also proves the new column does
-- not quietly become required.
insert into public.extraction_drafts
  (order_id, document_path, document_filename, mime_type, size_bytes)
values
  ('e0900000-0000-4000-8000-000000000001', 'ext-09/a.pdf', 'a.pdf', 'application/pdf', 1024);

do $$
declare
  n           integer;
  got_type    text;
  got_null    text;
  got_default text;
  got_comment text;
begin
  -- --- 1. INTEGER AND NULLABLE ---------------------------------------------
  select data_type, is_nullable, column_default
    into got_type, got_null, got_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'extraction_drafts'
    and column_name  = 'page_count';

  if got_type is null then
    raise exception 'EXT-09: extraction_drafts.page_count does not exist';
  end if;
  if got_type <> 'integer' then
    raise exception 'EXT-09: page_count is %, expected integer', got_type;
  end if;
  if got_null <> 'YES' then
    raise exception 'EXT-09: page_count is NOT NULL. A missing page count is not an error and must be storable as null';
  end if;

  -- --- 2. NO DEFAULT --------------------------------------------------------
  if got_default is not null then
    raise exception 'EXT-09: page_count carries a default (%). A default writes a page count nobody reported and is indistinguishable afterwards from one that was', got_default;
  end if;

  -- The row inserted above named no page count. It must have landed as null and
  -- not as any number, which is the same property observed from the data side.
  select page_count into n from public.extraction_drafts
   where order_id = 'e0900000-0000-4000-8000-000000000001';
  if n is not null then
    raise exception 'EXT-09: a row inserted without a page count came back with %, expected null', n;
  end if;

  -- --- 3. THE CONSTRAINT FIRES, PROVEN BY WRITING ---------------------------
  -- Null is accepted. Already shown by the insert above, restated as an update
  -- so the accept and the two refusals read as one set.
  update public.extraction_drafts set page_count = null
   where order_id = 'e0900000-0000-4000-8000-000000000001';

  -- One page is a real document and must be accepted.
  update public.extraction_drafts set page_count = 1
   where order_id = 'e0900000-0000-4000-8000-000000000001';

  -- A large count is accepted too: there is no upper bound and inventing one
  -- would reject a real catalogue.
  update public.extraction_drafts set page_count = 4096
   where order_id = 'e0900000-0000-4000-8000-000000000001';

  -- ZERO IS REFUSED. A document has at least one page, so zero is a broken
  -- report rather than a smaller reading, and it must not be storable as though
  -- it were one.
  begin
    update public.extraction_drafts set page_count = 0
     where order_id = 'e0900000-0000-4000-8000-000000000001';
    raise exception 'EXT-09: page_count = 0 was accepted. Zero is a broken report and the constraint must refuse it';
  exception
    when check_violation then null;
  end;

  -- NEGATIVE IS REFUSED, for the same reason and separately, because a
  -- constraint written as `<> 0` would pass the case above and fail this one.
  begin
    update public.extraction_drafts set page_count = -3
     where order_id = 'e0900000-0000-4000-8000-000000000001';
    raise exception 'EXT-09: page_count = -3 was accepted, so the constraint tests the wrong thing';
  exception
    when check_violation then null;
  end;

  -- --- 4. THE CONTRACT COMMENT NO LONGER PROMISES A CHARACTER COUNT ---------
  -- 0008 wrote characters_extracted into the meta column comment. The field is
  -- out of the contract as of this card, and a comment that still names it sends
  -- the next reader looking for a value that is never sent.
  select col_description('public.extraction_drafts'::regclass, a.attnum)
    into got_comment
  from pg_attribute a
  where a.attrelid = 'public.extraction_drafts'::regclass
    and a.attname  = 'meta';

  if got_comment is null then
    raise exception 'EXT-09: the meta column lost its comment entirely';
  end if;
  if position('characters_extracted' in got_comment) = 0 then
    raise exception 'EXT-09: the meta comment does not mention characters_extracted at all. It must still say the field was REMOVED and is tolerated, so a reader meeting one in a payload knows it is expected to be ignored';
  end if;
  if got_comment not like '%removed from the contract%' then
    raise exception 'EXT-09: the meta comment names characters_extracted without saying it was removed from the contract';
  end if;
end $$;

rollback;
