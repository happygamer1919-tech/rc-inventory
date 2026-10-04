-- 0069_outbound_lines_active_account.sql
-- RC Inventory phase 3, card P3-138. Found by the bug check of 2026-10-04.
--
-- WHAT IT CHANGES: three row level security policies on public.outbound_lines,
-- select, insert and update, each dropped and created again with the predicate
-- migration 0067 gave public.outbound_issues:
--
--   public.current_app_role() is not null
--
-- current_app_role() is security definer from 0001 and reads public.profiles
-- filtered on p.active, so it returns null for a signed-out caller and for a
-- DEACTIVATED account still holding a valid token. That is the whole fix.
--
-- WHY. 0001 wrote these three policies as `to authenticated using (true)` and
-- `with check (true)`. `authenticated` is a Postgres role and says nothing about
-- public.profiles.active. 0067 closed that door on the issue header and its
-- comment said "A line is reachable only through its issue". It is not: PostgREST
-- exposes public.outbound_lines directly, so a deactivated account could read
-- every line (product, quantity, sale price), insert lines and update them.
--
-- public.outbound_issue_take_stock IS NOT REPLACED, AND STILL REFUSES A
-- DEACTIVATED CALLER AFTER THIS FILE. It is SECURITY INVOKER (0067 section 6), so
-- its `insert into public.outbound_lines` runs under the caller's own policies,
-- and the insert policy below refuses a caller whose current_app_role() is null.
-- The whole call rolls back, history row included, and no stock moves. An early
-- `if public.current_app_role() is null then raise` inside the function was
-- considered and NOT written: scripts/poc-free/local-db/assertions/0067 calls
-- create_outbound_issue and create_direct_client_issue as a superuser with no
-- JWT, where current_app_role() is null, so an explicit refusal would fail that
-- assertion while the policy (which a superuser bypasses) does not. The refusal
-- through a real token is proven in tests/e2e/outbound-lines-deactivated.spec.ts.
--
-- WHAT IT DOES NOT CHANGE:
--   outbound_lines_delete stays 0001's `using (public.is_owner())`. is_owner()
--   is built on current_app_role(), so a deactivated owner already fails it.
--   The outbound_issues policies from 0067 are not touched.
--   No function, no table, no column, no grant.
--
-- WHAT IT REMOVES: no table, no row, no column. There is NO DROP TABLE, NO
-- TRUNCATE, NO DELETE, NO UPDATE and NO INSERT in this file. `drop policy`
-- removes a rule about rows and removes no row (CLAUDE.md 8.6). For an active
-- operator, manager or owner every predicate below is true, exactly as `true`
-- was, so nothing they can do today changes.

begin;

drop policy if exists outbound_lines_select on public.outbound_lines;
create policy outbound_lines_select on public.outbound_lines
  for select to authenticated using (public.current_app_role() is not null);

drop policy if exists outbound_lines_insert on public.outbound_lines;
create policy outbound_lines_insert on public.outbound_lines
  for insert to authenticated with check (public.current_app_role() is not null);

drop policy if exists outbound_lines_update on public.outbound_lines;
create policy outbound_lines_update on public.outbound_lines
  for update to authenticated
  using (public.current_app_role() is not null)
  with check (public.current_app_role() is not null);

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect four policies: delete on is_owner(), and select, insert and update on
-- current_app_role() is not null.

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'outbound_lines'
order by policyname;
