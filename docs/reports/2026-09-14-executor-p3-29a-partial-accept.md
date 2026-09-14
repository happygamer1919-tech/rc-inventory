# EXECUTOR report: P3-29a, a partial is accepted without an invented error code

**Role:** EXECUTOR. **Date:** 2026-09-14 (UTC). **Worked from:** the operator's task
queue, task G9 (`011-g9-p3-29a-partial-accept`), run headless on a machine with no
Docker, no Supabase CLI and no production credentials.

## In plain words

When the extraction service reads a supplier document but something in it does not
add up, it sends the result back as a "partial", with a sentence saying what did not
match. Until this change the system refused every such result unless it also carried
an error code, so a document it had mostly understood was thrown away. Now the
half-read document is kept for review, with its explanation. A document that fully
failed still has to say why, exactly as before.

**The pull request is open and deliberately NOT merged.** Merging it changes a rule in
the live database within about two minutes (CLAUDE.md 8.0). The operator's task for
this card says to stop at green and ask the owner first. The owner's merge question
is written to the factory mailbox as `q008-approve-g9-merge.md` only once `quality` is
green on the head sha, and it carries that run's id.

## Card touched

| card | status at start | status on this branch | pull request |
|---|---|---|---|
| P3-29a | todo | shipped (on the branch only; reaches `main` only when the merge is approved) | #286, open, not merged |

## Boot status report (CLAUDE.md section 1)

- Phase 2 board: 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted. Launch gate
  6/9. Next eligible by id: AUT-3.
- Phase 3 board (read too, RULE-05): 58 shipped, 35 todo. P3-29a eligible: todo, no
  dependencies, not blocked. It is the card the task named.
- Open pull requests at pick time: 0. Highest migration on `main`: 0040, so 0041 was
  free, and no open branch held it.

## What was built

**Migration, by path:** `supabase/migrations/0041_extraction_partial_error_code_optional.sql`.
Inside one `begin; ... commit;` it drops `extraction_drafts_error_code_matches_status`
and adds it back under the same name with a wider rule, then comments it:

| status | error_code before (0008) | error_code after (0041) |
|---|---|---|
| failed | required | required |
| partial | required | **optional** |
| extracted | forbidden | forbidden |
| null (fired, not answered) | anything | anything |

The one statement that removes anything is quoted here verbatim, per CLAUDE.md 8.6:

    alter table public.extraction_drafts
      drop constraint if exists extraction_drafts_error_code_matches_status;

It removes a rule about rows and no row. The new rule is strictly wider than the old
one, so every existing row satisfies it. **No UPDATE, no DELETE, no DROP TABLE, no
TRUNCATE.** `check:no-destructive-migration` parsed 1 file, 5 statements, every kind
classified.

**Assertions:** `scripts/poc-free/local-db/assertions/0041_extraction_partial_error_code_optional.sql`
proves:

1. the constraint exists once, as a check, under its 0008 name
2. a partial row with a null error_code and a non-null reason INSERTS (the card)
3. a failed row with a null error_code REFUSES on insert (the card)
4. the same refusal on an UPDATE, which is how the callback route writes
5. an extracted row carrying a code still REFUSES
6. the four shapes legal before 0041 still insert: partial with a code, failed with a
   code, extracted with none, and a row not yet answered

**Route:** `app/api/extraction/callback/route.ts` now answers 400 for a missing
error_code on `failed` only. The comment above the check quotes the old condition.
A second comment, at the EXT-26 precedence block, says what the change means there
(see "Deviations and consequences" below).

**Contract:** `docs/contracts/extraction-v2.md` sections 4.1 and 5.2 now say required
on failed, optional on partial, forbidden on extracted. 5.2 quotes the sentence it
replaces.

**Journal:** a `docs/migrations/APPLY-LOG.md` entry for 0041, predicting the apply by
merge and saying the merge is held for owner approval.

**Test:** `tests/e2e/extraction.spec.ts` case 31. No existing case modified. On one
draft, in order:

1. a partial with the `error_code` key ABSENT (removed from the shared body and
   checked absent before sending), a VAT delta sentence in `reason`, and two lines,
   is answered **202**, and reads back `status` partial, `error_code` null, `reason`
   exactly as sent, two lines
2. the same partial without `reason` is 200 and reads back `reason` null, so reason
   is string or null on a partial
3. an `extracted` payload with a reason is 200 and the reason reads back, so reason is
   stored on extracted too
4. a `failed` payload with no `error_code` is still 400, and the draft is unchanged
5. a `failed` payload with its code and a reason is 200 and both read back

## Acceptance, clause by clause

| clause | what proves it |
|---|---|
| extraction.spec exits 0 with a NEW success-shaped partial case: status partial, error_code ABSENT, VAT delta reason, lines present, accepted with the success code, draft readable with reason stored | case 31, steps 1 and 2; End to end step of `quality` on the implementation head |
| that case fails before the fix, both results shown | red: run 34803390369 on `c1ff4a8` (below). Green: the implementation head's run, in the PR and in `q008` |
| a new numbered migration relaxes the constraint so error_code is required on failed only | `0041_extraction_partial_error_code_optional.sql` |
| check:migrations exits 0 with an assertions file proving partial plus null code plus reason INSERTS and failed plus null code REFUSES | the 0041 assertions file, steps 2 and 3; "Apply every migration to a bare postgres, unmodified" in `quality` |
| tsc exits 0 | local, and in `quality` |
| failed keeps its code, extracted still forbids one | case 31 step 4; assertions steps 3, 4 and 5 |

