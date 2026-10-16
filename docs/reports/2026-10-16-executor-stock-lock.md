# 2026-10-16 EXECUTOR report: stock grows only through reception (P3-312)

Role: EXECUTOR. Card: P3-312 (phase 3 board, authored in this pull request, id from `npm run id:free`; P3-311 was held locally by another worker). Branch `card/p3-312`, pull request #538.

## In plain words

Until now, someone who knew how to send a request straight to the database could add stock without a delivery, make an order line bigger before it was received, or save an order as already delivered, in someone else's name and with any total. After this change, stock goes up only when an order is received on screen, and only by what was ordered. An order is saved only from the order screen or the draft confirmation, always waiting for delivery, in the name of the person saving it, with its total worked out from its lines. People using the screens notice nothing. Merging changes the live database (migration 0087), so it waits for the owner's OK.

## Source

Fable bug check build-20261016T173339497Z (2026-10-16 17:33Z), findings 0 (HIGH), 1 and 2, as quoted in the factory task (the check file itself sits outside this worker's folders and could not be opened):

- 0: 0073 `batches_insert with check (current_app_role() is not null)` lets any active account POST a batch for any pending order line and quantity, so stock rises with no delivery.
- 1: 0086 reopened `order_lines_insert/update` to every active account, and reception copies `ol.quantity` into stock.
- 2: `inbound_orders_guard` is BEFORE UPDATE only; an insert must be pending, with no arrived_at, created_by the caller, and the total the screen computes.

## What was built

- `supabase/migrations/0087_stock_only_through_reception.sql`
  - `batches_insert` dropped and created again: `current_app_role() is not null` AND the transaction-local flag `rc.inbound_receive` equal to the batch's order. `batches_update` dropped and not created again.
  - `order_lines_insert` dropped and created again: `current_app_role() is not null` AND the flag `rc.inbound_lines` equal to the line's order AND that order is `pending_arrival`. `order_lines_update` dropped and not created again.
  - `create_inbound_order` and `confirm_extraction_draft`: the 0084 bodies word for word, plus the total computed in SQL (quantity times `products.unit_value_mdl`, rounded to 2, the sum both screens compute; `p_total_mdl` stays in the signature and is not stored), the flag `rc.inbound_create` (the reference) around the order insert and `rc.inbound_lines` (the order id) around the lines insert.
  - `receive_inbound_order`: the 0086 body, with the `rc.inbound_receive` pair moved to cover the batches insert as well as the status update.
  - `inbound_orders_guard` now BEFORE INSERT OR UPDATE. On INSERT, for a signed-in caller: an empty created_by is filled with the caller, anyone else is refused; status must be pending_arrival with no arrival date; the row must be written by one of the two order functions. 42501 with a Romanian sentence each. The UPDATE half is 0086 word for word. A caller with no identity (service role, seeds, extraction callback) is not guarded.
  - Every function keeps its signature and stays SECURITY INVOKER. No DROP TABLE, TRUNCATE or DELETE; no row read or changed when it applies.
- `scripts/poc-free/local-db/assertions/0087_stock_only_through_reception.sql`: the shape (three policies on each table, no update policy, the flag in each insert policy, the trigger on insert and update, signatures, grants), then with a real role switch and JWT: an account manager creates an order (a forged total of 999999 is stored as the computed 40), receives it (one batch of 4, a second call is a no-op), confirms a draft (pending, one line, 40), and no flag is left set afterwards. Then every direct door: a batch on a pending line, the same with the flag naming another order, a batch update, a line insert, a line update, a line on an arrived order with the flag naming it, an arrived order, an order in the owner's name, a pending order outside the functions, a forged flag with another number. All refused or zero rows, for the manager and for the owner. A server role still writes an arrived order. The product's stock ends at exactly 4.
- `tests/e2e/stock-only-through-reception.spec.ts`: the same doors through PostgREST with real tokens, for an account manager and an owner, each with a witness through the app's functions.
- Specs changed because they used the door this closes: `inbound-active-account`, `outbound-lines-deactivated` (witnesses now through the functions, active-account direct writes now expected refused), `materials-export`, `stock-threshold-preview`, `materials-import` (stock seeds now call `create_inbound_order` and `receive_inbound_order` with the owner token).
- Assertions 0073 and 0086: batches and order_lines now have three policies; the "bare true" regex no longer counts `current_setting(name, true)`. Each change names P3-312.
- `docs/migrations/APPLY-LOG.md`: pending line for 0087. `docs/LEARNINGS.md`: three entries.
- Board: P3-312 authored and shipped with evidence in this pull request.

## Every writer read

grep of `supabase/migrations`, `lib/`, `app/`, `components/`, `scripts/` and `tests/` for batches, order_lines and inbound_orders:

- batches: only `receive_inbound_order` inserts (flagged here). Nothing updates a batch.
- order_lines: only `create_inbound_order` and `confirm_extraction_draft` insert (flagged here). Nothing updates a line; the screens only read lines.
- inbound_orders: the same two functions insert (flagged here); `receive_inbound_order` the status change (unchanged rule); `uploadOrderDocument` and `confirmExtractionDraft` PATCH document and supplier reference columns (not guarded, unchanged). `app/api/**` touches none of the three.
- Test seeds: service role everywhere except the three specs above, which used the owner token.

## Defaults applied

- The brief called `receive_inbound_order` SECURITY DEFINER. It is SECURITY INVOKER (0003, 0084, 0086), so dropping `batches_insert` would have broken reception. The policy keeps `current_app_role()` and adds the flag.
- A direct order insert is refused for a signed-in caller unless the two order functions write it: lines can only come from those functions, so a bare order could never carry a line anyway.

## Not changed, for the record

- `batches_delete` and `order_lines_delete` stay owner only (`is_owner()`). An owner deleting a batch lowers stock; that is a different question from adding stock and was not in the findings.

## Commands run

- Migration check: this machine has no Docker, so `npm run check:migrations` cannot run here. The same files were applied in the same order, with ON_ERROR_STOP, to a throwaway Homebrew postgres: 87 migrations applied, 69 assertion files passed. Red first: with 0087 left out (shape block skipped), the new assertion fails, the forged total 999999 is stored and the pending order gains a second line and a quantity of 200000. CI runs the real check.
- `npx tsc --noEmit`: exit 0.
- `npm run build`: exit 0.
- `npm run check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration` (1 file, 23 statements, no DROP TABLE, TRUNCATE or DELETE), `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`: all exit 0.
- `npm run check:board-edit`: exit 0 once the card is shipped in this pull request (it refused, correctly, while the card was in flight).
- Board validator on all three boards: exit 0 before every commit.
- End to end specs and both applier proof steps: CI only (they need the Supabase stack).

## Left for the owner

Merging #538 applies 0087 to the production database within about two minutes. It changes rules about who may write rows; it changes and removes no row.
