# EXECUTOR (after AUTHOR) - G62, finding F26, card P3-105, ruling R-214

**Date:** 2026-09-27
**Roles, in order:** AUTHOR (ruling and card), then EXECUTOR (code and proof), in
one pull request.
**Branch:** `card/p3-105`, cut from `origin/main` at `7191704`, merged forward to
`31a92b6`.
**Card:** P3-105, allocated with `npm run id:free -- P3-105`, exit 0.
**Ruling:** R-214, allocated with `npm run id:free -- R-214`, exit 0.
`decisions/NEXT-RULING-ID` advanced to `R-215` in the same commit as the ruling.

---

## What changed for Rapid Construct, in plain words

When the machine that reads supplier documents blames one thing and our own check
blames another, the person checking the document now sees both answers instead of
only the machine's. The machine's sentence still comes first and is unchanged.
Our own answer appears underneath it, in plain Romanian, and only when the two
actually disagree. On a document where they say the same thing, or where our check
did not run, nothing new appears.

---

## R-214 CONFIRMS R-190. IT DOES NOT NARROW IT, AND THAT IS THE POINT

The two cards before this one moved doctrine: R-212 narrowed R-190 and R-208 for
one payload shape, and P3-83 superseded part of R-197. **This card narrows
nothing, supersedes nothing, and marks no sentence false.**

R-190 already ruled everything this card relies on, in the owner's words:

> "when the payload carries an error_code, it is authoritative. Our classification
> runs anyway and is recorded, never substituted. ... when ours and theirs
> disagree, persist theirs, record both plus the arm name. **The disagreement is
> data, not an error.**"

R-214 quotes that clause and marks it **CONFIRMED**. R-212's single narrowing of
its first clause is untouched and remains the only narrowing R-190 carries.

**BOTH CODES WERE ALREADY BEING STORED, AND ONLY THE SCREEN WAS MISSING ONE.**
That is the whole shape of the defect and it is worth stating plainly, because it
is the reason no supersession was written. EXT-26 shipped R-190 faithfully:
`extraction_drafts.platform_error_code` and `platform_arm` have been written on
every qualifying payload since, migration 0037 created them, and
`hasExtractionPlatformVerdict` has probed for them ever since. Nothing about the
write was wrong. `draftColumnsFor` in `lib/data/extraction.ts` simply never
selected the two columns, so the review screen could not show what the database
had been holding correctly all along.

---

## What was built

### 1. The ruling and the card (AUTHOR)

- `decisions/inbox.md`: **R-214**, stating that the two fields answer different
  questions and may disagree, that showing both is the presentation of R-190's
  "the disagreement is data", and that nothing about which code is authoritative
  changed. It quotes R-190's clause as CONFIRMED, and its `Supersedes:` line reads
  "nothing".
- `decisions/NEXT-RULING-ID`: advanced to `R-215`, in the same commit.
- `docs/board/rc-board-phase3.json`: card **P3-105**, with `plain`, `defaults`,
  `depends_on` and a machine-checkable `acceptance`.

### 2. The Romanian words for each arm, where a proof can read them

`lib/data/extraction-types.ts`, beside `EXTRACTION_ERROR_LABEL`:

| arm | Romanian |
|---|---|
| `header_inconsistent` | cifrele din antetul documentului nu se potrivesc intre ele |
| `no_lines` | nu am gasit linii in document |
| `line_total_missing` | o linie nu are total |
| `target_missing` | lipseste totalul cu care ar trebui comparate liniile |
| `anchor_unknown` | nu am putut afla cu care total sa comparam liniile |
| `line_sum_missed` | liniile nu se aduna la totalul documentului |

(Written on screen with full diacritics; this table drops them only because this
file forbids nothing about them and the board and commit text elsewhere follows
the same plain-ASCII habit for tables.)

Plus `PLATFORM_VERDICT_PREFIX = "Verificarea noastra: "` and
`platformVerdictSentence(arm)`, which composes the whole line from one place.

**THE ARM AND NOT THE CODE.** Five of the six arms carry `unreadable_document`,
which migration 0037's own column comment states, so the code alone cannot say
why. The arm can.

**A `Record` AND NOT A `Partial`**, for the reason `UNIT_MEANING` records in
`components/settings/UnitSettings.tsx`: a seventh arm must fail the build until
somebody writes what it means. A `Partial` would ship a silent blank line.

**`ScanArm` ARRIVES BY `import type`.** `lib/data/reconciliation.ts` carries
`"server-only"` and already imports from `extraction-types`, so a value import
would have been both a runtime cycle and a server file dragged into a client
component. A type-only import is erased at compile time. Copying the union would
have compiled and would have destroyed the only thing the `Record` is for.

### 3. The read, gated

