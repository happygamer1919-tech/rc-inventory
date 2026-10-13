# P3-268: walk-in quantity reads a thousands dot like the price

## What changed
- `lib/data/price-input.ts`: `parseQuantityText` and `parsePriceText` share one reader. "1.200" is 1200 for both, "0.500" stays 0,5, "2,5" stays 2,5, quantity still refuses zero. Price results are unchanged for every input it accepted.
- `lib/data/outbound-lines.ts` (new, no "use server"): `processIssueLines` reads every line with those parsers. `lib/data/outbound-actions.ts` calls it instead of the comma-to-dot replace, so screen and server agree. Invalid text is refused with the existing Romanian messages.
- Tests in `tests/e2e/price-input.spec.ts` (names start with `P3-268`). Run locally with a throwaway Playwright config: 9 of 9 green. `tests/price-input.test.ts` is not run by CI (testDir is `tests/e2e`) and has 3 stale `text` expectations; left alone.

## Local gates
See PR body.
