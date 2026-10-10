# 2026-10-10 EXECUTOR report: P3-255, account manager client insert limited to four fields

## In plain words

An account manager could already create a client from the counter sale screen, with
only a name, type, IDNO and phone. The database itself did not hold that limit: a
hand-made request with the manager's login could set the stage, the lead owner, notes
or switch the client off. Now the database refuses that. The owner creates clients
exactly as before, and the counter sale path keeps working.

## What changed

- `supabase/migrations/0079_clients_insert_manager_columns.sql`: trigger function
  `public.clients_insert_manager_columns()` (SECURITY INVOKER, execute revoked from
  client roles) and trigger `clients_insert_manager_columns`, BEFORE INSERT on
  `public.clients`. For `current_user = authenticated` and `is_owner()` false it
  raises P0001 with a Romanian sentence naming every refused column. Allowed: name,
  type, fiscal_code, phone, id, stage cold or client, address/email/notes null,
  active true, created_by null or the caller, created_at/updated_at at default, every
  lead column null. No policy changed. No row read, changed or removed.
- `scripts/poc-free/local-db/assertions/0079_clients_insert_manager_columns.sql`:
  manager four fields and walk-in shape written; stage, owner_id, notes, active,
  source, follow_up_date, created_by of somebody else refused with P0001 and no row;
  owner with every column written; column list of `public.clients` pinned.
- `tests/e2e/clients-insert-manager-columns.spec.ts`: the same through PostgREST with
  real tokens, plus the walk-in screen path as the manager.
- Board card P3-255 on the phase 3 board, APPLY-LOG line, LEARNINGS entry.

## Why these columns

Read off `createWalkInClient` and `insertClientRecord` in `lib/data/client-actions.ts`:
for the account manager the insert carries name, type, fiscal_code, address null,
phone, email null, notes null, active true and stage `client` (P3-172 writes the
stage in the insert because `set_client_stage` is invoker and `clients_update` is
owner-only). Nothing else.

## Migration number

0079. Main holds 0077. Open PR #487 (P3-212) holds 0078 and keeps it; this migration
was renumbered from 0078 to 0079 on 2026-10-10 so the two do not clash. The applier
refuses a gap, so #487 must merge before this one.

## Local checks

No Docker and no Supabase CLI here, and starting a local postgres was not permitted,
so `check:migrations`, the applier proofs and the e2e spec run only in CI.
