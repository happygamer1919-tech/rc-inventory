# TRIAGE, run 20260904-040001: the capability edge the board cannot hold, six migrations nobody owns, and a review pipeline that has now misfired three nights running

**Role:** TRIAGE
**Run:** 20260904-040001, unattended, scheduled, worktree `/Users/ivan/rc-inventory-poc-run`
**Date:** 2026-09-04
**Branch:** `triage/20260904-040001`
**Input, as dispatched:** `docs/reports/2026-09-04-executor-aut-16-board-set.md`
**Rulings:** R-108 to R-117. **Cards authored:** 6. **Cards edited:** 2.
**Gates flipped:** none. **Escalations:** 2, each with a recommended default.

---

## 1. Boot status report, printed before any write

**`docs/board/rc-board-phase2.json`**, as_of 2026-09-04T05:15:11Z, 62 cards at
boot: `shipped` 45, `in_flight` 1, `blocked` 2, `todo` 14, `halted` 0.
Launch gate **6 of 9**, G4, G7 and G9 failing.
Blocked: P2-08b on `andre`, P2-14 on `client`. In flight: AUT-3.

**`docs/board/rc-board-phase3.json`**, as_of 2026-09-03T21:05:00Z, 65 cards:
`shipped` 31, `todo` 34, nothing blocked, nothing in flight.
Launch gate **0 of 9**.

**Next eligible card: `EXT-10`**, on the phase 3 board, because AUT-16 merged as
`d4915a8` and the working set now puts phase 3 first. `AUT-17` is the lowest-id
eligible card on phase 2. That difference is not a detail and section 4 below is
about it.

---

## 2. The dispatch was the wrong report, for the third night running

**This is AUT-17's defect, live, and it is ruled at R-109.**

The harness handed this session
`docs/reports/2026-09-04-executor-aut-16-board-set.md`, which is the report of
the PREVIOUS run, `20260904-010000`. The report this run's own executor wrote is
`docs/reports/2026-09-04-executor-aut-16-merge-and-the-check-that-outlasts-the-cap.md`,
committed as `e8410db` on `poc/report-20260904-040001`, unmerged, and therefore
invisible to a selector that reads `origin/main`. That is AUT-17 acceptance case
(3), reproduced by the live system rather than by a fixture.

**And there is a second shape, which has now also fired twice.** Reading
`docs/poc/triage-latest.json` off every branch that carries one:

| branch | pull request | report it consumed |
|---|---|---|
| `board/dispatch-20260903` | #181 | `2026-08-31-executor-p3-13b-deviz-editor.md` |
| `triage/20260903-070005` | #172 | `2026-09-02-executor-rule-02-id-allocation.md` |
| `triage/20260903-220002` | #184 | `2026-09-03-executor-sample-ttl-and-document-source.md` |
| `triage/20260904-010000` | #187 | `2026-09-03-executor-sample-ttl-and-document-source.md` |

**Two consecutive reviews were handed the identical report and both reviewed it
in full, six rulings apart, with nothing red anywhere.** That is acceptance case
(2), and it constrains how the fix may be built: the consumed set cannot be read
from `origin/main` alone, because the file that records a consumption sits inside
the unmerged pull request that performed it. R-109 writes that constraint onto
the card.

**What this session did about it.** It triaged **the report it was dispatched**,
which no committed or open TRIAGE output has consumed. It did **not** also mine
its own run's report, and that is deliberate: DOCTRINE-TRIAGE's one rule that
outranks the rest is that two TRIAGE runs over the same report reach the same
answer, and a session that reviews two reports because the selector is broken has
made that uncheckable. **`2026-09-04-executor-aut-16-merge-and-the-check-that-outlasts-the-cap.md`
is unreviewed and is named here so the next review takes it.**

Two line numbers on AUT-17 are stale by exactly one card, because AUT-16 moved
`run.sh` underneath it: the selector is at 792 to 794, not 734, and the dispatch
phrase is at 808, not 749. Corrected in `notes`, with the instruction to re-grep
rather than trust the correction either.

---

## 3. Deviations, each with the test that decided it. R-108

The report flagged no deviations under that heading, so the deviations are the
three **off-card fixes** it describes in its section 2. CLAUDE.md section 3
forbids self-invented scope, so these are ratified individually rather than waved
past. All three cleared tests 1 to 3 identically: no unrecoverable data, PR #186
merged as `d4915a8` with `test-board-set.sh` 25 passed as committed evidence, and
a rule applied rather than widened. Test 4 decided each one:

