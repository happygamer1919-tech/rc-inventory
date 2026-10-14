# P3-302: re-import of exports with a switched-off Responsabil, and the lead preview Sursă

## What changed for Rapid Construct
- An exported lead or client file can be loaded back in even when a person named in it was switched off since. Such rows are duplicates when the client already exists, otherwise they are created without a responsible person and flagged under "De reținut".
- The lead preview no longer shows an empty Sursă cell: it says "se alege la pasul următor".

## How
- `lib/data/import-shared.ts`: `buildOwnerIndexWithInactive`, `ownerCannotBeAssigned`, `ownerLeftEmptyWarning`. Deactivated colleagues and "Fără nume" are indexed with an empty id.
- `lib/data/lead-import-types.ts`, `client-import-types.ts`: `buildOwnerIndex` takes the inactive names; a found empty id keeps the row with no owner. An unknown name is still refused.
- `lib/data/clients.ts`, `import-clients-read.ts`: `readInactiveOwnerNames` (read only; a failed read refuses the import, never an empty list).
- Both import actions pass the inactive names and add the warning when a row is created.
- `lib/data/import-preview-rows.ts`, `lead-import-plan.ts`: the empty Sursă label.

## Decision
The source choice stays on step 4. Moving it before the preview would change the four step flow that `tests/e2e/lead-import.spec.ts` drives, so the brief's second option (label the cell) was taken.

## Tests
- `tests/e2e/p3-302-import-owner-sursa.spec.ts`: plan level cases (duplicate with an inactive owner, new row kept, unknown name still an error, client path, warning text, preview label).
- The full browser step (export with a deactivated owner, re-import, rows in Dublate) needs a database and runs in CI only.
- No migration.
