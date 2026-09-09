# TRIAGE: the card R-116 authored, which was never authored

**Run** `20260908-040001`.
**Role** TRIAGE.
**Input report** `docs/reports/2026-09-08-executor-gate-01-anon-write.md`.
**Rubric** `docs/DOCTRINE-TRIAGE.md`, in full.
**Date** 2026-09-08 UTC.

---

## Boot

`docs/board/rc-board-phase2.json`, `as_of 2026-09-07T19:36:41Z` at boot:

- **shipped 65, todo 16, in_flight 1, blocked 3, halted 0**
- **launch gate 6 of 9**, failing G4, G7, G9
- **next eligible card: `GATE-02`**, phase 3 board

**ONE BOOT CORRECTION, MADE HERE RATHER THAN LEFT IN THE SCROLLBACK.** The first
eligible-card command this session ran passed the board set through an unquoted
shell expansion, which `eligible.mjs` read as one `--board` plus a stray
positional, and it printed the phase 3 cards alone. **The tool is not at fault
and `run.sh` does it correctly**, building one `--board` flag per board in an
array with a comment explaining why. The card named above is unaffected: `GATE-02`
is first in the combined list too. What was understated was the eligible COUNT,
which is 39 across both open boards, not 25.

---

## 1. The one flagged deviation: OVERTURNED

The report flags one, in its own words: *"This run did not commit that flip
separately: the card went from `todo` to `shipped` in a single commit."*

The four tests of section 1, in order, first to fire decides:

| # | test | result |
|---|---|---|
| 1 | irrecoverable data | does not fire. A missing commit touched no row, no credential, no environment. |
| 2 | committed evidence a stranger can re-verify | passes, and it was re-verified rather than read |
| 3 | widened a rule or applied one | neither. It omitted one and said so. Not a rule change, nothing escalated. |
| 4 | would the alternative have been worse | **NO. OVERTURN.** |

**Test 2 was re-verified from the API, not taken from the report.** Branch
`card/gate-01` carries five commits and is deleted from the remote; the commits
are still readable. Its first commit `357f53c4` changes
`scripts/prove-anon-write-refused.mjs` and `package.json`, and the board hunk in
that same commit reads `-"status": "todo"` / `+"status": "shipped"`. Nothing
precedes it.

**Test 4 decides it.** Named concretely as the test requires: the alternative is
one commit containing a two-character board edit. The card would have shipped the
same script, the same probe output, the same journal row and the same report. The
deviation bought nothing.

**THE OVERTURN'S CARD ALREADY EXISTS AND IS `RULE-10`, SO NONE IS AUTHORED.**
Section 5 forbids a second card for one problem. RULE-10 is open and is exactly
this defect, and GATE-01 is its **fourth** instance and the first to occur after
the card naming the pattern was written. Its acceptance replay list gains
GATE-01, under R-171.

**One thing that is NOT a deviation, recorded so it is not later mistaken for
one.** The three INSERTs at production were pre-authorised by the card's own
committed acceptance line, are not DELETE-class, and carry a row in
`docs/PRODUCTION-WRITES.md` with the script sha256 and `rows: 0`. That is
applying a rule, not widening one. Nothing about it is ratified here because
nothing needed ratifying.

---

## 2. The finding that changed what this run did

The rubric's section 3 check 3, the capability edge, sent me at `P2-13`. I wrote
the three edges it takes away and the validator refused all three:

    FAIL  docs/board/rc-board-phase2.json  (3 violations)
      - cards (P2-13).depends_on: "APPLY-02" is not a card id on this board.
      - cards (P2-13).depends_on: "P3-35" is not a card id on this board.
      - cards (P2-13).depends_on: "P3-37" is not a card id on this board.

**That is the second time that refusal has been quoted onto that card.** R-116
quoted it on 2026-09-04, authored a card to fix it, and closed with *"BOARD-03 is
authored `todo` with no dependency."*

