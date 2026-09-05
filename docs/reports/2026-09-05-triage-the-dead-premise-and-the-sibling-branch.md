# TRIAGE - unattended run 20260905-010004

**Role:** TRIAGE
**Run id:** 20260905-010004
**Date (UTC):** 2026-09-05
**Branch:** `triage/20260905-010004`, cut from `origin/main` at `68f3f90`
**Input report:** `docs/reports/2026-09-05-executor-stale-pr-backlog.md`
**Rubric:** `docs/DOCTRINE-TRIAGE.md`, read in full before any write.

---

## 0. Boot

**Phase 2 board**, `as_of 2026-09-05T02:35:00Z`: shipped 50, todo 26, blocked 3,
in_flight 1, halted 0. **Launch gate 6/9**, G4, G7 and G9 at `fail`.

**Phase 3 board**, `as_of 2026-09-05T01:08:57Z`: shipped 37, todo 34.
**Launch gate 0/9.**

**Next eligible card at boot:** `AUT-20` on the phase 2 board, `APPLY-02` on the
phase 3 board, which the working set puts first.

**Blocked:** `P2-08b` on andre, `P2-14` on client, `MIG-01` on ivan.

---

## 1. THE THING THAT DECIDED HOW THIS RUN WAS SPENT: A SIBLING BRANCH HAD ALREADY DONE MOST OF IT

Pull request **#207** is the previous night's TRIAGE run, `20260904-220003`. It
is **open and unmerged**, and before this run wrote a word it already contained:

| what #207 already decided | ruling |
|---|---|
| APPLY-02 is built on the sentence R-124 disproved, and becomes a verification | R-133 |
| AUT-3 comes out of `in_flight`, where no selector could reach it | R-129 |
| MIG-01's block is cleared, because the owner answered it on 2026-09-04 | R-131 |
| P2-13 gains the capability edges it was missing | R-130 |
| the phase 2 gate audit, all three failing conditions re-derived | R-134 |

**Four of those five were actions this run had derived independently and was
about to take.** It took none of them. Writing a second decision onto a card an
open pull request already edits produces a merge conflict inside a JSON string
and gives one decision two authors.

**The executor paid for the same thing first, and paid more.** Its report's
longest section, headed THE FINDING THAT MATTERS MOST, derives R-133's finding
from scratch, about seven hours after R-133 was written. Neither terminal was
wrong: both read `main`, and on `main` that ruling does not exist.

**Why it is structural.** `quality` costs about 20.5 minutes of a 45 minute cap,
`main` requires branches to be up to date, and the first merge of a round puts
every sibling back to `BEHIND`. The chain produces two pull requests per run and
drains one. `AUT-22` is the arithmetic and `AUT-23` is the depth check; both are
unbuilt.

This is **R-139**, and it authors **AUT-25**: the harness already gathers the
open pull request list for AUT-18's report, and hands it to nobody. The TRIAGE
prompt gets it, with the ruling ids each branch adds.

---

## 2. Deviations, ratified individually (rubric section 1)

The input report flagged nothing under that heading, so the three were derived
from what it did. All three RATIFIED. Full text in **R-136**.

| # | deviation | test that fired | verdict |
|---|---|---|---|
| 1 | spent the whole budget finishing another run's branch, started no new card | test 4: the alternative strands an `in_flight` card, which is AUT-22's failure | RATIFY |
| 2 | resolved #207's conflict locally on another run's branch | test 3: R-052 requires exactly this, locally, never in the web editor | RATIFY |
| 3 | found two cards wrong and edited neither | test 4: the edits are TRIAGE's, and had in fact already been made on #207 | RATIFY |

Test 2 passed on all three: PR #205 with head `291ac41` and run `33946165159`,
squash `68f3f90` on `main`, and merge commit `44cb6af` on
`triage/20260904-220003`, all re-verifiable by a stranger.

---

## 3. THE PHASE 3 GATE AUDIT (rubric section 4). NOTHING FLIPS. 0 OF 9, COUNTED.

Ruling **R-137**. All nine `evidence.ref` fields rewritten, `at 2026-09-05`.
`readiness_passed` set by counting conditions in state `pass`, which is 0.

### The sentence all nine rested on, and why it is false

Every one of the nine ended with, dated 2026-08-31:

> "THE COMMON BLOCKER, AND IT IS THE WHOLE AUDIT: no phase 3 migration has been
> applied to the RC Supabase project. Twelve files, 0013 to 0024, are pending in
> docs/migrations/APPLY-LOG.md, every one naming P3-27, which is blocked on
> ivan."

