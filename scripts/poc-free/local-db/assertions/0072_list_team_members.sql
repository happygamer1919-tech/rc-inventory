-- assertions/0072_list_team_members.sql
-- Card P3-156. list_team_members() gives an ACTIVE caller the id, display name and
-- active flag of every colleague and nothing else, and gives a deactivated caller
-- or an account with no profile no rows. The profiles read rule is untouched.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n integer;
  r text;
begin
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'list_team_members' and p.prosecdef;
  if n <> 1 then
    raise exception 'P3-156: list_team_members is not a single security definer function';
  end if;

  -- Three columns and no others: no email, no role, no phone.
  select pg_catalog.pg_get_function_result(p.oid) into r
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'list_team_members';
  if r <> 'TABLE(id uuid, display_name text, active boolean)' then
    raise exception 'P3-156: list_team_members returns % instead of id, display_name, active', r;
  end if;

  -- authenticated may run it, anon and public may not.
  if not has_function_privilege('authenticated', 'public.list_team_members()', 'execute') then
    raise exception 'P3-156: authenticated cannot execute list_team_members';
  end if;
  if has_function_privilege('anon', 'public.list_team_members()', 'execute') then
    raise exception 'P3-156: anon can execute list_team_members';
  end if;

  -- The profiles read rule was not widened: still own row or owner.
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT';
  if n <> 1 then
    raise exception 'P3-156: % select policies on profiles, expected exactly profiles_select', n;
  end if;
end
$$;


-- ===========================================================================
-- 2. WHO SEES THE TEAM
-- ===========================================================================
--
-- An active owner, an active account manager, a deactivated account manager and
-- an account with no profile row. Each counts the rows the function returns, as
-- the authenticated role, and the counts are carried out of the role switch in
-- transaction-local settings.

insert into auth.users (id, email) values
  ('e3560000-0000-4000-8000-000000000001', 'p3-156-owner@rc-inventory.local'),
  ('e3560000-0000-4000-8000-000000000002', 'p3-156-manager@rc-inventory.local'),
  ('e3560000-0000-4000-8000-000000000003', 'p3-156-dezactivat@rc-inventory.local'),
  ('e3560000-0000-4000-8000-000000000004', 'p3-156-fara-profil@rc-inventory.local');

insert into public.profiles (id, email, role, full_name, active) values
  ('e3560000-0000-4000-8000-000000000001', 'p3-156-owner@rc-inventory.local', 'owner', 'Test Owner 156', true),
  ('e3560000-0000-4000-8000-000000000002', 'p3-156-manager@rc-inventory.local', 'account_manager', 'Test Manager 156', true),
  ('e3560000-0000-4000-8000-000000000003', 'p3-156-dezactivat@rc-inventory.local', 'account_manager', 'Test Dezactivat 156', false);

set local role authenticated;

set local request.jwt.claims = '{"sub":"e3560000-0000-4000-8000-000000000002","role":"authenticated"}';
select set_config('p3_156.manager_sees_owner',
  (select count(*)::text from public.list_team_members() t
    where t.id = 'e3560000-0000-4000-8000-000000000001' and t.display_name = 'Test Owner 156' and t.active), true);
select set_config('p3_156.manager_sees_inactive',
  (select count(*)::text from public.list_team_members() t
    where t.id = 'e3560000-0000-4000-8000-000000000003' and t.display_name = 'Test Dezactivat 156' and not t.active), true);
-- The manager still reads exactly one profile directly.
select set_config('p3_156.manager_profiles',
  (select count(*)::text from public.profiles where email like 'p3-156-%'), true);

set local request.jwt.claims = '{"sub":"e3560000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('p3_156.owner_rows',
  (select count(*)::text from public.list_team_members() t where t.id::text like 'e3560000-%'), true);

set local request.jwt.claims = '{"sub":"e3560000-0000-4000-8000-000000000003","role":"authenticated"}';
select set_config('p3_156.inactive_rows', (select count(*)::text from public.list_team_members()), true);

set local request.jwt.claims = '{"sub":"e3560000-0000-4000-8000-000000000004","role":"authenticated"}';
select set_config('p3_156.no_profile_rows', (select count(*)::text from public.list_team_members()), true);

reset role;

do $$
begin
  -- THE CONTROLS FIRST: without them, zeros would pass on a shim where the
  -- function returns nothing to anybody.
  if current_setting('p3_156.manager_sees_owner') <> '1' then
    raise exception 'P3-156: an active account manager does not see the owner by name';
  end if;
  if current_setting('p3_156.manager_sees_inactive') <> '1' then
    raise exception 'P3-156: an active account manager does not see a deactivated colleague, flagged inactive';
  end if;
  if current_setting('p3_156.owner_rows') <> '3' then
    raise exception 'P3-156: the owner sees % of 3 test colleagues', current_setting('p3_156.owner_rows');
  end if;
  if current_setting('p3_156.manager_profiles') <> '1' then
    raise exception 'P3-156: an account manager reads % profile rows directly, expected 1 (own row)',
      current_setting('p3_156.manager_profiles');
  end if;
  if current_setting('p3_156.inactive_rows') <> '0' then
    raise exception 'P3-156: a deactivated caller gets % team rows', current_setting('p3_156.inactive_rows');
  end if;
  if current_setting('p3_156.no_profile_rows') <> '0' then
    raise exception 'P3-156: an account with no profile gets % team rows', current_setting('p3_156.no_profile_rows');
  end if;
end
$$;

rollback;
