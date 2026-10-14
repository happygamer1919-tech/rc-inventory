# 2026-10-13 executor: outbound reference lock (card P3-274)

Role EXECUTOR. Factory task 284.

## In plain words

A saved slip (ieșire) now keeps its number, its issue date and its pickup date.
Before this, anyone with an account could change them by sending a request
straight to the database, around the screens, even on a slip already shipped
and invoiced. A changed number would show on the invoice and push the next slip
number forward. No screen edits these fields, so nothing anyone does today stops
working.

## What changed

- `supabase/migrations/0083_outbound_issue_reference_lock.sql`: replaces the body
  of `public.outbound_issues_guard()` with 0082's body word for word plus five
  refusals on UPDATE, for a signed-in caller (owner included), errcode 42501,
  Romanian reasons: reference, issued_at, pickup_date, created_at, id. The
  trigger, the 0067 policies and every function signature are unchanged. A
  server role with no identity is not guarded. No drop, truncate, delete, and no
  row is read or written when it applies.
- `scripts/poc-free/local-db/assertions/0083_outbound_issue_reference_lock.sql`:
  as an account manager with a real role switch and JWT, a change of reference
  and of issued_at is refused on a slip awaiting shipment and on a shipped slip;
  pickup_date, created_at and id are refused; writing the same values back and
  touching updated_at are accepted; ship_outbound_issue still ships with one
  history row; the owner is refused too; a server role can still change the
  reference.
- `docs/migrations/APPLY-LOG.md`: 0083 in the pending register, card de aplicare P3-274.
- Board: card P3-274 on `docs/board/rc-board-phase3.json`, depends on P3-266.
- `docs/LEARNINGS.md`: two entries.

## CI

- Run 38489999101 (head ce3dc1e): red, one case. `tests/e2e/headers.spec.ts` case 5
  failed because 0083 had no APPLY-LOG line (908 passed, 1 failed). A known
  signature in the factory KNOWN-FAILURES. Fixed by adding the pending line.

## Every writer of outbound_issues, checked

- App code (`lib/`, `app/`, `components/`): no `.update()` on the table; it calls
  `create_outbound_issue`, `create_direct_client_issue`, `ship_outbound_issue`.
- `create_outbound_issue` (0067), `create_direct_client_issue` (0081): insert only.
- `outbound_issue_take_stock` (0077), `walkin_lead_becomes_client` (0081): lock
  the row, never update it.
- `ship_outbound_issue` (0082): status and shipped_at only.
- `outbound_issues_set_updated_at`: updated_at only, left free.

So no column but status, shipped_at and updated_at has a legitimate writer after
insert, and pickup_date was locked too. No mailbox question was needed.

## Test

The repo has no end to end or API test for P3-266 (only its assertion file), so
the proof for this card is the assertion file, as for 0082.

## Commands run locally

- Throwaway local postgres (Homebrew; no Docker here), shim + every migration +
  every assertion file. Without 0083: the new assertion red ("outbound_issues_guard
  does not guard reference and issued_at"). With 0083: 83 migrations applied,
  65/65 assertion files passed, the 0082 assertions included.
- `npx tsc --noEmit` 0, `npm run build` 0, `check:card-ids` 0, `check:board-edit`
  0 (after the card flip), `check:unique-ids` 0, `check:open-branch-ids` 0,
  `check:no-destructive-migration` 0 (8 statements, none destructive),
  `check:conflict-residue` 0, `check:categories` 0, `check:ledger-rows` 0,
  `check:no-prod-target` 0, `check:pending-schema-reads` 0,
  `check:removal-safety` 0, `check:assertion-register` 0, board validator 0.
- `npm run check:migrations` itself and the applier proofs need Docker and run
  in CI.

## Left for the owner

The merge. It changes the live database within about two minutes. No row is
read, changed or removed when it applies.
