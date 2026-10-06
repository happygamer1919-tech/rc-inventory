# Executor report: Sarcini three small faults (card P3-169)

Requested id P3-151 was taken, so the card is P3-169. Branch `card/sarcini-three-small-faults`. No migration.

## What changed
1. `lib/data/tasks-shape.ts`: `isDayString` now checks the day exists (UTC round trip). `/sarcini?de_la=2026-02-31` shows the unfiltered list.
2. `components/tasks/TaskForm.tsx`: "Anulează sarcina" is disabled while the date box is red. The red message stays. I chose this over making cancel work without the date, because `save()` sends the whole form and a half-typed date would travel with it.
3. `components/ui/DateField.tsx`: new opt-in prop `completeOnly`. `components/tasks/SarciniScreen.tsx` sets it on both date filters, so the address changes only for a whole real date or an emptied box. Other screens using DateField are unchanged.

## Tests
New file `tests/e2e/tasks-small-faults.spec.ts`, four cases (named on the card). The file name sorts after `task-assignee-email-fallback.spec.ts` on purpose: that spec finds its row by climbing three parents and fails with a strict mode error when another unassigned task sits in the same group (seen in CI run 37398176920 and 37402289585, only that spec failed).

## Local gates
Run in the worktree: board validator, `npx tsc --noEmit`. The end to end suite needs Docker and Supabase and runs only in CI.
