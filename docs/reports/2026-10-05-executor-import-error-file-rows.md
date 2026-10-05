# P3-155 import error file rows

Role: EXECUTOR. Branch card/import-error-file-rows. No migration.

## What was wrong
- The client and lead imports wrote an empty row into the error file for skipped duplicates and rows the database refused.
- `parseCsv` dropped blank lines before numbering, so "Rândul N" after a blank line did not match Excel.
- A client created whose stage or contact step failed was reported as a plain refusal.

## What changed
- `lib/data/import-shared.ts`: `parseCsvWithLines`, `rawRowAt`, `dataRowLine`; `buildImportPreview` takes optional `lines`. `parseCsv` behaves as before.
- Client and lead plans, actions and sheets pass `lines` through; every skipped row carries its cells.
- `createClientRecord` returns `saved: { clientId }` on the two failures after insert; both imports count the row as created and show the step's own message as a warning, not in the error file.
- Projects and materials imports untouched (their line numbers still count rows, not physical lines).

## Checks
- `tests/e2e/import-error-file-rows.spec.ts` (5 cases) and `tests/e2e/import-shared.spec.ts` (10 cases) pass locally with a config that has no web server.
- The database-refused and partial-failure paths run inside the server actions and need a database, so only typecheck and CI cover them.
