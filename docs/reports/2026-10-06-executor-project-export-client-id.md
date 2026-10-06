# Report: project export carries a client identifier (P3-173)

Date: 2026-10-06. Branch: card/project-export-client-id. Executor.

## What changed
- Export (`lib/data/project-export-actions.ts`, `project-export-types.ts`): new last column "Identificator client" with the client id. Existing columns and headers are unchanged.
- Import (`lib/data/project-import-types.ts`): new field `clientId`, matched before the name. Missing column or empty cell falls back to the name match, so old files work as before. The client is resolved after the fields are read, because a field check cannot see another cell.
- Plan (`lib/data/project-import-plan.ts`): a project that already exists is a duplicate whatever the client's active state. A new project under a deactivated client is still an error, with the same Romanian sentence.
- Template file and its headers are unchanged (the new column is export only).
- No migration.

## Tests
`tests/e2e/projects-export.spec.ts`: header case updated (old headers plus the new one last); new cases for a deactivated client plus two same-name clients (zero error rows, all duplicates, new project under the deactivated client refused) and for an old-format file.

## Run locally
`npx tsc --noEmit` exit 0. End to end specs need the CI database and were not run here.

## Left out
The IDNO is not used as a key: the client id exists for every client and is never shared.
