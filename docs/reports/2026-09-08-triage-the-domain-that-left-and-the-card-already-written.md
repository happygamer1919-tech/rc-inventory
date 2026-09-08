# TRIAGE 20260908-070003: the domain that left, and the card that was already written

**Role:** TRIAGE
**Run:** 20260908-070003, unattended, CLAUDE.md section 13
**Date:** 2026-09-08
**Input report:** `docs/reports/2026-09-08-executor-gate-02-phase3-gate-audit.md`
**Branch:** `triage/20260908-070003`
**Rubric:** `docs/DOCTRINE-TRIAGE.md`, applied in full

---

## Boot status

| board | shipped | todo | in_flight | blocked | halted | launch gate |
|---|---|---|---|---|---|---|
| `docs/board/rc-board-phase2.json` | 65 | 16 | 1 | 3 | 0 | **6 of 9** |
| `docs/board/rc-board-phase3.json` | 49 | 24 | 0 | 0 | 0 | **0 of 9** |

Next eligible card at boot: **P3-14**, "Retur de materiale: surplus coming back
from a site to stock, as the inverse of an issue, with the project credited."

**A CORRECTION TO THIS SESSION'S OWN FIRST NUMBER, MADE HERE BECAUSE THE PRINTED
ONE WAS WRONG.** The boot report printed to the terminal said the phase 2 gate
was 0 of 9. It is 6 of 9. The count was taken by reading a field named `status`
on the gate conditions, and the field is named `state`; every condition returned
`undefined`, so nothing matched `pass`. The phase 3 count of 0 of 9 was right by
accident on the same defect. **Both numbers in the table above are re-counted
from `state` and agree with each `launch_gate.readiness_passed`.**

---

## 1. Deviations flagged for ratification

**The report flags none, and it says so explicitly:**

> "Nothing in this run required a ruling, and nothing was escalated. The domain
> finding in F4 is reported and the run continued, per CLAUDE.md section 4b: a
> finding is not a block."

**Checked rather than accepted.** The card's acceptance requires an artefact
re-running all nine conditions with MET, NOT MET or NOT ATTEMPTED for each, the
evidence field of every condition rewritten with a new `at`, and
`readiness_passed` set to a counted number. All three are done and all nine
evidence fields carry `at=2026-09-08T11:08:11Z`. The card's defaults forbid
flipping a condition to move the count and forbid building inside the audit, and
neither happened: it recommended four cards and authored none.

**Nothing to ratify and nothing to overturn.** Section 1 records the empty set
rather than skipping the section, because "no deviations" and "the section was
not run" look identical afterwards.

---

## 2. Findings converted

Nine rulings, **R-175 through R-183**. Every finding got exactly one of a
ruling, a card, an escalation or a learning; none was left as a finding.

| # | finding | outcome |
|---|---|---|
| R-175 | three of the report's four recommended cards are already P3-35's acceptance | ruling, no card authored |
| R-176 | the client domain no longer serves this application, and phase 2 G8 says it does | ruling, gate evidence, **escalation** |
| R-177 | the rubric has no procedure for a falsified `pass` | ruling, **escalation** |
| R-178 | the deployed-commit guard's default origin is a host that can never satisfy it | ruling, **card GUARD-07** |
| R-179 | `#PENDING` is not an evidence ref, and thirteen shipped cards carry it | ruling, **card GUARD-08** |
| R-180 | MIG-01 is blocked on an answer Ivan gave four days ago | ruling, card unblocked |
| R-181 | AUT-3 waited twelve days for an event that has happened eight times | ruling, card released |
| R-182 | the section 4 gate audit of both boards | ruling, six evidence fields written |
| R-183 | eight TRIAGE pull requests are open and the fix is 25th in the pick order | ruling, added to RST-02 |

### The one that matters most, and it is not from the report

**R-183. Eight TRIAGE rulings pull requests are open and unmerged**, the oldest
four days old: 207, 210, 238, 242, 245, 248, 262 and 265. **This run's pull
request is the ninth.**

`decisions/NEXT-RULING-ID` on `main` reads `R-144`. The real high water mark
across open branches is `R-175`. **Thirty one ruling ids are allocated and
invisible to `main`.**

The mechanism is not a lapse by any session. `run.sh` polls GitHub for the TRIAGE
branch, writes a checkpoint the moment the pull request exists, waits for the
session, logs the exit, and ends. **Nothing merges it and nothing waits for its
`quality` check.** CLAUDE.md 3.1 permits TRIAGE to self-merge on green, and
`quality` takes minutes a TRIAGE session does not have inside its 1800 second
cap. Both halves behave correctly and the result is a queue.

