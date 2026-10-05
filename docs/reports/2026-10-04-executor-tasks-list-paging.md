# P3-162: the Sarcini list reads every task

Role: EXECUTOR. Branch `card/tasks-list-paging`. No migration.

## What changed for Rapid Construct
The Sarcini tab, the Azi task section and the task panels on client and project pages now show every task, however many there are. Before, past 1000 tasks the oldest 1000 were shown and this week's and undated tasks disappeared with no warning.

## Cause
`listTasks` and `listTasksForEntity` in `lib/data/tasks.ts` read with no paging and no count. PostgREST caps an answer at 1000 rows without saying so.

## Change
- New `lib/data/tasks-read.ts` (no server-only): `readTaskRows`, `readEntityTaskRows` and `orderBy`, both reads through `readAllPages` from `lib/data/id-list.ts`. The client is an argument, so a spec can pass a fake one.
- `lib/data/tasks.ts` calls them. Filters, sort and returned shape are unchanged. Every order already ended with `id`, so pages do not skip or repeat a row.
- Other reads checked: `getTask` reads one row by id, `tasks-actions.ts` only writes, and the Azi page reads through `listTasks`. None needed a change.
- Board card P3-162 added to `docs/board/rc-board-phase3.json` (first id offered, P3-161, was taken by another worker before the commit).

## Spec
`tests/e2e/tasks-list-paging.spec.ts`, a fake client that caps at 1000 rows and returns the total:
- 2500 tasks through `readTaskRows` with no query: complete, in order, no duplicates, 3 requests.
- 2500 tasks sorted by due date: complete, undated last, no duplicates.
- Filters still apply and are paged.
- 2500 tasks of one record through `readEntityTaskRows`: complete, in order, no duplicates.
- A short answer and a database error both throw.

## Commands run locally
- `npx tsc --noEmit`: exit 0.
- Board validator on all three boards: exit 0.
- The new spec alone, run with a temporary config that has no web server: 5 passed. It needs no database.
- `npm run build` and the other `check:*` scripts in the close-out list: exit 0.
- The rest of the Playwright suite needs the database and Docker and runs only in CI.
