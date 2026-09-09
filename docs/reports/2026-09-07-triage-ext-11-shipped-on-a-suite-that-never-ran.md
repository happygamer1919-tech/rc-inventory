# TRIAGE report - run 20260907-040001

**Role:** TRIAGE
**Run:** 20260907-040001
**Branch:** `triage/20260907-040001`, cut from `origin/main` at `5aed3a3`
**Input report:** `docs/reports/2026-09-07-executor-ext-11-supplier-series.md`
**Rubric:** `docs/DOCTRINE-TRIAGE.md`, applied section by section below.

---

## 1. Boot status report, printed before any write

```
BOARD docs/board/rc-board-phase2.json   as_of 2026-09-07T00:35:25Z
  shipped 64 | todo 13 | blocked 3 | in_flight 1 | halted 0
  launch gate: 6/9   (G4, G7, G9 fail)

BOARD docs/board/rc-board-phase3.json   as_of 2026-09-07T02:10:21Z
  shipped 40 | todo 32 | blocked 0 | in_flight 0 | halted 0
  launch gate: 0/9

NEXT ELIGIBLE CARD: EXT-11, claimed by harness at 2026-09-07T05:47:52Z.
                    First unclaimed: EXT-12.
42 cards eligible across the two boards.
```

Both counts agree with the input report exactly, including the 42.

---

## 2. The finding that decides this run

**EXT-11 is marked `shipped` on branch `card/ext-11`. `quality` concluded FAILURE
on that branch's head sha, and the end to end cases the card's acceptance names
have never executed, on any sha, in any run.**

The input report could not have known the second half. It says the green "had not
concluded when the cap arrived", which was true at minute 45. It has since
concluded, and it concluded failure. Checking a committed report against the
repository rather than against itself is the whole reason this role is stateless.

### What the repository says

    gh run list --branch card/ext-11
    34099011089  4e238298  quality  pull_request  failure    2026-09-07T08:08:34Z
    34098964833  2f6e5767  quality  pull_request  cancelled  2026-09-07T08:08:03Z
    34085557075  0211239d  quality  pull_request  failure    2026-09-07T05:06:58Z

    gh pr view 240
    headRefOid          4e238298f7180be008784a4bf9351da71f101781
    mergeStateStatus    BLOCKED
    quality             COMPLETED  FAILURE

Three runs on that branch and no fourth.

### The failing step, and the step it cost

    run 34099011089, sha 4e238298
      step 38  Refuse a board timestamp from the future   FAILURE
      step 55  End to end                                 skipped

        FAIL docs/board/rc-board-phase3.json: 1 of 122 timestamp(s) are AHEAD
             of the commit that wrote them
             card EXT-11.last_checkpoint = 2026-09-07T08:35:00Z, 27 min ahead

The card and the board `as_of` were stamped `08:35:00Z` on a commit made at
`08:07:55Z`. `quality` fails fast, so steps 39 to 55 were skipped, and step 55 is
`End to end`.

### And the RED did not run them either, which nobody had looked at

    run 34085557075, sha 0211239d
      step  9  Refuse a code pull request whose board edit is missing  FAILURE
      step 55  End to end                                             skipped

**The acceptance clause reads "THAT CASE FAILING BEFORE THE CHANGE AND THE PR
SHOWING BOTH RESULTS". It is satisfied by neither side.** The Playwright suite has
never executed on this branch. There is no red, no green, and no result. An
absence is not a red.

### What IS proven, because the card is not worthless

On run `34099011089`, against the head sha, these passed: `Typecheck` (acceptance
clause 6), `Build`, `Validate boards`, `Refuse a migration that removes rows`,
`Apply every migration to a bare postgres, unmodified` (acceptance clause 2, the
`npm run check:migrations` the report correctly said it could not run locally for
want of Docker), and both filtered applier proofs. **Two of six acceptance clauses
are machine-proven, two are structural and readable in the diff, and the two that
describe the BEHAVIOUR have nothing behind them.**

### The cited sha does not exist

    git cat-file -t 788e381
    fatal: Not a valid object name 788e381

`788e381` appears in the report and in the card's `evidence.ref`. The branch's
commits are `4e23829`, `2f6e576` and `0211239`, and the run cited as the RED is on
`0211239d`. The run id is real and resolves; the sha is not an object in this
repository.

### Why this is structural rather than one run's mistake

The plan the previous run left in the card notes was followed exactly as written,
and it could not have worked:

- `check:board-edit`, authored by RULE-06, refuses a pull request carrying a
  card's code while that card's status has not moved to a terminal value. A
  Playwright spec is code. **A tests-only push can never reach step 55.** The only
  way past step 9 with tests alone is to flip the card to `shipped` while only the
  failing tests exist, which is a board that lies.
