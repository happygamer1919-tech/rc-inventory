# Executor report: P3-122, leads import brought to Item 3's standard

Role EXECUTOR (BLUE), goal LB11, 2026-10-02.

## Boot

Boards read: `docs/board/rc-board-phase2.json` (68 shipped, 32 todo, 2 blocked, launch gate 6/9)
and `docs/board/rc-board-phase3.json` (138 shipped, 43 todo, 1 blocked at the time of boot). Card
P3-122 was `todo`, eligible (depends only on P3-121, shipped). Repo CLAUDE.md sections 1, 2, 3,
3.1, 5b, 6, 8.0, 8.1, 9, 9b, 9c, 10 and 11 read. Worktree created at
`/Users/sm33xy/Projects/rc-inventory-worktrees/lb11-p3-122-leads-import`, branch `card/p3-122`,
cut from `origin/main` at `e12244d`, matching the task brief exactly.

## What this card is, in plain words

The lead import screen already works and is used daily against real client data. This card adds
four things Ivan asked for (Item 3) without changing how the screen behaves for the operator who
already uses it: a downloadable model file with a filled-in example row and the required column
marked, written Romanian instructions on the screen itself, a `Motiv` (reason) column on the
file of rejected rows, and a check that the import now shares its CSV reader with the other three
entities being built on the same foundation.

## The four things, each against the card's own six clauses

