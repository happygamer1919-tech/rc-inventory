# P3-304 executor report, 2026-10-14

Import panels (clients, leads, projects, products) ignore Escape, backdrop click and the X button while an import is running. The X is disabled with the title "Importul este în curs. Așteptați să se termine." Closing works as before once the import ends.

Files: lib/import-sheet-close.ts, the four sheets, tests/import-sheet-close.test.ts (7 cases, green locally with a no-webServer config), board card P3-304.

Not done: the server batch loop is not cancellable, by design of this card.
