# P3-189: client picker and client import read every client

- `lib/data/client-options-read.ts` and `lib/data/import-clients-read.ts` now use `readAllPages` (exact count) and `dedupeById`.
- The picker keeps `CLIENT_OPTIONS_READ_FAILED` and the Romanian sort; the import keeps `ImportReadError`.
- The `CLIENT_OPTIONS_PAGE` and `PAGE` constants are removed; nothing else imported them.
- Test: `tests/e2e/counted-paging-reads.spec.ts` (fake server, 3 rows per page, count 7). Ran locally, 2 passed.
- No migration.
