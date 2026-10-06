# P3-182: CSV encoding decided by majority

Date: 2026-10-06. Role: EXECUTOR. Factory task 144.

## What changed for Rapid Construct
A Romanian CSV saved from Excel that also holds a foreign name (Würth, Kärcher, André) now imports with correct Romanian letters. Before, the whole file could come out as Cyrillic with no warning.

## Change
- `lib/data/import-shared.ts`, `decodeCsvFile`: in the windows-1250 reading, count Romanian letters (`ro`) and other non-ASCII letters (`foreign`). windows-1251 is chosen only when the 1251 reading has Cyrillic and `foreign > ro`. The U+FFFD refusal, `BROKEN_LETTERS_FILE_ERROR`, the signature and the four import sheets are unchanged.
- `tests/e2e/import-encoding.spec.ts`: two new cases (Bălți and Würth, André and Kärcher with Romanian names). The Иван Петров case and the other P3-145 cases stay.
- Board: new card P3-182 on `docs/board/rc-board-phase3.json`.

## Branch note
The brief named PR #409, which was closed unmerged and replaced by PR #411 (merged). So this is a fresh branch from main with a new card.

## Checks
Playwright cannot start locally (the web server needs Supabase variables), so the new byte arrays were run through the same decode logic with node: outputs `Bălți;Würth;Ștefan;Țurcanu;Iași`, `André;Kärcher;Bălți;Ștefan;Chișinău`, `Иван Петров`. The spec runs in CI.
