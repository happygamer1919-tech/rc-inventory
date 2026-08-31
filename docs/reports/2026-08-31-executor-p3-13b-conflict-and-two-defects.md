# EXECUTOR - run 20260831-070000 - P3-13b: conflict resolved, two more defects found

**Role:** EXECUTOR (unattended scheduled run)
**Run id:** 20260831-070000
**Worktree:** /Users/ivan/rc-inventory-poc-run, detached at origin/main e6fdceb
**Wall clock:** started 2026-08-31T11:00Z, cap 45 minutes

## 1. Boot

Phase 2 board: shipped 36, todo 13, blocked 2, in_flight 1, halted 0. Launch
gate 6/9, with G4, G7 and G9 failing.

Phase 3 board, which is the board every run since 2026-08-30 has worked:
shipped 12, todo 17, blocked 3, in_flight 0, halted 0. Launch gate 0/9.

Claims held at boot: AUT-10 by `harness` since 09:00:42Z, live, off limits.
P3-13 by `executor` since 05:03:02Z, expiring 11:03Z, on a card already shipped.

Next eligible card: **P3-13b**. It was the lowest-id eligible card on the phase 3
board and it already had a branch and a pull request from the previous run.

## 2. One card touched: P3-13b

**Status at boot:** in_flight on the branch, todo on main, PR #133 open and
**CONFLICTING** with main.

### 2a. The conflict, and why it mattered more than it looked

The conflict was a single scalar: `as_of` on the phase 3 board, 08:37:51Z on the
branch against 08:02:41Z on main. Resolved locally in the working tree per
R-052, never in the web editor, to the commit moment 11:06:00Z. Both board
validators and `npm run check:conflict-residue` were run BEFORE the commit and
all passed. Commit `328d886`.

**The conflict was not cosmetic.** CLAUDE.md section 3 says it in terms: a pull
request that conflicts with main triggers zero workflows. The previous run's last
commit, `f377fb9`, fixed the missing diacritic on the Ciorna label and pushed it,
and **nothing ever ran against it**. The card's own notes recorded 8 of 11
acceptance cases failing, and that record was already one commit out of date when
this run read it.

### 2b. Two defects found by reading the failure

The failing run was 33372047906, on sha 1effea5. Read case by case rather than
re-run blind.

**Defect 1, the totals.** `deviz-subtotal`, `deviz-adaos` and `deviz-total`
carried `data-testid` on the `<tr>` and `data-value-mdl` on the `<Td>` inside it.
`getAttribute` does not descend into children, so the spec read null,
`Number(null)` is 0, and the failure printed `Expected: 770, Received: 0` - which
reads as an arithmetic error and is a selector error. Test id and value now sit
on the same cell, as they already did on `deviz-row-total`.

**Defect 2, the embedded product.** Six cases failed with `element(s) not found`
on `deviz-line-quoted-TEST-DEVIZ-01`, `deviz-line-unit-TEST-DEVIZ-01` and their
siblings, while `deviz-line` rows existed and were the right number. Every one of
those test ids is built from `l.sku`, and `sku` came from
`row.products?.sku ?? "-"` on a two-level embed. If that embed arrives as a
one-element array instead of an object, every field goes missing silently, sku
becomes a dash, and each test id changes name rather than disappearing.
Normalised in one function.

**This second one is a hypothesis with a mechanism, not a confirmed cause**, and
the report says so rather than claiming a fix it has not seen pass. It is the
only mechanism by which a resolvable foreign key embed yields undefined fields
while the rows themselves render. The `quality` run on the new head sha decides
it.

Commit `7d6374d`. `npx tsc --noEmit` exits 0.

### 2c. The card did not ship, and that is the correct outcome

**The named acceptance has not passed.** It needs the local Supabase stack that
only the `quality` workflow starts, and the run for head sha `7d6374d` was still
in flight when this run's wall clock cap arrived. Per CLAUDE.md section 6 the
card stays `in_flight` and PR #133 stays open.

This is **attempt 2 of 3** against the failure ceiling in section 10. Attempt 1
was the diacritic fix in the previous run. One attempt remains before the card
halts.

## 3. Escalations

None requiring Ivan. No card question was raised, no default was consumed that
the board did not already cover, and no migration was applied.

**Reported, not escalated:** two other pull requests are open and neither is
this run's card.

- **#134**, `triage/20260831-040003`, TRIAGE rulings R-075 to R-081. `quality`
  is **green on its head sha b010e9c** and it is MERGEABLE, merely behind main.
  It is a TRIAGE pull request, not an EXECUTOR one, and merging another role's
  work is not this card's scope. It is exactly the leftover that card RST-02 on
  the phase 2 board exists to sweep.
- **#130**, `card/p3-13-learnings`, the P3-13 learnings addendum. `quality` is
  **red** on its head sha 5631e6e. Not diagnosed this run.

## 4. What the next run picks up first

1. **Read the `quality` run for `card/p3-13b` head sha `7d6374d`.** If the deviz
   spec is green, flip P3-13b to shipped with that run as evidence and merge
   #133. If it is red, that is attempt 3 of 3 and the failure ceiling is one
   attempt away.
2. **#134.** Green on its own sha and sitting outside main. Either merge it under
   R-059 or work RST-02, which is the card for exactly this.
3. **#130.** Red `quality`, needs a diagnosis.

After P3-13b the next eligible phase 3 cards are P3-14, P3-15, P3-16 and P3-17.
AUT-10 stays off limits until its harness claim expires at 15:00:42Z.
