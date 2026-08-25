-- 0005_service_role_grants.sql
-- RC Inventory phase 2, card P2-07. Explicit privileges for service_role.
--
-- Applied by EXECUTOR under ruling R-001. Runs as one transaction.
--
-- WHAT WENT WRONG, because the fix is small and the lesson is not.
--
-- Migration 0001 ends with a grants block that names exactly two roles:
--
--     revoke all on all tables in schema public from anon;
--     grant select, insert, update, delete on all tables in schema public
--       to authenticated;
--
-- It never grants anything to service_role. On the eu-west-1 project that was
-- invisible, because Supabase configures ALTER DEFAULT PRIVILEGES so that every
-- table created there is granted to service_role automatically at CREATE TABLE.
-- The schema worked, and appeared to work because of itself.
--
-- It is not. It worked because of a project-level setting made before any of
-- this code existed. On a fresh local stack, where `supabase db reset` replays
-- the same migrations from empty, the ambient default privileges are not the
-- same, and the seed script failed on the very first write:
--
--     permission denied for table profiles  (42501)
--
-- CI found this on the first run that ever pointed these migrations at a second
-- database. That is precisely why P2-07 replays every migration from empty
-- rather than trusting the one database they were developed against.
--
-- 0001 is already applied and is never edited, per CLAUDE.md 8.1. A correction
-- is a new numbered file, and this is it.
--
-- service_role bypasses RLS, but bypassing row security is not the same as
-- having table privileges: PostgreSQL checks the GRANT first and RLS second.
-- Server-side code that uses the service key needs both.

begin;

-- ===========================================================================
-- 1. EXISTING TABLES AND FUNCTIONS
-- ===========================================================================

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Re-asserted rather than assumed. The same reasoning applies: a schema that
-- depends on privileges granted somewhere else is a schema that behaves
-- differently on the next database it meets.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- anon stays revoked. There is no anonymous access to anything in this system.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;


-- ===========================================================================
-- 2. FUTURE TABLES
-- ===========================================================================
--
-- The grants above cover the eleven tables that exist today. Default privileges
-- cover the ones a later migration adds, so this defect cannot recur at 0006 or
-- 0012 by someone forgetting a grant line.
--
-- `for role postgres` is deliberate: migrations are applied as postgres, both by
-- hand in the SQL editor and by `supabase db reset`, so postgres is the role
-- that will own whatever is created next.

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role, authenticated;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role, authenticated;

alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

commit;


-- ===========================================================================
-- 3. VERIFICATION
-- ===========================================================================
-- Expect 11 rows, every one true in both columns.

select
  c.relname as table_name,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_role_can_read,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_can_read
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
