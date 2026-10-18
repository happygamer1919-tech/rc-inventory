# P3-317: the Chisinau day test now runs in CI

## What changed
- `tests/format-timestamp-date.test.ts` was deleted; `tests/e2e/format-timestamp-date.spec.ts` replaces it. Same four cases, same expected values, only the import path of `formatTimestampDate` (`../../lib/data/format`) differs.
- New card P3-317 on the phase 3 board, marked shipped in this pull request.
- `docs/LEARNINGS.md`: one ERROR/SOLUTION pair.

## Why
P3-316 acceptance (a) said the old file was green in the quality run. It was never run there: the Playwright config scans only `tests/e2e`, `npm test` runs only `tests/format.test.ts`, and quality.yml has no `npm test` step.

## Checks
- `npx playwright test --list tests/e2e/format-timestamp-date.spec.ts`: 4 tests in 1 file.
- Local run of the spec did not finish: `playwright.config.ts` has a `globalSetup` and `webServer` entries that need the database, which this machine does not have. The run was stopped after 5 minutes. The first real run is the quality run.
- Same four calls through `npx tsx` give `01.01.2027`, `31.12.2026`, `01.01.2027`, `-`, matching the expected values.
- Red-first proof: not possible locally for the reason above. Reasoned instead: the spec calls the real `formatTimestampDate` and compares with `toBe`, so changing any expected value makes that test fail.
- Not touched: the other eight parked test files, `formatTimestampDate`, quality.yml, playwright.config.ts.
