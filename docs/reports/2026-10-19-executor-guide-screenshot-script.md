# Report: guide PR 2 of 6, the screenshot and annotation script (P3-320)

Role: EXECUTOR. Date: 2026-10-19. Branch: `card/p3-320`. Pull request #547.

## Ce acoperă

Checked against the brief ("THE SCREENSHOTS", delivery step 2):

| Brief item | Done in this PR |
|---|---|
| Pictures made by a script, not by hand | `scripts/guide/screenshots.mjs`, run by `.github/workflows/guide-screenshots.yml` |
| A throwaway copy seeded with invented companies, people, addresses | local Supabase stack on the GitHub runner, `scripts/guide/seed.mjs` from `scripts/guide/fixtures.mjs`; never production (localhost only, plus `scripts/assert-not-prod.mjs`) |
| Navigates to the screen and finds elements by selector | front matter keys `screen`, `account`, `before`, `marks` (format in `docs/guide/SCREENSHOTS.md`) |
| Box, arrow and numbered markers matching the step numbers, in the accent colour | `lib/guide/annotate.mjs`, colour read from `--color-rc-orange` in `app/globals.css` |
| Desktop and 390 px | `public/guide/<id>-desktop.png` (1440 wide) and `-mobile.png` (390 wide) |
| Re-running regenerates every picture | the workflow runs on every change to the guide paths, or by hand |
| No real name ever; a check that fails on a listed name in the fixtures or the picture source data | `docs/guide/real-names.txt`, `npm run check:guide-privacy` (a quality step), `tests/e2e/guide-privacy.spec.ts` |
| A lesson without a picture shows "fără imagine" | the 3 not reached are listed under `skipped` in `docs/guide/screenshots.json`; the card itself is PR 3 |

Not covered yet, by design: the `/ajutor` pages (PR 3), the FAQ (PR 4), the PDF (PR 5), the menu entry
(PR 6). Nothing is visible to users. No database change, no new table, no cookie, no read tracking.

## Result

- 45 lessons, 87 pictures, 3 not reached:
  - `verifica-document` and `retrimite-document` on the phone: their only mark is the menu link, which
    the phone hides behind the menu button. The review screen itself needs a document read by the
    extraction partner and is not seeded.
  - `meniu-telefon` on desktop: a phone-only lesson.
- On many phone pictures step 1 (the menu link) is not marked, for the same reason; the other steps are.
- The pictures weigh about 16 MB (phone pictures at double density, so they stay sharp on a phone).

## Picture runs

| Run | Result | What changed after it |
|---|---|---|
| 39294223800 | 84 made, 6 not | migration 0049's ~80 empty roofing products flooded the stock screens; deactivated on the test stack only. Markers avoid neighbouring buttons. Height capped. A lesson clicked a product with no movements. |
| 39295773556 | 85 made, 5 not | a form below the cap: scroll down instead of dropping it |
| 39297025588 | 85 made, 5 not | `window.scrollBy` moved nothing: the app scrolls in its own panel |
| 39298271400 | 87 made, 3 not | the phone invoice picture started mid-page: scrolled panels reset first |
| 39299585065 | 87 made, 3 not | committed |

## Commands run locally

- `npx tsc --noEmit`: exit 0. `npm run build`: exit 0.
- guide specs (`guide-privacy`, `guide-screenshots`, `guide-source`): 36 passed, with the committed pictures.
- `npm run check:guide-privacy`: ok (3 names, 62 files). `npm run check:guide-source`: ok.
- check:card-ids, check:unique-ids, check:open-branch-ids, check:no-destructive-migration,
  check:conflict-residue, check:categories, check:ledger-rows, check:no-prod-target,
  check:pending-schema-reads, check:removal-safety, check:assertion-register: exit 0.
- check:board-edit: refused while the card was in_flight; this commit ships it.
- The end to end suite and the picture runs need Docker: CI only.

## Defects hit

Four entries in `docs/LEARNINGS.md` (conflict-residue on a bare path, the 0049 catalogue, markers on
neighbouring buttons, a testMatch that matched the worktree folder name). The scroll fixes are in the
table above.

## Întrebare pentru Max

The two lessons about checking a supplier document show only the upload screen, because the review
screen needs a document that the reading service has already read. Recommended: a later small PR seeds
one invented, already read document so those two lessons get the review screen. Until then they show
the upload screen on desktop and "fără imagine" on the phone.
