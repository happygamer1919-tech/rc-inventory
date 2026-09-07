# EXECUTOR, 2026-09-07: GATE-03, and the board in order

Role: **EXECUTOR**. Boot per `CLAUDE.md`. Working narrative, written as the
session goes.

---

## 1. Verification, before anything was touched

Nothing in the dispatch was taken as fact. Every number below was read from the
files at one sha.

| | |
|---|---|
| `origin/main` | **`5bbc852b51c6871769e3e432c99360219448ad7c`** (`5bbc852`, "POC: run 20260907-040001 state (#246)") |
| open pull requests | **12** |

Four commits landed since the previous session's tip `2f0878d`: `1d90ca7`
(EXT-10) and three POC run-state merges.

### Boards, exactly as the files state them

| board | `as_of` | cards | launch gate |
|---|---|---|---|
| `rc-board.json` | 2026-08-27T18:40:00Z | 13: **shipped 13** | **9 / 9** (`readiness_passed: 9`, 9 pass) |
| `rc-board-phase2.json` | 2026-09-07T00:35:25Z | 81: **shipped 64, todo 13, blocked 3, in_flight 1** | **6 / 9** (`readiness_passed: 6`, 6 pass, 3 fail) |
| `rc-board-phase3.json` | 2026-09-07T02:10:21Z | 72: **shipped 40, todo 32** | **0 / 9** (`readiness_passed: 0`, 9 fail) |

`node docs/board/validate-board.mjs` over all three: **PASS, 0 violations**.

### The next eligible gate card, as the board computes it

Two answers, and they differ by which board set is read. Both are reported
rather than one being chosen silently:

- **`docs/board/rc-board-phase2.json` alone: `GATE-03`.** The eligible list
  begins `GATE-03,LEARN-01,MIG-02,...`
- **The board set from `scripts/poc/boards.mjs`, which reads phase 3 first:
  `GATE-01`.** The list begins `EXT-11,EXT-12,EXT-13,EXT-21,GATE-01,GATE-02,...`
  before reaching the phase 2 lane.

The dispatch names GATE-03 for step 2, which resolves it. `GATE-01` and
`GATE-02` are both `todo`, unblocked, with empty `depends_on`, on phase 3.

### Nothing disagreed

The stop condition was checked and not met. Cross-checks run:

- No open pull request carries a card the board already calls `shipped`. #240
  works `EXT-11`, which is `todo` on `main`, which is correct for work in flight.
  #237 is an EXT-10 follow-up branch, not a card id.
- All three board files parse and validate.
- The three board `as_of` values are each behind the commit that wrote them
  (`check:board-clock` passes).

---

## 2. GATE-03

### Is its acceptance machine-checkable as written? Yes.

The card's acceptance has three clauses. Clause 3 offers an alternative
(`OR ... a written statement in the PR of why`) which would not be
machine-checkable, but the card's own defaults settle which branch to take:
**"THE CHECK IS THE PREFERRED HALF AND THE BOARD EDIT IS THE FLOOR."** The check
branch was built, so all three clauses are commands or artefact assertions a
command can make.

### The card's stated verification had gone false

Its notes read:

> *"Verified on main before authoring: P2-13's card carries no occurrence of the
> string R-082 anywhere in any field, and CLAUDE.md 8.7's checklist covers it only
> through the blanket phrase 'reverting section 8 to Ivan-only applies'."*

**The first half was true on 2026-09-02** when the card was authored in
`186387b`. **It stopped being true on 2026-09-04**, when `6b2d06d` merged a
TRIAGE rulings pull request cut two days earlier and R-095 added a box to P2-13's
acceptance naming R-082 in almost this card's own words. The card then sat
eligible for three days asking for work already done.

The second half is **still true**, and it is why the check was worth building.

The note is quoted on the card under CLAUDE.md 9c with the date it stopped being
true and the commit that ended it. Nothing was deleted.

### The check reads an edge rather than guessing at prose

A ruling that says in its own text which card revokes it **has already declared
itself a grant**. So the check never has to decide what a grant is; it asserts
that the named card's acceptance names the ruling back.

R-082 pointed at P2-13. P2-13 did not point back. That asymmetry is the defect.

