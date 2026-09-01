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
  -- --- the column, and that it is now NOT NULL ------------------------------
  -- The inverse of what 0017 asserted, which is the whole of this card.
  select case when a.attnotnull then 'not null' else 'nullable' end into txt
  from pg_attribute a
  where a.attrelid = 'public.outbound_issues'::regclass and a.attname = 'project_id';

  if txt is null then
    raise exception 'P3-04b: expected public.outbound_issues.project_id to exist, found none';
  end if;
  if txt <> 'not null' then
    raise exception 'P3-04b: project_id must be NOT NULL after this card, found %', txt;
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

  -- --- EXACTLY ONE create_outbound_issue, still five arguments -------------
  -- Carried over from 0017's assertion. 0026 replaced the body and deliberately
  -- did NOT change the signature: reshaping it would mean a second DROP FUNCTION
  -- and would trip the applier's own signature assertion.
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'create_outbound_issue';

  if n <> 1 then
    raise exception 'P3-04b: expected exactly one create_outbound_issue, found %. Two means a drop did not happen and every call is ambiguous.', n;
  end if;

  select array_to_string(array(select format_type(t, null) from unnest(p.proargtypes) as t), ', ')
    into txt
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'create_outbound_issue';

  if txt <> 'text, text, text, jsonb, uuid' then
    raise exception 'P3-04b: create_outbound_issue signature is (%), expected (text, text, text, jsonb, uuid)', txt;
  end if;

  -- --- the write path cannot record a destination without a project --------
  -- The NOT NULL is the database's guarantee; this is the function's, in
  -- Romanian, so the operator sees a sentence rather than a constraint name.
  begin
    perform public.create_outbound_issue('IES-ASSERT-0026', '', '', '[]'::jsonb, null);
    raise exception 'P3-04b: create_outbound_issue accepted a null project, and must not';
  exception
    when sqlstate 'P0001' then
      null;  -- refused, which is the expected outcome
  end;
end $$;
