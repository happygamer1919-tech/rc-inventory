# EXECUTOR, 2026-09-07: RULE-09, and checks that fire at the wrong moment

Role: **EXECUTOR**. Boot per `CLAUDE.md`, then the board.

Worktree `/Users/ivan/rc-inv-aut9`, cut from `origin/main` at `2b648a4`.

---

## Boot status report

| board | cards | shipped | todo | blocked | in_flight | launch gate |
|---|---|---|---|---|---|---|
| `rc-board-phase2.json` | 81 | 62 | 15 | 3 | 1 | **6 / 9** |
| `rc-board-phase3.json` | 72 | 39 | 33 | 0 | 0 | **0 / 9** |

Blocked on phase 2: P2-08b (andre), P2-14 (client), MIG-01 (ivan). In flight:
AUT-3.

**Next eligible card by the comparator: `FIXTURE-01`.** The dispatch directed
`RULE-09` first, ahead of it.

---

## 1. RULE-09. The allocator now gates authoring

`scripts/poc-free/check-open-branch-ids.mjs` gains `--free <ID>`, aliased as
`npm run id:free -- <ID>`. It is a **mode on the existing check**, not a second
scanner, which is what the card's defaults required and what avoids the
two-copies failure this repository has recorded four times.

Exit codes: **0** free, **1** claimed, **2** could not look. They propagate
through `npm run`, verified.

### The fixture is the state that actually existed

Reconstructed rather than invented, because the acceptance names it:

| source | writes | counter | board adds |
|---|---|---|---|
| `main` | R-001 to R-127 | R-128 | RULE-02 to RULE-06 |
| `triage-a` | R-128 to R-134 | R-135 | RULE-07 |
| `triage-b` | R-135 to R-141 | R-142 | RULE-08 |
| `poc-1`, `poc-2`, `poc-3` | **nothing** | R-128 | nothing |

### All six clauses, each with a mutant

```
7.  RULE-09: --free REFUSES AN ID TWO OPEN BRANCHES HAVE CONSUMED
  ok  R-128 is REFUSED on the 2026-09-06 state                              (a)
  ok    ...and triage-a is named, which wrote R-128                          (a)
  ok    ...and triage-b is named, whose counter consumed past it             (a)
  ok    ...and NOT one of the three branches that wrote nothing is named     (b)
  ok    ...and it names the lowest id that is actually free, R-142           (c)
  ok  R-142, which is genuinely free, is ACCEPTED                            (e)
  ok  an id inside a consumed range is refused too
7a. MUTANT: the high water ignores counters, so a consumed hole is offered
7b. MUTANT: card ids are not read, which is the state before this card       (d)
7c. MUTANT: an unreadable source is treated as empty instead of refused      (f)
7d. MUTANT: a source is dropped from the list, and the count assertion catches it
7e. MUTANT: the holdings report goes back to an equality test                (b)
7f. AN ID IT CANNOT READ IS REFUSED, NOT GUESSED AT

37 of 37 proofs passed
```

RULE-04's original eight assertions are sections 1 to 6, unchanged and still
passing. That is the assertion that the merge-time refusal was not weakened to
make room for the authoring-time answer.

### The counter note, which was a false green pointed at the wrong evidence

It was an **equality test**: `if (theirNext === nextHere)`. A branch that has
consumed R-128 through R-134 has a counter reading R-135, which is not equal to
R-128, so it produced **silence**, while three branches that had written nothing
and pointed at R-128 produced notes.

It now reports what each branch **holds**. On the live repository:

```
  holds: triage/20260905-010004 (#210) wrote R-135 ... R-141, counter R-142, so no id below R-142 is free
  holds: triage/20260904-220003 (#207) wrote R-128 ... R-134, counter R-135, so no id below R-135 is free
```

The three branches that hold nothing are not named. A branch whose counter cannot
be read is a **problem**, not a blank line, so silence here means nothing is
claimed and never that it could not look.

### The high-water rule, and why it is not a gap search

A ruling id is free only **at or above** the highest point any source has
reached, counting both what was written and what a counter says was consumed.
R-087 to R-095 are the reason, and this check's own header already named them: a
branch advanced its counter past them and never merged, so they are absent from
`main` and are still not free. Mutant 7a is the gap-filling answer, proved to
offer exactly such an id.

Card ids use a **different** rule on purpose. There is no counter for cards, so
"consumed" has no meaning: the only question is whether the exact id is in use
anywhere, and the lane's next free id is reported beside the verdict.

### Two defects in this card's own work, found by its own mutants

1. **The count assertion was a tautology.** It compared sources read against
   `sources.length`, a list the same bug builds. A mutant that dropped a branch
   while building it shrank both sides and the assertion held. It now counts
   against the **input**: `openBranches.length + 2`.
2. **A mutant whose edit half applied reported itself applied.** Two
   replacements, one anchor stale, file still differed from the original, mutant
   reported as working. The edit now asserts every anchor before making any
   replacement.

