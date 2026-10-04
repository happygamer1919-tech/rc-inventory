# P3-137 import numbers written the Romanian way

Plain words: a budget or price typed `250.000` in an import file is now saved as 250 000, not 250. A number that cannot be read for sure is refused with the same row error as before.

## Cause
`readBudget` (lib/data/project-import-types.ts) and `readNumber` (lib/data/material-import-types.ts) changed the first comma to a dot and accepted one dot. `250.000` became 250.00, `1.250` became 1.25, and `1.234,56` was refused.

## Change
- New `lib/data/import-number.ts`, `parseImportNumber(raw, maxIntDigits)`. Both readers call it; limits stay 12 and 11.
- Rule: last of dot and comma is the decimal mark when both appear; one comma is decimal; several commas or dots are thousands in groups of 3; one dot before exactly 3 digits is thousands; anything else is null.
- A leading group of 0 is not a thousands group, so `0.500` stays 0.500.
- No migration, no change to writers, columns or error texts. The error text is the one that exists today.

## Proof
- `tests/e2e/import-number.spec.ts`: table of cases and the digit limits, no browser, no database.
- `projects-import.spec.ts` valid case gains a row with budget `250.000`, stored 250000.
- `materials-import.spec.ts` valid case gains a row with threshold `1.000` and price `1.250`, stored 1000 and 1250.
- Locally the table was run by hand with Node on the helper: all cases matched. The e2e suite runs only in CI (no Docker here).
