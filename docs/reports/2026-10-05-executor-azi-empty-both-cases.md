# P3-168: Azi empty state shows its message only when there are no calls and no tasks

Branch card/azi-empty-both-cases-r2 (replaces pull request #434).

What changed for Rapid Construct: on the Azi screen, "Nimic de făcut azi." shows only when there are no calls and no tasks due today. With tasks but no calls, the calls card says "Niciun apel de făcut azi."

Repair note (2026-10-05, repair run): this work first carried the id P3-164, which the import card also took and merged first. A card id cannot be renumbered in the old branch without rewriting its commit subjects (no force push), and `check:board-edit` reads those subjects, so the same code and spec went onto a fresh branch from main under the next free id P3-168. The spec for case P3-142b also posted the task with camelCase keys (`dueDate`, `assigneeId`); the table columns are `due_date` and `assignee_id`, so the setup call was refused. Fixed in the spec.