**Clause 2, the model file.** `templateCsv()` in `lib/data/lead-import-types.ts` now calls
`buildModelCsv` from `lib/data/import-shared.ts` (P3-121's export, built for exactly this) with a
new `IMPORT_FIELD_EXAMPLE` map, one plausible Romanian value per field. Only `Denumire` (name) is
marked required on the header (`Denumire *`): `Telefon` and `Email` require ONE of the two, not
both, and marking both required on the template would state a stricter rule than `prepareRow`
actually enforces. `ownerName` and `followUpDate` are left empty in the example on purpose: an
invented responsible name would be refused (`unknownOwner`), and `Lead rece` needs no follow-up
date. The entry button on the Clienti/Leaduri view (`components/clients/ClientsScreen.tsx`,
`data-testid="leaduri-import"`) is relabelled `Importă din CSV` and the in-sheet download button
(`components/clients/LeadImportSheet.tsx`, `data-testid="import-template"`) is relabelled
`Descarcă modelul de import`, both exactly as Item 3 words them. **Interpretation note**: Item 3's
text calls the download a "link"; the existing element is a `<Button variant="secondary">`. I kept
it a button rather than swap the element type, since D5 says this card adds to the screen rather
than redesigning it, and no acceptance line or card clause names the HTML element.

**Clause 3, written instructions on screen.** A new `leadImportInstructions()` function in
`lib/data/lead-import-types.ts` returns five Romanian sentences built from the same constants and
lists the import already uses (`IMPORT_FIELD_LABEL`, `CLIENT_TYPE_LABEL`, `CLIENT_STAGES`,
`CLIENT_STAGE_LABEL`, `CLIENT_SOURCES`, `CLIENT_SOURCE_LABEL`, `IMPORT_MAX_ROWS`,
`IMPORT_MAX_BYTES`), so the screen can never state a number or a list that drifts from what the
import actually enforces. Rendered in step 1 of the wizard (`LeadImportSheet.tsx`,
`data-testid="import-instructions"`), as plain paragraphs with no button and no form field, so the
390x844 target-size rule (case 6) does not apply to it at all.

**Clause 4, the `Motiv` column.** Checked before writing anything, per the task brief's own
instruction: `skippedCsv` in `lead-import-types.ts` was already a one-line wrapper over
`buildErrorCsv` from `import-shared.ts`, which already writes the header row
`["Rând", "Motiv", ...headers]`. **No code changed for this clause.** The new named case
(acceptance d) is a regression guard over existing behaviour, exactly as the task brief predicted,
and it is written as such in the test (a comment says so).

**Clause 1, the shared parser and preview, Drafter's Decision A.** Kept the lead path on its own
`prepareRow`/`PreparedRow`/`buildPlan`/`mergeWithinFile`, and did **not** move it onto
`prepareImportRow`/`buildImportPreview` from `import-shared.ts`. Checked by hand against all eight
existing cases before writing anything, per the task's own instruction to stop at the seam rather
than edit a test. Four lead-specific behaviours the generic preview cannot express without
changing behaviour or widening the shared descriptor past what P3-123 to P3-125 should inherit:

1. **Telefon OR Email, at least one** (`IMPORT_REASON.noContact`) is a requirement on *two*
   fields together. `ImportFieldDescriptor.required` is a requirement on *one* field; there is no
   "at least one of these two" shape in the descriptor.
2. **Etapă and Sursă have a default on an empty cell**, not a validation that refuses it: an empty
   stage becomes `cold`, an empty source becomes the screen's `fallbackSource`. The descriptor has
   `required` (refuse empty) or `validate` (check what is written); it has no "empty means X".
3. **The duplicate is searched in the file AND in the database, together**, with "the file wins
   over the database" as an ordering rule (`buildPlan`). This needs every row and the whole
   existing-client list at once; `buildImportPreview` validates one row, independently, with no
   database read at all.
4. **G70 (G17): contact person is askable only on a stored client the file actually matched**
   (`addContactNameFillable` in `lead-import-actions.ts`). This is a question about the *result*
   of matching, which does not exist yet when a single row is validated in isolation.

Left a comment directly above `PreparedRow` in `lib/data/lead-import-types.ts` naming all four,
and the same four are recorded in card P3-122's `notes` on the board, because P3-123, P3-124 and
P3-125 build their own entity imports on the same shared preview and need to know in advance which
shapes it does, and does not, cover.

## What was NOT touched

No `lead=` prop was renamed: `components/ui/primitives.tsx` was not opened, and a grep of every
changed file for `lead=` finds only the pre-existing `PageHeader` usages, untouched (verified
below). No migration file. No new `package.json` dependency. D8 (MDL-only currency) is untouched;
leads carry no currency field and none was added. The dedupe rule stays phone-or-email (the wider
rule); the instructions name email as Item 3's key while documenting that phone is also checked,
per the card's own `defaults`.

## Acceptance, verified locally

This machine has no Docker and no Supabase CLI, so the Playwright suite itself runs only in CI
(`KNOWN-FAILURES.md`). Verified instead:

- **(a)** `tests/e2e/lead-import.spec.ts`'s eight original test bodies are byte-for-byte unchanged;
  only new imports and new `CASE` entries (`overwrite: 8`, `motiv: 9`) were added above them, and
  four new `test(...)` blocks were added after the last original one. `git diff` on this file shows
  no line inside any of the eight original `test(...)` bodies touched.
- **(b)** `import leaduri: modelul descarcat are antetele, un rand exemplu si coloanele
  obligatorii marcate`, written. A standalone smoke test (below) proves the underlying claim
  (header, example, single required marker, and the example preparing with zero errors through
  `prepareRow` directly) before trusting the e2e version of the same claim to CI.
- **(c)** `import leaduri: instructiunile romanesti numesc campurile obligatorii, valorile
  acceptate, regula de dublare si cele doua limite`, written, checks the five things by substring
  against the real constants.
- **(d)** `import leaduri: fisierul randurilor nepreluate are coloana Motiv`, written, a
  regression guard as explained above.
- **(e)** `import leaduri: un dublat nu suprascrie niciodata o valoare scrisa de om`, written: a
  stored client with `address` already set and `email` empty, a file row offering a different
  address and a new email, operator chooses "Completează", and after the import `address` is
  unchanged while `email` is filled, proving both halves (never overwritten, empty gets filled) in
  one case with its own name.
- **(f)** Grepped every changed file for `lead=`: the only matches are the pre-existing
  `PageHeader` `lead=` props in `ClientsScreen.tsx`, present before this card and untouched.
- **(g)** `npx tsc --noEmit` exit 0. `npm run build` exit 0. Grepped every changed file for U+2014
  and U+2013: zero occurrences.

**Standalone smoke test**, since the suite itself cannot run here: compiled
`lib/data/import-shared.ts`, `lib/data/clients-types.ts` and `lib/data/lead-import-types.ts` alone
with `tsc` to plain CommonJS, outside the checkout, and ran a small script with
`node:assert/strict` against the compiled output: `templateCsv()` produces exactly two rows with
exactly one ` *` marker on `Denumire *`; the example row, read back through `prepareRow` directly
with the real field order as the mapping and no fallback source, returns `ok: true` with no error;
`leadImportInstructions()` names the row limit, the byte limit in MB, the required field and the
word `dublat`, and names `Email` as the dedupe key. 3 checks (7 individual assertions), 0 failed.
The compiled output and the script were written under `node_modules/.tmp-smoke-p3-122/`
(gitignored, nothing committed) and are not part of this pull request.

## Local verification, full list

1. `npx tsc --noEmit`, exit 0.
2. `npm run build`, exit 0, full production build.
3. The standalone smoke test above, 3 checks, 0 failed.
4. `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`,
   `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`,
   `check:removal-safety`, `check:assertion-register`, all exit 0, run individually.
   `check:board-edit` reports "NOT A PULL REQUEST" before the first commit, as expected; re-run
   after committing. `check:conflict-residue` run after `git add`, before each commit.
5. `node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json
   docs/board/rc-board-phase3.json`, exit 0.

No migration: `git diff --name-only origin/main...HEAD` carries no path under
`supabase/migrations/`, and `check:no-destructive-migration` parsed 0 files. No new dependency in
`package.json`.

## Where the card and the task file could be read two ways

The task file's "DRAFTER'S DECISION A" framing suggested migrating the lead preview onto the
shared one was the preferred outcome if at all possible; the card itself is neutral and says
"ACCEPTANCE (a) OUTRANKS A TIDIER INTERNAL SHAPE." Both agree on the outcome once the four
blockers above are checked against the eight cases: stop at the seam. No other disagreement found
between the card and the task file.

## Defects met while working this card

None. Nothing appended to `docs/LEARNINGS.md`, per CLAUDE.md section 9: a card that hits no
defects says so and appends nothing.

## GREEN's and ORANGE's parallel work

GREEN's `card/p3-131` touches `components/tasks/**`, `lib/data/tasks*`, `app/(app)/sarcini/**`,
`app/(app)/crm/page.tsx`, `lib/nav.ts`, `components/ui/Icon.tsx`, `tests/e2e/tasks.spec.ts` and
`tests/e2e/crm-landing.spec.ts`, no overlap with this card's files. The two shared files
(`docs/board/rc-board-phase3.json`, `docs/LEARNINGS.md`) were checked for a conflict before
pushing; `docs/LEARNINGS.md` carries no new entry from this card, so only the board file needed the
keep-both-sides merge rule if a conflict appeared.

## Merge

**Not merged by this terminal.** Repo CLAUDE.md section 3.1's self-merge grant, and every other
terminal grant, is treated as revoked since real client data went into production on 2026-09-14
(section 8.2, 8.6, and the factory's own close-out block step 8), consistent with how P3-121's own
report handled the same PR gate. `mailbox/questions/` carries the owner-approval question for this
PR once it is open and green, naming the PR number, head sha, and a one-sentence plain-words
summary. This PR carries no migration, so no destructive-migration review and no applier proof
apply.

## Board

Card P3-122 written to `in_flight` (not `shipped`) until the `quality` run on this PR's head sha is
green; `evidence` will be added once that run exists, naming the pull request and the actual green
run id, not a red first run. Drafter's Decision A's resolution, and the four shapes the shared
preview does not cover, are recorded in the card's `notes` for P3-123 to P3-125.
