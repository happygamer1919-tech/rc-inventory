# Executor report: P3-206, import team-list read guard

## Plain words
If the team list cannot be loaded, the lead and client imports now stop with "Nu am putut citi lista echipei. Încercați din nou." They no longer mark every row with a Responsabil as "nu este în echipă".

## What changed
- `lib/data/import-clients-read.ts`: `readOwnerProfiles` reads the active profiles and throws `ImportReadError` on an error or no data.
- `lib/data/clients.ts`: new `readClientOwnerChoices` (throwing). `listClientOwnerChoices` is unchanged for the screens (`/clienti`, `/clienti/[id]`, `/azi`).
- `lib/data/lead-import-actions.ts` and `lib/data/client-import-actions.ts`: plan and write actions read the team through `loadOrRefuse` and return its refusal.
- `tests/e2e/import-clients-read.spec.ts`: new test for a failed and an empty profiles read.
- Board card P3-206 on phase 3, `docs/LEARNINGS.md` entry.

## Checks
- Board validator and `npx tsc --noEmit`: exit 0 locally.
- The spec cannot run locally (the Playwright config starts a web server that needs Supabase variables); it runs in CI.
- No migration. No extraction path touched.
