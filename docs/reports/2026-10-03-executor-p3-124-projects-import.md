# P3-124: projects import from CSV (EXECUTOR, lane B, BLUE)

Date: 2026-10-03. Card: P3-124. Branch: `card/p3-124`. No migration.

## What changed for Rapid Construct

The Proiecte screen has an `Importă din CSV` button and a `Descarcă modelul de import` link. The owner
uploads a CSV, sees what was read (new, duplicate, with errors) before anything is saved, then confirms. Rows
that cannot be used come back as a file with a `Motiv` column. Clients must exist first: a row naming a client
the system does not have is rejected with a sentence that names the client and says to import clients first.
No client is ever created by this import.

## Files

- `lib/data/project-import-types.ts`: fields, labels, synonyms, descriptor, preview, model file, on-screen text.
- `lib/data/project-import-plan.ts`: dedupe on name plus client, new / duplicate / error per row.
- `lib/data/project-import-actions.ts`: `planProjectImport` (writes nothing) and `runProjectImport`.
- `components/projects/ProjectImportSheet.tsx`: the four-step panel, same shape as the clients one.
- `components/projects/ProjectsScreen.tsx`: the button, the template link, the panel mount.
- `lib/data/import-shared.ts`: one additive export, `readImportDate`. Nothing existing changed.
- `tests/e2e/projects-import.spec.ts`: the named cases.
- Not touched: the lead and clients import modules and specs, `import-shared.spec.ts`, any migration.

## Decisions

1. **Acceptance (f) corrected, per q114 and the task.** `public.projects` has no unit column. The case is now
   `import proiecte: fisa proiectului nu are unitate, iar o coloana Unitate din CSV nu scrie nimic`. It proves
   the field list has no unit field and that a `Unitate` column stays on "Nu importa" and writes nothing.
   ALL_UNITS is not counted here; P3-125 (b) owns it. The card notes and the PR body say so.
2. **Acceptance (e) kept.** Projects carry money, so a `Monedă` column with EUR or RON is refused in the
   preview with `Moneda "EUR" nu este acceptată. Platforma ține evidența numai în MDL.` The value is validated
   and dropped: there is no currency column on `projects`, and none was invented. The field is not in the
   model file. The budget header is `Buget (MDL)`, as on the form.
3. **Default status for an empty Stare cell: Prospect (`lead`).** `ProjectForm.tsx` starts a new project at
   `useState("lead")`, so a file row without a status begins the pipeline the same way a hand-made project does.
   The header is `Stare`, the form's label; `Etapă` is a recognised synonym.
4. **Client lookup.** Match by name, lowercase, spaces collapsed, diacritics kept. Zero hits, several hits and
   a deactivated client are three separate row errors. The lookup is deliberately narrower than `normaliseKey`.
5. **Dedupe key** is client plus name, lowercase. The database constraint is case sensitive, so the plan is
   slightly stricter than it and can only skip more, never fail more. Against a stored project the operator
   picks skip (default) or fill empty fields (address, dates, budget, note). A fill that would leave the end
   date before the start date writes nothing. Against an earlier row of the same file the row is always
   skipped: filling a row that does not exist yet is a two-step write the preview cannot show.
6. **No partial write inside a row.** Each new project is one `createProjectRecord` insert.
7. **Existing tables are read in pages of 1000** (PostgREST stops a plain select there).
8. **Date reader.** `readImportDate` was added to the shared module instead of a third private copy. The older
   copies in the lead and clients imports stay as they are.

## Verification

Run locally from the worktree (no database or Docker here, so the end to end suite runs only in CI):
see the PR body for the command list and results. The named cases in `tests/e2e/projects-import.spec.ts`
are the acceptance lines (a) to (f); (g) is `tsc`, `build` and the dash grep.

## Left for the owner

Nothing blocking. Merge approval goes through the mailbox, since real client data is in production.
