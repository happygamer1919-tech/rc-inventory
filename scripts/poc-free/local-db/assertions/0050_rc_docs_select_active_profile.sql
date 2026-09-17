-- assertions/0050_rc_docs_select_active_profile.sql
-- Card P3-70, Ivan's finding F1. Reading an object in rc-docs needs an ACTIVE
-- profile: an active owner or account manager sees it, a deactivated profile and
-- an account with no profile row see nothing.
--
-- WHAT THIS FILE CANNOT PROVE, SAID HERE SO NOBODY READS IT AS PROVEN. It runs on
-- a bare postgres with a shim for the storage schema, so it proves what the
-- policy SAYS when postgres evaluates it, not that the storage server asks
-- postgres the same question when it signs a link. That half is
-- tests/e2e/document-download-security.spec.ts, against a real local Supabase
-- stack, with a real access token.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n integer;
begin
  select count(*) into n
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'rc_docs_select'
    and cmd = 'SELECT'
    and roles = '{authenticated}'::name[]
    and qual like '%rc-docs%'
    and qual like '%current_app_role()%';
  if n <> 1 then
    raise exception 'P3-70: rc_docs_select is not a select to authenticated, inside rc-docs, requiring current_app_role()';
  end if;

  -- Still exactly one select policy in rc-docs: a second, permissive one left
  -- behind would be OR-ed with this one and undo it.
  select count(*) into n
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and cmd in ('SELECT', 'ALL')
    and qual like '%rc-docs%';
  if n <> 1 then
    raise exception 'P3-70: % select policies reach rc-docs, expected exactly rc_docs_select', n;
  end if;
end
$$;


-- ===========================================================================
-- 2. WHO SEES A STORED OBJECT
-- ===========================================================================
--
-- Three accounts: an active account manager, a deactivated account manager, and
-- an account with no profile row. One object in rc-docs, written as the
-- superuser. Each account counts what it can see, as the authenticated role the
-- way the storage server runs a signed-in request, and the count is carried out
-- of the role switch in a transaction-local setting.

insert into auth.users (id, email) values
  ('e3700000-0000-4000-8000-000000000001', 'p3-70-activ@rc-inventory.local'),
  ('e3700000-0000-4000-8000-000000000002', 'p3-70-dezactivat@rc-inventory.local'),
  ('e3700000-0000-4000-8000-000000000003', 'p3-70-fara-profil@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3700000-0000-4000-8000-000000000001', 'p3-70-activ@rc-inventory.local', 'account_manager', true),
  ('e3700000-0000-4000-8000-000000000002', 'p3-70-dezactivat@rc-inventory.local', 'account_manager', false);

insert into storage.objects (id, bucket_id, name) values
  ('e3705000-0000-4000-8000-000000000001', 'rc-docs',
   'client/e3701000-0000-4000-8000-000000000001/e3704000-0000-4000-8000-000000000001.pdf');

set local role authenticated;

set local request.jwt.claims = '{"sub":"e3700000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('p3_70.active',
  (select count(*)::text from storage.objects where id = 'e3705000-0000-4000-8000-000000000001'), true);

set local request.jwt.claims = '{"sub":"e3700000-0000-4000-8000-000000000002","role":"authenticated"}';
select set_config('p3_70.inactive',
  (select count(*)::text from storage.objects where id = 'e3705000-0000-4000-8000-000000000001'), true);

set local request.jwt.claims = '{"sub":"e3700000-0000-4000-8000-000000000003","role":"authenticated"}';
select set_config('p3_70.no_profile',
  (select count(*)::text from storage.objects where id = 'e3705000-0000-4000-8000-000000000001'), true);

reset role;

do $$
begin
  -- THE CONTROL FIRST: without it, three zeros would pass on a shim where
  -- nobody can see anything.
  if current_setting('p3_70.active') <> '1' then
    raise exception 'P3-70: an active profile sees % of 1 object in rc-docs', current_setting('p3_70.active');
  end if;
  if current_setting('p3_70.inactive') <> '0' then
    raise exception 'P3-70: a deactivated profile still sees % object(s) in rc-docs', current_setting('p3_70.inactive');
  end if;
  if current_setting('p3_70.no_profile') <> '0' then
    raise exception 'P3-70: an account with no profile sees % object(s) in rc-docs', current_setting('p3_70.no_profile');
  end if;
end
$$;

rollback;
