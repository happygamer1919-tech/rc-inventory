# 2026-10-14 EXECUTOR report: P3-305, walk-in slip for a switched-off buyer refused on every door

## In plain words

A counter sale to a customer who was switched off is now refused by the database
whichever way it is attempted. Before this, the screen and its save function refused
it, but a request sent straight to the database could still create the sale and take
the stock. Sales to active customers and project sales work as before.

## What changed

- `supabase/migrations/0085_walkin_direct_insert_inactive_buyer.sql`
  - `public.outbound_issues_guard()`: 0083 body word for word, plus a P0001 refusal on
    INSERT of a `direct_client` slip whose client is not active.
  - `public.outbound_issue_take_stock(uuid, jsonb)`: 0084 body word for word, plus a read
    of `issue_mode` and `client_id` on the locked slip and a P0001 refusal, owner
    included, when the slip is `direct_client` and its client is not active.
  - Same sentence as 0084: "Clientul ales este dezactivat. Alege alt client sau
    reactivează-l din fișa lui."
  - A server role with no identity is not guarded (convention of 0075, 0077, 0082, 0084).
  - No DROP, TRUNCATE, DELETE, UPDATE or row INSERT. Signatures, grants, policies and
    `create_direct_client_issue` unchanged.
- `scripts/poc-free/local-db/assertions/0085_walkin_direct_insert_inactive_buyer.sql`:
  as an account manager, direct INSERT to a switched-off client refused; take stock on
  such a slip refused with no line and no history; direct INSERT and take stock for an
  active client work; `create_direct_client_issue` still works for an active client and
  still refuses a switched-off one; a project slip saves; as the owner take stock on the
  switched-off client's slip is refused.
- `docs/migrations/APPLY-LOG.md`: 0085 pending, card P3-305.
- Board: card P3-305 on phase 3, depends on P3-277.

## Commands run locally (each exit 0)

`npx tsc --noEmit`, `npm run build`, board validator on all three boards,
`check:card-ids`, `check:board-edit`, `check:unique-ids`, `check:open-branch-ids`,
`check:no-destructive-migration` (1 file, 13 statements), `check:conflict-residue`,
`check:categories`, `check:ledger-rows`, `check:no-prod-target`,
`check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`.

## Left to CI

`npm run check:migrations` (the migration and its assertion), both applier proofs and
the end to end suite: this machine has no Docker and no Supabase CLI.
