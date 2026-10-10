# P3-260 Comenzi: unknown project or client in the address

Role: EXECUTOR. Branch: card/comenzi-unknown-filter-id.

## What changed for Rapid Construct
A link to the orders list for a project or client that no longer exists now says so and shows no outbound rows, instead of listing every outbound order.

## Change
- `app/(app)/comenzi/page.tsx`: a requested `proiect` or `client` that is not a uuid (`looksLikeUuid`) or resolves to no record sets `missingFilter`. The outbound read is skipped (zero rows, total 0, page 1). A valid id behaves as before.
- `components/orders/OrdersScreen.tsx`: new prop `missingFilter`. Shows `outbound-missing-filter` with the Romanian message and keeps the existing `orders-clear-filter` button. The P3-188 message and the no-filter message are not shown in this state. Inbound is unchanged.
- `tests/e2e/outbound-direct-client.spec.ts`: new case for `?proiect=<zero uuid>`, `?proiect=abc`, `?client=<zero uuid>`, `?client=abc`, plus a valid client link.
- `docs/board/rc-board-phase3.json`: card P3-260.

## Local gates (all exit 0)
tsc, build, validator, check:card-ids, check:unique-ids, check:open-branch-ids, check:no-destructive-migration, check:conflict-residue, check:categories, check:ledger-rows, check:no-prod-target, check:pending-schema-reads, check:removal-safety, check:assertion-register. check:board-edit reports "not a pull request" before the first commit. The e2e case needs Supabase and runs only in CI.

No migration.