| deviation | the alternative, named | verdict |
|---|---|---|
| `claim.sh` keeps the inherited `PATH` | AUT-16's acceptance invokes `claim.sh`, which could not run outside launchd, so the card had no runnable acceptance | **RATIFIED** |
| `claim.sh` stops upper-casing the id | the card would have shipped a harness resolving `P3-04b` correctly in three components and storing its lease under a different string, written and honoured by nobody | **RATIFIED** |
| `run.sh` reports branch work against the board set | every phase 3 card worked on a branch keeps reporting `unknown`, which is section 13's forbidden silence with a value in it | **RATIFIED** |

**The boundary, stated so the ratification is not read as a licence:** all three
sit on the path the card was already editing and all three would have made the
card's own stated property false. A defect in a file the card never opened is
still a new card or a learning, and the same report demonstrates that handling
correctly with three findings written up and untouched.

**The seven `defaults` applications were checked and are not deviations.** One of
them is a rule change wearing a default's clothes and gets its own ruling below.

---

## 4. The pick order changed and the rulebook did not. R-110

The eligible-card selector now returns phase 3 cards ahead of phase 2 ones. That
is **ratified as an application**: R-071 supersedes the harness half of R-061 in
terms, and the order is written into AUT-16's own `defaults`, which section 5
makes pre-authorised. Test 3 does not fire.

**The defect is that CLAUDE.md still describes one board.** Section 2 says "The
board is the work queue", singular, and "Take the lowest-id eligible card", with
a worked example of lexical sorting. Verified today: phase 2 offers `AUT-17`,
phase 3 offers `EXT-10`, the set puts phase 3 first, so the harness picks
`EXT-10`. **A fresh session booting on section 12's two lines computes `AUT-17`
and is wrong, and nothing is red.** Section 12 states the standard this fails.

Card **RULE-05**, and its acceptance is an **agreement check** between
`scripts/poc/boards.mjs` and `CLAUDE.md` rather than a grep for two filenames,
because a prose copy of the board list would re-create the second copy AUT-16
removed.

---

## 5. Findings converted. R-111 to R-114

Every finding in the report's section 4 got exactly one outcome. None survives as
a finding.

**R-111, card AUT-19.** `FORM_DEFAULT` reads `[A-Za-z0-9]+-[0-9]+` and stops at
the digits, so `R P3-04b default` is refused. The ids this locks out are
`P2-08a`, `P2-08b`, `P3-04b`, `P3-05b`, `P3-11a` to `P3-11e`, `P3-13b`, `P3-13c`,
`P3-27a`: that is what a **split card** looks like here, and a split card is
disproportionately the kind that ends up blocked on a person. The refusal reads
back as "no card P3-04b on the board", which the owner cannot distinguish from a
typo, so the channel does not merely lose his answer, it tells him something false
and invites him to stop trying. The executor's decision not to fix it inside
AUT-16 is ratified: the card's `defaults` said the reader does not get wider.

**R-112, card AUT-20, priority high.** `scripts/poc/test-chat-classify.sh` fails
on `main` and is in no required check. Re-verified from the repository: the
quality workflow names twenty two steps and this file is in none, while its four
siblings are each wired in by name with a comment tag. It is high because the
classifier decides what an incoming Telegram message IS, and the failing case is
specifically one where a **question** is classified as an **answer**. An answer
is acted on. The card fixes whichever side the evidence says is wrong, wires the
step in the same pull request, and may not delete the test.

**R-113, card AUT-21.** The finding was "install.sh must be re-run", which is an
action, and an action is not a card. The card is the reason nobody knew: nothing
compares the deployed copies under `/Users/ivan/rc-poc-bin` to the repository, so
the staleness was found by an executor reading a rule rather than by anything
running. It reports, it never re-installs, because a run that reinstalls its own
harness rewrites the script it is executing. `test-install.sh` does not cover this
and its own comments say why: it proves the installer works, not that it was ever
run.

**R-114, card AUT-22, priority high.** The required check costs 18 to 25 minutes
of a 45 minute cap, so a run can merge at most one pull request and a run that
builds a card from scratch cannot merge it. Three consecutive runs have hit it.
The card teaches the run to check the remaining clock against a committed
estimate before starting, and to prefer finishing an inherited branch. **It may
not raise the cap**: that is the owner's number. Boundaries with AUT-9
(measurement) and AUT-18 (census) are recorded in all three.

---

## 6. The gate audit found something no report had. R-115

**Six merged migrations have never been applied and no card on any board applies
them.** `docs/migrations/APPLY-LOG.md` records the ledger at 27 rows with 0027
highest. `origin/main` carries 0028 through 0033.

**All nine phase 3 launch conditions require behaviour live on production**, and
behaviour cannot be live on a schema that was never applied. That gate has read
0 of 9 since the board opened and this is the single deciding cause for all nine.

