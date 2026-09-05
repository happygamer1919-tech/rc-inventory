# EXECUTOR, unattended run 20260904-220003

**Role:** EXECUTOR
**Run:** `20260904-220003`, scheduled, unattended, 45 minute wall clock cap
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, detached at `origin/main` (`ba8cc3c`)
**Date:** 2026-09-05 UTC
**Cards worked:** 2, which is the per-run maximum under CLAUDE.md section 13

---

## 1. Boot report, as printed before any write

Board `docs/board/rc-board-phase2.json`, `as_of` `2026-09-04T23:20:00Z`:

| status | count |
|---|---|
| shipped | 48 |
| todo | 28 |
| blocked | 3 |
| in_flight | 1 |
| **total** | **80** |

**Launch gate: 6/9.**

**Next eligible card: AUT-18**, "Every scheduled run reports every open pull
request it did not merge, and escalates the ones no merge could rest on. It
merges nothing."

Twenty six cards were eligible at boot. The order was taken from the harness's
own selector, `node scripts/poc/eligible.mjs --ids --actor harness`, rather than
computed by hand, so the pick matches what the unattended path would have taken.

**Claims.** One claim existed in `docs/poc/state.json`: `AUT-17` by `harness`,
`claimed_at 2026-09-04T11:54:48Z`. At boot that was fourteen hours old against a
six hour lease, so it was expired and not honoured. It is moot in any case:
`AUT-17` is `shipped`. **No card was skipped this run because another actor held
it.**

Blocked, and left blocked: `P2-08b` on `andre`, `P2-14` on `client`, `MIG-01` on
`ivan`.

---

## 2. Cards touched, and what happened to each

### AUT-18 - the pull request census. SHIPPED, PR #204

**What it is for.** Finished work sits in an open pull request that nothing ever
names again. Three real incidents are behind the card: PR #133 went CONFLICTING
with no `quality` run on its head sha at all, because a conflicting pull request
triggers zero workflows; PR #130 sat red for a whole run and was named by
nothing; and a card branch was pushed with no pull request ever opened, so no
check ran, no list contained it, and the owner noticed before any terminal did.

**What was built.** `scripts/poc/run.sh` gains a fenced block,
`EXTRACT-BEGIN pr-census`, of five seams and one driver:

| seam | what it answers |
|---|---|
| `census_pr_list` | number, head branch, head sha, merge state for every open pull request |
| `census_quality_for_sha` | what `quality` concluded ON THAT EXACT HEAD SHA, never a pull request level summary |
| `census_commit_epoch` | committer time of a sha, git first so a fetched ref costs no API call |
| `census_branch_list` | every remote branch, with `main` and `HEAD` dropped at the seam |
| `census_branch_merged` | merged into main BY ANY ROUTE, ancestor test then a merged pull request for the squash case |

The seams are the only place `gh` or `git` is touched, which is what makes the
block testable at all. `scripts/poc/test-pr-census.sh` lifts the block verbatim
by its fences, replaces all five with fixtures, and additionally shadows
`merge_when_green`, `gh`, `gh_bounded` and `git` as tripwires, so "it merges
nothing" is asserted against a stub rather than argued.

**Call site.** Step 5, immediately after the state branch is checked out and
before the `node -e` that rewrites `docs/poc/state.json`. Every merge the run
intended has already happened by then, and the escalations the census appends
are read back by that same `node -e` and carried by the state pull request like
every other escalation. No new pull request and no new push path.

**Acceptance.** `bash scripts/poc/test-pr-census.sh` exits 0, wired into
`quality` by name as `Prove the pull request census  # AUT-18-CENSUS-PROOF`, not
path filtered. Thirty one assertions across the four clauses.

**Proved to fail first, which the card required per clause.** Against the
pre-change `run.sh` the suite exits 1 with
`FATAL: no EXTRACT block named 'pr-census'`. That is one hard failure covering
all four clauses, which is honest but is not per-clause proof, so each clause was
also proved against a mutant of the shipped `run.sh` with exactly that clause
disabled. Each mutant failed exactly its own case:

| mutant | failures |
|---|---|
| census line drops the quality field | 3, all in clause 1 |
| the age condition is dropped | 2: `#306 escalated and must not`, `expected exactly 4 escalations, got 5` |
| the census merges what it finds green | 1: `the census called something it must never call` |
| the branch list is not read | 4, all in clause 4 |

The second one is the negative half the card calls the half that matters: a red
pull request pushed by the current run is a card being actively worked, and
escalating it every run trains the reader to skip the list.

**Two deviations from the card text, both narrower than they look.** The card
names `CONFLICTING`; GitHub reports that one condition as `CONFLICTING` on
`mergeable` and `DIRTY` on `mergeStateStatus`, and the seam returns
`mergeStateStatus`, so both words are accepted and the reason is documented at
the `case` statement. And an unresolvable commit time is pinned to 0, which reads
as older than every run and therefore escalates, because leaving it empty made an
unresolvable head sha silently suppress its own escalation.

**What was deliberately not built.** No merge: the merge selector is RST-02's and
is untouched, and the census reads `card/` branches only because it merges none
of them. No branch deletion: a sweep that deleted branches could delete work that
was never published, which is the exact loss clause 4 exists to prevent.

