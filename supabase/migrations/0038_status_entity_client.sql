-- 0038_status_entity_client.sql
-- RC Inventory phase 3, card P3-43. One statement, in a file of its own, for the
-- reason 0015 gives and 0034 repeats.
--
-- WHY THIS IS NOT PART OF 0039. `ALTER TYPE ... ADD VALUE` has one transaction
-- restriction: the new value CANNOT BE USED in the transaction that added it,
-- and `supabase db reset` wraps each FILE in one transaction. 0039 creates
-- public.set_client_stage(), which writes 'client' into
-- public.status_history.entity_type, and public.client_stage_history(), whose
-- SQL body names 'client' and is checked when it is created. Putting this line
-- in 0039 would fail on that second function. 0015 is the precedent: it added
-- 'project' ahead of 0016 for exactly this reason.
--
-- THERE IS NO `begin` IN THIS FILE, deliberately. It is one statement and it is
-- atomic on its own. The applier's enum pre-phase (CLAUDE.md 8.6, ruling R-082)
-- admits a file only if it holds nothing but `ALTER TYPE ... ADD VALUE IF NOT
-- EXISTS` and `SELECT`, and this file is exactly that shape.
--
-- IT REMOVES NO ROW AND CHANGES NO ROW. It adds a label and nothing else. No
-- existing query filters status_history on a NOT IN list, and nothing selects on
-- status_entity by position. PostgreSQL cannot remove an enum value, which is why
-- adding one is a decision rather than a tidy-up: the way back is a new type.
--
-- WHAT IT IS FOR. public.status_history is the append-only record of how a thing
-- got to the status it is in, and it is polymorphic across entity kinds. A
-- client's lifecycle stage (cold lead to client) is the fourth kind, and this is
-- the label that lets a client row be recorded there at all. The owner's
-- handover, part 4.8 line 9: every stage change is recorded with who and when.
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124: there is no later
-- step and no terminal involved.

alter type public.status_entity add value if not exists 'client';


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect four values in declaration order: inbound_order, outbound_issue,
-- project, client.

select e.enumlabel, e.enumsortorder
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public' and t.typname = 'status_entity'
order by e.enumsortorder;
