# P3-153: Inventar and Comenzi lists show one page at a time

Role EXECUTOR. Date 2026-10-05. Branch `card/list-paging-on-screen`. The brief asked for
P3-142; that id was taken (`npm run id:free` named P3-153 as the next free one).

## In plain words

Card P3-136 was marked "load long lists in pages", and the status page said long lists
load only the rows on screen. That was not what shipped: it reads every row in pieces and
then shows the whole list, and the product screen still adds up every batch and every
outbound line. Its own report says "No UI paging". This card does the paging.

Inventar and the Ieșiri side of Comenzi now show 50 rows at a time, with "Pagina 2 din 7",
"Înapoi", "Înainte" and "Afișate 51-100 din 340" under the table. The page number is in the
address (`?pagina=2`), so reload and the browser back button keep it. Changing a filter goes
back to page 1. On Inventar the stock is added up only for the 50 products on the open page.
No database change.

## What changed

| File | Change |
|---|---|
| `lib/data/list-paging.ts` (new) | page size 50, `readPage` (one request, exact count; a page past the end returns the last page), labels |
| `lib/data/product-page-read.ts` (new) | `readProductPage`: filters in the query, sku then id, `stockFor(ids)` called with only the ids on the page |
| `lib/data/outbound-page-read.ts` (new) | `readIssuePage`: newest first then id, destination and kind filters in the query, count of issues still to ship |
| `lib/data/products.ts` | `listProductsPage`, `getProductBySku`; `productColumns` pulled out of `listProducts` (same columns) |
| `lib/data/outbound.ts` | `listOutboundIssuesPage` |
| `components/ui/Pager.tsx` (new) | the page controls and `useListUrl` (filters and page live in the address) |
| `app/(app)/inventar/page.tsx`, `components/inventory/InventoryScreen.tsx` | read one page; filters in the address (`q`, `categorie`, `furnizor`, `nivel`, `vizibilitate`, `pagina`) |
| `app/(app)/comenzi/page.tsx`, `components/orders/OrdersScreen.tsx` | one page of issues; kind filter in the address (`tip`) |
| `tests/e2e/list-paging.spec.ts`, `tests/e2e/inventory-paging.spec.ts` (new) | the acceptance specs |

## Filters: in the query, and the two that cannot be

In the query (one request, one page): active/inactive, category, supplier; on Comenzi the
project, client and kind filters.

NOT in the query, and the brief's "apply them in the query" cannot be met for them without a
migration, which the brief forbids:

- **Search.** It ignores diacritics (typing "tigla" finds "Țiglă", spec "căutarea ignoră
  diacriticele"). `ilike` does not, without the `unaccent` extension.
- **Stock level** (low, out, enough). Stock is a computed sum, not a column (migration 0001).

With either set, `listProductsPage` reads the whole catalog as before, filters it with the same
`filterProducts` the export uses, and cuts the page. Correct on every row; costs what the screen
cost before, only while someone searches or filters by stock. A database function or view that
returns stock per product (and an `unaccent` search) would remove this; it is a migration and
needs an owner decision.

## Left on the full read, on purpose

Dashboard, Memento stoc, Necesar, the pickers in forms, the CSV exports and every other caller of
`listProducts` and `listOutboundIssues` need whole-catalog totals, so they keep the paged-until-complete
read from P3-136. Exports still write every row. Inbound orders on Comenzi are not paged (short list,
no filters, not in the brief).

## Existing specs edited

The list is now 50 rows, and the CI catalog has 80 loaded materials plus every test product, so a
spec that created a product and expected its row without searching would miss it. Each of those now
types the SKU in the search box first (same assertion after it). `copy-fixes.spec.ts` "without a
filter" compares the counter with the page (min of total and 50). `products.spec.ts` diacritics case
searches "tigla metalica test" (still without accents). `phone-lists` and `phone-forms` find the
seeded issues (oldest rows) with the new `support/orders-pages.ts` helper, which presses "Înainte"
until the reference shows. No assertion was removed or loosened.

## Not run here

No Docker and no Supabase on this machine, so the end to end suite runs only in CI.
Run locally: `tsc`, `next build`, the board validator, the card and migration checks, and the two
database-free specs (`list-paging.spec.ts`, `stock-read-paging.spec.ts`) with a throwaway config.

## Risks to watch in the CI run

- Any spec outside the ones edited that reads a product row on `/inventar` without searching.
- Any spec that reads an old seeded issue on `/comenzi` without the helper.
