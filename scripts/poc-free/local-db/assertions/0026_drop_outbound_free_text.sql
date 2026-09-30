-- assertions/0026_drop_outbound_free_text.sql
-- Card P3-04b. The end state of the destination, asserted against the finished
-- schema.
--
-- THIS FILE REPLACES assertions/0017_outbound_project_id.sql, WHICH WAS DELETED
-- IN THE SAME COMMIT, AND THAT DELETION IS DELIBERATE RATHER THAN CONVENIENT.
-- Every file in this directory runs against the schema AFTER ALL migrations have
-- applied, so an assertion can only ever describe the END state. 0017's
-- assertion described a TRANSIENT one, and said so in its own words: project_id
-- NULLABLE "in this card", the two text columns "still present", and a fixture
-- exercising public.backfill_outbound_project_ids(). 0026 makes the column NOT
-- NULL, drops both text columns and drops the backfill function, so that file
-- could not pass and could not be repaired: the objects it reads are gone.
--
-- WHAT WAS NOT LOST. Everything 0017's assertion checked that still exists is
-- carried below: the foreign key and that it RESTRICTS, the index, and the
-- exactly-one create_outbound_issue check that 0018 needed. The one thing that
-- is genuinely gone is the backfill fixture, and it is gone because the function
-- it drove is gone. Its record lives in git and in docs/migrations/APPLY-LOG.md.

do $$
declare
  n   integer;
  txt text;
