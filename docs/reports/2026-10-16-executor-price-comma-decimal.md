# P3-314 report, 2026-10-16

Card P3-314, branch card/p3-314. Source: Fable bug check 2026-10-16 20:57Z, finding 5 (zero based). The finding file is outside the executor folders and could not be read; the work follows the task text and the code.

## What changed
- `lib/data/import-number.ts`: new mode `screenMoney` (a lone comma is always the decimal mark; a dot plus three digits and a space still separate thousands; `1.250,50` is 1250,50). Mode `money` (import files) now refuses a lone comma plus exactly three digits (`1,200`) as unclear: new `isUnclearMoney` and `unclearMoneyHint` ("Scrie 1200 sau 1,20, nu 1,200."). The old P3-286 sentence is quoted and marked replaced in the header comment and at the code (CLAUDE.md 9c).
- `lib/data/price-input.ts`: `parsePriceText` uses `screenMoney`. New `priceReadLabel` ("Citit: 2,50 lei"; more than 2 decimals are shown, not rounded).
- `components/outbound/OutboundDirectClientForm.tsx` and `OutboundProjectForm.tsx`: the read value shows under the price box (`issue-price-read-N`).
- `lib/data/material-import-types.ts` (Valoare unitară) and `lib/data/project-import-types.ts` (Buget): a money cell `1,200` goes to "Rânduri cu erori" with the sentence above.
- `lib/data/material-export-types.ts`: comment only (old sentence quoted and marked replaced).
- Tests corrected, not deleted: `number-reader.spec.ts` (CASES carry a screen price column), `import-number.spec.ts` (`1,200`, `100,000`, `1,500` are null in money mode), `price-input.spec.ts` (new case), `import-preview-rows.spec.ts` (materials and projects), `outbound.spec.ts` (new case: `2,500` shows "Citit: 2,50 lei").
- Board card P3-314, LEARNINGS entry.

## Exports checked
Money columns have at most 2 decimals, and `formatCsvNumber` writes `12,5` or `1250,5`, so an RC export never writes a comma plus three digits for money. Quantities (3 decimals) still get the trailing zero (`1,1250`) from `exportNumber`, unchanged.

## Behaviour that changes
- Price `2,500` at the counter or on a project sale is 2,50 (was 2500). `1,250` is 1,25 (was 1250). `1,200` is 1,20 (was 1200).
- Unchanged: `1.250`, `1 250` are 1250; `1.250,50` is 1250,50; `1,200.50` is 1200,5; `1,250,000` is 1250000; quantities (a separator plus three digits is still unclear).
- Import file: money cell `1,200` is refused as unclear (was 1200). `1.200` is still 1200.

## Choices made without asking
- Several commas (`1,250,000`) keep the thousands reading on screen; the rule changed only for the lone-comma case that was wrong.
- When the third digit is not 0 (`1,255`), the import sentence offers `1255` or "a sum with at most 2 decimals", since no 2 decimal form says the same thing.
- The acceptance sentence of the shipped card P3-311 (a) now reads false; left in place on purpose (CLAUDE.md 9c) and named in the P3-314 notes.

## Verified locally
Pure specs (`number-reader`, `import-number`, `price-input`, `import-preview-rows`) with a temporary Playwright config, no server. The e2e case in `outbound.spec.ts` needs the CI database and server. `tests/price-input.test.ts` is not run by CI and has 3 old failing text expectations (`12.5` against `12.50`) from before this card; untouched.
