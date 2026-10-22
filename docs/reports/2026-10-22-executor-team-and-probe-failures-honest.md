# P3-337 report: team list and probe failures told honestly

Source: bug check 2026-10-22 17:50Z, findings 4 and 5.

## Changed
- `lib/data/schema-capability.ts`: `hasPhase3Schema` uses `settleProbe`. `false` is cached only for a real missing-table answer; any other error or throw answers true and is not cached. The other gates in the file already used `settleProbe` (checked).
- `app/(app)/clienti/[id]/page.tsx`, `app/(app)/proiecte/[id]/page.tsx`: call `readTaskAssigneeChoices` and pass `teamFailed` through `ClientDetailScreen` / `ProjectDetailScreen` to `TaskPanel`, then `TaskForm` (already disables the picker and shows 'Lista echipei nu s-a putut încărca.').
- New `tests/e2e/phase3-probe-cache.spec.ts`; board card P3-337.

## Not done
- No e2e for the record-page notice: forcing `list_team_members` to fail needs database setup that only CI has. The notice reuses the TaskForm code that P3-330 tests.
- Playwright specs could not run locally (the config starts servers that need the database); left to CI.
- No migration.
