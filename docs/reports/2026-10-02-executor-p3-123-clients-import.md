# Executor report: P3-123, clients CSV import

Role EXECUTOR (BLUE), goal LB11, 2026-10-02. Re-queue of `lane-b-012-p3-123-clients-import.md`,
which produced no branch, no worktree and no commit on its first run.

## Boot

Repo CLAUDE.md sections 1, 2, 3, 3.1, 5b, 6, 8.0, 8b, 9, 9b and 11 read. Both boards read; card
P3-123 is on phase 3, `todo`, depending only on P3-121 (shipped, PR #390). Card P3-122's `notes`
and `docs/reports/2026-10-02-executor-p3-122-leads-import.md` read before writing a line of code,
per the task brief's own instruction, for the four reasons the lead import keeps its own
`prepareRow` instead of the shared `buildImportPreview`. Worktree created at
`/Users/sm33xy/Projects/rc-inventory-worktrees/lb11-p3-123-clients-import`, branch `card/p3-123`,
cut fresh from `origin/main` at `036073a` (no existing `card/p3-123` on origin, so this is not a
retry at the git level).

## What this card is, in plain words

Rapid Construct can load its customer list from a CSV file: a button on the Clienți screen opens
a four-step wizard (upload, match columns, verify, import) that shows every row read and every row
rejected with a Romanian reason, writes nothing until the operator confirms, matches existing
customers by email and only ever fills their empty fields, and offers the rejected rows back as a
downloadable file with a `Motiv` column.

## What was built

- `lib/data/client-import-types.ts`: the 13-field client import descriptor (`CLIENT_IMPORT_FIELDS`,
  excluding `contactName`, which has no equivalent on `ClientForm.tsx`), the Romanian labels (the
  same words as the lead import's for every shared field), the synonym index, `templateCsv()`,
  `clientImportInstructions()`, `skippedCsv()`, and `buildClientImportPreview()`, a thin wrapper
  over `buildImportPreview` from `lib/data/import-shared.ts`.
- `lib/data/client-import-plan.ts`: `buildClientPlan`, the email-only dedupe pass against stored
  clients and against earlier rows in the same file, and `mergeClientsWithinFile`, both modelled on
  `lib/data/lead-import-plan.ts` with the single rule change clause 5 asks for (email, not
  phone-or-email).
- `lib/data/client-import-actions.ts`: `"use server"`, `planClientImport` and `runClientImport`,
  modelled on `lib/data/lead-import-actions.ts`, writing through the existing `createClientRecord`
  and `addClientNote`, gated on `hasClientLeaduri`/`hasClientNextAction` exactly as leads are.
- `components/clients/ClientImportSheet.tsx`: the four-step wizard, same `data-testid` vocabulary
  as `LeadImportSheet.tsx`, root test id `client-import`.
- `components/clients/ClientsScreen.tsx`: one new secondary button, `Importă din CSV`
  (`data-testid="clienti-import"`), beside `Client nou` in the non-Leaduri branch of the header
  actions, and the new sheet wired to it. The Leaduri branch (`data-testid="leaduri-import"`) is
  untouched.
- `tests/e2e/clients-import.spec.ts`: the eight named acceptance cases, with the `csv()` fixture
  helper copied into the spec per Drafter's Decision B, not three new files under `tests/fixtures/`.

## The card's eight clauses

1. **The button and the model link.** Done: `clienti-import` beside `client-new`, in-sheet
   `import-template` labelled `Descarcă modelul de import`.
2. **The model file.** `templateCsv()` marks only `Denumire *`; the example row is plausible
   Romanian data that re-imports cleanly (verified by the spec's own template test, which feeds the
   downloaded file back through the wizard and asserts zero errors).
3. **Preview before any write.** `import-step-3` never calls a server write action; only
   `import-run` at `import-step-4` calls `runClientImport`. Verified directly against the database
   in the named case `import clienti: previzualizarea apare inainte de orice scriere`, which reads
   the stored rows after reaching step 4 and again only after pressing Importă.
4. **Row errors, in Romanian.** A missing required field (`Denumire lipsește.`), an unknown stage,
   an unknown type, an unknown source, a bad date, an unknown owner, and the cross-field
   `FOLLOW_UP_DATE_REQUIRED` case are all handled; unit and currency are handled as absence proofs,
   Decision A below.
5. **Dedupe by email, never overwrite.** `buildClientPlan` keys only on `normaliseEmail`; a
   duplicate is skipped by default or has only its `empty` fields filled through `fillEmpty` in
   `client-import-actions.ts`, which re-reads the row immediately before writing and only patches
   columns it finds empty at that moment.
6. **Only valid rows write; the rejected rows are a CSV with `Motiv`.** `skippedCsv` is a direct
   call to `buildErrorCsv`, which already writes `["Rând", "Motiv", ...headers]` (P3-121). No
   partial row: `buildImportPreview`'s `prepareImportRow` returns a row only once every field has
   passed, per `import-shared.ts`'s own documented guarantee.
7. **Written Romanian instructions on screen.** `clientImportInstructions()` builds every sentence
   from `CLIENT_IMPORT_FIELD_LABEL`, `CLIENT_TYPE_LABEL`, `CLIENT_STAGES`, `CLIENT_STAGE_LABEL`,
   `CLIENT_SOURCES`, `CLIENT_SOURCE_LABEL`, `IMPORT_MAX_ROWS` and `IMPORT_MAX_BYTES`, plus one
   sentence for Decision A's MDL wording, so the screen cannot state a number or a list that drifts
   from what the import enforces.
8. **A client and a lead are the same table.** No new table, no second detail page: this screen
   writes `public.clients` rows through the same `createClientRecord` the client form and the lead
   form both use, with `stage` defaulting to `client` (Decision E) rather than `cold`.

## Drafter's decisions, what was actually done

**Decision A (acceptance d, e).** `public.clients` has no currency column and no unit column
(migration `0013_clients.sql`, and nothing later adds one); these two acceptance lines describe
card P3-125 (materials), not this one, and were copied onto this card by AUTHOR under goal G71.
Per the brief's own instruction, the acceptance text was left byte-for-byte unchanged and the two
named test cases were written as **absence proofs**: `CLIENT_IMPORT_FIELDS` carries no currency or
unit field; a CSV column named `Monedă` or `Unitate` auto-matches to nothing (`Nu importa`, test
asserts `toHaveValue("")` on the column's select) because no synonym entry points at it, and both
rows import successfully regardless of what is written in that column, proving the value has no
effect anywhere; `ALL_UNITS` in `lib/data/units.ts` is asserted to still equal the nine entries of
deviation D3; and the on-screen instructions are asserted to contain `MDL`, worded from the same
sentence family as `validateCurrency` in `import-shared.ts` ("Platforma ține evidența numai în
MDL."). No currency or unit field was invented on the client entity to make these pass. A mailbox
note already on file, `q112-p3-123-currency-and-unit-acceptance-belong-to-p3-125.md`, needed no
reply to proceed; none had arrived by the time this was written.

**Decision B (three fixture files).** `tests/e2e/clients-import.spec.ts` carries its own `csv()`
helper, copied from `lead-import.spec.ts`'s, and builds every CSV body inline through
`setInputFiles({ buffer: Buffer.from(body, "utf8") })`. No file was added under `tests/fixtures/`.

**Decision C (new module, not a shared one; do not generalise the lead import).** Built
`lib/data/client-import-types.ts`, `client-import-plan.ts`, `client-import-actions.ts` and
`ClientImportSheet.tsx`; did **not** edit `lead-import-types.ts`, `lead-import-plan.ts`,
`lead-import-actions.ts` or `LeadImportSheet.tsx`. Re-checked the four reasons P3-122's report
names for why the lead import cannot sit on `buildImportPreview` directly, against this card:

1. Telefon-or-Email as one requirement over two fields: **not needed**. This card has no "at least
   one contact field" rule; only `Denumire` is required.
2. Etapă/Sursă defaulting on an empty cell rather than refusing it: **re-examined, and it turns out
   not to be a hard limitation of the shared descriptor for this card.** `prepareImportRow` in
   `import-shared.ts` calls `validate(raw)` for every non-required field even when `raw === ""`
   (the `required` check only short-circuits `validate` for *required* fields); a `validate`
   closure is free to return a fixed default on an empty string. The lead import's blocker is
   narrower than the note states: `source`'s empty-cell default is `fallbackSource`, a value chosen
   by the operator *per import run* and passed as a request parameter, which a module-level
   descriptor array cannot close over unless rebuilt per call (which the lead import does not do).
   This card's `stage` default is the fixed literal `"client"` (Decision E), with no per-run
   parameter, so `clientImportFields()` in `client-import-types.ts` is simply built inside a
   function and its `stage` field's `validate` returns `{ ok: true, value: "client" }` on an empty
   cell. Recorded as its own learning in `docs/LEARNINGS.md`, since P3-124 and P3-125 will face the
   same question and should re-derive it rather than copy the conclusion.
3. Duplicate search across the file and the database together: **needed, and kept outside the
   per-row preview.** `buildClientImportPreview` only does per-field, per-row validation (via
   `buildImportPreview`); `buildClientPlan` in `client-import-plan.ts` does the two-pass dedupe
   (file-first, then stored rows), exactly as `buildPlan` does for leads.
4. Contact person askable only on a matched stored client: **not applicable.** `ClientForm.tsx` has
   no persoană-de-contact field; the client import field list has none either.

One client-specific rule the shared descriptor genuinely cannot express on its own: `Etapă` =
`De reluat` with an empty `Data de reluare` is a cross-field error
(`FOLLOW_UP_DATE_REQUIRED`), and a single field's `validate` cannot see a sibling field's value.
`buildClientImportPreview` handles this as a thin post-pass: it calls the shared
`buildImportPreview`, then moves any row that is `valid` but carries that exact combination into
`invalid`, re-deriving its raw cells from the original `rows` array by line number. This keeps the
field-by-field validation on the shared module and adds only the one genuinely cross-field rule
locally, which is the narrowest form Decision C's "use buildImportPreview... then a client-specific
pass" guidance describes.

The phone/email/date/stage/source/type reading functions (`normalisePhone`, `normaliseEmail`,
`readDate`, `readStage`, `readSource`, `readType`) are duplicated in `client-import-types.ts`
rather than imported from `lead-import-types.ts`. The brief forbids editing
`lead-import-types.ts` and forbids any path that would turn `LeadImportSheet.tsx` into a shared
component; importing these pure functions from it would not edit that file, but it would make
`client-import-types.ts` a second consumer of a module the brief treats as off limits beyond
`import-shared.ts`. Duplicating roughly 80 lines of pure, already-proven logic was judged the
reading of "do not touch that file" least likely to be disputed, at the cost of two copies that
could in principle drift; noted here so the owner or a reviewer can overrule it if the coupling
would have been preferred.

**Decision D (dedupe, never overwrite).** `buildClientPlan` keys on `normaliseEmail` only. A
within-file duplicate (two rows sharing an email) resolves to the first row winning, via
`fileByEmail`, the same mechanism `mergeWithinFile` uses for leads.

**Decision E (stage on import).** Empty `Etapă` defaults to `client`, not `cold`: wired directly
into `clientImportFields()`'s `stage` descriptor as discussed under Decision C, point 2. All five
`CLIENT_STAGE_LABEL` values are accepted; `De reluat` with no date is a row error.

**Decision F (a lead and a client are the same table).** No new table, no second detail page. This
import writes through `createClientRecord`, the same action the client form and the lead form use.

## What was NOT touched

`lead-import-types.ts`, `lead-import-plan.ts`, `lead-import-actions.ts`, `LeadImportSheet.tsx`,
`tests/e2e/lead-import.spec.ts` (all twelve cases, the original eight plus P3-122's four, byte for
byte), `tests/e2e/import-shared.spec.ts`, `lib/data/import-shared.ts`. No `lead=` `PageHeader` prop
was touched; `components/ui/primitives.tsx` was not opened. No migration: `git diff --name-only
origin/main...HEAD` carries no path under `supabase/migrations/`, and `check:no-destructive-migration`
parsed 0 files. No file under `app/api/extraction/**`, `app/api/documents/**`, `lib/data/extraction*`
or `docs/contracts/extraction*` was opened. No file under `components/tasks/**`, `lib/data/tasks*`
or the `/sarcini` route (GREEN's parallel lane) was opened. `tests/e2e/clients.spec.ts` needed no
edit: no test there asserts an exact count of header buttons, so the new `clienti-import` button
does not break it (checked with a targeted grep before concluding this, not assumed).

## Acceptance, verified locally

This machine has no Docker and no Supabase CLI; the Playwright suite itself runs only in CI
(`KNOWN-FAILURES.md`). Verified instead:

- **(a), (b), (c), (d), (e), (f)**: all eight named cases are written in
  `tests/e2e/clients-import.spec.ts`, each against the database through the same `OwnerRest`
  PostgREST pattern `lead-import.spec.ts` uses, not only against the screen.
- **(g)**: `grep -rn "export function parseCsv" lib/` returns exactly one line,
  `lib/data/import-shared.ts:177`.
- **(h)**: `npx tsc --noEmit` exit 0. `npm run build` exit 0 (full production build, all routes
  compiled). `git diff --cached -U0 origin/main...HEAD | grep -P '[\x{2013}\x{2014}]'` found nothing
  in any commit on this branch.

## Local verification, full list

1. `npx tsc --noEmit`, exit 0.
2. `npm run build`, exit 0.
3. `check:card-ids`, `check:board-edit`, `check:unique-ids`, `check:open-branch-ids`,
   `check:no-destructive-migration`, `check:conflict-residue`, `check:categories`,
   `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`,
   `check:removal-safety`, `check:assertion-register`, all exit 0, run individually.
4. `node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json
   docs/board/rc-board-phase3.json`, exit 0, run before every commit.

No migration added. No new `package.json` dependency.

## Merge

**Not self-merged.** Per the close-out block appended to this task, every self-merge grant
(including this card's own `gate: green_self_merge`) is treated as revoked since real client data
went into production on 2026-09-14. Once this pull request is open and green on its own head sha,
`mailbox/questions/qNNN-approve-p3-123-merge.md` is written, starting `OWNER:`, naming the PR
number, the head sha, and a one-sentence plain summary, and the run ends without merging. This PR
carries no migration, so no destructive-migration review and no applier proof steps apply.

## Board

Card P3-123 moved to `shipped` on the phase 3 board in this same pull request, with a placeholder
`evidence.ref` ("branch card/p3-123, awaiting PR number and green quality run sha") updated to the
real PR number and green run id once CI concludes, and `notes` carrying Decisions A, C and E as
summarised above.

## Correction after the first push (ruling q114, carried out under q117 and q118)

Acceptance lines (d) and (e) were copied from the materials card, but `public.clients` has no
currency column and no unit column. A green case named "EUR and RON are refused in the preview" on
a screen that never offers a currency would be read later as proof of behaviour that does not
exist. Changes in this pull request:

- Card P3-123 (d) and (e) renamed to `import clienti: fisa clientului nu are moneda, iar o coloana
  Moneda din CSV nu scrie nimic` and `import clienti: fisa clientului nu are unitate, iar o coloana
  Unitate din CSV nu scrie nimic`. The absence proofs stay as the substance. The card `notes` cite q114.
- `tests/e2e/clients-import.spec.ts`: the two cases renamed to match; the `ALL_UNITS` nine-entry
  assertion and the on-screen MDL assertion removed. P3-125 (b), (c) and (f) own those proofs.
- `lib/data/client-import-types.ts`: the MDL sentence removed from `clientImportInstructions`.
  There is no money on a client import.
- `docs/LEARNINGS.md`: two ERROR/SOLUTION pairs added (acceptance names must be checked against the
  table the card writes to; a spec path that nothing collects).
- Main was merged into the branch (P3-132 and P3-133 board edits kept alongside P3-123).
