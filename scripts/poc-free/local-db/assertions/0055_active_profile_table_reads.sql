-- assertions/0055_active_profile_table_reads.sql
-- Card P3-81, goal G32. Reading a client, project or document row, and adding a
-- new object to rc-docs, need an ACTIVE profile: an active account manager reads
-- the rows and adds the object, a deactivated profile and an account with no
-- profile row read nothing and are refused the insert.
--
-- WHAT THIS FILE CANNOT PROVE, SAID HERE SO NOBODY READS IT AS PROVEN. It runs on
-- a bare postgres with a shim for the storage schema, so it proves what the
-- policies SAY when postgres evaluates them, not that the database API and the
-- storage server ask postgres the same question with a real token. That half is
-- tests/e2e/active-profile-table-reads.spec.ts, against a real local Supabase
-- stack, with a real access token.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n integer;
  t text;
begin
  foreach t in array array['clients', 'projects', 'documents'] loop
    select count(*) into n
    from pg_policies
    where schemaname = 'public' and tablename = t and policyname = t || '_select'
      and cmd = 'SELECT'
      and roles = '{authenticated}'::name[]
      and qual like '%current_app_role()%';
    if n <> 1 then
      raise exception 'P3-81: %_select is not a select to authenticated requiring current_app_role()', t;
    end if;

    -- Still exactly one select policy on the table: a second, permissive one
    -- left behind would be OR-ed with this one and undo it.
    select count(*) into n
    from pg_policies
    where schemaname = 'public' and tablename = t and cmd in ('SELECT', 'ALL');
    if n <> 1 then
      raise exception 'P3-81: % select policies reach public.%, expected exactly %_select', n, t, t;
    end if;
  end loop;

  select count(*) into n
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'rc_docs_insert'
    and cmd = 'INSERT'
    and roles = '{authenticated}'::name[]
    and with_check like '%rc-docs%'
    and with_check like '%current_app_role()%';
  if n <> 1 then
    raise exception 'P3-81: rc_docs_insert is not an insert to authenticated, inside rc-docs, requiring current_app_role()';
  end if;

  -- Still exactly one insert policy in rc-docs, for the same reason.
  select count(*) into n
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and cmd in ('INSERT', 'ALL')
    and with_check like '%rc-docs%';
  if n <> 1 then
    raise exception 'P3-81: % insert policies reach rc-docs, expected exactly rc_docs_insert', n;
  end if;
end
$$;


-- ===========================================================================
-- 2. WHO READS A ROW, AND WHO ADDS AN OBJECT
-- ===========================================================================
--
-- Three accounts: an active account manager, a deactivated account manager, and
-- an account with no profile row. One client, one project and one document,
-- written as the superuser. Each account counts what it can read of the three
-- and tries one insert into rc-docs, as the authenticated role the way the
-- database API runs a signed-in request. The results are carried out of the role
-- switch in transaction-local settings.

insert into auth.users (id, email) values
  ('e3810000-0000-4000-8000-000000000001', 'p3-81-activ@rc-inventory.local'),
  ('e3810000-0000-4000-8000-000000000002', 'p3-81-dezactivat@rc-inventory.local'),
  ('e3810000-0000-4000-8000-000000000003', 'p3-81-fara-profil@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3810000-0000-4000-8000-000000000001', 'p3-81-activ@rc-inventory.local', 'account_manager', true),
  ('e3810000-0000-4000-8000-000000000002', 'p3-81-dezactivat@rc-inventory.local', 'account_manager', false);

insert into public.clients (id, name) values
  ('e3811000-0000-4000-8000-000000000001', 'P3-81 Client');

insert into public.projects (id, client_id, name) values
  ('e3812000-0000-4000-8000-000000000001', 'e3811000-0000-4000-8000-000000000001', 'P3-81 Santier');

insert into public.documents (id, client_id, storage_path, original_name, mime_type, size_bytes, kind) values
  ('e3813000-0000-4000-8000-000000000001', 'e3811000-0000-4000-8000-000000000001',
   'client/e3811000-0000-4000-8000-000000000001/e3814000-0000-4000-8000-000000000001.pdf',
   'P3-81 Contract.pdf', 'application/pdf', 10, 'contract');

-- The same probe, once per account: count the three fixture rows it can read,
-- try one insert into rc-docs, and write both answers into transaction-local
-- settings named after the account. A DO block runs as the current role, so
-- each one runs as authenticated with that account's claims.
set local role authenticated;

