-- assertions/0061_supplier_unit_aliases.sql
-- Card P3-102, Ivan's finding F23, goal G59. public.supplier_unit_aliases exists
-- with its six columns, its index and its two filled-key checks; an active profile
-- reads the aliases and writes one as itself, a deactivated one reads none; nobody
-- updates or deletes an alias; and the table carries no conversion factor and
-- cannot be made to. Ruling R-062.
--
-- WHAT THIS FILE CANNOT PROVE, SAID HERE SO NOBODY READS IT AS PROVEN. It runs on
-- a bare postgres with a shim for auth, so it proves what the policies SAY when
-- postgres evaluates them, not that the database API asks postgres the same
-- question with a real token. That half is
-- tests/e2e/extraction-units-and-zero-line.spec.ts, against a real local Supabase
-- stack.

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
  where table_schema = 'public' and table_name = 'supplier_unit_aliases';
  if s is distinct from
     'id:uuid:NO|supplier_key:text:NO|unit_raw_key:text:NO|unit:USER-DEFINED:NO|created_by:uuid:YES|created_at:timestamp with time zone:NO' then
    raise exception 'P3-102: public.supplier_unit_aliases columns are %', coalesce(s, 'missing');
  end if;

  -- THE UNIT COLUMN IS THE ENUM, not free text. A word nothing offers cannot be
  -- remembered as a unit, which is the whole reason the enum exists.
  select t.typname into s
  from information_schema.columns c
  join pg_type t on t.typname = c.udt_name
  where c.table_schema = 'public' and c.table_name = 'supplier_unit_aliases' and c.column_name = 'unit';
  if s is distinct from 'unit_code' then
    raise exception 'P3-102: supplier_unit_aliases.unit is of type %, expected unit_code', coalesce(s, 'unknown');
  end if;

  -- NO CONVERSION FACTOR, AND THE SHAPE IS THE PROOF. A column that could hold a
  -- multiplier is the one thing this table must never grow, because a silent
  -- multiplication is the defect 0030 was written against.
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'supplier_unit_aliases'
    and column_name in ('factor', 'multiplier', 'ratio', 'quantity', 'per_unit', 'conversion');
  if n <> 0 then
    raise exception 'P3-102: supplier_unit_aliases grew % conversion-shaped column(s)', n;
  end if;

  select count(*) into n
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'supplier_unit_aliases' and c.relrowsecurity;
  if n <> 1 then
    raise exception 'P3-102: row level security is not enabled on public.supplier_unit_aliases';
  end if;

  -- EXACTLY TWO POLICIES, a select and an insert. An update or delete policy
  -- would make a remembered answer editable history.
  select string_agg(policyname || ':' || cmd, '|' order by policyname) into s
  from pg_policies where schemaname = 'public' and tablename = 'supplier_unit_aliases';
  if s is distinct from 'supplier_unit_aliases_insert:INSERT|supplier_unit_aliases_select:SELECT' then
    raise exception 'P3-102: the policies on public.supplier_unit_aliases are %', coalesce(s, 'none');
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'supplier_unit_aliases'
    and policyname = 'supplier_unit_aliases_select'
    and roles = '{authenticated}'::name[] and qual like '%current_app_role()%';
  if n <> 1 then
    raise exception 'P3-102: supplier_unit_aliases_select is not a select to authenticated requiring current_app_role(), as clients_select';
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'supplier_unit_aliases'
    and policyname = 'supplier_unit_aliases_insert'
    and roles = '{authenticated}'::name[]
    and with_check like '%current_app_role()%' and with_check like '%auth.uid()%';
  if n <> 1 then
    raise exception 'P3-102: supplier_unit_aliases_insert is not an insert to authenticated requiring an active profile and the caller as author';
  end if;

  -- The privileges: select and insert for authenticated, nothing for anon.
  select string_agg(grantee || ':' || privilege_type, '|' order by grantee, privilege_type) into s
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'supplier_unit_aliases'
    and grantee in ('anon', 'authenticated');
  if s is distinct from 'authenticated:INSERT|authenticated:SELECT' then
    raise exception 'P3-102: the grants on public.supplier_unit_aliases are %', coalesce(s, 'none');
  end if;

  if to_regclass('public.supplier_unit_aliases_lookup_idx') is null then
    raise exception 'P3-102: the index supplier_unit_aliases_lookup_idx is missing';
  end if;
