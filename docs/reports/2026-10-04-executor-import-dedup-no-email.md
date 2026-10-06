# Report: client import, rows without email (card P3-168)

**Plain words:** uploading the same client file twice no longer creates the clients without an email a second time. They are recognised by name and phone.

## What changed
- `lib/data/client-import-plan.ts`: new key for rows with no email, normalised name plus the last 8 digits of the phone (so `069123456` and `+373 69 123 456` match). It is checked in the file first, then among stored clients. The duplicate entry has the same shape plus `matchedBy: "namePhone"`, so the screen and the fill step work unchanged. The screen reason reads "Același nume și telefon ..." for these.
- `lib/data/client-import-actions.ts`: the stored client read now passes the phone (the paged read is unchanged).
- Rows with an email keep today's behaviour. A row with no phone has no second key and stays new.
- The lead import already matches on phone or email, so it needed no change.
- `tests/e2e/clients-import.spec.ts`: four new cases (file twice, identical rows in one file, two phone spellings, same name with different phone).
- Card P3-168 added (first drafted as P3-164, renumbered because pull request 434 holds that id) to the phase 3 board. No migration.

## Checked here
`npx tsc --noEmit`, board validator. The end to end spec needs Docker and runs only in CI.
