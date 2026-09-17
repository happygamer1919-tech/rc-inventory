# EXECUTOR report, 2026-09-17, card P3-70, document downloads need an active profile

Role: AUTHOR (wrote card P3-70 on the phase 3 board), then EXECUTOR (built it), one pull request,
branch `card/p3-70`. Source: the operator factory's goal G26, Ivan's finding F1.

## In plain words

A staff account that the owner has switched off can no longer get a download link for any stored
document (contracts, invoices, supplier papers, site photos), not through the app and not by asking
the file storage directly with a sign-in that has not expired yet. A download link is also only
handed out when the document's client or project still exists. Nothing stored is moved, changed or
removed. **The merge is NOT pre-approved**: it changes one rule in the live database, so the owner
decides.

## Boot status report (CLAUDE.md 1)

- Phase 2 board: 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted. Launch gate 6/9.
- Phase 3 board: 84 shipped, 32 todo, 1 blocked, 0 in_flight, 0 halted. Launch gate 0/9.
- Next eligible card by the comparator: AUT-3. This run works the card the owner's goal G26 names.

## What was wrong (F1, confirmed by reading the code)

1. `rc_docs_select` in `supabase/migrations/0002_rc_docs_bucket.sql` was
   `for select to authenticated using (bucket_id = 'rc-docs')`: any signed-in session could read and
   sign every object in the bucket, whether or not its profile was active.
2. `documentDownloadUrl` in `lib/data/document-actions.ts` checked only `getSessionUser()`, read the
   document row and signed a 15 minute link. It never looked at the document's client or project.
3. Why nobody saw it on screen: `proxy.ts` already rewrites every app request of a deactivated
   profile to the no-access screen. The storage API is not behind `proxy.ts`, so a still-valid token
   could ask storage directly.

## What changed

| File | Change |
|---|---|
| `supabase/migrations/0050_rc_docs_select_active_profile.sql` | NEW. `drop policy if exists rc_docs_select` then `create policy rc_docs_select ... for select to authenticated using (bucket_id = 'rc-docs' and public.current_app_role() is not null)`, one transaction. No row touched. Re-runnable. |
| `scripts/poc-free/local-db/assertions/0050_rc_docs_select_active_profile.sql` | NEW. Shape of the policy, exactly one select policy reaching rc-docs, and behaviour as the authenticated role: active profile sees the object (control), deactivated profile and no-profile account see nothing. |
| `docs/migrations/APPLY-LOG.md` | 0050 added to the pending list, card de aplicare P3-70 (the headers spec requires every migration in exactly one place). |
| `lib/data/document-actions.ts` | `documentDownloadUrl` also selects `client_id, project_id`, and refuses with "Documentul nu mai există." unless `ownerExists` (the upload path's own helper, through the caller's RLS-scoped client) finds the owning client or project. |
| `lib/data/documents-types.ts` | New Romanian message `downloadFailed`. |
| `components/documents/DocumentsPanel.tsx` | The download handler catches a failed or empty action call and shows `downloadFailed`, instead of leaving the button on "Se pregătește...". |
| `tests/e2e/document-download-security.spec.ts` | NEW, the named acceptance spec, two cases, below. |
| `docs/board/rc-board-phase3.json` | Card P3-70 authored, in_flight, shipped. |
| `docs/LEARNINGS.md` | One entry: a private bucket's read policy that trusted any session. |

## "May not see": what this app actually has, stated plainly

`clients_select` (0013) and `projects_select` (0016) are both `using (true)` for `authenticated`, and
`documents_select` (0044) is too. There is **no per-user visibility of clients or projects anywhere in
this app**: every active profile, owner or account manager, sees every client and project. So no new
visibility model was invented. The action enforces exactly what exists:

1. an active profile (`getSessionUser()` already returns null for `active = false` and for no profile);
2. the document row readable by the caller;
3. the owning client or project readable by the caller, through `ownerExists`.

`documents.client_id` and `documents.project_id` are `on delete restrict` (0044), so an orphaned
document cannot exist today. Point 3 is a second line of defence, not the repair of a live case, and
the spec therefore cannot build an orphan to refuse. If a stronger reading of "may not see" is wanted
(for example account managers seeing only their own clients), that is a new access model for the whole
CRM and a decision for Ivan and the owner, not something this card should guess.

## Acceptance

Named spec `tests/e2e/document-download-security.spec.ts`:

