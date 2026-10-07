# P3-193: paged reads stable under edits (2026-10-07)

Role: EXECUTOR. Branch card/paged-reads-stable.

## What changed
- `lib/data/id-list.ts`: `readAllPages` retries the whole read from page one when the exact count changes between pages (3 attempts, `READ_ATTEMPTS`). After the last attempt it throws `LIST_CHANGED_MESSAGE`, in Romanian. Other errors (database error, missing count, short page) are unchanged and not retried.
- `lib/data/tasks-read.ts`: `readTaskRows` and `readEntityTaskRows` return `dedupeById(rows)`.
- `lib/data/catalog-read.ts`: `readCatalogWithStock` dedupes the catalog rows.
- `lib/data/outbound.ts`: `listOutboundIssues` dedupes before mapping.
- Page sizes, ordering and screens are untouched. No migration.

## Limit worth knowing
A row moved across a page edge shows twice (now fixed) and another row can be skipped in the same window. A position read cannot recover the skipped row; same limit as P3-178.

## Tests
Three new cases in `tests/e2e/tasks-list-paging.spec.ts` (fake client, no database). Run locally with a throwaway config that has no web servers: 8 passed there, plus the existing `P3-39` case in `review.spec.ts`.
