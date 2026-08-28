# TRIAGE report, run 20260827-220052

**Role:** TRIAGE
**Run id:** 20260827-220052
**Invoked:** 2026-08-28T10:42:33Z, cap 900s
**Report written:** 2026-08-28T11:05Z
**Worktree:** /Users/ivan/rc-inventory-poc-run, branch `triage/20260827-220052` cut from `origin/main` at `4569b53`
**Input:** `docs/reports/2026-08-28-executor-critic-acceptance-pass.md`, the newest file in `docs/reports/`

This is the first TRIAGE pass on this project. It is also AUT-3's acceptance
event, which is why section 6 below is written the way it is.

---

## 1. Boot report, as printed

```
BOARD: docs/board/rc-board-phase2.json   as_of 2026-08-27T18:40:00Z

CARDS BY STATUS (32 total)
  shipped     26
  in_flight    1   AUT-3
  blocked      3   P2-08b (andre), P2-15 (ivan), P2-19 (ivan)
  todo         2   P2-13 (deps blocked), P2-14 (blocked_on client)
  halted       0

LAUNCH GATE: 6/9 passed
  G1 pass  G2 pass  G3 pass  G4 fail  G5 pass
  G6 pass  G7 fail (ivan)  G8 pass  G9 fail

NEXT ELIGIBLE CARD: no eligible card
```

Nothing was written before that report was printed.

---

## 2. Deviations, ratified individually with the test that cleared each

The report carries no section headed "deviations flagged for ratification". It
carries two acts that are deviations in substance. DOCTRINE-TRIAGE section 1
binds on the act and not on the heading, so both got a verdict.

| # | Deviation | Verdict | Deciding test |
|---|---|---|---|
| 1 | This run merged PR #78, which belongs to a different run | **RATIFIED** | Test 4. Without it the 2026-08-27 CRITIC report was permanently invisible to the only role written to read it. A branch behind `main` cannot merge itself here, and nothing in the chain rescues another run's stranded PR. |
| 2 | The run ran roughly eight hours against a declared 2700s cap and held `run.lock` across two scheduled slots | **RATIFIED** | Test 3 first: `CLAUDE.md` 13 assigns the cap to the harness and explicitly not to "the session's own sense of time", so the session applied the rule rather than widening it. Then test 4: a session that self-terminated on a guess would have committed no report, and the defect would have gone undiscovered for a fourth night. |

**Both were re-verified rather than accepted.** For deviation 1, the GitHub
check-runs API for head sha `3f8b4a0` returns `quality` with conclusion
`success`, which is the claim `CLAUDE.md` section 3 actually turns on. For
deviation 2, `run.lock` still existed at `2026-08-28T10:45:33Z` carrying
`started_at=2026-08-28T02:00:52Z`, which is 8h44m.

Recorded as **R-039**.

---

## 3. Findings, each disposed of exactly once

| Finding | Disposition | Where it went |
|---|---|---|
| 1, the executor process carries every credential | **Ruling + card** | R-040, card AUT-8 |
| 2, code on `main` under card ids that exist on no board | **Ruling + two cards** | R-041, cards AUT-10 and AUT-11 |
| 3, the 45 minute cap did not fire | **Ruling + card** | R-042, card AUT-9 |
| 4, no scheduled run can run a named spec | **Escalation** | E3, and a correction recorded in R-040 |
| 5, the state branch is cut from an unrefreshed `origin/main` | **Ruling, withdrawn** | R-043, no card |

Nothing was left as a finding.

### The two dispositions worth reading in full

**Finding 4 is corrected, and the correction changes what AUT-8 may claim.**
The report says the end-to-end guard "resolves with" finding 1. It does not.
`scripts/assert-not-prod.mjs` exits 2 when a checked URL names a production
project and exits **4 when neither URL is set**, with its own comment giving the
reason: an empty environment does not mean "not production", it means it cannot
be known, so it stops. Stripping the production URL moves the guard from exit 2
to exit 4. It never reaches exit 0. The suite needs a local Supabase stack, which
needs Docker, and `which docker` returns nothing on this machine. A card authored
on finding 4 as written would have shipped green and left the ceiling exactly
where it is, with a board entry saying it was fixed.

