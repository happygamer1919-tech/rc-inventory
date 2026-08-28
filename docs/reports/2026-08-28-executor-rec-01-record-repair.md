# EXECUTOR: REC-01, committing the record that two dispatches assumed existed

**Date:** 2026-08-28 (UTC)
**Role:** EXECUTOR
**Card:** REC-01, authored in this PR
**Base:** `origin/main` at `d66a28e`
**Scope:** documents and board only. No application code, no migration, and
**no database connection was opened at any point.**

---

## 0. Boot

39 cards after this PR: 29 shipped, 6 todo, 3 blocked, 1 in_flight. Launch gate
6 of 9, unchanged. Next eligible card by lexical id: AUT-10, then AUT-8, AUT-9.
This card was dispatched rather than taken off the queue.

---

## 1. What was asked, and what happened

| Step | Outcome |
|---|---|
| 1. R-047, ledger execution under assertion | DONE |
| 2. Amend CLAUDE.md 8.6 to match | DONE, with the original wording intact for scripts without assertions |
| 3. R-048, P2-15 accepted with one ratified deviation | DONE |
| 4. Board: P2-15 to shipped, grids verbatim, owner's run report | DONE |
| 5. Verify, then close PR #83 unmerged | **Verifications PASSED. Action not performed and not performable.** Section 5 |
| 6. This report | DONE |

---

## 2. The failure this repairs is one the repository already named

`decisions/inbox.md` opens with its own rule: "An answer that is not in this
file is not a ruling. A verbal yes that was never pasted here does not exist,
because the next session cannot see it."

That was written about answers. **The same thing happened to a run.** Ivan
executed `scripts/reset-test-data.sql` against the client's database on
2026-08-28, read the grids, committed, and the outcome was ratified in the
strategy chat. None of it reached this repository.

**The cost was paid twice in one day, by two later dispatches written against a
record that did not exist.** The RST-01 dispatch stated that P2-15 had run and
that the grids were "in the P2-15 evidence on the board"; the card carried
`evidence: null` and `status: blocked`. That terminal verified before building,
found the premise absent, completed the buildable work and refused the
destructive step. **That refusal was correct and this card does not overturn
it.** It removes the condition that made it necessary.

CLAUDE.md 9b says the same thing about reports, for the same reason: "A report
that exists only in a terminal is a report the next session cannot read." The
rule was already in this repository twice. What was missing was applying it to a
thing that was neither an answer nor a report.

---

## 3. R-047, and why the permission attaches to the file

The reason a terminal could not run a destructive script was never that
terminals are careless. It was that the old file's safety depended on **a human
reading a grid at the end of a long transaction, having been told in advance
what the numbers should be.**

**This very run is the demonstration.** One number was not what the operator had
been told to expect. `POST categories TEST-` returned 1 against an acceptance
line of 0, and the run committed anyway. It committed *correctly*, for the
reasons R-048 records. But "the operator judged it correctly this time" is not a
control, and it would read identically in the case where the judgement was
wrong.

So R-047 attaches the permission to **a property of the file**, not to a person,
a card or a session. Four conditions, all of them: explicit transaction;
assertions evaluated in SQL inside it, after the mutations and before the commit;
commit only on all-pass, otherwise roll back and exit non-zero; and **the
terminal never chooses.** A script that cannot commit a wrong outcome is safer in
a terminal's hands than a script that can is in anyone's.

**What was deliberately not weakened.** CLAUDE.md 8.6's "No exceptions, no
judgement call, no 'it is obviously safe here'" survives **verbatim** and still
governs every migration and every script without embedded assertions, which is
every script in this repository except one. Migrations are explicitly out of
scope. The grant dies three ways and the first that happens ends it: P2-13
revokes it with section 8, first real client data ends it regardless of P2-13,
and it reaches the phase 2 database only.

**The conflict with R-044 is real and is stated rather than smoothed.** R-044,
ruled the same day, records that P2-13 "takes away, permanently, the ability of
ANY terminal to open a database connection", and adds P2-19 to P2-13's
`depends_on` on exactly that reasoning. R-047 opens a connection R-044 describes
as closed. **R-047 supersedes R-044 for assertion-bearing scripts only, and only
in the window before P2-13.** R-044's capability edge, its ordering argument and
its account of the end state are untouched and still correct. The two rulings do
not disagree about where this ends.

---

## 4. The grids were checked, not just transcribed

The grids in `docs/reports/2026-08-28-owner-p2-15-reset-run.md` and in P2-15's
`evidence.ref` are the owner's, verbatim. What a terminal added is arithmetic
that a reader can redo without trusting anyone's memory. Three checks, all pass.

**4.1 The eleven DELETE counts sum to 1,221.**
`358 + 0 + 0 + 131 + 36 + 179 + 36 + 179 + 0 + 302 + 0 = 1221`.
That figure was quoted independently, in a different dispatch, before this
record was written. It was not derived from these grids and it agrees with them.

**4.2 Ten of the eleven deletes consumed their PRE count exactly, and the
eleventh is the deviation.**

