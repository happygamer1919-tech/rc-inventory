# TRIAGE - run 20260907-070002 - the report that was already read, and the five green pull requests nobody can merge

**Role:** TRIAGE, stateless, per `CLAUDE.md` section 1 and `docs/DOCTRINE-TRIAGE.md`.
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, branch `triage/20260907-070002`, cut from `origin/main` at `5bbc852`.
**Input, and the only dispatch:** `docs/reports/2026-09-06-executor-ext-10-supplier-packaging.md`.
**Rulings:** R-158 to R-162. `decisions/NEXT-RULING-ID` advanced to `R-163` in the same commit.

No application code, no test, no migration. Nothing shipped, nothing merged,
nothing applied, no gate flipped, no existing ruling edited, no production read,
no secret read.

---

## Boot report, as printed before any write

| board | shipped | in_flight | todo | blocked | halted |
|---|---|---|---|---|---|
| phase 2 | 64 | 1 | 13 | 3 | 0 |
| phase 3 | 41 | 0 | 31 | 0 | 0 |

- **Launch gate, phase 2: `6/9`.** G4, G7 and G9 at `fail`. Phase 3: `0/9`.
- **Blocked:** P2-08b on `andre`, P2-14 on `client`, MIG-01 on `ivan`. In flight: AUT-3.
- **Next eligible card: `EXT-12`**, first of 41 across the board set.

**THE GATE COUNT IS STATED PER BOARD AND NOT AS ONE NUMBER**, which is R-141's
finding on the still-open `#210`: `CLAUDE.md` section 1 asks a booting session for
one launch gate count and there are two boards. The dispatch report got that line
wrong in exactly this place, and it is the same defect rather than a new one.

---

## 1. The dispatch had already been consumed, in full, eight hours earlier

**PR `#238`, branch `triage/20260906-220005`, head `8827cfa`, opened
2026-09-07T03:09:58Z**, names in its own body:

> "Input report: `docs/reports/2026-09-06-executor-ext-10-supplier-packaging.md`"

It carries **R-144 to R-148**: the four EXT-10 deviations ratified one at a time
with the test that fired named for each, the phase 3 gate audit, the phase 2 gate
audit, the board sweep, and card `EXT-22`. It is **green on its own head sha** and
it is not merged.

**So this run rules nothing in that report a second time.** R-158 says so and
cites the four verdicts rather than re-deriving them. A second set of verdicts on
one set of deviations is two ids saying one thing, and `CLAUDE.md` 8b's first
sentence is that an id names exactly one decision.

**This is the fifth live instance of AUT-17** and the third that is a duplicate
rather than a mis-selection: R-075, R-102, R-118, R-139, and this one. R-139, on
the open `#210`, named the class in its own title.

**The new half, which no single run could see.** The dispatch also named a report
that is not the newest. `docs/reports/2026-09-07-executor-rule-09-and-the-wrong-moment.md`
is on `main`, and three other reports carry a later date than the one dispatched.
The selector is no longer merely repeating itself; it is reaching four reports
back, because every report it should prefer rides on an unmerged branch.

---

## 2. The cause, and it is arithmetic

**Five consecutive TRIAGE pull requests are green on their own head sha and not
one of them can be merged.**

| pr | branch | head | state | `quality` on that head | holds |
|---|---|---|---|---|---|
| `#207` | `triage/20260904-220003` | `44cb6af` | DIRTY | 33947237196 success | R-128 to R-134 |
| `#210` | `triage/20260905-010004` | `d13cb12` | DIRTY | 33948234328 success | R-135 to R-141 |
| `#238` | `triage/20260906-220005` | `8827cfa` | BEHIND | 34078709767 success | R-144 to R-148 |
| `#242` | `triage/20260907-010004` | `efb3321` | BEHIND | 34086984334 success | R-149 to R-153 |
| `#245` | `triage/20260907-040001` | `3b0daeb` | BEHIND | 34101039755 success | R-154 to R-157 |

`npm run checks:state 238`, run on this branch:

```
mergeStateStatus  BEHIND
quality           SUCCESS

STALE, NOT GREEN.
The base has moved and the required check is strict, so the recorded run is not
the run that will decide this merge.
```

**Four steps, each individually correct:**

1. A TRIAGE run has **30 minutes** under `CLAUDE.md` section 13, and its pull
   request is its last act.
2. `quality` takes about **half an executor's 45 minute cap** (R-114). The green
   arrives after the run that produced it is dead.
3. `main` is protected with **`strict: true`** on one required check named
   `quality`, confirmed against the branch protection API on this run. **27
   commits reached `main` in the 48 hours to `5bbc852`.**
