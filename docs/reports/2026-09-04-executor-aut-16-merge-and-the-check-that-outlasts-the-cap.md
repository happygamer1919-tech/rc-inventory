# EXECUTOR, run 20260904-040001

**Role:** EXECUTOR. Unattended scheduled run, 45 minute wall clock cap, at most
two cards.
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, detached at `origin/main`
`af8b608` at boot.
**Board:** `docs/board/rc-board-phase2.json`.

---

## Boot status report

| status | count |
|---|---|
| shipped | 44 |
| todo | 15 |
| blocked | 2 |
| in_flight | 1 |
| halted | 0 |

**Launch gate: 6 of 9** on phase 2. The phase 3 board carries 31 shipped, 34
todo and its own gate at 0 of 9.

**Next eligible card at boot: `AUT-16`.** Full eligible list, in order:
`AUT-16, AUT-17, AUT-18, AUT-8, AUT-9, BOARD-01, BOARD-02, CLAIM-01, DIG-01,
GATE-03, LEARN-01, P2-20, RST-02, RST-03`.

**No card was held by another actor.** The two claims in `docs/poc/state.json`,
on `AUT-15` and `AUT-16`, are both `claimed_by: harness`, which is this actor.
Nothing was skipped for a lease this run.

---

## Cards touched

### AUT-16 - finished and merged, work inherited from the previous run

The previous scheduled run, `20260904-010000`, built AUT-16 in full and opened
**PR #186**, then ran out of clock. It left the pull request in the exact state
CLAUDE.md section 3 names as a trap: `npm run checks:state 186` reported

```
head              80d4128
mergeStateStatus  BEHIND
quality           SUCCESS

STALE, NOT GREEN.
```

A green result attached to a head sha that nobody was proposing to merge, because
`main` had moved underneath it. That is not a merge this run was allowed to make.

**What this run did.** Checked out `card/aut-16`, merged `origin/main` into it
locally per ruling R-052 (never the web editor, never the owner), which resolved
clean: one file, `docs/poc/state.json`, ten insertions and six deletions, no
conflict markers and no manual resolution needed. Ran the gate before pushing:

```
node docs/board/validate-board.mjs docs/board/rc-board-phase2.json
PASS  docs/board/rc-board-phase2.json  (0 violations)

npm run check:conflict-residue
check-conflict-residue: 3 checks passed, no conflict residue in the tree.

npm run check:unique-ids
check-unique-ids: OK. 140 card id(s) across 3 boards and 88 ruling id(s) are
each unique, 0 redefined against main.
```

Pushed as `25f0038` and waited for a `quality` run to exist **for that exact
sha** rather than inheriting the one attached to `80d4128`.

**Merged.** `quality` completed `success` on `25f0038` at 08:24:19Z, 22 minutes
after the push. `npm run checks:state 186` then read:

```
head              25f0038
mergeStateStatus  CLEAN
quality           SUCCESS

the quality result belongs to head 25f0038 and can be trusted
```

Merged as **`d4915a8`**. AUT-16 is shipped on `main`, with the board edit,
evidence and report that PR #186 already carried. The `--delete-branch` step
printed `fatal: 'main' is already used by worktree at /Users/ivan/rc-inventory`,
which is `gh` trying to check out `main` locally after the merge and being
refused by this worktree; the merge itself had already happened on GitHub and is
unaffected. `card/aut-16` is still on the remote and can be deleted from
anywhere.

The card's own body, board edit, acceptance and evidence were authored by the
previous run and are unchanged by this one. This run added the merge commit and
the merge, nothing else. No self-invented scope.

### AUT-17 - next eligible, deliberately not started

**It was not started, and that is a decision this report is accountable for.**

AUT-17 is the lowest-id eligible card after AUT-16. Its acceptance asks for four
proved-to-fail-first test halves against a constructed git fixture, a selector
lifted out of an inline pipe into one function, a new `checkpoint_pr` call on the
executor step, and a correction to the dispatch text, wired into `quality` by
name. It is not a small card.

The run's dispatch says, in terms: **do not start work you cannot finish and
merge.** The arithmetic below is why that applies here rather than being an
excuse. AUT-17 edits `scripts/poc/run.sh`, which is the file every future
scheduled run executes. A half-built version of it left on a branch is the one
kind of unfinished work that can damage the next run rather than merely wait for
it, so the choice was between finishing it and not touching it.

**It was not skipped for something easier.** `LEARN-01` is two em dashes in one
file and would have taken four minutes, and CLAUDE.md section 2 forbids exactly
that trade: "Never skip an eligible card because a later one looks easier."
Nothing below AUT-17 was taken instead.

**The design work is handed forward rather than thrown away.** See the handoff
section at the end of this report.

---

## The structural finding: the required check is half the run

**Reported, not blocked on, per CLAUDE.md section 4b.** Nothing here stops the
board and no answer is being waited for.

`quality` runs, measured off the last eight runs of the workflow:

