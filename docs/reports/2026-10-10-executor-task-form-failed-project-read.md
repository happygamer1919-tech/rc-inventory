# P3-254: failed project list read in the task form

Plain words: if the project list cannot be loaded while a task is written or edited, the form now says "Lista de proiecte nu a putut fi încărcată. Reîncărcați pagina." and no linked project is shown as closed or inactive.

## Changes
- `lib/data/projects.ts`: new `readSelectableProjects()` returns `{ rows, failed }`; `listSelectableProjects()` keeps its behaviour for iesiri, proiecte, proiecte/[id] and facturare-create.
- `lib/data/tasks-shape.ts`: `closedProjectLabel`, `linkListError`, `PROJECT_LIST_READ_FAILED` (pure, testable).
- `lib/data/tasks.ts`: `listClosedLinkChoices` takes `projectListReadFailed` and keeps the plain name when set.
- `app/(app)/sarcini/page.tsx`, `components/tasks/SarciniScreen.tsx`, `components/tasks/TaskForm.tsx`: the flag reaches the form, which shows the error in place of "Niciun rezultat".
- Clients: `readActiveClientOptions` already throws on a failed read (CLIENT_OPTIONS_READ_FAILED), so no change.
- Test: `tests/e2e/task-link-list-failed.spec.ts` (no database; sits under tests/e2e because CI runs only that folder).

## Not run locally
The Playwright run needs the app server and database (port 3100 busy, no database here); left to CI. `npx tsc --noEmit` passed.