1. **Deactivated second account.** The owner uploads a PDF to a new client. The owner's real download
   click is captured (action id and body) and replayed with the owner's session: it returns the signed
   link (control). A NEW account with an active account_manager profile is created in the local stack
   (never the shared test accounts), signs in and opens the client's Documente tab. With its own access
   token, storage signs and serves the object (control). Its profile is then set `active = false`.
   The SAME token is now refused by storage for signing and for reading (the 0050 policy); the already
   open tab's Descarcă shows a Romanian refusal (`downloadFailed` or `session`) and starts no download;
   the action replayed with that session returns no signed link; a reload shows "Contul nu are acces"
   with no download button.
2. **No session.** Same capture and owner control. The action replayed with no cookies returns no signed
   link and is redirected to `/autentificare`; the client page in a cookie-less browser lands on the
   Romanian sign-in form; storage refuses to sign with the anon key in place of a user token.
3. **Existing document tests unchanged**: `tests/e2e/documents.spec.ts` (P3-15) is not edited and runs
   in the same CI suite.
4. **Storage-level proof**: case 1 proves `rc_docs_select` against a real local Supabase stack with a
   real token, which needs CI's database. On a bare postgres, the new assertion file proves the policy's
   behaviour for three accounts, and it was watched failing (below).

## Commands run on this machine and results

| Command | Result |
|---|---|
| `npm run id:free -- P3-70` | FREE, lane highest P3-69. Unopened origin branches card/p3-67 and card/p3-68 read by hand: neither holds P3-70. |
| board validator, all three boards, before every commit | PASS |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npx playwright test --list tests/e2e/document-download-security.spec.ts` | 2 tests listed (the spec loads and compiles) |
| `npm run check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration` (1 file, 5 statements), `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`, `check:live-fixtures` | all exit 0 |
| `npm run check:board-edit` | refused while the card was in_flight (correct); run again after the shipped flip |
| every migration (0001 to 0050) plus all 33 assertion files on a throwaway local postgres under /tmp, socket only (stand-in for `check:migrations`, no Docker here) | all passed; 0050 re-run clean |
| same, with 0050 mutated in memory back to the old predicate | refused: "rc_docs_select is not a select to authenticated, inside rc-docs, requiring current_app_role()" |
| same, with 0050 mutated to `current_app_role() is not null or auth.uid() is not null` (text kept, behaviour opened) | refused: "a deactivated profile still sees 1 object(s) in rc-docs" |
| same, with 0050 mutated to deny everyone | refused by the P3-15 assertion (the owner can no longer delete, since delete needs read) |

## Left for CI

- The Playwright suite, including the new spec and `documents.spec.ts`, needs the local Supabase stack
  in CI. Not run here.
- `check:migrations`, `prove:applier` and `prove:assertions` need Docker. On the pull request, the steps
  that refuse a row-removing migration, prove the migration applier and prove every applier assertion
  can fail must show RAN and passed, not skipped.

## Findings reported, not fixed (outside this card)

1. **Table reads have the same shape as F1.** `documents_select`, `clients_select`, `projects_select`
   and most other select policies are `to authenticated using (true)`. A deactivated account's
   still-valid token can read those rows through the database API until it expires (document names,
   client records), just not the files anymore. Worth its own card if Ivan agrees.
2. **`rc_docs_insert`** is still `with check (bucket_id = 'rc-docs')`: a deactivated token could still
   add a new object to the bucket (not read one; an update that filters on the object's name also has
   to pass the select policy in postgres, and delete is owner-only). Left untouched because the task limits this card to reads.
3. **Process slip, no damage.** Two commits on this branch (the in_flight flip and the migration) ran
   the validator piped into `tail` in the same command line as `git commit`, the pattern the latest
   LEARNINGS entry forbids. Both printed PASS, so no red commit was made; later commits ran the
   validator on its own first.

## Off limits, untouched

`app/api/extraction/**` (the callback route is frozen, R-202), `app/api/documents/**`,
`lib/data/extraction*`, `docs/contracts/extraction*`. No existing document, client or project row is
touched by anything in this pull request.

## Merge

NOT pre-approved. Real client data is in production and this pull request carries a migration. The run
stops at an `OWNER:` question in the operator factory's mailbox, with the PR number, head sha and the
migration path. Merging applies 0050 to production within about two minutes.
