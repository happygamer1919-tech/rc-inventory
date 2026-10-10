# P3-218 executor report, 2026-10-10

Card: P3-218, branch `card/csv-foreign-letter`.

## What changed
- `lib/data/import-shared.ts` `decodeCsvFile`: windows-1251 is chosen only when the 1251 reading has a word of 3 or more Cyrillic letters in a row. The foreign-against-Romanian vote is removed, and so is the unused `ROMANIAN_LETTERS` constant. Everything else (UTF-8, UTF-16, refusal paths, s and t cedilla mapping) is unchanged.
- Card P3-218 added to `docs/board/rc-board-phase3.json`; LEARNINGS entry added.

## Tests
- `tests/e2e/import-encoding.spec.ts`: new P3-218 cases for `Würth SRL` without diacritics, a German supplier list with a Romanian header, `Café Ionescu`, and a Russian file with a Latin word. The P3-182 and P3-207 cases are untouched.
- No database or web server here, so Playwright could not start its web server. The same cases were run directly against `decodeCsvFile` with Node type stripping: all gave the expected text and code page. CI runs the spec.
