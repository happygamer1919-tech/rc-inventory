# EXECUTOR report, 2026-09-14, card P3-15, documents on clients and projects

**Role:** EXECUTOR. **Session:** the operator's task queue, task G13, on the owner's machine
(no Docker, no Supabase CLI, no production credentials).
**Branch:** `card/p3-15`. **Pull request:** #293. **State:** open and RED, card blocked on
Ivan. `quality` cannot pass until pull request #290, which holds migrations 0042 and 0043, is
merged. Even when green, the merge waits for the owner, because it applies migration 0044 to
production (CLAUDE.md 8.0).

## Boot status at the start

- Phase 2 board: 68 shipped, 32 todo, 2 blocked, 0 in flight, 0 halted. Launch gate
  readiness 6/9.
- Phase 3 board: 63 shipped, 39 todo, 0 in flight, blocked or halted. Launch gate 0/9.
- Card worked: P3-15, `todo`, depends on P3-08 and P3-09, both shipped.

## Cards touched

| card | status at start | status in this pull request |
|---|---|---|
| P3-15 | todo | blocked, `blocked_on: ivan`, question in the card |

## What changes for Rapid Construct, once merged

The Documente tab on every client page and every project page is no longer an empty box.
An owner picks the kind (Contract, Act, Factură, Fotografie, Altele), uploads a PDF, JPG,
JPEG, PNG, WEBP, DOC, DOCX, XLS or XLSX file up to 20 MB, sees the newest five with a link
to the full list, downloads any file with one click, and deletes a file put in the wrong
place. An account manager sees and downloads only. Files open only through a link that
expires after 15 minutes. Nothing changes on the live site until the pull request merges.

## What was built

- `supabase/migrations/0044_documents.sql`: enum `document_kind`; table `documents` with a
  one-owner check, a structured storage path check tied to its own client or project, a
  20 MB size check, three foreign key indexes, `updated_at` trigger, RLS (select for every
  signed-in user, insert, update and delete for owners only, anon revoked); table
  `document_deletions` written only by the security definer `before delete` trigger
  `documents_record_deletion` with `auth.uid()`, readable by owners only; `rc-docs` widened
  to 20971520 bytes and eight types with a guard that fails the file if the update matched
  nothing; policy `rc_docs_delete` on `storage.objects` for owners only.
- `scripts/poc-free/local-db/assertions/0044_documents.sql`: shape, refusals, bucket read
  back, policies, and the delete path run as the `authenticated` role for an account
  manager (removes nothing, insert refused) and for the owner (one deletion record naming
  the owner).
- `docs/migrations/APPLY-LOG.md`: pending register line `0044_documents.sql`, card de
  aplicare P3-15, added before the merge per CLAUDE.md 8.8.
- `lib/data/documents-types.ts`, `lib/data/documents.ts`, `lib/data/document-actions.ts`,
  `hasDocuments` in `lib/data/schema-capability.ts`.
- `components/documents/DocumentsPanel.tsx`, wired into `ClientTabs.tsx` and
  `ProjectTabs.tsx` in place of the two empty states, and through both detail screens and
  both detail pages.
- `tests/e2e/documents.spec.ts`: the card's eight cases plus the five-row density case.

## Decisions taken, and why

1. **Migration 0044, not 0042.** The task named 0042 as next free. `gh pr diff 290
   --name-only` showed Orange's #290 (EXT-28) holding `0042_error_code_document_too_large.sql`
   and `0043_extraction_upload_page_count.sql`. See "What blocked" for what that costs.
