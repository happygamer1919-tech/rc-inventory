# P3-197: client import matches name plus phone against emailed clients

Plain words: re-importing a client file that has names and phones but no email column no longer creates a second copy of every client who has an email stored.

## What changed
- `lib/data/client-import-plan.ts`: `storedByNamePhone` now indexes every stored client, with or without email (the `if (client.emailKey) continue` is gone). First wins, as before. Header comment updated.
- `tests/e2e/client-import-namephone.spec.ts`: two pure-function cases. A no-email row with the same name (other case and spacing) and phone `+373 69 123 456` is one `duplicate`, `matchedBy: "namePhone"`, `counts.fresh === 0`. A row with a different email and the same name and phone stays `new`.
- Board card P3-197 on phase 3.

## Checked and left alone
- A file row with an email still matches by email only. Within-file matching is unchanged.
- `lib/data/lead-import-plan.ts` has no such skip: it matches by email only, by design. Not touched.
- The stored-client reader (`loadExisting` in `lib/data/client-import-actions.ts`) already loads `phone` for every client. Not touched.
- No migration, no database change, nothing is overwritten.

## Local checks
- The two test cases were run through `tsx` against the real `buildClientPlan` (no database here): first gives `{"fresh":0,"duplicate":1}` with `matchedBy: "namePhone"`, second gives `{"fresh":1,"duplicate":0}`. The Playwright run itself is left to CI (it starts a database).