- `quality` fails fast and `End to end` is step 55 of 56. Any one of the
  fifty-four steps in front of it turns the suite into an absence.
- The workflow cancels in-progress runs on the same ref, so two results cannot be
  live on one branch at once. Run `34098964833` is `cancelled` for that reason,
  twenty-nine seconds before the next push.

**Between those, there is no legal path to a red run in `quality`.**

### This run reproduced the timestamp defect on itself

While writing this pull request, `npm run check:board-clock` refused the phase 2
board because two card timestamps this run wrote were two minutes ahead of the
clock. Corrected before the commit. It is recorded here because it is the same
defect from the same cause, met by a different role within the hour, which is the
argument for a mechanism rather than for care.

---

## 3. Rulings written

| id | what it settles |
|---|---|
| **R-154** | EXT-11's `shipped` status is OVERTURNED. Four conditions before PR #240 merges, and the merge is the act that writes production under CLAUDE.md 8.0. |
| **R-155** | The sha in EXT-11's evidence is not an object here. Standing rule: CI evidence cites the RUN ID; a sha appears only when read back out of git. Mechanism carded as GUARD-05. |
| **R-156** | The "RED before, GREEN after, both on the pull request" clause is unsatisfiable here. A red is a run whose test step CONCLUDED and whose named case FAILED. The red-before moves to a local run quoted in the report. |
| **R-157** | P2-13 revokes a capability every unshipped card needs. DOCTRINE-TRIAGE section 3 check 3 has no answer for that. Recorded as a fourth tickable box plus a notes paragraph, not as forty-five dependency edges. |

`decisions/NEXT-RULING-ID` advanced to `R-158` in the same commit.
`npm run id:free -- R-154` was run before the ids were written, per CLAUDE.md
section 8b step 2, and reported R-154 free across `main`, eleven open pull
requests and this working tree.

### Deviations, under section 1

The input report flags none, and its section 4 says so in terms. **That reading was
correct on the two decisions it did make.** Both were inside the card's `defaults`
and inside this board's stated width: one capability probe for two columns landing
in one transaction, and the supplier reference reaching `inbound_orders` through
an update rather than through a re-signatured RPC. Test 4 clears both, and the
alternative is named on the card: replacing `confirm_extraction_draft`, which every
confirmed document passes through, to add two parameters the card did not ask for.
**Ratified.**

What the report did not flag is the `shipped` status itself, and that is section 2
work rather than section 1 work: it is a finding the report surfaced factually and
did not decide. Test 2 fires on it, and R-154 is the verdict.

---

## 4. Cards

### Authored: GUARD-05, on the phase 2 board

**A check refuses a card at `shipped` whose acceptance names a test the run on the
head sha did not EXECUTE, and refuses an evidence field citing a commit sha that
does not resolve.**

Four guards already in `quality` missed this and each answered its own question
correctly:

    check:board-edit    asks whether the card reached a TERMINAL status. It did.
    validate-board.mjs  asks whether a shipped card carries non-null evidence.
                        It does. A validator cannot read prose.
    check:board-clock   caught the 27-minute-ahead timestamp, which is why the
                        run went red at all. That is the accident that exposed
                        this, not the guard for it.
    checks:state        pairs the check result with mergeStateStatus, which is
                        the right question about the JOB and says nothing about
                        which STEPS ran.

**The generalisation: every guard here asks whether the RESULT is green. None asks
whether the work that was supposed to produce the result happened.** A skipped step
and a passing step are the same colour at the job level, and the job level is the
only level anything reads.

