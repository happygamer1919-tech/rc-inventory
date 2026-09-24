# EXECUTOR: P3-101, goal G58, "Importa leaduri" in four Romanian steps

Role AUTHOR, then EXECUTOR, in one pull request.
Branch `card/p3-101`, worktree `/Users/sm33xy/Projects/rc-inventory-worktrees/g58-import-leaduri`,
cut from `origin/main` at `7e5ffe4`.
Date 2026-09-24.

## What changes for Rapid Construct, in plain words

The leads screen gets a second button beside "Lead nou", called "Importă leaduri". It opens a
four step screen in Romanian that loads a list of leads from a file instead of typing them in one
at a time.

1. **Încarcă fișierul.** Pick a CSV, at most 5 MB and at most 5000 rows. There is a button that
   downloads an empty template with the right column headings, so a beginner can start from it
   rather than guess. A file that is too big, the wrong kind or empty says so in Romanian.
2. **Potrivește coloanele.** Every column in the file is listed with three real values out of the
   file beside it, and a dropdown of the fourteen fields RC knows. The screen guesses the match
   from the heading, in Romanian and in English. Anything it does not recognise stays on
   "Nu importa" and the operator decides.
3. **Verifică.** Before one row is written, the screen says how many are new, how many are
   duplicates and how many have an error. Each duplicate is named with who it clashes with, and
   each error row is listed with the reason in Romanian.
4. **Importă.** One source can be chosen once and applied to the whole file. Every lead created
   gets a note in its history saying which file it came from and on what day. At the end there is
   a count of created, filled and skipped, and a button that downloads the skipped rows with their
   reasons so they can be fixed and loaded again.

**Nothing is ever deleted and nothing already written is ever replaced.** A lead that is already in
the system is either left completely alone, which is what happens unless the operator says
otherwise, or has only its blank fields filled in. There is no path in this card that can write over
a value a person typed, and no migration: the live database structure does not change at all.

## The two questions filed before any code was written

Both were found while the task was being drafted, both are real, and neither was decided by this
terminal. Both were filed first, then the build went ahead on the recommended default rather than
idling.

### q084, the XLSX library

`package.json` on `7e5ffe4` carries six runtime dependencies and no spreadsheet parser. A `.xlsx`
is a zip container of XML that Node cannot open with anything built in, so reading one means
installing a third party library that then runs on the server holding Rapid Construct's client
list. The question names SheetJS (Apache 2.0, but the npm copy is deprecated by its own maintainer
in favour of their website) and ExcelJS (MIT, maintained, much larger and with dependencies of its
own), and recommends **neither**.

**Applied default: CSV only, no new dependency.** The CSV reader is about eighty lines inside
`lib/data/lead-import-types.ts`. An operator who picks an `.xlsx` gets a Romanian sentence telling
them to open it in Excel, choose Salvare ca and the CSV type, and load that; the template the screen
offers is already a CSV, so there is nothing else to learn. Acceptance clause (b) asserts that
sentence and asserts that no import starts.

**The XLSX half is therefore deferred, and this is what it costs.** One extra step for whoever
prepares the file, once per file. If the owner answers "add the library", the four step screen does
not change at all: only the branch in `onFile` that currently shows the sentence would parse the
workbook instead, and that is the point at which "let the operator pick a sheet if the file has
several", which G58 also asks for, becomes buildable. It is not buildable today because there is no
concept of a sheet in a CSV.

### q085, who may import

G58 says "Owner and active operators only". `createClientRecord` in `lib/data/client-actions.ts`
answers `OWNER_ONLY` to anyone whose role is not `owner`, so **today no operator can create a client
by any route at all.** Reading G58's sentence literally would have made this card the card that gave
operators the power to write client records, in bulk, five thousand rows at a time, through a screen
nobody reviewed for that purpose. That is an access decision about the business.

**Applied default: owner only, matching exactly what creating a single lead already does.** An
operator does not see the button, the same way they do not see "Lead nou". Both server actions check
the role themselves as a second net, and answer in Romanian. If the owner wants operators to import,
the honest version is its own card that widens who may create a client record once, for the form and
the import together.

## What was built, file by file

| File | What it is |
|---|---|
| `lib/data/lead-import-types.ts` | Pure, no server import. The fourteen fields and their Romanian labels, the synonym table, the CSV reader and writer, the +373 phone normaliser, the date reader, and the check that turns one row of a file into either a lead ready to write or a refusal with a Romanian reason. |
| `lib/data/lead-import-plan.ts` | Pure. Turns the prepared rows plus the stored clients into the plan: which rows are new, which are duplicates and of what, which have errors, and which fields a fill would actually touch. |
| `lib/data/lead-import-actions.ts` | `"use server"`. `planLeadImport` returns the plan and writes nothing. `runLeadImport` writes. `fillEmpty` is the only path that touches a client that already exists. |
| `components/clients/LeadImportSheet.tsx` | The four step panel. |
| `components/clients/ClientsScreen.tsx` | The button, beside `leaduri-new`, in the Leaduri view only. |
| `tests/e2e/lead-import.spec.ts` | The six acceptance cases. |
| `docs/reports/assets/p3-101/probe-lead-import.mjs` | The local probe of the pure half. |

### Decisions taken inside the card, and why

