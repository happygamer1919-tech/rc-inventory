# P3-141: new rows listed in the check step of the four imports

Clause 3 of the import cards (P3-123): "the parsed rows shown to the operator". Before this card
the check step showed counts, duplicates and errors only.

## What changed
- `lib/data/import-preview-rows.ts`: pure builders for the preview table (clients, leads, projects, materials), 50 row limit, Romanian "și încă N rânduri" line.
- Each import plan (`client`, `lead`, `project`, `material` `-import-plan.ts`) now carries `preview`.
- Client and lead actions pass owner names so the Responsabil column shows a name, not an id.
- `components/ui/ImportPreviewRows.tsx`: one shared table, used by the four sheets.
- `tests/e2e/import-preview-rows.spec.ts`: five cases, no database.

## Not changed
Counts, duplicate and error lists, what the import writes, number parsing and decoding (P3-137, P3-145). No migration.

## Checks
See the PR body.
