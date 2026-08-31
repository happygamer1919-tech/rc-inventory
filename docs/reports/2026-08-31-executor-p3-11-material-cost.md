# EXECUTOR: P3-11, material cost per project. One formula, one module, and a seed script because the form has no date field.

**Date:** 2026-08-31 (UTC), run `20260830-220004`
**Role:** EXECUTOR, unattended scheduled run
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, detached at `origin/main` `1eab1d4`
**Cards touched:** P3-11 (shipped), P3-27 (pending register updated), P3-04b and P3-05b (not taken, held by another actor)
**Pull requests:** #124 (claim, merged), #125 (P3-11)
**Migration files added:** `supabase/migrations/0024_project_material_cost.sql`

---

## 0. Boot

| board | shipped | in_flight | todo | blocked | halted | launch gate |
|---|---|---|---|---|---|---|
| `rc-board-phase2.json` | 36 | 1 | 10 | 1 | 0 | 6/9 |
| `rc-board-phase3.json` | 10 | 0 | 20 | 1 | 0 | 0/9 |

Next eligible card at boot: **P3-11**, after the skip recorded in section 1.

---

## 1. P3-04b and P3-05b were not taken, and the reason is a four second overlap

The lowest-id eligible cards on the phase 3 board were **P3-04b** and **P3-05b**,
the two drop cards that P3-10 unblocked last run. Both were skipped.

**PR #123 was opened at 02:00:00Z. This run started at 02:00:04Z.** That pull
request carries exactly those two cards, sets both to `blocked_on: ivan`, and
argues the same thing this run would have argued: the backfills they complete
have never met real rows, because no phase 3 migration has been applied and
`0017_outbound_project_id.sql` and `0019_suppliers.sql` are both still in the
pending register.

**The claims map in `docs/poc/state.json` was empty**, so the lease mechanism did
not catch this. It could not: a claim only protects a card once it is on `main`,
and #123 had existed for four seconds. What caught it was reading the open pull
request list before starting, which is worth doing for exactly this reason.

Taking either card would have produced a second board edit to the same two cards
in a second pull request, and whichever merged second would have conflicted.
Section 13 says a card another actor holds is skipped, logged, and left, so both
were.

**Nothing about that decision is a judgement on #123.** It reaches the same
conclusion this run would have, and **it merged as `942b6bf` while this run was
building P3-11.** The phase 3 board now carries both cards blocked on Ivan and
this branch merged that state in rather than around it.

---

## 2. P3-11, shipped in PR #125

> Material cost per project: issued quantity times unit value, totalled per
> project, broken down by product and by month.

Claimed as `executor` through **PR #124** before the work began, per section 13.
The claim was opened before the first line was written and merged while the work
was in progress; that is the honest sequence and it is recorded here rather than
implied, because a claim protects nothing until it is on `main`.

### What landed

- **`supabase/migrations/0024_project_material_cost.sql`.**
  `public.project_material_cost(uuid, boolean, integer)` and
  `public.unassigned_outbound_count()`, both `security invoker` so RLS applies
  unchanged.
- **`lib/reporting/material-cost.ts`**, the single module the card demands.
- **A fifth tab, Cost, on the project sheet**, beside Consum, Deviz, Documente
  and Istoric.
- **`scripts/seed-test-cost.mjs`** and its step in `quality.yml`.
- **`tests/e2e/project-cost.spec.ts`**, seven cases.

### The five decisions worth seeing

**The total and both breakdowns come out of one function.** They are computed
from one common table expression and returned as one set discriminated by
`row_kind`. The card says two implementations of one number is how two screens
come to disagree in front of a client, and two queries in one function is the
same defect one level down.

**Months bucket in Europe/Chisinau, and the test can tell.** The seed carries an
issue at `2026-07-31T21:30:00Z`, which is 1 August 00:30 in Chisinau and 31 July
in UTC. The spec asserts it reads `august 2026`. Without that one row the
timezone rule in the card defaults would be untested and untestable, because
every other row falls in the middle of its month where both rules agree.

**Issues with no project are excluded and said out loud, in every state.** The
seeded unassigned issue carries 10000 MDL, which is more than five times the
whole project total, so if it had leaked into any bucket the arithmetic would
have failed loudly rather than plausibly. The screen prints the count even when
it is zero: a partial total that does not say it is partial is worse than no
total.

**The screen carries its own limitation in Romanian.** `unit_value_mdl` is the
current catalogue value and no cost is snapshotted at issue time, so editing a
product price moves every historical total containing it. The footnote says
that. The real fix is a `unit_value_at_issue_mdl` column on `outbound_lines`,
written at issue time, and that is a schema change this card was not given. It
stays on the card notes where the AUTHOR put it, for Ivan.

**Deactivated products stay in history, and the seed proves it costs something.**
`TEST-COST-03` is inactive and carries 400 of the 1850 total. A report that
filtered on `active` would report 1450, which is a plausible number and a wrong
one, and that is the class of defect nobody notices.

### Why a seed script rather than the screen

The card asks for three issues across two months. **The issue form has no date
field**: `issued_at` is `now()`. Data built through the screen can only ever land
in the current month, so the month breakdown, which is half the card, could not
have been tested at all.

