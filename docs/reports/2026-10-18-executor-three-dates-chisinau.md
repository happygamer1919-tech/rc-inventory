# P3-318: timestamps on client, project and document screens show the Chisinau day

Changed (all `formatDate` to `formatTimestampDate`):
- `components/clients/ClientDetailScreen.tsx`: Adăugat
- `components/projects/ProjectDetailScreen.tsx`: Adăugat
- `components/documents/DocumentsPanel.tsx`: Încărcat la (import `formatDate` dropped, nothing else used it)
- Found by the grep and fixed too: `components/projects/ProjectTabs.tsx`, history column Când (`createdAt`) and the outbound list column Data (`issuedAt`, a timestamptz).

Pure date columns (start, planned end, follow-up, next action) stay on `formatDate`.

Test: `tests/format-timestamp-date.test.ts` (2026-10-31T23:30Z gives 01.11.2026; source check of the five spots).
Card id: the task said P3-317; `npm run id:free` reported it taken and gave P3-318.
No migration.