**All three clauses are false today**, on this repository's own journal:

- `docs/migrations/APPLY-LOG.md` carries `WAVE 1 BATCH, 0013 to 0025 - APPLIED`:
  13 files, 202 statements, one transaction, 11 assertions, committed on
  all-pass, ledger 25 rows and no gaps, 2026-08-31.
- `0026` and `0027` carry their own APPLIED entries. `0028` to `0034` are
  recorded applied, four RECONSTRUCTED and three OBSERVED PROSPECTIVELY under
  R-124.
- The pending register in that file is **empty**.
- `P3-27` is **shipped**, not blocked on Ivan.

Corrected in place with the old text quoted, per CLAUDE.md 9c.

### Condition by condition, which is GATE-02's clause 1

| gate | clauses met | not met | deciding blocker TODAY |
|---|---|---|---|
| G1 | 1 and 4, on the P3-27 and 0027 post-checks: RLS enabled with 3 policies on clients, contacts, projects, suppliers, devize, deviz_lines; `products.supplier_id` present, `supplier_name` absent | 2 and 3, never ATTEMPTED | one real request against production. `GATE-01` covers clause 3, `P3-35` clause 1 covers 2 and 3 |
| G2 | 1 and 2: 0016, 0017, 0018, 0021 applied in the batch, 0026 dropped the free text after backfill | 3, a number nobody has read | `P3-35` clause 2, which names `public.unassigned_outbound_count()` |
| G3 | 3 locally: P3-06 to P3-09 shipped, specs green | 1, 2, 4 | `P3-35`. Clause 4 stopped being impossible when the tables landed |
| G4 | the local half: P3-10, nine directions, spec green | the walk on production | `P3-35` clause 3 |
| G5 | the arithmetic half: PR #125, `project-cost.spec.ts`, 7 cases, 1850.00 MDL to the leu | one real project reconciled by hand | **no card, and it must not be read as backlog**: there is no real client data. It arrives with P2-13 and P2-14 |
| G6 | both clauses locally. **P3-12 is SHIPPED**, 7 of 7, no-budget case covered. The last audit had it `todo` | the demonstration on production | `P3-35`, then data |
| G7 | P3-13 and P3-13b **now shipped** | clause 2 has no code | `P3-13c` |
| G8 | none | both cards | `P3-15`, then `P3-16` |
| G9 | none | all three | the eight density cards; `P3-21` carries the localisation check, and clause 2 demands it be SEEN TO FAIL |

**Five of the nine touch `P3-35`.** That makes it the highest-value card on the
phase 3 board today, whatever its id sorts as, and its notes now say so.

**`GATE-02` is not shipped by the role that ran its audit.** TRIAGE may not ship
and runs nothing. Both of its acceptance clauses are satisfied by this run's
artefacts, this report and the nine rewritten fields; whoever picks it up
verifies that against the tree and ships it.

**R-126 deferred this audit to GATE-02 on 2026-09-03 and its reasoning is met,
not overturned.** It objected that an audit written in a ruling would land
without the report the acceptance requires, half-doing the card with two hands.
This run wrote both, in one pull request. Two runs deferring in a row is what
changed the answer: the dead premise had stood in nine board fields for five days
while the card that owns it sat eighth in the queue.

### The phase 2 gate audit is deliberately NOT written to the board this run

R-134, open on #207, wrote that exact audit for the same three failing
conditions today, against a `main` this run changed in no way that touches a
gate. A second copy in the same three JSON strings is a guaranteed conflict in
the fields whose resolution is hardest to check. **Here is the audit, so the
record does not depend on #207 merging:**

- **G4** stays `fail`. Deciding clause unchanged since R-053: the ingest endpoint
  proven end to end against the frozen contract. `P2-08b` is blocked on Andre.
- **G7** stays `fail`, `blocked_on: ivan` retained. Deciding clause: one real
  email delivered from a real threshold crossing. `owner_reminder_recipients()`
  returns one address on a domain that does not exist, so a crossing today would
  address nobody. The real accounts arrive at P2-13.
- **G9** stays `fail` and **no card can close it**: it is `P2-14`, Mihai
  completing a cycle himself. Rubric section 4's second kind, and not backlog.

