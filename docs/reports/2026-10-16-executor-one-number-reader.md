# P3-311 report, 2026-10-16

Card P3-311, branch card/p3-311. Source: Fable bug check 2026-10-16 17:33Z, findings 3 and 4 (zero based). The finding file is outside the executor folders and could not be read; the work follows the task text and the code.

## What changed
- `lib/data/price-input.ts`: the separator rules are deleted. `parsePriceText` and `parseQuantityText` call `parseImportNumber` (money and quantity mode) with the database column limits (12 whole digits for a price, 11 for a quantity). New `quantityAmount`.
- `components/outbound/OutboundProjectForm.tsx`: quantity box is a text box (`inputMode="decimal"`), totals, stock sums and half-filled checks use `quantityAmount`, an unclear or invalid quantity shows its sentence under the box and stops the save.
- Tests: new `tests/e2e/number-reader.spec.ts` (20 texts through both entry points, the named cases from the finding, server and screen total of one project sale line, column limits); `tests/e2e/outbound.spec.ts` two project sale cases (1,25 saves 1,25 m2; 2,500 stops on screen); `tests/e2e/price-input.spec.ts` and `tests/price-input.test.ts` adjusted where they encoded the split.
- Board card P3-311 and LEARNINGS entry.

## Behaviour that changes
- Price `1,200` is 1200 at the counter (was 1,2). Price `1,200.50` is 1200,5 (was refused).
- Quantity `1,200` is refused as unclear (was 1,2). Quantity `1.200.000` is 1200000 (was refused as unclear).
- A price over 12 whole digits or a quantity over 11 is refused on screen (the database would have rejected or rounded it).

## Verified locally
`npx tsc --noEmit`; the pure specs `number-reader.spec.ts` and `price-input.spec.ts` (17 cases) with a temporary Playwright config. The project sale e2e cases need the CI database and server.
