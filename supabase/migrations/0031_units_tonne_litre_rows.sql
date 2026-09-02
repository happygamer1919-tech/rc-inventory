-- 0031_units_tonne_litre_rows.sql
-- RC Inventory phase 3, card P3-33 (Andre's EXT-04). The rows for t and l.
--
-- WHY THIS IS A SECOND FILE AND NOT THE SECOND HALF OF 0030.
--
-- A newly added enum label cannot be USED in the transaction that added it;
-- PostgreSQL raises 55P04. 0030 adds the labels. This file uses them.
--
-- An explicit `commit` between the two halves of ONE file is not enough, and
-- that was found by running it rather than by reasoning about it: the applier
-- and the Docker shim both feed a migration to `psql`, which honours the commit,
-- while `supabase db reset` wraps EACH FILE in a transaction of its own and
-- swallows it. The first draft passed both proofs and failed the one runner that
-- builds the end-to-end stack.
--
-- Two files are two transactions under all three runners, with no special case
-- anywhere. That is the whole reason for the split.
--
-- on conflict (code) do nothing, so this file is re-runnable against the shim.

begin;

insert into public.units (code, sort_order) values
  ('t', 8),
  ('l', 9)
on conflict (code) do nothing;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect nine rows, with t and l last and in that order.

select code, sort_order from public.units order by sort_order;
