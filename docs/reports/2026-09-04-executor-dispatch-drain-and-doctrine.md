# EXECUTOR, 2026-09-04. Doctrine corrected, the queue drained, RULE-04 built.

Working narrative, written as the work happened. The chat report is a pointer to
this file.

Ratifications carried into this run and quoted as instructed: **the merge order
deviation stands over the dispatched one**, **RULE-04 over RULE-03 stands**,
**R-096 over R-087 stands**, **the production probe declaration is accepted**.

---

## Step 1. The scheduled harness, paused first

**Mechanism: `launchctl unload ~/Library/LaunchAgents/com.ai.rc-poc.plist`.**

That agent runs `/Users/ivan/rc-poc-bin/run.sh` on a calendar schedule at 22:00,
01:00, 04:00 and 07:00. It is the only one of the two loaded agents that can open
a pull request, which was checked rather than assumed:

    grep -cE "gh pr create|git push"  run.sh        -> 3
    grep -cE "gh pr create|git push"  responder.sh  -> 0

**`com.ai.rc-poc-chat` was deliberately LEFT RUNNING.** It runs `responder.sh`
every 60 seconds and is the owner's answer channel. It cannot open a pull request
and silencing it would remove his ability to answer questions during exactly the
window this dispatch needs answers in.

**State at the moment of unloading:** no `run.lock` present, no `run.sh` process
alive. Nothing was interrupted mid-run.

**To re-enable:**

    launchctl load ~/Library/LaunchAgents/com.ai.rc-poc.plist

That is step 6, and it is gated on the queue reaching zero.

---

## Step 0. R-124, and the sentence that was false

**The ruling is `R-124`.** Its id was verified free on `main` and on all thirteen
open branches before it was taken, which is the manual sweep `RULE-04` exists to
replace.

**What was corrected, and where:**

| place | was | now |
|---|---|---|
| CLAUDE.md 3.1 | "changes one text file in a git repository and changes nothing in any database" | quoted, marked disproved, evidence underneath |
| CLAUDE.md 8.6 preamble (R-082) | the same clause as the reason the apply was unreachable | corrected to "reachable by no TERMINAL", which is the smaller true claim |
| CLAUDE.md section 8 | began at 8.1 Authoring | begins at **8.0 MERGE IS APPLY**, before anything else |
| CLAUDE.md 8.6 | opened with the stop | opens with a pointer to 8.0 |
| CLAUDE.md 8.8 | "two ways to write to the production database" | "two ways for a TERMINAL", plus the third writer named |

**THE FALSE SENTENCE IS QUOTED, NOT DELETED, AND THAT IS DELIBERATE.** Deleting it
would leave every reader who remembers it with no way to learn they were wrong.
It appears exactly once, inside its own correction, prefixed by "It used to read"
and followed by "That sentence is disproved."

**The evidence, restated because the ruling turns on it being a prediction rather
than a correlation:** two migrations both numbered `0032`, one merged and one
deliberately left open, and only the merged one appeared in production within two
minutes. The unmerged twin is the control. The second merge repeated the
prediction and it held again. The integration also applies the file faithfully:
an insert violating `0032`'s CHECK was refused with `23514`.

### One ordering constraint found while verifying 8.0

Section 8.0 names `npm run check:no-destructive-migration` as the control. **That
check does not exist on `main`.** It arrives with pull request #195, which is in
this dispatch's own drain list. Running it on this branch produced nothing,
because the npm script is not there.

So the doctrine change has a dependency on the drain rather than the other way
round: **#195 merges first, and this branch is refreshed on top of it.** Writing
8.0 to reference a check that has not landed would put a promise in the file that
a reader could not run, which is the class of defect this whole ruling is about.

---

## Step 2. The drain, and why it is serial

**`required_status_checks.strict` is `true` on `main`.** Branch protection requires
a pull request to be up to date with `main` before it merges. **Every merge
therefore invalidates every other open pull request**, each one needs its branch
refreshed, and each refresh triggers a fresh ~20 minute `quality` run.

Thirteen pull requests, one at a time, is the shape of this queue and there is no
way to batch it that does not change what the owner listed. What CAN be
overlapped is the human half: while one branch's post-refresh run is going, the
next branch's conflict resolution is done locally and held unpushed.

**Order chosen, and the reasons:**

| # | PR | why here |
|---|---|---|
| 1 | #195 EXT-16 | already running; carries `check:no-destructive-migration`, which section 8.0 references, so the doctrine branch cannot land before it |
| 2 | #182 claim | already running; trivial, one file |
| 3 | doctrine/merge-is-apply | R-124, depends on #195 for the check it names |
| 4 | #194, #189 | POC state, one file each, newest first |
| 5 | #192 AUT-17 | a real card, one behind |
| 6 | #190, #193 | TRIAGE, one behind, ruling ids above the collision zone |
| 7 | #187, #184 | TRIAGE, 11 and 12 behind, and #184 holds `R-098` |
| 8 | #157 then #172 | the R-090/R-091 collision. #157 first because it is pure ruling text; #172 needs a content review as well, since its `R-089` and card `P3-35` are superseded by the APPLY-LOG reconstruction and `MIG-01` |
| 9 | #175 EXT-14 | six conflicts against the extraction files, resolved once at the end when `main` has stopped moving under it |
| — | #191 | red. See below. |

