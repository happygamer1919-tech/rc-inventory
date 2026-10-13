# P3-267: leads import and deactivated clients

Date: 2026-10-13. Role: EXECUTOR. Branch: card/p3-267.

## Plain summary
A row in a leads file that matches a switched-off client used to be called a duplicate of a client the owner could not find, and "Completează" wrote into that record. Now the check step says "Există deja ca client dezactivat: X. Reactivați-l din fișa clientului înainte de import.", offers nothing to fill, and the import skips the row. The client is not reactivated and no copy is created.

## Changes
- `lib/data/lead-import-actions.ts`: `loadExisting` reads `active`; `addContactNameFillable` ignores inactive matches; `runLeadImport` skips a deactivated stored match even when "fill" was chosen.
- `lib/data/lead-import-plan.ts`: `ExistingClient.active`, `DuplicateTarget.inactive`, empty `fillable` for a deactivated match, `duplicateReason` uses the P3-257 text.
- `readAllClients` is unchanged (the column list is passed in by each caller). `LeadImportSheet` needed no change.
- Tests: `tests/e2e/lead-import-inactive.spec.ts` (four pure cases, one case through the screen and the database).
- Board card P3-267, `docs/LEARNINGS.md` entry. No migration.

## Checked locally
`npx tsc --noEmit` and the board validator. The end to end cases need the CI database (no Supabase env here).
