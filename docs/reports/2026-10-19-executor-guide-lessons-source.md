# Report: guide PR 1 of 6, the content source and the lesson list (P3-319)

Role: EXECUTOR. Date: 2026-10-19. Branch: `card/p3-319`. Draft pull request, not marked ready.
The brain marks it ready after the owner approves the lesson list (factory question
`guide-lesson-list`).

## Ce acoperă

Checked against the brief's step list ("FIRST, MEASURE" and "THE LESSON FORMAT", "ONE CONTENT
SOURCE", delivery step 1):

| Brief item | Done in this PR |
|---|---|
| List every screen and every action, grouped by menu section | `docs/guide/MEASURE.md` sections 2 and 3 |
| List the roles and which screens each role sees | `docs/guide/MEASURE.md` section 1 |
| Read the design tokens | `docs/guide/MEASURE.md` section 5 |
| Show the lesson list and chapter order before anything else | the factory question file; the PR body |
| One structured source with front matter (id, chapter, order, roles, title, steps, screenshot ids) | `content/guide/<chapter>/<lesson>.md`, 6 chapters, 40 lessons; reader and rules in `lib/guide/source.mjs` |
| Title as a Romanian verb phrase, under 200 words, numbered steps with exact labels, a "Vezi și" line | enforced by the check (title starts with "Cum ", under 200 words counted with the title, the steps and the Vezi și line, every bold label found in `app/`, `components/` or `lib/`, every Vezi și link resolves) |
| Screenshot ids only | one id per lesson, no image |
| A test for the front matter, the word limit and the Vezi și links | `tests/e2e/guide-source.spec.ts`, plus `npm run check:guide-source` |

Not covered yet, by design: the screenshot and annotation script (PR 2), the `/ajutor` pages and
the role filtering at render time (PR 3), the FAQ (PR 4), the PDF and its freshness test (PR 5),
the "Ajutor" menu entry (PR 6), the test that pages and source agree (PR 3), the real-name check
on images (PR 2). Nothing is visible to users: no route, no menu link, no link from any screen.

## What was built

- 6 chapters, one per main menu group, in menu order: Principal, Intrări, Relații, Stoc,
  Facturare, Configurare.
- 40 lessons (the longest is 113 words, the average 80). 23 are visible to both roles; the other 17
  are Administrator only (owner).
- `lib/guide/source.mjs` reads the files with a small front matter reader (no new dependency)
  and validates them. `lib/guide/source.d.mts` types it for the spec.
- `npm run check:guide-source` runs the same rules from node.
- The spec has 14 cases: the real guide has no problem, chapter order equals the `NAV` order,
  every Vezi și resolves and is visible to the same roles, every lesson is under 200 words, and
  one failing case per rule (missing target, hidden-role target, 200 words, label not in the
  app, bad title, empty or unknown roles, steps count, hand-numbered step, screenshots count,
  see_also count, order gap, unknown chapter, bad id, em dash, en dash, cedilla letters,
  duplicate ids and screenshot ids, chapters out of order, unknown or uncovered menu groups,
  the reader refusing a file without a header).

## Commands run and results

Run from `/Users/sm33xy/Projects/rc-inventory-worktrees/guide-lessons-source`:

- `npx tsc --noEmit`: exit 0.
- `npm run build`: exit 0, no new route in the route list.
- `npm run check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
  `check:no-destructive-migration`, `check:conflict-residue`, `check:categories`,
  `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`,
  `check:removal-safety`, `check:assertion-register`: each exit 0.
- `npm run check:board-edit`: exit 0 (re-run after the commit; before it, it reports "not a pull
  request").
- `npm run check:guide-source`: exit 0, 6 chapters, 40 lessons.
- `npx playwright test --config scratchpad/pw-guide.config.mjs` (a local, uncommitted config with
  no app servers): 14 passed. `npx playwright test --list tests/e2e/guide-source.spec.ts` with
  the real config lists the same 14, so CI runs them.
- Board validator on the three boards: PASS, 0 violations.

Not run here: the end to end suite and the applier proofs (no Docker). None of them is touched by
this PR, which has no migration and no application code.

## Question for the owner

The lesson list is in the factory question `guide-lesson-list`. The PR stays a draft until the
owner answers.

## Intrebare pentru Max (structure the brief does not cover)

Listed in the PR body and in `docs/guide/MEASURE.md` section 4: signing in and out, the phone
menu, the refusal and error pages, and the shared behaviour a beginner meets everywhere (typing a
date, the search list, paging). The brief says not to bend the structure, so none of it became a
chapter.

## Learnings

One entry appended to `docs/LEARNINGS.md` (P3-319).
