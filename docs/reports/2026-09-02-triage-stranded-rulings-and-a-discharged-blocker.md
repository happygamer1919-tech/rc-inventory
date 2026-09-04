# TRIAGE, 2026-09-02: three ruling ids taken by a conflicting pull request, and the blocker that failed nine gates at once is gone

Run `20260902-070904`. Branch `triage/20260902-070904`.
Input report: `docs/reports/2026-09-01-executor-p3-11d-stale-checks.md`.
Rubric: `docs/DOCTRINE-TRIAGE.md`. No production connection. No card shipped, no
pull request merged, no migration applied, no application code written.

---

## 1. Boot status

Phase 2 board, `docs/board/rc-board-phase2.json`:

| status | count |
|---|---|
| shipped | 42 |
| todo | 14 |
| in_flight | 1, AUT-3 |
| blocked | 2, P2-08b on andre and P2-14 on client |
| halted | 0 |

Launch gate **6 of 9**. Next eligible card **AUT-15**. Phase 3 board, for
context: 20 shipped, 27 todo, gate 0 of 9.

---

## 2. The input report, and its one act that looked like a deviation

The report carries **no "deviations flagged for ratification" section**. That is
recorded rather than passed over, because it contains one act that has the shape
of a deviation: an EXECUTOR edited `CLAUDE.md`.

**R-091 ratifies it**, running section 1's four tests in full. The deciding test
is the third. The card's own `acceptance` demands the edit in terms, so the
executor was APPLYING a rule rather than widening one, and the direction is the
other half of the answer: the edit ADDS a constraint on what a terminal may rely
on, grants nothing, and loosens no gate. Section 6 item 5 already draws that
asymmetry for credentials and the same logic decides this.

The ruling also writes down what WOULD have made it an escalation, so the next
run does not re-derive it: a `CLAUDE.md` edit that widens a grant, adds a path
to the self-merge table, softens a stop or removes a check goes to Ivan whatever
the card says, because a card is authored inside the same system the rule
constrains.

**One thing the report should have said and did not.** `CLAUDE.md` section 9
requires every card to append its ERROR and SOLUTION pairs to
`docs/LEARNINGS.md` or to say it hit none. This report does neither and no entry
exists for the card. Not overturned and no card authored: the substance survives
in the committed report, which the card's evidence names. Recorded so a reader
counting learnings against cards does not conclude the run hit no defects.

---

## 3. The report's real finding, and why it did not become a card

Section 5 of the report:

> This card's own branch was pushed and **no pull request was ever opened**, so
> no CI ran and nothing reported anything at all. The owner noticed before I did.

**R-092.** This is work, not a decision, and section 5 forbids a second card for
a problem an open card covers. **AUT-18 gains a fourth acceptance clause. No new
card is authored.**

The gap is exactly one query wide, and it is the same shape R-078 already found
once between these two cards:

- **RST-02** widens which pull request branches the sweep MERGES. A branch with
  no pull request is not in its input.
- **AUT-18** is the census, and its clause 1 begins "fed a fixture list of OPEN
  PULL REQUESTS". A branch with no pull request is not in its input either.

So nothing in this repository would have named `card/p3-11d`, and nothing did.

It lands on AUT-18 and not on RST-02 because AUT-18 reads and merges nothing,
which is why its own defaults already permit it to look at `card/` branches.
RST-02 merges, and its acceptance asserts that a card branch is NEVER selected.
**A branch with no pull request must be reported and must never be merged**, so
it goes on the reading card. RST-02's negative test is untouched.

The clause added requires the run to start from the REMOTE BRANCH list and
subtract, not to filter the pull request list, and to escalate any such branch
whose head commit predates the start of the run. The habit the report names,
checking that a pull request exists after pushing, is the right habit and this
repository does not gate on habits.

---

## 4. What the board sweep found that the report could not have

### 4a. Three ruling ids are already taken, on a pull request nobody can merge

**R-090.** This run's rulings begin at **R-090**. R-087, R-088 and R-089 are
committed lines with ids on branch `triage/20260901-070544`, open as pull
request 143, merge state **CONFLICTING**. `main` carries the sequence to R-086,
so a reader of `main` alone sees R-086 followed by R-090 and would otherwise
conclude three entries were lost.

The three ids are **retired whether or not 143 ever merges**. Reusing an id a
committed line already carries produces two rulings answering to one number,
which is the collision section 2 requirement 1 exists to forbid.

