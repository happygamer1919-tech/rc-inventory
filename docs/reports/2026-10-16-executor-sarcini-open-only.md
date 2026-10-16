# P3-315: Sarcini opens on open tasks only

Source: Fable bug check of 2026-10-16 20:57Z, finding 7 (zero based). The finding file is outside the executor folders and could not be read; the card was built from the task text and the code.

## What changed for Rapid Construct
- The Sarcini screen opens on the open tasks (De făcut, În lucru). Before, it loaded every task ever written, and finished tasks are never deleted.
- The status filter reads: Deschise, Toate stările, De făcut, În lucru, Finalizate, Anulate.
- Finalizate and Anulate show 50 tasks per page with the same Înapoi / Înainte buttons as Inventar and Comenzi. Toate stările shows everything, as the screen used to.
- Azi and the task panels on client and project pages are unchanged.

## How
- `lib/data/tasks-query.ts`: no `stare` (or an unknown one) parses to status `open`; `stare=toate` parses to the empty status; `taskListIsPaged` is true for done and cancelled; `taskFilterActive` treats `open` as the default, so Șterge filtrele returns to it.
- `lib/data/tasks-read.ts`: one `narrowAndOrder` shared by `readTaskRows` and the new `readTaskPage`; `open` becomes `neq done` and `neq cancelled` in the query.
- `lib/data/tasks.ts`: `listTasksPage`. `app/(app)/sarcini/page.tsx` picks the page read for done and cancelled. `app/(app)/azi/page.tsx` passes an empty status so its read is exactly as before.
- `components/tasks/SarciniScreen.tsx`: new select options, Pager under the table, any filter or sort change drops `pagina`.
- No migration, no index.

## Tests
- New: `tests/e2e/sarcini-open-only.spec.ts` (60 finished and 2 open tasks in one due-date window: only 2 shown, Finalizate shows 50 then 10 on page 2, filter change returns to page 1, Toate stările shows 62). Unit cases added to `tests/e2e/parse-task-query.spec.ts`.
- Changed to fit the new default (nothing deleted or skipped): `tests/e2e/tasks.spec.ts` (three cases that need finished or cancelled rows, and two that cancel a task on screen now open `?stare=toate`), `tests/e2e/tasks-small-faults.spec.ts` (same), `tests/e2e/tasks-list-paging.spec.ts` (fake client gets `neq`).

## Run locally
See the pull request body. The end to end suite runs only in CI (no Docker here).
