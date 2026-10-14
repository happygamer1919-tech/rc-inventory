# P3-276 report: tasks resilience (2026-10-14)

Source: bug check build-20261013T235131947Z.

## What changed
- `app/(app)/azi/page.tsx`, `app/(app)/clienti/[id]/page.tsx`, `app/(app)/proiecte/[id]/page.tsx`: the task read is caught. On failure the page keeps its other sections and shows `components/tasks/TasksLoadError.tsx` in the tasks section only (new `tasksFailed` prop on `AziScreen`, `ClientDetailScreen`, `ProjectDetailScreen`).
- `lib/data/schema-probe.ts` (new) and `lib/data/schema-capability.ts`: `hasTasks` and the 28 other probes of the same shape remember "no" only when the database says the object is missing. Other errors answer yes and are not remembered. `hasPhase3Schema` is untouched.
- `components/tasks/TaskForm.tsx`: Escape, backdrop, X and Renunță do nothing while a save is pending; a successful save still closes the panel.

## Tests
- `tests/e2e/schema-probe.spec.ts`: 6 cases, run locally, pass.
- `tests/e2e/task-form-closing-while-saving.spec.ts`: delays the server action and checks all four close paths; runs in CI only (no Docker here).

## Judgement call
Treating a non-missing probe error as "feature on" means the real read can then fail in the open (now caught on the three pages) instead of being silently switched off.
