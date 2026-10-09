# P3-205: id lookups in batches, and read errors no longer swallowed

Role: EXECUTOR. Branch card/p3-205.

## What changed
- `lib/data/id-list.ts`: new `readInBatches` on top of the existing `inBatches` and `ID_LIST_BATCH_SIZE` (100). It merges the batches in order and throws on any failed batch.
- `lib/data/tasks.ts` `listClosedLinkChoices`: client and project lookups use it. A failed read throws, like the other readers in that file.
- `lib/data/lead-import-actions.ts` `addContactNameFillable`: contacts lookup uses it. A failed read throws `ImportReadError`, and both callers (plan and run) wrap the call in `loadOrRefuse`, so the operator sees "Nu am putut citi persoanele de contact. Încercați din nou."
- Spec: `tests/e2e/p3-205-chunk-id-lookups.spec.ts`. Needs the Playwright web servers, so it runs in CI only on this machine.

## Not changed
Return values and order on success, `lead=` prop, import preview rows, import sheets, export files, migrations.

## Local gates
See the PR body.
