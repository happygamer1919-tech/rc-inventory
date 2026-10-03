# P3-128: projects export to CSV (EXECUTOR, lane B, BLUE)

Date: 2026-10-03. Card: P3-128. Branch: `card/p3-128`. No migration.

## What changed for Rapid Construct

The Proiecte screen has an `Exportă CSV` button (administrator only, between `Importă din CSV` and `Proiect nou`).
It saves what the operator is looking at, with its search, status and client filters, as `proiecte.csv`. All rows
of the filter are written, not only the 25 on screen, up to 5000; past that a Romanian sentence says the file was
cut. The columns are the projects import template's, the client is written by name, and the budget in MDL, so the
file opens in Excel with correct diacritics and loads straight back into the projects import.

## Files

- `lib/data/project-export-actions.ts`: `exportProjects`, owner only. Parses the screen's `q`, `stare`, `client`
  with `parseProjectQuery`, reads the list through `listProjectRowsForExport`, then the two columns the list does
  not return (start date, notes) for the ids the list chose, 100 at a time.
- `lib/data/project-export-types.ts`: `projectModelHeaders`, `projectExportCsv`, `projectExportTruncatedNotice`,
  `PROJECT_EXPORT_FILE_NAME`.
- `lib/data/projects-list.ts`: `listProjectRowsForExport`, and the body of `listProjects` moved into a private
  `readProjectRows` that both use. Same RPC, same arguments, same mapping; screen behaviour unchanged.
- `components/projects/ProjectsScreen.tsx`: the button (`projects-export`), notice and error lines.
- `components/projects/ProjectImportSheet.tsx`: `download` is now exported (was private, same body).
- `board`: P3-128 shipped.
- `tests/e2e/projects-export.spec.ts`: the six named cases.
- Not touched: the four imports, the two exports and their specs, `import-shared.ts`, `components/ui/primitives.tsx`,
  any migration.

## Decisions

1. **Client by name.** The import matches the Client cell by `clientNameKey` (trim, collapse spaces, lower case,
   diacritics kept) against the client name. The export writes the stored name; an id would fail every row.
2. **Status as the Romanian label** (`PROJECT_STATUS_LABEL`), which `readStatus` reads. **Budget** as a plain
   number in MDL (`String(budget_mdl)`), which `readBudget` reads. No currency column: the template has none.
3. **Round trip** re-imports the untouched file (all duplicates, zero errors), then the file with only the project
   name moved to a second series, client column untouched, and compares every stored field.

## Known limits, not fixed here (the import's rules are not changed by this card)

- Two clients whose names are equal after normalisation: the import refuses their rows (`ambiguousClient`), so the
  round trip holds over distinct client names only. The test fixtures use distinct names.
- A project of a deactivated client is exported (the list shows it), but the import refuses it
  (`inactiveClient`) until the client is reactivated.

## Local gates

Run from the worktree; the end to end suite needs Docker and runs only in CI.
