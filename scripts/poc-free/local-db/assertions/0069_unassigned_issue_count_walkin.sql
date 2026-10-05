-- assertions/0069_unassigned_issue_count_walkin.sql
-- Card P3-152. What 0069 must have changed, and what it must not.
--
-- public.unassigned_issue_count() feeds the line on every client page that says an
-- issue is not yet in any client total. Since 0067 a walk-in (direct_client) issue
-- has no project BY DESIGN, so it must not raise that count. A project issue with
-- no project must still raise it, because that is the case the warning exists for.
--
-- THE WITNESS IS NEEDED. outbound_issues_project_mode_shape, from 0067, refuses a
-- project row with no project, so the second case cannot be inserted while that
-- constraint stands. This file drops the constraint INSIDE the transaction and
-- puts it back by rolling the transaction back. Without that case the first one
-- would pass just as well on a function that always answers zero.
--
-- Everything runs inside a transaction that is rolled back. Refusals carry no
-- diacritics, the convention of 0063, 0066 and 0067.

begin;

do $$
declare
  v_before  bigint;
  v_client  uuid;
  v_txt     text;
begin
  v_before := public.unassigned_issue_count();

  insert into public.clients (name) values ('TEST P3-152 client') returning id into v_client;

  -- A WALK-IN ISSUE DOES NOT RAISE THE COUNT.
  insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date)
  values ('TEST-P3152-WALKIN', 'direct_client', v_client, date '2026-10-04');

  if public.unassigned_issue_count() <> v_before then
    raise exception 'P3-152: unassigned_issue_count counted a walk-in issue, answered % and must still answer %',
      public.unassigned_issue_count(), v_before;
  end if;

  -- A PROJECT ISSUE WITH NO PROJECT STILL DOES. The shape constraint is dropped for
  -- this one row and comes back with the rollback at the end of this file.
  alter table public.outbound_issues drop constraint outbound_issues_project_mode_shape;

  insert into public.outbound_issues (reference, issue_mode, project_id)
  values ('TEST-P3152-NOPROJECT', 'project', null);

  if public.unassigned_issue_count() <> v_before + 1 then
    raise exception 'P3-152: unassigned_issue_count answered % for one project issue with no project, expected %',
      public.unassigned_issue_count(), v_before + 1;
  end if;

  -- THE SIGNATURE AND THE GRANT ARE WHAT lib/data/client-detail.ts RELIES ON.
  select pg_get_function_result(p.oid) into v_txt
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'unassigned_issue_count';

  if v_txt is distinct from 'bigint' then
    raise exception 'P3-152: unassigned_issue_count must return bigint, found %', coalesce(v_txt, 'no function');
  end if;

  if not has_function_privilege('authenticated', 'public.unassigned_issue_count()', 'execute') then
    raise exception 'P3-152: authenticated lost execute on unassigned_issue_count';
  end if;

  -- THE TWIN COUNTER IS UNCHANGED AND STILL ANSWERS THE SAME QUESTION.
  if public.unassigned_outbound_count() <> v_before + 1 then
    raise exception 'P3-152: unassigned_outbound_count and unassigned_issue_count disagree on the same rows';
  end if;
end $$;

rollback;
