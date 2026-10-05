# P3-157: task assignee names for account managers

Role: EXECUTOR. Branch `card/task-assignee-names`. Bug check 2026-10-04.

## What changed for Rapid Construct
An account manager now sees the real person on every task and can give a task to any active colleague. Before, a task given to someone else showed "Nealocată" and the Responsabil list held only the user.

## Cause
`profiles_select` (migration 0001) lets a user read only their own profile unless they are an owner. The task read joined the assignee's profile, so for an account manager the join came back empty for every colleague.

## Fix
- `supabase/migrations/0072_list_team_members.sql`: security definer function `list_team_members()` returning id, display_name, active. search_path pinned, execute for `authenticated` only, no rows for a deactivated caller or an account with no profile. The profiles read rule is not touched. Additive, no row written or removed.
- `lib/data/tasks-map.ts` (new, no server import): `toTask(row, names)`, `teamNameLookup`, `assigneeChoices`, `assigneeLabel`.
- `lib/data/tasks.ts`: the three task reads take names from the function; the join stays as fallback. `listTaskAssigneeChoices()` feeds the Responsabil picker on Sarcini and on the client and project panels, and falls back to the old owner-choices read when the function does not exist yet.
- `components/tasks/TaskForm.tsx`: a deactivated current assignee shows by name, marked "(inactiv)".
- `TaskTable.tsx`, `AziTasksSection.tsx`: "Nealocată" only when no one is assigned.
- `scripts/poc-free/check-pending-schema-reads.mjs`: one exemption for `tasks-map.ts`, same reason as `tasks-types.ts` (word `description`, no table call).
- Board card P3-157 (P3-140 was taken), APPLY-LOG line, LEARNINGS entry.

Owner view: for an owner `display_name` falls back to the email when the full name is empty, as the screens did before.

## Specs
- `tests/e2e/task-assignee-names.spec.ts`: two pure cases (name from the new source; "Nealocată" only when unassigned) and two stack cases (manager sees a colleague's name and can pick them; a deactivated caller gets no team list). CI only.
- `scripts/poc-free/local-db/assertions/0072_list_team_members.sql`: shape, grants, profiles rule unchanged, who sees the team.

## Local gates
tsc, build, validator, and the thirteen check scripts: see PR body. Playwright and the applier proofs need Docker and run in CI only.
