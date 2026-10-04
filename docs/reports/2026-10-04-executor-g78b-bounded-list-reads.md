# P3-136: bounded list reads (goal G78b)

Role AUTHOR then EXECUTOR, one pull request. Date 2026-10-04.

## In plain words

The product, stock and order lists used to ask the database for every row of a
table and add it up in the application. Two problems with that. It gets slower as
the warehouse grows. And the database cuts any answer at 1000 rows without saying
so, so past 1000 batches the stock figures were quietly wrong. Now these lists keep
asking, page by page, until they have every row, and the category counts are
computed by the database without sending any product rows at all. Tables under 1000
rows cost the same single request as before. Nothing on screen or in an export
changes for the data Rapid Construct has today.

## What was found on origin/main 3b5409d

| Read | file:line (before) | Problem |
|---|---|---|
| Stock sum, batches | `lib/data/products.ts:117` | every batch row, one request, cut at 1000 |
| Stock sum, outbound lines | `lib/data/products.ts:123` | every line row, one request, cut at 1000 |
| Catalog | `lib/data/products.ts:228` | every product, one request, cut at 1000 |
| Category counts | `lib/data/products.ts:257` | every product's `category_id` read to count in JS, cut at 1000 |
| Outbound list | `lib/data/outbound.ts` `listOutboundIssues` | every issue with its lines, one request, cut at 1000 |

The sweep of `lib/data/*.ts` for other `.from("products" | "batches" | "outbound_lines")`
reads found only reads that already carry `.eq`, `.in` or `.limit` (single product,
one inbound order, one issue, one product's movements) and the `schema-capability.ts`
probes. Those stay as they are. `lib/data/inbound.ts` `listInboundOrders` is an
unpaged read of `inbound_orders`, not in this card's three tables; it is the same
shape and is named below as a follow-up.

## What changed

1. `lib/data/stock-read.ts` (new, no `server-only`): `readQuantityRows` reads a
   quantity table through the existing `readAllPages` (exact count, stops only when
   the rows collected equal the total). Ordered by `id`, so pages join.
2. `stockByProduct(productIds?)` in `lib/data/products.ts` uses it for batches and
   outbound lines, in parallel. With a product id list of at most
   `ID_LIST_BATCH_SIZE` (100) it filters with `.in("product_id", ids)`; otherwise it
   reads the whole table, paged.
3. `listProducts({ activeOnly })`: the catalog is read paged (sku, then id as a
   stable tie break). `listActiveProducts` now asks the database for `active = true`
   and scopes the stock read to those ids when they fit one request.
4. `listCategories`: one request, `products(count)` as a relation aggregate. Zero
   product rows come back; it used to be a second request returning one row per
   product.
5. `listOutboundIssues`: paged with `id` as tie break.
6. `tests/e2e/stock-read-paging.spec.ts` (new): fake client that caps every answer at
   1000 rows and counts requests. 2500 rows come back complete in 3 requests; a table
   of 400 rows costs 1 request; a scoped read asks for its ids only; a server that cuts
   below the page size loses nothing. Run locally, 4 of 4 passed.

No migration, no index, no existing e2e spec touched, no change to the proxy, the
session code, `lead=`, the `hasPhase3Schema` gate or anything under
`app/api/extraction/**`.

## Database requests and rows read per screen, before vs after

Counted from the code, with P products, A active products, C categories, B batch
rows, L outbound line rows, O outbound issues (each at or below 1000, which is
where Rapid Construct is). No production access was used or needed. Capability
probes (`schema-capability.ts`) are unchanged and left out of both columns.

| Screen | Before: requests | Before: rows | After: requests | After: rows |
|---|---|---|---|---|
| Inventar (`listProducts`, `listCategories`) | 3 + 2 = 5 | P + B + L + C + P | 3 + 1 = 4 | P + B + L + C |
| Setari (same two reads) | 5 | P + B + L + C + P | 4 | P + B + L + C |
| Tablou de bord, Memento, Necesar (`listProducts`) | 3 | P + B + L | 3 | P + B + L |
| Pickers: Iesiri, Adauga manual, Proiect, Incarca comanda (`listActiveProducts`) | 3 | P + B + L | 3 | A + B + L, or A + B(active) + L(active) when A <= 100 |
| Comenzi, Tablou de bord (`listOutboundIssues`) | 1 | O (+ lines) | 1 | O (+ lines) |
| Any table over 1000 rows | 1, silently cut | 1000 | ceil(rows / 1000) | all rows |

Honest reading. The saving per screen is small: one request and one row per product
on the two screens that show category counts, and the inactive products on the
pickers. The real change is correctness above 1000 rows, and that no list can be
cut quietly any more. The pickers use the scoped read only up to 100 active
products; above that it falls back to the whole table so the request count never
rises for a table that fits one answer.

## What this card does not do, and why

- **No UI paging.** The inventory screen filters in the browser on the full catalog,
  and the stock level filter (low stock, out of stock) cannot be applied in the
  database without a per-product total. A page of products with stock needs either a
  database view or function that sums batches minus outbound lines per product, or a
  stock column. Either is a migration, which this card's stop rule forbids without
  asking the owner. Recommendation for the next card: a read-only SQL view
  `product_stock` (sum of batches minus sum of lines, grouped by product), after which
  stock can be filtered, sorted and paged in the database. It needs an owner decision
  because it is a migration. The whole-catalog stock sum still reads every batch and
  line row today.
- **`listInboundOrders`** is unpaged too (not one of the three tables); same fix,
  separate card.
- **P3-117 perf spec.** It measures section transition times on a local seeded copy
  where every list has a handful of rows; it cannot show a read-count change. It is
  expected green in this PR's `quality` run as a no-regression check. The request and
  row table above is the before and after record.

## Deviations

- The task says to add the card and report to the PR; the card is `shipped` in this
  PR (as `check:board-edit` requires for a card carrying its own code).
- `ID_LIST_BATCH_SIZE` is reused as the scoping threshold rather than a new constant.
- HARD-RULES.md in `claude-toolkit` could not be read from this run (outside the
  allowed folders); the task file and repo rules were followed.

## Gates run locally

`npx tsc --noEmit`, `npm run build`, `check:card-ids`, `check:unique-ids`,
`check:open-branch-ids`, `check:no-destructive-migration`, `check:conflict-residue`,
`check:categories`, `check:ledger-rows`, `check:no-prod-target`,
`check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`:
all exit 0. `check:board-edit` needs a pull request and runs in CI. The board
validator passes on all three boards. The end to end suite and the perf spec need
Docker and run only in CI.
