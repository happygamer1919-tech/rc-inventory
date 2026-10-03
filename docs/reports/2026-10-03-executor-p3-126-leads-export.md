# P3-126: leads export to CSV (EXECUTOR, lane B, BLUE)

Date: 2026-10-03. Card: P3-126. Branch: `card/p3-126`. No migration.

## What changed for Rapid Construct

The Leaduri screen has an `Exportă CSV` button (administrator only, next to `Importă din CSV`). It saves what
the operator is looking at, with its search, type, status and stage filters, as a CSV. All rows of the filter
are written, not only the 25 on screen, up to 5000; past that a Romanian sentence says the file was cut. The
columns are the import template's, so the file opens in Excel with correct diacritics and loads straight back
into the import.

## Files

- `lib/data/clients.ts`: `searchClientRows` (the one read of the list, with its three RPC paths), used by
  `listClients` unchanged in behaviour, and `listClientRowsForExport` (pages of 1000 up to the limit).
- `lib/data/lead-export-actions.ts`: `exportLeads`, owner only. Adds the columns the list does not return
  (email, IDNO, address, notes, interest, source, owner) and the primary contact person, read for the ids the
  list chose, 100 at a time.
- `lib/data/lead-import-types.ts`: `leadModelHeaders`, `leadExportCsv`, `exportTruncatedNotice`,
  `EXPORT_FILE_NAME`.
- `components/clients/ClientsScreen.tsx`, `LeadImportSheet.tsx`: the button, a notice line, `download` exported.
- `tests/e2e/leads-export.spec.ts`: the five named cases.
- Not touched: the four imports, `import-shared.ts`, `components/ui/primitives.tsx`, any migration.

## Decisions

1. **No second query.** Same function, same arguments; only limit and offset differ.
2. **Pages of 1000.** `max_rows` is 1000, so a single call for 5000 would return 1000 without any error.
3. **Header is read from `templateCsv()`**, so it includes the `*` on Denumire. The import matcher strips it.
4. **BOM already written by `buildCsv`**; no second writer, nothing added to it.
5. **Round trip test** moves name, phone, email and IDNO to a second series (the store cannot be emptied and the
   import skips duplicates), compares the other fields on stored rows, and separately proves the untouched file
   re-imports as 100 percent duplicates.

## Known limits, not fixed here

- A lead with neither phone nor email (possible from the single form) is exported but the import refuses it.
- A lead whose source is empty re-imports with the source chosen in import step 4.
- Only the primary active contact person is exported (else the oldest active one).

## Local gates

Run from the worktree; the end to end suite needs Docker and runs only in CI.