**This is a rubric gap and is reported as one.** DOCTRINE-TRIAGE section 4 says
write the audit into `evidence.ref` whether or not it flips, and assumes one
reviewer at a time. It does not say what to do when a sibling's identical audit
is open and unmerged. Recorded in **R-139**.

---

## 4. THE BOARD SWEEP (rubric section 3). 164 cards, three boards, four checks. No edge changed.

Ruling **R-138**.

1. **Dangling: none.** Every id in every `depends_on` resolves.
2. **Satisfied but blocking: three, all correct.** `P2-08b` waits on Andre, who
   owes a live document. `P2-14` waits on Mihai and its dependency is unshipped.
   `MIG-01` waits on Ivan and its answer is already ruled on #207 as R-131, so it
   is not re-decided here.
3. **The capability edge, and it is the finding.** `P2-13` revokes every terminal
   grant including R-082's migration apply. `APPLY-02` needs that capability and
   its own notes assert the edge exists: *"IT MUST RUN BEFORE P2-13, WHICH IS WHY
   P2-13 NOW DEPENDS ON IT."* **The edge does not exist and cannot be created.**
   `validate-board.mjs` resolves every `depends_on` entry against the cards of
   the board being validated, `APPLY-02` is on the phase 3 board and `P2-13` on
   the phase 2 board, and there is no cross-board edge anywhere in 164 cards.
   **The precondition is real and is already carried by R-072's tickable box on
   P2-13's acceptance**, counted by the same `grep -c` as the rest of it, so
   nothing is unguarded. The standing rule this ruling sets: a capability
   precondition that spans two boards goes in the revoking card's **acceptance**,
   never in its `depends_on`, because an edge the validator refuses is an absent
   guard that reads like a present one.
4. **Split cards: no re-derivation owed.** Every edge into a split family already
   names the half it needs: `P3-13c` on `P3-13b`, `P3-14` on `P3-04`, `P3-18` on
   `P3-13c`, `P2-13` on `P2-08b`, `P2-20` on `P2-08a`.

---

## 5. Findings converted (rubric section 2). Nothing is left as a finding.

| finding, and where it came from | outcome |
|---|---|
| APPLY-02 built on the disproved sentence (report section 4) | **already ruled** as R-133 on unmerged #207. Not re-ruled. Named in R-139 with what happens if #207 closes unmerged |
| AUT-3 shippable and hidden in `in_flight` (report section 6) | **already done** on #207 by R-129. Not duplicated |
| twelve shipped cards with `#PENDING` evidence (report section 5) | **R-140**, card **GUARD-04** |
| one merge per run is structural (report section 5) | LEARNINGS entry already appended by the executor; cards AUT-22 and AUT-23 exist. Its consequence for review output is **R-139** |
| `Launch gate: 0/9` printed under a Phase 2 heading that reads 6/9 | **R-141**, folded into card **RULE-05** rather than a new card |
| this run's own id allocation had to skip seven numbers | **R-135**, card **RULE-08** |
| cross-board capability edge is impossible | **R-138**, standing rule, no card |

### Cards authored: three

- **AUT-25**, high. The TRIAGE prompt carries the open pull requests, their
  branches and the ruling ids each adds. Fails closed and says so when the list
  cannot be read.
- **GUARD-04**, medium. A check refusing a shipped card whose `evidence.ref`
  matches `#PENDING`, plus the backfill of the twelve on `main`: RULE-02 and
  AUT-19 on phase 2; P3-11a, P3-11b, P3-11e, P3-12, P3-33, P3-34, APPLY-01,
  PROVE-01, EXT-14 and EXT-15 on phase 3.
- **RULE-08**, medium. `check:open-branch-ids` covers CARD ids as well as ruling
  ids. The identical collision has already happened: `P3-37`'s notes record it
  being renumbered from `P3-35` by hand because two open TRIAGE pull requests
  both allocated that id.

### Cards edited, not authored

`RULE-05` acceptance and notes, `GATE-01` notes, `GATE-02` notes, `P3-35` notes,
and all nine phase 3 gate `evidence` fields.

---

## 6. Id allocation, and why it starts at R-135

`decisions/NEXT-RULING-ID` on `main` reads `R-128`. Open pull request #207 writes
`R-128` through `R-134` and its own counter reads `R-135`. **This run took
R-135.**

