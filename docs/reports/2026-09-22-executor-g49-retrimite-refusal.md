# EXECUTOR: P3-93, "Retrimite" shows why a resend was refused (G49, findings F5 and F15)

**Role:** AUTHOR, then EXECUTOR, in one pull request.
**Card:** P3-93, phase 3 board.
**Branch:** `card/p3-93`, cut from `origin/main` at `e064f8d` (P3-92, PR #351).
**Goal:** the operator factory's `GOALS.md`, goal G49, the platform owner's words:
"F5 + F15, 'Retrimite' on the review queue swallows refusals (an expired session included):
show the action's message in Romanian; add the test F15 asks for."
**Date:** the run began 2026-09-22 21:05 on the factory's local clock, which is
2026-09-23 01:05 UTC. The file keeps the date the task named. Every board timestamp in
this pull request is read from `date -u`, so they carry the UTC date.

---

## Boot, per repo CLAUDE.md section 1

Role stated: AUTHOR first, then EXECUTOR. Both boards read, phase 2 and phase 3 (RULE-05:
section 1 names only phase 2, and the eligible work sits on phase 3).

- `docs/board/rc-board-phase2.json`, 102 cards: 68 shipped, 32 todo, 2 blocked, 0 in_flight,
  0 halted. Launch gate 0/9.
- `docs/board/rc-board-phase3.json`, 141 cards at boot: 109 shipped, 32 todo, 0 blocked,
  0 in_flight, 0 halted. Launch gate 0/9.
- Next eligible card: the task carries the work itself, so the card is authored here.
  `npm run id:free -- P3-93` answered FREE, lane highest `P3-92`, 0 open pull requests.
- `gh pr list --state open --author @me` was empty before the branch was cut, and
  `gh pr list --state open` showed no other terminal's pull request either.

No file was written before that report.

---

## What was wrong

`ExtractionReviewPanel.tsx`'s `onRefire` was four lines and threw the result away:

```
async function onRefire(orderId: string) {
  setRefiring(orderId);
  await refireExtraction(orderId);
  setRefiring(null);
  router.refresh();
}
```

`refireExtraction` (`lib/data/extraction-actions.ts:157-241`) returns an `ActionResult` with
five distinct Romanian refusals, and not one of them reached the screen:

| # | Refusal | Line | Writes anything first? |
|---|---|---|---|
| 1 | `Sesiune expirată. Autentifică-te din nou.` | `:159` | no |
| 2 | `Documentul nu mai există.` | `:183` | no |
| 3 | `Ciorna a fost deja confirmată.` | `:187` | no |
| 4 | `CANCELLED_REFUSAL` | `:191` | no |
| 5 | `fired.reason`, the fire failure | `:237` | yes, `status`, `error_code`, `reason` |

Refusals 1 to 4 return before any write, so the screen changed by exactly nothing: the
operator pressed the button, the label went back to saying "Retrimite", and there was no way
to learn why. The realistic one is the first, a tab left open overnight.

The same shape of bug on the upload path beside it is Ivan's F21, fixed by P3-85 (PR #343).
That fix is the pattern this card copies.

## What changed

**`components/orders/ExtractionReviewPanel.tsx`, three edits, nothing else in the file.**

1. New state, per card and not global, because `onRefire` is keyed by order id and the button
   is one per draft card:
   `const [refireError, setRefireError] = React.useState<{ orderId: string; message: string } | null>(null);`
2. `onRefire` clears any previous message at the top of every attempt (including one belonging
   to a different card, so a stale refusal cannot sit under the wrong document), keeps the
   result, and on `!result.ok` writes `{ orderId, message: result.message }`. A successful
   resend leaves nothing behind, because the clear already happened at the top.
3. The message renders inside the same `<li>`, under the row that holds the button, with
   `role="alert"` and `data-testid="draft-refire-error"`, visible only when
   `refireError?.orderId === draft.orderId`. The class list is the one the file already uses
   for `extraction-error` and `draft-cancel-error`, character for character, with `mx-5 mb-4`
   instead of `mt-3` because at that position it sits outside the row's own `px-5`. No new
   component and no invented styling.

**`lib/data/extraction-actions.ts`: not touched.** Its five messages are already correct and
already Romanian, its refusal order is unchanged, and every write it performs is unchanged.

## The refresh-timing decision, step 3 of the task

**Chosen: no `router.refresh()` after a refusal. A successful resend refreshes, as before.**

The task allowed either and asked for the reason. Two things decided it:

- Four of the five refusals return before any write, so a refresh has nothing to bring back.
- One of those four, `Documentul nu mai există.`, would be actively harmful: the row is gone,
  so a refresh removes the very card the message was just rendered inside, and the operator
  would once again see nothing. The message would be destroyed by the refresh that was
  supposed to be harmless.
- The fifth, the fire failure, is the only one that writes, and it calls
  `revalidatePath("/incarca-comanda")` itself inside the action (`:236`) before returning. Its
  message IS `fired.reason`, the same text written onto the row, so the operator reads the
  reason from the red box whether or not the row re-renders.

This is also `onFile`'s own discipline from P3-85, which refreshes on a refusal only when the
action reports `saved`. `refireExtraction` carries no `saved` flag, and adding one would be a
change to the action this card is forbidden to touch, so the client takes the conservative
branch instead.

**Remount was checked, and it is not a risk either way:** `drafts` is a prop rendered by the
server component, `refireError` is the client component's own state, and `router.refresh()`
re-renders without remounting. The decision above is about the card disappearing from the
list, not about React dropping state.

## F15: the test

`tests/e2e/extraction-cancel-draft.spec.ts` gains a second describe block,
`G49 F15: refuzul retrimiterii ajunge pe ecran`, with one case:

`G49 F15: retrimiterea refuzată spune pe fișă de ce a fost refuzată`

It lives in that file because the refusal it uses is the cancellation refusal, and that file is
the only one that knows how to produce a cancelled draft. The six existing `G39 F20` cases are
untouched, character for character.

What the case does, all of it through the screen:

1. Uploads a document as the owner and posts a `partial` callback, which is a state that shows
   the "Retrimite" button.
2. Loads `/incarca-comanda` and asserts the button is there and no red box is.
3. Opens a **second tab of the same owner** and cancels the document from the screen, then
   closes it. The first tab is now exactly the stale tab the finding describes: the queue was
   read on the server before the cancellation, so it still offers a button for a document that
   can no longer be resent.
4. Presses "Retrimite" on the first tab and asserts that `draft-refire-error` is visible, has
   `role="alert"`, reads exactly
   `S-a renunțat la acest document. Nu mai poate fi confirmat sau retrimis.`, and that there is
   exactly ONE such box in the whole queue, on that card.
5. Asserts the button went back to saying "Retrimite", that nothing new reached the webhook
   (`firedFor` count unchanged), and that the stored row still carries `cancelled_at`, still
   carries `status = "partial"` and still has no `confirmed_at`.

**The expired-session case is not faked and not skipped silently.** `proxy.ts` is a deny-by-default
proxy: any request to a path outside its allow-list without a session is redirected to the login
screen, and a server action POST to `/incarca-comanda` is such a request. After a `signOut`, the
button press would never reach `refireExtraction` at all, so the case would assert the proxy and
not the screen. `git grep -n "Sesiune expirată" tests/e2e` returns nothing: no spec in this repo
has ever driven a server action from a page whose session has gone, and building that would need
scaffolding this suite does not have. That refusal stays covered by the action's own type and by
the shared rendering path this card added, which is the same code for all five messages.

No existing assertion was changed, deliberately or otherwise.

## Commands run, and what is left for CI

Locally, in the worktree, each exit 0:

- `npx tsc --noEmit`
- `npm run build`
- `node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json`
- `npm run check:card-ids`
- `npm run check:board-edit` (after the card was flipped to `shipped`; it refuses an
  `in_flight` card at the head, by design)
- `npm run check:unique-ids`
- `npm run check:open-branch-ids`
- `npm run check:no-destructive-migration` (0 migration files, this card adds none)
- `npm run check:conflict-residue`
- `npm run check:categories`
- `npm run check:ledger-rows`
- `npm run check:no-prod-target`
- `npm run check:pending-schema-reads`
- `npm run check:removal-safety`
- `npm run check:assertion-register`
- `npm run check:board-clock`
- `npx playwright test tests/e2e/extraction-cancel-draft.spec.ts --list`, which proves the new
  case is collected and names it

There is no `lint` script in this package; the task's "lint" is covered by `npx tsc --noEmit`
and by the build.

**Left to CI, because this machine has no Docker and no Supabase CLI:** the whole end to end
suite. That is where `extraction-cancel-draft.spec.ts`, `review.spec.ts` and `extraction.spec.ts`
actually run, so the card's acceptance line is proved in the pull request's `quality` run and
nowhere else. No migration gate applies: this pull request adds and changes no file under
`supabase/migrations/`.

## Not touched, on purpose

- `lib/data/extraction-actions.ts`, `refireExtraction` included.
- `onFile` and the upload path (P3-85, F21), read only as the model.
- Every other control on the draft card: "Renunță la document", "Vezi antetul", "Verifică",
  and the review form.
- `app/api/extraction/callback/route.ts`, `app/api/documents/**`, `docs/contracts/extraction*`.
  This is a screen fix and no wire contract moves. Andre was not told, because there is nothing
  to tell him.
- The `lead=` grep trap, `components/ui/primitives.tsx:259-270`: nothing was renamed or swept on
  the word lead.
- The known defects of handoff Part 6 and the board hygiene of Part 7.
- No production database was read or written, and no credential value exists on this machine.
  Nothing in this run suggested a real client record was involved: the test fixtures are the
  `TEST-F20-*` documents this suite already creates (the new case reuses that helper and its
  naming, with the tag `refuz`), and test data is cancelled, never deleted.

## What broke while working it

One check failed, and it is an already recorded class, not a new one: `check:board-clock`
refused the authored card because `last_checkpoint` had been composed as a round
`2026-09-23T01:10:00Z` while the commit carrying it landed at `01:06:25Z`, four minutes
earlier. `docs/LEARNINGS.md` already carries that exact failure from GATE-01, with the same
"four minutes ahead" and the same cause. Both entries are appended to `docs/LEARNINGS.md` in
this pull request: the recurrence, because a rule that is written and still broken is worth
the second line, and the refresh-after-refusal trap, which is new.

Nothing else broke.

## Merge

Not self-merged. Real client data has been in production since 2026-09-14, so the close-out
block's step 8 revokes the section 3.1 grant on every path, board-only and docs-only included.
When `quality` is green on the head sha and `npm run checks:state <pr>` exits 0, an `OWNER:`
approval question goes to the factory mailbox and the run ends there.
