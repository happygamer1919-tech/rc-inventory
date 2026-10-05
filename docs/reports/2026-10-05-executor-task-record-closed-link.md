# Executor report: task record box for closed project or inactive client (P3-160)

Date: 2026-10-05. Branch: card/task-record-closed-link.

## What changed for Rapid Construct
Opening a task linked to a closed project or an inactive client now shows that record's name (with "(închis)" or "(inactiv)") in the "Înregistrare" box, not an empty box. Saving keeps the link, as before.

## Changes
- `lib/data/tasks.ts`: `listClosedLinkChoices` reads the linked records missing from the choice lists (at most two reads).
- `lib/data/tasks-shape.ts`: `linkChoicesWithCurrent`, `taskLinkKey`.
- `app/(app)/sarcini/page.tsx`, `components/tasks/SarciniScreen.tsx`, `components/tasks/TaskForm.tsx`: pass the one record of the edited task into the form's list. New tasks unchanged.
- `tests/e2e/task-record-closed-link.spec.ts`: a pure case and an end to end case (CI only).
- Card P3-160 on the phase 3 board (P3-142 was taken on another branch).

## Not changed
`components/ui/Combobox.tsx`, the look of the form, routes, the extraction and documents folders. No migration.

## Checks
Run locally: see the PR body. The end to end spec needs Docker and runs in CI only.