**The same gap has now opened twice.** R-082 exists because thirteen merged
migrations were reachable by no role. P3-27 applied 0014 to 0027 and shipped.
Six merged since, and nothing in the repository notices the pending register
growing, because merging a migration file changes one text file and changes no
database. The apply has to be somebody's card explicitly, and a card that shipped
its file reads as finished.

**Card APPLY-02, and it is deliberately not an escalation.** Item 8 of the closed
list withholds deciding that a **row-destroying** run should happen. Checked
across all six files for `DROP TABLE`, `TRUNCATE` and `DELETE`: none appears.
R-082 already grants the apply through the assertion-bearing applier. So it is
work, not a decision, and it stays out of the owner's inbox. The card's
`defaults` say the grep does not outrank the parser: if `pgsql-parser` disagrees
inside the applier, the applier refuses with nothing executed and the card blocks
on ivan with the statement quoted.

**This is the long-running escalation resolving, and the digest should stop
carrying the old one.** The 2026-08-31 escalation said thirteen migrations were
unapplied and every phase 3 gate sat behind them. Thirteen have since been
applied and P3-27 shipped. Six have accumulated behind them and now have a card
rather than a question.

---

## 7. The board audit, and the edge the board cannot hold. R-116 and R-117

All four `depends_on` checks were run over all 147 cards on all three boards.

**Check 1, dangling: none.**

**Check 2, satisfied but blocking: two cards, both correct.** P2-08b is blocked on
`andre` and he genuinely owes the live round trip. P2-14 is blocked on `client`
and the client genuinely owes the acceptance walk. Neither cleared.

**Check 3, the capability edge: one resequence, and one edge that could not be
written down.** P2-13 revokes three capabilities at once. Two unshipped cards
need one of them and neither was an edge:

- **GATE-03**, added. `P2-13.depends_on` was `["P2-08b"]` and is now
  `["P2-08b","GATE-03"]`. GATE-03 exists to make P2-13's own checklist name
  R-082 explicitly. Worked in the wrong order, **the checklist ticks out complete
  with R-082's grant still alive**: a permission outliving its condition with
  every box ticked, which is what CLAUDE.md 8.7 was written to prevent.
- **APPLY-02**, refused by the validator:

  ```
  FAIL  docs/board/rc-board-phase2.json  (1 violation)
    - cards (P2-13).depends_on: "APPLY-02" is not a card id on this board.
  ```

  The refusal is correct against the schema. `depends_on` resolves within one
  board file, and APPLY-02 is on the phase 3 board where every migration-apply
  card lives. **So the highest-value dependency this audit found is the one
  dependency the board has no way to hold**, and DOCTRINE-TRIAGE calls the
  capability edge "the one that costs" precisely because it sits where the
  eligibility rule reads it. In prose it is read by whoever happens to read the
  notes. Card **BOARD-03** under R-116; until it ships the edge is at the TOP of
  P2-13's notes with the refusal quoted.

**Check 4, edges on a split card: re-derived, no change.** P2-13 needs the live
round trip, so P2-08b is the correct half of the P2-08 split, not P2-08a.

**Gates: eighteen conditions audited, nothing flipped.**

| board | gate | why it stays fail | backlog? |
|---|---|---|---|
| phase 2 | G4 | R-053's rescoped clause is four assertions and two exist; the missing two are card P2-20, eligible and unclaimed | **yes, one card** |
| phase 2 | G7 | two environment variables in a console nobody here may read, plus a recipient address on a domain that does not resolve, which closes at P2-13 | no, panel action |
| phase 2 | G9 | the client must complete a cycle himself | no, client act |
| phase 3 | all nine | six unapplied migrations; no condition requiring production behaviour can be evidenced | **yes, one card, APPLY-02** |

**One deliberate departure from DOCTRINE-TRIAGE, declared rather than taken
quietly.** Section 4 step 4 says to write the audit into `evidence.ref` whether or
not the gate flips. The validator permits it, so the instruction is followable.
It should not be followed here: `docs/board/board-app.js` renders
`evidenceBit(g.evidence)` beside every gate, so an audit placed there appears in
the owner's portal next to a failing condition, in the slot labelled as its proof.
The owner does not read code, which is the standing condition this project is
built around. **The audits go in `notes`, matching every prior audit on this
board, and DOCTRINE-TRIAGE section 4 step 4 and the board's own rendering
disagree.** Saying so is what that document's opening calls a legitimate TRIAGE
output.

---

## 8. On the ruling ids, which are R-108 and not R-098

