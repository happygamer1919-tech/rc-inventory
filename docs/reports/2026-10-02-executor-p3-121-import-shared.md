# Executor report: P3-121, shared CSV import parser and preview

Role EXECUTOR (BLUE), goal LB10, 2026-10-02.

## Boot

Boards read: `docs/board/rc-board-phase2.json` (68 shipped, 32 todo, 2 blocked, launch gate 6/9)
and `docs/board/rc-board-phase3.json` (137 shipped, 44 todo, 1 blocked at the time of boot). Card
P3-121 was `todo`, eligible (depends only on P3-101, shipped). Repo CLAUDE.md sections 1, 2, 3,
3.1, 5b, 6, 8.0, 8b, 9, 9b, 10 and 11 read in full, plus `KNOWN-FAILURES.md` in the factory folder.
Worktree created at `/Users/sm33xy/Projects/rc-inventory-worktrees/lb10-p3-121-import-shared`,
branch `card/p3-121`, cut from `origin/main` at `e608b6c`, matching the task brief.

## What this card is, in plain words

Rapid Construct wants to load lists into the system from a spreadsheet, and get lists back out,
for leads, clients, projects and materials. The leads screen already does this well. This card
takes the working, entity-agnostic parts of that screen (reading a CSV file, writing one, matching
a spreadsheet column to a field, showing a preview with per-row errors before anything is saved,
and building a downloadable file of the rejected rows) out into a shared piece, so the three
remaining entities (P3-123 to P3-125) can sit on it instead of each writing their own version of
the same CSV handling.

## Where the line was drawn

`lib/data/import-shared.ts` (new) carries everything that does not know which entity it is
serving:

- `parseCsv`, `buildCsv`, `sniffDelimiter`, `normaliseKey` -- moved verbatim from
  `lead-import-types.ts`, byte-for-byte, no behaviour change.
