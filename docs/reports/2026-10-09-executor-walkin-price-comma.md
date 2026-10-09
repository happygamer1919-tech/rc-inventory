# P3-209: walk-in sale price typed with a comma

Plain words: typing 12,50 in the walk-in sale price box now always means 12.50, on any browser language. A price that cannot be read shows "Preț invalid. Exemplu: 12,50" under the box and the slip cannot be saved until it is fixed. An empty box still means no price.

## Cause
The price box was an input of type number. Browsers not set to Romanian drop a comma value and leave the box empty while the text still shows.

## Change
- `components/outbound/OutboundDirectClientForm.tsx`: price box is a text input with a decimal keypad; the typed text is parsed, the total uses the parsed number, the parsed text is what goes to the server.
- `lib/data/price-input.ts`: `parsePriceText` (new).
- `tests/price-input.test.ts`: parser unit tests. `tests/e2e/outbound-direct-client.spec.ts`: one case for the comma total and the inline error (runs in CI only, no database here).
- Board card P3-209 on phase 3.

## Not touched
Client picker, new client flow, server storage, migrations, extraction paths.

## Local checks
Board validator, `npx tsc --noEmit`, card-id, unique-id and open-branch-id checks pass. The parser was also run directly on sample inputs. Playwright and the build need the CI environment.