`decisions/NEXT-RULING-ID` on `origin/main` holds `R-098`. It was not taken.
`R-098` through `R-107` are each already written on an open pull request: #181
and #184 both carry `R-098`, #184 carries through `R-101`, #187 carries `R-102`
to `R-107`. Taking `R-098` would knowingly produce the collision CLAUDE.md
section 8b exists to convert into a conflict. `R-108` is the first id no open
branch has written; the counter advances to `R-118`; **nothing is renumbered**.
The identical deviation above R-096 on 2026-09-03 is the precedent.

**And the counter is not working as designed, which is a finding rather than a
complaint.** Its mechanism is a merge conflict on one line, and it produces that
conflict **only when both branches merge**. Five branches have now allocated
against a counter none of them advanced on `main`, four are still open, and the
conflict has been deferred five times rather than raised once. Whether the
counter should be advanced by the ALLOCATING pull request rather than the merging
one is a change to section 8b and belongs to whoever authors next.

---

## 9. Escalations, both with a recommended default

**1. The credential lockdown is hostage to the extraction supplier.** P2-13
removes every temporary permission the overnight sessions hold, and it waits on
P2-08b, which has been blocked on `andre` since 2026-08-27. The edge is correct
and was kept: P2-08b needs the pre-rotation credentials, and removing the edge
would let a rotation destroy the credentials it needs. The consequence is that
the grant CLAUDE.md 8.7 calls temporary stays alive for exactly as long as he
does not answer. **Recommended: set a date and do the lockdown on it.** The only
thing his answer buys is one live document run; everything else P2-13 removes has
nothing to do with him. If unanswered: nothing breaks, which is the problem.

**2. `RESEND_API_KEY` and `RESEND_FROM` in the production environment.** Third
time raised, still no committed evidence they are set. **Recommended: set them,
by name only, and reply that they are set**, because both are already required
items on the lockdown checklist. The caveat is repeated because it is the part
that gets lost: **this does not flip G7.** The reminder recipient is on
`rc-inventory.local`, a domain that does not resolve, so even with both settings
in place the email is addressed to nobody. That closes at P2-13.

**Neither escalation is new work and neither blocks a card.** Both are on the
closed list, item 7 and item 10 respectively.

---

## 10. One unowned action, named so it does not go quiet

**`scripts/poc/install.sh` has not been re-run since AUT-16 changed `run.sh` and
`digest.sh`.** CLAUDE.md section 15 requires it. It is not an escalation: any
terminal on this machine can run it and the closed list is what goes to the
owner. AUT-21 is the class, not this instance. The fallback paths AUT-16 added
mean a stale deployed copy degrades to the old single-board behaviour with a log
line rather than dying, so this is a correctness gap and not an outage.

---

## 11. What the next session should read first

1. **`docs/reports/2026-09-04-executor-aut-16-merge-and-the-check-that-outlasts-the-cap.md` is unreviewed.** It is this run's own executor report and no TRIAGE output has consumed it.
2. **`APPLY-02` is the only card on either board that moves the phase 3 gate off 0**, and it is eligible with no dependency.
3. **`P2-20` is the only card that moves the phase 2 gate off 6**, and it is eligible with no dependency.
4. **Eight pull requests are open**, seven of them not this run's: #187, #184, #182, #181, #175, #172, #157, and #189. Four of them carry rulings that are not on `main`, which is why section 8 exists.

---

## 12. Learnings, per CLAUDE.md section 9

**Nothing is appended to `docs/LEARNINGS.md` by this session, and this is the
line that says so** rather than the omission being read as a session that forgot.

One ERROR/SOLUTION pair was hit while working: the board validator refused a
cross-board `depends_on` with `cards (P2-13).depends_on: "APPLY-02" is not a card
id on this board.` It is **not** written to `docs/LEARNINGS.md`, because
DOCTRINE-TRIAGE section 2 gives every finding exactly ONE home and this one has
two already: ruling R-116 and card BOARD-03, with the refusal quoted verbatim in
both plus in P2-13's own notes. A third copy in a file whose purpose is to stop
the same bug being paid for twice would be the same fact in three places, which
is the shape R-071 and AUT-16 spent a card removing.

No other defect was encountered. Every validator and check named in section 11 of
the pull request passed on the first run.

## 13. What this session did not do

It shipped no card, merged no pull request, applied no migration, wrote no
application code and no test, and edited no existing ruling. It did not merge its
own rulings pull request either: `quality` costs 18 to 25 minutes against a 30
minute TRIAGE cap, which is R-114's finding applied to the session that wrote it.
**PR #190 is open and is for the next run to merge**, on a green `quality` for
whatever its head sha is then, read with `npm run checks:state 190` and never on
an inherited result.
