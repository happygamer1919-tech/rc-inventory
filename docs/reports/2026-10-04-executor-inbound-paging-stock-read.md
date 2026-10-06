# EXECUTOR report: P3-178, inbound orders paging, stock read beside the catalog, paged reads while colleagues save

Role EXECUTOR. Run date 2026-10-06 (file name keeps the 2026-10-04 date the brief named, the day of the bug check).
Branch `card/inbound-paging-stock-read`, cut from origin/main at bd7d2f0 (P3-136 present).

## In plain words

- Comenzi and the home screen's pending arrivals now show every inbound order, also past 1000. Before, the oldest dropped off with no message.
- The product list, the home screen and the product pickers load the stock and the catalog at the same time again, one database round trip less. Stock numbers do not change.
- Long stock reads no longer count a row twice when a colleague saves while the list is being read.

## Card

`npm run id:free -- P3-152` said P3-152 is taken and named the id right after P3-176. Pull request #450 (another terminal) opened with that id a minute after the check, before this branch was pushed, so the card was renamed to P3-178, the next id `id:free` named, and the local commits were redone under it. Depends on P3-136 (speed card) and P3-162 (the tasks paging card from task 146).

## What changed

1. `lib/data/inbound.ts` `listInboundOrders` calls `readInboundOrderRows` in the new `lib/data/inbound-read.ts`, which reads through `readAllPages` (page size 500), ordered `created_at desc`, then `id desc` as the tie breaker. A count that changes between pages, a missing count or an empty page before the total stays the visible error `readAllPages` raises for every other caller ("log it the way the other callers do"). Error text keeps the old prefix "Nu s-au putut citi comenzile de intrare".
2. `lib/data/products.ts` `listProducts` uses `readCatalogWithStock` in the new `lib/data/catalog-read.ts`: the catalog read and the stock read go into one `Promise.all`. The stock read for the pickers (active only) truly needed the catalog's ids, so per the default it now reads **by the same filter instead of by the id list**: `readQuantityRows` with scope `"active"` selects `products!inner(active)` and filters `products.active = true`. `batches` and `outbound_lines` each have exactly one foreign key to `products` (0001), so the embed is not ambiguous. The full Inventar read (not active only) reads all stock rows, as before. `stockByProduct` accepts `"active"` beside an id list.
3. Paged reads of batches and sale lines (`lib/data/stock-read.ts`): **cause confirmed on origin/main, and it is not an unstable order.** `readQuantityRows` already ordered by `id`, which is unique, so ties could not swap between pages. The remaining cause is position paging (`.range`) over rows that change, with random uuid ids: a row saved between two pages that sorts before the read position pushes the last row of the previous page onto the next page. If only rows are added, the total changes and `readAllPages` raises a visible error. If one row is added and one removed in the same window, the total is unchanged: one row is read twice (stock counted twice) and one row is skipped. Fix: `dedupeById` (in `lib/data/id-list.ts`) keeps the first row of each id, applied to the stock read and the inbound read. Every paged read touched here orders by its sort column plus `id` last.

**What remains possible:** in the add-plus-remove window above, one row can still be skipped; position paging cannot recover it. Closing it fully needs reading by key (`id > last id`) instead of by position, a change to `readAllPages` that this card did not take. The app has no path that deletes batches or outbound lines today (test data is cancelled, not deleted), so the window needs an outside delete.

Not changed: P3-136 numbers, tasks paging (P3-162) and P3-124, routes, the hasPhase3Schema gate, the `lead=` PageHeader prop, handoff Part 6 defects. No migration. No UI text.

## Specs

New `tests/e2e/inbound-paging-stock-read.spec.ts` (no database, no browser):
- 1200 inbound orders under a 1000-row cap come back as 1200, in three pages `[0,499] [500,999] [1000,1499]`, ordered `created_at desc, id desc`.
- `listInboundOrders` goes through `readInboundOrderRows` (source check, products.ts and inbound.ts are server-only and cannot be imported in a spec).
- Catalog and stock reads both start before either resolves (deferred promises), for active-only and full reads; `listProducts` uses `readCatalogWithStock`.
- Batches and outbound_lines are ordered by `id` last; an add plus a remove between pages gives no duplicate row.
- The active-only stock read uses `products!inner(active)` and `products.active = true`.

Test fakes in `stock-read-paging.spec.ts` and `list-paging.spec.ts` got a pass-through `eq` (the type gained the method); no assertion changed.

## Commands run locally

- Specs (temporary config without database or web server, not committed): inbound-paging-stock-read, stock-read-paging, list-paging, tasks-list-paging: 23 passed.
- `npx tsc --noEmit` exit 0. `npm run build` exit 0.
- `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`, `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`: all OK.
- `check:board-edit` refused while the card was in_flight (expected), passes after the flip to shipped in this pull request.
- Board validator exit 0 before every commit.
- inbound.spec.ts, inventory-paging.spec.ts, products.spec.ts and dashboard.spec.ts need the local database and run only in CI.

## For the owner

Nothing to do beyond approving the merge. No migration, no change to the live database.
