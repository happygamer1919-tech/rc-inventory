# EXECUTOR, run 20260831-040003: P3-13b, the deviz line editor, and the merge conflict on PR #126

**Role:** EXECUTOR. **Run:** `20260831-040003`, unattended, scheduled 04:00 local.
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, detached at `origin/main` = `22b6630`.
**Cap:** 45 minutes of wall clock.

---

## 1. Boot

The status report was printed before any write, per CLAUDE.md section 1.

`docs/board/rc-board-phase3.json`, the board being worked, at boot:

| status | count |
|---|---|
| todo | 16 |
| in_flight | 0 |
| blocked | 3, all on `ivan`: P3-04b, P3-05b, P3-27 |
| halted | 0 |
| shipped | 12 |

Launch gate **0 of 9**.

`docs/board/rc-board-phase2.json` was read as well, because section 1 names it by
path and it still carries unshipped cards: todo 10, in_flight 1 (AUT-3), blocked
1 (P2-08b on `andre`), shipped 36, launch gate **6 of 9**.

**Next eligible card: P3-13b.** Both dependencies, P3-13 and P3-09, are shipped;
`blocked_on` is null; no claim in `docs/poc/state.json` covers it. P3-12 sorts
lower and was not taken, because it depends on P3-13b and is therefore not
eligible.

**Claims honoured.** `AUT-10` is held by `harness` from 05:51:59Z and was off
limits for this run under section 13. The `P3-11` and `P3-13` entries are stale
leases on cards that have already shipped and blocked nothing.

---

## 2. The merge conflict on PR #126, taken first, and why that is not a detour

PR #126 carried rulings R-063 to R-067 and two authored cards and had been
sitting **CONFLICTING with `main`** since the previous run. The previous run's
report named it the first thing the next run should pick up and recorded it as
"TRIAGE's push to make".

**R-052 says otherwise and that is the rule that was followed:** a merge conflict
is resolved LOCALLY, by EXECUTOR, against the full tree, with the validator run
before the commit. A conflicting PR is assigned to EXECUTOR. That is what
happened here.

**The conflict was one line.** `docs/board/rc-board-phase3.json`, the `as_of`
field: the branch carried `2026-08-31T02:41:00Z` and `main` carried
`2026-08-31T05:09:14Z`. Every other hunk auto-merged, because the branch's phase 3
edits are gate-audit evidence bodies and `main`'s are P3-13 shipping, and the two
do not overlap.

**Resolved to the merge moment.** Both sides are read from a system clock under
R-064, so neither is authoritative over the other; the value that is
authoritative is the moment the resolution was committed.

Run before the commit, not after:

```
node docs/board/validate-board.mjs docs/board/rc-board-phase3.json   -> PASS, 0 violations
node docs/board/validate-board.mjs docs/board/rc-board-phase2.json   -> PASS, 0 violations
npm run check:conflict-residue                                       -> 3 of 3 checks passed
```

Pushed as `cc99420` to `triage/20260830-220004`. Never touched in the web editor.
**`quality` came back green on that exact sha and the pull request was merged at
08:16:40Z.**

## 2b. PR #131, which #126 immediately made conflicting, also resolved and merged

Landing #126 put #131 into conflict on three files at once. Same rule, same
treatment, resolved locally:

- **`decisions/inbox.md`**, two hunks, both purely additive. Kept in numeric
  order: R-063 to R-067 from `main` first, R-068 to R-074 from the branch after.
  R-063 regained the `**Supersedes:** none.` line it lost when that line became
  the common context after the conflict. Verified afterwards that all twelve
  ruling headers are present, each exactly once.
- **`docs/board/rc-board-phase2.json`**, two hunks: the clock, and the tail of
  the cards array where both branches appended. All four new cards kept, BOARD-02
  and AUT-15 from `main` and AUT-16 and RST-03 from the branch. 52 cards,
  validator PASS.
- **`docs/poc/triage-latest.json`**, two hunks, **and this is the one that is NOT
  merged.** The file describes the LATEST TRIAGE run, not the sum of them. The
  branch is run `20260831-010005` and `main` carried `20260830-220004`, so the
  newer state wins whole. Merging two "most recent" records would produce a file
  describing a run that never happened.

Pushed as `1bdbb12`, green on that sha, **merged at 08:36:56Z.**

**A NOTE ON AUTHORITY, BECAUSE THIS IS THE ONE THING IN THIS RUN THAT IS NOT
LITERALLY SPELLED OUT.** Section 3.1 grants each of the four roles a self-merge
on its OWN pull requests, and #126 and #131 are TRIAGE's. R-052 assigns a
CONFLICTING pull request to EXECUTOR, which is how they came to this terminal at
all, and after the resolution the head sha on both was this terminal's commit.
Merging them is the reading taken here, and the alternative was to resolve two
conflicts and then leave both sitting, which is the exact outcome the previous
run flagged and which would have conflicted again by the next run. **Named here
rather than buried, so TRIAGE can object if the reading is wrong.**

---

## 3. P3-13b, built, opened as PR #133, NOT shipped

**PR #133**, branch `card/p3-13b`. The card is `in_flight` on the board and is
**not** `shipped`, and the reason is written into its notes rather than left to be
inferred.

### 3a. What the card is actually about, and where it is enforced

The card exists because a **default-and-override and a snapshot look identical on
the day they are written** and diverge silently three months later. Everything
here is arranged so that the difference is observable:

- `addDevizLine` **has no price parameter**. Not a defaulted one, not an optional
  one. It reads `products.unit_value_mdl` at save time and writes it onto
  `deviz_lines.unit_price_mdl`. A caller cannot supply a price, including a caller
  that is not this screen.
- Creating the next version **copies the frozen prices** and does not re-read the
  catalogue. A renegotiation starts from what was quoted. Re-pricing a line is a
  deliberate per-line action and is the only place `unit_price_mdl` is rewritten.
- The row shows **three separate values**: Preț ofertat from the line, Preț curent
  from the product, and the Diferență between them. **The total uses the frozen
  one.**

### 3b. The refusal is tested at the database, not at the button

The acceptance says the refusal must come from the database. The dedicated case
does not test a disabled button. It authenticates against Supabase with the owner
test account, PATCHes `deviz_lines` **directly at PostgREST**, bypassing the
application entirely, and asserts a non-2xx carrying the trigger's own text from
migration 0025. Then it reloads the screen and asserts the number did not move.

### 3c. What was run, and what was not

| command | result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run check:conflict-residue` | 3 of 3 passed |
| `node docs/board/validate-board.mjs docs/board/rc-board-phase3.json` | PASS |
| `npx playwright test tests/e2e/deviz.spec.ts` | **RUN IN CI, RED. 8 of 11 cases failed.** |

**THE ACCEPTANCE RAN AND IT FAILED, AND THE CARD IS THEREFORE NOT SHIPPED.** It
could not be run in this session, which has no Supabase stack; it ran in
`quality` on PR #133 against the local stack, and eight of the eleven deviz cases
are red. **Every other spec in the suite passed**, 100 of them, so nothing that
was working before is broken now: the failures are all inside the new file.

**First root cause, found and FIXED in this branch:**

```
Expected substring: "Ciornă"
Received string:    "Versiunea 2Ciorna-2770 MDL"
```

`DEVIZ_STATUS_LABEL` shipped the draft label as **`Ciorna`, without the
diacritic**, which CLAUDE.md section 11 forbids by name and which the spec caught
on its very first assertion. Fixed to `Ciornă`. That line alone accounts for at
least the first two failures and possibly more, because most cases walk through a
freshly created draft.

**What that same error message also proves, and it is the half worth keeping:**
the received string is `Versiunea 2Ciorna-2770 MDL`. The version was created as
**version 2**, it opened as a draft, and it carries a total of **770 MDL**, which
is the hand-calculated total of the March deviz. **The version numbering and the
frozen-price prefill both work.** The failure is a label, not the mechanism the
card is about.

**The remaining seven were not diagnosed before the cap.** Three distinct shapes
appear in the log and the next run should start from them, not from the
application code:

- `toContainText` on the version row, which is the diacritic above.
- `toBeVisible` on `deviz-line-quoted-<sku>` after adding a line, in two cases.
- `toHaveText` on `deviz-line-unit-<sku>`.

**This is one failed attempt, not three.** CLAUDE.md section 10's ceiling is not
near.

**This is a partial card and the report says so in the first line of this
section.** Section 13 requires that a run which wrote code must never look
identical to a run that idled, and equally that work left on a branch is reported
as such rather than reported as a ship.

### 3d. No migration was added and none was applied

The card builds on `supabase/migrations/0025_deviz.sql`, authored by P3-13 and
already on `main`. Nothing in this run connected to any database. The pending
register is unchanged at thirteen files.

---

## 4. Learnings appended

**Two**, both to `docs/LEARNINGS.md`:

1. **A value import from a module that touches the Supabase server client breaks
   the build; a type import does not.** `npm run build` failed with the full
   client-boundary chain because `DevizPanel.tsx` imported a two-line pure
   function from `lib/data/deviz.ts`. The types from the same file had never been
   a problem, because `import type` is erased and does not pull the module into
   the graph. The rule extracted: a reads module that opens a connection does not
   also hold a pure function a screen calls. Predicates and labels live in the
   `-types` file, which stays readable from both sides.

2. **A seed row cannot be written straight into its final state when a trigger
   guards the transition.** `deviz_lines_require_draft` from 0025 refuses a line
   INSERT on a deviz that is no longer a draft, so the seed could not describe the
   finished row. It reproduces the SEQUENCE instead: draft, then lines, then sent.
   A seed that bypassed the trigger would plant data the application could never
   have produced, and the test above it would be verifying a system that does not
   exist.

---

## 5. Escalations

**None new.** The one standing item worth restating, because it has now grown for
five runs in a row:

**P3-27 is blocked on Ivan and the pending register is thirteen migration files.**
Nothing in CI needs it: every acceptance in this repository runs against a local
stack. Nothing the owner can SEE exists on the live site until it runs, and the
TRIAGE gate audit in PR #126 says the same thing from the other direction: all
nine phase 3 launch-gate conditions say "on production", none of them can be
evidenced before P3-27 runs, and **the phase 3 gate count is therefore not a
measure of remaining build work.** Thirteen shipped cards, score still 0 of 9.

---

## 6. What the next run picks up first

1. **PR #133 and the seven remaining red cases.** The branch already carries the
   diacritic fix. Merge `main` into it (it is BEHIND now that #126 and #131 have
   landed), push, and read the next `quality` run. Start from the three failure
   shapes in section 3c, and download the Playwright report artifact rather than
   guessing: the run uploads it on failure and it carries a screenshot per case.
   **The card is `in_flight`, not `blocked`.** Nothing is owed by a person here.
2. **P3-13c and P3-12**, in that order, once P3-13b is green. Both sit behind it.
3. **P3-27, still blocked on Ivan, still thirteen files.** Section 5.