4. The window in which a TRIAGE pull request is both green and up to date is
   therefore **shorter than the interval between merges to `main`**, and no TRIAGE
   run is alive inside it. Nothing merges it afterwards: TRIAGE merges its own
   rulings pull request and nothing else, and RST-02, the sweep that would learn
   the `triage/` prefix, is `todo`.

**And it feeds itself.** Every TRIAGE run writes the same fields as the last: the
tail of `decisions/inbox.md`, the counter, `docs/poc/triage-latest.json`,
`P2-13.depends_on`, the notes of G5 and G8. Two of the five are already DIRTY.
**A run that lands nothing makes the eventual reconciliation more expensive than
it was.**

**This run therefore wrote narrowly, and that is a decision.** It re-derives no
finding a green branch already carries, it edits no gate note, and its only board
edits are the two in R-161, which cannot be made apart. `RST-06` carries the
reconciliation, with the argument for why it is neither RST-02 nor RST-05.

---

## 3. Three cards are asking for work that is already done

Nobody had checked, because `DOCTRINE-TRIAGE` section 3 reads `depends_on` and
all three carry none.

- **RST-05.** Its four pull requests merged on **2026-09-04**: `#157`, `#172`,
  `#181`, `#184`. Its three machine-checkable clauses were **run here** and pass:
  no duplicate ruling heading on `main`; the distinct ruling count risen from 88
  at `e15e928` to **129**, +41 against a required +15; `check:unique-ids` exit 0;
  all eleven cards on a board.
- **RST-03.** `#126` merged **2026-08-31**. Three of four clauses run here and
  pass.
- **RST-04.** `#143` is CLOSED. Its clause 2 demanded
  `grep -c '^### R-087|088|089'` print **0**. **It prints 3**, legally, because
  R-107 permits re-allocating a ruling that never landed and three later rulings
  took those ids. The clause could never go green again without deleting
  committed rulings. **Corrected in place**, to what it was actually for.

**None is shipped.** TRIAGE runs nothing that ships, and both RST-03 and RST-05
name a validator run that must happen inside the pull request that carries them.
The next EXECUTOR that claims either runs four and six commands respectively and
ships in one pass.

---

## 4. The board sweep: four checks, one edge, and the clause that had to move with it

- **Dangling: zero.**
- **Satisfied but blocking: three, none cleared here.** P2-08b on andre and P2-14
  on the client are correct. **MIG-01 is already cleared by R-131 on the open
  `#207`**; clearing it twice is the duplication R-158 refuses, and the fix is
  merging `#207`.
- **Capability edge: `P2-13.depends_on` becomes `["P2-08b", "GATE-03", "MIG-01"]`.**
  Neither addition is new reasoning: **R-105** ruled GATE-03 onto the card and the
  edit never reached the board; **R-101** ruled MIG-01 onto it and deferred the
  write because MIG-01 was not yet a card, and that precondition is discharged.
  Both are rulings **on `main`**. R-130 (`#207`) and R-147 (`#238`) reached the
  same three-entry array independently, which is the agreement
  `DOCTRINE-TRIAGE`'s overriding rule asks for; it is written a third time only
  because neither of those can merge.
- **And it cannot be written alone.** `RESTORE-01.acceptance` demanded
  `P2-13.depends_on` be **exactly** `["P2-08b", "MIG-01"]`. Written as R-105
  requires, that clause becomes unsatisfiable. It is corrected to demand
  **containment**, which is what R-101 actually ruled. Its other three
  byte-identity clauses are left to R-130's measurement and named in RST-06's
  scope.
- **Split cards: none outstanding.**
- **One finding the sweep cannot express as an edge:** P2-13 revokes the section
  3.1 self-merge grant, which **every unshipped card needs**. R-157 on `#245`
  rules exactly this and says the rubric has no answer for it. Not re-ruled.

---

## 5. Launch gate audit

**Phase 2 stays 6 of 9. Nothing flips.**

- **G4**, extraction end to end. Deciding clause is one real document on
  production, which is P2-08b, blocked on **andre** for eleven days. Its two
  remaining failure-mode clauses are P2-20, `todo` and eligible. **No terminal can
  close the first half.**
- **G7**, the reminder email. `blocked_on: ivan`. `RESEND_API_KEY` and
  `RESEND_FROM` missing from production since **2026-08-26**, twelve days, plus a
  recipient on a domain that exists. **A panel action. Escalated again.**
- **G9**, Mihai's own cycle. P2-14 blocked on the **client**, downstream of G4.
  **Not backlog.**

