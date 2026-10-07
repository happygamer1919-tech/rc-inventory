# P3-192 Romanian plurals in imports, exports and Azi

Role: EXECUTOR. Branch card/p3-192. No migration.

## What was wrong
- The four import sheets said "Am citit 3 de rânduri" for every count but 1.
- The export notices on Clients, Projects and Inventory said "25 rânduri" (no "de").
- The Azi tasks card said "1 deschise, cu termenul azi" for a single task.

## What changed
- All of these strings go through `plural()`: "Am citit 20 de rânduri", "Am exportat 25 de rânduri.", "1 sarcină deschisă" and "2 sarcini deschise".
- `tests/e2e/materials-export.spec.ts` expected the old "30 rânduri"; it now expects "30 de rânduri".
- The `plural()` rule, routes, queries and import logic are unchanged.

## Not changed
- The "N rânduri citite din fișier" total line on the import result panels still lacks "de" above 19. Not in this card's scope; left for a later card.

## Checks
- `tests/e2e/romanian-plurals-imports-azi.spec.ts` (4 cases) passes locally with a config that has no web server or database.
