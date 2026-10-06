-- 0072_batches_status_history_active_account.sql
-- RC Inventory phase 3, card P3-179. Found by the bug check of 2026-10-04.
--
-- WHAT IT CHANGES: four row level security policies, each dropped and created
-- again with the predicate 0067 gave public.outbound_issues and 0070 gave
-- public.outbound_lines:
--
--   public.current_app_role() is not null
--
--   public.batches         batches_select, batches_insert
--   public.status_history  status_history_select, status_history_insert
--
-- current_app_role() is security definer from 0001 and reads public.profiles
-- filtered on p.active, so it returns null for a signed-out caller and for a
-- DEACTIVATED account still holding a valid token. That is the whole fix.
--
-- WHY. 0001 wrote these four policies as `to authenticated using (true)` and
-- `with check (true)`, and no later migration replaced them (grep of 0002 to
-- 0071 for batches_ and status_history_ finds only comments). `authenticated` is
-- a Postgres role and says nothing about public.profiles.active. PostgREST
-- exposes both tables directly, so a deactivated account could insert a batch
-- (stock is batches minus outbound lines, so that raises stock), read every
-- batch, and read or add rows shown under 'Istoricul starilor'. 0070 closed the
-- same door on outbound_lines and its LEARNINGS entry says to check every open
-- policy on the related tables. This is that check.
--
-- EVERY WRITER STILL WORKS FOR AN ACTIVE ACCOUNT. The SQL functions that insert
-- into these tables (0003, 0004, 0010, 0011, 0018, 0021, 0026, 0039, 0040, 0057,
-- 0060, 0067) run either as SECURITY DEFINER, which skips these policies, or as
-- SECURITY INVOKER under the caller's token, where an active operator, manager
-- or owner passes `current_app_role() is not null` exactly as they passed
-- `true`. The extraction callback writes with the service_role key, which
-- bypasses row level security. Applier assertions run as superuser, which
-- bypasses it too.
--
-- WHAT IT DOES NOT CHANGE:
--   batches_update and batches_delete stay 0001's owner-only `public.is_owner()`.
--   is_owner() is built on current_app_role(), so a deactivated owner already
--   fails them.
--   status_history keeps NO update and NO delete policy: append-only by design.
--   inbound_orders, order_lines and reminders still carry 0001's `using (true)`;
--   they are card P3-180, not this file.
--   No function, no table, no column, no grant.
--
-- WHAT IT REMOVES: no table, no row, no column. There is NO DROP TABLE, NO
-- TRUNCATE, NO DELETE, NO UPDATE and NO INSERT in this file. `drop policy`
-- removes a rule about rows and removes no row (CLAUDE.md 8.6). For an active
-- operator, manager or owner every predicate below is true, exactly as `true`
-- was, so nothing they can do today changes.

begin;

drop policy if exists batches_select on public.batches;
create policy batches_select on public.batches
  for select to authenticated using (public.current_app_role() is not null);

drop policy if exists batches_insert on public.batches;
create policy batches_insert on public.batches
  for insert to authenticated with check (public.current_app_role() is not null);

drop policy if exists status_history_select on public.status_history;
create policy status_history_select on public.status_history
  for select to authenticated using (public.current_app_role() is not null);

drop policy if exists status_history_insert on public.status_history;
create policy status_history_insert on public.status_history
  for insert to authenticated with check (public.current_app_role() is not null);

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect on batches four policies: select and insert on current_app_role() is
-- not null, update and delete on is_owner(). Expect on status_history exactly
-- two: select and insert on current_app_role() is not null.

select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('batches', 'status_history')
order by tablename, policyname;
