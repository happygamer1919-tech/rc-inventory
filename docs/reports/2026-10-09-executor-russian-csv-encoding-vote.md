# P3-207: Russian CSV with mostly Latin text is read as Russian

Card: P3-207. Branch: card/p3-207. Role: EXECUTOR.

## Change
- `lib/data/import-shared.ts`, `decodeCsvFile`: windows-1251 is chosen when the 1251 reading has Cyrillic AND (foreign letters outnumber Romanian ones, as before, OR a word of 3 or more Cyrillic letters exists). New constant `CYRILLIC_RUN`.
- Rule chosen: the Cyrillic run rule, not removal of the shared bytes from the vote. A run of 3 was used because Romanian "viață" in 1250 bytes already gives a run of 2 in the 1251 reading.
- Tests: four new `codare csv P3-207` tests in `tests/e2e/import-encoding.spec.ts` (mostly Latin 1251 with ООО Строй, Romanian 1250 with î â ă ș ț, fully Russian 1251, UTF-8 with Cyrillic).

## Checked locally
- Import-encoding spec alone, with a throwaway Playwright config that has no web server: 17 of 17 pass. The full suite needs a database and runs in CI.
- Board validator exit 0.

## Not changed
UTF-8 and UTF-16 handling, import matching, writing, refusal texts, extraction paths, migrations.