**`BOARD-03` on `main` is a different card.** It is the next-card sort card,
authored by run `20260903-070005` under **R-125**, shipped as PR #222, and cited
by name in CLAUDE.md section 2. Diffing the card id sets across R-116's own merge
commit `eebb7d9` (PR #190):

    rc-board-phase2.json   added AUT-20, AUT-21, AUT-22, RULE-05
    rc-board-phase3.json   added APPLY-02

**No card for the cross-board validator, on either board.** A ruling named a
card, the id was already held by a card from a run whose ruling ids are HIGHER and
whose pull request merged FIRST, and the card went nowhere. Nothing was red.
R-116 reads today as though the work is queued, and the edge it exists to make
writeable is still refused four days later.

**This is the gap RULE-09 closed, and it is the first confirmed case of a card
LOST to it rather than merely colliding.** CLAUDE.md 8b records that until
2026-09-07 card ids had no cross-branch check of any kind, because
`check-open-branch-ids.mjs` read `decisions/` and never opened a board.

**The mechanism now works and this run watched it work twice.** Allocating this
run's ids:

    npm run id:free -- R-144     ->  R-144 IS NOT FREE. Take R-171.
    npm run id:free -- GATE-04   ->  GATE-04 IS NOT FREE. Take GATE-05.

The counter on `main` reads `R-144` while the true free id is `R-171`, because
twenty-seven ids sit on open TRIAGE branches. Under the pre-RULE-09 rule this run
would have taken `R-144` and `GATE-04` and repeated R-116's failure twice in one
pull request.

**Card `BOARD-04` is R-116's card**, re-authored under a free id, with the edge it
motivates written in the same pull request as part of its acceptance. Nothing is
renumbered: BOARD-03 landed as something else and stays that.

---

## 3. The second finding: a proof slot on a failing gate

The report says it plainly: *"`launch_gate.conditions[G1].evidence` rewritten to
record clause 3 as MET [...] `state` on G1 left at `fail`."* The executor did
exactly what its card told it to do, and the card's acceptance line says
`evidence`.

**R-117 ruled against that on 2026-09-04**, because `docs/board/board-app.js`
calls `evidenceBit(g.evidence)` at three sites, one of them the owner's focus
column, truncating to 34 characters. *"A field that reads as 'here is the proof'
beside something that has not passed is the one place an audit must not go."*

**R-117 was written about one board and is being read on two.** Measured on `main`
at `9b6b6b1`:

| board | at `pass` | at `fail` | what a failing condition carries |
|---|---|---|---|
| phase 2 | 6, all with evidence | G4, G7, G9 | `evidence: null`, audits in `notes` |
| phase 3 | 0 | all 9 | a populated evidence object, 970 to 2330 chars |

So the harm R-117 names has been live on the phase 3 board since before R-117
existed, and G1 now truncates to a fragment reading *"CLAUSE 3 IS MET AS OF
2026-09-08"* rendered beside a **FAIL** badge.

**The rule, stated once for both boards:** a condition at `pass` carries its proof
in `evidence`; a condition at `fail` carries `evidence: null` and its audit in
`notes`, however much of a clause is met.

**GATE-02's acceptance is amended to carry it, and GATE-05 enforces it
afterwards.** GATE-02 is already required to rewrite all nine, so moving them
costs it nothing; GATE-05 depends on GATE-02 for the same reason GUARD-02 depends
on RESTORE-01, because the check run today goes red against `main` on nine rows.
GATE-01's G1 text is left exactly where the executor put it: it is accurate, four
hours old, and one of the nine.

---

## 4. Gates: eighteen audited, nothing flipped

**Phase 2 stays 6 of 9. Phase 3 stays 0 of 9.** No database read was performed for
this audit and none is claimed: TRIAGE holds no grant to source the secrets file.

**Phase 2's three failures are the three kinds section 4 says no terminal may
flip**, and nothing moved since R-117. G4 needs P2-08b, blocked on a **third
party**; its buildable half is P2-20, eligible and unclaimed, and it is the only
piece of the phase 2 gate that is genuinely backlog. G7 needs two **panel
actions** and a recipient that lands at P2-13. G9 needs **the client**.

**G7 is not re-escalated and that is deliberate.** Run `20260831-040003` put the
two panel items in front of the owner under R-080 with a recommended default, that
question is unanswered, and asking it again in the same words teaches the reader
to skim. One thing worth recording: that gate's note opens by saying migration
`0006` is unapplied and then **corrects itself in the same field**, under R-007,
with a read-only verification. `0006` is applied. A reader stopping at the first
paragraph would card a migration that exists.

**Phase 3's nine all rest on a premise that is dead** and this run did not
re-derive them, because GATE-02's own defaults require every condition re-derived
against a live probe and TRIAGE cannot run one. Writing nine verdicts from
committed files alone would produce exactly the carried-forward audit that card
exists to correct, in the field it is about to rewrite. **Three things are handed
into GATE-02's notes instead:** G1 clause 3 is MET and needs no probe, G1 clause 1
is answered by the same three responses with the PostgREST reasoning recorded, and
**P3-35 produces the production evidence while GATE-02 records the verdict.** No
edge is written between them, because GATE-02's acceptance admits `NOT ATTEMPTED`
and a card that can finish should not be parked behind one that has not started.

---

## 5. depends_on, all four checks, 173 cards on three boards

1. **Dangling: none.** Every id resolves.
2. **Satisfied but blocking: two, both correct.** P2-08b is blocked on `andre`,
   who genuinely owes the live round trip. MIG-01 is blocked on `ivan` with no
   dependencies, and the decision it needs is genuinely his.
3. **The capability edge: three found, none writeable.** Section 2 above.
4. **Edges on split cards: re-derived, no change.** Five split families
   (P3-04, P3-05, P3-11, P3-13, P3-27); every base is `shipped`, so every
   dependent is satisfied whichever half it names.

---

## 6. Escalations: none

Nothing in this report is on the closed ten-item list of
`docs/DOCTRINE-TRIAGE.md` section 6. The two live candidates were checked and both
are already answered: narrowing or revoking access is item 5's explicit exception
and is TRIAGE's to rule, which covers the whole of R-173; and G7's panel actions
were escalated under R-080 and are still outstanding, so re-sending them is noise
rather than a second question.

---

## 7. Two defects in the rubric, which its own opening calls a legitimate output

1. **Section 4 step 4 says to write a gate audit into `evidence.ref` whether or
   not it flips.** R-117 departed from it for this repository, R-172 extends the
   departure to the second board, and the document still says the other thing. It
   is named rather than edited: that file is AUTHOR's, and a TRIAGE run editing
   its own rubric is the one edit nobody else would review.
2. **Section 4 requires an audit to record what is missing and requires nothing to
   be done with it.** The report names the cost: *"this is the second gate
   condition found closeable with no card behind it [...] Both times the audit
   correctly recorded what was missing and nobody converted the cheap half into
   work."* GATE-02's defaults already carry the correct behaviour for the audit
   about to happen, so no card is authored for it here, but the rubric that binds
   every future TRIAGE run does not.

---

## Output

| | |
|---|---|
| **Rulings** | R-171, R-172, R-173, R-174. Counter advanced to R-175 in the same commit. |
| **Cards authored** | `BOARD-04` (phase 2), `GATE-05` (phase 3) |
| **Cards edited** | `RULE-10` acceptance and notes, `P2-13` notes, `GATE-02` acceptance and notes |
| **Gates flipped** | none. 6 of 9 and 0 of 9, unchanged. |
| **Escalations** | none |
| **Validators** | all three boards exit 0; `check:unique-ids` exits 0 |

**Nothing was shipped, nothing was merged, no migration was applied, no
application code or test was written, and no existing ruling was edited.**
