# P3-211: a big import file no longer hangs on the check or the write

Plain words: an import file of up to 5 MB now checks and imports in steps of at most 200 rows, with a line like "Se importă... 400 din 1.200" on the button. If the server refuses or fails, the screen shows a clear Romanian message and the button is free again. This covers the lead, client, project and material imports.

## Cause
Each screen sent every row in one server call for the check and one for the write. The framework refuses a body over 1 MB, the calls had no error handling, so the button stayed on "Se verifică..." or "Se importă..." with no message. One call also wrote every row, which can pass the function time limit.

## Change
- `lib/data/import-batches.ts` (new): splits rows into batches of at most 200 rows and about 700 KB, calls the action one batch after another, merges plans and summaries, keeps the original row numbers, stops at the first failure and returns the Romanian message.
- The four sheets (`ClientImportSheet`, `LeadImportSheet`, `ProjectImportSheet`, `MaterialImportSheet`) use it, with try/catch/finally so `pending` always resets, and show progress on the button.
- `tests/import-batches.test.ts` (new): the named specs. Board card P3-211 on phase 3.
- `next.config.ts` is untouched: the body limit is not raised.

## Duplicates across batches (decision)
At write time each call reloads the stored rows, so a row that duplicates a row written by an earlier batch is found as already stored and stays on "Sari peste" unless the operator chose otherwise. Nothing is created twice. At check time nothing is written, so a duplicate between two different batches is not shown before the write; it shows in the final summary as a skipped row with its reason. Passing keys between calls would have changed the four duplicate rules, which the card forbids.

## Not touched
Parsing rules, the duplicate rules, `next.config.ts`, routes, the schema gate, migrations (none).

## Local checks
See the PR body. Playwright specs for the sheets and the end to end suite run in CI only.
