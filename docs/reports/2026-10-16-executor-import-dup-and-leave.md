# P3-313: import duplicate in one file, and leaving the page mid-import

Source: Fable bug check of 2026-10-16 17:33Z, findings 5 and 6. The finding file is outside the
executor folders and could not be read; the work follows the task text and the code.

## Finding 5: in-file duplicate with and without email
- `lib/data/client-import-plan.ts`: each new row is anchored under email and under name+phone.
  Rows without an email also go into `namePhoneNoEmail`. A row with an email looks up its email,
  then `namePhoneNoEmail`; a row without an email looks up `namePhone` (all rows).
- Cross-batch anchors use the same prefixes; at most two per row, so the existing cap holds.

## Finding 6: leaving the page mid-run
- `lib/use-import-lock.ts`: beforeunload prompt, capture-phase link click and popstate
  interception, `leave` state for the confirm, lock and heartbeat kept on unmount while running.
- `components/ui/ImportLeaveGuard.tsx`: the Romanian confirm and the notice on return.
- `lib/import-lock.ts`: progress note and `importLeftNotice`.
- Wired into the four import sheets (clients, leads, projects, materials).
- Limit: a programmatic `router.push` cannot be vetoed in the Next App Router; link clicks, Back,
  reload and tab close are covered.

## Proof
- `tests/e2e/p3-313-import-dup-and-leave.spec.ts`: 11 pure cases, green locally.
- p3-307 and import-sheet-close pure cases still green locally (30 passed).
- A browser e2e needs a real upload and a database, so it is left to CI.
