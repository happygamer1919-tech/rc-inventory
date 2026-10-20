# P3-329 report: phone zero rescue and IDNO matching in imports

Date: 2026-10-20. Branch `card/p3-329`. Source: Fable bug check of 2026-10-20 14:57Z, findings 5 and 6 (the finding file is outside the executor folders and was not read; the task text and the code were enough).

## What changed
- `readPhone` (lib/data/import-shared.ts): nine bare digits starting with 7, no plus sign, become +40 and the nine digits.
- `buildClientPlan` (lib/data/client-import-plan.ts): the IDNO is a match key for stored clients and inside the file (second row with the same IDNO is a duplicate with the fill offer), also across batches through `idno:` anchors. The fill offer drops the IDNO when another stored client or another file row holds it. New reason text "Același IDNO ...".
- lib/data/import-idno.ts (new): the held-IDNO check before a fill write, and the Romanian text "IDNO-ul X aparține deja clientului Y." for a 23505 on `fiscal_code`, on fill and on create.
- client-import-actions.ts and lead-import-actions.ts: both fill paths use the check; a fill that drops only the IDNO still fills the other fields and adds a warning line; a create refused on the IDNO says whose it is.

## Not changed
The lead plan keeps its keys (phone and email). The `hasPhase3Schema` gate and the `lead=` prop are untouched. No migration.

## Tests
- tests/e2e/import-phone.spec.ts: four new cases.
- tests/e2e/p3-329-import-idno-plan.spec.ts: eight pure cases (run locally, 8 passed).
- tests/e2e/p3-329-import-idno.spec.ts: one case with the database and the screen (CI only, this machine has no Docker).
- Existing pure import specs run locally: client-import-namephone, p3-313, p3-307 (all but the one case that needs a browser, which is not installed here).