## Commands run locally, and results

All from the worktree, each exit 0, on the implementation tree:

- `npx tsc --noEmit`
- `npm run build`
- `node docs/board/validate-board.mjs` on the three boards: 0 violations
- `npm run check:card-ids`
- `npm run check:board-edit`: P3-29a, todo to shipped, flipped
- `npm run check:unique-ids`
- `npm run check:open-branch-ids`
- `npm run check:no-destructive-migration`: 1 file, 5 statements, no DROP TABLE, no
  TRUNCATE, no DELETE
- `npm run check:conflict-residue`
- `npm run check:categories`
- `npm run check:ledger-rows`
- `npm run check:no-prod-target`
- `npm run check:pending-schema-reads`
- `npm run check:removal-safety`
- `npm run check:assertion-register`
- `npm run check:board-clock` (not in the operator's list; see the first red run below)

**Not run locally, and why:** `npm run check:migrations`, `npm run prove:applier`,
`npm run prove:assertions` and the Playwright suite need Docker or a local Supabase
stack. This machine has neither. All of them run in `quality`.

## CI

**First red arm, run 34803074469 on `89854ff`: a scaffolding failure, not a result.**
It failed at "Refuse a board timestamp from the future" and skipped every later step,
End to end included. The card's `last_checkpoint` and `evidence.at` carried a rounded
time three minutes ahead of the commit that wrote them. Fixed at the cause with a time
read from the clock; the implementation, already committed locally and never pushed,
was set aside without a force push and restored afterwards. LEARNINGS entry "A board
time typed ahead of the commit stops quality before End to end".

**Red arm, run 34803390369 on `c1ff4a8`:** `quality` failure at End to end only.
Exactly one case failed, case 31:

    tests/e2e/extraction.spec.ts:1667 31. P3-29a: un partial FARA error_code, ...
    Error: un partial fara cod este un succes, nu un 400
    Expected: 202
    Received: 400
      > 1692 | expect(r.status(), "un partial fara cod este un succes, nu un 400").toBe(202);
    1 failed, 220 passed (17.2m)

Every step in front of End to end passed. The two applier proof steps were skipped
there, as they should be: that head carries no migration. The run was watched to its
end before the implementation was pushed, because `quality.yml` cancels an in-progress
run on a new push.

**Implementation head:** pushed in the same session. Its `quality` run id, conclusion,
the End to end result and the two applier proof steps are recorded in the pull request
and in the owner's merge question `q008-approve-g9-merge.md`, because writing them here
would move the head sha away from the run that proved it.

## Deviations and consequences, stated rather than buried

1. **The board flip rides in this pull request, although the task said not to flip to
   shipped until the apply.** `check:board-edit` refuses a code pull request whose card
   is not at a terminal status, and CLAUDE.md section 2 forbids landing the board edit
   separately. P3-43 met the same conflict and resolved it the same way (LEARNINGS "A
   task brief that defers the board flip until after the apply cannot hold here"). On
   `main` the board reads shipped at the moment of the merge, and the merge is the
   apply, so holding the merge holds both.
2. **The red arm ran in CI, not locally.** No local stack. It carried the card at
   shipped with evidence opening "RED ARM ONLY, NOT THE SHIP HEAD", per the P3-43
   precedent.
3. **The contract document changed with the code.** Sections 4.1 and 5.2 said the rule
   this card removes. Leaving them would make the contract say the opposite of the
   route and the database. The card is itself the outcome of Andre's contract review,
   and the change only widens what we accept, so nothing he sends today is refused.
4. **A SCAN-sourced partial with no code can still end up `failed`, and this card did
   not change that.** Since EXT-26 our own arithmetic judges every scan. When the
   sender carries a code, his code wins (R-190). When he carries none, ours supplies
   one and the status moves to `failed`, exactly as case 30 shows for `extracted`, and
   a scan stored `failed` keeps no lines (EXT-15). A partial with no code could not
   exist before this card, so this path is new in practice. A scan partial whose
   numbers our checks accept stays partial with its lines; a digital partial is never
   judged. Case 31 is digital so that it tests the contract gate and not our
   arithmetic. **This is written in the route beside the precedence rule, and is left
   for the owner as a question of product intent, not changed here.**
5. **The mid-deploy window.** Vercel deploys the route and the Supabase app applies
   0041 on the same merge, a couple of minutes apart. If the route lands first, a
   partial without a code in that window is refused by the old constraint on the
   update, which is the route's first write, so the answer is a 500 with nothing
   stored and Make retries it after 0041 lands. No payload accepted today is affected.

## Defects found, cross-referenced to docs/LEARNINGS.md

- "A staged migration is invisible to the destructive-statement check"
- "A board time typed ahead of the commit stops quality before End to end"

## Left for the owner

- **Approve or refuse the merge of #286**, question `q008-approve-g9-merge.md` in the
  factory mailbox. When it merges, the live database loosens one rule: a half-read
  document can be saved without an invented error code. A fully failed document still
  needs one. No existing row changes.
- **Product intent, not blocking the merge:** should a half-read SCAN whose numbers our
  own check refuses keep its read lines as a partial, or be stored as failed with no
  lines, which is what happens today by the existing rules? Deviation 4 above.
- After the merge, `GET https://app.rapidconstruct.md/api/health` should show the
  merge commit and `ledger_version` `"0041"`.

## State at the end

P3-29a is complete on its branch and waits only on the owner's merge decision.
