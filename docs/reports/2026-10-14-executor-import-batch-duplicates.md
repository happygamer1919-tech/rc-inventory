# Executor report: P3-301, import duplicates across batches and an honest halfway failure

Date: 2026-10-14. Branch `card/p3-301` from origin/main at 9f041c75. No migration.

## What changed for Rapid Construct

- The "Verifică" step of the four imports (leads, clients, projects, materials) now shows a
  duplicate even when the two rows are far apart in a big file. A phone at row 10 and row 260
  of a 300 row leads file used to show two "Noi" rows; it now shows one new row and one
  duplicate ("cu rândul 11 din același fișier"). The counts in the preview match what is written.
- An import that stops halfway now shows what the finished batches did, with
  "Descarcă rândurile nepreluate", and a message that says part of the failed batch (with its
  row range) may already be saved and that the same file can be uploaded again without risk.
  For clients it also names the rows with neither email nor phone, which would be created a
  second time on a re-upload.

## How

- `lib/data/import-file-anchors.ts` (new): the carried duplicate keys, a reader that cleans what
  the screen sends, and a byte cap (300000).
- The four plan files return `anchors` and take `earlier`; the four plan actions pass `earlier`
  (check only). The write actions are unchanged.
- `lib/data/import-batches.ts`: `runImportBatches` collects anchors between check calls, builds
  the halfway message (`importStopped`), `IMPORT_BATCH_BYTES` 700000 to 600000 so a request with
  anchors stays under 1 MB. `mergePlans` drops the anchors.
- The four sheets: pass anchors on the check, show the finished batches' outcome on failure,
  "Importul s-a oprit" heading on that summary, refresh the list.
- `clientRowHasNoKey` in `lib/data/client-import-plan.ts` for the client warning.

## Proof

- `tests/e2e/import-batch-anchors.spec.ts`: for each of the four imports a file sent in batches
  gives the same plan as the same file sent at once (and the old behaviour, without anchors,
  does not).
- `tests/import-batches.test.ts`: failure messages, keyless rows, anchors only on check.
- `tests/e2e/import-batch-duplicates.spec.ts`: the 300 row leads file in the browser, and an
  import cut off at its second server call. Neither writes anything to the database.

## Learnings appended

Three entries in `docs/LEARNINGS.md` (batched check state, non-atomic failure message, local
pure specs).
