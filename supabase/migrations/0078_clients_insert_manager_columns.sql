-- 0078_clients_insert_manager_columns.sql
-- RC Inventory phase 3, card P3-255. An account manager creates a client with
-- the name, the type, the IDNO and the phone, and nothing else, whatever sends
-- the row: the table itself refuses the rest, not only the application.
--
-- WHAT FOUND IT. The 2026-10-10 bug check. Migration 0076 widened the policy
-- clients_insert to owner and account_manager with no limit on the columns. The
-- four-field limit lived only in createWalkInClient in lib/data/client-actions.ts,
-- so a POST to /rest/v1/clients with the manager's token could set the stage,
-- the lead owner, the notes, the source, active = false and every other column.
-- The 0076 header says the app sends nothing else; that was true of the app, not
-- of the database.
--
-- WHAT IT ADDS, AND IT REMOVES NOTHING
--
--   function public.clients_insert_manager_columns()   NEW, a trigger function
--   trigger  clients_insert_manager_columns            NEW, BEFORE INSERT
--
-- WHO IT CHECKS. A row inserted by a signed-in account (the database role
-- `authenticated`, which is every request with a user token) that is NOT the
-- owner. The owner inserts exactly as before, every column. The service role and
-- the migrations themselves are not `authenticated` and are not checked, so the
-- test fixtures and any server job keep working.
--
-- WHAT THE ACCOUNT MANAGER MAY SEND, read off createWalkInClient (card P3-147)
-- and insertClientRecord, the only path the app gives that role:
--
--   name, type, fiscal_code (IDNO), phone      any value, as before
--   id                                         any value (a fresh uuid by default)
--   stage                                      'cold' (the default) or 'client':
--                                              the walk-in path writes 'client' in
--                                              the insert itself (card P3-172)
--   address, email, notes                      null, which is what the walk-in
--                                              path sends (an empty box is null)
--   active                                     true
--   created_by                                 null or the caller's own id
--   created_at, updated_at                     the default, now()
--   follow_up_date, source, interest,
--   owner_id, next_action_at, next_action      null, the default
--
-- Anything else is refused with P0001 and a Romanian sentence. Refusing is
-- clearer than quietly resetting a value: a request that asked for something it
-- may not have learns that it did not get it.
--
-- A NEW COLUMN ON public.clients MUST BE DECIDED HERE. The assertion file for
-- this migration lists every column of public.clients and fails when one is
-- added, so the next migration that adds a column cannot pass `quality` without
-- somebody deciding whether an account manager may set it.
--
-- SECURITY INVOKER, ON PURPOSE. The check reads no table, only the new row,
-- auth.uid() and public.is_owner(), which is itself security definer. Under
-- invoker, current_user is the caller's role, which is how `authenticated` is
-- told apart from the service role. Nobody calls the function directly; execute
-- is revoked from public, anon and authenticated, which does not stop the
-- trigger, because PostgreSQL checks EXECUTE on a trigger function only when the
-- trigger is created.
--
-- WHAT IT DOES NOT CHANGE. Every policy on public.clients (clients_insert from
-- 0076, clients_select, clients_update), set_client_stage, contacts and client
-- notes. No existing row is read, changed or cancelled: the trigger fires on
-- INSERT only.
--
-- WHAT IT REMOVES: nothing. There is NO DROP TABLE, NO TRUNCATE, NO DELETE and NO
-- UPDATE or INSERT of a row anywhere in this file. The one
-- `drop trigger if exists` is the re-runnable shape 0063, 0064 and 0078 use,
-- followed immediately by the create.
--
-- MERGE IS APPLY. Merging this file applies it to the PRODUCTION database within
-- about two minutes, through the Supabase GitHub app (CLAUDE.md 8.0, ruling
-- R-124). The deployed build sends only allowed columns for an account manager,
-- so nothing breaks in that window.
--
-- IT RUNS AS ONE TRANSACTION and is safe to run twice. Section 3 checks the
-- result on every run.
--
-- PROVEN BEFORE MERGE by `npm run check:migrations`, which applies it unmodified
-- to a throwaway postgres and runs
-- scripts/poc-free/local-db/assertions/0078_clients_insert_manager_columns.sql,
-- and on the local Supabase stack by
-- tests/e2e/clients-insert-manager-columns.spec.ts.

