# P3-127: clients export to CSV (EXECUTOR, lane B, BLUE)

Date: 2026-10-03. Card: P3-127. Branch: `card/p3-127`. No migration.

## What changed for Rapid Construct

The Clienți screen has an `Exportă CSV` button (administrator only, between `Importă din CSV` and `Client nou`).
It saves what the operator is looking at, with its search, type and status filters, as `clienti.csv`. All rows of
the filter are written, not only the 25 on screen, up to 5000; past that a Romanian sentence says the file was
cut. Deactivated clients are in the file only when the status filter on screen shows them. The columns are the
clients import template's, so the file opens in Excel with correct diacritics and loads straight back into the
clients import.

## Files

- `lib/data/client-export-actions.ts`: `exportClients`, owner only. Reads the list through
  `listClientRowsForExport` (added by P3-126, unchanged), then the columns the list does not return (email, IDNO,
  address, notes, interest, source, owner) for the ids the list chose, 100 at a time.
- `lib/data/client-export-types.ts`: `clientModelHeaders`, `clientExportCsv`, `clientExportTruncatedNotice`,
  `CLIENT_EXPORT_FILE_NAME`.
- `components/clients/ClientsScreen.tsx`: the button (`clienti-export`); `runExport` takes `"leads"` or
  `"clients"` and shares the notice and error lines.
- `board`: P3-127 shipped.
- `tests/e2e/clients-export.spec.ts`: the six named cases.
- Not touched: the four imports, the leads export action and spec, `import-shared.ts`,
  `components/ui/primitives.tsx`, any migration.

## Decisions

1. **Own action and header, shared read.** The leads export has a contact person column the clients model lacks.
2. **Status is the screen's.** Passed through untouched; the case checks Activi, Inactivi and Toate.
3. **Round trip** moves name, email, phone and IDNO to a second series (the store cannot be emptied, and the
   import dedupes on email), compares the other fields on stored rows, and proves the untouched file re-imports
   as 100 percent duplicates.

## Known limits, not fixed here

- A client without an email is not recognised as a duplicate by the clients import (email is the only key), so
  re-importing such a row creates a new one.
- No contact person is exported: the clients model has no field for it.

## Local gates

Run from the worktree; the end to end suite needs Docker and runs only in CI.
