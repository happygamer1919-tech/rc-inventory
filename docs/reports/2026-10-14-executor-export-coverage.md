# P3-306: exports cover what is on screen (2026-10-14)

Source: Fable bug check of 2026-10-14 18:46Z, findings 14 and 17 (zero based).

- Inactivi view: Exportă CSV added (components/clients/ClientsScreen.tsx). It calls the existing client export with `view: inactivi`.
- Toți and Inactivi exports: when the file holds at least one lead, the file gets Persoană de contact as a last column (client columns keep their places), so a re-import through Leaduri keeps it. A file with only clients keeps the client model and its header test. CI run 38625388287 failed the client round trip spec when the lead model was used; fixed by putting the column last.
- Contact read: new lib/data/export-contacts.ts pages each batch of 100 client ids through `readAllPages` (count, stable order, control read), so no contact is dropped at the 1000 row cap. Both exports use it.
- Tests: tests/e2e/export-contacts-paging.spec.ts (no database; 2500 contacts, cap 1000) and a new case in tests/e2e/clients-export.spec.ts (database, CI only).
- No migration. Not run locally: the end to end specs (no database here).
