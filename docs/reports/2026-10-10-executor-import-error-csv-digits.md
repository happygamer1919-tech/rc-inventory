# P3-252: import error file keeps IDNO, SKU and phone values intact

Executor report, 2026-10-10.

## What changed for Rapid Construct
The file of rejected rows from an import can be opened in Excel, fixed and uploaded again. Long codes, codes with a leading zero and phones starting with + no longer change.

## Cause
`buildErrorCsv` in `lib/data/import-shared.ts` wrote the original cells as plain strings. The text literal form of P3-139 (`csvText`) was used only by the exports.

## Fix
- `buildErrorCsv` wraps each original cell that is 10 or more digits, starts with 0, or starts with + = - or @ in `csvText`. The added reason column stays plain text.
- `parseCsv` already reads the form back (`unwrapCsvCell`), so no parser change.
- Test: the P3-252 case in `tests/e2e/import-shared.spec.ts`. The `tests/*.test.ts` files are not run by CI (testDir is tests/e2e), so the case sits there.

## Not changed
The four exports, `decodeCsvFile`, the import template, any `lead=` prop. No migration.

## Run locally
Board validator exit 0. A direct run of the new round trip printed the wrapped cells and read them back equal. The Playwright suite needs the web server and a database, so it runs in CI.