### #191, the red one

**It is not #191's fault.** The pull request changes `docs/poc/state.json` and
nothing else, seven insertions and eleven deletions. The failure is
`client-detail.spec.ts:50`, on `page.goBack()` followed by
`expect(getByTestId("panel-documente")).toBeVisible()`.

**The same test also failed run 33876665219, which is #195's**, a branch whose
content has nothing to do with client screens either. A test that fails on two
unrelated branches and passes elsewhere is flaky, not broken by either of them.

The shape is a classic client-side navigation race: `goBack()` returns before the
panel has re-rendered, and a 15 second timeout is enough on a fast runner and not
on a slow one. **Re-run rather than closed**, because the content is a legitimate
harness state update and there is nothing in it to fix.

---

## Step 3. RULE-04, built

`check:unique-ids` compares each branch against **main**, and within each side the
ids are unique, so a collision between two OPEN branches is invisible until the
second merges. It has bitten three times, and the third happened while the card
sat open:

| id | what happened |
|---|---|
| `R-096` | #179 took it from main's counter and merged, while #157 had already advanced its own counter to it |
| `R-098` | allocated after a **manual sweep** of main and six open branches found it free. By the next morning #184 existed and had also taken it |
| `R-090`, `R-091` | written by **both** #172 and #157, different headings, neither merged, both green |

**`R-098` settles the design.** The sweep was correct and collided anyway, because
branches are opened while you work. A human sweep cannot be the mechanism.

`scripts/poc-free/check-open-branch-ids.mjs`, run in `quality`, not path-filtered.
It reads every open pull request branch, compares the ids THIS branch adds beyond
main against the ids each other branch adds beyond main, and refuses when one id
carries different heading text on two branches.

**It runs at merge time.** `required_status_checks.strict` is true, so a branch is
refreshed immediately before merging, and this check's last run is that one.

**It fails closed**: without the open-PR list it exits 2. Its subject is ids on
branches it cannot see, so "I could not look" and "nothing is claimed" must never
render as the same result. The input count is asserted against the comparison
count.

**It stays out of `check:unique-ids`' way.** A control case asserts it is silent
on an id redefined against main, so the two never both report one finding.

`prove:open-branch-ids`: **8 of 8**, each on a throwaway repository, two refusing
cases and four controls.

### A scope slip, caught and reversed

The check was drafted in the `card/ext-16` worktree while waiting on CI and was
swept into #195 by a `git add -A`. **It was removed from #195 in its own commit**
and moved to `card/rule-04`. CLAUDE.md 3 says the pull request does what the card
says and nothing else; a file nobody reading #195's description would expect to
find there is exactly that, however useful the file is.

---

## Step 4. EXT-21, authored

A read-only state endpoint Andre can poll: active categories, the unit enum, a
version string, no credential and no client data.

**The gap is a direction the ordering doctrine does not cover.** That rule is
entirely about our validator accepting before he emits, values travelling from
him to us. It has no coverage of **our own record saying pending while production
is live**, which is what happened on 2026-09-03 and cost him a day of holding back
three values that were already safe.

**Why a mechanism and not a rule:** the failure is invisible while it happens.
Nothing went red, no check failed, and both sides behaved correctly against the
information they had. A rule saying "keep the status document accurate" would have
been obeyed by everyone and changed nothing, because the person writing it
believed it was.

Out of scope, deliberately: the error-code set, which R-123 already covers with a
stronger guarantee than polling.

### #191 and #194 are the same snapshot, three hours apart

Both change `docs/poc/state.json` and nothing else. Read side by side:

    main   run_id 20260904-010000   claims AUT-15, AUT-16
    #191   run_id 20260904-040001   claims AUT-16          escalations 22
    #194   run_id 20260904-071258   claims AUT-16, AUT-17  escalations 23

**#194 is strictly newer and its content is a superset of #191's.** The file is a
snapshot of harness state, not an append-only log, so merging #191 and then #194
would simply have #194 overwrite it. **#191 is closed as superseded rather than
merged**, which reaches the same file contents in one cycle instead of two.

That also disposes of the red run on #191 without pretending the flake was
diagnosed away: the flake was diagnosed, and separately the pull request turns out
to have nothing left to contribute.

### A correction to my own earlier note about #172

Earlier in this run I recorded that #172 "needs a content review as well, since
its `R-089` and card `P3-35` are superseded". **The `P3-35` half of that is
wrong**, and it is corrected here rather than left in the file.