set local request.jwt.claims = '{"sub":"e3810000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
declare
  seen integer;
  inserted text := 'yes';
begin
  select (select count(*) from public.clients   where id = 'e3811000-0000-4000-8000-000000000001')
       + (select count(*) from public.projects  where id = 'e3812000-0000-4000-8000-000000000001')
       + (select count(*) from public.documents where id = 'e3813000-0000-4000-8000-000000000001')
    into seen;
  perform set_config('p3_81.active_seen', seen::text, true);
  begin
    insert into storage.objects (id, bucket_id, name) values
      ('e3815000-0000-4000-8000-000000000001', 'rc-docs',
       'client/e3811000-0000-4000-8000-000000000001/e3815000-0000-4000-8000-000000000001.pdf');
  exception
    when insufficient_privilege then inserted := 'refused';
  end;
  perform set_config('p3_81.active_insert', inserted, true);
end
$$;

set local request.jwt.claims = '{"sub":"e3810000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$
declare
  seen integer;
  inserted text := 'yes';
begin
  select (select count(*) from public.clients   where id = 'e3811000-0000-4000-8000-000000000001')
       + (select count(*) from public.projects  where id = 'e3812000-0000-4000-8000-000000000001')
       + (select count(*) from public.documents where id = 'e3813000-0000-4000-8000-000000000001')
    into seen;
  perform set_config('p3_81.inactive_seen', seen::text, true);
  begin
    insert into storage.objects (id, bucket_id, name) values
      ('e3815000-0000-4000-8000-000000000002', 'rc-docs',
       'client/e3811000-0000-4000-8000-000000000001/e3815000-0000-4000-8000-000000000002.pdf');
  exception
    when insufficient_privilege then inserted := 'refused';
  end;
  perform set_config('p3_81.inactive_insert', inserted, true);
end
$$;

set local request.jwt.claims = '{"sub":"e3810000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
declare
  seen integer;
  inserted text := 'yes';
begin
  select (select count(*) from public.clients   where id = 'e3811000-0000-4000-8000-000000000001')
       + (select count(*) from public.projects  where id = 'e3812000-0000-4000-8000-000000000001')
       + (select count(*) from public.documents where id = 'e3813000-0000-4000-8000-000000000001')
    into seen;
  perform set_config('p3_81.no_profile_seen', seen::text, true);
  begin
    insert into storage.objects (id, bucket_id, name) values
      ('e3815000-0000-4000-8000-000000000003', 'rc-docs',
       'client/e3811000-0000-4000-8000-000000000001/e3815000-0000-4000-8000-000000000003.pdf');
  exception
    when insufficient_privilege then inserted := 'refused';
  end;
  perform set_config('p3_81.no_profile_insert', inserted, true);
end
$$;

reset role;

do $$
declare
  n integer;
begin
  -- THE CONTROL FIRST: without it, zeros and refusals would pass on a shim where
  -- nobody can read or write anything.
  if current_setting('p3_81.active_seen') <> '3' then
    raise exception 'P3-81: an active profile reads % of 3 rows (client, project, document)', current_setting('p3_81.active_seen');
  end if;
  if current_setting('p3_81.active_insert') <> 'yes' then
    raise exception 'P3-81: an active profile was refused an insert into rc-docs';
  end if;

  if current_setting('p3_81.inactive_seen') <> '0' then
    raise exception 'P3-81: a deactivated profile still reads % of the 3 rows', current_setting('p3_81.inactive_seen');
  end if;
  if current_setting('p3_81.inactive_insert') <> 'refused' then
    raise exception 'P3-81: a deactivated profile inserted an object into rc-docs';
  end if;

  if current_setting('p3_81.no_profile_seen') <> '0' then
    raise exception 'P3-81: an account with no profile reads % of the 3 rows', current_setting('p3_81.no_profile_seen');
  end if;
  if current_setting('p3_81.no_profile_insert') <> 'refused' then
    raise exception 'P3-81: an account with no profile inserted an object into rc-docs';
  end if;

  -- The refused inserts wrote nothing; the accepted one wrote exactly one row.
  select count(*) into n from storage.objects where id::text like 'e3815000-%';
  if n <> 1 then
    raise exception 'P3-81: % objects written to rc-docs by the three accounts, expected 1 (the active one)', n;
  end if;
end
$$;

rollback;
