# EXECUTOR report: P3-266, outbound issue column lock

Date: 2026-10-13. Role: EXECUTOR. Branch: card/p3-266. Factory task 276.

## In plain words

A counter sale can no longer be turned into a project sale, or moved to another
client, by someone sending a request around the screens. Before this, any staff
account could do it, and a retyped counter sale could then be invoiced.

## What changed

- `supabase/migrations/0082_outbound_issue_column_lock.sql`
  - new trigger `outbound_issues_guard` (BEFORE INSERT OR UPDATE on
    `public.outbound_issues`), function `public.outbound_issues_guard()`.
  - `public.ship_outbound_issue(uuid)` replaced in place, same signature: it
    sets the transaction-local flag `rc.outbound_ship` to the slip id around
    its one update.
- `scripts/poc-free/local-db/assertions/0082_outbound_issue_column_lock.sql`:
  the proof, run by `npm run check:migrations`.
- Board: new card P3-266 on `docs/board/rc-board-phase3.json`.
- `docs/migrations/APPLY-LOG.md`: 0082 listed under its card.
- `docs/LEARNINGS.md`: two entries.

## The rules the trigger enforces (signed-in caller, owner included)

- UPDATE: `issue_mode`, `client_id`, `project_id`, `created_by` never change.
  `status` and `shipped_at` change only awaiting_shipment to shipped inside
  `ship_outbound_issue`.
- INSERT: `created_by` must be the caller (an empty one is filled), status
  awaiting_shipment, a project slip has a project and no client or pickup date,
  a walk-in slip has a client and pickup date and no project.
- A caller with no identity (service role, migrations) is not guarded, the
  convention of 0075 and 0077.

## Legitimate paths checked

Every writer of `outbound_issues` was read: `create_outbound_issue` (0067) and
`create_direct_client_issue` (0081) insert rows the guard accepts;
`outbound_issue_take_stock` (0077) and `walkin_lead_becomes_client` (0081) lock
the row and never update it; `ship_outbound_issue` is the one status change and
now carries the flag. The app (`lib/data/*`) only reads the table and calls the
RPCs. No e2e spec PATCHes the table as a user; `tests/e2e/walkin-buyer-lead.spec.ts`
POSTs a slip the guard accepts.

## Not changed

outbound_issues and outbound_lines policies, invoice functions 0074 and 0078,
the screen gate, the hasPhase3Schema gate.

## Commands run locally

- Throwaway local postgres (Homebrew; no Docker here), shim + 82 migrations + 64
  assertion files: all green. With 0082 set aside: the new assertion red
  ("expected one enabled trigger outbound_issues_guard, found 0").
- `npx tsc --noEmit` 0, `npm run build` 0, `check:card-ids` 0, `check:board-edit`
  0, `check:unique-ids` 0, `check:open-branch-ids` 0,
  `check:no-destructive-migration` 0 (15 statements, none destructive),
  `check:conflict-residue` 0, `check:categories` 0, `check:ledger-rows` 0,
  `check:no-prod-target` 0, `check:pending-schema-reads` 0,
  `check:removal-safety` 0, `check:assertion-register` 0, board validator 0.
- `npm run check:migrations` itself and the applier proofs need Docker and run
  in CI.

## Left for the owner

The merge. It changes the live database within about two minutes. No row is
read, changed or removed when it applies.
