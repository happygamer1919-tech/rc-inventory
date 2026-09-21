# Executor report: G39, Ivan's finding F20, a document can be dismissed from the review screen

Role AUTHOR, then EXECUTOR. Card P3-84, branch `card/p3-84`, one pull request.
Date 2026-09-21 (UTC).

## In plain words

Rapid Construct can now get rid of a test or junk document on the "Încarcă comanda" screen
without anyone touching the database. The owner presses "Renunță la document", confirms, and can
type a short reason. The document leaves the list of documents waiting to be checked. It is not
deleted: it stays in a folded section under the list, "Documente la care s-a renunțat", marked
"Renunțat", with who dismissed it, when and why. Its lines and its file are kept.

## Boot status (read before any change)

- Phase 2 board: 68 shipped, 2 blocked, 32 todo; launch gate 0/9; next eligible AUT-3.
- Phase 3 board: 100 shipped, 32 todo; launch gate 0/9; next eligible P3-14.
- This session worked the owner-directed goal G39 as a new card, P3-84 (`npm run id:free -- P3-84`:
  FREE, lane highest P3-83, zero open pull requests).

## What changed

| Path | What |
|---|---|
| `supabase/migrations/0056_extraction_draft_cancel.sql` | Three `add column if not exists` on `public.extraction_drafts`: `cancelled_at timestamptz`, `cancelled_by uuid references auth.users (id) on delete set null` (the shape of `confirmed_by`), `cancel_reason text`. All nullable, no default, with comments. No enum, check, policy or row touched. |
| `scripts/poc-free/local-db/assertions/0056_extraction_draft_cancel.sql` | The three columns exist, nullable, no default, typed; a cancelled row writes and reads back; a row written without them stays NULL on all three. Rolled back. |
| `docs/migrations/APPLY-LOG.md` | Pending register line for 0056. |
| `lib/data/schema-capability.ts` | New probe `hasExtractionCancel`, same idiom and cache as `hasExtractionDerivedPartial`. No existing probe changed. |
| `lib/data/extraction.ts` | `listReviewDrafts` adds `.is("cancelled_at", null)` only when the probe says yes. New `listCancelledDrafts()` (null before 0056, newest cancellation first, nested lines, `readAllPages`, names resolved in one batched `profiles` read). |
| `lib/data/extraction-types.ts` | Optional `cancelledAt`, `cancelledBy` (display name), `cancelReason`, `uploadedAt` on `ExtractionDraft`. |
| `lib/data/extraction-actions.ts` | New `cancelExtractionDraft(orderId, reason)`; guards in `confirmExtractionDraft` and `refireExtraction`. |
| `app/(app)/incarca-comanda/page.tsx` | Reads the cancelled list and the session; the button only for the owner. |
| `components/orders/ExtractionReviewPanel.tsx` | "Renunță la document" on every queue card (any state), inline confirm block, the folded cancelled section. |
| `tests/e2e/extraction-cancel-draft.spec.ts` | New, six cases named "G39 F20: ...". |
| `docs/board/rc-board-phase3.json` | Card P3-84 authored, in_flight, then shipped with evidence. |
| `docs/LEARNINGS.md` | One entry: the "operator" role wording. |

### The action, exactly

`cancelExtractionDraft`: no session gives "Sesiune expirată. Autentifică-te din nou."; a role other
than owner gives "Nu ai dreptul să renunți la un document."; before 0056 it gives "Renunțarea la
documente nu este încă activă."; a missing row gives "Documentul nu mai există."; a confirmed draft
gives "Documentul a fost deja confirmat și nu mai poate fi abandonat."; an already cancelled draft
returns ok and keeps the first who and when. Otherwise ONE write of the three columns, guarded by
`.is("cancelled_at", null).is("confirmed_at", null)`; if that write matches nothing (a confirm or a
cancel slipped in between), the row is read again and the true outcome is returned. The reason is
trimmed and capped at 200 characters; empty is stored as NULL. It touches nothing else: no delete,
not the lines, not `status`, not `error_code`, not the file in the bucket. Then
`revalidatePath("/incarca-comanda")`.

Guards: `confirmExtractionDraft` reads `cancelled_at` from the database right after the session
check, before any field validation, and `refireExtraction` adds `cancelled_at` to the row it
already reads; both refuse with "S-a renunțat la acest document. Nu mai poate fi confirmat sau
retrimis." Both reads are behind the probe.

## Decisions, and why

1. **Columns, not an enum value.** `extraction_status` is tied to the check
   `extraction_drafts_error_code_matches_status`, which a new value would force me to replace, and
   `ALTER TYPE ... ADD VALUE` cannot be used in the transaction that adds it. Columns copy the
   `confirmed_at` shape and cannot fail on either rule. I found no concrete reason the enum would be
   better.
2. **Who may cancel: the owner only.** The brief says "owner or active operator" and also "Account
   manager is NOT allowed". In this code base the account manager IS the role the screens call
   "Operator" (`ROLE_LABEL`), and migrations 0050 and 0055 use "active operator" to mean any active
   profile. The two sentences contradict each other. I applied the explicit exclusion (narrower,
   stated in terms, and case 4 of the brief tests it). **For the owner to decide:** if account
   managers should also dismiss documents, it is one line in `cancelExtractionDraft` and one in
   `page.tsx`, plus flipping case 4. Recorded in `docs/LEARNINGS.md`.
