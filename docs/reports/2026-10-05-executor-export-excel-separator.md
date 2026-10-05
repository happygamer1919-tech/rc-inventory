# P3-154: exports open in Excel on Romanian and Russian Windows

Date: 2026-10-05. Branch: card/export-excel-separator.

## What changed
- `buildCsv` (lib/data/import-shared.ts) separates columns with `;`, keeps the single UTF-8 BOM it already wrote, and quotes a cell holding `"`, `;`, `,` or a line break.
- New `formatCsvNumber` next to it writes a decimal with a comma (12,5). Used by the materials export (`exportNumber`) and the projects export (budget).
- The import rules text for materials and projects now says "separat prin punct și virgulă".
- Import side unchanged: `sniffDelimiter` already detects `;`, `parseImportNumber` already reads `12,5`.

## Tests
- tests/e2e/import-shared.spec.ts: three new cases (separator, BOM once and quoting; 12.5 as 12,5; round trip with a number) and the old separator case updated.
- The hand-written `csv()` helpers in the four export specs now join with `;`.
- Local: `npx tsc --noEmit`. The specs run in CI (they need the web server and its environment).

## Not done on purpose
Escaping of cells starting with = + - @ is the next task.
