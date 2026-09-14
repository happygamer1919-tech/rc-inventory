-- assertions/0043_extraction_upload_page_count.sql
-- Card EXT-28. What 0043 must have left behind.
--
-- THE CARD NAMES TWO FACTS AND BOTH ARE HERE: our count has a column of its OWN,
-- and writing it does not touch `page_count`, the model's report. The rest pins
-- the column's shape: integer, nullable, no default, and zero refused.
--
-- The four NOT NULL columns of 0008 are supplied in full on every insert, as in
-- the 0041 file: an insert that omits one fails for a reason that has nothing to
-- do with this card, and a refusal assertion would then pass for the wrong reason.
--
-- Everything runs inside a transaction that is rolled back.

begin;

do $$
declare
  n        integer;
  dtype    text;
  nullable text;
  dflt     text;
  ours     integer;
  model    integer;
begin
  -- --- 1. THE COLUMN: integer, nullable, no default -------------------------
  select data_type, is_nullable, column_default into dtype, nullable, dflt
  from information_schema.columns
  where table_schema = 'public' and table_name = 'extraction_drafts'
    and column_name = 'upload_page_count';
  if dtype is distinct from 'integer' then
    raise exception 'EXT-28: extraction_drafts.upload_page_count is %, expected integer', coalesce(dtype, 'absent');
  end if;
  if nullable <> 'YES' then
    raise exception 'EXT-28: upload_page_count must be nullable: null means we could not count';
  end if;
  if dflt is not null then
    raise exception 'EXT-28: upload_page_count carries default %, and a default writes a count nobody took', dflt;
  end if;

  -- --- 2. OURS IS WRITTEN AND THE MODEL'S IS UNTOUCHED ----------------------
  insert into public.extraction_drafts (order_id, document_path, document_filename,
                                        mime_type, size_bytes, upload_page_count)
  values ('e2800000-0000-4000-8000-000000000101', 'ext-28/ours.pdf', 'ours.pdf',
          'application/pdf', 1024, 4);
  select upload_page_count, page_count into ours, model
  from public.extraction_drafts where order_id = 'e2800000-0000-4000-8000-000000000101';
  if ours is distinct from 4 then
    raise exception 'EXT-28: upload_page_count came back %, expected 4', ours;
  end if;
  if model is not null then
    raise exception 'EXT-28: writing our count wrote page_count %, and that column is the model''s', model;
  end if;

  -- --- 3. NULL IS LEGAL ------------------------------------------------------
  insert into public.extraction_drafts (order_id, document_path, document_filename,
                                        mime_type, size_bytes, upload_page_count)
  values ('e2800000-0000-4000-8000-000000000102', 'ext-28/null.pdf', 'null.pdf',
          'application/pdf', 1024, null);

  -- --- 4. ZERO AND NEGATIVE ARE REFUSED --------------------------------------
  foreach n in array array[0, -1] loop
    begin
      insert into public.extraction_drafts (order_id, document_path, document_filename,
                                            mime_type, size_bytes, upload_page_count)
      values (('e2800000-0000-4000-8000-00000000011' || (n + 5)::text)::uuid, 'ext-28/zero.pdf',
              'zero.pdf', 'application/pdf', 1024, n);
      raise exception 'EXT-28: upload_page_count % was accepted; a document has at least one page', n;
    exception
      when check_violation then null;
    end;
  end loop;

  -- --- 5. THE CONSTRAINT IS THE NAMED ONE ------------------------------------
  select count(*) into n
  from pg_constraint
  where conrelid = 'public.extraction_drafts'::regclass
    and conname = 'extraction_drafts_upload_page_count_positive'
    and contype = 'c';
  if n <> 1 then
    raise exception 'EXT-28: extraction_drafts_upload_page_count_positive is missing (found %)', n;
  end if;
end $$;

rollback;
