-- assertions/0037_extraction_platform_verdict.sql
-- Card EXT-26, ruling R-190. Our own verdict, recorded beside the sender's.
--
-- FOUR THINGS, AND THE THIRD AND FOURTH ARE THE ONES THAT MATTER. The columns
-- existing is the easy half. What has to be true for the card to mean anything
-- is that a row can carry OUR code and the SENDER'S at the same time and
-- DISAGREE, and that an arm nobody named is refused.

do $$
declare
  n   integer;
  c   text;
  arm text;
begin
  -- --- 1. both columns exist and both are NULLABLE ---------------------------
  --
  -- Nullable is not cosmetic: null means our classifier DID NOT RUN, which is a
  -- real state for every digital payload and for every row written before this
  -- migration. A NOT NULL here would have forced a default, and a default would
  -- rewrite old rows into a claim nobody made.
  foreach c in array array['platform_error_code', 'platform_arm'] loop
    select count(*) into n
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'extraction_drafts'
      and column_name = c
      and is_nullable = 'YES'
      and column_default is null;
    if n <> 1 then
      raise exception 'EXT-26: extraction_drafts.% is missing, not nullable, or carries a default', c;
    end if;
  end loop;

  -- --- 2. platform_error_code is the EXISTING enum, not a new type -----------
  --
  -- The whole point of R-189's emitter rule is that no new code was created. A
  -- second enum would be a second vocabulary, which is exactly the thing the
  -- contract calls fixed.
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'extraction_drafts'
    and column_name = 'platform_error_code'
    and udt_name = 'extraction_error_code';
  if n <> 1 then
    raise exception 'EXT-26: platform_error_code is not the existing extraction_error_code enum';
  end if;

  -- --- 3. A ROW MAY CARRY BOTH, AND THEY MAY DISAGREE ------------------------
  --
  -- This is the card. The sender says one thing, we say another, both are
  -- stored, and NOTHING refuses the row. If a constraint is ever added that
  -- couples the two, this assertion is what stops it.
  insert into public.extraction_drafts (order_id, document_path, status, error_code,
                                        platform_error_code, platform_arm)
  values ('00000000-0000-4000-8000-0000ext26001', 'assert/ext-26-disagree.pdf', 'partial',
          'unreadable_document', 'reconciliation_failed', 'line_sum_missed');

  select count(*) into n
  from public.extraction_drafts
  where order_id = '00000000-0000-4000-8000-0000ext26001'
    and error_code = 'unreadable_document'
    and platform_error_code = 'reconciliation_failed'
    and platform_arm = 'line_sum_missed';
  if n <> 1 then
    raise exception 'EXT-26: a row where the sender and the platform DISAGREE was not stored as written';
  end if;

  -- --- 4. AN ARM NOBODY NAMED IS REFUSED -------------------------------------
  --
  -- The second door. The first is the ScanArm union and the typescript
  -- exhaustiveness guard on it; this one is for a writer that is not that route.
  begin
    insert into public.extraction_drafts (order_id, document_path, status, error_code,
                                          platform_error_code, platform_arm)
    values ('00000000-0000-4000-8000-0000ext26002', 'assert/ext-26-badarm.pdf', 'partial',
            'unreadable_document', 'reconciliation_failed', 'vibes');
    raise exception 'EXT-26: platform_arm accepted the value ''vibes'', so the constraint does not bind';
  exception
    when check_violation then
      null;  -- expected
  end;

  -- --- and every one of the six names IS accepted ----------------------------
  --
  -- A constraint that refused a real arm would be worse than none: the route
  -- would 500 on a document it had classified correctly.
  foreach arm in array array['header_inconsistent', 'no_lines', 'line_total_missing',
                             'target_missing', 'anchor_unknown', 'line_sum_missed'] loop
    update public.extraction_drafts
       set platform_arm = arm
     where order_id = '00000000-0000-4000-8000-0000ext26001';
    if not found then
      raise exception 'EXT-26: the arm % was refused by the constraint', arm;
    end if;
  end loop;

  raise notice 'EXT-26: both columns nullable, the enum is reused, sender and platform may disagree on one row, and only the six arms are accepted';
end $$;