| head | conclusion | wall clock |
|---|---|---|
| `310615c` | success | 24m 48s |
| `3d4a262` | success | 18m 09s |
| `80d4128` | success | 19m 43s |
| `1d2dd22` | cancelled at 21m | - |

**The required check costs between eighteen and twenty five minutes. The run cap
is forty five.** Two consequences follow arithmetically, and both have now
happened on consecutive runs:

1. **A scheduled run can merge at most one pull request**, and only if that pull
   request's head sha is pushed inside the first twenty minutes. This run pushed
   at minute two, having inherited finished work, and that is the only reason a
   merge was reachable at all.
2. **A run that builds a card from scratch cannot merge it.** Building takes the
   first half of the cap and the check takes the second. Run `20260904-010000`
   hit this on AUT-16, and this run hits it again on its own report pull request,
   which is pushed near the cap and will be merged by the next run.

This is not an argument for raising the cap. It is the reason the pattern
"previous run builds, next run merges" keeps appearing in these reports, and it
should be read as the harness working rather than as three runs each failing to
finish. The one thing it genuinely costs is that a card's report and its board
edit sit unmerged for three hours, so the digest reads a board that is behind
what has actually been built.

**Recommendation, for whoever authors next:** a card that teaches the run to
check, at the moment it is about to start a card, whether the remaining clock
exceeds the observed p90 of `quality` plus a margin, and to prefer finishing an
inherited branch over starting a new card when it does not. That is precisely
what this run did by hand.

---

## Escalations

**None new.** No card hit an ambiguity its `defaults` did not cover, no decision
on the R-057 closed list arose, and nothing was blocked on a person by this run.

The two claims in `docs/poc/state.json` are this actor's own and blocked nothing.

---

## Learnings

One entry appended to `docs/LEARNINGS.md`, on the stale-green trap catching a
pull request that had never conflicted. The three prior instances in this
repository were all conflicts; this one was `BEHIND`, which reports the same
`quality pass` and is reached by a different route.

---

## Handoff: what the next run picks up first

**1. `AUT-17`, and the design is below so the next run does not re-derive it.**

The defect is `scripts/poc/run.sh` at what is now **line 792 to 794** after
AUT-16 landed, not line 734 as the card body says. The card was authored before
AUT-16 moved the file, and a run that greps for line 734 will find the wrong
thing:

```sh
TRIAGE_REPORT=$(git ls-tree -r --name-only origin/main -- docs/reports/ 2>/dev/null \
  | grep -E "^docs/reports/[0-9]{4}-[0-9]{2}-[0-9]{2}-executor-[a-z0-9-]+\.md$" | sort | tail -1)
```

`grep -c 'you need nothing else' scripts/poc/run.sh` prints **1** today, at
**line 808**, not 749. Both line numbers in the card body are stale by exactly
one card. Re-grep, do not trust them.

The shape that satisfies the acceptance without arguing with the defaults:

- **One fenced function**, `# EXTRACT-BEGIN triage-report-selector`, next to the
  existing `checkpoint` fence. `scripts/poc/test-harness-caps.sh` already lifts
  fenced blocks verbatim and refuses to run when a fence is missing, so the test
  calls the real text rather than a copy, which is what the card's `defaults`
  demand.
- **Commit order, not filename order.** `git log --format=%H <ref> -- docs/reports/`
  piped into `git diff-tree --no-commit-id --name-only -r`, filtered by the same
  regex, deduplicated with `awk '!seen[$0]++'`. Newest commit first.
- **The branch this run's own executor used**, expressed as the range
  `origin/main..<branch>` handed to that same function. The branch is derivable
  without parsing model output: the harness already computes `HARNESS_CARD`, and
  the branch is `card/<id lowercased>`, exactly the way `TRIAGE_BRANCH` is
  mandated at line 790. `pr_for_branch` then works unchanged, and the executor
  gets the `checkpoint_pr` call the defaults ask for.
- **Consumed** is read only from `docs/poc/triage-latest.json`, with
  `grep -o '"report"[[:space:]]*:[[:space:]]*"[^"]*"'`, no new state file and no
  JSON dependency. Absent or unparseable means nothing is consumed, failing open
  as the defaults require.
- **The refusal goes to stderr** naming the path and the `run_id` that consumed
  it, so the test can assert which of the two legal outcomes happened while
  stdout stays exactly the chosen path.
- **The dispatch sentence is corrected, not deleted.** What must survive is that
  TRIAGE takes no chat, no summary and no verbal ratification. What must go is
  the claim that reading another committed file is a defect.

**2. The report pull request for this run**, which will be `BEHIND` by the time
the next run boots, for the reason in the structural finding above. Merge it the
way this run merged #186: merge `origin/main` in locally, run the three checks,
push, wait for a run on the new sha.

**3. Then `AUT-18`**, which is the card about a run reporting every open pull
request it did not merge. There are currently **seven** open besides this run's
own: #187, #184, #182, #181, #175, #172 and #157, the oldest from 2026-09-02.
This run merged one and touched none of the others, which is exactly the silence
AUT-18 exists to end.