- **The separator is sniffed, not assumed.** Excel on a Romanian machine saves CSV with semicolons.
  A reader that assumes commas would read every row as a single cell and report five thousand rows
  with no name, which looks like a broken file rather than a broken reader. The first line decides
  between comma, semicolon and tab, counting only outside quotes so that a name like
  `"Popescu, Ion"` cannot vote.
- **A field can be taken by only one column.** Two columns called "Telefon" and "Telefon 2" both
  match `phone`, and the second would have silently overwritten the first at write time. The second
  stays on "Nu importa".
- **A phone is stored in its +373 form, not as it was typed.** That is what makes a second import
  of the same person recognise the first, whichever way it was written that time. A number that is
  not Moldovan keeps its own prefix: it is normalised, not moldovenised.
- **An unknown stage, source, type or responsible is an error row, not a guess and not a silent
  drop.** Guessing writes a value nobody said; dropping loses one. The row is listed with its
  Romanian reason, skipped, and comes back in the downloadable file.
- **A row needs a name, and a phone or an email.** Both are G58's. Without a contact value a row
  cannot be searched, cannot be called, and cannot be told apart from a duplicate.
- **The stage of a duplicate is never touched, not even by "Completează câmpurile goale".** An
  empty field is a gap; a stage is a judgement somebody made. The fillable set is phone, email,
  contact person, interest, source, responsible, next step, notes, address and IDNO, and only where
  the stored value is NULL or empty. Denumire, Etapă and Data de reluare are not in `FILL_COLUMN` at
  all, so there is no route to them.
- **The row is read again inside `fillEmpty`, immediately before the write.** The list of fields
  the screen asks to fill is a request, not a permission: if somebody filled one of those fields
  between step 3 and the button, that column is left alone.
- **The plan is recomputed on the server at write time** and is not taken from the browser. A plan
  sent by a client is a client's claim about what is a duplicate, and that is decided by the rows in
  the database.
- **A duplicate of a stored client is not indexed as a within-file anchor.** It is never going to
  be written, so a third appearance of the same person must still find the stored client. This was
  a real defect in the first version and the probe now asserts both shapes.

## Acceptance, and what could and could not be run here

**This machine has no Docker and no Supabase CLI**, so the end to end suite runs only in CI. The
card's nine acceptance clauses are proved by the `quality` run on this pull request's head sha.
`npx playwright test --list tests/e2e/lead-import.spec.ts` collects all six cases here.

Everything that needs no database was run locally, each command alone, each exit 0:

    npx tsc --noEmit
    npm run build
    node docs/board/validate-board.mjs (all three boards)
    npm run check:card-ids
    npm run check:unique-ids
    npm run check:open-branch-ids
    npm run check:no-destructive-migration
    npm run check:conflict-residue       (run after git add)
    npm run check:categories
    npm run check:ledger-rows
    npm run check:no-prod-target
    npm run check:pending-schema-reads
    npm run check:removal-safety
    npm run check:assertion-register
    npx playwright test --list tests/e2e/lead-import.spec.ts
    node docs/reports/assets/p3-101/probe-lead-import.mjs

`npm run check:board-edit` was red until the commit that flips the card to `shipped`, which is that
check working exactly as written.

### The local probe, and why it exists

CI takes about twenty minutes. The CSV reader, the phone normaliser, the date reader and the
duplicate arithmetic are the parts where a mistake is cheapest to find before pushing, and none of
them needs a database or a browser. `docs/reports/assets/p3-101/probe-lead-import.mjs` compiles the
two pure modules into a temporary directory and asserts:

- six different ways of writing one Moldovan number all normalise to `+37369123456`, that a British
  number keeps `+44`, and that five digits is not a phone number
- three date spellings, `2027-03-14`, `14.03.2027` and `14/03/2027`, all read as the same day, and
  that `32.13.2027` and `29.02.2027` are refused rather than corrected
- a semicolon file, a comma file with a quoted comma and a doubled quote, a CRLF file and a file
  with a byte order mark all parse to the rows a reader would expect
- the automatic match, including that a second phone column is not taken
- a row missing a name, a De reluat row with no date, and a row with neither phone nor email each
  come back with the exact Romanian sentence the screen shows
- the plan counts a stored phone duplicate, a stored email duplicate and a within-file duplicate as
  three duplicates and one new row, and that the fill of a within-file duplicate writes the missing
  field into the earlier row and leaves its name and phone alone

**The probe is not the acceptance and nothing here claims it is.** It proves the half that runs
without the application. The six cases in CI drive the real screen against the real database, which
is the only place the note, the stage, the owner and the untouched duplicate can be read back out of
stored rows. **The probe was seen failing before it passed**, on the row numbering of a within-file
duplicate, which is the only reason its green means anything.

## Real client data

Real client data has been in production since 2026-09-14. Nothing in this run opened the live site,
read a production row or fetched a credential. Every fixture in `tests/e2e/lead-import.spec.ts` is
invented by hand: names are `TEST <run> <label>`, emails are at `example.test`, and phone numbers are
generated per run from five random digits, because the importer searches for duplicates across every
stored client and a fixed number would make the second run find the first and prove something else.

## What is left for the owner

1. **q084**, whether a spreadsheet library may be installed so the screen can read `.xlsx` directly.
   Recommended default applied: no library, and the screen says to save as CSV.
2. **q085**, whether operators may import. Recommended default applied: owner only, matching how
   creating a single lead already works.
3. **The merge.** No pull request self-merges any more. The pull request is opened, watched to
   green, and the merge approval question is filed.