CLAUDE.md 8b is unchanged and still binds. What this run recorded, in **R-135**,
is what a reader does when the counter offers a number an open branch already
holds: the counter converts a race into a merge conflict **at merge time**, and
allocation happens hours earlier. `check:open-branch-ids` would have refused the
collision, after seven rulings had been written and every cross reference in this
report had been made. `npm run check:open-branch-ids` on this branch:

    ids added vs main    R-135 ... R-141
    compared             3 of 3 other open branch(es)
    OK. No id added by this branch is claimed on another open branch.

---

## 7. Escalations: one

Everything else this run touched is inside TRIAGE's authority under R-050 and
section 6's closed list, and is decided and recorded above.

    ESCALATION: the live document test with the extraction supplier has been
                waiting on him since 2026-08-27, ten days
    WHY IT IS ESCALATED: item 6, anything touching Andre, and item 10, launch
                timing
    CONTEXT: P2-08b is blocked on andre. P2-13 depends on it, P2-14 depends on
                P2-13, and phase 2 gate conditions G4 and G9 sit behind those.
                The temporary terminal credential grants stay live meanwhile,
                which is the thing P2-13 exists to end.
    OPTIONS: (a) keep waiting, which costs nothing today and has cost ten days;
                (b) set a date for the credential rotation and run it on that
                date, taking the live document test afterwards on fresh
                credentials.
    RECOMMENDATION: (b). The only thing Andre's answer buys is one test: a single
                real supplier document travelling the whole path is the only item
                that genuinely needs the temporary grants in place. Nothing else
                the rotation removes has anything to do with him. The tradeoff is
                that the live run afterwards needs fresh credentials, which is
                setup and not a rebuild.
    IF UNANSWERED: nothing breaks and nothing improves. The temporary overnight
                grants stay live indefinitely on somebody else's schedule and the
                client acceptance walk stays behind them, exactly as it has for
                ten days.

**Raised through this file and `docs/poc/triage-latest.json`, not through
`ask.sh`.** CLAUDE.md section 14 says in terms that an unattended run does not
block on a question, and TRIAGE's own cap is 30 minutes against a six hour
deadline.

---

## 8. Rubric defects found (a legitimate TRIAGE output, and this dispatch asks for it)

1. **Section 4 assumes one reviewer at a time.** It says write the audit into
   `evidence.ref` whether or not it flips, and says nothing about a sibling's
   identical audit sitting on an unmerged branch. Handled here by writing the
   phase 2 audit into this report and leaving the fields to #207, and recorded in
   R-139.
2. **Nothing in the rubric tells a stateless TRIAGE to read open pull requests.**
   Its ground truth clause names "the pull requests" that committed files name,
   which is a permission and not an instruction. This run read them because the
   id allocation forced it to, and that is how the four-way overlap in section 1
   was found at all. AUT-25 fixes it in the prompt rather than in the document,
   for the reason RULE-04's own file argues: a procedure is only true when
   somebody runs it.

---

## 9. What the next run should know

1. **`P3-35` is the highest-value card on either board.** Five of nine phase 3
   conditions turn on it. It overlaps `GATE-01` on clause 1 and `APPLY-02` on
   clause 2, and neither is retired: whoever goes first produces the evidence and
   says what the others are left holding.
2. **`GATE-02` is now cheap.** Its audit and its report exist; it needs a
   verification and a ship.
3. **`APPLY-02` must not be worked as written**, and R-133 on #207 is the ruling
   that re-authors it. If #207 closes unmerged, R-133, R-131 and the AUT-3 flip
   die with it and must be re-authored under fresh ids. #143 closing unmerged is
   the precedent, and `GATE-01`, `GATE-02` and `P3-37` were salvaged out of it by
   hand.
4. **The board fields this run did not touch were not oversights.** They are
   named in R-137 and R-139 with the reason.

---

## 10. Compliance

- **No card shipped, no PR merged, no migration applied, no application code and
  no test written, no existing ruling edited.** Seven new rulings, R-135 to
  R-141, appended with the counter advanced to `R-142` in the same commit.
- **No launch gate flipped.** Phase 2 stays 6/9, phase 3 stays 0/9 counted.
- **No secret value read, echoed, logged or committed.** Nothing under
  `/Users/ivan/rc-secrets` was opened. `git diff --cached` was read before the
  commit.
- **Checks run before the commit:** `node docs/board/validate-board.mjs` exit 0
  on the phase 2 and phase 3 boards, `npm run check:unique-ids` exit 0,
  `npm run check:open-branch-ids` exit 0, `npm run check:conflict-residue` exit
  0.
