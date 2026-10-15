# P3-309 report: Azi and Sarcini honest states (2026-10-15)

Source: Fable bug check 2026-10-14 18:46Z, findings 12 and 13. Repair of PR 530.

## What changed
- `lib/data/tasks.ts`, `lib/data/azi-empty.ts`, `app/(app)/sarcini/page.tsx`, `components/tasks/SarciniScreen.tsx`, `components/clients/AziScreen.tsx`: a failed task list or team list is reported as failed, not as empty.
- Repair on 2026-10-15: main took the id P3-303, so the card is now P3-309. The assignee option text went back to "Responsabil inactiv" (the P3-270 spec pins it); that spec was the one red check in run 38623069413.

## Tests
- `tests/e2e/azi-empty-title.spec.ts`: unchanged assertions plus the failed-read case; runs in CI.
- `tests/e2e/sarcini-inactive-assignee-filter.spec.ts`: untouched, now green again by fixing the code.
