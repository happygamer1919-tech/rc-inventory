# P3-204: exported dates are the same day on every server

Card P3-204, branch card/p3-204. P3-203 was already taken by the import preview task (branch card/p3-203 in another worktree).

## What changed
- `lib/data/client-export-actions.ts` and `lib/data/lead-export-actions.ts`: the next-step date and the follow-up date ("Data de reluare") now use `formatDate` from `lib/data/format.ts`. No Date object is built from either value. Empty stays an empty cell.
- Data de reluare moved from AAAA-LL-ZZ to ZZ.LL.AAAA. Both importers accept that form (`client-import-types.ts` line 490 and `lead-import-types.ts` line 273 say so), so a re-import still works.
- New spec `tests/e2e/p3-204-export-next-step-date-timezone.spec.ts`, new board card P3-204 on phase 3.

## Unchanged
Column names, order and the other columns. Import sheets and `import-preview-rows.ts` were not touched.

## Run locally
tsc, build, validator and all 13 check scripts exit 0. The Playwright spec could not run here: port 3100 was held by another worker. It runs in CI.
