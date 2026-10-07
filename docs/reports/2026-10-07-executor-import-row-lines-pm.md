# P3-191 import row lines for projects and materials

Role: EXECUTOR. Branch card/p3-191. No migration.

## What was wrong
- P3-155 gave the clients and leads imports the real source line of each row. The projects and materials imports were left out.
- Their sheets still called `parseCsv`, and their plan and action code found a row's cells with `rows[line - headerLine - 1]` and `request.rows[entry.line - 2]`.
- With a blank line or a multi-line cell in the file, "Rândul N" in the error file was not the row Excel shows, and the cells could be those of another row.

## What changed
- `ProjectImportSheet` and `MaterialImportSheet` read with `parseCsvWithLines` and send `lines` with the rows.
- `planProjectImport`, `runProjectImport`, `planMaterialImport`, `runMaterialImport` pass `lines` to `buildProjectPlan` and `buildMaterialPlan`, which pass them to the shared preview.
- Every error row and skipped row finds its cells through `rawRowAt`. No arithmetic on the line number is left.
- Clients and leads imports, column sets, refusal texts and dedup rules are unchanged.

## Checks
- `tests/e2e/import-row-lines-projects-materials.spec.ts` (4 cases) and `tests/e2e/import-error-file-rows.spec.ts` (5 cases) pass locally with a config that has no web server or database.
- The write paths need a database, so only typecheck and CI cover them.