**The alternative was tried and rejected**, which the acceptance explicitly
invites. Detecting a capability grant from its prose, over `is authorized`,
`grant`, `permission`, `may apply`, `self-merge`, matched **36 of 129** rulings,
most of them gate audits that merely discuss a grant. A check whose exception
table is thirty entries long is a table, not a check. The declared-edge test
matches **10** and needs **3** exceptions, each with its reason written next to
it: R-024 (a resequencing), R-101 and R-126 (gate audits, and R-126's matched
sentence is a negation).

### It found six unnamed grants, not one

`R-082` was the **only** id P2-13's acceptance carried. Five more say in their own
text that they end at P2-13 and none of them was named:

| ruling | the grant |
|---|---|
| R-001 | the migration-apply delegation to EXECUTOR |
| R-007 | the one-shot read of the secrets file for migration 0006 |
| R-047 | executing a DELETE-class script that proves its own outcome |
| R-049 | the original self-merge grant |
| R-056 | its extension to AUTHOR |
| R-059 | its widening to every path, for four roles |

`CLAUDE.md` 8.7 names R-049, R-056 and R-059 in prose. P2-13's acceptance, which
is the field a rotation is actually run against, named none of them.

Each now has its own tickable box with what it confirms written out. **R-007's
box says explicitly that it confirms a narrower window already closed** rather
than performing a revocation, because R-007's own text expires it the moment
migration 0006 was journalled.

### The detector missed R-059 on its first pass

R-059 is written *"Revoked with every other terminal grant **at** P2-13"*, and
the first three patterns read only `REVOKED BY` and `expires at`. **The check
built to find grants covered by an unenumerated phrase was itself letting one
through on an unenumerated phrase.** Found by reading R-059 while classifying the
hits by hand, not by the check reporting anything. A fourth pattern was added and
case 3 of the proof is that exact wording.

### Proofs

```
npm run check:grant-revocation   OK, 7 declared grants each named, 3 judged not a grant
npm run prove:grant-revocation   23 of 23, exit 0
```

Nine proof sections: the defect reconstructed and refused; the control accepted;
R-059's wording detected; an undeclared new hit refused rather than guessed at; a
stale `NOT_A_GRANT` entry refused; **the runbook counted as a checklist the day it
exists**, which is the forward path for when P2-13 is worked; a grant whose
revoking card is on no board refused; four fail-closed cases; and the live
repository accepted at 7 of 7.

**What it does not catch is in its own header**: a grant that never names a
revoking card is invisible to it, because it reads an edge and an edge needs one
end to exist.

### Nothing was rotated or revoked

The card edits a **checklist**, which is a forward-looking instrument. No ruling
was edited: R-082 and every other stands untouched, per the card's defaults. The
stale precondition line ending *"THIRTEEN FILES ARE PENDING TODAY"* was left as a
precondition and **not** converted into a statement of fact, also per the
defaults. P2-13 remains unworked.

---

## 3. Board in order: P3-13c, the comparison view

The dispatch's wave 3 priority is `P3-12`, deviz schema, line editor, comparison
view, necesar de materiale. Read against the board:

| dispatch item | card | state at boot |
|---|---|---|
| P3-12 | `P3-12` | **already shipped** |
| deviz schema | `P3-13` | **already shipped** |
| line editor | `P3-13b` | **already shipped** |
| **comparison view** | **`P3-13c`** | **todo, eligible** |
| necesar de materiale | `P3-18` | todo, depends on P3-13c |

So `P3-13c` was the first unshipped wave 3 item, and it shipped **independently
of P3-18**, which the dispatch required and which the card's own defaults state
in terms. Nothing in P3-18 was built or touched.

### Every premise verified before building, per the card's HALT clause

`deviz_lines.unit_price_mdl` (0025), `outbound_issues.project_id` (0017), the
`devize` version table, `project_material_cost` (0024), and the primitives and
side-panel vocabulary. Nothing was missing and nothing was invented.

### Nothing computed twice

The Estimat side is `getProjectDevizView`, the Emis side is
`getProjectMaterialCost`, both already existing.
`lib/reporting/deviz-comparison.ts` joins them and is the single place P3-18 will
read issued quantity from, which is what the card's defaults require. **No
migration was needed**: both sides existed and the join is a read.

### The place that could have silently dropped a Neprevazut, and its guard

