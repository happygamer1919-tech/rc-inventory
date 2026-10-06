# Executor report: P3-181, product movement history paged

Role EXECUTOR. Run date 2026-10-06 (file named for the 2026-10-04 bug check, as the brief asked). Factory task 213.

## In plain words

On the product panel, the list of stock arrivals and departures for one product
was read in one go. The database quietly stops at 1000 rows, so for a product
with more than 1000 departures the history could miss rows, maybe the newest,
while the stock number above it was right. Now the history is read page by page
until every row is in, newest first, so it always adds up to the stock figure.
Nothing changes on screen for products under 1000 rows.

## Card

- Id: P3-181 (the brief asked for P3-153, taken; `npm run id:free -- P3-153` named P3-181).
- `depends_on`: P3-136 and P3-178. Task 152 merged as P3-178 (pull request #451) before this branch was cut.
- Branch: `card/product-movements-paging`, from `origin/main` at 171968b.

## Fault, re-checked on origin/main

`lib/data/products.ts`:

- `listProductBatches`: one request for the product's `batches`, ordered by `arrived_at` desc, no paging, error ignored.
- `listProductMovements`: one request each for `batches` and `outbound_lines`, no paging, no order, errors ignored, then `movements.sort((a, b) => b.at.localeCompare(a.at))`.

Confirmed as described in the brief.

## Change

- New `lib/data/movements-read.ts` (client injected, no `server-only`, same shape as `stock-read.ts` and `inbound-read.ts`):
  - `readProductBatches(client, productId, pageSize?)` and `readProductMovements(client, productId, issueSelect, withMode, pageSize?)`.
  - Both read through `readAllPages`, filtered `product_id = productId`, each page ordered by the date column desc then `id` desc, then `dedupeById`.
  - `batches` pages order by `arrived_at`. `outbound_lines` pages order by the line's own `created_at`: the screen's date (`outbound_issues.issued_at`) sits on the embedded parent, and PostgREST does not order parent rows by an embedded column. Page order only has to be stable; the shown order comes from the final sort.
  - Final in-memory sort: newest first, `id` desc as tie breaker, for both functions.
  - The row-to-movement mapping moved here unchanged: same "Recepție", "Ieșire", "Client necunoscut" fallbacks, same "client · proiect" text, same mode logic.
  - `ProductBatch` and `ProductMovement` types moved here; `products.ts` re-exports them, so `product-detail.ts` is untouched.
- `lib/data/products.ts`: both functions now call the new reads. The 0067 gate (`hasOutboundIssueMode`) and the select list it chooses stay in `products.ts` and are passed in, so the pending-schema check still sees the gate beside the column names.
- Count and rows disagreeing: the visible error `readAllPages` already raises for every other caller (brief section 4.3, "the way the other callers do").

## What did not change

Stock numbers (P3-136, `stock-read.ts` untouched), P3-178 code (untouched), routes, the hasPhase3Schema gate, the `lead=` PageHeader prop, handoff Part 6 defects. No migration. No UI string added or changed.

## Specs

`tests/e2e/product-movements-paging.spec.ts`, no database, against a hand-written fake client:

1. 1200 outbound lines over two pages of 1000 (server capped at 1000) plus 3 batches give 1203 movements, all 1200 lines present, newest first, other products' rows excluded, order `created_at desc, id desc` on lines and `arrived_at desc, id desc` on batches.
2. A server that cuts below the page size (300) loses no rows.
3. `readProductBatches` reads 25 batches in pages of 10, ordered `arrived_at desc, id desc`.
4. A save plus a delete between two pages (total unchanged, the edge row comes back on page 2) gives no duplicate batch.
5. Equal dates give a fixed order by id.
6. Under 1000 rows the texts are the same: "Ion · Santier", direct client "Maria", "Ieșire" without a project, "Recepție" without an order, mode null when the 0067 gate says no.
7. `listProductBatches` and `listProductMovements` source goes through the paged reads, with no direct `.from("batches")` or `.from("outbound_lines")`.

Run locally with a throwaway Playwright config without globalSetup or web servers (not committed): 18 passed (the 7 above plus `inbound-paging-stock-read.spec.ts` and `stock-read-paging.spec.ts`).

## Local gates

- `npx tsc --noEmit`: exit 0
- `npm run build`: completed, route table printed
- `npm run check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`, `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`: all OK
- `npm run check:board-edit`: refused while the card was `in_flight`, as designed; re-run after the flip to shipped in this pull request.
- Board validator: exit 0 before every commit.
- The full Playwright suite and the applier proofs need a database and Docker: CI only.

## Left open

- `components/inventory/ProductPanel.tsx` has no `catch` on `loadProductDetail`. Before this card a failed read showed an empty history; now it raises, so in that failure case the panel stays on its loading state. Out of scope, written in `docs/LEARNINGS.md` for a follow-up card.
- Position paging can still skip one row if a colleague saves and deletes in the same moment between two pages (same limit P3-178 names).

## Learnings

Three entries appended to `docs/LEARNINGS.md`.