- `buildSynonymIndex` and `autoMatchColumns` -- generalised from the lead-specific
  `SYNONYM_INDEX`/`autoMatchColumns` pair to take any entity's field list (`{field, label,
  synonyms}`) instead of `IMPORT_FIELDS`/`FIELD_SYNONYMS` directly.
- `IMPORT_MAX_BYTES`, `IMPORT_MAX_ROWS`, `IMPORT_SAMPLE_COUNT`, `IMPORT_SKIP`,
  `IMPORT_SKIP_LABEL` -- moved verbatim, same values P3-101 already used.
- `checkByteLimit`, `checkRowLimit`, `checkFileLimits` -- new. The lead screen's own messages
  (`TOO_BIG`, `TOO_MANY_ROWS` in `LeadImportSheet.tsx`) are untouched; these are the shared,
  reusable versions that state both the limit and the actual size, which is what acceptance (b)
  asks for and what the lead screen's existing messages do not do today.
- `buildErrorCsv` -- generalises `skippedCsv`'s body (the `Rând`/`Motiv` column shape).
- `buildModelCsv` -- new, for clause 2's "model file gains an example row and marked required
  columns", which P3-122 to P3-125 need and P3-121 does not use itself (the lead template stays
  header-only, unchanged, until P3-122 extends it).
- `validateCurrency` -- new, the D8 implementation: empty or `MDL` (any case) is accepted and
  normalised to `"MDL"`; anything else is refused with a Romanian reason naming MDL.
- `ImportFieldDescriptor<F>`, `prepareImportRow`, `ImportPreview<F>`, `buildImportPreview` -- new,
  the generic descriptor-driven row preparer and preview builder (detailed below).
- `RowNumber` -- moved (a type alias, "the row number as the operator sees it in Excel").

`lib/data/lead-import-types.ts` keeps everything that is lead knowledge: `IMPORT_FIELDS`,
`IMPORT_FIELD_LABEL`, the lead `FIELD_SYNONYMS` table (now passed into `buildSynonymIndex`),
`readStage`, `readSource`, `readType`, `readDate`, `normalisePhone`, `normaliseEmail`,
`templateCsv`, `TEMPLATE_FILE_NAME`, `SKIPPED_FILE_NAME`, `importNoteBody`, `PreparedLead`,
`PreparedRow`, `IMPORT_REASON`, `OwnerIndex`, `buildOwnerIndex`, `prepareRow`. It now **imports and
re-exports** the shared names under the same identifiers (`parseCsv`, `buildCsv`, `normaliseKey`,
`sniffDelimiter`, the three limits, `IMPORT_SKIP*`, `RowNumber`), and its own `autoMatchColumns`
and `skippedCsv` became one-line wrappers over the generic functions. No caller of
`lead-import-types.ts` needed any change: `git diff --stat` shows zero changes to
`lead-import-plan.ts`, `lead-import-actions.ts`, `components/clients/LeadImportSheet.tsx` or
`tests/e2e/lead-import.spec.ts`.

## The descriptor's shape, and how it was checked against P3-122 to P3-129

```ts
type ImportFieldDescriptor<F extends string> = {
  field: F;
  label: string;              // Romanian, shown on screen and as the CSV header
  synonyms?: string[];        // for column auto-match; label is always included
  required: boolean;
  example: string;            // for the model file's example row (P3-122 clause 2)
  validate: (raw: string) => { ok: true; value: string } | { ok: false; reason: string };
};
```

`prepareImportRow(cells, mapping, fields, line)` reads each field through the mapping, refuses a
required field that is empty with a generic Romanian reason naming the label, otherwise calls the
field's `validate`, and returns either `{ok: true, record}` once every field has passed, or
`{ok: false, reason, raw}` at the first failing field. `buildImportPreview` runs this over every
row of a file and partitions the results into `valid`/`invalid` with their counts.

Read against each downstream card before fixing this shape:

- **P3-123 (clients)**: needs required fields, a unit validator (against `ALL_UNITS`) and the D8
  currency validator. Both are expressible as a field's `validate` function; `validateCurrency` is
  already the right shape to plug in directly.
- **P3-124 (projects)**: the dedupe key (name plus client) and "the client column must resolve to
  an existing client, never create one" are rules that need to see the *whole file* and the
  *database*, not a single field in isolation. These stay as project-specific logic built on top
  of `buildImportPreview`'s output (same shape `lead-import-plan.ts` already uses on top of
  `prepareRow`), not inside the shared module. This is exactly where clause 2 draws the line:
  entity-specific dedupe and cross-row logic never moves into `import-shared.ts`.
- **P3-125 (materials)**: the unit-after-first-movement lock needs a database read (has this
  product moved) that a pure field `validate` cannot perform; it is a second pass over
  `buildImportPreview`'s valid rows, same pattern as P3-124's client resolution. The dedupe key
  (SKU, or name plus unit) is two fields compared together, also a post-pass over the preview
  rather than a single field's `validate`.
- **P3-122 (leads extension)**: `buildModelCsv` and `buildErrorCsv` are ready for the "example row
  plus required columns marked" and the `Motiv` column clauses; the dedupe-by-email widening stays
  in `lead-import-plan.ts` as today.
- **P3-126 to P3-129 (the four exports)**: need `buildCsv` with headers identical to the matching
  import model's labels, which the descriptor's `label` field already is the single source of
  truth for (an export only needs to map its field list through `fields.map(f => f.label)` to get
  headers that a re-import will recognise).

No code for P3-122 to P3-129 was written by this card; the shape above is what was checked by hand
against each of their acceptance lines, not run.

## Drafter's Decision A: kept

The card's acceptance (b) to (f) name `tests/import-shared.spec.ts`. `playwright.config.ts` fixes
`testDir: "./tests/e2e"`, and nothing under `tests/` outside `tests/e2e`, `tests/fixtures` and
`tests/perf` (its own config) is ever collected. A spec at the named path would never run and would
read as green by omission, which is worse than no spec at all. The five named cases (plus two
supporting cases for the synonym index and the preview partitioning) were written in
**`tests/e2e/import-shared.spec.ts`**, as plain non-async `test(...)` calls with no `page`, following
the existing pure-module pattern in `tests/e2e/outbound-direct-client.spec.ts` (the `ALL_UNITS`
case) and `tests/e2e/tasks.spec.ts`. **Recorded on the board in card P3-121's `notes`**, because
P3-122 to P3-129 all name this card in `depends_on` and may repeat the
`tests/import-shared.spec.ts` path in their own acceptance text.

## Acceptance, verified

- **(a)** `tests/e2e/lead-import.spec.ts` is byte-for-byte unchanged (`git diff --stat` shows no
  diff on that file, nor on `lead-import-plan.ts`, `lead-import-actions.ts` or
  `components/clients/LeadImportSheet.tsx`). Its eight named cases are therefore exercising
  identical application code through the re-exported names; they are proved by this pull request's
  own End to end run (this machine has no Docker or Supabase CLI, so the suite itself runs only in
  CI, per `KNOWN-FAILURES.md`).
- **(b)** `import comun: un fisier peste 5000 de randuri este refuzat cu un mesaj care spune limita
  si marimea reala` and its byte-limit twin `import comun: un fisier peste 5 MB este refuzat cu un
  mesaj care spune limita si marimea reala`, both in `tests/e2e/import-shared.spec.ts`.
- **(c)** `import comun: fisierul de erori are o coloana Motiv si un rand pentru fiecare rand
  invalid`.
- **(d)** `import comun: un rand care cade la al patrulea camp nu lasa in urma primele trei`.
- **(e)** `import comun: EUR si RON sunt respinse in previzualizare cu motiv romanesc care numeste
  MDL`.
- **(f)** `import comun: fisierul scris incepe cu marca de ordine a octetilor si este separat prin
  virgula`.
- **(g)** `grep -rn "^export function parseCsv" lib/` and `grep -rn "^export function buildCsv"
  lib/` each return exactly one line, both in `lib/data/import-shared.ts`.
- **(h)** `npx tsc --noEmit` exit 0, `npm run build` exit 0 (confirmed locally, both commands run
  alone). A codepoint scan of the three changed files (`import-shared.ts`, `lead-import-types.ts`,
  `import-shared.spec.ts`) found zero occurrences of U+2014 (em dash) or U+2013 (en dash).

## Local verification, since this machine cannot run the Playwright suite

No Docker, no Supabase CLI here, so the full `quality` workflow (database apply, local Supabase
stack, End to end) runs only in CI. Before pushing:

1. `npx tsc --noEmit` -- exit 0, whole project.
2. `npm run build` -- exit 0, full production build.
3. A standalone smoke test: `lib/data/import-shared.ts` compiled alone with `tsc` to plain
   CommonJS JS, outside any checkout, and run with plain `node` plus `node:assert/strict`,
   reproducing all five named acceptance cases above plus two supporting cases (the synonym index
   staying entity-agnostic, and `autoMatchColumns` composed with it). 7 of 7 passed.
4. The close-out gate list: `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
   `check:no-destructive-migration`, `check:conflict-residue` (run after `git add`),
   `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`,
   `check:removal-safety`, `check:assertion-register`. All exit 0.
