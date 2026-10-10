# P3-257: client import and deactivated clients

Date: 2026-10-10. Role: EXECUTOR. Branch: card/p3-257.

## Plain summary
A row in a clients file that matches a switched-off client used to be called a duplicate of a client the owner could not find, and "Completează" wrote into that record. Now the plan says "Există deja ca client dezactivat: X. Reactivați-l din fișa clientului înainte de import.", offers nothing to fill, and the import skips the row. The client is not reactivated and no copy is created.

## Changes
- `lib/data/client-import-actions.ts`: `loadExisting` reads `active`; `runClientImport` skips a deactivated stored match even when "fill" was chosen.
- `lib/data/client-import-plan.ts`: `ExistingClient.active`, `DuplicateTarget.inactive`, empty `fillable` for a deactivated match, new wording in `duplicateReason`.
- Tests: `tests/e2e/client-import-inactive.spec.ts` (four pure cases), one case in `tests/e2e/clients-import.spec.ts` (deactivated test client, matched by email, record unchanged, no second client).
- Board card P3-257, `docs/LEARNINGS.md` entry.
- No migration. The sheet component needed no change.

## Checked locally
`npx tsc --noEmit` and the board validator. The end to end cases need the CI database.