### AUT-19 - DOCTRINE-TRIAGE section 2's id allocation. SHIPPED, PR #205

Requirement 1 of section 2 told a TRIAGE session to take the next free id by
scanning `decisions/inbox.md`, under an author-namespacing scheme that card
RULE-02 replaced on 2026-09-02. A session following its own rubric now ships a
pull request that `quality` refuses at the counter assertion. R-088 recorded
exactly that happening.

Requirement 1 now states the rule in one line and CITES CLAUDE.md section 8b as
the authority, the way section 6 cites R-057. 8b is not restated, per the card's
defaults: two copies of an allocation procedure drift, and this card exists
because two already did. Requirements 2 and 3 are untouched and no ruling is
edited.

All four acceptance clauses pass on the head sha, plus the three board
validations and `npm run check:unique-ids`.

**THE ONE JUDGEMENT THIS CARD FORCED, and it is a genuine conflict between two
rules in force.** CLAUDE.md section 9c says a superseded doctrine sentence is
QUOTED, marked false, and left in place. This card's acceptance clause 1 requires
`grep -c 'namespaced by author'` to print 0. The first draft followed 9c
literally, quoted the old wording, and printed 1.

**The acceptance won**, because it is the machine-checkable half and section 6
does not ship a card on a clause it fails. The supersession is written as
description rather than quotation: what the old rule told a session to do, why it
is gone, R-088 as the ruling that recorded it, RULE-02 as the card that changed
it, and a closing sentence addressed to a reader who arrived carrying the old
wording. 9c's purpose is served; its literal form is not available for a phrase
an acceptance greps for the absence of. Logged in `docs/LEARNINGS.md` as a rule
for the next instance rather than left as a one-off.

**The sweep the card's defaults asked for was run.** `docs/reports/README.md`:
clean. The `doctrine` string on all three boards: clean. `docs/LEARNINGS.md` line
778 carried the same stale rule and got a SUPERSEDED paragraph APPENDED, not an
edit, because a learnings entry is a record and a record is not rewritten. No
second card was authored, per the defaults.

---

## 3. Pull requests

| PR | card | branch | state at the time of writing |
|---|---|---|---|
| #204 | AUT-18 | `card/aut-18` | opened this run, `quality` running on head `c1eb5cd` |
| #205 | AUT-19 | `card/aut-19` | opened this run, `quality` running |
| this one | the report | `poc/report-20260904-220003` | opened this run |

**Every merge this run makes rests on a `quality` run that exists for the head
sha and concluded success, read beside `mergeStateStatus`.** Where the cap
arrives before a check does, the pull request is left open and named here rather
than merged on a result that belongs to another commit. Whatever this file says
about a merge, the pull request itself is the record.

---

## 4. Escalations

**None raised this run.** No card hit an ambiguity its `defaults` did not cover,
no card was blocked, no card was skipped for a claim, and no failure ceiling was
approached. The AUT-19 rule conflict in section 2 above was decided under the
card's own acceptance and is reported rather than escalated, which is CLAUDE.md
section 4b: a decision the terminal was authorised to make is not a block.

The pre-existing escalations in `docs/poc/state.json` are untouched.

---

## 5. Learnings appended

Three entries in `docs/LEARNINGS.md`:

1. **A test that extracts a fenced block must fail hard when the fence is gone.**
   `CENSUS=$(extract pr-census)` runs the helper in a subshell, so its `exit 1`
   on a missing fence killed only the subshell and the suite carried on to report
   twenty unrelated failures. One defect presented as twenty. The helper now
   returns a status and the caller runs it outside any substitution.
2. **The census must count an unknown commit time as old, not as new.** When a
   missing input decides between reporting and staying quiet, the missing case
   reports.
3. **A card acceptance that greps for an absent phrase forbids quoting it**, even
   where section 9c's style says quote it. The AUT-19 instance, with the general
   rule.

---

## 6. What the next run should pick up first

1. **Confirm #204, #205 and this report's pull request all merged.** If any is
   open, read `mergeStateStatus` beside the check result before touching it, per
   CLAUDE.md section 3. `npm run checks:state <pr>` prints both.
2. **AUT-20**, the next eligible card by the harness's own ordering:
   `scripts/poc/test-chat-classify.sh` is red on `main` and is in no required
   check, so the responder classifier has been unproven for as long as anyone can
   measure. That is a check-shaped defect and it is the same family as the two
   cards shipped tonight: a signal that is absent read as a signal that is fine.
3. **AUT-21 and AUT-22 read together before either is started.** AUT-21 reports
   when the deployed harness copy differs from the repository; AUT-22 stops a run
   starting a card it cannot finish inside the cap. Tonight's run is evidence for
   AUT-22: two cards and their checks consumed most of the window, and a third
   would not have fit.
4. **`scripts/poc/install.sh` must be re-run**, per CLAUDE.md section 15, because
   AUT-18 changed `scripts/poc/run.sh` and the deployed copy under
   `/Users/ivan/rc-poc-bin` is not the repository. **Until it is re-run the census
   shipped tonight does not execute on any scheduled run.** That is an owner
   action on this machine and it is the single most consequential item in this
   list.

Board after this run: **50 shipped, 26 todo, 3 blocked, 1 in flight**, launch
gate unchanged at **6/9**.