And the holdings report was reworded after its first version made a **false
accusation**: ranges measured from `main`'s counter overlap, so `triage-b` read
as having consumed R-128 to R-141, which are `triage-a`'s ids. It reports a
ceiling instead.

### `CLAUDE.md` 8b, amended in place under section 9c

Both false sentences are quoted rather than deleted: the two-step ruling
allocation that said the counter is the allocator, and the card-id paragraph
whose claim that "two cards authored at once already conflict" is true only of
two cards that merge into each other. The counter is **not** replaced, step 4 is
still the mechanism, and step 2 says of itself that it is advisory, because R-098
was swept correctly and collided anyway.

---

## 2. The same shape, and how far it goes

The dispatch asked for this and it is right: **the CLAUDE.md 2 ordering break on
DIG-01 is the counter defect again.**

`check-board-edit` gates the pull request. It reads `base..head` and asks, per
card id, whether that card's status changed to a finished status. It cannot see
**inside** the pull request, so the sentence it enforces is:

> "The PR that carries the card's code also carries the board edit for that card."

and the sentence it does not is the one four lines below it in the same section:

> "`todo` -> `in_flight` when work starts (**commit that flip first**, so the
> board never shows a card being worked as untouched)."

One is a property of a **diff**. The other is a property of an **order**. The
check was built for the first and reads the second's evidence as a single
before-and-after, which any commit order produces identically. That is why the
rule was broken an hour after the check for it was built, by the terminal that
built it: the check was green, and the thing it was green about was not the thing
being violated.

**It is the counter defect exactly.** The counter turns a collision into a merge
conflict, which is loud, at merge time; allocation happens hours earlier and
nothing looked. `check-board-edit` turns a missing board edit into a red check,
which is loud, at pull-request time; the ordering happens commit by commit and
nothing looks.

### Does the shape generalise? Surveyed, not guessed.

The shape is: **the subject is a moment or an order, the check is evaluated once
at a later moment, and only a residue survives to be read.**

Every step in `quality` was classified against it.

**It generalises to two more, and one of them is now fixed:**

| check | its subject | why the shape fits |
|---|---|---|
| `check:open-branch-ids`, before this card | an **allocation** | it ran at merge, hours after the id was written. **Fixed here.** |
| `check:board-clock` | **the moment a timestamp was written** | it compares the file at head against the commit that **last touched** it. A value that was in the future when written, and in the past by the last commit to touch that file, passes. The value that survives is checked honestly; the moment of writing is not. |

**It does not generalise to the rest, and two of them are the counter-examples
that show the pattern for fixing it:**

- `check:no-destructive-migration` has a subject that IS a moment, the merge,
  and R-124 established that merging a migration is applying it. The check was
  deliberately put at that moment. Same for `check:deployed-commit`, which asks
  production which commit it is running **at the moment of the apply** rather
  than accepting an operator statement afterwards. Both are the shape's cure:
  move the check to where the property binds.
- `check:card-ids` reads **every commit subject** on the branch, not the diff, so
  it does look at each commit rather than at a residue.
- Everything else in the job (`check:unique-ids`, `check:conflict-residue`,
  `check:categories`, `check:ledger-rows`, `check:action-pins`, `check:board-app`,
  `check:card-order`, `check:executor-env`, `check:assertion-register`,
  `check:pending-schema-reads`, `check:removal-safety`, `check:reset-sql`,
  `check:no-prod-target`, `check:document-url`, `check:reconciliation`,
  `check:migrations`, and every `prove:*` and `test-*.sh`) has a subject that is
  **content at head** or **behaviour**, never a moment. Content at head is exactly
  what merges, so evaluating it at head is evaluating it where it binds.

**Nothing was built for this.** The dispatch said not to, and `check:board-clock`
is a narrower exposure than DIG-01's: it lets through a value that has since
become true, where `check-board-edit` lets through an order that was never
followed.

---

## 3. Board in order

`FIXTURE-01` follows this card. Its outcome is at the end of this report.

---

## 4. Two stray files deleted

`/Users/ivan/rc-poc-logs/dig01-check.full-digest.txt` and
`dig01-check2.full-digest.txt`, written by two `notify.mjs --dry-run`
measurement runs while working DIG-01. Deleted on the owner's confirmation in the
dispatch of 2026-09-07; they were held until then because deleting outside a
scratch directory is owner-confirmable under CLAUDE.md's hard rules.

---

## Learnings appended

Three entries in `docs/LEARNINGS.md`, all three found by this card's own mutants
rather than by reading:

1. A count assertion that counts a derived list asserts nothing.
2. A mutant whose edit half applied reported itself applied.
3. A range measured from a shared baseline reads as a false accusation.

## Rulings in force this session

R-059, R-082, R-085, R-086, R-098, R-122, R-123, R-124, R-127, R-142, R-143.
