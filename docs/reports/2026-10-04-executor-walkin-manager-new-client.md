# Executor report, card P3-147, 2026-10-04

Role: EXECUTOR. Branch `card/p3-147`, draft PR #413. Owner decision: mailbox answer q143 ("YES. Account managers may create a new client from a walk-in sale", no wider than account managers plus owner, active accounts only).

## What was broken
On Ieșiri materiale, mode "Client direct", the "+ Client nou" button was shown to the owner only (`app/(app)/iesiri/page.tsx`), `createClientRecord` refused every non-owner, and the database policy `clients_insert` (0013) checked `is_owner()`. The operator at the counter is the account manager, so a first-time walk-in buyer could not be recorded.

## What changed
- Migration `supabase/migrations/0069_walkin_manager_client_insert.sql`: `clients_insert` now checks `current_app_role() in ('owner', 'account_manager')`. `current_app_role()` returns null for a switched-off account, so only active accounts pass. DROP POLICY plus CREATE POLICY in one transaction, nothing else. `clients_update` unchanged (owner only), still no delete policy.
- Assertion file `scripts/poc-free/local-db/assertions/0069_walkin_manager_client_insert.sql`.
- `lib/data/client-actions.ts`: new `createWalkInClient` (owner or account_manager; name, type, IDNO, phone). The insert body moved into a non-exported `insertClientRecord`, shared with `createClientRecord`, which keeps its owner check. The Clienți screen, lead form and both imports are therefore not widened.
- `components/outbound/OutboundDirectClientForm.tsx` calls `createWalkInClient`; `app/(app)/iesiri/page.tsx` passes `canCreateClient` for both roles.
- New e2e case in `tests/e2e/outbound-direct-client.spec.ts`: manager creates the buyer, the issue saves, the client row exists and is the issue's client, a PATCH with the manager token changes no row, and /clienti shows no create button to the manager.
- `docs/migrations/APPLY-LOG.md` pending register, board card P3-147.

## Open point for the owner
PR #407 (P3-138) also adds a migration 0069. The applier refuses gaps, so the PR merged second must be renumbered to 0070 first and go green again.

## Local gate set
All exit 0: `npx tsc --noEmit`, `npm run build`, `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`, `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`, board validator. `check:board-edit` passes after the card was flipped with PR evidence. No Docker here: e2e, `check:migrations` and applier proofs run in CI.
