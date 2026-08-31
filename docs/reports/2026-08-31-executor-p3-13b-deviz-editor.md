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
| `npx playwright test tests/e2e/deviz.spec.ts` | **NOT RUN** |

**The acceptance spec was not run in this session and the card is therefore not
shipped.** It needs the local Supabase stack that only the `quality` workflow
starts. This is CLAUDE.md section 6 applied as written: no acceptance, no ship.
It runs in `quality` on PR #133, and the card flips on that green.

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

1. **PR #133.** If `quality` is green, the deviz spec passed, and the card ships:
   flip P3-13b to `shipped` with the run as evidence and merge. If it is red, the
   spec is the thing to read first, not the application code. The most likely
   failure is a selector, because the panel was written and the spec was written
   against it in the same session with no stack to run either against.
2. **PR #131**, TRIAGE's second rulings pull request, R-068 to R-074. It is green
   but BEHIND, and `main` is a protected branch with `strict` set, so it needs
   `main` merged into it and a fresh `quality` run. It could not be updated in
   this run without first landing #126, whose files it overlaps.
3. **P3-13c and P3-12**, in that order, both of which P3-13b unblocks.
