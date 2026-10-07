-- 0076_walkin_manager_client_insert.sql
-- RC Inventory phase 3, card P3-147. The account manager may create a client,
-- so a walk-in buyer can be added on the spot from Iesiri materiale (card
-- P3-119). Owner decision, mailbox answer q143, 2026-10-04: "YES. Account
-- managers may create a new client from a walk-in sale", and no wider than
-- account managers plus the owner, active accounts only.
--
-- Contains no DROP TABLE, no TRUNCATE and no DELETE.
--
-- ONE NEAR-MISS, NAMED RATHER THAN BURIED, as ruling R-031 requires. This file
-- contains a `DROP POLICY`:
--
--     drop policy if exists clients_insert on public.clients;
--
-- It removes a rule about rows and no row. It is created again with the same
-- name, the same command and the same role in the same transaction, the shape
-- 0012 and 0055 already use. A policy is REPLACED, never edited, so there is no
-- other way to change one.
--
-- ===========================================================================
-- WHAT WAS BROKEN
-- ===========================================================================
--
-- clients_insert, from migration 0013, checks is_owner(). Card P3-119 put a
-- '+ Client nou' button on the walk-in form so the operator at the counter can
-- add the buyer standing in front of them. The operator at the counter is the
-- account manager, and for that role the button was hidden and the insert was
-- refused, so the walk-in sale could not be recorded for a first-time buyer.
--
-- ===========================================================================
-- WHAT CHANGES, AND WHAT DOES NOT
-- ===========================================================================
--
--   policy  clients_insert  was: public.is_owner()
--                           now: public.current_app_role() in ('owner', 'account_manager')
--
-- THE PREDICATE IS THE ONE 0055 ALREADY USES. public.current_app_role(), from
-- 0001 section 6, returns profiles.role only when profiles.active is true and
-- null otherwise, so a switched-off account and an account with no profile are
-- refused exactly as before. The two roles are NAMED rather than written as
-- `is not null`, so a third role added to app_role later does not inherit this
-- grant without somebody deciding it.
--
-- NOT CHANGED, and deliberately:
--   - clients_update stays owner-only. An account manager can create a client
--     and cannot edit, rename or deactivate one, including the one they created.
--   - there is still NO delete policy on public.clients, for any role.
--   - clients_select is untouched (0055: an active profile, any role).
--   - set_client_stage, contacts and client notes keep their own rules. The
--     walk-in form writes only the client row, so it needs none of them.
--
-- The application keeps the Clienti screen, the lead form and both imports
-- owner-only. Only the walk-in action in lib/data/client-actions.ts accepts the
-- account manager, and it sends name, type, IDNO and phone, nothing else.
--
-- ===========================================================================
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. The owner approves
-- the merge first (mailbox, card P3-147).
--
-- IT RUNS AS ONE TRANSACTION and IS safe to run twice: `drop policy if exists`
-- then `create policy`.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres and then runs
-- scripts/poc-free/local-db/assertions/0076_walkin_manager_client_insert.sql,
-- and against a real local Supabase stack by the P3-147 case of
-- tests/e2e/outbound-direct-client.spec.ts.

begin;

drop policy if exists clients_insert on public.clients;

create policy clients_insert on public.clients
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'account_manager'));

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect three policies on public.clients: clients_insert,
-- INSERT, {authenticated}, with a with_check naming current_app_role() and both
-- roles; clients_select as 0055 left it; clients_update still is_owner() on both
-- sides. And no DELETE policy.

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'clients'
order by policyname;
