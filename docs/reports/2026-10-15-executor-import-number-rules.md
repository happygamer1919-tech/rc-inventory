# P3-310 report, 2026-10-15

Card P3-310, branch card/p3-310. Source: Fable bug check 2026-10-14 18:46Z, findings 9 and 15 (zero based). The finding file is outside the executor folders and could not be read; the work follows the task text and the code.

## What changed
- `lib/data/import-number.ts`: new `quantity` mode, `isUnclearQuantity`, `unclearQuantityHint`.
- `lib/data/material-import-types.ts`: Prag recomandă reads in quantity mode, with the new reason `unclearNumber`; Valoare unitară stays money.
- `lib/data/material-export-types.ts`: comment only; `exportNumber` keeps `1,1250` for exactly three decimals.
- `lib/data/project-export-actions.ts`: start and end dates written with `formatDate` (zi.lună.an). `readImportDate` is unchanged and reads both forms.
- Tests: `tests/e2e/import-number.spec.ts` (quantity cases, money cases, hint text, export round trip for 2,5 / 1,125 / 1000 / 0,005), `tests/e2e/projects-export.spec.ts` (date form).
- Board card P3-310 and LEARNINGS entry.

## Rule recorded
Money columns (2 decimals): one separator plus three digits is thousands. Quantity columns (3 decimals): unclear, row refused.

## Verified locally
`npx tsc --noEmit` exit 0; the pure parser cases were run with node and match the spec tables. The Playwright specs need the CI database and server and were not run here.
