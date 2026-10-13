# P3-270: Sarcini keeps the filter on a switched-off colleague

For Rapid Construct: a task list link for a colleague who was switched off now keeps showing that colleague's tasks, marked "Responsabil inactiv", until "Șterge filtrele" is pressed.

## Cause
`SarciniScreen.tsx` removed `responsabil` from the address on first render whenever the id was not an active colleague. `push()` did the same on any other filter change.

## Change
- `lib/data/tasks.ts`: `findInactiveAssignee(id)` returns the switched-off colleague with that id, or null.
- `app/(app)/sarcini/page.tsx`: passes it to the screen as `inactiveAssignee`.
- `components/tasks/SarciniScreen.tsx`: the mount effect and `push()` drop the id only when it is neither active nor the inactive colleague.
- `tests/e2e/sarcini-inactive-assignee-filter.spec.ts`: new, cases (a) to (d) of the card.
- `tests/e2e/sarcini-dead-filters.spec.ts`: its middle case asserted the bug (colleague dropped on another filter change); it now expects the colleague carried along.
- Board card P3-270 on phase 3; learning appended to `docs/LEARNINGS.md`.

No migration. The e2e suite needs a database and runs in CI only.
