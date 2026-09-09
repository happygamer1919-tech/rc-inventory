# TRIAGE - run 20260906-220005 - the dead premise, and the three cases nobody counted

**Role:** TRIAGE, stateless, per `CLAUDE.md` section 1 and `docs/DOCTRINE-TRIAGE.md`.
**Branch:** `triage/20260906-220005`, cut from `origin/main` at `1d90ca7`.
**Input report:** `docs/reports/2026-09-06-executor-ext-10-supplier-packaging.md`.
**Rulings:** R-144 to R-148. **Counter advanced** to `R-149` in the same commit.

---

## 0. Boot report, printed before any write

| board | shipped | in_flight | todo | blocked | halted | launch gate |
|---|---|---|---|---|---|---|
| phase 2 | 64 | 1 | 13 | 3 | 0 | **6/9** |
| phase 3 | 40 | 0 | 32 | 0 | 0 | **0/9** |

**Next eligible card: `EXT-11`**, first of 42 across the board set, by
`scripts/poc/card-order.mjs`.

**The input report's own boot line says `Launch gate, phase 2: 0/9`.** It is 6 of
9 and has been since 2026-08-27. That is recorded under R-144 and is the first of
two defects found in the report itself.

---

## 1. What was verified before anything was ruled

Nothing in this report is taken from the input report on its word. Every claim
below was re-derived from a committed file or from the GitHub API.

| claim | how it was checked | result |
|---|---|---|
| PR #236 merged on a green `quality` for its head sha | `gh run view 34075461185`, `gh pr view 236` | run `34075461185` **success** on `5508d93`; #236 merged as `1d90ca7` at `2026-09-07T02:33:31Z`; `5508d93` **is** #236's head |
| phase 2 gate really is 6 of 9 | `launch_gate.readiness_passed` and a count of `state: pass` | both 6; the validator fails the build if they disagree |
| the phase 3 apply premise is dead | `docs/migrations/APPLY-LOG.md`, P3-27's evidence, R-142 | 0013 to 0027 journalled, 0028 to 0035 applied by merge, **Pending register empty** |
| no card carries EXT-10's successor | `grep -oniE 'package_factor\|package_unit\|BILLED quantity\|converts'` over all three boards | 5 matches, **all five inside EXT-10 itself** |
| G6's four cases | read `tests/e2e/project-budget.spec.ts` clause list off P3-12's acceptance and evidence | **1 of 4** demonstrated |
| G4's two missing cases | `grep` over the spec, `extraction-fire.ts` and the callback route | redirect **absent**, oversize **absent**, fourth audit running |
| the two P2-13 edges | read R-101 and R-105 on `main`, then read `P2-13.depends_on` | both **declared and never written** |

**No database read was performed and none is claimed.** DOCTRINE-TRIAGE section 4
says gates flip on committed evidence only, so every finding here is a repository
file, a git object or a GitHub API answer.

**One thing about the input file itself, stated because it changes what a reader
can check.** The report's `OUTCOME, APPENDED AFTER THE MERGE` section is **not on
`main`**. It is committed on `card/ext-10-outcome` in open pull request #237. The
body of the report is on `main` at `1d90ca7`. This branch is cut from `main`, so
the outcome half was read from the branch and every fact in it was independently
re-verified against the GitHub API rather than quoted. That is not a fault of the
executor: it committed before it printed, exactly as section 9b requires, and the
pull request is simply still open.

---

## 2. Section 1 of the rubric: four deviations, four verdicts (R-144)

Each names the test that fired. A set ratified as a block is a set nobody read.

| # | deviation | test that fired | verdict |
|---|---|---|---|
| 1 | the board said `shipped` before the acceptance was observed | 4 | **RATIFY** |
| 2 | `hasProductPackaging`, a capability gate the card did not ask for | 4 | **RATIFY** |
| 3 | the package unit is free text, not a second closed list | 4 | **RATIFY** |
| 4 | no claim was taken on EXT-10 | 4 | **RATIFY**, on a ground the report did not claim |

**Deviation 1 is ratified narrowly and the boundary is written into the ruling**,
because it will be quoted more broadly than it was meant. It holds only because
the card's acceptance commands run inside `quality`. A card whose named
acceptance runs nowhere in that job may not ship on this reasoning, and section
6's "no acceptance, no ship" is untouched.