end
$$;


-- ===========================================================================
-- 2. WHO READS, WHO WRITES
-- ===========================================================================
--
-- Three accounts: the owner, an active account manager and a deactivated account
-- manager. One alias written as the superuser. Each account reads and tries to
-- write as the authenticated role, the way the database API runs a signed-in
-- request; the answers are carried out of the role switch in transaction-local
-- settings.

insert into auth.users (id, email) values
  ('f1020000-0000-4000-8000-000000000001', 'p3-102-owner@rc-inventory.local'),
  ('f1020000-0000-4000-8000-000000000002', 'p3-102-manager@rc-inventory.local'),
  ('f1020000-0000-4000-8000-000000000003', 'p3-102-inactive@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('f1020000-0000-4000-8000-000000000001', 'p3-102-owner@rc-inventory.local', 'owner', true),
  ('f1020000-0000-4000-8000-000000000002', 'p3-102-manager@rc-inventory.local', 'account_manager', true),
  ('f1020000-0000-4000-8000-000000000003', 'p3-102-inactive@rc-inventory.local', 'account_manager', false);

insert into public.supplier_unit_aliases (id, supplier_key, unit_raw_key, unit, created_by) values
  ('f1021000-0000-4000-8000-000000000001', 'test p3-102 furnizor', 'cutie', 'pcs',
   'f1020000-0000-4000-8000-000000000001');

set local role authenticated;

-- --- THE OWNER ---------------------------------------------------------------
set local request.jwt.claims = '{"sub":"f1020000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
declare
  seen   integer;
  result text;
begin
  select count(*) into seen from public.supplier_unit_aliases where supplier_key = 'test p3-102 furnizor';
  perform set_config('p3_102.owner_seen', seen::text, true);

  -- An alias with no author sent: the default fills in the caller.
  insert into public.supplier_unit_aliases (id, supplier_key, unit_raw_key, unit) values
    ('f1021000-0000-4000-8000-000000000002', 'test p3-102 furnizor', 'bax', 'pcs');

  -- An alias claiming somebody else as author.
  result := 'yes';
  begin
    insert into public.supplier_unit_aliases (supplier_key, unit_raw_key, unit, created_by) values
      ('test p3-102 furnizor', 'colet', 'pcs', 'f1020000-0000-4000-8000-000000000002');
  exception when insufficient_privilege then result := 'refused';
  end;
  perform set_config('p3_102.owner_spoof', result, true);

  -- An empty key and a key of spaces and a line break.
  result := 'yes';
  begin
    insert into public.supplier_unit_aliases (supplier_key, unit_raw_key, unit) values
      ('test p3-102 furnizor', '', 'pcs');
  exception when check_violation then result := 'refused';
  end;
  perform set_config('p3_102.owner_empty', result, true);
  result := 'yes';
  begin
    insert into public.supplier_unit_aliases (supplier_key, unit_raw_key, unit) values
      (E'  \n ', 'cutie', 'pcs');
  exception when check_violation then result := 'refused';
  end;
  perform set_config('p3_102.owner_blank', result, true);

  -- A word nothing offers cannot be remembered as a unit.
  result := 'yes';
  begin
    insert into public.supplier_unit_aliases (supplier_key, unit_raw_key, unit) values
      ('test p3-102 furnizor', 'galeata', 'galeata');
  exception when invalid_text_representation then result := 'refused';
  end;
  perform set_config('p3_102.owner_bad_unit', result, true);

  -- Not even the owner edits or deletes an alias.
  result := 'yes';
  begin
    update public.supplier_unit_aliases set unit = 'kg'
    where id = 'f1021000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then result := 'refused';
  end;
  perform set_config('p3_102.owner_update', result, true);
  result := 'yes';
  begin
    delete from public.supplier_unit_aliases where id = 'f1021000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then result := 'refused';
  end;
  perform set_config('p3_102.owner_delete', result, true);
end
$$;

-- --- THE ACTIVE ACCOUNT MANAGER ------------------------------------------------
-- The one who actually confirms supplier documents. It must be able to teach the
-- system a word, which is why the insert policy is not is_owner().
set local request.jwt.claims = '{"sub":"f1020000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$
declare
  seen   integer;
  result text := 'yes';
begin
  select count(*) into seen from public.supplier_unit_aliases where supplier_key = 'test p3-102 furnizor';
  perform set_config('p3_102.manager_seen', seen::text, true);
  begin
    insert into public.supplier_unit_aliases (supplier_key, unit_raw_key, unit) values
      ('test p3-102 furnizor', 'set', 'set');
  exception when insufficient_privilege then result := 'refused';
  end;
  perform set_config('p3_102.manager_insert', result, true);
end
$$;

-- --- THE DEACTIVATED ACCOUNT MANAGER -------------------------------------------
set local request.jwt.claims = '{"sub":"f1020000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
declare
  seen   integer;
  result text := 'yes';
begin
  select count(*) into seen from public.supplier_unit_aliases where supplier_key = 'test p3-102 furnizor';
  perform set_config('p3_102.inactive_seen', seen::text, true);
  begin
    insert into public.supplier_unit_aliases (supplier_key, unit_raw_key, unit) values
      ('test p3-102 furnizor', 'punga', 'bag');
  exception when insufficient_privilege then result := 'refused';
  end;
  perform set_config('p3_102.inactive_insert', result, true);
end
$$;

reset role;

do $$
declare
  s text;
begin
  -- THE CONTROL FIRST: without it, refusals would pass on a shim where nobody can
  -- read or write anything.
  if current_setting('p3_102.owner_seen') <> '1' then
    raise exception 'P3-102: the owner reads % aliases, expected the 1 written before', current_setting('p3_102.owner_seen');
  end if;
  select created_by::text into s from public.supplier_unit_aliases
  where id = 'f1021000-0000-4000-8000-000000000002';
  if s is distinct from 'f1020000-0000-4000-8000-000000000001' then
    raise exception 'P3-102: the owner''s alias was stored with author %, expected the owner', coalesce(s, 'none');
  end if;

  if current_setting('p3_102.owner_spoof') <> 'refused' then
    raise exception 'P3-102: the owner stored an alias under another person''s name';
  end if;
  if current_setting('p3_102.owner_empty') <> 'refused' or current_setting('p3_102.owner_blank') <> 'refused' then
    raise exception 'P3-102: an empty key was stored (empty %, blank %)',
      current_setting('p3_102.owner_empty'), current_setting('p3_102.owner_blank');
  end if;
  if current_setting('p3_102.owner_bad_unit') <> 'refused' then
    raise exception 'P3-102: a word that is not a unit was stored as one';
  end if;
  if current_setting('p3_102.owner_update') <> 'refused' then
    raise exception 'P3-102: an alias was updated';
  end if;
  if current_setting('p3_102.owner_delete') <> 'refused' then
    raise exception 'P3-102: an alias was deleted';
  end if;

  if current_setting('p3_102.manager_seen') <> '2' then
    raise exception 'P3-102: an active account manager reads % aliases, expected 2', current_setting('p3_102.manager_seen');
  end if;
  if current_setting('p3_102.manager_insert') <> 'yes' then
    raise exception 'P3-102: an active account manager could not remember a unit, and it is the role that confirms documents';
  end if;
  if current_setting('p3_102.inactive_seen') <> '0' then
    raise exception 'P3-102: a deactivated profile reads % aliases', current_setting('p3_102.inactive_seen');
  end if;
  if current_setting('p3_102.inactive_insert') <> 'refused' then
    raise exception 'P3-102: a deactivated profile wrote an alias';
  end if;

  -- The refused writes wrote nothing, and the three that were allowed are there.
  select string_agg(unit_raw_key || '=' || unit::text, '|' order by unit_raw_key) into s
  from public.supplier_unit_aliases where supplier_key = 'test p3-102 furnizor';
  if s is distinct from 'bax=pcs|cutie=pcs|set=set' then
    raise exception 'P3-102: the aliases on the test supplier are %', coalesce(s, 'none');
  end if;
end
$$;

rollback;
