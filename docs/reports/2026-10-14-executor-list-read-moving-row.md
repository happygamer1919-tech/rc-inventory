# Executor report, 2026-10-14: a long list no longer misses a row that moves while it loads (P3-287)

Card: P3-287, branch card/p3-287.

## What changed for Rapid Construct
A long list that someone edits while it is loading used to come back one row short, with no message. Now, when a list took more than one page to read, it is checked at the end against a short read of the same list (ids only). If a row moved, the list is read again; only if it keeps changing three times does the screen say "Lista s-a schimbat în timpul citirii. Încercați din nou." The lists covered are Sarcini and the task panels of a record, the product catalog, the active client pickers and the Azi client list.

## Files
- lib/data/id-list.ts: optional fifth argument `fetchIds`, type `IdsFetcher`, check `verifyIds`.
- lib/data/tasks-read.ts, lib/data/tasks.ts, lib/data/catalog-read.ts, lib/data/products.ts, lib/data/client-options-read.ts, lib/data/azi.ts: pass the id-only read.
- tests/e2e/list-read-moving-row.spec.ts (new), tests/e2e/tasks-list-paging.spec.ts, tests/e2e/client-options-read.spec.ts: cases. The existing client picker case expected 5 requests for 2250 rows; it now expects 10 (5 pages plus 5 id-only), written out in the test.
- docs/board/rc-board-phase3.json: card P3-287. No migration.

## Decisions
- Keyset paging was too wide: the callers sort on different columns, with nulls and Romanian text.
- Not wired, on purpose: lists sorted on id or created_at with no deletes (stock, movements, inbound and outbound orders, client import reads, Azi notes). A skip needs a row to leave the list. Not touched: lib/data/extraction.ts (Orange's track; it already passes a key).
- Cost: one id-only read per load, only for lists that took more than one page (over 500 rows, 1000 for the catalog).

## Checked
- Pure specs run locally with a throwaway playwright config (no webServer): list-read-moving-row, tasks-list-paging, client-options-read, counted-paging-reads, stock-read-paging, inbound-paging-stock-read, import-clients-read, product-movements-paging all passed.
- The tasks case fails without the id-only read (24 of 25 rows) and passes with it.
- The e2e suite (review.spec.ts and the rest) runs in CI only (no Docker here).