**Finding 5 is withdrawn, and this is the most useful thing in this pass.**
`scripts/poc/run.sh` step 5 runs `git fetch origin main --quiet` eleven lines
above `git checkout -b "$STATE_BRANCH" origin/main`. The fetch was already there
at `3420435`, the commit the 2026-08-27 pass was reading when it wrote "without
a fetch immediately before it". The finding was wrong on the day it was written
and was carried forward once without re-checking. **The rule R-043 makes: a
finding carried forward is re-verified against the current file before it is
carried again, and the report says which lines were read.** Authoring a card
against a premise that does not hold is how phantom work enters a board, and on
a board this dry it would have been picked up as the lowest-id eligible card and
spent a whole run fixing nothing.

---

## 4. Rulings written

| Id | What it settles |
|---|---|
| R-039 | The two deviations above, ratified individually with their tests |
| R-040 | The scheduled EXECUTOR's environment is narrowed. Narrowing a credential grant is TRIAGE's under DOCTRINE-TRIAGE 6.5. Carries the finding 4 correction |
| R-041 | Harness work that ships code to `main` is a card on this board. Run STATE stays off it. Does not overturn R-038 and says why |
| R-042 | The cap measures wall clock against a deadline, and a lock whose owner is gone is not honoured forever |
| R-043 | Finding 5 withdrawn as stale against the file it describes. No card |
| R-044 | `P2-13.depends_on` gains P2-19, on the capability test |
| R-045 | AUT-3's acceptance event occurred. TRIAGE records the evidence and does not ship the card |
| R-046 | The 2026-08-28 gate audit. 6 of 9 stands, nothing flips, and the three open gates are not backlog |

---

## 5. Cards authored

Four, all with machine-checkable acceptance, `defaults` written to answer the
ambiguities each will hit, and `notes` naming the report and the finding by path.

| Id | Title, short | Priority | depends_on |
|---|---|---|---|
| **AUT-8** | The scheduled EXECUTOR runs without the credentials it does not need | high | none |
| **AUT-9** | The run cap measures wall clock, and a stale lock is not honoured forever | high | none |
| **AUT-10** | AUT-5 and AUT-6 written onto the board with `plain`, `acceptance` and `evidence` | medium | none |
| **AUT-11** | The quality job refuses a commit whose card id resolves to no card | medium | `AUT-10` |

**The id order is the priority order, and that is deliberate.** `CLAUDE.md`
section 2 makes the run take the lowest-id eligible card, so the two the report
named as the highest-value unblocked work in the repository are the two that
sort first.

**AUT-11 depends on AUT-10 and the edge is load-bearing.** The check fails on
`main` today, because AUT-5 and AUT-6 resolve to nothing. Landing it first would
put a red check on `main` that every later PR inherits.

**AUT-8's empty `depends_on` is empty on evidence, not by omission.** It removes
a capability, so section 3 check 3 was applied: no card on this board has an
acceptance that requires an unattended migration apply, and P2-19's own question
records that every database connection from a session in this repo is refused by
the sandbox before the command executes. The test returns no edges, and the card
says so.

**No card was authored for finding 5** (R-043) or for finding 4 (escalated).

---

## 6. AUT-3: the acceptance event, and why this pass does not ship it

AUT-3's acceptance is "the next scheduled harness run produces a rulings PR
authored by TRIAGE with no human input". That is this run, and the timestamps
are outside the session: the harness logged "invoking TRIAGE on
docs/reports/2026-08-28-executor-critic-acceptance-pass.md, cap 900s" at
`2026-08-28T10:42:33Z`, and this PR is the output.