5. `node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json
   docs/board/rc-board-phase3.json` -- exit 0.

No migration: `git diff --name-only origin/main...HEAD` carries no path under
`supabase/migrations/`, and `check:no-destructive-migration` parsed 0 files. No new dependency in
`package.json`.

## Defects met while working this card

One, appended to `docs/LEARNINGS.md`: typing the diacritic-stripping regex's `̀-ͯ`
escape sequence into a file-write tool call landed as the literal combining characters rather than
the escape text, and a naive attempt to "double-escape" it produced a silently wrong regex (two
literal backslashes followed by plain text, not a code point range). Verified equivalence of the
literal-character form against the original escape form with a throwaway `node -e` codepoint dump
and a side-by-side regex comparison on every Romanian diacritic exercised by this module, rather
than trusting either version by inspection.

## GREEN's parallel work

PR #389 (`card/p3-131`) was open throughout this session and touches none of the files this card
changed. No conflict encountered.

## Merge

**Not merged.** Repo CLAUDE.md section 3.1's self-merge grant, and every other terminal grant, was
revoked at P2-13 and again explicitly by the close-out block step 8: real client data has been in
production since 2026-09-14. `mailbox/questions/q111-approve-p3-121-merge.md` is filed for Max,
naming PR #390, the head sha and the plain-words summary, per that step's instructions. This PR
carries no migration, so no destructive-migration review and no applier proof apply.

## Board

Card P3-121 written to `shipped` **before** the `quality` run on PR #390 concludes, with evidence
naming the pull request and branch rather than a run id, per the factory's own
`KNOWN-FAILURES.md` entry on the auto-merger landing a green PR within a minute or two, before a
session can commit a board flip after the fact. (The self-merge grant is revoked regardless, so
this run will not actually be auto-merged without the mailbox question being answered; the board
is still written this way on principle, so that if a future change to that grant is made, the
evidence already matches the convention the rest of this board uses.) If the `quality` run on this
head goes red, this report and the board evidence are corrected on the fixing push, per repo
CLAUDE.md section 10.

`notes` on the card record Drafter's Decision A and the descriptor's shape, for the eight
downstream cards.
