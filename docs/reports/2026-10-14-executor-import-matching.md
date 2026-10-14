# 2026-10-14 EXECUTOR report: imports match the right existing client (P3-307)

Role: EXECUTOR. Card: P3-307 (new, authored in the same pull request). Branch `card/p3-307`.

## In plain words

When a file row fits two saved clients, the import now picks the active one, so a row is no longer told to "reactivate" a client when an active one exists. A client list loaded again with a new email column no longer creates every client a second time. A repeated row in a big file gets the real "fill empty fields" choice. The duplicate check covers a file of 10 000 rows, and above its limit the check step says so. The Importă button is disabled, with the reason, while another import of the same kind runs in the same browser. No migration, nothing in the database changes.

## Source

Fable bug check of 2026-10-14 18:46Z, findings 8, 11 and 24 (zero based), as quoted in the factory task. The finding file lives outside the three folders the executor may read, so it could not be opened. The work follows the task text and was checked against the code on origin/main (f38779a6).

## What was built

- `lib/data/import-stored-index.ts` (new): `setActiveFirst` and `pickActiveMatch`. An active client always beats a deactivated one; between equals the first stays.
- `lib/data/lead-import-plan.ts`: stored maps use `setActiveFirst`; when the phone and the email lead to different clients the active one wins, phone first between equals. A duplicate whose first row is in an earlier batch gets `fillable` from what the row carries (minus the field it matched on) and `against.otherBatch`.
- `lib/data/client-import-plan.ts`: same ranking for the email map and the name plus phone map. A row with an email now also matches, on name plus phone, a stored client with no email (`matchedBy: "namePhone"`, email in the fill list). A stored client with another email is not matched. The key in the file itself is unchanged (rows without email only). Same `otherBatch` handling.
- `lib/data/client-import-types.ts`: the instruction text states the new rule.
- `lib/data/import-file-anchors.ts`: anchor budget 300 KB to 800 KB, anchor row limit 5000 to 10 000, `addAnchors` returns whether it dropped anchors, new `IMPORT_ANCHORS_CAPPED` text.
- `lib/data/import-batches.ts`: batch row budget 600 KB to 150 KB so a batch plus the anchors stay under the 1 MB frame; `runImportBatches` returns `anchorsCapped` and stops adding anchors after the first overflow so they stay a prefix of the file.
- `lib/import-lock.ts`, `lib/use-import-lock.ts` (new): a localStorage lock per kind with a 5 second heartbeat, ignored after 30 seconds.
- The four sheets (client, lead, project, material): the capped notice on the check step, the disabled Importă button with the reason, and the "dacă sunt goale la rândul N" line in the client and lead sheets.
- `tests/e2e/p3-307-import-matching.spec.ts`: 23 plan level cases and one screen case.
- Board card P3-307 in `docs/board/rc-board-phase3.json`, `docs/LEARNINGS.md`.

## Choices worth knowing

- Projects and materials never offered a fill for a duplicate inside the file (`fillable: []` by design), so only the client and lead plans changed for the cross-batch fill.
- The file limit is 5000 rows (`IMPORT_MAX_ROWS`); the anchor budget is sized for 10 000 rows with phone and email, as asked.
- The lock is per browser (localStorage), not per account: two browsers can still import at once.

## Commands run here

- `npx tsc --noEmit`: exit 0.
- The 23 plan level cases of the new spec, run with a throwaway Playwright config that starts no server: 23 passed. The screen case needs a database and a browser and runs in CI only.
- Existing pure import specs (import-batch-anchors, client-import-inactive, lead-import-inactive and others): 68 passed. The three cases that open a browser could not run here (no browser installed); CI runs them.
- Board validator: exit 0.