**The cost is visible in this run's own input.** PR #238 is titled "the dead
premise on nine conditions". The GATE-02 report re-derived that same premise from
scratch today, correctly and at length, because #238 never reached `main` and a
stateless role can only read what merged. Work is being done twice and nobody can
see that it is.

**RST-02 is the fix and it is already authored, `todo`, and eligible.** It needs
no authoring. It needs claiming. **And the harness will not reach it**:
`eligible.mjs` orders the union by board then by id, deliberately and with the
reason written beside it under AUT-16, the phase 3 board comes first, and
twenty-four phase 3 cards are eligible. RST-02 is twenty-fifth in the pick order.
TRIAGE may not edit `priority` and does not propose changing the order, which is
a documented rule and a widening. **A human terminal claiming RST-02 by id is the
remedy, and this paragraph is the only place it is said.**

Not escalated: DOCTRINE-TRIAGE section 6 is closed at ten items and this is on
none of them. It is significant and it is still not an escalation.

### The one the report was written to produce

**R-175. Three of the four cards the audit recommends are already P3-35.**

| report recommendation | P3-35 acceptance section | condition |
|---|---|---|
| anon READ probe returning zero rows | (1) RLS REFUSAL | G1 clause 2 |
| `unassigned_outbound_count()` read and pasted | (2) UNASSIGNED COUNT | G2 clause 3 |
| authenticated production walk | (3) CROSS-LINK WALK, (4) DEPLOYED SCREENS | G4 clause 1, G3 clause 4 |

None was authored. Section 5 forbids it, and there is a second reason specific to
this card: **P2-13's acceptance names P3-35 by id**, under R-095, as a box that
must be ticked before any credential is rotated. Three new cards needing the same
production connection would be three capabilities the revocation checklist does
not name.

**The gap the report found and P3-35 does not answer is real and is recorded, not
authored away.** Sections (3) and (4) need an authenticated production session
that no ruling grants and no committed instrument holds, while P3-35's defaults
forbid creating a test user. Granting a terminal access to a production account
is item 5 of the closed list. **The instruction on the card: run sections (1) and
(2), which need only the read-only connection 8.3 and 8.4 already govern, then
block on `ivan` for (3) and (4) with the structured decision-needed text.** Half
of four conditions evidenced beats none.

---

## 3. Stale `depends_on`, all four checks, over all three boards

171 cards read, 173 after the two authored here.

1. **Dangling:** none. Every id in every `depends_on` resolves to a card.
2. **Satisfied but blocking:** two found, one corrected.
   - **MIG-01**, blocked on `ivan` with no dependencies. **Corrected, R-180.**
     The vendor question it asked was answered by R-124 on 2026-09-04, which
     chose the option the card itself recommended and wrote CLAUDE.md section
     8.0 to describe it. `blocked_on` cleared, `status` to `todo`, `question`
     cleared, the resolution written into `notes`. **The general shape is worth
     naming: a question can be answered in the place that binds every terminal
     while the card that asked it sits blocked on a person who has moved on, and
     nothing walks the board looking for that.**
   - **P2-08b**, blocked on `andre` with `P2-08a` shipped. **Correct as it
     stands.** Andre genuinely owes the round trip.
3. **A capability edge missing:** none new. P2-13 removes the production database
   connection and the self-merge grant, and its acceptance carries a tickable box
   per grant, naming R-001, R-007, R-047, R-049, R-056, R-059 and R-082 by id and
   P3-35 by id, with `npm run check:grant-revocation` maintaining the
   enumeration. **This is the check that would have cost something if TRIAGE had
   authored three production-access cards today, and it is the second reason
   R-175 authored none.**
4. **An edge on a split card:** none outstanding. Phase 2 G4's clause naming the
   pre-split `P2-08` was already re-derived under R-046 and its evidence now
   records the split explicitly.

**One card was not stale in `depends_on` and was stale in `status`: AUT-3**,
`in_flight` since 2026-08-27 with its acceptance met eight times over. Released
to `todo` under R-181.

---

## 4. Launch gate audit, both boards

**Nothing flipped, in either direction. Phase 2 stays 6 of 9, phase 3 stays 0 of
9.** Evidence written on six conditions that had none or had stale text.

### Phase 3

GATE-02 re-audited all nine today, clause by clause, against facts taken today.
TRIAGE verified two of its five facts independently rather than inheriting them:
production health at 2026-09-08T11:40:57Z returning `ledger_version` 0036 read
from the database, and the domain. **What TRIAGE adds is what an audit cannot see
from inside itself: which open card carries each missing clause.** G1, G2, G3 and
G4 now name P3-35 in their evidence. G5 and G7 now name the un-flippable class
they belong to.

