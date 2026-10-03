# P3-133: the Azi screen gains a section of tasks due today

Date: 2026-10-02. Role: EXECUTOR. Branch: `card/p3-133`. No migration.

## What changes for Rapid Construct

Under the list of leads and clients to phone, the Azi screen now has a second section,
"Sarcini scadente azi", with the open tasks due today. A finished or cancelled task is not
listed. Each row opens the task, and links to the client or project it is attached to. When
nothing is due the section says "Nicio sarcină scadentă azi." The call list is unchanged.

## What was built

- `components/tasks/AziTasksSection.tsx`: the section, its own card and heading, its own table.
- `app/(app)/azi/page.tsx`: reads tasks through `listTasks` (existing read path), keeps those
  where `taskBucket(task, chisinauToday()) === "azi"` and `isTaskOpen(task)`. If the tasks
  table is absent (`tasksVisible()` false) the section is not drawn and the call list renders.
- `lib/data/tasks-shape.ts`: `isTaskOpen()`, the one place the closed states are listed.
- `components/clients/AziScreen.tsx`: takes `tasks` and draws the section under the call card.
  The call list code is untouched.
- `components/tasks/SarciniScreen.tsx`: opens the task named by `?sarcina=<id>` so a row on Azi
  can open it.
- `tests/e2e/tasks.spec.ts`: six cases appended, one per acceptance line (a) to (f).

## Decisions

1. Acceptance (c) names an "existing" case that did not exist. `tests/e2e/azi-screen.spec.ts` is
   not in the diff (its eight cases run unmodified) and a new case with the exact name was added.
2. The tab's Azi bucket keeps finished and cancelled tasks by design. The agreement case compares
   the Azi section with the bucket's open tasks, and first checks the bucket does hold a finished one.
3. The Azi `responsabil` filter also narrows the task section by assignee. With no filter the
   section equals the tab's bucket.
4. Opening a task is `/sarcini?sarcina=<id>`; the tab had no such link before.

## Local gates

Run from the worktree, see the PR body for the results. The end to end suite needs Docker and
the Supabase CLI, so it runs only in CI.
