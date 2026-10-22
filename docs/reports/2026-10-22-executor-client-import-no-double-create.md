# 2026-10-22 EXECUTOR report: two imports at the same time cannot create the same client (P3-338)

Role: EXECUTOR. Card: P3-338 (phase 3 board, authored in this pull request, id from `npm run id:free`). Branch `card/p3-338`.

## In plain words

If two people imported a client or lead list at the same moment, or one person did it on two computers, the same client could be created twice: the lock that was meant to prevent it lives in the browser and only stops a second tab. Now every new client is checked again at the instant it is saved, on the server, one row at a time, and a row that was saved a moment earlier by the other import is skipped and shown as "Dublat ..." in the summary. Nothing changes when one person imports alone.

## Source

Fable bug check build-20261022T175022807Z (2026-10-22 17:50Z), finding 6 (zero based), medium. Line numbers re-checked on origin/main e20ba3e: the plan is built in `lib/data/client-import-actions.ts` `runClientImport` and `lib/data/lead-import-actions.ts` `runLeadImport`, both of which then called `createClientRecord` row by row.

## What was built

- `supabase/migrations/0090_client_import_insert_guard.sql`: one new function, `public.import_insert_client(p_row jsonb, p_email_key text, p_name_key text, p_phone_key text, p_phone_forms text[] default null)`. In one transaction it refuses a caller who is not the owner (42501), takes `pg_advisory_xact_lock(hashtext('rc.client_import_insert'))`, looks for a stored client with the keys the import plans use, and either answers `{"duplicate": {"id", "name", "active", "by"}}` and writes nothing, or inserts the row and answers `{"id": ...}`. SECURITY INVOKER, so the clients policies and triggers apply as for a direct insert. Executable by authenticated and service_role, not anon. No table, column, index, policy or trigger is touched; no DROP, TRUNCATE, DELETE or UPDATE.
- Keys, the same as the plans: client import = email, or name plus the last 8 digits of the phone (a row with an email only against a stored client without one; a row without an email against any); lead import = email, or the phone alone (any stored format, through the digit forms of the canonical number). An active stored client wins over a switched-off one, which is reported as such. The IDNO needed nothing: `clients_fiscal_code_unique` already refuses it and the app already words the refusal.
- `lib/data/import-write-guard.ts` (new, no "use server"): `clientGuardKeys`, `leadGuardKeys` (built from the plans' own `nameKey`, `phoneKey`, `normaliseEmail`, `normalisePhone`, so no second copy of the rules), `readGuardAnswer`, `writeDuplicateReason`.
- `lib/data/client-actions.ts`: `createImportedClientRecord(input, keys)`, owner only like `createClientRecord`, sharing `insertClientRecord`, whose insert goes through the function when keys are given. When PostgREST says the function does not exist (PGRST202 or 42883) it falls back to the plain insert, so imports keep working in the two minutes between the deploy and the migration. The client form, the lead form and the walk-in form still use their own paths.
- `lib/data/client-import-actions.ts`, `lib/data/lead-import-actions.ts`: write through `createImportedClientRecord`; a duplicate answer becomes a `skippedRows` entry whose reason starts with "Dublat găsit la scriere", so the three numbers of the summary still add up to the file.
- `lib/data/client-import-plan.ts`: `nameKey` and `phoneKey` are exported (no other change).
- `scripts/poc-free/local-db/assertions/0090_client_import_insert_guard.sql`, `tests/e2e/p3-338-import-concurrent.spec.ts`, board card P3-338, `docs/migrations/APPLY-LOG.md` pending line, `docs/LEARNINGS.md` three entries.

## Decision on the lock (the brief's "for the duration of a batch")

A lock for a whole batch is not available through PostgREST: each call is its own transaction on a pooled connection, so a transaction advisory lock ends with the call and a session lock cannot be held across calls (the unlock can land on another connection and leave the lock set). The lock that works is the one taken in the same transaction as the check and the insert, so the function does all three and the imports are serialised row by row, which is what stops the double create.

## Commands and results

- Local throwaway Homebrew postgres (no Docker here): all 90 migrations then all 72 assertion files with `ON_ERROR_STOP=1`, all passed, including 0090.
- Mutation proof of the assertion: nine mutants of the function (no lock; email not lowercased; a row with an email also matching a client with another email; phone ignored; name not tidied; inactive ignored; phone forms ignored; phone forms matching anything; no owner check) each turned the assertion red. One mutant (phone ignored) first stayed green; the case `j_other_phone` was added and it then failed.
- Real race on two psql sessions: session A called the function and held its transaction open for three seconds, session B called it with the same email 0.8 seconds later; B waited about two seconds and answered `duplicate` with A's id; one client with that email existed afterwards.
- The full gate list from the close-out block and its results are in the pull request body.
- Not run here: `npm run check:migrations` itself (needs Docker), the applier proofs and the end to end suite, including `tests/e2e/p3-338-import-concurrent.spec.ts`; they run in CI.

## Left for the owner

Migration 0090 changes the live database (one new function, nothing removed): it waits for Max's OK before the merge.