begin;


-- ===========================================================================
-- 1. THE CHECK
-- ===========================================================================

create or replace function public.clients_insert_manager_columns()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  extra text[] := '{}';
begin
  if current_user <> 'authenticated' or coalesce(public.is_owner(), false) then
    return new;
  end if;

  if new.stage not in ('cold', 'client') then
    extra := extra || 'stage'::text;
  end if;
  if new.address is not null then
    extra := extra || 'address'::text;
  end if;
  if new.email is not null then
    extra := extra || 'email'::text;
  end if;
  if new.notes is not null then
    extra := extra || 'notes'::text;
  end if;
  if new.active is distinct from true then
    extra := extra || 'active'::text;
  end if;
  if new.created_by is not null and new.created_by is distinct from auth.uid() then
    extra := extra || 'created_by'::text;
  end if;
  if new.created_at is distinct from now() then
    extra := extra || 'created_at'::text;
  end if;
  if new.updated_at is distinct from now() then
    extra := extra || 'updated_at'::text;
  end if;
  if new.follow_up_date is not null then
    extra := extra || 'follow_up_date'::text;
  end if;
  if new.source is not null then
    extra := extra || 'source'::text;
  end if;
  if new.interest is not null then
    extra := extra || 'interest'::text;
  end if;
  if new.owner_id is not null then
    extra := extra || 'owner_id'::text;
  end if;
  if new.next_action_at is not null then
    extra := extra || 'next_action_at'::text;
  end if;
  if new.next_action is not null then
    extra := extra || 'next_action'::text;
  end if;

  if cardinality(extra) > 0 then
    raise exception
      'Managerul de cont poate crea un client numai cu denumirea, tipul, IDNO și telefonul. Câmpuri refuzate: %',
      array_to_string(extra, ', ')
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.clients_insert_manager_columns() is
  'P3-255. BEFORE INSERT on public.clients: for a signed-in account that is not the owner (current_user authenticated, is_owner() false), refuses with P0001 a row that sets anything beyond name, type, fiscal_code and phone. Allowed besides: id; stage cold or client (the walk-in path writes client, P3-172); address, email and notes null; active true; created_by null or the caller; created_at and updated_at at their default now(); every lead column null. The owner, the service role and migrations are not checked. 0076 let the account manager insert; this keeps the insert to what createWalkInClient sends.';

revoke all on function public.clients_insert_manager_columns() from public;
revoke all on function public.clients_insert_manager_columns() from anon;
revoke all on function public.clients_insert_manager_columns() from authenticated;


-- ===========================================================================
-- 2. THE TRIGGER
-- ===========================================================================

drop trigger if exists clients_insert_manager_columns on public.clients;
create trigger clients_insert_manager_columns
  before insert on public.clients
  for each row execute function public.clients_insert_manager_columns();


-- ===========================================================================
-- 3. THE RESULT, CHECKED
-- ===========================================================================

do $$
declare
  n integer;
begin
  select count(*) into n
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relname = 'clients'
    and t.tgname = 'clients_insert_manager_columns'
    and not t.tgisinternal
    and t.tgenabled = 'O';
  if n <> 1 then
    raise exception 'P3-255: trigger clients_insert_manager_columns is missing or disabled on public.clients';
  end if;

  if has_function_privilege('authenticated', 'public.clients_insert_manager_columns()', 'EXECUTE')
     or has_function_privilege('anon', 'public.clients_insert_manager_columns()', 'EXECUTE') then
    raise exception 'P3-255: public.clients_insert_manager_columns may be executed directly by a client role';
  end if;
end
$$;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect one row: the trigger, BEFORE INSERT, FOR EACH ROW.

select t.tgname as trigger_name, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace ns on ns.oid = c.relnamespace
where ns.nspname = 'public'
  and c.relname = 'clients'
  and t.tgname = 'clients_insert_manager_columns';
