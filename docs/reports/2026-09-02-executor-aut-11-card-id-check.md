# EXECUTOR, 2026-09-02: AUT-11, a commit whose card id resolves to no card is refused

Scheduled run **20260902-070904**, worktree `/Users/ivan/rc-inventory-poc-run`.
Card **AUT-11**. Branch `card/aut-11`. **Shipped.** No production connection, no
secret read, no migration.

---

## 1. Boot report

Board `docs/board/rc-board-phase2.json`, `as_of` 2026-09-01T19:25:00Z, 59 cards.

| status | count |
|---|---|
| shipped | 41 |
| todo | 15 |
| in_flight | 1 (AUT-3) |
| blocked | 2 (P2-08b on andre, P2-14 on client) |
| halted | 0 |

Launch gate **6/9**. G4, G7 and G9 fail.

Next eligible card at boot: **AUT-11**. The claims map held one entry, AUT-10 by
the harness at 2026-09-01T12:11:43Z, which had expired six hours later and in any
case names a card that is already shipped. Nothing was held by another actor.

## 2. What was built

`scripts/poc-free/check-card-ids.mjs`, wired into `quality` as the step **Refuse
a commit whose card id resolves to no card**, running `npm run check:card-ids`,
placed immediately after `Validate boards`.

AUT-5 and AUT-6 were built, committed and merged under ids that existed on no
board. The board undercounted the work that had been done and nothing anywhere
was red. It was found by a human reading a log, which is the one detection method
this repository cannot schedule. AUT-10 put the two cards on the board. This card
makes the gap impossible to reopen.

The check reads every commit subject on `origin/main`, takes the prefix before
the first colon, and resolves every id in that prefix against the three boards.

## 3. The four decisions in it, and why each went the way it did

**It reads `origin/main`, never the branch.** The card default says so and the
reason survives restating: a branch mid-work legitimately carries commits for a
card being authored in the same pull request, so a check running against HEAD
would fire on the normal case and be ignored within a week. The question worth
asking is whether the RECORD is complete, and the record is main.

**Every id in the prefix, not the first.** This was a real defect in the first
draft and it is the one thing in this card that would have shipped broken.
`/^(ID)\s*:/` takes one id per subject. Real subjects on main carry more:
`AUT-12, AUT-13, AUT-14:`, `ASK-01, DIGEST-01:`, `GUARD-01, REC-02:`,
`P3-04b, P3-05b:`. The check would have reported OK while reading roughly a third
fewer ids than it claimed, which is the same silence the card exists to remove.
It is in `docs/LEARNINGS.md`, and a self-test case now asserts a two-id subject
whose SECOND id is the unresolvable one.

**Three boards, not two. THIS IS A DEFAULT APPLIED AND IT IS FLAGGED HERE
BECAUSE THE ACCEPTANCE LINE SAYS TWO.** The acceptance names
`docs/board/rc-board-phase2.json` and `docs/board/rc-board.json`, and the same
sentence requires exit 0 against `origin/main`. Forty-seven P3 ids are already on
main, so a two-board resolver cannot satisfy the second half of its own
acceptance. The phase 3 board is in the list, explicit and never a directory
glob, because a board file appearing in `docs/board/` should be a line in a diff
rather than a silent widening of what this check will accept. This does not take
over **AUT-16**, which generalises id resolution for the HARNESS surface, the
digest and the Telegram reply routing, and is a different set of files.

**The allow-list is three entries and each carries its reason in the file.**
`R-` for rulings in `decisions/inbox.md`, `POC-` for harness commits, `INC-` for
incident records. On main today only `R-` and `INC-` have hits, five and one;
`POC-` is present because the card default names it. No history was rewritten,
which is the card's other default and the one that matters most: if an old commit
carries an id that resolves to nothing, the fix is a card or an allow-list entry,
never an edit to the log.

## 4. The acceptance, both halves, run before the check was trusted

Passing half:

```
$ npm run check:card-ids
check-card-ids: self-test
  ok    control: a real card id on main resolves (expected 0 failures, got 0)
  ok    an id that resolves to no card on any board is refused (expected 1 failures, got 1)
  ok    an allow-listed ruling prefix is not a card id (expected 0 failures, got 0)
  ok    every id in a multi-id prefix is resolved, not only the first (expected 1 failures, got 1)
  ok    a run id in a subject prefix is not read as a card id (expected 0 failures, got 0)
  ok    a subject with no colon carries no prefix and is not read (expected 0 failures, got 0)
check-card-ids: 220 commit subject(s) from origin/main
  boards: docs/board/rc-board.json, docs/board/rc-board-phase2.json, docs/board/rc-board-phase3.json (119 card ids)
  card ids resolved: 121
  non-card prefixes skipped: 6
check-card-ids: OK, every card id on the record resolves to a card.
EXIT=0
```

Failing half, on a fixture list, which is what the acceptance means by proving it
before the check is trusted:

```
$ RC_CARD_ID_SUBJECTS=/tmp/aut11-fixture-bad.txt npm run check:card-ids
check-card-ids: 4 commit subject(s) from fixture /tmp/aut11-fixture-bad.txt
  card ids resolved: 2
  non-card prefixes skipped: 1

check-card-ids: 1 commit(s) carry a card id that resolves to no card.
  P2-99  ->  P2-99: a card that was never authored
EXIT=1
```

The self-test runs on every invocation that reads real history, and every
negative case in it is paired with a control that must PASS on the same fixture
harness. Without the control, a fixture that silently fails to load satisfies
every negative assertion while proving nothing, which is how the first draft of
the ask-digest suite passed on all three of its mutants at once.

Three guards refuse rather than reporting OK: a board that does not exist or does
not parse, a board carrying zero cards, and a subject list that came back empty.
Each of those would otherwise pass every assertion while reading nothing.

## 5. Refusals and near-misses worth recording

`quality` gained one step and **no `paths:` key**. CLAUDE.md 3.1 rests on the
whole job running on every pull request, and adding a workflow-level path filter
would kill that section. Nothing here touches it.

The board's `as_of` and `evidence.at` were written as `07:35:00Z` on the first
pass, which is the LOCAL clock the run id is stamped from, not UTC. Corrected in
its own commit. **BOARD-02 is the card that turns this into a check** and it is
still `todo`; this run is one more instance of the drift it describes.

## 6. Cards touched

| card | what happened |
|---|---|
| **AUT-11** | `todo` to `in_flight` to `shipped`. PR **#156**. Acceptance run and passed, both halves. |

One card, not two. The wall clock is the reason and it is stated rather than
implied: the run had roughly twenty minutes left after the acceptance passed, and
`quality` on this repository runs a Supabase stack and a Playwright suite. Section
13 forbids starting work that cannot be finished and merged, so a second card was
not claimed.

PR **#155** is the AUT-11 claim, opened by `scripts/poc/claim.sh` as section 13
requires. It carries `docs/poc/state.json` and nothing else.

## 7. Escalations

None. Nothing was blocked, no default was missing, and no question reached the
R-057 list. The three-board decision in section 3 was taken under the card's own
scope and is recorded on the card rather than asked.

## 8. What the next run picks up first

**BOARD-02**, "The board `as_of` is read from a clock, not from the previous
`as_of`". Section 5 of this report is a fresh instance of exactly what that card
describes, from this run, which makes it the best-evidenced item in the queue.

The eligible queue behind it, in id order: AUT-15, AUT-16, AUT-17, AUT-18, AUT-8,
AUT-9, BOARD-01, CLAIM-01, LEARN-01, P2-20, RST-02, RST-03.

**RST-03 deserves a look ahead of its position in that list.** It is the card for
landing PR #126, five rulings and three authored cards that are committed, green
on their own sha, and stuck outside main behind a conflict. Every day it stays
there is a day the rulings are not in force. It is not the lowest id, so it waits
its turn under section 2, but a run that finds itself with spare budget should
know it is there.

Still blocked, unchanged by this run: **P2-08b** on andre, **P2-14** on client.
**AUT-3** remains `in_flight` and was not touched.