`project_material_cost` truncates its per-product breakdown at `p_limit` while
computing the **total** from every line. A truncated call therefore renders a
short table under a correct foot, which is exactly the *flattering and useless*
comparison the card forbids. The reader asks for 2000 rows **and then asserts the
breakdown sums to the total**; when it does not, `truncated` is true and the
screen says the table is incomplete instead of pretending.

### The acceptance, run three times

```
npx playwright test tests/e2e/deviz-comparison.spec.ts
  9 passed (14.2s)
  9 passed (13.8s)
  9 passed (13.5s)
```

Three runs in a row, against a live local Supabase stack. The eighth case edits
the catalogue through the product screen and **puts it back**, so a spec that
passed once and failed afterwards would have been a spec that consumed its own
fixture.

The arithmetic was verified against the database **before** the spec was written:
`project_material_cost` returned exactly `4/480`, `8/200`, `6/180` and a total of
`860` for the main project, `0` for the project with no issues, and `3/120` plus
`7/70` totalling `190` for the unplanned-only project.

### One defect cost most of the build, and it was not in the arithmetic

All nine cases failed on `getByTestId('panel-comparatie') resolved to 2
elements`. `ProjectTabs` already wraps every tab body in a div whose testid is
**built as a template**, ``panel-${active}``, which is where `panel-deviz` and
`panel-consum` come from. My own wrapper made a second, nested, identical node.

Grepping for the literal `panel-comparatie` could never have found the
convention, **because the convention has no literal**. It was identified by
putting a `data-mark` attribute on the wrapper this component actually renders
and asking the DOM which of the two carried it: the outer one did not, so it was
not this component's. Both halves are in `docs/LEARNINGS.md`.

### Running the acceptance locally needed a second stack

`supabase/config.toml` wants ports 54321 and 54322 and **an rc-inventory stack
was already up on them**. Per the standing note about this collision, a scratch
copy of the tree was built outside the repository, its ports shifted to 55321 and
55322, and the stack brought up there. Neither repository's committed config was
edited. Two incidental obstacles are worth recording: Turbopack refuses a
`node_modules` symlink pointing outside the project root, so the scratch tree
needs a real (hard-linked) copy; and the main clone's own `node_modules` carries
a self-referential `node_modules/node_modules` symlink dated 2026-08-27, which
that copy inherits and which has to be removed **in the scratch copy only**. The
main clone was not touched.

---

## Deviations, for explicit ratification. Not self-ratified.

1. **The pull request depth.** The dispatch says *hold at three open PRs per
   AUT-23*. **Twelve were open at boot**, none of them mine: six harness state
   and report branches, four TRIAGE rulings branches, and two card branches from
   the overnight runs. Five are `DIRTY`, meaning they conflict with `main` and
   trigger no workflows at all. Holding the **total** at three would mean draining
   nine pull requests, four of which are rulings that are not mine to merge, and
   would leave the dispatch unexecutable. **The reading taken** is AUT-23's own:
   the threshold is a producer gate on the thing producing pull requests, so it
   caps **my own in-flight work at three**. In practice this session held at
   **one**, merging each card before opening the next. Flagged because the other
   reading is available and only the owner can choose it.

2. **GATE-03 touches P2-13's card.** Step 4 excludes working P2-13 or any card
   that revokes or rotates a credential. GATE-03's acceptance requires editing
   **P2-13's acceptance field**, which is a board edit to a checklist, not the
   execution of P2-13 and not a revocation of anything. Both instructions hold
   under that reading and under no other. Flagged as a boundary call.

3. **"Total deviz" in P3-13c's foot is the material subtotal, adaos excluded.**
   The card names four foot totals and does not say whether the deviz total
   includes the margin. It is the **subtotal**, because the Estimat column has to
   add up to its own foot and the adaos has no counterpart in the Emis column. The
   adaos is displayed beside the foot with a sentence naming it, so the Comparatie
   tab and the Deviz tab reconcile instead of appearing to contradict each other.
   That is one more **number** on screen, not a fifth total. Flagged because the
   other reading, the adaos-inclusive total, is available and would make the
   column not add up.

4. **Six ids added to P2-13's checklist, where the card names one.** GATE-03's
   title and ARTEFACT clause are about R-082. Its third clause asks for a check,
   and the check found six grants unnamed. A check that cannot be green is not a
   check, so all six were named. This is inside the card's own acceptance and
   outside its title. Flagged as scope the card implies but does not spell out.
