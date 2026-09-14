# EXECUTOR report, 2026-09-14, card P3-15, documents on clients and projects

**Role:** EXECUTOR. **Session:** the operator's task queue, task G13, on the owner's machine
(no Docker, no Supabase CLI, no production credentials).
**Branch:** `card/p3-15`. **Pull request:** #293. **State:** open, merge held for the
owner's approval, because merging applies migration 0044 to production (CLAUDE.md 8.0).

## Boot status at the start

- Phase 2 board: 68 shipped, 32 todo, 2 blocked, 0 in flight, 0 halted. Launch gate
  readiness 6/9.
- Phase 3 board: 63 shipped, 39 todo, 0 in flight, blocked or halted. Launch gate 0/9.
- Card worked: P3-15, `todo`, depends on P3-08 and P3-09, both shipped.

## Cards touched

| card | status at start | status in this pull request |
|---|---|---|
| P3-15 | todo | shipped, with evidence naming #293; the merge waits for the owner |

## What changes for Rapid Construct

The Documente tab on every client page and every project page is no longer an empty box.
An owner picks the kind (Contract, Act, Factură, Fotografie, Altele), uploads a PDF, JPG,
JPEG, PNG, WEBP, DOC, DOCX, XLS or XLSX file up to 20 MB, sees the newest five with a link
to the full list, downloads any file with one click, and deletes a file put in the wrong
place. An account manager sees and downloads only. Files open only through a link that
expires after 15 minutes.

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
   and `0043_extraction_upload_page_count.sql`.
2. **Board status `shipped`, not `todo`.** The task said to leave the card at `todo`.
   `npm run check:board-edit` refuses a code pull request whose card status did not move, and
   CLAUDE.md section 2 requires the status in the same pull request. P3-29a (#286) shipped
   its card on the branch with the merge held for the owner. The repository's rule wins.
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
| `npm run check:board-edit` | refused before the board commit (expected), OK after: P3-15 todo -> shipped |
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

**Left to CI, because this machine has no Docker and no Supabase CLI:** the end to end
suite with `tests/e2e/documents.spec.ts`, `npm run check:migrations` with the new
assertions file, `npm run prove:applier` and `npm run prove:assertions`. The green
`quality` run id on the head sha is recorded in the pull request and in the owner's
question, not here, because writing it here would move the head sha.

## What blocked

Nothing blocked the card. The merge is held for the owner, by instruction and by the
standing rule that a pull request adding a migration never self-merges.

## Defects and findings, cross-referenced to docs/LEARNINGS.md

- **A migration number taken on another open branch is invisible to every id check.**
  Entry appended.
- **A file larger than about 1 MB cannot reach a server action here, and larger than about
  4.5 MB cannot reach any function on Vercel.** Entry appended. The existing inbound order
  upload sends its file through a server action with a 10 MB promise; that path was NOT
  changed or tested by this card and should be checked by its own card.

## State at the end, and what the next session picks up

- The owner is asked in the operator's mailbox (`q014-approve-p3-15-merge.md`) with the
  pull request number, head sha, migration path and what changes in the live database.
- **Merge order:** #290 holds migrations 0042 and 0043. If #293 merges first, production
  has 0044 before 0042 and 0043, and the Supabase integration may refuse or skip the
  lower-numbered files later. Safest: #290 first. If #293 must go first, #290 renumbers its
  two files above 0044 before merging.
- After the approved merge: `GET https://app.rapidconstruct.md/api/health` should report
  `ledger_version` `"0044"` (once 0042 and 0043 are also in), and the pending register line
  becomes a `## 0044_documents.sql - APPLIED BY MERGE` heading in `APPLY-LOG.md`.