| table | PRE | DELETED | verdict |
|---|---|---|---|
| `status_history` | 358 | 358 | consumed exactly |
| `extraction_draft_lines` | 0 | 0 | consumed exactly |
| `extraction_drafts` | 0 | 0 | consumed exactly |
| `batches` | 131 | 131 | consumed exactly |
| `outbound_lines` | 36 | 36 | consumed exactly |
| `order_lines` | 179 | 179 | consumed exactly |
| `outbound_issues` | 36 | 36 | consumed exactly |
| `inbound_orders` | 179 | 179 | consumed exactly |
| `reminders` | 0 | 0 | consumed exactly |
| `products` | 302 | 302 | consumed exactly |
| `categories` | 1 | 0 | **1 left, the ratified deviation** |

The one row that fails the consumption rule is the one row R-048 ratifies.
**There is no second anomaly hiding in the grids**, which is the thing worth
knowing about a record written after the fact.

**4.3 The product arithmetic closes.** `PRE products` 302, all of it
`products TEST- sku` with `products EXT- 0`; 302 deleted; `POST products
remaining` 3 with `POST products TEST- 0`, so no survivor carries the marker.
The three survivors are the CRITIC-RACE rows the pre-RST-01 selector never
matched.

**4.4 The deviation is the schema working, not the file failing.**
`products.category_id` is `NOT NULL` and `ON DELETE RESTRICT` and is the only
reference to `categories` in the schema. The category delete carries
`and not exists (... p.category_id = c.id)` deliberately, so a category still in
use is **skipped rather than raising an error that rolls the whole file back**.
The real finding is a **reporting** defect: the pre-check counted categories
matching the marker, the delete counted that minus the ones still referenced, so
a skip could never appear as a discrepancy the pre-check had predicted. Nothing
wrong was deleted and nothing wrong survived. RST-01, merged as `f8e9078`,
resolves the category set once before the deletes and asserts both halves of the
rule.

---

## 5. Step 5: both verifications passed, and the action was still moot

The dispatch said: "PR #83 is open on GitHub and its tree is on main: c97e48e
landed the identical tree as an ordinary fast-forward commit rather than a PR
merge, which is why the record is stale."

**The two named verifications, which were the halt condition, both passed:**

```
R-039..R-046 in decisions/inbox.md on main   -> present, exactly one each
docs/reports/2026-08-28-triage-first-unassisted-pass.md on main
                                             -> present, blob 89b5cd5, 21142 bytes
```

**The premise behind the action did not survive contact.**

```
gh pr view 83 --json state,mergedAt,mergeCommit
{"state":"MERGED","mergedAt":"2026-08-28T16:43:06Z","mergeCommit":"c97e48e..."}
```

**PR #83 is MERGED, and GitHub names `c97e48e` as #83's own merge commit.** It
was squash-merged. A squash merge produces a single-parent commit, which is why
`git log` shows `c97e48e parents=7a3fffb` and why it can look like an ordinary
fast-forward. It is not one, and the record was never stale.

**So nothing was done to #83.** A merged pull request cannot be closed unmerged;
the operation does not exist. And there was no stale record to repair, which was
the whole reason the step was asked for.

**This is not a halt.** The halt clause was scoped to the two verifications
failing ("If either fails, do not close it, report and halt"). Neither failed.
The card's other five steps were unaffected, so they were completed and this step
is reported as inapplicable. Halting the card over an action that was already in
its desired end state would have left R-047, R-048 and the P2-15 record
uncommitted for a second day, which is the exact failure REC-01 exists to fix.

---

## 6. Three dispatches, three absent premises, and the pattern

Worth naming rather than absorbing. Across this session's three cards, every
dispatch carried at least one premise the repository did not support, and **every
one of them was of the same kind: something had happened, and the record of it
had not been committed.**

| dispatch | premise | reality |
|---|---|---|
| land #83 | branch is CONFLICTING, 7 behind | already merged into by a broken resolution nobody validated; the board JSON did not parse |
| RST-01 | P2-15 ran, grids are in its board evidence; a "ledger execution ruling" authorises the run | P2-15 `blocked`, `evidence: null`; no such ruling in the inbox, which ended at R-046 |
| REC-01 | PR #83 is open, c97e48e bypassed it | #83 MERGED, c97e48e is its own squash-merge commit |

In every case the run happened; only the record was missing. Verifying before
building caught all three at no cost, and in the RST-01 case it was the
difference between refusing an irreversible delete and performing one on a false
premise.

The rule that covers this is already in the repository twice, in the inbox
preamble and in CLAUDE.md 9b, and it is the same sentence both times: **if it is
not committed, the next session cannot see it, and the next session is where the
cost lands.** R-047 and this card are the first time it has been applied to a
run rather than to an answer or a report.

---

## 7. What a reader should carry forward

**P2-15 is shipped.** 1,221 rows gone from the client's project. `/inventar`, the
screen G9 asks Mihai to complete a cycle on, no longer opens on a catalogue of
`TEST-DASH-` rows. P2-13's dependency on P2-15 is satisfied; P2-13 stays behind
P2-08b and P2-19.

**Three `CRITIC-RACE` products and one `TEST-` category are still there.**
Removing them is RST-01's run, `blocked_on: ivan`. **Under R-047 a terminal may
now perform it**, because the corrected file asserts its own outcome and commits
only on all-pass. That is the one thing on this board that changed status without
anything being executed.

**No launch gate moved.** 6 of 9, and none of the three open gates has a clause a
terminal can close.
