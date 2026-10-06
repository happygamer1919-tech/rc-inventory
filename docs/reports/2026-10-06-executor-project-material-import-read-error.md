# P3-183: project and material imports stop on a failed read

For Rapid Construct: if the database cannot be read during a projects or materials import, the import now stops with a Romanian message and writes nothing. Before, it carried on with a half-read list and refused good rows or missed duplicates.

## Change
- `lib/data/import-clients-read.ts`: `ImportReadError` takes an optional message; new `readFailedMessage` and `readAllRows` (paged read that throws on error or null data); `readAllClients` now calls it.
- `lib/data/project-import-actions.ts` and `lib/data/material-import-actions.ts`: `readAll` calls `readAllRows` with a message per table (clienții, proiectele existente, categoriile, produsele existente). The plan and run actions use `loadOrRefuse` and return the message.
- `tests/e2e/import-clients-read.spec.ts`: four new cases (projects, clients, products, categories): error on first page, error after a full page, null data. Each refuses with the Nu am putut citi message.
- Board card P3-183 in `docs/board/rc-board-phase3.json`. No migration.

## Not done
- The four actions are not run end to end: no database on this machine. The tests work at the helper level with a fake client, like P3-151.
- `productHasMovements` (unit check in the materials plan) was not touched.
