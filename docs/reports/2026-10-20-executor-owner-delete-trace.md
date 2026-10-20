# 2026-10-20 EXECUTOR report: no direct deletes on stock tables (P3-326)

Role: EXECUTOR. Card: P3-326 (phase 3 board, authored in this pull request, id from `npm run id:free`). Branch `card/p3-326`.

## In plain words

Until now the owner account, by sending a request straight to the database instead of using the screens, could remove a sold line from a delivery slip, a received delivery, an order line or a whole order. Removing a sold line put its quantity back into stock, and nothing anywhere recorded that it happened. After this change nobody, the owner included, can delete those records that way. A mistake is still handled the way it is today, by cancelling on screen. People using the screens notice nothing. Merging changes the live database (migration 0088), so it waits for the owner's OK.

## Source

Fable bug check build-20261020T145752334Z (2026-10-20 14:57Z), finding 3 (zero based), medium: 0001's `outbound_lines_delete` on `is_owner()` was never replaced (0070, 0075 and 0087 kept it). Available stock is batches minus outbound lines (`product_available_stock`, 0004), so an owner DELETE on `/rest/v1/outbound_lines` raises stock with no history row and no trace on the slip. `batches_delete`, `order_lines_delete` and `inbound_orders_delete` have the same `is_owner()` shape in the other direction.

## Every writer read

grep of `supabase/migrations`, `lib/`, `app/`, `components/`, `scripts/` and `tests/` for a delete on `outbound_lines`, `batches`, `order_lines` and `inbound_orders` (SQL `delete from`, supabase-js `.delete()`, REST `method: "DELETE"`):

- No screen, server action, API route, function or trigger deletes a row of any of the four tables.
- The only `.delete()` calls in `lib/`, `app/` and `components/` are on `deviz_lines`, `documents` and `extraction_draft_lines` (the extraction callback). None of the four.
- `scripts/reset-test-data.sql` deletes from all four. It is not a migration, it is run by hand by the database owner in the SQL editor and bypasses row level security, so this change does not affect it.
- Test seeds write with the service role, which bypasses row level security. No spec deletes from these tables.
- Cascades: `order_lines` cascades from `inbound_orders`, `outbound_lines` from `outbound_issues`. With no delete policy on either parent (0067 already removed the slip's), a signed-in caller cannot reach the cascade.
- "ștergeți rândul" in `lib/data/outbound-actions.ts` is a form row before saving, never a saved line.

So there is no screen path to keep, and no SECURITY DEFINER delete function is added.

## What was built

- `supabase/migrations/0088_no_direct_stock_deletes.sql`: four `drop policy if exists` (`outbound_lines_delete`, `batches_delete`, `order_lines_delete`, `inbound_orders_delete`), none created again. Row level security stays on, so a signed-in DELETE matches no row, the shape 0067 gave `outbound_issues`. No DROP TABLE, TRUNCATE or DELETE; no row read or changed when it applies; safe to run twice.
- `scripts/poc-free/local-db/assertions/0088_no_direct_stock_deletes.sql`: the shape (no DELETE or ALL policy on the four tables or on `outbound_issues`, row level security enabled on each), then with a real role switch and JWT:
  - an account manager creates two orders through `create_inbound_order`, receives one through `receive_inbound_order` (one batch of 10), takes 3 on a slip through `outbound_issue_take_stock` and ships it through `ship_outbound_issue`; then a direct delete of the sale line, the batch, a line and an order each remove no row;
  - the owner takes 2 on their own slip (the screen path still works for the owner), then a direct delete of the shipped sale line (the finding), the batch, the received order's line, the pending order's line, the received order, the pending order and the shipped slip each remove no row;
  - as the superuser, every row is still there and available stock is exactly 10 - 3 - 2 = 5.
- Older assertions that pinned the delete policies on `is_owner()` now expect them gone, each with a note naming 0088: `0070` and `0075` (outbound_lines 3 policies), `0073` (batches 2, outbound_lines 3), `0086` (inbound_orders 3, order_lines 2, reminders unchanged at 4), `0087` (batches and order_lines 2 each).
- `docs/migrations/APPLY-LOG.md`: pending line for 0088. `docs/LEARNINGS.md`: two entries.
- Board: P3-326 authored and shipped with evidence in this pull request.

## Defaults applied

- No REVOKE of the DELETE privilege: 0067 and 0087 removed rights by dropping the policy with row level security left on, and this file follows them. A direct DELETE therefore answers with an empty result rather than an error; the assertion reads it as a row count of 0 and then checks the row is still there.
- `reminders_delete` stays owner only: reminders hold no stock and were not in the finding.

## Commands run

- Migration check: this machine has no Docker, so `npm run check:migrations` cannot run here. The same files were applied in the same order, with ON_ERROR_STOP, to a throwaway Homebrew postgres: 88 migrations applied, 70 assertion files passed (baseline on main before the change: 87 and 69). Red first, with 0088 left out: the new assertion fails on its shape ("public.outbound_lines has a delete policy"), and with the shape block removed it fails on behaviour ("case o_outbound_line deleted 1 row(s) by a direct request"), after every screen path witness had already passed. CI runs the real check.
- `npx tsc --noEmit`: exit 0.
- `npm run build`: exit 0.
- `npm run check:no-destructive-migration`: OK, 1 file, 8 statements, no DROP TABLE, TRUNCATE or DELETE.
- `npm run check:card-ids`, `check:board-edit`, `check:unique-ids`, `check:open-branch-ids`, `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`: all exit 0.
- Board validator on all three boards: exit 0 before every commit.
- End to end specs and both applier proof steps: CI only (they need the Supabase stack).

## Left for the owner

Merging this pull request applies 0088 to the production database within about two minutes. It takes the delete right on four tables away from the owner account; it changes and removes no row.
