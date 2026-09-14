-- assertions/0041_extraction_partial_error_code_optional.sql
-- Card P3-29a. error_code is required on failed only.
--
-- THE CARD NAMES TWO FACTS AND BOTH ARE HERE: a partial row with a null
-- error_code and a non-null reason INSERTS, and a failed row with a null
-- error_code still REFUSES. The rest pins what did NOT move, because a widening
-- that also quietly widened `failed` or `extracted` would pass the first two.
--
-- THE FOUR NOT NULL COLUMNS OF 0008 ARE SUPPLIED IN FULL, as in the 0037 file:
-- an insert that omits one fails for a reason that has nothing to do with this
-- card, and a refusal assertion would then pass for the wrong reason.

do $$
declare
  n integer;
begin
  -- --- 1. the constraint exists, once, under its 0008 name ------------------
  select count(*) into n
  from pg_constraint
  where conrelid = 'public.extraction_drafts'::regclass
    and conname = 'extraction_drafts_error_code_matches_status'
    and contype = 'c';
  if n <> 1 then
    raise exception 'P3-29a: extraction_drafts_error_code_matches_status is missing or not a check constraint (found %)', n;
  end if;

  -- --- 2. A PARTIAL WITH A NULL error_code AND A REASON INSERTS --------------
  --
  -- This is the card. Andre's success-shaped partial: read, did not reconcile,
  -- the delta described in reason, and no code invented for it.
  insert into public.extraction_drafts (order_id, document_path, document_filename,
                                        mime_type, size_bytes, status, error_code, reason)
  values ('00000000-0000-4000-8000-000000290001', 'assert/p3-29a-partial.pdf',
          'p3-29a-partial.pdf', 'application/pdf', 1024, 'partial', null,
          'TVA calculat pe linii este 3690,47 lei, iar TVA tiparit pe document este 3690,00 lei.');

  select count(*) into n
  from public.extraction_drafts
  where order_id = '00000000-0000-4000-8000-000000290001'
    and status = 'partial'
    and error_code is null
    and reason is not null;
  if n <> 1 then
    raise exception 'P3-29a: a partial row with a null error_code and a reason was not stored as written';
  end if;

  -- --- 3. A FAILED ROW WITH A NULL error_code STILL REFUSES ------------------
  begin
    insert into public.extraction_drafts (order_id, document_path, document_filename,
                                          mime_type, size_bytes, status, error_code, reason)
    values ('00000000-0000-4000-8000-000000290002', 'assert/p3-29a-failed.pdf',
            'p3-29a-failed.pdf', 'application/pdf', 1024, 'failed', null,
            'Nu s-a putut citi.');
    raise exception 'P3-29a: a failed row with a null error_code was accepted, so failed lost its mandatory code';
  exception
    when check_violation then
      null;  -- expected
  end;

  -- --- 4. AND THE SAME REFUSAL ON AN UPDATE ----------------------------------
  --
  -- The callback route writes by UPDATE, never by INSERT: the draft row exists
  -- from the fire. The partial row from step 2 turned into a failed one with no
  -- code is exactly what a wrong route would write.
  begin
    update public.extraction_drafts
       set status = 'failed'
     where order_id = '00000000-0000-4000-8000-000000290001';
    raise exception 'P3-29a: updating a code-less partial to failed was accepted';
  exception
    when check_violation then
      null;  -- expected
  end;

  -- --- 5. extracted STILL FORBIDS A CODE -------------------------------------
  begin
    insert into public.extraction_drafts (order_id, document_path, document_filename,
                                          mime_type, size_bytes, status, error_code)
    values ('00000000-0000-4000-8000-000000290003', 'assert/p3-29a-extracted.pdf',
            'p3-29a-extracted.pdf', 'application/pdf', 1024, 'extracted',
            'unreadable_document');
    raise exception 'P3-29a: an extracted row carrying an error_code was accepted';
  exception
    when check_violation then
      null;  -- expected
  end;

  -- --- 6. THE SHAPES THAT WERE LEGAL BEFORE ARE STILL LEGAL ------------------
  --
  -- A partial WITH a code (extraction.spec cases 6 and 27, and the 0037
  -- assertions), a failed with its code, an extracted with none, and a row
  -- fired and not yet answered. A widening that refused any of these would 500
  -- on payloads the route accepts today.
  insert into public.extraction_drafts (order_id, document_path, document_filename,
                                        mime_type, size_bytes, status, error_code)
  values
    ('00000000-0000-4000-8000-000000290004', 'assert/p3-29a-partial-code.pdf',
     'p3-29a-partial-code.pdf', 'application/pdf', 1024, 'partial', 'unreadable_document'),
    ('00000000-0000-4000-8000-000000290005', 'assert/p3-29a-failed-code.pdf',
     'p3-29a-failed-code.pdf', 'application/pdf', 1024, 'failed', 'timeout'),
    ('00000000-0000-4000-8000-000000290006', 'assert/p3-29a-extracted.pdf',
     'p3-29a-extracted.pdf', 'application/pdf', 1024, 'extracted', null),
    ('00000000-0000-4000-8000-000000290007', 'assert/p3-29a-fired.pdf',
     'p3-29a-fired.pdf', 'application/pdf', 1024, null, null);

  select count(*) into n
  from public.extraction_drafts
  where order_id in ('00000000-0000-4000-8000-000000290004',
                     '00000000-0000-4000-8000-000000290005',
                     '00000000-0000-4000-8000-000000290006',
                     '00000000-0000-4000-8000-000000290007');
  if n <> 4 then
    raise exception 'P3-29a: one of the four shapes legal before 0041 was not stored (found % of 4)', n;
  end if;

  raise notice 'P3-29a: a code-less partial with a reason inserts, failed without a code refuses on insert and on update, extracted with a code refuses, and the four earlier shapes still insert';
end $$;
