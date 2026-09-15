# Executor report: P3-52, the Leaduri and Proiecte filters on one row

- **Role:** EXECUTOR (factory lane B, BLUE worker), run date 2026-09-15 UTC.
- **Card:** P3-52, ends this run `todo` on the board by instruction: this lane builds and
  pushes the branch, never opens a pull request and never edits the board. The later task
  that opens the pull request flips the card.
- **Branch:** `card/p3-52`, cut from origin/main `3561430`. Pushed. No pull request.

## Plain words

On the leads list and the jobs list the search box and each filter used to take a whole
line of their own. They now sit side by side on one line, the way the stock list already
shows them. Nothing else on either screen changes. No database change.

## What changed

- `components/clients/ClientsScreen.tsx`: the `clients-filters` row went from
  `flex flex-wrap` with the search in a `min-w-[280px] flex-1` wrapper to
  `grid grid-cols-[1.6fr_1fr_1fr_auto] items-center gap-3`, with the search Input as a
  direct grid child.
- `components/projects/ProjectsScreen.tsx`: the `projects-filters` row the same way,
  `grid grid-cols-[1.6fr_1fr_1.2fr_auto] items-center gap-3` (the client select gets a
  little more room, client names being the longest option text).
- The final `auto` column holds Șterge filtrele, so the selects stay on the row when it
  appears.
- Every `data-testid`, control and option is unchanged. `components/ui/primitives.tsx`
  (the shared field class) is untouched. The view switch and the stage chips above the
  Leaduri filters are untouched.
- New `tests/e2e/list-filters-layout.spec.ts`, committed on its own first (`5b7bcfa`,
  the red arm), then the layout fix (`84a7654`).
- `docs/LEARNINGS.md`: one entry, "A w-full field inside a flex-wrap row takes a whole
  line of its own".
- No migration was added.

## The spec

At the suite's 1440 by 900 viewport, signed in as the owner, no database writes:

1. `/inventar`, the control: every visible control in the row holding the search box
   "Caută după denumire sau cod SKU" (at least five) has its vertical centre within 4px of
   the search box's.
2. `/clienti?vedere=leaduri`: `clients-type` and `clients-status` within 4px of
   `clients-search`; search at least 240px wide; no clear button shown.
3. `/proiecte`: every visible control in `projects-filters` within 4px of
   `projects-search`; search at least 240px; no clear button shown.
4. The 240px width is asserted in cases 2, 3 and both case 5 tests.
5. `/clienti?vedere=leaduri&tip=company` and `/proiecte?stare=toate`: Șterge filtrele is
   visible, and the search and the selects still hold (2) and (3).

Measurements retry for up to ten seconds (`toPass`), so a reading taken before the page
settles decides nothing.

## Commands run and results

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 (after the spec, and after the fix) |
| `npm run build` | exit 0 (untouched tree, and with the fix) |
| `npm run check:card-ids` | exit 0 |
| `npm run check:board-edit` | **exit 1, expected in this lane**: P3-52 is `todo` at base and head because this task forbids the board edit. The pull request task flips the card. Same as P3-54 and P3-53. |
| `npm run check:unique-ids` | exit 0 |
| `npm run check:open-branch-ids` | exit 0 |
| `npm run check:no-destructive-migration` | exit 0, 0 files |
| `npm run check:conflict-residue` | exit 0 |
| `npm run check:categories` | exit 0 |
| `npm run check:ledger-rows` | exit 0 |
| `npm run check:no-prod-target` | exit 0 |
| `npm run check:pending-schema-reads` | exit 0 |
| `npm run check:removal-safety` | exit 0 |
| `npm run check:assertion-register` | exit 0 |
| board validator, all three boards | PASS, 0 violations, before every commit |
| `git diff --exit-code origin/main -- tests/e2e/leaduri.spec.ts tests/e2e/projects.spec.ts tests/e2e/products.spec.ts` | exit 0 |

## What did not run here, and is left for CI

`npx playwright test tests/e2e/list-filters-layout.spec.ts tests/e2e/leaduri.spec.ts
tests/e2e/projects.spec.ts tests/e2e/products.spec.ts` did **not** run. It needs the local
Supabase stack and the test accounts, and this machine has no Docker and no Supabase CLI.
The factory also forbids any database access from this machine. The pull request's
`quality` run is the first real run of the spec. If a red run in CI is wanted, the spec
alone is commit `5b7bcfa`.

