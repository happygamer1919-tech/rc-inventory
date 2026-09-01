# EXECUTOR, 2026-09-01: P3-11d, a green check on a conflicting PR is stale

Card **P3-11d**. Branch `card/p3-11d`. **Shipped.** No production connection.

---

## 1. What this cost

About an hour of the INC-06 outage.

A pull request that conflicts with its base triggers **zero workflows**. Nothing
runs. But the check result from the **previous** head sha stays attached, and
`gh pr checks` keeps reporting it. During INC-06 the fix for a six-screen
production outage sat in exactly that state: pushed, `DIRTY`, no run started, and
every tool reporting

```
quality   pass   15m48s
```

for a commit that had never been tested and never would be.

## 2. The gap in the rule

CLAUDE.md §3 already names this trap **for merging**, and §3.1 forbids merging on
anything but a run for the head sha. Neither covers the terminal that is **not
merging yet** and is simply **waiting** on a fix. That is the case that hurt, and
§3 is extended here from merging to waiting.

## 3. The tool

`npm run checks:state <pr>` prints the required check **beside**
`mergeStateStatus` and the head sha, and exits non-zero when a green result
belongs to a commit nobody is proposing to merge.

It is a **reporting** tool, deliberately not a gate: §3.1 already gates merging,
and this failure happened while nobody was merging.

It does **not** solve the problem by polling harder. `mergeStateStatus` is
available immediately and for free, so staleness is **read** rather than inferred
from a run that never appears.

## 4. Proven against states that actually occurred

```
npm run prove:pr-state
  4 of 4 passed
EXIT=0
```

- `dirty-but-green.json` is **PR #148 exactly as it stood during INC-06** →
  exit 1, and the message says a conflicting PR triggers zero workflows.
- `behind-but-green.json` is **PR #130 as it stood on 2026-08-31**, green on its
  head and `BEHIND` its base under a strict required check → exit 1.
- `clean-and-green.json` → exit 0, so the tool does not cry stale at every healthy
  pull request, which is the failure mode that would get it ignored.

## 5. A related mistake of mine, worth recording

This card's own branch was pushed and **no pull request was ever opened**, so no
CI ran and nothing reported anything at all. The owner noticed before I did.

That is the same family as the defect the card addresses: **absence of a signal
read as absence of a problem.** The tool above answers "is this green result
current?" It does not answer "does a pull request exist at all?", and the habit
that closes that one is checking `gh pr list` after pushing a branch rather than
assuming the push was the last step.
