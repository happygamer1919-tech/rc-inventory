# P3-215 executor report, 2026-10-10

Card: P3-215, branch `card/export-owner-deactivated-r2`.

## What changed
- `lib/data/import-clients-read.ts`: new `readAllOwnerProfiles`, reads every profile (active or not), throws `ImportReadError` on failure.
- `lib/data/client-export-actions.ts` and `lib/data/lead-export-actions.ts`: Responsabil names come from it, through `loadOrRefuse`. A failed read returns `ok: false` with the Romanian team-list message instead of a file with a blank column. Names use `ownerDisplayName`.
- `listClientOwnerChoices` and the pickers are untouched. No migration, no RLS change.
- Card P3-215 added to `docs/board/rc-board-phase3.json`; LEARNINGS entry added.

## Tests
- `tests/e2e/p3-215-export-owner-names.spec.ts`: inactive profile is read with no active filter; failed read gives the refusal message. Run locally with a stripped config (no database here): 2 passed.
- `npx tsc --noEmit`: exit 0.

## Notes
- The older `tests/*.test.ts` files sit outside Playwright's `testDir` (`tests/e2e`), so CI does not run them. The new spec is under `tests/e2e` on purpose.
