# P3-260: CSV separator tie goes to the semicolon

**What changed for Rapid Construct:** an Excel file saved with semicolons, with a comma inside a column name (for example `Nume, prenume;Telefon`), now imports into the right columns instead of shifting every row.

## Change
- `lib/data/import-shared.ts`, `sniffDelimiter` only. On a tie between separators on the first line, the next five non-empty lines decide (the separator with the same count on each of them). If that does not decide it, semicolon beats comma, and tab comes last. A file where one separator clearly wins is read as before.
- `buildCsv`, `normaliseKey`, the BOM and the trailing empty row handling are untouched.
- Two cases added to `tests/e2e/import-shared.spec.ts` (CI only runs specs under `tests/e2e/`): the `Nume, prenume;Telefon` header (alone, with consistent rows, with rows that only agree on the semicolon, and read through `parseCsv`), and a plain comma file, a plain semicolon file, a tab file, a quoted comma header and a one-column header.
- Board: new card P3-260 on the phase 3 board. `docs/LEARNINGS.md` has the ERROR/SOLUTION pair.

## Checked locally
- A direct run of `sniffDelimiter` on the cases above gave the expected separator each time, and `parseCsv` split the tie header into `["Nume, prenume","Telefon"]`.
- The Playwright suite needs the database, so it runs in CI only.