`scripts/seed-test-cost.mjs` follows the convention the two existing seed scripts
state in their own headers, to the letter: rows carry the `TEST` prefix, ids are
fixed rather than generated so a second run overwrites instead of doubling, and
**there is no DELETE anywhere in the file.** Line ids are derived from the issue
id and the line position for the same reason.

**The arithmetic is written in both the seed and the spec**, so either can be
checked by hand without opening the other:

| product | value | quantity | total |
|---|---|---|---|
| TEST-COST-01 | 100.00 | 6 | 600.00 |
| TEST-COST-02 | 250.00 | 2 | 500.00 |
| TEST-COST-03 | 40.00 | 10 | 400.00 |
| TEST-COST-04 | 10.00 | 35 | 350.00 |
| | | | **1850.00** |

| month | total |
|---|---|
| iunie 2026 | 1400.00 |
| iulie 2026 | 400.00 |
| august 2026 | 50.00 |
| | **1850.00** |

Shipped only: 1400.00.

---

## 3. The migration, and what was and was not done to a database

`supabase/migrations/0024_project_material_cost.sql` was **parsed with
`pgsql-parser` before it went anywhere**: 9 statements, `TransactionStmt`,
`CreateFunctionStmt`, `CommentStmt`, `GrantStmt`, `CreateFunctionStmt`,
`CommentStmt`, `GrantStmt`, `TransactionStmt`, `SelectStmt`. **No `DROP`, no
`TRUNCATE`, no `DELETE`.**

**It was not applied to any database by this run.** No connection was opened, no
secret was read, and nothing under `/Users/ivan/rc-secrets` was touched. The
apply is card **P3-27**, blocked on Ivan, and this run added `0024` to that
card's pending list and to the register in `docs/migrations/APPLY-LOG.md` in the
same pull request that adds the file, so it sits in exactly one of the two places
the header check enforces.

**No production write of any kind**, so no row in `docs/PRODUCTION-WRITES.md`.

---

## 4. Checks

| check | result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run check:conflict-residue` | 3 checks passed |
| `node docs/board/validate-board.mjs docs/board/rc-board-phase3.json` | PASS, 0 violations |
| `pgsql-parser` on 0024 | 9 statements, no forbidden statement |
| `npm run check:migrations` | not runnable here, Docker is absent on this machine; it runs in `quality` |
| em dash or en dash in any file this run touched | zero |
| merge conflict resolved locally, validator run before the commit | yes, one hunk, `as_of` only |
| secret staged | none, `git diff --cached` read and scanned |
| `npx playwright test tests/e2e/project-cost.spec.ts` | runs in `quality` on PR #125 |

---

## 4b. One conflict, and one thing about this board's clocks

Merging `origin/main` into `card/p3-11` after #123 and #124 landed produced
**exactly one conflicting hunk: the board's `as_of` line.** It was resolved
locally, against the full tree, with `validate-board.mjs` and
`check:conflict-residue` run before the commit, per R-052 and section 3. Both
parents were then verified card by card: P3-04b and P3-05b are `blocked` on
`ivan` with #123's text intact, and P3-11 is `shipped` with this run's evidence.

**Worth naming rather than silently following: the phase 3 board's timestamps run
about nine hours ahead of real UTC.** P3-10 shipped with `2026-08-31T10:40:00Z`
and #123 wrote `2026-08-31T11:30:00Z`, both while the real clock read shortly
after 02:00Z. This run wrote `2026-08-31T11:45:00Z` on `as_of`, on P3-11's
evidence and on both `last_checkpoint` fields, because the alternative was an
`as_of` that moves BACKWARDS by nine hours on a board whose whole purpose is to
say when it last told the truth. Following the convention keeps the ordering
honest and makes the offset a single, findable defect rather than a jagged
sequence. It is a board-wide correction and no card covers it, so it is recorded
here for whoever authors that card.

---

## 5. Learnings appended

**One**, appended to `docs/LEARNINGS.md`: a `union all` wrapped in a subquery so
an `ORDER BY` can see its columns takes its output column names from the FIRST
branch only, so that branch has to alias every column or the wrapper references
names that do not exist. Caught by reading, before the file reached the parser.

---

## 6. Escalations

**One**, appended to `docs/poc/state.json`: P3-04b and P3-05b were skipped
because PR #123, opened four seconds before this run started, held both. The
claims map was empty and could not have prevented the overlap, because a claim
does not protect a card until it merges. #123 has since merged.

**A second thing that is not an escalation but should not be lost:** the board
timestamp offset in section 4b. It needs an AUTHOR card, not an owner decision.

---

## 7. What the next run picks up first

1. **P3-13**, `public.devize` and `public.deviz_lines`. It is the lowest-id
   eligible card once the drops are blocked, it has no unmet dependencies, and
   P3-13b, P3-13c, P3-12 and P3-18 all sit behind it. It is the widest unblock
   left on this board. P3-04b and P3-05b are now blocked on Ivan and no longer
   sort ahead of it.
2. **P3-27 is still blocked on Ivan and the pending register is now twelve
   files.** Nothing in CI needs it, because every acceptance runs against the
   local stack, but nothing the owner can SEE exists on the live site until it
   runs. It is the oldest unanswered question on this board.