**The card is not flipped to `shipped`.** DOCTRINE-TRIAGE says TRIAGE may not
ship a card, because shipping needs an acceptance run and TRIAGE runs nothing.
This card's acceptance IS TRIAGE's own output, so shipping it would be the role
certifying its own existence, which is the one failure the boundary was drawn to
prevent.

**What was done instead:** the evidence is written into the card `notes` with
the run id, the log paths and the report path, and `status` moved `in_flight` to
`todo`, so the next EXECUTOR run picks it up as the lowest-id eligible card,
verifies the run log, and ships it. `in_flight` was correct while the card waited
on an event nobody could schedule; that reason expired the moment the event
produced committed artefacts a different session can read.

---

## 7. Resequencing: all four checks, over the whole board

1. **Dangling edges:** none. Every `depends_on` id resolves, and the validator
   fails on one that does not.
2. **Satisfied but blocking:** P2-15, P2-19 and P2-08b each have all
   dependencies shipped and each is blocked on a person who genuinely owes an
   action now. Correct as they stand. None cleared.
3. **A capability edge missing:** one found. **`P2-13.depends_on` gains
   `P2-19`** (R-044). P2-13 permanently removes any terminal's ability to open a
   database connection; P2-19's own defaults say it stops being an owner action
   the moment such a connection exists. Ordering costs nothing, because P2-13 is
   already waiting on two other cards.
4. **Edges on a split card:** P2-08's split into P2-08a and P2-08b was
   re-derived across every dependent. The card edges are correct. **The stale
   one is in a gate**: G4's first clause still names P2-08, and it is re-derived
   in G4's notes under R-046.

---

## 8. Gate audit

**6 of 9. Nothing flipped.** G4, G7 and G9 were each re-audited against their
deciding clause and the audit written into each gate's `notes`, per
DOCTRINE-TRIAGE section 4.

- **G4** stays `fail`. First clause re-derived against the split: P2-08a
  shipped, P2-09 shipped, P2-08b not shipped and blocked on andre. Deciding
  clause untouched: no real document has travelled the whole path on production.
- **G7** stays `fail`, `blocked_on: ivan` retained. Three items in front of the
  live send and none moved. No database read was performed for this audit and
  none is claimed.
- **G9** stays `fail`. P2-14 is `todo` and blocked on the client.

**All three are the kinds no terminal can ever flip**: a third party, a console
no terminal holds, and the client himself. **They are not backlog.** A reader
who counts three of nine as remaining engineering work will go hunting for cards
that do not exist, and that sentence is the point of recording an audit that
flipped nothing.

---

## 9. Escalations

Four. Each carries a recommended default, and each names which of the nine put
it here.

### E1

```
ESCALATION: run scripts/reset-test-data.sql on production, once, now.
WHY IT IS ESCALATED: item 8, production DELETE-class execution. CLAUDE.md 8.6
  forbids any terminal executing it; DOCTRINE-TRIAGE 6.8 forbids TRIAGE deciding
  it should happen.
CONTEXT: the client's live system still holds the end-to-end suite's residue.
  Both preconditions R-033 imposed are now met: migration 0011 is applied, and
  the selector was corrected on 2026-08-27 to cover the EXT- products the
  extraction lane creates and the drafts that were never in scope at all. The
  file is machine-checked on every push by npm run check:reset-sql: 26
  statements, 11 deletes, every one guarded by a WHERE clause and inside the
  expected target set, one BEGIN first and one COMMIT last, and every check was
  proved to fail on a mutated copy before it was trusted.
OPTIONS: (a) run it once now, in the SQL editor, reading the pre-check before
  committing; (b) wait until closer to the client demo, which shortens the
  window in which a mistake can be noticed; (c) leave the residue, which was
  closed as option (c) by R-009 and must not be reopened.
RECOMMENDATION: (a). It is the single owner action that unblocks the most work,
  P2-13 sits directly behind it, and the risk only grows: once real client data
  exists the cleanup can never be run at all, and the residue becomes permanent.
IF UNANSWERED: P2-15 stays blocked, P2-13 stays blocked behind it, and the
  client's first login shows him test products he never created.
```

