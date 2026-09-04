# EXECUTOR run 20260904-071258: AUT-17, the review step stops being handed the wrong report

**Role:** EXECUTOR
**Run id:** 20260904-071258
**Started:** 2026-09-04T11:12:58Z
**Cap:** 2700s executor wall clock, enforced by the harness
**Worktree:** /Users/ivan/rc-inventory-poc-run, branch card/aut-17

---

## 1. Boot

| Board | shipped | todo | blocked | in_flight | halted | total |
|---|---|---|---|---|---|---|
| phase 2 | 45 | 14 | 2 | 1 | 0 | 62 |
| phase 3 | 31 | 34 | 0 | 0 | 0 | 65 |

- Phase 2 launch gate: **6/9**. G4, G7 and G9 fail. G7 is blocked on ivan.
- Phase 3 launch gate: **0/9**.
- Blocked: P2-08b on `andre`, P2-14 on `client`. In flight at boot: AUT-3.
- Eligible cards: **44** across both boards.
- Claims in `docs/poc/state.json`: AUT-15 and AUT-16, both held by `harness`,
  which is this actor, and both already shipped. No card was held by another
  actor, so nothing was skipped for a claim this run.
- **Next eligible card, taken: AUT-17.**

## 2. Cards touched

### AUT-17, `todo` -> `in_flight`. Branch `card/aut-17`, PR **#192**. NOT MERGED.

The card fixes the selection that decides which report the overnight review step
reads. It was three commands in a pipe at `run.sh` 734 to 735 and carried three
defects at once, none of them visible from the output, because the output is
always a plausible file path:

1. it sorted **filenames**, so two reports carrying the same date were ordered by
   slug and the one committed second could sort first,
2. it read **origin/main only**, so a report riding in an unmerged card pull
   request was invisible, which is exactly the state a card whose acceptance
   failed leaves behind, and
3. it never compared its answer against `docs/poc/triage-latest.json`, which
   records what the last review consumed. On 2026-08-31 that handed a run a
   report the previous run had already triaged in full and merged as PR #131.

**What landed on the branch.** The pipe is now a fenced block,
`# EXTRACT-BEGIN triage-selector`, holding three functions: `triage_reports_in`
lists executor reports newest first by commit for any ref or range,
`triage_consumed_report` reads the report path and run id out of
`triage-latest.json` and fails open when that file is absent or unparseable, and
`select_triage_report` puts them together with the branch report preferred over
`origin/main` always. The executor step now checkpoints its own branch, pull
request number and report path through the `checkpoint_pr` function the review
step already used, per the card's defaults, rather than a second mechanism or a
parse of the model's output. The dispatch sentence was **corrected, not deleted**:
R-050's substance (no chat, no summary, no human context, no verbal ratification)
survives, and the claim that reading a committed repository file is a defect is
gone.

**What proves it.** Twelve new assertions in section 5 of
`scripts/poc/test-harness-caps.sh`, which `quality` already runs by name at
`.github/workflows/quality.yml` line 363 and which is not one of the two
path-filtered steps. Four of those assertions run the **old** selector beside the
new one on the same fixture and require it to FAIL, which is how this file has
proved the watchdog since it was written. The failing output is therefore
regenerated on every CI run rather than pasted once. The fixtures are constructed
and the pull request says so: no same-day slug inversion has occurred in this
repository's history yet, which is exactly why the defect never fired.

Local result: `bash scripts/poc/test-harness-caps.sh` exits 0, all assertions
pass. `bash -n scripts/poc/run.sh` exits 0.
`grep -c 'you need nothing else' scripts/poc/run.sh` prints 0, and printed 1
before this branch. `node docs/board/validate-board.mjs
docs/board/rc-board-phase2.json` exits 0. `npm run check:conflict-residue` clean.

**Why it is `in_flight` and not `shipped`.** The 45 minute cap arrived with the
pull request open and `quality` not concluded. `npm run checks:state 192` at
11:52Z printed:

```
pull request      #192
head              659c672
mergeStateStatus  BLOCKED
quality
not green, nothing to mistake for green
```

Nothing merges on a check that has not run. CLAUDE.md section 3 and section 3.1
both say so and this run did not make an exception for its own work.

## 3. Migrations

None authored, none applied. No connection to any database was opened. No
credential value was read, printed, logged or committed.

## 4. Escalations

None raised this run. Nothing hit an ambiguity the card's `defaults` did not
already answer: the defaults named the fenced-function requirement, the
`checkpoint_pr` reuse, the preference order, the fail-open behaviour on
`triage-latest.json`, and the correct-do-not-delete treatment of the dispatch
sentence, and each was applied as written.

One thing worth the digest without being a block, per section 4b: the cap is 45
minutes and the `quality` job on this repository regularly outlasts half of it.
A card that is finished, tested and pushed at minute 40 cannot be merged by the
run that wrote it, structurally, and that is the third consecutive run to end
that way. AUT-18 and RST-02 between them are the cards that make the next run
pick such a pull request up instead of leaving it to be found by hand, which is
an argument for their priority, not a new card.

## 5. What the next run picks up first

1. **PR #192, card AUT-17.** Read `npm run checks:state 192`. On green `quality`
   for the head sha, merge it and flip AUT-17 to `shipped` with evidence
   `{kind: pr, ref: 192}`. Everything else on the card is done. If it has gone
   `DIRTY` against main, resolve locally per R-052, never in the web editor.
2. **AUT-18**, the next eligible card by id after AUT-17. It is the pull request
   census, and this run is its own best argument.
3. Also open and unmerged at the cap, none of them this run's work: #191, #190,
   #189, #187, #184, #182, #181, #175, #172, #157. #190, #189 and #191 are from
   the 04:00 run; #187, #184, #182, #181, #175, #172 and #157 are older and
   several are `DIRTY`.

## 6. Board and gate movement

No launch gate condition changed. Phase 2 stays 6/9, phase 3 stays 0/9. One card
moved, `todo` to `in_flight`, and `as_of` was bumped in the same commit as the
code it describes.
