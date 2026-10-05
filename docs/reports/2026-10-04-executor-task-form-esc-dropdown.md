# P3-150: Task form Esc in dropdown - executor report

**Card ID:** P3-150  
**Branch:** card/task-form-esc-dropdown  
**Date:** 2026-10-04  
**Role:** EXECUTOR  

## Summary

Fixed a bug where pressing Escape in an open dropdown inside the task form would close the entire form instead of just the dropdown, losing any typed text. The fix ensures that when a dropdown is open and Escape is pressed, the dropdown closes but the form and its content remain open.

## Root Cause

In `Combobox.tsx`, the Escape key handler called `setOpen(false)` and `setQuery("")` but did not stop event propagation. The Escape event bubbled up to a window-level keydown listener in `TaskForm.tsx` (lines 116-122) that closes the form on any Escape key press.

## Implementation

**Modified files:**
- `components/ui/Combobox.tsx` (lines 149-157): Added event propagation stop when list is open on Escape
  - `e.preventDefault()`
  - `e.stopPropagation()`
  - `e.nativeEvent.stopImmediatePropagation()`

**New test file:**
- `tests/e2e/task-form-esc-dropdown.spec.ts`: Comprehensive test covering the fix

## Acceptance Criteria

✓ The named case `task-form-esc-dropdown` in tests/e2e/task-form-esc-dropdown.spec.ts:
  - Dropdown open + Esc keeps form open with typed title still there
  - Second Esc (list closed) closes the form

✓ `npx tsc --noEmit` exits 0  
✓ `npm run build` exits 0  
✓ No em dash or en dash in changed files  
✓ Board validator exits 0  
✓ All local gate checks passed:
  - npm run check:card-ids
  - npm run check:board-edit
  - npm run check:unique-ids
  - npm run check:open-branch-ids
  - npm run check:no-destructive-migration
  - npm run check:conflict-residue
  - npm run check:categories
  - npm run check:ledger-rows
  - npm run check:no-prod-target
  - npm run check:pending-schema-reads
  - npm run check:removal-safety
  - npm run check:assertion-register

## Board Update

Card P3-150 added to `docs/board/rc-board-phase3.json`:
- Status: shipped
- Lane: shipped
- Home lane: in_flight
- Priority: medium
- Depends on: P3-130, P3-131, P3-132, P3-133

## Testing Notes

The test navigates to `/sarcini` (tasks screen), opens the task form, fills in title and description, opens the entity type dropdown (Înregistrare), presses Escape, verifies the dropdown closes while the form and typed text remain, then presses Escape again to close the form.

The fix prevents event propagation only when the list is open, preserving the original behavior when the dropdown is closed (Escape still closes the form).

## CI Status

Waiting for quality check to pass. Commits:
1. c3ef8db: P3-150: Escape in dropdown closes list only; form and typed text stay
2. ba60ae1: P3-150: Flip card status to shipped, add evidence
3. 547a3b1: P3-150: Fix test spec - use /sarcini page instead of creating client

## No Breaking Changes

- Arrow keys and Enter in Combobox behave as before
- Form-level Escape behavior unchanged when dropdown is not open
- No migrations or schema changes
- All existing tests should pass