2. **Board status moved in this pull request.** The task said to leave the card at `todo`.
   `npm run check:board-edit` refuses a code pull request whose card status did not move, and
   CLAUDE.md section 2 requires the status in the same pull request; the repository's rule
   wins. It was first set `shipped` (the P3-29a shape, #286), then `blocked` once CI showed
   the acceptance cannot run yet (sections 4 and 6).
3. **Bucket limits: q013 Option 1**, unanswered, recommended default.
4. **Delete policy on the row, owner only.** The card calls the delete "the only delete
   policy authored in phase 3". The task text read it as no row policy; the card is the
   source of truth.
5. **Who deleted: a trigger and a record table.** No existing actor mechanism fits a row
   that disappears; `status_history` records moves of rows that remain.
6. **Browser to bucket upload through a signed upload URL.** The app runs on Vercel, where
   a function request body is capped near 4.5 MB, and Next's default server action body
   limit is 1 MB, so a 20 MB file cannot pass through a server action. The server checks
   role, extension and declared size before, and the stored object's real size and first
   bytes after, deleting the object when it fails.
7. **Download** is Supabase's own signed URL, directly, as `signedDocumentUrl` does for
   inbound orders. Nothing under `app/api/` or any other Orange path was touched.
8. **`Factură`** with its diacritic (CLAUDE.md 11) where the card writes Factura.
9. **The native file button is visually hidden** behind a Romanian label so no English
   reaches the tab. P3-49 still owns every file picker in the app.

## Commands run locally, and results

| command | result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json` | PASS, 0 violations, before each commit |
| `npm run check:card-ids` | OK |
| `npm run check:board-edit` | refused before the first board commit (expected), OK after |
| `npm run check:unique-ids` | OK |
| `npm run check:open-branch-ids` | OK, no id added |
| `npm run check:no-destructive-migration` | OK, 1 file parsed, 39 statements, run after the commit |
| `npm run check:conflict-residue` | OK, run after staging |
| `npm run check:categories` | OK |
| `npm run check:ledger-rows` | PASS |
| `npm run check:no-prod-target` | OK |
| `npm run check:pending-schema-reads` | OK, 1 migration pending, no unguarded read |
| `npm run check:removal-safety` | OK |
| `npm run check:assertion-register` | OK |
| `npm run check:board-clock` | OK, every timestamp at or before its commit |

Not runnable here (no Docker, no Supabase CLI): the end to end suite, `npm run
check:migrations`, `npm run prove:applier`, `npm run prove:assertions`.

## CI

**Run 34900595515 on `074bf10`: failure, at one step.** "Prove the migration applier against
the Docker shim", 9 of 16 proofs passed. Every step before it passed, including "Apply every
migration to a bare postgres, unmodified" (so `0044` and `assertions/0044_documents.sql` apply
and hold file by file) and "Refuse a migration that removes rows". Steps after it did not run,
**so the end to end suite, `documents.spec.ts` included, has NOT run and the acceptance is not
yet proven.**

**Cause, read from the source:** the proof applies every migration from 0013 up as one batch
through `scripts/apply-pending-migrations.mjs`, whose second assertion,
`ledger-no-gaps-ends-at-highest` (line 972), requires the ledger to hold every number from 1 to
the highest. On this branch it goes 0041 then 0044. That assertion stops the batch first, which
is why the three mutation proofs report exit 1 without their own assertion text.

**Not done, deliberately:** renumbering to 0042, which would put one number on two open pull
requests (the 0032 incident, CLAUDE.md 3.1); touching the proof (a check is never made to pass
by weakening it). This is not a failed fix attempt under section 10: nothing on this branch can
fix it.

## What blocked

P3-15, `blocked_on: ivan`, since 2026-09-14T21:51Z. The question, as written into the card:

> DECISION NEEDED: the merge order of pull request #290 (migrations 0042 and 0043) and pull
> request #293 (this card, migration 0044), because #293 cannot pass quality until 0042 and
> 0043 are on main. RECOMMENDATION: option 1, merge #290 first; #293 then merges main, reruns
> quality, and goes to the owner for merge approval.

Filed for Ivan in the operator's mailbox as `q014-p3-15-migration-order-290.md`.

## Defects and findings, cross-referenced to docs/LEARNINGS.md

- **A migration number held by another open branch is invisible to every id check, and a
  number above it cannot pass the applier proof until that branch merges.** Entry appended.
- **A file larger than about 1 MB cannot reach a server action here, and larger than about
  4.5 MB cannot reach any function on Vercel.** Entry appended. The existing inbound order
  upload sends its file through a server action with a 10 MB promise; that path was NOT
  changed or tested by this card and should be checked by its own card.
- The applier proof's own output goes to a file on the runner and not to the log, so its
  refusal text had to be reconstructed from the source. Recorded in the operator's
  KNOWN-FAILURES.

## State at the end, and what the next session picks up

1. Wait for #290 to merge (Ivan's terminal owns it; it was green at 20:27Z and is behind main).
2. Then, on `card/p3-15`: `git fetch origin`, `git merge origin/main`, set P3-15 back to
   `shipped` with evidence naming #293, validator, commit, push, wait for `quality` on the new
   head. Expect the applier proof and the end to end suite to run in full for the first time.
3. When green and `npm run checks:state 293` exits 0: ask the owner to approve the merge. The
   draft sits at `rc-inventory-worktrees/q014-approve-p3-15-merge.DRAFT.md` outside the
   mailbox.
4. After the approved merge: `GET https://app.rapidconstruct.md/api/health` should report
   `ledger_version` `"0044"`, and the pending register line becomes a
   `## 0044_documents.sql - APPLIED BY MERGE` heading in `APPLY-LOG.md`.