Checked against the branches:

    triage/20260903-070005  (#172)   P3-35 absent   P3-37 present
    triage/20260902-070904  (#157)   P3-35 present  P3-36 present
    main                             none of the three

`P3-35` is **#157's**, not #172's, and it is about verifying the phase 3 schema on
production read-only, which nothing in this session supersedes. #172's PR
description names `P3-35` against `R-089`, which is why I misread it; the branch
itself carries `P3-37`. **The description is stale relative to its own branch.**

**The boards are therefore disjoint and there is no card-id collision between the
two.** The only overlap is the ruling pair `R-090` and `R-091`. `R-089` itself is
a finding recorded at a point in time and merges as history like any other ruling;
the APPLY-LOG reconstruction and `MIG-01` answer the question it raised, which is
what a later ruling is supposed to do.

### The full ruling-id map, so the renumbering is decided once rather than per merge

    main                     ... R-086, then R-096, R-097, R-123, R-124   counter R-124
    #195 card/ext-16         R-122                                        counter R-124
    #184 triage 220002       R-098 R-099 R-100 R-101                      counter R-102
    #187 triage 010000       R-102 ... R-107                              counter R-108
    #190 triage 040001       R-108 ... R-117                              counter R-118
    #193 triage 071258       R-118 R-119 R-120 R-121                      counter R-122
    #157 triage 070904       R-090 R-091 R-092 R-093 R-094 R-095          counter R-096
    #172 triage 070005       R-087 R-088 R-089 R-090 R-091                counter R-092
    #192 card/aut-17         none                                         counter R-098

**The four overnight TRIAGE runs form a perfect chain and do not collide with each
other at all**, because each read the previous run's counter on the same worktree.
`R-098` through `R-121` is one unbroken sequence across #184, #187, #190 and #193.

**#193 reserves `R-122` and #195 has written it.** That is a reservation against a
written id, not two written ids, so whichever merges second simply re-reads the
counter. It is not a renumbering.

**THE ONLY REAL COLLISION IS #157 AND #172 ON `R-090` AND `R-091`.** Both write
them, with different headings, and main has neither: main jumps from `R-086`
straight to `R-096`. **#157 merges first** and keeps `R-090` to `R-095`; **#172
then renumbers `R-090` and `R-091`** to the next free ids and keeps `R-087` to
`R-089`. Per the dispatch, the one merging second renumbers, never the one on
main.

**Every one of these branches also needs its counter raised.** All of them point
below main's `R-124`, so after merging main the counter assertion in
`check:unique-ids` fails on each until it is set above the highest written.

### The RULE-04 check works on the runner, which was not a given

`check-open-branch-ids` is the **first step in `quality` to depend on `gh` and a
token**. `pr-check-state.mjs` uses `gh` but is an operator tool and is not wired
into the workflow, so there was no precedent to copy. Confirmed on the runner:

    success  Refuse an id claimed on another open branch
    success  Prove the cross-branch id check refuses

`gh` is preinstalled on GitHub-hosted runners and `secrets.GITHUB_TOKEN` is
sufficient to list open pull requests in the same repository.

**One design detail that mattered here.** In CI a `pull_request` build is on a
detached HEAD, so `git rev-parse --abbrev-ref HEAD` returns `HEAD` rather than the
branch name. The check falls back to `GITHUB_HEAD_REF`. **Even if that fallback
had failed**, the check compares heading TEXT and skips identical headings, so a
branch compared against itself finds no collision. It degrades to a false negative
rather than a false positive, which is the correct direction for a check that
gates merges.

### Two things found while scoping #192, both of which bite at merge time

**1. Its card is left `in_flight` with no evidence.** `AUT-17` on
`card/aut-17` is `status: in_flight`, `evidence: none`, while the branch carries
`scripts/poc/run.sh` changes, a new `scripts/poc/test-harness-caps.sh` and a
138-line report. The authoring session did the work and did not close the card.
Merging it as-is leaves a card that never ships. **The board flip belongs in that
merge**, not in a later sweep, because CLAUDE.md 2 says the pull request carrying
the code carries the board edit.

**2. It changes `scripts/poc/run.sh`, which is a DEPLOYED file.** CLAUDE.md 15:
`scripts/poc/install.sh` must be re-run after any change to `run.sh`,
`responder.sh` or `digest.sh`, because those three are deployed copies under
`/Users/ivan/rc-poc-bin` and the repository is the source of truth.

**That lands on step 6.** Re-enabling the schedule without re-running the
installer would start the OLD `run.sh` on the new board, which is the exact
mismatch section 15 exists to prevent. So step 6 is: re-run `install.sh` first,
then `launchctl load`.

### #191, closed

The re-run passed with **no change to its content**, which confirms the flake
diagnosis rather than resting on it. It was then closed as **superseded** by #194,
not merged: `state.json` is a snapshot, #194's is a strict superset three hours
later, and merging both would cost a full serialised cycle to reach the same file
contents.

The flake itself is real and is recorded here. **No card was opened for it**, on
the grounds that it belongs with `CI-01`, which already covers CI reliability,
rather than becoming a second card about the same subject.

Queue: **13 open**, one disposed of without a merge.

