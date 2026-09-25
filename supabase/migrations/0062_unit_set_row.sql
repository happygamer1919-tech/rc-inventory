-- 0062_unit_set_row.sql
-- RC Inventory phase 3, card P3-102, Ivan's finding F23, goal G59. The row for set.
--
-- WHY THIS IS A SECOND FILE AND NOT THE SECOND HALF OF 0061.
--
-- A newly added enum label cannot be USED in the transaction that added it;
-- PostgreSQL raises 55P04. 0061 adds the label. This file uses it.
--
-- An explicit `commit` between the two halves of ONE file is not enough, and
-- 0030 and 0031 found that by running it rather than by reasoning about it: the
-- applier and the Docker shim both feed a migration to `psql`, which honours the
-- commit, while `supabase db reset` wraps EACH FILE in a transaction of its own
-- and swallows it. That first draft passed both proofs and failed the one runner
-- that builds the end to end stack. Two files are two transactions under all
-- three runners, with no special case anywhere.
--
-- WHAT IT ADDS, AND IT CHANGES AND REMOVES NOTHING
--
--   row   public.units ('set', sort_order 10)   new, last
--
-- NO UPDATE, NO DELETE, NO DROP AND NO TRUNCATE RUN IN THIS FILE. The nine rows
-- already there keep the sort_order they have; the new one goes after them, the
-- way 0031 put t at 8 and l at 9.
--
-- on conflict (code) do nothing, so this file is re-runnable against the shim.

begin;

insert into public.units (code, sort_order) values
  ('set', 10)
on conflict (code) do nothing;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect ten rows, with set last.

select code, sort_order from public.units order by sort_order;
