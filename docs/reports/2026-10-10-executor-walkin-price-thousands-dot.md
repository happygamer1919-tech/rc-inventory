# P3-253: walk-in price typed with a thousands dot

## What changed
- `lib/data/price-input.ts`: `parsePriceText` reads a dot followed by groups of exactly three digits as a thousands separator. First group is 1 to 3 digits and does not start with 0, so `0.500` stays 0,5.
- `1.200` is 1200, `12.500` is 12500, `1.200.000` is 1200000, `1.200,50` is 1200.5. `12,50`, `12.50`, `12.5`, `1 200`, `1 200,50` read as before.
- Still invalid: `1,200.50`, `1.20.0`, `1.2000,50`, `1.200,`, `1.200.`, letters, two commas.
- Callers (`OutboundDirectClientForm.tsx`) read `value` and `text`; `text` stays a dot-decimal string (`1200.50`).
- Unit cases moved from `tests/price-input.test.ts` to `tests/e2e/price-input.spec.ts` because CI runs only `tests/e2e`. One e2e case added in `outbound-direct-client.spec.ts` (2 x 1.200 shows 2400 MDL).
- Board card P3-253, LEARNINGS entry.

## Not changed
The Romanian message, the text input type, the server, any migration.

## Checked locally
Board validator exit 0; regex truth table for every case above. The e2e suite runs only in CI.
