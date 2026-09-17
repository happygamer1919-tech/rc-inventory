# EXECUTOR: rulings R-199 to R-202, and a read-only triage of findings F2 to F9

**Role:** EXECUTOR
**Date:** 2026-09-17
**Branch:** `rulings/20260917-r199-r202`, cut from `origin/main` at `531b64f`
**Files changed:** `decisions/inbox.md`, `decisions/NEXT-RULING-ID`, and this report. Nothing else.

---

## Part 1. Four rulings recorded

| ruling | id | owner | subject |
|---|---|---|---|
| Ra | **R-199** | Ivan | Andre connection close criteria |
| Rb | **R-200** | Ivan | Rotation timing, no backstop date |
| Rc | **R-201** | strategy chat | Local failure-shape measurements of 2026-09-17 |
| Rd | **R-202** | strategy chat | Failure-shape contract frozen until close |

**Counter moved `R-199` to `R-203`**, in the same commit as the rulings, which is
the convention commit `31fd8f8` established when it added R-198.

**The gate before appending.** `decisions/NEXT-RULING-ID` read `R-199` and the
highest `### R-NNN` in `decisions/inbox.md` was `R-198`. They agreed, so no stop.
The only open pull request, `#316` on `card/p3-69`, was checked directly: its
branch carries counter `R-199` and highest heading `R-198`, identical to main, so
it claims no id and there was no collision to avoid. That check matters because
the counter only knows what has merged, and this repository has paid for id
collisions four times.

**Format was copied, not invented.** Commit `31fd8f8` was read for the exact
shape: `### R-NNN - <title>`, then `**Date:**`, `**Asked on:**`,
`**Answer, verbatim:**` with the dispatch quoted in a `>` block, the ruling body,
and closing `**Unblocks:**` and `**Supersedes:**` lines. Rulings are separated by
one blank line with no horizontal rule, which is how R-197 meets R-198.

**Verification, each exit code captured on its own line:**

    node docs/board/validate-board.mjs (all three boards)   rc=0
    npm run check:unique-ids                                rc=0
    npm run check:open-branch-ids                           rc=0
    npm run check:conflict-residue                          rc=0
    npm run check:board-edit                                rc=0
    npm run check:card-ids                                  rc=0
    npm run check:board-clock                               rc=0

`check:unique-ids` reported it in its own words:

    origin/main   198 ruling id(s)
    this branch   4 new ruling id(s): R-199, R-200, R-201, R-202
    decisions/NEXT-RULING-ID  R-203, highest allocated 202
    OK. 231 card id(s) across 3 boards and 202 ruling id(s) are each unique,
    0 redefined against main.

Headings land in consecutive order R-197 through R-202, no duplicates, and the
file carries zero em or en dashes.

**One addition to what the dispatch dictated, flagged rather than silent.** The
dictated Rc gave the verbatim error string for C6 and C7 but described C8's rule
in words only. R-201 records C8's measured string in full,
`lines interzis pe o scanare esuata: cheia nu are voie sa fie trimisa deloc`, so
that a later reader does not conclude it went uncaptured. Nothing else was added
to any ruling body.

---

## Part 2. Read-only triage of F2, F3, F5, F6, F7, F8, F9

**None of these is a card id.** They are review findings from
`docs/reports/2026-09-14-author-p3-review-findings.md`, and that report carded
them under `P3-` ids. No card on any of the three boards has an id matching
`F<number>`.

**Every one of them is already shipped.** This table is a status record, not a
work queue.

| finding | card | owner_terminal | status | depends_on | CONTRACT / INTERNAL | MIGRATION | files the card's pull request touched |
|---|---|---|---|---|---|---|---|
| F2 lead fields | `P3-48` | executor | shipped (#289) | none | INTERNAL | no | client screens and form, board, report, `leaduri.spec.ts` (10 files) |
| F3 documents upload | `P3-15` | executor | shipped (#293) | `P3-08`, `P3-09` | INTERNAL | **YES** `supabase/migrations/0044_documents.sql` | client and project pages, `DocumentsPanel.tsx`, `documents.spec.ts` (18 files) |
| F5 Leaduri view | `P3-50` | executor | shipped (#303) | none | INTERNAL | no | `ClientsScreen.tsx`, `Topbar.tsx`, board, `crm-landing.spec.ts` (7 files) |
| F6 + F7 wording | `P3-51` | executor | shipped (#302) | none | INTERNAL | no | `page.tsx`, `memento/page.tsx`, `ClientTabs.tsx`, `InventoryScreen.tsx`, `copy-fixes.spec.ts` (10 files) |
| F8 filters | `P3-52` | executor | shipped (#301) | none | INTERNAL | no | `ClientsScreen.tsx`, `ProjectsScreen.tsx`, `list-filters-layout.spec.ts` (6 files) |
| F9 button contrast | `P3-53` | executor | shipped (#299) | none | INTERNAL | no | `globals.css`, `Topbar.tsx`, `ExtractionReviewPanel.tsx`, `OrderDocumentUpload.tsx`, `primitives.tsx` (8 files) |

**F3 was never re-carded.** The author review states it plainly: the documents
upload "is not carded again: it is already card P3-15." So F3's entry above is
P3-15, which predates the review.

**Nothing found as NOT FOUND.** All seven resolve to a card.

### This lane's `owner_terminal`

**`executor`.** Every card above carries it. Across the phase 3 board the value is
`executor` on 115 of 116 cards; the single exception is `EXT-34`, which is `max`,
set when that card was blocked on the platform owner. The phase 2 board also uses
`poc-builder` and `author`, which are other lanes and not this one.

### Why all seven are INTERNAL

Judged from the changed-file list of each pull request, not from the finding
titles. **No pull request above touched `app/api/extraction/callback/route.ts` or
any `lib/data/extraction*` file.** They are CRM screens, list layout, Romanian
copy, colour contrast and document storage.

**The one that deserves a second look, and still comes out INTERNAL.** `P3-53`
(F9) edited `components/orders/ExtractionReviewPanel.tsx` and
`components/orders/OrderDocumentUpload.tsx`. Those are the review screen a person
looks at, not the callback a machine posts to. They change nothing about what the
route accepts, refuses or returns, so they do not engage the freeze in R-202.

### The MIGRATION flag, and a correction

**Only F3 / `P3-15` carried a migration**, `supabase/migrations/0044_documents.sql`.
The other five carried none.

**My first attempt at this flag was wrong and is corrected here rather than
quietly replaced.** A regex over each card's `acceptance` and `defaults` fields
reported that all eight cards "mention migration", including the favicon card and
the button-contrast card. It was matching the phase 3 board's standing `defaults`
boilerplate, which discusses migrations on every card. A detector that fires on
every input carries no information. The table above is derived from what each
pull request actually changed.

---

## State at the end

`origin/main` was `531b64f` when this branch was cut. Rulings R-199 to R-202 are
recorded, the counter stands at `R-203`, and no card was changed by this work, on
either board. `P2-13` stays parked per R-200, and the failure-shape contract is
frozen per R-202 until the Andre connection closes under R-199.

**Carried forward, not acted on here.** R-201 records an intermittent defect found
while measuring: a newly created inbound order existed in the database while the
orders list showed nothing for it across twenty seconds, which failed a test
fixture once and passed on a clean re-run. It is unrelated to the extraction
contract and belongs to whoever picks up the orders list next.
