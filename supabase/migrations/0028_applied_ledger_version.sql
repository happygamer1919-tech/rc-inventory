-- 0028_applied_ledger_version.sql
-- RC Inventory phase 3, card P3-11e. The applied ledger version, readable by the
-- health route.
--
-- WHY IT IS A FUNCTION AND NOT A VIEW OR AN EXPOSED SCHEMA.
--
-- The health route must report which migration version is APPLIED, and only the
-- database knows that: the repository says what SHOULD be applied, and the
-- difference between those two is the whole class of defect INC-06 belongs to.
--
-- supabase_migrations is not exposed through PostgREST and MUST NOT BE. Exposing
-- a schema to read one number would make every table in it reachable forever
-- after. A SECURITY DEFINER function returns exactly one value and nothing else
-- is reachable through it.
--
-- GRANTED TO service_role ONLY, AND THE GRANT IS THE SECURITY BOUNDARY.
--
-- anon and authenticated get nothing. The health route is public but it calls
-- this with the service role key, server side, and returns only the string. A
-- migration version number is not a secret, but a SECURITY DEFINER function
-- reachable by anon is a permanent question somebody has to keep answering, and
-- the answer here costs nothing.
--
-- REVOKE FROM public FIRST. PostgreSQL grants EXECUTE on a new function to
-- PUBLIC by default, so a bare CREATE FUNCTION plus a GRANT to service_role
-- leaves anon able to call it anyway. The revoke is what makes the grant mean
-- what it says.

begin;

-- plpgsql AND to_regclass, NOT a bare `language sql` SELECT, and the reason is
-- portable proof rather than taste. A `language sql` body is resolved at CREATE
-- time, so the file could not be applied to the bare postgres:16 shim that
-- `npm run check:migrations` runs it against: that shim has no
-- supabase_migrations schema, and every migration in this repository must apply
-- to it UNMODIFIED. A migration that can only be parsed against production is a
-- migration whose first real test is production.
--
-- A MISSING LEDGER AND AN EMPTY ONE BOTH RETURN NULL, and null is read by the
-- caller as "I do not know", never as "none". app/api/health/route.ts reports it
-- verbatim and the applier decides on the commit field, which does not touch the
-- database at all.
create or replace function public.applied_ledger_version()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    return null;
  end if;
  execute 'select max(version)::text from supabase_migrations.schema_migrations'
    into v_version;
  return v_version;
end
$$;

comment on function public.applied_ledger_version() is
  'P3-11e. The highest applied migration version, for /api/health. Read by the applier to prove that a removal migration is not being applied ahead of the deployment that stopped reading what it removes.';

revoke all on function public.applied_ledger_version() from public;
revoke all on function public.applied_ledger_version() from anon;
revoke all on function public.applied_ledger_version() from authenticated;
grant execute on function public.applied_ledger_version() to service_role;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect one row carrying the current highest version, and
-- an ACL that names service_role and neither anon nor authenticated.

select public.applied_ledger_version() as applied_ledger_version;

select
  p.proname,
  p.prosecdef as security_definer,
  pg_catalog.array_to_string(p.proacl, E'\n') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'applied_ledger_version';