begin
  -- --- the column still exists, and the NOT NULL has MOVED ------------------
  --
  -- CORRECTED 2026-09-30 BY CARD P3-118 UNDER CLAUDE.md SECTION 9c. This block
  -- used to read, and it is quoted rather than deleted because 0026's own header
  -- and P3-04b's acceptance both rest on it:
  --
  --   "-- The inverse of what 0017 asserted, which is the whole of this card.
  --    if txt <> 'not null' then
  --      raise exception 'P3-04b: project_id must be NOT NULL after this card, found %', txt;
  --    end if;"
  --
  -- IT WAS TRUE FROM 0026 UNTIL MIGRATION 0067 AND IS NOW FALSE ABOUT THE END
  -- STATE, which is the only state a file in this directory can describe: every
  -- file here runs after ALL migrations have applied. Ruling R-215 gives outbound
  -- a second mode, direct_client, and such a row HAS NO PROJECT, so a column
  -- level NOT NULL could not stand and stay honest.
  --
  -- NOTHING P3-04b PROVED IS LOST, AND THE REPLACEMENT SAYS MORE. NOT NULL said
  -- "every row has a project". Group 3 of
  -- assertions/0067_outbound_direct_client.sql says "every PROJECT row has one,
  -- and a project row carries no pickup date", and its group 4 adds "and no
  -- direct client row has a project", neither of which a column level rule can
  -- say at all. The column is still here, still the only representation of a
  -- project destination, and the two text columns this card dropped are still
  -- gone, which is checked immediately below.
  select case when a.attnotnull then 'not null' else 'nullable' end into txt
  from pg_attribute a
  where a.attrelid = 'public.outbound_issues'::regclass and a.attname = 'project_id';

  if txt is null then
    raise exception 'P3-04b: expected public.outbound_issues.project_id to exist, found none';
  end if;

  -- THE REQUIREMENT IS READ WHERE IT NOW LIVES, so this card is not reduced to
  -- checking that a column exists. A tree that dropped the mode constraint fails
  -- here as well as in 0067's own file.
  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.outbound_issues'::regclass
    and c.contype = 'c'
    and c.conname = 'outbound_issues_project_mode_shape';

  if n <> 1 then
    raise exception 'P3-04b, carried to P3-118: the project destination requirement moved into outbound_issues_project_mode_shape and that constraint is missing';
  end if;

  -- --- THE TEXT COLUMNS ARE GONE -------------------------------------------
  -- The card's own acceptance line, inverted from 0017's.
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'outbound_issues'
    and column_name in ('client_name', 'project_name');

  if n <> 0 then
    raise exception 'P3-04b: expected client_name and project_name to be dropped, found % of them', n;
  end if;

  -- --- the backfill function is gone ---------------------------------------
  -- It read the two dropped columns, so leaving it would leave a function that
  -- cannot run. Nothing in the application ever called it.
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'backfill_outbound_project_ids';

  if n <> 0 then
    raise exception 'P3-04b: backfill_outbound_project_ids should have been dropped, found %', n;
  end if;

  -- --- the foreign key, and that it RESTRICTS ------------------------------
  -- Carried over from 0017's assertion unchanged. A project with issues against
  -- it must not be deletable out from under them, and that is now load bearing
  -- in a way it was not before: project_id is the ONLY record of the
  -- destination, so a cascade here would erase where materials went.
  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.outbound_issues'::regclass
    and c.contype = 'f'
    and c.confrelid = 'public.projects'::regclass
    and c.confdeltype = 'r';

  if n <> 1 then
    raise exception 'P3-04b: expected exactly one RESTRICT foreign key to projects, found %', n;
  end if;

  -- --- the index -----------------------------------------------------------
  select count(*) into n
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'outbound_issues'
    and indexdef like '%project_id%';

  if n < 1 then
    raise exception 'P3-04b: expected an index covering outbound_issues.project_id, found none';
  end if;

  -- --- EXACTLY ONE create_outbound_issue -----------------------------------
  -- Carried over from 0017's assertion, and THE HALF THAT MATTERS IS UNTOUCHED:
  -- two surviving versions mean a drop did not happen and every call to the name
  -- is ambiguous.
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'create_outbound_issue';

  if n <> 1 then
    raise exception 'P3-04b: expected exactly one create_outbound_issue, found %. Two means a drop did not happen and every call is ambiguous.', n;
  end if;

  -- CORRECTED 2026-09-30 BY CARD P3-118 UNDER CLAUDE.md SECTION 9c. The literal
  -- signature pin used to follow, and it is quoted rather than deleted because
  -- 0026's header states its reason in terms:
  --
  --   "-- 0026 replaced the body and deliberately did NOT change the signature:
  --    -- reshaping it would mean a second DROP FUNCTION and would trip the
  --    -- applier's own signature assertion.
  --    if txt <> 'text, text, text, jsonb, uuid' then
  --      raise exception 'P3-04b: create_outbound_issue signature is (%), expected (text, text, text, jsonb, uuid)', txt;
  --    end if;"
  --
  -- BOTH HALVES OF THAT REASON ARE SPENT. Card APPLY-01 replaced the applier's
  -- unconditional five-argument assertion with declared-function-signatures-exist
  -- and declared-function-versions-only, which are derived from what the batch
  -- itself declares, and its own comment names "a deviz-aware outbound issue" as
  -- the near and plausible change of signature it was making room for. Migration
  -- 0067 is that change: it drops the five-argument version and declares one
  -- six-argument version, because the second outbound mode needs a mode, a client
  -- and a pickup date, and p_client_name and p_project_name were dead parameters
  -- kept only for the assertion APPLY-01 removed.
  --
  -- THE PIN IS NOT DROPPED, IT MOVED TO THE CARD THAT OWNS THE SIGNATURE.
  -- assertions/0067_outbound_direct_client.sql group 6 checks the exact argument
  -- list 0067 declares, so no signature change can go unnoticed; what stopped
  -- being asserted is only that the signature must never change again, which was
  -- never a card's decision to make forever.

  -- --- the write path cannot record a PROJECT destination without a project -
  -- The constraint is the database's guarantee; this is the function's, in
  -- Romanian, so the operator sees a sentence rather than a constraint name.
  -- P3-118 CHANGED THE CALL SHAPE AND NOT THE PROMISE: the mode is named
  -- explicitly, and a real line is passed so that the missing project is the only
  -- thing wrong with the call. The old version passed an EMPTY line array, and the
  -- function checks the lines before the project, so it was passing on the refusal
  -- about the positions rather than the one this block is about.
  begin
    perform public.create_outbound_issue(
      'IES-ASSERT-0026',
      jsonb_build_array(jsonb_build_object(
        'product_id', (select id from public.products order by sku limit 1),
        'quantity', 1)),
      null, 'project', null, null);
    raise exception 'P3-04b: create_outbound_issue accepted a null project, and must not';
  exception
    when sqlstate 'P0001' then
      null;  -- refused, which is the expected outcome
  end;
end $$;
