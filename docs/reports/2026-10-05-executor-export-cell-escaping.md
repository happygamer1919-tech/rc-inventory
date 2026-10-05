# P3-139 Exported CSV cells: no formulas, phone and IDNO kept as text

Role: EXECUTOR. Branch card/export-cell-escaping. No migration.

## What changed
- `buildCsv` (lib/data/import-shared.ts) takes cells that are text or `csvText(value)`.
- A text cell starting with `=`, `+`, `-`, `@`, tab or CR gets one leading apostrophe (OWASP rule). A negative number written by `formatCsvNumber` (`-5`, `-12,5`) does not, so it stays a number.
- Phone and fiscal code / IDNO cells in the client and lead exports go through `csvText`.
- `parseCsv` (every import path, through `parseCsvWithLines`) undoes both forms.

## Choice: `="..."` over apostrophe or tab for phone and IDNO
Excel shows `="0123456789012"` as plain text with no visible extra character, and it cannot run as a formula. A leading apostrophe in a CSV shows up literally in Excel, and a tab is invisible but ends up in the stored value if the file is saved and re-imported. The `="..."` form round-trips through our own `parseCsv` (proved in the round trip spec, including a value holding a quote: the quote is doubled once for the formula and again for the CSV).

## Import side
- A cell matching `="..."` is unwrapped. A cell starting with `'` followed by one of `= + - @ tab CR` loses that one apostrophe.
- No other leading apostrophe is touched (`'text` stays `'text`). Real user text that starts with `="`, or with an apostrophe before one of those characters, is read with the wrapper removed; this is the only new rule.
- The error file (`buildErrorCsv`) writes the raw cells as text, so a phone there gets the apostrophe and re-imports clean. Its IDNO cells are not forced to text (the error file has no column knowledge); only the formula guard applies.

## Not changed
Separator, BOM, decimal comma, import parsing rules, duplicate checks, project and material exports (no phone or fiscal code column, formula guard only).

## Checks
Specs added in tests/e2e/import-shared.spec.ts (four cases named on the card). The suite needs the web server and a database, so it runs in CI only. Locally: `npx tsc --noEmit`, a direct run of the round trip through tsx, and the board validator.