Pull request 143 is disposed of item by item rather than as a block:

| its ruling | disposition |
|---|---|
| R-087, phase 2 gate audit | superseded in effect by **R-094** of this run, which performs the audit again against today's tree |
| R-088, the applier hardcodes wave 1 | **half void, half confirmed**. Void: `free-text-columns-untouched` is GONE from the script and the two drop cards it named have shipped and applied. Confirmed and live today: `one-create-outbound-issue-five-args` pins one function signature unconditionally |
| R-089, the board sweep | superseded in effect by **R-095**, which carries forward its one durable finding |

**And it cannot simply be resolved and merged, for a reason that has nothing to
do with the conflict.** R-088 authors a card **P3-29**. A DIFFERENT card P3-29
landed on `main` four hours later in pull request 150. Two cards, one id, one
board: the validator fails on it, and the alternative outcome is a silent
overwrite. `main` keeps the id, the stranded card is re-authored here as
**P3-36**, and **RST-04** closes 143 with the record of where each piece went.

**This is the second instance of the same shape and the first one is still
open.** RST-03 is the instance for pull request 126, todo since 2026-08-31.
RST-02 and AUT-18 are the class. Neither has shipped, which is why a night of
review work has now had to be disposed of by hand twice.

### 4b. The blocker that was failing all nine phase 3 conditions is discharged

**R-093, and it is the most useful thing in this run.** Every audit of the phase
3 gate since 2026-08-31 carried one sentence, identically, on all nine
conditions: no phase 3 migration has been applied, twelve files are pending,
every one naming P3-27, which is blocked on ivan.

**Every file from 0013 to 0027 is now recorded as APPLIED. The Pending section
of `docs/migrations/APPLY-LOG.md` is EMPTY. P3-27 is shipped.** R-065's own
closing finding was that eleven shipped cards and nine failed conditions were one
blocked card apart. That card ran.

All nine were re-audited clause by clause. **None flips, the score stays 0 of 9,
and the reason changed on every one.**

| condition | before | now |
|---|---|---|
| G1 counterparties | 0 of 4, unreachable | **2 of 4**, and the two missing clauses are reachable read-only |
| G2 projects | 0 of 3, unreachable | **2 of 3**, closest condition on either board to flipping |
| G3 live sections | clause 4 impossible, screens would error | **3 of 4**, unmet because nobody has looked |
| G4 cross-links | walk impossible | **runnable**, never run |
| G5 material cost | arithmetic green, no real project | unchanged, and it is a **different class**: it waits on real data, not on a check |
| G6 budget | P3-12 todo | P3-12 now eligible, both its dependencies shipped |
| G7 estimates | "P3-13, P3-13b, P3-13c all todo" | **premise corrected**: P3-13 and P3-13b are SHIPPED |
| G8 documents | P3-15, P3-16 todo | unchanged, P3-15 now eligible |
| G9 density | P3-19 to P3-26 todo | unchanged |

**The finding the audit exists to produce:** four conditions are short of nothing
but a read-only verification against production and a look at the deployed
screens. That work had **no card**, was blocked on nobody, and was
indistinguishable in the 0 of 9 score from five conditions that genuinely wait on
unbuilt features. **P3-35** is authored for it, read-only, writing nothing, with
G5 deliberately excluded and the reason recorded on the condition.

### 4c. The phase 2 gate, and where four audits have been filed

**R-094. 6 of 9, nothing flips.** G4 is two named cases short, redirect and
oversize, both card P2-20, re-measured against the files rather than carried
forward. G7's three items have not moved and the two panel actions are escalated
for a third night. G9 cannot be flipped by any terminal ever, has no card, and
should not have one.

**The form correction R-087 made on the conflicting branch, which therefore never
reached `main`:** all three failing conditions carried `evidence: null` while
their audits sat in `notes`. Section 4 point 4 names `evidence.ref`. The audits
in `notes` are left exactly as they are, because a record is not rewritten, and
this run's audit is written where the rubric says to look.

### 4d. The four dependency checks

**R-095**, run mechanically over both boards at `5f5e13f`.

1. **Dangling: none.** Every id resolves on its own board, including the three
   cards authored here.
2. **Satisfied but blocking: one, P2-08b, and it is correct.** Andre genuinely
   owes the round trip. What changed is what sits behind it: no launch condition
   has waited on this card since R-053, so the only thing it now holds is P2-13,
   which holds P2-14 and the whole handover. Escalation 2.