The acceptance is machine-checkable, on three failing fixtures and two controls.
The id came from `npm run id:free -- GUARD-03`, which reported GUARD-03 and
GUARD-04 held on `triage/20260904-220003` (#207) and said to take GUARD-05. That
is RULE-09's cross-branch check doing exactly what it was built for.

### Edited: P2-13, acceptance and notes

A fourth capability box, in the same shape as the three R-072 and R-095 already
put there: the runbook records **the count of unshipped cards across all three
boards** and confirms the owner has been told that after the checklist every one
of their pull requests returns to him. CLAUDE.md 8.7 says it in terms. Today that
count is forty-five and nobody has been told.

### Deliberately NOT edited: EXT-11

**EXT-11's card fields are not touched by this pull request, and that is a
decision, not an omission.** The card lives on `docs/board/rc-board-phase3.json`
and PR #240 rewrites the same card object: `lane`, `status`, `last_checkpoint`,
`evidence`, `notes`, plus the board's top-level `as_of`. A board edit from this
branch would put a conflict between a rulings pull request and the card pull
request it is trying to help, in a JSON file, which is what `555b725` already paid
for once.

**R-120 met this on 2026-09-04 and settled it: the ruling IS the delivery and the
card is left alone. It also recorded that DOCTRINE-TRIAGE section 5 gives no
guidance for a card whose pull request is open. Three days later the rubric still
does not say it. This is the second TRIAGE run to name it.**

For the same reason, `docs/board/rc-board-phase3.json` is not touched at all by
this pull request: any edit to it requires bumping `as_of`, which #240 also
changes, and that is a guaranteed one-line conflict for no gain.

**And `docs/LEARNINGS.md` is deliberately not appended to.** PR #240 adds 82 lines
to the end of that file, a second append at the end conflicts with it, and
`d66a28e` is the commit that put conflict residue into that exact file. The
board-clock lesson belongs there and belongs to EXECUTOR, who is already appending
to it in the pull request that has to fix the timestamp anyway.

---

## 5. Board audit, section 3, all four checks over all three boards

166 cards read across `rc-board-phase2.json`, `rc-board-phase3.json` and
`rc-board.json`.

1. **Dangling.** None. Every id in every `depends_on` resolves to a card.
2. **Satisfied but blocking.** Two, both correct as they stand. `P2-08b` has
   `P2-08a` shipped and is blocked on `andre`, who genuinely owes a live document
   run. `MIG-01` has no dependencies and is blocked on `ivan`, who owes the
   keep-or-disable decision on the auto-apply integration. Neither is cleared.
   `P2-14` is blocked on `client` with `P2-13` unshipped, so it is unreachable
   rather than merely unanswered, which is what R-072 already recorded.
3. **A capability edge missing.** Fires on P2-13. See R-157 above: the check's
   prescribed remedy produces forty-five edges on the handover card and deadlocks
   the launch, so the edge is a tickable box. GATE-03 already covers the other
   half of the same finding and is not duplicated.
4. **An edge on a split card.** Thirteen edges point at cards that have suffixed
   halves. **Every one of those parents is `shipped`**, so no card is parked
   waiting on something it never needed. The one parent that no longer exists,
   `P2-08`, is named in no `depends_on` anywhere. Nothing to re-derive.

**No `depends_on` array was changed by this run.**

---

## 6. Launch gate audit, section 4

**Nothing flipped. Every audit is written into the gate `notes`, which is where
the previous four audits under R-023, R-046, R-074 and R-080 put theirs.**

| gate | verdict | deciding clause |
|---|---|---|
| **phase 2 G4** | stays `fail`, **backlog, has a card** | R-053's clause, not the original. Two of four failure cases absent: redirect and oversize. P2-20 carries both, is `todo`, is eligible. |
| **phase 2 G7** | stays `fail`, `blocked_on ivan` retained | One real email from a real crossing. The same three items since 2026-08-27, none moved. Two are console clicks, the third lands at P2-13. |
| **phase 2 G9** | stays `fail`, **not backlog** | P2-14 recording Mihai completing a cycle himself. P2-14 is blocked on `client` AND unreachable behind P2-13. |

**One correction this audit had to make on itself, recorded because it is the
error R-080 had to fix in R-074 and it nearly happened a third time.** G4's note
opens with the original clause, "one real document has travelled the whole path on
production", and R-053 replaced that clause on 2026-08-28. Reading the top of a
long gate note instead of the bottom produces an audit that parks a gate on Andre
when Andre was deliberately degated from it. The first draft of this audit did
exactly that. It is rewritten, and the trap is now named inside the note so the
next audit does not fall in.

**Phase 3's nine conditions are NOT re-audited here, and that is deliberate.**
`GATE-02` exists precisely to re-run that audit against the premise `P3-27`
discharged, and `GATE-01` carries G1's clause 3. Section 5 says not to author or
redo what an open card already covers. Both are `todo` and eligible. Nothing in
this run's report moves any phase 3 condition: EXT-11 did not ship.

---

## 7. Escalations, section 6

Two. Both carry a recommended default. Neither blocks this run.

### ESCALATION 1

    ESCALATION:  Andre must be told the extraction contract gained a field, the
                 supplier's document series.
    WHY:         Item 6, anything that would reach Andre as a request. TRIAGE
                 never writes to a third party.
    CONTEXT:     EXT-11 rewrote docs/contracts/extraction-v2.md: order_ref and
                 order_ref_series are now stored, section 4.1a's list went from
                 sixteen fields to seventeen, and a new section 4.1b says the
                 series and the number are never concatenated. Our side accepts
                 a payload with or without it, by the card's own defaults, so
                 nothing breaks on either side and there is no deadline on him.
                 What does not happen is the field arriving.
    OPTIONS:     (a) Tell him in the same message as the live document run he
                     already owes, which is P2-08b. One sentence, no new thread.
                 (b) Wait until P2-08b is scheduled and tell him then.
                 (c) Do not tell him. The column ships and stays null for ever.
    RECOMMENDATION: (a). It costs one sentence, it rides a message that is owed
                 anyway, and (c) is the current default by accident rather than
                 by choice.
    IF UNANSWERED: the column ships, accepts null, and stays permanently null.
                 Two suppliers issuing the same invoice number keep colliding on
                 the identifier, which is the exact defect the card was authored
                 to remove. No outage, no error, no visible symptom.

### ESCALATION 2, a repeat and marked as one

    ESCALATION:  RESEND_API_KEY and RESEND_FROM are still not confirmed set in
                 the production environment.
    WHY:         Item 7, panel actions. No terminal holds a hosting console.
    CONTEXT:     Recorded as missing since 2026-08-26, escalated on 2026-08-31 by
                 run 20260831-040003 under R-080, unanswered for seven days. This
                 is the fifth identical G7 audit. CLAUDE.md 15 says an unanswered
                 question is the one thing that must never go quiet, so it is
                 carried again rather than left in a gate note.
    OPTIONS:     (a) Set both now and reply that they are set.
                 (b) Leave both for P2-13's rotation day, where they are already
                     checklist items.
    RECOMMENDATION: (a). They cost nothing, they are on the critical path either
                 way, and doing them now removes two items from rotation day.
    IF UNANSWERED: nothing breaks. The reminder keeps writing its reason onto the
                 row and showing Netrimis on /memento, which is the designed
                 degradation. G7 stays fail either way, because the third item,
                 a recipient not on a domain that does not exist, lands at P2-13.

**Not escalated, and each for a stated reason.** Merging PR #240 applies migration
`0036` to production: additive, `check:no-destructive-migration` passed on it, so
it is not item 8 and not a decision for the owner. Correcting EXT-11's evidence,
its acceptance clause and its board clock are terminal actions under R-050 and
R-059. Recording P2-13's capability cost extends no grant, so it is not item 5.

---

## 8. What the next run should do first

1. **Do not merge PR #240 in its current state.** `quality` is red on
   `4e23829`. R-154's four conditions are the list.
2. **The board clock is the one-line fix**, and it is what makes the run red.
   Correct `as_of` and `EXT-11.last_checkpoint` to the commit moment.
3. **Then read the End to end step, not the job.** The three named cases must show
   as having RUN. A green job with step 55 skipped does not ship this card.
4. **Correct the evidence** for the sha that does not resolve and for a red-before
   that was never a red, per R-155 and R-156.
5. `EXT-12` is the next unclaimed eligible card. `GUARD-05` is eligible from now.
6. The stranded pull requests named by the input report are covered by RST-02
   through RST-05 and are not re-carded here.

---

## 9. Rubric defects found in `docs/DOCTRINE-TRIAGE.md`

Saying so is a legitimate TRIAGE output by that file's own words, and both of
these cost this run real work to route around.

1. **Section 5 gives no guidance for a finding about a card whose pull request is
   open.** R-120 named this on 2026-09-04 and it is unchanged. The answer both
   runs reached is that the ruling is the delivery and the card is left alone, and
   it should be written down rather than re-derived by every TRIAGE run that meets
   an in-flight card.
2. **Section 3 check 3 has no clause for a capability that every card needs.** It
   was written for a bounded dependent set. Applied literally to P2-13 it produces
   forty-five edges and deadlocks the launch; applied not at all it loses the
   finding. R-157 picks a third path and records that the text does not offer one.

Neither is fixed here: amending that file is not in this role's grant.

---

## 10. Files this pull request changes

| path | what |
|---|---|
| `decisions/inbox.md` | R-154, R-155, R-156, R-157 |
| `decisions/NEXT-RULING-ID` | advanced to R-158, same commit |
| `docs/board/rc-board-phase2.json` | GUARD-05 authored; P2-13 acceptance and notes; G4, G7 and G9 audits; `as_of` |
| `docs/poc/triage-latest.json` | this run's outcome for the digest |
| `docs/reports/2026-09-07-triage-ext-11-shipped-on-a-suite-that-never-ran.md` | this report |

No application code, no test, no migration, no gate flipped, no card shipped, no
pull request merged but this one, no existing ruling edited. No secret value was
read, printed, logged or committed; `/Users/ivan/rc-secrets` was not opened and no
database connection was attempted.

`node docs/board/validate-board.mjs docs/board/rc-board-phase2.json` exits 0, and
`check:conflict-residue`, `check:unique-ids`, `check:card-ids`, `check:categories`
and `check:board-clock` all pass locally, before the commit.