**Phase 3 is not re-audited**, and the reason is evidence rather than budget:
R-145 on `#238` audited all nine conditions **eight hours ago against this same
report**, and nothing has moved since - no card shipped on either board between
`#238`'s base and `5bbc852`, which carries three POC state merges. R-106 is the
precedent for a stated non-audit.

**One declared departure from the rubric.** `DOCTRINE-TRIAGE` section 4 point 4
says to write the audit into the gate whether or not it flips. **This run wrote no
gate note.** Five previous audits of G4, G7 and G9 already say what this one says,
`#238` added a sixth on its branch, and a seventh would conflict with it for no
new information. The audit is here and in R-162 instead. If that trade is wrong,
the corrective is a ruling saying so.

---

## 6. A defect in `docs/DOCTRINE-TRIAGE.md`, reported rather than fixed

**Section 3's four checks all read `depends_on`, so a card can go completely stale
without any edge going stale, and nothing in the rubric looks.** RST-03, RST-04
and RST-05 all carry `depends_on: []`. Their premises live in prose inside `title`
and `acceptance`, every pull request they name merged or closed between
2026-08-31 and 2026-09-04, and **five TRIAGE runs swept this board without one of
them noticing**, because the sweep they ran cannot see prose.

The missing check is a fifth: **does this card's own text name a pull request, a
run or a commit whose state contradicts the card's status?** It is cheap, it is
machine-assisted rather than machine-checkable, and it would have caught all three
on any of the last five runs.

**It is reported and not fixed** because a role may not rewrite its own rubric,
and because `docs/DOCTRINE-TRIAGE.md` says in its own words that a gap in that
file is a defect in it and saying so is a legitimate TRIAGE output.

---

## 7. Open pull request census, per AUT-18

Taken at `origin/main` `5bbc852`. **This run merged nothing.**

| pr | branch | head | state | `quality` on that head |
|---|---|---|---|---|
| `#206` | `poc/report-20260904-220003` | `d06f60b` | BEHIND | 33947116809 success |
| `#207` | `triage/20260904-220003` | `44cb6af` | **DIRTY** | 33947237196 success, **stale** |
| `#209` | `poc/report-20260905-010004` | `17388dc` | **DIRTY** | 33947278208 success, **stale** |
| `#210` | `triage/20260905-010004` | `d13cb12` | **DIRTY** | 33948234328 success, **stale** |
| `#223` | `poc/state-20260906-040016` | `46ce263` | **DIRTY** | 34026504836 **failure** |
| `#237` | `card/ext-10-outcome` | `0b46d04` | BEHIND | 34076734618 success |
| `#238` | `triage/20260906-220005` | `8827cfa` | BEHIND | 34078709767 success |
| `#240` | `card/ext-11` | `93fe03c` | **BLOCKED** | 34115053214 **not concluded** |
| `#241` | `report/20260907-010004` | `6dc2293` | BEHIND | 34085609859 success |
| `#242` | `triage/20260907-010004` | `efb3321` | BEHIND | 34086984334 success |
| `#244` | `report/20260907-040001` | `9bdd5a6` | BEHIND | 34099135974 success |
| `#245` | `triage/20260907-040001` | `3b0daeb` | BEHIND | 34101039755 success |

**Twelve open, and eleven of them are review or report output rather than
product.** Four are conflicting. `#223` is the only red one. `#240` carries
EXT-11, whose board status reads `shipped` on a branch whose own evidence field
says the card is not finished; **R-154 and R-156 on `#245` already rule it** and
it is not re-ruled here.

---

## 8. What the next run should pick up first

1. **The five stranded TRIAGE pull requests, as `RST-06`**, oldest first, before
   any new card. Everything below is downstream of the record catching up.
2. **`RST-03` and `RST-05`**, which are two short acceptance runs away from
   shipping and read today as unstarted work.
3. **`EXT-12`**, the next eligible card, if the run has budget after those.

## Escalations

Three, all with a recommended default, all in `docs/poc/triage-latest.json`:
the unpublished review backlog, the credential lockdown waiting eleven days on the
extraction supplier, and the two production settings for the warning email,
missing twelve days and raised for the fifth time.

## Learnings appended

**None, and that is stated rather than omitted.** Every defect this run found is a
decision or a card, not an error-and-solution pair: `docs/LEARNINGS.md` is for
something that broke and what fixed it, and nothing broke here. The rubric gap in
section 6 above is a defect in a governing document, which R-127 and
`DOCTRINE-TRIAGE` both route to a report and a ruling.
