# Executor report, 2026-10-13: ambiguous walk-in quantity (P3-275)

Card: P3-275, branch card/p3-275.

## What changed for Rapid Construct
A walk-in quantity typed as 2.500 (or 12.500, 1.200, 1.200.000) is no longer read as 2500. The screen and the server refuse it with "Cantitate neclară: scrieți 2,5 pentru zecimale sau 2500 fără punct." and no slip is saved. Prices are read as before.

## Files
- lib/data/price-input.ts: new kind `ambiguous`, `QUANTITY_AMBIGUOUS_MESSAGE`, `quantityProblem`.
- lib/data/outbound-lines.ts: server refusal.
- components/outbound/OutboundDirectClientForm.tsx: message under the box and in the problem list.
- tests/e2e/price-input.spec.ts, tests/e2e/outbound-direct-client.spec.ts, tests/price-input.test.ts: cases.
- docs/board/rc-board-phase3.json: card P3-275. No migration.

## Checked
- price-input unit cases run locally with a throwaway playwright config: 25 passed. 3 failures in tests/price-input.test.ts are older cases of parsePriceText that expect text 1200.5 (the file sits outside the CI testDir, parsePriceText is untouched).
- The screen case runs in CI only (no Docker here).
