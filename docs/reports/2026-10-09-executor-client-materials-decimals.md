# Executor report: P3-200, client materials tab shows decimals

## What changed
- `components/clients/ClientTabs.tsx`: each row of the Consum materiale tab uses `formatQty(quantity, unit)`, or `formatQtyNumber(quantity)` when the unit is missing. The total uses `formatQtyNumber`.
- `lib/data/format.ts`: new `formatQtyNumber` (two decimals, ro-MD, no unit). `formatNumber` is unchanged.
- `tests/e2e/p3-200-client-materials-decimals.spec.ts`: a pure format test (2,5 m² and 0,4 m³) and an end-to-end walk-in sale of 2,5 m².
- Card P3-200 added on the phase 3 board, shipped when merged.

## Local checks
- `npx tsc --noEmit`: exit 0. `npm run build`: exit 0. Board validator: exit 0.
- The Playwright spec runs only in CI (needs Supabase and a web server).

## Not changed
No migration, no extraction file, no other use of `formatNumber`.
