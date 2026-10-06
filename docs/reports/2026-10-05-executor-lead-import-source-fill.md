# P3-168 executor report: lead import source fill

**Bug:** with "Completează" chosen on a duplicate, the source picked for the whole file was written onto an existing client, although the check step did not list it.

**Cause:** `prepareRow` fills a missing source with the default, and `buildPlan` treated that value as brought by the file. The check step runs with no default, so it never listed `source`; the import did.

**Fix:** `lib/data/lead-import-plan.ts`, `buildPlan`: a row offers `source` for filling only when its own source cell is not empty. The run uses the same `fillable` list, so it cannot write more than the plan showed. New leads keep the default. No migration.

**Test:** `tests/e2e/lead-import-source-fill.spec.ts` (pure functions, no database): existing client without source stays without it; a source column in the file still fills; a new row gets the default.

**Local gates:** board validator and `npx tsc --noEmit` exit 0. Others listed in the PR body.
