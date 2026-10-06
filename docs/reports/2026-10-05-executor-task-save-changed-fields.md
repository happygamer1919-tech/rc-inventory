# Executor report: task save writes only changed fields (P3-157)

Role EXECUTOR. Run date 2026-10-05 UTC. Branch `card/task-save-changed-fields-r2`.

## In plain words

When someone saves a task, only what they changed is written. A colleague who marked
the task finished in the meantime keeps their change. "Anulează sarcina" writes only
the cancelled status. Saving with no change writes nothing.

## Cards touched

- **P3-157**, authored and built in this pull request, written at `shipped` with
  evidence naming the branch and pull request. Requested id P3-140 was taken
  (`npm run id:free -- P3-140` named P3-156). P3-156 was then taken a minute later by
  our open pull request #423, so the card moved to P3-157 before its own pull request
  was opened. The first branch, `card/task-save-changed-fields`, carried a commit subject naming
  P3-156, which `check:board-edit` cannot resolve on this board. History is never
  rewritten, so the same work moved to `card/task-save-changed-fields-r2` as one commit.

## The defect

`components/tasks/TaskForm.tsx` sent all eight task fields to `updateTask` as they were
when the page loaded. `updateTask` in `lib/data/tasks-actions.ts` already skipped keys
that were absent, but the form never left one absent, so every save rewrote every
column. Cancel sent the same eight fields with the status swapped.

## What changed

- `lib/data/tasks-shape.ts`: `TaskFormValues`, `changedTaskFields(loaded, current)`
  (only the differences; the linked-record pair travels whole), `cancelTaskPatch()`
  (status only), `orNull` (moved here), and `taskPatchRow(patch)` (the row `updateTask`
  writes, pure, so a spec can read it).
- `lib/data/tasks-actions.ts`: `updateTask` builds its row with `taskPatchRow`. Same
  behaviour; absent keys are still never written.
- `components/tasks/TaskForm.tsx`: keeps the values it opened with; Salvează sends the
  diff, an empty diff closes the form with no call; Anulează sarcina sends the status
  only. Look and labels unchanged.
- No migration. No conflict dialog (the optional `updated_at` check was not needed:
  untouched fields are simply not sent, so the colleague's values stay).

## Acceptance

`tests/e2e/task-save-changed-fields.spec.ts`, seven cases named on the card: four pure
(diff, empty diff, row for a due date only, cancel row) and three on screen (colleague's
"Finalizată" survives a due date save from an earlier form, colleague's edits survive a
cancel from an earlier form, a save with no change leaves `updated_at` untouched). The
screen cases need the local Supabase stack and run only in CI; this machine has no Docker.

## Local runs

The pure logic was checked with a throwaway `jiti` script outside the checkout: pass.
Gate results are in the pull request body.

## Defects found

One, appended to `docs/LEARNINGS.md`: "A task save from a form opened earlier undid a
colleague's change".

## State at the end

See the pull request for the CI result. Nothing blocked.
