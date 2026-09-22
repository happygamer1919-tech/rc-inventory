-- assertions/0059_client_notes.sql
-- Card P3-90, goal G45. public.client_notes exists with its five columns, its
-- index and its empty-body check; an active profile reads the notes and a
-- deactivated one reads none; only the owner inserts, and only as itself; nobody
-- updates or deletes a note; client_stage_history from 0039 is untouched and
-- still reads a client's stage changes. Ruling R-062.
--
-- WHAT THIS FILE CANNOT PROVE, SAID HERE SO NOBODY READS IT AS PROVEN. It runs on
-- a bare postgres with a shim for auth, so it proves what the policies SAY when
-- postgres evaluates them, not that the database API asks postgres the same
-- question with a real token. That half is tests/e2e/client-notes.spec.ts,
-- against a real local Supabase stack.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n integer;
  s text;
begin
  select string_agg(column_name || ':' || data_type || ':' || is_nullable, '|' order by ordinal_position)
    into s
  from information_schema.columns
  where table_schema = 'public' and table_name = 'client_notes';
  if s is distinct from
     'id:uuid:NO|client_id:uuid:NO|body:text:NO|created_by:uuid:YES|created_at:timestamp with time zone:NO' then
    raise exception 'P3-90: public.client_notes columns are %', coalesce(s, 'missing');
  end if;

  select count(*) into n
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'client_notes' and c.relrowsecurity;
  if n <> 1 then
    raise exception 'P3-90: row level security is not enabled on public.client_notes';
  end if;

  -- EXACTLY TWO POLICIES, a select and an insert. An update or delete policy
  -- would make a note editable history.
  select string_agg(policyname || ':' || cmd, '|' order by policyname) into s
  from pg_policies where schemaname = 'public' and tablename = 'client_notes';
  if s is distinct from 'client_notes_insert:INSERT|client_notes_select:SELECT' then
    raise exception 'P3-90: the policies on public.client_notes are %', coalesce(s, 'none');
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'client_notes' and policyname = 'client_notes_select'
    and roles = '{authenticated}'::name[] and qual like '%current_app_role()%';
  if n <> 1 then
    raise exception 'P3-90: client_notes_select is not a select to authenticated requiring current_app_role(), as clients_select';
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'client_notes' and policyname = 'client_notes_insert'
    and roles = '{authenticated}'::name[] and with_check like '%is_owner()%' and with_check like '%auth.uid()%';
  if n <> 1 then
    raise exception 'P3-90: client_notes_insert is not an insert to authenticated requiring is_owner() and the caller as author';
  end if;

  -- The privileges: select and insert for authenticated, nothing for anon.
  select string_agg(grantee || ':' || privilege_type, '|' order by grantee, privilege_type) into s
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'client_notes' and grantee in ('anon', 'authenticated');
  if s is distinct from 'authenticated:INSERT|authenticated:SELECT' then
    raise exception 'P3-90: the grants on public.client_notes are %', coalesce(s, 'none');
  end if;

  if to_regclass('public.client_notes_client_created_idx') is null then
    raise exception 'P3-90: the index client_notes_client_created_idx is missing';
  end if;

  -- 0039's reader is left as it was: same signature, still granted.
  if to_regprocedure('public.client_stage_history(uuid)') is null
     or not has_function_privilege('authenticated', 'public.client_stage_history(uuid)', 'execute') then
    raise exception 'P3-90: client_stage_history(uuid) is missing or no longer granted to authenticated';
  end if;
end
$$;


-- ===========================================================================
-- 2. WHO READS, WHO WRITES
-- ===========================================================================
--
-- Three accounts: the owner, an active account manager and a deactivated account
-- manager. One client, one note written as the superuser. Each account reads and
-- tries to write as the authenticated role, the way the database API runs a
-- signed-in request; the answers are carried out of the role switch in
-- transaction-local settings.

insert into auth.users (id, email) values
  ('e3900000-0000-4000-8000-000000000001', 'p3-90-owner@rc-inventory.local'),
  ('e3900000-0000-4000-8000-000000000002', 'p3-90-manager@rc-inventory.local'),
  ('e3900000-0000-4000-8000-000000000003', 'p3-90-inactive@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3900000-0000-4000-8000-000000000001', 'p3-90-owner@rc-inventory.local', 'owner', true),
  ('e3900000-0000-4000-8000-000000000002', 'p3-90-manager@rc-inventory.local', 'account_manager', true),
  ('e3900000-0000-4000-8000-000000000003', 'p3-90-inactive@rc-inventory.local', 'account_manager', false);

insert into public.clients (id, name) values
  ('e3901000-0000-4000-8000-000000000001', 'P3-90 Client');

insert into public.client_notes (id, client_id, body, created_by) values
  ('e3902000-0000-4000-8000-000000000001', 'e3901000-0000-4000-8000-000000000001',
   'P3-90 nota de pornire', 'e3900000-0000-4000-8000-000000000001');

set local role authenticated;

-- --- THE OWNER ---------------------------------------------------------------
set local request.jwt.claims = '{"sub":"e3900000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
declare
  seen integer;
  result text;
