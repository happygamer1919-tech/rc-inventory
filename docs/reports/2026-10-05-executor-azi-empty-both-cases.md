# P3-176: Azi empty state shows its message only when there are no calls and no tasks

Branch card/azi-empty-both-cases-r4 (replaces pull requests #434, #440 and #447).

What changed for Rapid Construct: on the Azi screen, "Nimic de făcut azi." shows only when there are no calls and no tasks due today. With tasks but no calls, the calls card says "Niciun apel de făcut azi."

Repair notes (repair run, 2026-10-05 and 2026-10-06):
- The card first carried P3-164, which the import card took and merged first, then P3-168 and P3-173, which the lead import card and the projects export card took and merged first. A branch cannot be renumbered without rewriting its commit subjects (no force push), and `check:board-edit` reads those subjects, so each time the same work went onto a fresh branch from main. This one uses P3-176.
- The first spec posted the task with camelCase keys (`dueDate`, `assigneeId`); the table columns are `due_date` and `assignee_id`.
- The shared test database holds calls from other specs, so the calls card wording cannot be asserted from a browser test alone. The title is now the pure function `aziEmptyTitle` (lib/data/azi-empty.ts), proved for all three cases in tests/e2e/azi-empty-title.spec.ts without data. The browser case P3-142b asserts without conditions that the task due today is on screen and the day is not called empty.
- Creating that task exposed a weak locator in tests/e2e/task-assignee-email-fallback.spec.ts (it climbed three levels from the title and matched every row of a small table). It now reads the task row itself.
