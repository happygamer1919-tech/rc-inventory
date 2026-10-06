-- assertions/0072_batches_status_history_active_account.sql
-- Card P3-179. What 0072 must have left behind, and what it must NOT have changed.
--
--   1. public.batches has exactly four policies: select and insert on
--      public.current_app_role() is not null, update and delete still on
--      public.is_owner(). Neither select nor insert may be `true` any more.
--   2. public.status_history has exactly two policies, select and insert, both
--      on public.current_app_role() is not null, and still NO update and NO
--      delete policy: the table stays append-only.
--   3. public.outbound_lines keeps the four policies of 0070: this card does not
--      touch it.
--
-- A BARE POSTGRES RUNS AS SUPERUSER AND BYPASSES ROW LEVEL SECURITY, so this file
-- proves the policies EXIST with the right predicate and cannot prove what they
-- let through. That is tests/e2e/outbound-lines-deactivated.spec.ts, with real
-- tokens through PostgREST.
--
-- Refusals are written without diacritics, the convention 0063 to 0070 follow.
-- Everything runs inside a transaction that is rolled back.

begin;

do $$
declare
  n    integer;
  txt  text;
  tbls text[] := array['batches', 'batches', 'status_history', 'status_history'];
  cmds text[] := array['SELECT', 'INSERT', 'SELECT', 'INSERT'];
  pol  text;
  i    integer;
begin
  -- --- 1 and 2. counts ------------------------------------------------------
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'batches';
  if n <> 4 then
    raise exception 'P3-179: expected exactly 4 policies on public.batches, found %', n;
  end if;

  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'status_history';
  if n <> 2 then
    raise exception 'P3-179: expected exactly 2 policies on public.status_history, found %', n;
  end if;

  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'status_history' and cmd in ('UPDATE', 'DELETE', 'ALL');
  if n <> 0 then
    raise exception 'P3-179: public.status_history gained an update or delete policy; it is append-only';
  end if;

  -- --- 1 and 2. the four tightened policies ----------------------------------
  for i in 1 .. array_length(cmds, 1) loop
    pol := tbls[i] || '_' || lower(cmds[i]);
    select coalesce(qual, '') || ' | ' || coalesce(with_check, '') into txt
    from pg_policies
    where schemaname = 'public' and tablename = tbls[i]
      and policyname = pol and cmd = cmds[i];
    if txt is null then
      raise exception 'P3-179: policy % for % is missing on public.%', pol, cmds[i], tbls[i];
    end if;
    if txt not ilike '%current_app_role()%is not null%' then
      raise exception 'P3-179: policy % must test current_app_role() is not null, found %', pol, txt;
    end if;
    if txt ~* '(^|[ (|])true($|[ )|])' then
      raise exception 'P3-179: policy % still carries a bare true, found %', pol, txt;
    end if;
  end loop;

  -- --- 1. owner-only update and delete on batches unchanged ------------------
  select coalesce(qual, '') || ' | ' || coalesce(with_check, '') into txt
  from pg_policies
  where schemaname = 'public' and tablename = 'batches'
    and policyname = 'batches_update' and cmd = 'UPDATE';
  if txt is null or txt not ilike '%is_owner()%|%is_owner()%' then
    raise exception 'P3-179: batches_update must stay on is_owner() on both sides, found %', coalesce(txt, 'nothing');
  end if;

  select qual into txt
  from pg_policies
  where schemaname = 'public' and tablename = 'batches'
    and policyname = 'batches_delete' and cmd = 'DELETE';
  if txt is null or txt not ilike '%is_owner()%' then
    raise exception 'P3-179: batches_delete must stay on is_owner(), found %', coalesce(txt, 'nothing');
  end if;

  -- --- 3. outbound_lines untouched -------------------------------------------
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'outbound_lines';
  if n <> 4 then
    raise exception 'P3-179: public.outbound_lines must keep the four policies of 0070, found %', n;
  end if;
end $$;

rollback;
