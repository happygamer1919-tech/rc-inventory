# P3-202: import summaries use correct Romanian plurals

Plain words: the four import screens (clients, leads, projects, materials) now write
"25 de rânduri citite" and "25 de coloane" instead of "25 rânduri" and "25 coloane".

- Client, project and material sheets: finish summary goes through plural().
- All four sheets: the column count goes through plural().
- Text only. Import logic, matching and what is saved are unchanged.
- Spec: tests/e2e/p3-202-import-summary-plurals.spec.ts (1, 5, 25 for rows and columns, plus a
  guard that the sheets carry no hand-built count).
- Left alone: lib/data/lead-import-actions.ts line 555 (server text, not part of these summaries).
- Not run locally: the Playwright spec (the config starts the app and needs a database); left to CI.