**Deviation 4 is where this run disagrees with the terminal that flagged it.**
The report calls it against itself: "no collision occurred, and that is luck
rather than compliance." The honesty is right and the verdict it implies is
wrong. Test 4 asks what the alternative was, named concretely, and on the
committed record the alternative is not "a claim" but **a claim pull request that
cannot merge inside the run's budget**. CLAIM-01 shipped on 2026-09-06 with its
latency half **refused with its reason**, and its evidence records a fifth
instance on the day it shipped: AUT-9 was claimed in #229 and shipped in #230
before the claim could merge, so **#229 was closed unmerged**. This run is the
sixth instance. **No card is authored**, because DOCTRINE-TRIAGE section 5
forbids a second card for one problem and CLAIM-01 is the card.

**Two defects in the report itself, which are not deviations and get a correction
rather than a verdict:** the phase 2 gate count above, and the **absent open pull
request census**. AUT-18 is shipped and requires every scheduled run to report
every open pull request it did not merge. Six were open while this run worked
(#206, #207, #209, #210, #223 and, by the end, #237) and the report names only
#236. TRIAGE cannot say which half failed and does not guess.

---

## 3. Section 4 of the rubric: the launch gate audits

### 3.1 Phase 3, all nine re-derived (R-145). Stays 0 of 9. Nothing flips.

**This is R-142's own instruction executed.** That ruling, on 2026-09-06, closes
with: "The phase 3 gate conditions still read 0 of 9 and still name APPLY-02 in
their notes as the deciding cause. That premise is now false and correcting it is
a gate audit, which belongs to TRIAGE under DOCTRINE-TRIAGE section 4."

**The premise, quoted before it is replaced, per `CLAUDE.md` 9c.** All nine
conditions carried this sentence from the 2026-08-31 audit:

> "no phase 3 migration has been applied to the RC Supabase project. Twelve
> files, 0013 to 0024, are pending in docs/migrations/APPLY-LOG.md, every one
> naming P3-27, which is blocked on ivan."

Every clause of it is false. P3-27 shipped `2026-08-31T23:27:25Z`. The register is
empty. R-142 read the ledger at `"0034"` with the health route agreeing.

| condition | verdict | the blocker **today**, which is not the one it used to name |
|---|---|---|
| G1 | fail | clauses 1 and 4 **MET**. Clauses 2 and 3 are two probes nobody has run: P3-35 section 1, and GATE-01 which needs only the public anon key |
| G2 | fail | clauses 1 and 2 **MET**. Clause 3 is one query, and **its answer will be an empty-table zero that does not close it** |
| G3 | fail | one deployed-screen walk. Clause 4 forbids inferring it from shipped cards, in terms |
| G4 | fail | one production walk. **No longer "cannot be until P3-27 runs"** |
| G5 | fail | **needs a real project, which no terminal can create.** Moves into the unflippable set |
| G6 | fail | **three spec cases**, and card GATE-04 is authored for them |
| G7 | fail | clause 2 is an unbuilt card; clause 1 needs the same real project as G5 |
| G8 | fail | two unbuilt cards, both eligible. **Never was the apply** |
| G9 | fail | eight unbuilt cards. **Never was the apply, at all, for one moment** |

**One blocker became four**, and that is the whole result: two probes nobody ran,
a deployed-screen walk, eleven unbuilt cards, and a real project only the client
can create.

**G6 is the finding.** Its clause 2 names four cases: under budget, exactly at
budget, over budget, no budget set. P3-12 shipped `project-budget.spec.ts` with
seven passing cases proving the presence matrix, the labelling, and the
**no-budget** case, which the condition's own notes call the one a demo never
happens to hit. **The other three are the three signs of the variance and nothing
asserts any of them.** Four previous audits wrote "EVIDENCE FOUND: none" against
this condition, which was true when the first one wrote it. **Card GATE-04 is
authored**, high, depending on P3-12 which is shipped.

**Third instance of a named pattern.** R-080 found phase 2's G4 closeable with no
card behind it and authored P2-20; GATE-01's notes record the second and say the
pattern, not the clause, is why it is high. This is the third, and the first
found by counting a shipped card's cases against a clause list rather than by
reading a status.

**G2's zero is ruled in advance because the read is one query away.**
`public.unassigned_outbound_count()` will return zero, and it will return zero
because production holds no outbound issues at all. P3-27's evidence says so
about its sibling backfills. **An empty-table zero does not close the clause**,
and that is written onto P3-35's `notes` rather than its `defaults`, because
DOCTRINE-TRIAGE's list of fields TRIAGE may edit does not include `defaults`.

**GATE-02 is left `todo` and was not shipped.** The audit it asks for has been
performed, and its four acceptance items are each pointed at the artefact that
satisfies them in its notes. **TRIAGE may not ship a card**, so the role that did
the work is the one role that cannot record it as done. That is the boundary
working, not a problem to route around.

### 3.2 Phase 2, three failures re-derived (R-146). Stays 6 of 9.

**The input report moves none of them, and that is stated rather than assumed.**
EXT-10 adds two nullable columns, a paired constraint, two form fields and a
sentence on a panel. G4 is the extraction ingest endpoint, G7 is a Resend
delivery, G9 is Mihai completing a cycle himself.

- **G4 stays `fail`, fourth consecutive audit, same two missing cases.** The spec
  now carries **twenty-nine** test blocks, up from the fourteen R-101 counted, and
  every addition is an EXT-16 to EXT-20 reconciliation case. Redirect absent,
  oversize absent. **P2-20 has been eligible for seven days**, which is recorded
  as a fact about the queue: the harness works the lowest-id eligible card across
  the board set and P2-20 sits behind the whole phase 3 board. **This run does not
  resequence the boards to fix that**, because the ordering is `CLAUDE.md` section
  2's and a TRIAGE run is not where a queue policy changes.
- **G7 stays `fail`, `blocked_on: ivan` retained.** Three blockers, none moved in
  eleven days. **What is new is an honest price on the escalation**: the two panel
  items remove two of three blockers, and the third lands at P2-13, which depends
  on P2-08b, which is blocked on Andre. An owner who set both tomorrow would
  correctly expect the score not to move, and the escalation now says so.
- **G9 stays `fail`.** And R-145 finds that **two phase 3 conditions are
  downstream of it**: G5 clause 2 and G7 clause 1 both need a real project, which
  appears when the client starts using the system.

**A divergence between the rubric and this board, named rather than resolved
silently.** DOCTRINE-TRIAGE section 4 says the audit goes in `evidence.ref`. This
board has put every failing condition's audit in `notes` through six audits since
it opened, while the phase 3 board uses `evidence.ref`. **This audit follows the
board and writes a one-line pointer into `evidence`**, because splitting one
condition's audit history across two fields is worse than either convention.
**The defect is in the rubric**, which was written against a board that carries
`evidence` on failing conditions. Correcting DOCTRINE-TRIAGE is AUTHOR's work and
is deliberately not done here: TRIAGE editing its own rubric is the one change
that cannot be reviewed by the role that made it.

---

## 4. Section 3 of the rubric: the board sweep (R-147)

All four checks, over **166 cards on three boards**, not only the cards the report
touched.

1. **Dangling: none.** Every id in every `depends_on` resolves.
2. **Satisfied but blocking: three blocked cards, all three correct.** P2-08b on
   **andre**, MIG-01 on **ivan**, P2-14 on the **client**. None cleared.
3. **The capability edge, the one that costs: TWO MISSING, AND TWO RULINGS ON
   `main` ALREADY SAID SO.** `P2-13.depends_on` was `["P2-08b"]` and is now
   `["P2-08b", "GATE-03", "MIG-01"]`.
   - **R-105**: "`P2-13.depends_on` becomes `["P2-08b", "GATE-03"]`". **The
     acceptance half of that ruling landed. The `depends_on` half never did.**
   - **R-101**: "It must become `["P2-08b", "MIG-01"]`", deferred because MIG-01
     was not yet on the board. **That precondition is discharged**: MIG-01 is on
     the board, and the validator exits 0 with the edge, which was checked.
   - **Why both are capability edges**: P2-13 removes the section 8 apply grant,
     the R-082 applier grant, the section 3.1 self-merge grant and two
     credentials. GATE-03 makes its checklist name R-082. **MIG-01 matters most**:
     P2-13 reverts section 8 to "Ivan-only applies with no database connection
     from any terminal", **a sentence that would be false the day it is written**,
     because the Supabase integration reaches production with no terminal at all.
   - **Eligibility was checked, not assumed.** P2-13 was already ineligible on
     P2-08b and stays ineligible. **No card became eligible or ineligible.**
4. **An edge on a split card: none outstanding.** P2-08's split was re-derived
   under R-046 and P2-09 and P2-13 each point at the half they need.

**P3-37's acceptance is rewritten and its old text is quoted, not deleted.** Half
A asked a terminal to apply `0028` and then read a non-null ledger version from
`/api/health`. **It is discharged**: `0028` is applied by the integration, and
R-142 read `"0034"` with the health route agreeing. **Half B is kept and is worth
more now, not less**: under `CLAUDE.md` 8.0 the register says what a **terminal**
applied rather than what production has, so a stale line can no longer be
sanity-checked against the database. Its failing case must now be a **fixture**,
and the rewritten acceptance says so. **The card stays `todo`. TRIAGE did not
ship it.**

**One evidence ref that cannot be re-verified, and it is deliberately not
corrected.** P3-12's `evidence.ref` opens with the literal `#PENDING`. Section 6
requires a ref a stranger can re-verify. **Inventing a pull request number for a
ship TRIAGE did not watch would be worse than leaving a placeholder that is
visibly a placeholder.** GATE-04 depends on P3-12 and its executor will be reading
that field.

---

## 5. Section 5 of the rubric: cards authored

Two, both with machine-checkable acceptance and both with `defaults` that answer
the ambiguities they will hit.

**`EXT-22`** (R-148), phase 3, high, `depends_on: ["EXT-10"]`, eligible on
landing. **EXT-10's defaults name their own successor and no card carried it**:
"The extraction path recording a BILLED quantity and the platform converting it
is the next card and needs this one shipped first." Verified before authoring: a
grep for the packaging vocabulary over all three boards returns five matches,
**all five inside EXT-10 itself**. Until this ships, EXT-10 is two columns, a
constraint and a form field nothing reads, and both of Andre's sample documents
exercise it. **It needs nothing from Andre**: draft lines already carry `unit` and
`unit_raw` beside `quantity`. Its defaults pre-decide four things, and name the
stop condition: if the work turns out to need a contract change, that is item 6
of the closed escalation list and the card **blocks** rather than negotiating.

**`GATE-04`** (R-145), phase 3, high, `depends_on: ["P3-12"]`, eligible on
landing. Three cases in an existing spec file, each proved to fail first. Its
defaults say in terms that **it does not flip G6 on its own** and must not try,
because clause 1 still needs the deployed-screen observation that belongs to
P3-35.

---

## 6. Escalations, both with a recommended default

**One is a repeat and one is a withdrawal of the advice given last time.**

1. **The two production settings for the low-stock email. Fifth time raised.**
   Recommendation: set both, by name only, and reply. **The caveat is stated more
   plainly than before, because it is why this keeps coming back unanswered**: it
   does not make the condition pass and will not move the score. What two minutes
   buys is two of three blockers removed permanently.
2. **The credential lockdown. The previous recommendation is withdrawn.** The
   2026-09-04 digest advised setting a date and doing it without waiting for
   Andre. **This run's own board sweep found two things it has to wait for that
   nobody had written down**, and one of them is Ivan's own decision.
   Recommendation: **do not set a date yet**; answer MIG-01 first, because the
   lockdown rewrites the rulebook to claim a protection this repository does not
   have.

**Nothing else on this run reached the closed ten-item list**, and that was tested
item by item rather than assumed. In particular, re-running `install.sh` so the
deployed harness matches the repository is **not** escalated: it is not on the
list, the list is closed, and CLAIM-01 and AUT-21 already carry the finding.

---

## 7. What was deliberately not done

- **Nothing was shipped, merged or applied.** GATE-02's work was performed and
  GATE-02 was left `todo`. P3-37's acceptance was narrowed and P3-37 was left
  `todo`.
- **No ruling was edited.** R-101, R-105, R-106 and R-065 are all superseded or
  executed by rulings written here, by id, with the old text quoted.
- **No gate was flipped.** 6 of 9 and 0 of 9 are both counted, not estimated, and
  the validator enforces the count.
- **`defaults` was not edited on any existing card**, because that field is not on
  DOCTRINE-TRIAGE's list of what TRIAGE may edit, even where editing it would have
  been the convenient place to put the G2 caveat.
- **No production read, no secret read, no credential value anywhere.**

---

## 8. Checks run before the commit

    node docs/board/validate-board.mjs docs/board/rc-board-phase2.json   PASS, 0 violations
    node docs/board/validate-board.mjs docs/board/rc-board-phase3.json   PASS, 0 violations
    npm run check:unique-ids                                             OK
    npm run check:card-ids                                               OK
    npm run check:board-clock                                            OK
    npm run check:board-app                                              OK
    npm run check:card-order                                             OK
    npm run check:conflict-residue                                       OK
    npm run id:free -- R-144 / R-145 / R-148 / EXT-22 / GATE-04          all FREE

---

## 9. What the next run should read first

1. **`EXT-11` is the next eligible card** and is unaffected by anything here.
2. **`EXT-22` and `GATE-04` are eligible the moment this pull request lands**, and
   GATE-04 is the cheapest readiness work on either board.
3. **Five pull requests are open and four of them are stranded**: #206, #207,
   #209, #210 and #223. RST-05 is the card for the first four and it is `todo`.
   #237 carries the outcome half of this run's own input report.
4. **The `0035` post-merge observation is still owed.** The APPLY-LOG entry says
   so itself and does not claim it. Whoever next probes production records
   `applied_ledger_version()` reading `"0035"` as a correcting entry, append-only.
