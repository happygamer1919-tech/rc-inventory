# 2026-10-14 executor: project sale price typed with a dot (P3-303)

Plain words: on Iesiri, Proiect, a price typed as 1.250 now totals 1250 on screen and saves 1250. Before, the screen showed about 1 lei and 1250 was saved.

- Project form price box is text, read by parsePriceText (same as walk-in and server).
- New helper priceAmount in lib/data/price-input.ts drives the on screen total.
- Quantity box and walk-in form unchanged. No migration.
- Test: tests/e2e/price-input.spec.ts, case P3-303 (ran locally with a no-webServer config, 11 passed).