### E2

```
ESCALATION: run scripts/ledger-rows-0010-0012.sql, and decide whether to let a
  terminal connect to the database directly.
WHY IT IS ESCALATED: item 7, an action in a console no terminal holds; and the
  second half is item 5, widening access to an environment.
CONTEXT: the database's own record of which migrations are installed stops at
  0009 while the schema is at 0012. Nothing in the application reads it, so
  nothing is broken today. What breaks is the next tool that reads it to decide
  what is pending, and P2-13's handover inherits the wrong record. The file is
  generated from the three migrations, never hand-edited, checked on every push
  by npm run check:ledger-rows, and parsed to 8 statements with nothing that
  removes a row.
OPTIONS: (a) run the file in the SQL editor, about two minutes, and paste back
  the two grids; (b) add a permission rule letting the unattended runs open the
  derived pooler connection, after which this and every future ledger repair
  happens unattended; (c) leave it.
RECOMMENDATION: (a) alone, and decline (b) for now. The card itself recommends
  (b) then (a), and TRIAGE differs on evidence the card did not have: finding 1
  of this run's report proves every scheduled run currently holds every
  credential in the secrets file whether or not it needs them. Granting the
  database connection on top of that would let an unattended session reach the
  client's production database at any hour with no card telling it to. AUT-8
  closes that hole; (b) is worth revisiting after it lands, and is worth little
  regardless, since P2-13 revokes the grant a few cards later.
IF UNANSWERED: P2-19 stays blocked on Ivan, P2-13 now waits on it by R-044, and
  the handover ships with a record that lies about what is installed.
```

### E3

```
ESCALATION: install Docker on the build machine so unattended runs can start a
  local database and run the automated screen tests.
WHY IT IS ESCALATED: item 1, money (Docker Desktop is not free for business use
  above its threshold), and item 4, adding a third-party dependency. The global
  rule "no new third-party dependency or vendor without asking first" applies
  independently of both.
CONTEXT: this is finding 4 of the report, with its stated cause corrected. The
  guard that refuses to run the suite against production is correct and must not
  be weakened; it is what CRIT-11 exists for. But it also refuses an EMPTY
  environment on purpose, so removing the production URL does not make the suite
  runnable, it just changes which refusal you get. The suite needs a real local
  Supabase stack. supabase is installed on this machine; docker is not, and the
  stack cannot start without it. Until then, an unattended run can ship
  documentation, board edits and CI checks, and nothing whose acceptance is a
  named spec.
OPTIONS: (a) install Docker Desktop, after checking the licence covers this use,
  and have the run start and stop the stack around the suite; (b) accept the
  ceiling and state it openly on the board, so cards whose acceptance is a spec
  are marked as needing a human terminal; (c) run the suite only in CI, which is
  already true and is why the cards passed in the first place, and stop expecting
  unattended runs to re-verify them.
RECOMMENDATION: (a), conditional on the licence. It is the only option that lets
  an unattended session finish a feature rather than only plan one, and the
  ceiling otherwise silently caps everything the four-runs-a-day schedule can
  deliver. If the licence answer is no, take (b) and say so on the board rather
  than letting each card discover it.
IF UNANSWERED: the schedule keeps running four times a day and keeps producing
  documentation and review, which is what the last three nights produced.
```

### E4

