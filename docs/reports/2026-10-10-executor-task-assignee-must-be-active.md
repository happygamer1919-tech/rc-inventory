# P3-259: a task can only be assigned to an active colleague

Date: 2026-10-10. Executor. Branch card/p3-259.

## What changed
- `supabase/migrations/0080_task_assignee_must_be_active.sql`: new SECURITY DEFINER trigger function
  `public.tasks_assignee_must_be_active()` and the trigger `tasks_assignee_must_be_active`, BEFORE
  INSERT OR UPDATE OF assignee_id on `public.tasks`. It raises "Colegul ales nu mai este activ.
  Alegeți alt responsabil." (P0001) when the new assignee is a profile with active false and, on
  update, differs from the old one. Null is always allowed; a missing profile is left to the foreign
  key. No drop, delete, truncate or row change; the 0068 policies are untouched.
- `lib/data/tasks-actions.ts`: `createTask` and `updateTask` refuse an inactive new assignee early,
  with the same sentence and `field: "assigneeId"`, reading the active flag through
  `list_team_members()`. An update that resends the current assignee is not refused. The database
  refusal is translated to the same sentence and field.
- New spec `tests/e2e/task-assignee-must-be-active.spec.ts`: direct insert refused, direct reassign
  refused, active colleague works (insert, move, clear), title edit on a task whose assignee was
  deactivated later still saves (with and without the assignee resent).
- New assertion `scripts/poc-free/local-db/assertions/0080_task_assignee_must_be_active.sql`: trigger
  shape, definer function, still three policies and no delete policy on tasks.
- Card P3-259 on the phase 3 board.

## Migration number
0080, because 0078 (#487) and 0079 (#498) are held by open pull requests.

## Local gates (all exit 0)
`npx tsc --noEmit`, `npm run build`, `check:card-ids`, `check:board-edit`, `check:unique-ids`,
`check:open-branch-ids`, `check:no-destructive-migration`, `check:conflict-residue`,
`check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`,
`check:removal-safety`, `check:assertion-register`, board validator.

## Not run here
The e2e suite and the applier proofs need Docker and Supabase; they run in CI only.

## Learnings
None for the repository. The card id P3-258 was taken by a parallel worker between the free check
and the branch; the next id was used.
