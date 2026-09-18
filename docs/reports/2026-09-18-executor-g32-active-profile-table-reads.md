# EXECUTOR report, 2026-09-18, card P3-81, client, project and document reads need an active profile

Role: AUTHOR (wrote card P3-81 on the phase 3 board), then EXECUTOR (built it), one pull request,
branch `card/p3-81`. Source: the operator factory's goal G32, which follows up the two findings the
P3-70 report (`docs/reports/2026-09-17-executor-g26-document-download-security.md`) reported and did
not fix.

## In plain words

A staff account that the owner has switched off can no longer read the list of clients, projects or
stored documents by asking the database directly with a sign-in that has not expired yet, and can no
longer add a new file to document storage. Active staff, owner and account managers, see and upload
exactly as before. No client, project, document or stored file is moved, changed or removed: four
access rules change, nothing else. Merging this pull request changes those four rules in the live
database within about two minutes, so the owner is asked before it merges.

## Boot status report (CLAUDE.md 1)

- Phase 2 board: 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted. Launch gate 6/9. (The
  status line printed at boot said 0/9; it read the wrong field, and 6/9 is the board's own count.)
- Phase 3 board, before this card: 97 shipped, 32 todo, 0 blocked, 0 in_flight, 0 halted. Launch
  gate 0/9.
- Next eligible card by the comparator: AUT-3 on phase 2, P3-14 on phase 3. This run works the card
  the owner's goal G32 names, as the factory's task directs.

## What was open (the two findings of the P3-70 report, confirmed by reading the migrations)

1. `clients_select` (`supabase/migrations/0013_clients.sql`), `projects_select`
   (`supabase/migrations/0016_projects.sql`) and `documents_select`
   (`supabase/migrations/0044_documents.sql`) were all `for select to authenticated using (true)`.
   A deactivated account's still-valid token could read every client record, project and document
   name through the database API. The app's screens were already closed to it (`proxy.ts`), the
   database API is not behind `proxy.ts`.
2. `rc_docs_insert` (`supabase/migrations/0002_rc_docs_bucket.sql`) was
   `for insert to authenticated with check (bucket_id = 'rc-docs')`: the same token could add a new
   object to the bucket.

## What changed

| File | Change |
|---|---|
| `supabase/migrations/0055_active_profile_table_reads.sql` | NEW. Four pairs of `drop policy if exists` then `create policy`, same names, one transaction: `clients_select`, `projects_select`, `documents_select` become `using (public.current_app_role() is not null)`; `rc_docs_insert` becomes `with check (bucket_id = 'rc-docs' and public.current_app_role() is not null)`. No row touched. Re-runnable. |
| `scripts/poc-free/local-db/assertions/0055_active_profile_table_reads.sql` | NEW. The shape of the four policies, exactly one select policy on each table and one insert policy reaching rc-docs, then behaviour as the authenticated role: an active profile reads the client, project and document and inserts into rc-docs (the control), a deactivated profile and an account with no profile read nothing and are refused the insert, and exactly one object ends up written. |
| `tests/e2e/active-profile-table-reads.spec.ts` | NEW, the named acceptance spec, below. |
| `docs/migrations/APPLY-LOG.md` | 0055 added to the pending list, card de aplicare P3-81 (`tests/e2e/headers.spec.ts` requires every migration in exactly one place). |
| `lib/data/document-actions.ts` | Comment only: it said `clients_select` and `projects_select` "sunt using (true)", which this migration makes stale; it now says they require an active profile from 0055. No code changed. |
| `docs/board/rc-board-phase3.json` | Card P3-81 authored, in_flight, shipped. |

## The predicate, and why it is safe

`public.current_app_role()` (0001 section 6) returns `profiles.role` only when `profiles.active` is
true, and null for a deactivated profile or no profile row at all. It is `SECURITY DEFINER`, so it
does not recurse through the `profiles` policies. It is the same predicate 0050 already uses for
`rc_docs_select`, which has been live since P3-70.

Who else reads these tables, checked before writing the migration:

- The list and detail functions (0018, 0020, 0021, 0022, 0023, 0040) are all `SECURITY INVOKER`. They
  apply the new rule too: an active caller reads exactly what it read before, a deactivated one reads
  nothing through them either.
- Service role reads (the extraction callback, the scheduled jobs, the test harness) bypass row level
  security and are unaffected.
- Every existing local assertion file that switches to the authenticated role (0044 to 0050) uses
  active profiles only, so none of them changes meaning.

## The exact observable shape of a refusal

- **A refused read is HTTP 200 with an empty array `[]`**, not a 401 or 403. Row level security on a
  select filters rows, it does not raise. The spec asserts `status 200` and `rows == []` for each of
  the three tables.
- **A refused upload is an error status from the storage API** (HTTP 400 or above; Supabase storage
  reports a row level security violation on insert as an error). The spec asserts `>= 400` and, with
  the service role, that no object with that name was written.

## Acceptance

`tests/e2e/active-profile-table-reads.spec.ts`, one case, on a new account created for the run:

1. **Control, while active:** its own access token reads the owner-created client, project and
   document through `/rest/v1` (200, one row each), and uploads a new PDF into `rc-docs` (200, the
   object is listed afterwards).
2. **After `profiles.active = false`, the same token:** 200 and `[]` on all three tables; the upload is
   refused (>= 400) and the object is not listed.
3. **The owner** still reads the same three rows afterwards.

Plus the existing specs `clients.spec.ts`, `projects.spec.ts`, `documents.spec.ts` and
`document-download-security.spec.ts` run unchanged in the same suite.

## Commands run on this machine

| Command | Result |
|---|---|
| `npm run id:free -- P3-81` | FREE, lane highest P3-80, 0 open pull requests |
| board validator, all three boards, before every commit | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run check:no-destructive-migration`, after the commit | exit 0, `1 file(s) parsed, 11 statement(s)` |
| `npm run check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register` | each exit 0 |
| `npm run check:board-edit` | exit 0 once the card is shipped in this pull request (it refused, correctly, while the card was in_flight) |

## Left for CI, and why

- **`npm run check:migrations`** (the new assertion file) needs Docker. This machine has none, and
  starting a throwaway homebrew postgres needed an approval this headless run could not get. The
  `quality` step "Prove the migration applier against the Docker shim" runs it on the pull request.
- **The Playwright suite**, the new spec included, needs a local Supabase stack. It runs only in CI.
- **The destructive-migration refusal and both applier proof steps** must show RAN and passed on the
  head sha before the owner is asked to merge.

## Scope kept

- Not changed: `rc_docs_update` (its own finding), `rc_docs_delete` (already owner-only),
  `rc_docs_select` (already active-only since 0050), the insert, update and delete policies of the
  three tables (already owner-only through `is_owner()`), and every other table's select policy
  (`categories`, `units`, `products`, `inbound_orders` and the rest stay `using (true)`).
- Off limits, untouched: `app/api/extraction/**`, `app/api/documents/**`, `lib/data/extraction*`,
  `docs/contracts/extraction*`.

## LEARNINGS

Nothing new broke. The one trap met, `check:no-destructive-migration` printing `0 file(s)` for a
migration that is written but not yet committed, is already recorded in `docs/LEARNINGS.md` ("A staged
migration is invisible to the destructive-statement check", P3-29a); it was re-run after the commit
and read by its file count. `docs/LEARNINGS.md` is left untouched.

## Merge

No self-merge: real client data is in production and this pull request adds a migration. When
`quality` is green on the head sha with the migration steps run, the factory asks the owner
(`OWNER:` question) with the pull request number, the head sha and the migration path.
