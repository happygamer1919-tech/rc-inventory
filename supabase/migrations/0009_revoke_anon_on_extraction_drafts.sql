-- 0009_revoke_anon_on_extraction_drafts.sql
-- RC Inventory phase 2, card P2-08a. A correction to 0008.
--
-- Applied by EXECUTOR under ruling R-012. Runs as one transaction.
-- Contains no DROP, no TRUNCATE and no DELETE. REVOKE only.
--
-- THE DEFECT, AND HOW IT WAS FOUND. Migration 0008 created
-- extraction_drafts and extraction_draft_lines, and the phase 3 post-check
-- required by CLAUDE.md 8.5 reported that `anon` holds SELECT on both. Every
-- other table in this schema grants `anon` nothing at all, which the CRITIC
-- verified at the wave 1 boundary and which was re-verified read-only earlier
-- today as part of the G2 gate audit: anon held SELECT on zero of eleven
-- tables. 0008 made that twelve-of-thirteen instead of thirteen-of-thirteen.
--
-- WHY IT HAPPENED. Supabase grants table privileges to `anon` and
-- `authenticated` AT CREATE TABLE TIME, from project-level default privileges
-- that predate every migration in this repository. Migration 0001 knew that and
-- said so in as many words, then revoked `anon` explicitly:
--
--     -- Deny by default, then grant. Supabase grants table privileges to anon
--     -- and authenticated at CREATE TABLE time; anon is revoked here
--     -- explicitly rather than assumed absent.
--     revoke all on all tables in schema public from anon;
--
-- That statement ran once, in 0001, against the tables that existed then. It is
-- not a policy and it does not apply to tables created afterwards. 0008 created
-- two tables and did not repeat it.
--
-- WHAT WAS AND WAS NOT AT RISK. Nothing leaked. RLS is enabled on both tables
-- and every policy on them is `to authenticated`, so an anonymous request
-- matches no policy and returns zero rows regardless of the grant. PostgreSQL
-- checks the GRANT first and RLS second, and the second check was holding.
--
-- But the whole point of revoking `anon` is that it is the FIRST of the two,
-- and a table protected by one layer where every sibling has two is protected
-- less. It also made the schema inconsistent in a way that reads as deliberate
-- to whoever looks next.
--
-- 0008 is already applied and is never edited, per CLAUDE.md 8.1. A correction
-- is a new numbered file, and this is it.
--
-- THE DURABLE FIX IS THE DEFAULT PRIVILEGE, NOT THE REVOKE. The revoke below
-- fixes the two tables that exist. The `alter default privileges` statement
-- after it is what stops the next CREATE TABLE from reintroducing this, which
-- is the same reasoning 0005 used when it set default privileges for
-- service_role and authenticated instead of only granting on the tables that
-- existed at the time.

begin;

-- The two tables that exist now.
revoke all on public.extraction_drafts      from anon;
revoke all on public.extraction_draft_lines from anon;

-- Belt and braces for anything 0001's one-time statement also missed.
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;

-- And the part that makes it stay fixed: every table created in this schema
-- from now on starts with anon holding nothing.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon;

alter default privileges for role postgres in schema public
  revoke all on functions from anon;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect 13 rows, anon_can_read false on every one.

select
  c.relname as table_name,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_can_read,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_can_read
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