```
ESCALATION: get Andre to run one real document through the extraction, with a
  date attached.
WHY IT IS ESCALATED: item 6, anything touching Mihai or Andre. TRIAGE never
  writes to a third party.
CONTEXT: our whole side of the extraction is built, merged and tested against
  the frozen contract v2: P2-08a and P2-09 are shipped, the review and confirm
  flow works, the failure surface shows a reason and offers a re-fire. What is
  missing is one real supplier document making the round trip on production.
  Three of the nine launch conditions cannot move until it happens: the
  extraction condition directly, the client's own sign-off downstream of it, and
  the credential handover, which R-037 put behind the live round trip so that a
  finding from it can still be fixed.
OPTIONS: (a) chase him with a specific date; (b) declare the mocked round trip
  sufficient and ship without a live one, which means the first real document is
  the client's; (c) replace the extraction vendor, which is a vendor decision of
  its own and weeks of work.
RECOMMENDATION: (a). (b) is the tempting one and it is wrong: the one thing a
  mock cannot prove is the thing this gate exists to check, and the alternative
  is discovering it in front of Mihai.
IF UNANSWERED: P2-08b stays blocked, P2-13 stays blocked behind it, G4, G9 and
  the phase 2 acceptance stay frozen for as long as it takes.
```

---

## 10. One defect in the handoff shape, reported rather than worked around

`docs/poc/triage-latest.json` was specified with exactly six keys and no key for
**cards authored**. Authoring four cards is the largest thing this pass did and
the digest reads that file, so leaving it out would have hidden it from the only
channel that reaches the owner. The four are recorded under
`cards_resequenced`, each `change` beginning with "authored by TRIAGE", which
stretches the key name and is said here rather than left to look like
carelessness. **The fix is a `cards_authored` key**, and it is AUT-4's file to
change.

Per DOCTRINE-TRIAGE's own instruction, this is the second half of that report:
nothing else was missing. The rubric was sufficient. TRIAGE needed no dispatch
text, no summary and no context beyond the newest report, `CLAUDE.md`, the
board, and the repository the claims are about.

---

## 11. What the next run should pick up first

1. **The board is no longer dry.** `AUT-3` is the lowest-id eligible card:
   verify this run's log and ship it. Then AUT-8 and AUT-9, in that order, and
   both are POC-BUILDER files worked in the run worktree, not in the installed
   copy the run is executing from.
2. **AUT-9 is the one that pays for itself.** While a single run can hold the
   lock for eight hours, three of the four nightly slots do not exist.
3. **Do not re-open R-043.** If a later pass sees "the state branch is cut from
   a stale base" in an old report, the fetch is at `scripts/poc/run.sh` step 5,
   eleven lines above the checkout, and has been since `3420435`.
4. **Four escalations are waiting on Ivan**, each with a recommendation he can
   answer with one word. E1 and E2 are two minutes of his time each and unblock
   the most.

---

## 12. Owner-facing summary, plain

Last night's session found nothing on the build list it could work, because
everything left is waiting on a person, so it spent its time re-checking
finished work and reporting what it found. This session read that report and
turned it into decisions.

Three real problems were confirmed and are now on the work list: the overnight
sessions carry the system passwords when they have no reason to, last night's
session ran for nine hours instead of forty-five minutes and silently cancelled
the two sessions behind it, and two pieces of delivered work were never written
on the list, so the list undercounts what exists. A fourth reported problem
turned out not to be real, and was withdrawn with the evidence, which saved a
whole session from being spent fixing something that was not broken.

Nothing here touches what Mihai sees, and no launch condition moved. Four things
now wait on Ivan, each with a recommended answer: clean the leftover test data
out of the live system, correct the database's record of its own updates, decide
whether to install Docker so the overnight sessions can finish features instead
of only planning them, and put a date on Andre for the one real document that
three of the nine launch conditions are frozen behind.

---

## EXECUTOR LANDING NOTE, 2026-08-28

Appended by the EXECUTOR pass that landed this PR. The report above is TRIAGE's
own text and is unchanged.

**One board effect proposed by this report was not applied.** R-045's flip of
`AUT-3` from `in_flight` to `todo` was withheld on the owner's instruction, and
`AUT-3` is on `main` exactly as it stood before this PR: `status: in_flight`,
`evidence: null`. Section 6 of this report and item 1 of section 11 describe a
board state that does not exist. R-045 itself is landed unedited in
`decisions/inbox.md`; only its effect on the card is withheld.

The full account is in `docs/reports/2026-08-28-executor-land-triage-83.md`.