### Phase 2

- **G8 is the condition this audit would have moved and could not.** See below.
- **G7's second precondition is discharged.** Migration 0006 is applied,
  journalled, and confirmed by production reporting ledger 0036. What remains is
  `RESEND_API_KEY` in the production environment, a console action, plus one real
  threshold crossing. Its evidence field was `null` and now says which half is
  left.
- **G4 and G9 had `null` evidence and now carry their audits.**

### The five that no terminal can flip, recorded so nobody chases them

| condition | kind | what it needs |
|---|---|---|
| phase 2 G4 | third party | Andre: one real document through the live path |
| phase 2 G7 | production console | `RESEND_API_KEY`, then a real crossing |
| phase 2 G9 | the client, on production | Mihai completing one cycle himself |
| phase 3 G5 clause 2 | the client | one real project to reconcile by hand |
| phase 3 G7 clause 1 | the client | a deviz against a real project |

**The build half of three of those is finished**, which is the useful part: phase
3 G7's whole P3-13 chain shipped and `0025_deviz.sql` is applied; phase 3 G5's
0023 and 0024 are applied and P3-11 is deployed; phase 2 G4 has a reachable half
in P2-20, which is eligible today and needs no third party. **What is missing in
every case is a person or a row, not a card.**

### G8: a passing condition that stopped being true

Re-measured by TRIAGE at 2026-09-08T11:40:57Z, read-only, no credential:

```
GET https://rapidconstructmd.com/                    200, server: GitHub.com
GET https://www.rapidconstructmd.com/api/health      301, ending 404
GET https://rc-inventory-iota.vercel.app/api/health  200
  {"commit":"edff96b...","ledger_version":"0036"}
```

`edff96b` is `main`'s head. **The application is live and healthy. The domain is
serving somebody else's product.** This is the third independent sighting:
EXECUTOR measured it on 2026-09-07 and wrote it into G8's own notes with the DNS
records; GATE-02 found it again today without looking for it.

Of G8's four recorded clauses, **two are now false**: "the production URL answers
200 over HTTPS" and "auth redirects land on that same host". A gate is not a
percentage.

**THE STATE FIELD IS LEFT AT `pass`, AND THAT IS A LIMIT OF THE ROLE RATHER THAN
A VIEW ABOUT THE EVIDENCE.** DOCTRINE-TRIAGE's grant reads "flip a launch gate to
`pass`, under section 4 below and never otherwise", and section 4 is written
entirely for a gate at `fail`. **There is no procedure anywhere in that file for
a condition whose `pass` evidence has been falsified**, and section 1's third test
sends a widening to the owner rather than to a terminal's judgement. The file's
own overriding rule decides the tie: two TRIAGE runs over the same report must
reach the same answer, and a run that reads the grant as obviously symmetric and
a run that reads it literally produce different boards.

**So the phase 2 count of 6 of 9 is overstated by one, and the board says so in
the only place TRIAGE may write it.** `readiness_passed` is deliberately not
adjusted: it is counted from the `state` fields, and a count disagreeing with what
it counts is worse than one that is wrong.

---

## 5. Cards authored

Two, both on the phase 2 board, both `todo`, both with no dependencies and
eligible immediately.

**GUARD-07** - the deployed-commit guard defaults to a host that now serves
somebody else's website. Its acceptance requires the default repointed at the
host that answers AND, the larger half, that the guard **assert the response
shape** and refuse with the origin named when it is aimed at something that is
not this application. Every negative case must be proved to fail against the
current tree first. The guard fails closed today, so nothing is unsafe now; what
is unsafe is the next operator meeting a refusal they know is spurious and
passing `--origin` to get past it, because that is the moment the guard stops
being a guard. `scripts/ext/serve-sample-documents.mjs` carries the same stale
default and is named as deliberately out of scope, because P3-29c owns that path.

**GUARD-08** - thirteen shipped cards record their evidence as the literal string
`#PENDING`. The report found one, on P3-12; a sweep of all three boards found
thirteen. Every number is recoverable: `git log --oneline main --grep=P3-12`
resolves to `cbfc1b2 ... (#166)` in one command. The acceptance lands a check
wired into `quality` and proved to fail on the current tree first, then the
sweep, because a sweep alone fixes thirteen and the fourteenth arrives on the
next card that ships.

**No card was authored for the report's recommendations 1, 2 and 3**, per section
5 and R-175.

---

## 6. Escalations

Both carry a recommended default. Both are on the closed ten-item list.

