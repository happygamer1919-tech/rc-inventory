-- assertions/0032_extraction_document_source.sql
-- Card EXT-15. The document_source column, asserted against the finished schema.
--
-- THE CONSTRAINT IS THE POINT, NOT THE COLUMN. A nullable text column that
-- accepts anything would let a typo become a third source value that no branch
-- in the application handles, and the branch it falls through to is the
-- permissive one. So both values are asserted to be ACCEPTED and a third is
-- asserted to be REFUSED, by inserting and rolling back.

do $$
declare
  n   integer;
  txt text;
begin
  -- --- the column exists and is NULLABLE -------------------------------------
  -- Nullable is deliberate: rows that predate this migration are genuinely
  -- unknown, and a NOT NULL default of 'scan' would have rewritten them into a
  -- claim nobody made.
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'extraction_drafts'
    and column_name = 'document_source';
  if n <> 1 then
    raise exception 'extraction_drafts.document_source is missing';
  end if;

  select is_nullable into txt
  from information_schema.columns
  where table_schema = 'public' and table_name = 'extraction_drafts'
    and column_name = 'document_source';
  if txt <> 'YES' then
    raise exception 'document_source is NOT NULL, expected nullable';
  end if;

  -- --- there is no column default, for the same reason -----------------------
  select coalesce(column_default, '(none)') into txt
  from information_schema.columns
  where table_schema = 'public' and table_name = 'extraction_drafts'
    and column_name = 'document_source';
  if txt <> '(none)' then
    raise exception 'document_source carries a column default (%), which would rewrite rows that predate it', txt;
  end if;

  -- --- the constraint exists -------------------------------------------------
  select count(*) into n
  from pg_constraint
  where conrelid = 'public.extraction_drafts'::regclass
    and conname = 'extraction_drafts_document_source_known';
  if n <> 1 then
    raise exception 'the document_source check constraint is missing';
  end if;
end $$;

-- --- both values are accepted, and a third is refused ------------------------
--
-- Written as three separate DO blocks with savepoints rather than one, because a
-- constraint violation aborts the surrounding block: testing the refusal inside
-- the same block as the acceptances would abort before reaching them.
do $$
declare
  v_order uuid := '00000000-0000-4000-8000-0000000e15a1'::uuid;
begin
  insert into public.extraction_drafts (order_id, document_path, document_filename, mime_type, size_bytes, document_source)
  values (v_order, 'p', 'f.pdf', 'application/pdf', 1, 'scan');
  insert into public.extraction_drafts (order_id, document_path, document_filename, mime_type, size_bytes, document_source)
  values ('00000000-0000-4000-8000-0000000e15b2'::uuid, 'p', 'f.pdf', 'application/pdf', 1, 'digital');
  insert into public.extraction_drafts (order_id, document_path, document_filename, mime_type, size_bytes, document_source)
  values ('00000000-0000-4000-8000-0000000e15c3'::uuid, 'p', 'f.pdf', 'application/pdf', 1, null);
exception when others then
  raise exception 'a legal document_source was REFUSED: %', sqlerrm;
end $$;

do $$
begin
  begin
    insert into public.extraction_drafts (order_id, document_path, document_filename, mime_type, size_bytes, document_source)
    values ('00000000-0000-4000-8000-0000000e15d4'::uuid, 'p', 'f.pdf', 'application/pdf', 1, 'photo');
    raise exception 'a document_source of ''photo'' was ACCEPTED, so the constraint is not enforcing';
  exception when check_violation then
    null; -- expected
  end;
end $$;

-- The three legal rows are removed so this file leaves nothing behind. It runs
-- against a shim, never against a real database, but a fixture that survives its
-- own assertion is a fixture somebody will later mistake for data.
delete from public.extraction_drafts
where order_id in (
  '00000000-0000-4000-8000-0000000e15a1'::uuid,
  '00000000-0000-4000-8000-0000000e15b2'::uuid,
  '00000000-0000-4000-8000-0000000e15c3'::uuid
);