begin
  select count(*) into seen from public.client_notes where client_id = 'e3901000-0000-4000-8000-000000000001';
  perform set_config('p3_90.owner_seen', seen::text, true);

  -- A note with no author sent: the default fills in the caller.
  insert into public.client_notes (id, client_id, body) values
    ('e3902000-0000-4000-8000-000000000002', 'e3901000-0000-4000-8000-000000000001', 'P3-90 am vorbit la telefon');

  -- A note claiming somebody else as author.
  result := 'yes';
  begin
    insert into public.client_notes (client_id, body, created_by) values
      ('e3901000-0000-4000-8000-000000000001', 'P3-90 alt autor', 'e3900000-0000-4000-8000-000000000002');
  exception when insufficient_privilege then result := 'refused';
  end;
  perform set_config('p3_90.owner_spoof', result, true);

  -- An empty note and a note of spaces and a line break.
  result := 'yes';
  begin
    insert into public.client_notes (client_id, body) values ('e3901000-0000-4000-8000-000000000001', '');
  exception when check_violation then result := 'refused';
  end;
  perform set_config('p3_90.owner_empty', result, true);
  result := 'yes';
  begin
    insert into public.client_notes (client_id, body) values ('e3901000-0000-4000-8000-000000000001', E'  \n ');
  exception when check_violation then result := 'refused';
  end;
  perform set_config('p3_90.owner_blank', result, true);

  -- Not even the owner edits or deletes a note.
  result := 'yes';
  begin
    update public.client_notes set body = 'P3-90 rescris' where id = 'e3902000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then result := 'refused';
  end;
  perform set_config('p3_90.owner_update', result, true);
  result := 'yes';
  begin
    delete from public.client_notes where id = 'e3902000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then result := 'refused';
  end;
  perform set_config('p3_90.owner_delete', result, true);
end
$$;

-- --- THE ACTIVE ACCOUNT MANAGER ------------------------------------------------
set local request.jwt.claims = '{"sub":"e3900000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$
declare
  seen integer;
  result text := 'yes';
begin
  select count(*) into seen from public.client_notes where client_id = 'e3901000-0000-4000-8000-000000000001';
  perform set_config('p3_90.manager_seen', seen::text, true);
  begin
    insert into public.client_notes (client_id, body) values
      ('e3901000-0000-4000-8000-000000000001', 'P3-90 nota managerului');
  exception when insufficient_privilege then result := 'refused';
  end;
  perform set_config('p3_90.manager_insert', result, true);
end
$$;

-- --- THE DEACTIVATED ACCOUNT MANAGER -------------------------------------------
set local request.jwt.claims = '{"sub":"e3900000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
declare
  seen integer;
begin
  select count(*) into seen from public.client_notes where client_id = 'e3901000-0000-4000-8000-000000000001';
  perform set_config('p3_90.inactive_seen', seen::text, true);
end
$$;

reset role;

do $$
declare
  s text;
begin
  -- THE CONTROL FIRST: without it, refusals would pass on a shim where nobody can
  -- read or write anything.
  if current_setting('p3_90.owner_seen') <> '1' then
    raise exception 'P3-90: the owner reads % notes, expected the 1 written before', current_setting('p3_90.owner_seen');
  end if;
  select created_by::text into s from public.client_notes where id = 'e3902000-0000-4000-8000-000000000002';
  if s is distinct from 'e3900000-0000-4000-8000-000000000001' then
    raise exception 'P3-90: the owner''s note was stored with author %, expected the owner', coalesce(s, 'none');
  end if;

  if current_setting('p3_90.owner_spoof') <> 'refused' then
    raise exception 'P3-90: the owner stored a note under another person''s name';
  end if;
  if current_setting('p3_90.owner_empty') <> 'refused' or current_setting('p3_90.owner_blank') <> 'refused' then
    raise exception 'P3-90: an empty or blank note was stored (empty %, blank %)',
      current_setting('p3_90.owner_empty'), current_setting('p3_90.owner_blank');
  end if;
  if current_setting('p3_90.owner_update') <> 'refused' then
    raise exception 'P3-90: a note was updated';
  end if;
  if current_setting('p3_90.owner_delete') <> 'refused' then
    raise exception 'P3-90: a note was deleted';
  end if;

  if current_setting('p3_90.manager_seen') <> '2' then
    raise exception 'P3-90: an active account manager reads % notes, expected 2', current_setting('p3_90.manager_seen');
  end if;
  if current_setting('p3_90.manager_insert') <> 'refused' then
    raise exception 'P3-90: an account manager added a note';
  end if;
  if current_setting('p3_90.inactive_seen') <> '0' then
    raise exception 'P3-90: a deactivated profile reads % notes', current_setting('p3_90.inactive_seen');
  end if;

  -- The refused writes wrote nothing and the first note is as written.
  select string_agg(body, '|' order by body) into s
  from public.client_notes where client_id = 'e3901000-0000-4000-8000-000000000001';
  if s is distinct from 'P3-90 am vorbit la telefon|P3-90 nota de pornire' then
    raise exception 'P3-90: the notes on the client are %', coalesce(s, 'none');
  end if;
end
$$;

rollback;
