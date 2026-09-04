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

