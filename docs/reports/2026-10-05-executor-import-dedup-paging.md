# P3-151: client and lead import duplicate check reads every client

Branch `card/import-dedup-paging`. No migration.

## What changed
- `lib/data/import-clients-read.ts` (new): `readAllClients` pages the clients table (1000 per page, ordered by id, until a short page). Any error throws `ImportReadError`. `loadOrRefuse` turns it into `Nu am putut citi clienții existenți. Încercați din nou.`
- `lib/data/client-import-actions.ts` and `lib/data/lead-import-actions.ts`: `loadExisting` uses the helper; the check and the write actions return the message instead of planning against an empty list.
- `tests/e2e/import-clients-read.spec.ts`: 1000, 1000, 250 rows give 2250 in three pages; an error refuses with the Romanian message; an error on page two refuses.
- Board card P3-151 (the brief named P3-141, already taken).

## Notes
- The spec tests the shared helper, not `loadExisting` itself: both action files are `"use server"`, so exporting a helper from them would make it a callable server action.
- Run locally with a throwaway config without `webServer`: 3 passed. The full suite runs in CI.
- Not touched: the projects and materials imports still stop paging silently on an error (out of scope here).
