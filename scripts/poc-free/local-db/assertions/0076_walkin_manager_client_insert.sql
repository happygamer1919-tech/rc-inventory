-- assertions/0076_walkin_manager_client_insert.sql
-- Card P3-147. What 0076 must have left behind on public.clients, and what it
-- must NOT have changed.
--
-- THREE GROUPS:
--
--   1. clients_insert is an INSERT policy to authenticated whose check asks
--      current_app_role() and names BOTH roles, owner and account_manager, and
--      no longer asks is_owner(). Naming the roles is the narrowing the owner
--      asked for (q143): a third role added later must not inherit the grant.
--   2. clients_update is UNCHANGED: still is_owner() on both sides. The owner
--      widened creating a client, not editing one.
--   3. Still exactly three policies and NO delete policy.
--
-- WHAT IS DELIBERATELY NOT ASSERTED HERE: a bare postgres runs as superuser and
-- bypasses row level security, so this file proves the policy EXISTS and not
-- what it lets through. The account manager actually inserting a client through
-- a real token is the P3-147 case of tests/e2e/outbound-direct-client.spec.ts.
--
-- IT RAISES RATHER THAN PRINTS, like every file in this directory. It reads
-- pg_policies only and writes nothing.

do $$
declare
  n integer;
  chk text;
  usg text;
begin
  -- --- 1. the insert policy ------------------------------------------------
  select count(*), max(with_check) into n, chk from pg_policies
  where schemaname = 'public' and tablename = 'clients'
    and policyname = 'clients_insert' and cmd = 'INSERT'
    and roles = '{authenticated}'::name[];
  if n <> 1 then
    raise exception 'P3-147: expected one INSERT policy clients_insert to authenticated, found %', n;
  end if;
  if chk not like '%current_app_role()%' then
    raise exception 'P3-147: clients_insert must ask current_app_role(), found %', chk;
  end if;
  if chk not like '%owner%' or chk not like '%account_manager%' then
    raise exception 'P3-147: clients_insert must name owner and account_manager, found %', chk;
  end if;
  if chk like '%is_owner()%' then
    raise exception 'P3-147: clients_insert still asks is_owner(), found %', chk;
  end if;
  if chk like '%is not null%' then
    raise exception 'P3-147: clients_insert must name the two roles, not accept any role, found %', chk;
  end if;

  -- --- 2. the update policy, unchanged -------------------------------------
  select max(qual), max(with_check) into usg, chk from pg_policies
  where schemaname = 'public' and tablename = 'clients'
    and policyname = 'clients_update' and cmd = 'UPDATE';
  if coalesce(usg, '') not like '%is_owner()%' or coalesce(chk, '') not like '%is_owner()%'
     or usg like '%account_manager%' or chk like '%account_manager%' then
    raise exception 'P3-147: clients_update must stay is_owner() on both sides, found using % check %', usg, chk;
  end if;

  -- --- 3. three policies, no delete ----------------------------------------
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'clients';
  if n <> 3 then
    raise exception 'P3-147: expected exactly 3 policies on public.clients, found %', n;
  end if;
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'clients' and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-147: public.clients must have NO delete policy, found %', n;
  end if;
end
$$;