3. **Capability edge: P2-13, third sweep running, still unauthorable as an
   edge.** Its `acceptance` takes three changes: a stale sentence corrected
   (thirteen files pending is now zero, and the BOX is kept rather than turned
   into a statement of fact), **R-082 named as a third revocation** because
   section 8.7 covers it only by a blanket phrase and a checklist that enumerates
   two grants will revoke two, and a **new box for P3-35**, whose read this card
   makes permanently impossible.
4. **Split cards: thirteen edges re-derived, all correct.** One trap named for
   the next reader: `P3-29a`, `P3-29b` and `P3-29c` are NOT halves of `P3-29`.
   They are three unrelated cards from Andre's contract review that happened to
   be numbered after it.

---

## 5. Output

**Rulings written:** R-090, R-091, R-092, R-093, R-094, R-095. The sequence
starts at R-090 and R-090 says why.

**Cards authored:** RST-04 (phase 2), P3-35 and P3-36 (phase 3).

**Cards edited:** AUT-18 acceptance, defaults and notes. P2-13 acceptance and
notes.

**Gates audited:** all nine on phase 2 and all nine on phase 3. **None flipped.**
Phase 2 stays 6 of 9, phase 3 stays 0 of 9. Twelve `evidence.ref` audits written,
three of them into a field that has been null on this board since it opened.

**Learnings:** none appended. Nothing in this run was an ERROR and SOLUTION pair;
the one missing learning belongs to the input report's card and is recorded in
R-091 rather than written on its behalf.

---

## 6. Escalations, each with a recommended default

**1. RESEND_API_KEY and RESEND_FROM in the production environment.** Item 7,
panel actions. Third night raised, unanswered twice.
**Recommendation:** set both now, by name only, and reply that they are set.
They are already handover checklist items, so doing them now removes two items
from that day. **Honest caveat:** it does not close the condition on its own; a
recipient on a domain that exists is the third thing and it lands at P2-13.
**If unanswered:** nothing breaks, the email keeps recording its reason and not
sending, and both settings wait for handover day.

**2. P2-08b has been blocked on Andre for six days and the whole handover lane is
behind it.** Item 6, anything touching Andre.
**Recommendation:** chase him with a hard date of one week, then cut the
handover loose automatically. Option (a) is Andre confirms the contract and one
real document runs. Option (b) is removing P2-08b from P2-13's `depends_on` so
the credential rotation and Mihai's acceptance can proceed. **The tradeoff,
stated:** R-037 tied them together because a first real document usually finds a
migration and after P2-13 no terminal can apply one. That risk is smaller than
when it was written, because every migration is now applied and proven and the
extraction path is covered by assertions that run on every push. **If
unanswered:** the handover stays parked behind six days of silence and Mihai
cannot be given the system at all.

**3. The phase 3 launch gate wording has never been approved.** Its own
`source_note` says so: authored 2026-08-28, "NOT YET APPROVED BY IVAN... the gate
wording is a proposal until he rules on it". Four formal audits have now been
recorded against wording nobody signed off. Item 10, launch timing, being the
item the definition of "phase ready" maps onto; the list is closed and this is
the entry it belongs under.
**Recommendation:** approve the nine as written, in one reply. Re-wording now
throws away four audits recorded against those exact sentences. **If
unanswered:** they keep being treated as binding in practice, which is what has
been happening, and the note saying they are unapproved stays on the board.

---

## 7. One note on the rubric, which the dispatch invites

`docs/DOCTRINE-TRIAGE.md` still says TRIAGE finds its own input and that needing
anything not in the report or in that file is a defect in it. **This run could
not have performed sections 2, 3, 4 or 5 under that clause.** Section 2 needed
`decisions/inbox.md` for the next free ruling id, and that is precisely where it
found that the next three were taken. Section 3 needed both board files by its
own words. Section 4 needed the apply log, the extraction spec and the applier
script. Section 5 needed the board to know whether an open card already covered
the report's finding, which is what kept AUT-18 from becoming a duplicate.

**No card is authored for this.** **AUT-15 already is that card**, it is the
lowest-id eligible card on the phase 2 board, and R-067 authored it under this
same observation on 2026-08-31 with the reasoning that AUTHOR writes it rather
than TRIAGE, because a role that edits the document constraining it has removed
the constraint whatever the edit says. That reasoning is unchanged and this run
does not touch the file. It is recorded here as a second instance, which is the
argument for working the card.
