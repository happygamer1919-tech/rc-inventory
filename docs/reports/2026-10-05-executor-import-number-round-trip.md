# P3-167: Number Round-trip Spec

**Executor:** EXECUTOR
**Date:** 2026-10-05
**Card:** P3-167

## Summary

Added a test spec to lock in that every number written by the materials export is read back by the import as the same number. The test verifies that `exportNumber()` and `parseImportNumber()` preserve numeric values across the round-trip, and that the export format for 1.125 is exactly "1,125" (comma decimal).

## What Changed

1. **Test added:** `tests/e2e/import-number.spec.ts`
   - New test case: `numar de import: exportul de materiale se citeste inapoi la fel`
   - Tests values: 0.001, 1.125, 12.5, 999.999, 1234.567, 1000000, 0
   - Verifies that `Number(parseImportNumber(exportNumber(v), 12))` equals `v`
   - Asserts `exportNumber(1.125)` is exactly `"1,125"`

2. **Board updated:** Added P3-167 to `docs/board/rc-board-phase3.json`
   - Status: shipped
   - Depends on: P3-137, P3-129
   - Accepts the named test case green in CI

## Premise

The parser does not change. The export function already writes comma decimals (12,5), which parseImportNumber reads back correctly. Task 141 (import-three-decimals) was stopped because its premise was wrong: the round-trip already works. This card locks that behaviour into a spec.

## Acceptance

- Test case `numar de import: exportul de materiale se citeste inapoi la fel` green in the PR's quality run
- `npx tsc --noEmit` and `npm run build` exit 0
- Board validator exits 0

## Validation

- `npx tsc --noEmit` ✓
- `npm run build` ✓
- `npm run check:card-ids` ✓
- `npm run check:board-edit` ✓
- `npm run check:unique-ids` ✓
- `npm run check:open-branch-ids` ✓
- `npm run check:no-destructive-migration` ✓
- `npm run check:conflict-residue` ✓
- `npm run check:categories` ✓
- `npm run check:ledger-rows` ✓
- `npm run check:no-prod-target` ✓
- `npm run check:pending-schema-reads` ✓
- `npm run check:removal-safety` ✓
- `npm run check:assertion-register` ✓

All local gates pass. CI will run the full test suite including `npx playwright test tests/e2e/import-number.spec.ts`.

## No Issues

No defects or learnings. The parser and export functions already work correctly.