**Local substitute, outside the repository:** a browser harness
(`/Users/sm33xy/Projects/rc-inventory-worktrees/p3-52-tools/layout-harness.mjs`) renders the
class strings read from the three screen files and `primitives.tsx` with the app's compiled
CSS, in headless Chromium at 1440 by 900, inside a card as wide as the main column (1128px),
and applies the spec's measurements.

- **Untouched tree (origin/main `3561430`):** Inventar control PASS (all five controls 0px
  off). Leaduri FAIL (type 51px, status 102px below the search, every control 1086px wide).
  Proiecte FAIL (51px, 102px). Both filtered cases FAIL the same way, clear button 155px
  down. 4 checks failed.
- **With the fix:** all checks PASS. Leaduri: search 467px, selects 292px, 0px off.
  Proiecte: search 442px, status 276px, client 332px, 0px off. Filtered: Leaduri search
  411px, Proiecte search 389px, clear button on the same row, 0px off. A client option 86
  characters long did not widen its column.

## Defects found

One, the card's own defect, entered in `docs/LEARNINGS.md`: `w-full` controls in a
`flex-wrap` row each take a full line.

## State at the end

- Branch `card/p3-52` pushed, level with origin/main at push time. Head sha in the factory
  mailbox note `q019-ready-branch-p3-52.md`.
- For the task that opens the pull request: flip P3-52 on `docs/board/rc-board-phase3.json`
  in that pull request (`last_checkpoint` from `date -u`, then `check:board-edit` and
  `check:board-clock`), sync with main, and state in the body that no migration was added.

## Second run: the pull request (factory task, same day)

- **Role:** EXECUTOR. The one open pull request slot was free (`gh pr list --state open
  --author @me` empty before opening), P3-53 having merged as `a0f1ec6`.
- **Pull request:** #301, head branch `card/p3-52`. Opened on the already pushed head so
  the board evidence could name its number, then the merge and the board flip were pushed
  in one push.

### Sync with main

`git merge origin/main` (`a0f1ec6`, never a rebase) conflicted in exactly one file,
`docs/LEARNINGS.md`: main had appended six entries (P3-15, P3-54) at the end and this
branch one (P3-52) at the same place. Both kept, main's entries first. The resolved file
equals origin/main's copy plus this branch's 20 lines, zero lines removed (`git diff
origin/main -- docs/LEARNINGS.md` shows 20 insertions and no deletions). The board merged
without a conflict. Commit `b467242`.

### Board flip

`P3-52` on `docs/board/rc-board-phase3.json`: `status` and `lane` shipped, `evidence` kind
`e2e` naming pull request #301 and `tests/e2e/list-filters-layout.spec.ts`,
`last_checkpoint`, `evidence.at` and the board `as_of` all `2026-09-15T18:45:34Z` read from
`date -u` before the edit, notes logging the defaults applied. Commit `3f214d1`.

### Commands run on the merged tree, and results

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| board validator, all three boards | PASS, 0 violations, before every commit |
| `npm run check:card-ids` | exit 0 |
| `npm run check:board-edit` | exit 0, P3-52 todo -> shipped, flipped |
| `npm run check:board-clock` | exit 0 |
| `npm run check:unique-ids` | exit 0 |
| `npm run check:open-branch-ids` | exit 0 (one other open branch, Orange's #300) |
| `npm run check:no-destructive-migration` | exit 0, 0 files |
| `npm run check:conflict-residue` | exit 0, after staging |
| `npm run check:categories` | exit 0 |
| `npm run check:ledger-rows` | exit 0 |
| `npm run check:no-prod-target` | exit 0 |
| `npm run check:pending-schema-reads` | exit 0 |
| `npm run check:removal-safety` | exit 0 |
| `npm run check:assertion-register` | exit 0 |
| `git diff --exit-code origin/main -- tests/e2e/leaduri.spec.ts tests/e2e/projects.spec.ts tests/e2e/products.spec.ts` | exit 0 |

Left to CI, as in the first run: the End to end suite with
`tests/e2e/list-filters-layout.spec.ts`, `leaduri.spec.ts`, `projects.spec.ts` and
`products.spec.ts`, which needs Docker and a local Supabase stack. The applier proof steps
are path-filtered and should skip, since no migration or applier file is touched.

### Defects found this run

None new. The one LEARNINGS conflict is the known append collision and needed no new entry.

### Merge

Not self-merged: real client data is in production. The owner approves, POC merges. The
quality run on the head sha and the owner question are recorded in the pull request and
in the factory mailbox, not here, because writing them into this file would move the head.
