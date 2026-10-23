# P3-335: every unit test under tests/ runs in CI

Source: Fable bug check 2026-10-22 17:50Z, finding 1.

## What was wrong
- Seven files under `tests/` never ran: price-input, outbound-slip-year, import-batches, combobox-commit, import-sheet-close, client-import-instructions, parse-project-query.
- `npm test` called `node --loader ts-node/esm tests/format.test.ts`. ts-node is not installed, so the command failed before any test ran. `format.test.ts` never ran either.

## What changed
- `playwright.unit.config.ts`: reads `tests/*.test.ts`, no browser, no web server, no globalSetup. A second file and not a project in `playwright.config.ts`, which would pull in the end to end servers.
- `npm test` runs it with `NODE_OPTIONS=--conditions=react-server`, so `parse-project-query.test.ts` can import `lib/data/projects-list.ts`, which imports `server-only`.
- `.github/workflows/quality.yml`: steps "Unit tests" (`npm test`) and "Every test file is run" (`npm run check:tests-run`), both right after Typecheck. They run on drafts too; the unit run takes about 1 second.
- `scripts/poc-free/check-tests-run.mjs` (`npm run check:tests-run`): fails, naming the path, when a `*.test.ts` or `*.spec.ts` under `tests/` sits where no config reads it, or when a config or the workflow step stopped reading them. Shown failing with a stray `tests/helpers/stray.test.ts`, then removed.
- `tests/format.test.ts`: the hand-rolled runner became Playwright `test(...)` calls; assertions unchanged except the labels below.

## Red tests, and why no application code changed
Eight cases were red once they ran. The code was right and the expectations were stale:
- `format.test.ts` (5 cases): expected `m2`, `lm`, `rola`, `m3` as unit text; `lib/data/units.ts` labels them `m²`, `ml`, `rolă`, `m³`.
- `price-input.test.ts` (3 cases): expected `parsePriceText("12,50").text` to be `12.5`; the shared reader (`lib/data/import-number.ts`, P3-311 and P3-327) keeps the typed fraction, `12.50`, so the database holds what the screen shows.

The expectations were changed to match and the code was left as it was. If the owner wants `lm` shown as `lm`, that is a separate decision.

## Result
- `npm test`: 63 passed, locally.
- Board validator exit 0. No migration.
