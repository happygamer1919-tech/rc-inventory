# P3-138: CSV saved from Excel imports with the right letters

Date: 2026-10-04. Branch: card/import-csv-encoding. Role: EXECUTOR.

## What changed for Rapid Construct
A CSV saved from Excel the usual way (Windows-1250 or Windows-1251) now imports with correct
Romanian and Russian letters. A file whose letters are already broken is refused with a Romanian
message that says to save it as CSV UTF-8. The hint about .xlsx files now says the same.

## Cause
The four import screens read the file with `file.text()`, which decodes as UTF-8 only. Other
encodings turned letters into U+FFFD and the names were written to the database.

## Change
- `lib/data/import-shared.ts`: `decodeCsvFile`, `hasReplacementChar`, `rowHasBrokenLetters`, the two
  Romanian messages; `prepareImportRow` refuses a row with U+FFFD in any cell.
- `lib/data/lead-import-types.ts`: the lead `prepareRow` does the same.
- Lead, client, project and material import screens call `decodeCsvFile(await file.arrayBuffer())`.
- `tests/e2e/import-encoding.spec.ts`: five named pure cases.
- Board card P3-138, LEARNINGS entries. No migration.

## Decoding rule
Strict UTF-8 (BOM stripped). Otherwise Windows-1251 when it shows Cyrillic and the Windows-1250
reading holds a non-Romanian non-ASCII letter; else Windows-1250 with the cedilla letters turned
into comma-below ones. U+FFFD left in the result is an error.

## Checks run locally
Board validator, `npx tsc --noEmit`, and the decode logic run directly under node against the spec
bytes. The Playwright specs need the web server (Supabase variables), so they run in CI.
