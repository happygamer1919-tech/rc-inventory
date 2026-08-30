-- 0015_status_entity_project.sql
-- RC Inventory phase 3, card P3-03. One statement, and it has its own file for
-- a reason.
--
-- WHY THIS IS NOT PART OF 0016. `ALTER TYPE ... ADD VALUE` is the one DDL
-- statement in this migration set that has a transaction restriction: before
-- PostgreSQL 12 it could not run inside a transaction block at all, and even on
-- 12 and later the new value CANNOT BE USED in the same transaction that adds
-- it. Every other migration here opens with `begin`, so putting this line in
-- 0016 would either fail outright on an older server or work today and fail the
-- first time somebody adds a seed row using the new value.
--
-- P3-03 calls this out in its defaults and says to write it as its own file
-- ahead of the table, so that the restriction is discovered here rather than in
-- the middle of an apply the owner is running.
--
-- THERE IS NO `begin` IN THIS FILE, deliberately. It is one statement and it is
-- atomic on its own.
--
-- IT IS ADDITIVE AND REVERSIBLE ONLY BY REPLACING THE TYPE. No existing row
-- changes, no existing query filters on a NOT IN list, and nothing selects on
-- status_entity by position. PostgreSQL cannot remove an enum value, which is
-- why adding one is a decision rather than a tidy-up: the way back is a new type
-- and a column rewrite.
--
-- WHAT IT IS FOR. public.status_history is the append-only record of how a
-- thing got to the status it is in, and it is polymorphic across entity kinds.
-- Projects have a six-state pipeline that real construction work walks
-- backwards as well as forwards: a contract stalls into suspended, a closed job
-- reopens, an offer becomes a lead again when the client goes quiet. The path
-- taken is worth more than the state landed on, and this is the enum value that
-- lets a project row be recorded in that history at all.
--
-- IT DOES NOT MAKE ANYTHING WRITE THAT HISTORY. See the note at the foot of
-- 0016_projects.sql.
--
-- NOT APPLIED TO PRODUCTION BY THIS PULL REQUEST. The apply is card P3-27.

alter type public.status_entity add value if not exists 'project';


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect three values in declaration order: inbound_order, outbound_issue,
-- project.

select e.enumlabel, e.enumsortorder
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public' and t.typname = 'status_entity'
order by e.enumsortorder;
