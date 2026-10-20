# P3-330: Sarcini says when the team list cannot be read

Card P3-330, branch card/p3-330, finding 7 of the Fable bug check of 2026-10-20 14:57Z.

## What changed
- `lib/data/tasks.ts`: `readNames` returns null when `list_team_members` fails; names then come from the profile join. New `readTaskAssigneeChoices` returns `{ choices, failed }`; `listTaskAssigneeChoices` keeps its old shape for the client and project pages.
- `app/(app)/sarcini/page.tsx`: passes `teamFailed` to the screen.
- `components/tasks/SarciniScreen.tsx`: shows "Lista echipei nu s-a putut încărca." when `teamFailed` is set or the inactive-assignee lookup failed.
- `components/tasks/TaskForm.tsx`: the Responsabil select is disabled with the same message as its hint. A saved assignee is kept.
- `lib/data/tasks-shape.ts`: the message constant and `assigneeListError`.
- `tests/e2e/sarcini-team-list-failed.spec.ts`: pure tests, no database.
- Board card P3-330 and a LEARNINGS entry.

## Not done
- No end to end test against a failing RPC: this machine has no database. The pure cases cover the message and the join fallback.
- The client and project detail pages still do not show the message (out of scope).
