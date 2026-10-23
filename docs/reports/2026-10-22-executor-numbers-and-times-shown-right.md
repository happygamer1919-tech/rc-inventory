# P3-336: numbers and times shown right

Date: 2026-10-22. Source: Fable bug check 2026-10-22 17:50Z, findings 2 and 3.

## What changed
- Thresholds, incoming quantities, batch quantities, deviz and project material rows now keep their decimals (formatQty / formatQtyNumber). Incoming prices and order totals show two decimals (formatNumberExact).
- Memento alert time uses formatDateTime (Europe/Chisinau).
- Left as is on purpose: percents, true counts, dashboard stock value (whole lei).
- ExtractionReviewPanel and the rest of app, components and lib hold no getHours or getDate on a timestamp, so nothing to fix there.
- tests/format.test.ts had stale unit labels (m2 vs m²); corrected.

## Tests
tests/e2e/format-numbers-and-times.spec.ts (runs in CI). tests/format.test.ts compiled with tsc and run by hand: 14 passed.

## Not run here
The bug check file sits outside the allowed folders, so the findings were re-derived from the brief and a grep.