3. **Reachable from the order: not possible for an unconfirmed draft.** A draft has no order until
   it is confirmed (header of 0010; the top comment of `tests/e2e/review.spec.ts`). A cancelled
   draft is found on the same screen, in the folded section "Documente la care s-a renunțat", each
   row with filename, upload date, cancel date, who, reason and the badge "Renunțat". I searched for
   an order screen that links or shows its draft (`git grep -i -l -E "draft|ciorn" -- components app/(app)`
   gives only this screen and an unrelated `DevizPanel`): none exists, so no mark was invented there.
   Drafts on the other lane (P2-08a, the order typed first) are never in the queue at all.
4. **Probe gate.** Vercel deploys the code about two minutes before 0056 lands. Until then the screen
   behaves exactly as today: no filter, no button, no section, no new reads in the guards.
5. **Callback route not edited.** Its update at `app/api/extraction/callback/route.ts:767` sends
   `draftUpdate` (built at lines 648 to 765), whose keys never include the three new columns; the
   read at :581 selects `order_id, callback_at`; the GET at :877 is `select *` and only reads. So a
   late callback is answered exactly as today and cannot clear a cancellation. Note for the owner: a
   late callback does still replace the draft's LINES (the route clears and rewrites them at :779 to
   :827, as it always has); the draft stays cancelled and hidden. Case 5 proves the code and the
   cancellation; the route itself is unchanged.
6. **No undo** in this card; a later card if wanted.
7. **The migration keeps `on delete set null`.** The brief asked for that exact column definition
   and, separately, for the word "delete" to appear in no statement because an auto-merge script once
   false-flagged words. The two conflict. I kept the house-style reference (identical to
   `confirmed_by` in 0010) and kept the comments free of those words. The repository's own control,
   `npm run check:no-destructive-migration`, parses it: 1 file, 9 statements, no DROP TABLE, no
   TRUNCATE, no DELETE. Merges are by hand now, so a word-matching script is not in the path.

## Reader inventory (`git grep -n "extraction_drafts" -- app lib components`)

- `lib/data/extraction.ts`, `listReviewDrafts`: **excludes** cancelled drafts (behind the probe).
- `lib/data/extraction.ts`, `listCancelledDrafts`: new, reads **only** cancelled drafts.
- `lib/data/extraction-actions.ts`, `startExtraction`: writes a brand-new order id; not affected.
- `lib/data/extraction-actions.ts`, `refireExtraction`: **refuses** a cancelled draft.
- `lib/data/extraction-actions.ts`, `confirmExtractionDraft`: **refuses** a cancelled draft.
- `lib/data/extraction-actions.ts`, `cancelExtractionDraft`: new, the only writer of the columns.
- `lib/data/extraction-fire.ts`: writes the draft on upload and marks refusals; reached only from
  upload (new id), refire (guarded) and the P2-08a attach lane (its drafts are never in the queue);
  its upsert does not name the new columns, so it cannot clear them. Not changed.
- `lib/data/schema-capability.ts`: probes only; one added.
- `app/api/extraction/callback/route.ts`: not edited; see decision 5.
- **Counts:** nothing in the app counts drafts (no menu badge, no dashboard number, no "în lucru"
  total). The only list is the queue, and it excludes cancelled drafts. The new section shows its
  own count, which case 6 checks equals its rows.

## Tests

`tests/e2e/extraction-cancel-draft.spec.ts`, six cases:

1. Owner cancels a read (extracted) draft through the confirm block with a reason; the queue card is
   gone, the cancelled card has "Renunțat", the reason and the owner's name; the row read back is
   there with `cancelled_at` set, `cancelled_by` the owner (checked against the auth account's
   email), the reason as typed, `status`, `error_code` and the number of lines unchanged,
   `confirmed_at` null. **Ivan's acceptance line.**
2. An in-progress draft (status null) is cancelled with no reason (stored NULL, shown "Fără motiv.").
   Once, at 390 px wide: every part of the confirm block stays inside the screen, the buttons stack,
   "Nu, păstrează" closes it without writing. A screenshot goes to the test output folder; CI keeps
   that folder only when a run fails, so on a green run the measurements are the evidence.
3. The confirm and refire server actions are captured from real clicks (stopped before the server),
   the draft is cancelled, and both captured requests are replayed with the owner's session: both
   answer the Romanian refusal, nothing is fired to the extractor again, no order is created,
   `status` stays `partial`.
4. The account manager sees the draft but no cancel button; the owner's captured cancel request,
   replayed with the manager's session, answers "Nu ai dreptul să renunți la un document." and the
   row stays uncancelled. The owner then cancels it (test data is cancelled, not left behind).
5. A callback posted after the cancel answers 200, the same code any second arrival gets today; the
   cancellation (when, who, reason) is unchanged and the draft stays out of the queue.
6. The section title count equals the number of cancelled rows and none of them is in the queue.

The spec deletes nothing. Existing specs are untouched.

## Commands run locally, each exit 0

`npx tsc --noEmit`, `npm run build`, the board validator on all three boards before every commit,
`npm run check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
`check:no-destructive-migration` (1 file, 9 statements), `check:conflict-residue`,
`check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`
(13 pending migrations, no unguarded read), `check:removal-safety`, `check:assertion-register`,
`npx playwright test tests/e2e/extraction-cancel-draft.spec.ts --list` (6 tests).
`check:board-edit` refused while the card was in_flight, as designed, and is rerun after the flip.

## Left for CI

This machine has no Docker and no Supabase CLI. The whole Playwright suite (the new spec and every
existing extraction spec), `check:migrations` with the new assertion file, the "Refuse a migration
that removes rows" step and both applier proof steps run only in the `quality` check on the pull
request. The pull request is not merged by this session: it carries a migration and real client
data is in production.

## Learnings

One entry in `docs/LEARNINGS.md`: the "operator" role wording. Nothing else broke.