```
ESCALATION: which host is meant to serve the inventory application
WHY IT IS ESCALATED: item 7, a DNS panel action in a console no terminal holds,
  and item 6, because it is the client's own domain and what Mihai would be
  asked to open.
CONTEXT: www.rapidconstructmd.com and the apex have answered from GitHub Pages
  with a construction marketing site since 2026-09-07. The inventory application
  answers only at rc-inventory-iota.vercel.app. Phase 2 condition G8, "client
  domain connected on Vercel production with HTTPS", is recorded as passed on
  evidence taken 2026-08-27 that is now false. G9, Mihai's acceptance cycle,
  happens on production and needs a host that serves the product.
OPTIONS:
  (a) Point a host at the Vercel project, apex or a subdomain, and re-verify G8.
      Cost: one DNS change. Restores the condition and unblocks the path to G9.
  (b) Declare the vercel.app origin canonical and rewrite G8 to name it.
      Cost: R-004 permits only one public URL and that host answers anonymously,
      so this needs its own decision about deployment protection.
  (c) Leave it. The client cannot be asked to use the system at an address that
      serves someone else's website.
RECOMMENDATION: (a). It is one record, it restores a condition that was already
  met once, and it is the only option that does not require re-deciding the
  public-URL posture at the same time.
IF UNANSWERED: nothing breaks and nothing moves. The application stays reachable
  at its Vercel origin, GUARD-07 repoints the migration guard so no removal is
  blocked by a stale default, and G8 stays recorded as met while being false,
  which is what R-176 and R-177 exist to make visible rather than to fix.
```

```
ESCALATION: may TRIAGE flip a launch condition from passed to failed on committed
  counter-evidence
WHY IT IS ESCALATED: section 1's third test. It is a widening of a standing rule,
  and DOCTRINE-TRIAGE says in its own words that recording a needed widening is
  TRIAGE's while performing it is an escalation of its own.
CONTEXT: the rubric authorises "flip a launch gate to pass ... and never
  otherwise" and every step of section 4 is written for a gate at fail. G8 is a
  condition that has LEFT pass, which the file does not contemplate. Today that
  costs one overstated readiness count on the phase 2 board.
OPTIONS:
  (a) Grant it, bounded: TRIAGE may move a condition to fail when a clause the
      condition already names is disproven by committed evidence, and must write
      the measurement into evidence.ref in the same edit.
  (b) Refuse it, and add an explicit procedure saying the counter-evidence goes
      in evidence.ref and an escalation, which is what this run did anyway.
  (c) Leave the file silent. Two runs meeting this will decide differently, which
      is the failure the rubric's own overriding rule names.
RECOMMENDATION: (a). The rubric already reasons this way about the closed list:
  narrowing or revoking a credential grant is not an escalation "because the
  failure mode of narrowing is an outage and the failure mode of widening is a
  breach". A gate moved to fail delays a launch. A gate left at pass that is
  false launches on a claim nobody checked. The safe direction is the one TRIAGE
  currently cannot take. This asks for nothing about launch TIMING, which is item
  10 and stays untouched.
IF UNANSWERED: the interim rule in R-177 binds every TRIAGE run: write the
  counter-evidence into evidence.ref, leave state alone, say in the field that it
  is stale, do not adjust readiness_passed, and escalate. The board keeps one
  condition whose state and evidence disagree, on purpose and in writing.
```

---

## 7. What this run did not do

- **Shipped nothing, merged no card pull request, applied no migration, wrote no
  application code and no test, edited no existing ruling.** R-180 and R-181 both
  landed on cards whose work looks finished, and neither was shipped: that is the
  boundary, and it is the reason the role is reviewable.
- **Flipped no gate**, including the one it believes is false.
- **Authored no card for a finding already carried by an open card**, which was
  three of this report's four recommendations plus the whole of R-183.
- **Edited no `priority` and no `evidence` field**, neither being a field the
  rubric grants.

## 8. A note on the rubric itself

`docs/DOCTRINE-TRIAGE.md` invites this: *"If this file does not say how to decide
something, that is a defect in this file, and saying so is a legitimate TRIAGE
output."*

**One defect found and filed as R-177**: section 4 is one-directional and has no
procedure for a launch condition whose `pass` evidence has been falsified.
Escalated with a recommendation rather than resolved by improvisation.

**One near-miss worth recording without a ruling.** Section 5 says not to author a
card already covered by an open card, and gives no method for FINDING that open
card. Today it took a full read of both boards and of P3-35's acceptance to
notice that three of four recommendations were already written down. **A report
that recommends work, and a board that already carries it, meet nowhere except in
whoever happens to read both.** That is the seam this role runs in, so it is
working as intended, and it is also exactly the seam that produced R-183: eight
runs of these decisions have never reached `main`, so each new run reads a board
that does not know what the last eight decided.