`lib/data/extraction.ts`: `PLATFORM_VERDICT_COLUMNS` appended to the draft select
**behind `await hasExtractionPlatformVerdict(supabase)`**, exactly the shape every
other optional suffix in `draftColumnsFor` uses. Without the columns the extra
line does not appear, which is the correct empty answer. `mapDraft` asks
`isScanArm` rather than casting, so an unrecognised value reads as "no verdict"
instead of reaching the label record and printing `undefined`.

`grep -n "platform_error_code" lib/data/extraction.ts` returns three lines: the
gated constant and the two `mapDraft` fields. There is no unconditional select.

### 4. The screen

`components/orders/ExtractionReviewPanel.tsx`, in the failure block: one
paragraph under the sender's block, rendered **only** when the arm is present AND
our code is present AND the two codes differ. It carries
`data-testid="draft-platform-verdict"` and `data-platform-arm`.

**WHAT DID NOT MOVE.** `data-testid="draft-error-sentence"`, `data-error-code` and
`data-testid="draft-reason"` keep their exact markers, their exact text and their
exact position. `reason` is still shown as the sender sent it. The new paragraph
carries the same classes as its sibling `draft-reason` and therefore needs no
phone class of its own; no new local copy of one was written.

---

## The proof

`tests/e2e/extraction-both-failure-codes.spec.ts`, four cases:

1. **The Matnord shape.** A scan-sourced `failed` payload with the sender's
   `reconciliation_failed` and no `lines` key at all (EXT-20 answers 400 to a scan
   failure that carries it, so a scan failure has no lines and our arm is
   `no_lines`). Asserts the stored row carries the sender's code and reason, our
   `unreadable_document` on `no_lines`, and that the two differ. On screen:
   the sender's sentence first with its own markers, then
   `Verificarea noastra: nu am gasit linii in document`, asserted both literally
   and composed from `PLATFORM_VERDICT_PREFIX` and `PLATFORM_ARM_LABEL`, with the
   arm read from `data-platform-arm`. The ORDER is asserted with
   `compareDocumentPosition` rather than assumed. Then the phone check at
   390x844: the line is visible, reads the same, and the page does not scroll
   sideways.
2. **The codes agree.** Same shape with the sender's code set to
   `unreadable_document`, so ours coincides. `draft-platform-verdict` count 0.
3. **Our verdict is absent.** A digital payload, on which our classification does
   not run: both columns null, `draft-platform-verdict` count 0, and
   `draft-reason` still reads back what the sender sent.
4. **The labels.** The exact string for two arms, and that all six are written,
   non-empty and distinct.

**THE MATNORD ORDER IN THE FINDING IS A REAL PRODUCTION ROW AND WAS NEVER READ.**
No live site was opened, no production row was queried, no credential was sourced.
Only the SHAPE was reproduced, and the fixture is built by hand with
`TEST`-prefixed values carrying the run id and a per-case tag, per the P3-101
learning.

---

## Commands run on this machine, each alone, each exit 0

```
npx tsc --noEmit
npm run build
node docs/board/validate-board.mjs (all three boards, before every commit)
npm run check:card-ids
npm run check:board-edit
npm run check:unique-ids
npm run check:open-branch-ids
npm run check:no-destructive-migration      (0 files)
npm run check:conflict-residue
npm run check:categories
npm run check:ledger-rows
npm run check:no-prod-target
npm run check:pending-schema-reads
npm run check:removal-safety
npm run check:assertion-register
npm run check:reconciliation
npm run check:board-clock
npx playwright test tests/e2e/extraction-both-failure-codes.spec.ts --list   (4 tests)
```

**THIS MACHINE HAS NO DOCKER AND NO SUPABASE CLI.** The bare-postgres migration
apply, both applier proofs and the End to end suite run only in CI, and nothing
here claims otherwise. The phone check at 390x844 is an assertion inside the new
spec and therefore runs in CI with the rest of it.

**NO MIGRATION.** `git diff --name-only origin/main...HEAD` lists no file under
`supabase/migrations/`. Both columns have existed since 0037 under EXT-26.

**ANDRE TOLD: NO CHANGE TO WHAT HIS SIDE SEES.** No route file is edited. No
status code moves, no error text changes, no payload shape is newly accepted or
newly refused.

---

## Coordination with ORANGE

`git fetch origin` then `git merge origin/main` before the push. One conflict, in
`docs/board/rc-board-phase3.json`, in the header only: ORANGE's side recorded the
artifact URL this board was first published at, in `renders_to`; our side bumped
`as_of` for the new card. **Both sides were kept**, neither was picked over the
other, and the validator and `check:conflict-residue` both exited 0 before the
resolution was committed.

---

## Left for the owner

Merge approval. **No pull request self-merges any more**: real client data has
been in production since 2026-09-14, so the merge question is filed in the
factory mailbox with the pull request number and the head sha, and the owner
decides.
