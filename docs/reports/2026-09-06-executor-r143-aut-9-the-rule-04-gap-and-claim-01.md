# EXECUTOR, 2026-09-06: R-143, AUT-9, the RULE-04 authoring gap, and CLAIM-01

Role: **EXECUTOR**. Boot per `CLAUDE.md`, then the board.

Worktree `/Users/ivan/rc-inv-aut9`, cut detached from `origin/main` at `9152764`.
The shared clone at `/Users/ivan/rc-inventory` was four commits behind and was not
worked in.

---

## Boot status report

Read from `origin/main` at `9152764`.

| board | cards | shipped | todo | blocked | in_flight | launch gate |
|---|---|---|---|---|---|---|
| `rc-board-phase2.json` | 80 | 59 | 16 | 4 | 1 | **6 / 9** |
| `rc-board-phase3.json` | 72 | 39 | 33 | 0 | 0 | **0 / 9** |

Blocked on phase 2: P2-08b (andre), P2-14 (client), **AUT-9 (ivan)**, MIG-01
(ivan). In flight: AUT-3.

**Next eligible card: `CLAIM-01`**, "Two claims cut from the same base collide
inside the claims map by construction, and a claim protects nothing until its
pull request merges." Phase 3's eligible head is EXT-10; the harness board is
phase 2 and the dispatch named CLAIM-01, so phase 2 leads.

---

## What landed

| PR | what | merge sha |
|---|---|---|
| **#228** | R-143, AUT-9's defaults corrected and the card unblocked | `2ec1e5e` |
| #229 | the AUT-9 claim lease | **closed unmerged**, on purpose |
| **#230** | AUT-9 shipped: the suspended child | `2d1b19f` |
| **#231** | RULE-09 authored, plus this report | `b811053` |
| **#232** | CLAIM-01 shipped: one file per claim | `7f32471` |
| **#233** | DIG-01 shipped: the recommendation reaches the digest whole | open at time of writing |

---

## 1. R-143. Section 13 stands, AUT-9's defaults are overturned, the margin is fifteen minutes

### The id was verified free before it was taken, because the counter lies

`decisions/NEXT-RULING-ID` read `R-143` on `main`. That happened to be right, and
it was not trusted. Every one of the **83 remote refs** and every local ref was
scanned for `R-143` and `R-144`: every occurrence is a counter value on an
already-merged branch, and **no ref in this repository writes `R-143`**.

The two open TRIAGE branches hold `R-128` through `R-141`: #207
(`triage/20260904-220003`, R-128 to R-134) and #210
(`triage/20260905-010004`, R-135 to R-141). `main` holds `R-142` and nothing else
in that range. `R-143` sits above the whole claimed range.

### The ruling

Three parts, in the owner's dispatch: **section 13 stands unamended**, **the
card's defaults are overturned**, both clauses, and **the margin is fifteen
minutes**.

The reasons, in the order the ruling records them:

1. **The card's own title agrees with section 13 and contradicts its own
   defaults.** The title reads *"a lock whose owner is gone is not honoured
   forever"*. An owner that is gone is exactly what section 13 reclaims. Under
   `CLAUDE.md` 5 a `defaults` field fills silence; it does not contradict speech,
   and here it contradicted both the standing rule and the sentence at the top of
   its own card.
2. **A margin of twice the cap would not have caught the incident the card was
   written about.** The lock advertises its holder's `cap_seconds`, which is
   `2700 + 1800 + 900 * 2 = 6300s`. Section 13 and the code make a lock stale at
   `6300 + 900 = 7200s`, two hours, inside the three hour gap between windows.
   The card's defaults would make it stale at `6300 + 12600 = 18900s`, **five
   hours fifteen minutes**, spanning two windows. On the night of 2026-08-27 the
   lock was held for **nine hours**, so the card's own margin would have missed
   it, and its live-pid clause would have refused to reclaim it at all.
3. **The code already implements fifteen minutes.** `scripts/poc/run.sh:69` reads
   `POC_LOCK_STALE_MARGIN_SECONDS=900` with the reason beside it. Section 13 and
   the code agree; only the defaults dissented.

### The card was corrected rather than left contradicting itself

The two overturned clauses stay on the card **verbatim**, under a heading naming
the ruling, per R-127. The acceptance was rewritten in the same commit, because
case 4 as written could not be built without undoing the fix for a nine hour
outage.

---

## 2. AUT-9. The suspended child, and a mutation proof that was wrong first

One case was genuinely missing: acceptance case 2, the SIGSTOPped stub. Cases 1,
3 and 4 were already implemented on `main` and already proved by
`scripts/poc/test-harness-caps.sh`.

**Section 1b** was added to that file. Section 1 models a suspend by moving the
*clock* while the victim keeps running; 1b adds the other half, a victim that is
**not running** when the deadline passes. Four assertions: it is ended; it is
ended within 5 seconds of the deadline, measured from the instant the clock moves
and deliberately **not clipped at the budget**; the cap line reaches the process
log; and the 2026-08-27 countdown watchdog on the same suspended child does not
fire.

### The proof that the case bites was wrong on the first attempt

The case was written with a comment asserting *"a stopped process does not take
SIGTERM, it queues"*, and the mutation proof rested on it: delete the
grace-then-KILL escalation from `stop_pid`, and the case should go red.

**It did not.** On this Mac the mutated harness still ended the suspended child in
1 second and every assertion stayed green.

```
kill -STOP; kill -TERM on a `sleep 120`

  Darwin          bash: line 5: 60305 Terminated: 15   sleep 120
                  after TERM: GONE
  ubuntu:24.04    LINUX after TERM: STILL ALIVE (state=T)
                  LINUX after KILL: GONE
```

**SIGTERM ends a stopped process on macOS and does not on Linux.** CI runs on
`ubuntu-latest`, so the mutation proof was re-run there:

```
1. a watchdog fires on wall clock, not on elapsed sleep
  ok    the shipped watchdog stopped the process after the clock jumped past the deadline
  ok    it wrote its cap line into the process log
  ok    the 2026-08-27 sleep-based watchdog does NOT fire on the same input, which is the defect

1b. a watchdog stops a SIGSTOPped child, and stops it within 5s of the deadline
  FAIL  a SIGSTOPped child outlived its deadline: it took no TERM and was never KILLed
  FAIL  it took 8s after the deadline, outside the 5s budget
  ok    it wrote its cap line into the process log for the suspended child too
  ok    the 2026-08-27 sleep-based watchdog does NOT fire on a suspended child either, which is the control
```

Section 1 stays green while 1b goes red, which is the discrimination the case
exists to provide. The unmutated file was baselined in the same container first,
so the 9 pre-existing failures of a bare container with no `git` were not
mistaken for the diff's. Both platforms are now named in the case's own comment.

`bash scripts/poc/test-harness-caps.sh`: **60 of 60**, exit 0.

### The claim lease was taken, and then closed unmerged

`scripts/poc/claim.sh claim AUT-9 executor` was run before the work started, as
`CLAUDE.md` 13 requires. It opened #229. AUT-9 shipped in #230 at 20:06Z, before
#229 had cleared `quality`, so **the claim protected nothing at any point in its
life** and was closed with that reason on it. That is the fourth instance of the
same defect and it fed straight into CLAIM-01.

---

## 3. Why RULE-04 did not prevent the R-128 allocation

The dispatch asked why, and whether the gap is that RULE-04 gates merges while
nothing gates authoring. **It is, and the gap is real.** Carded as `RULE-09`. No
fix was built.

### It is not a defect in RULE-04

`scripts/poc-free/check-open-branch-ids.mjs` runs in `quality` on a pull request,
and its own header says so in terms:

> THE COUNTER CONVERTS A RACE INTO A CONFLICT ONLY AT MERGE TIME, AND ALLOCATION
> HAPPENS HOURS EARLIER.
>
> … That is why this is a CHECK IN `quality` and not a procedure in a document.

It was built as a merge-time detector and it named authoring-time as out of
scope.

### It would have caught R-128 at merge time. Verified by running it.

A worktree was cut at `ba8cc3c`, where `main`'s counter reads `R-128`, and a
ruling was written under that id exactly as a session obeying `CLAUDE.md` 8b step
1 would write it:

```
  ids added vs main    R-128
  compared             6 of 6 other open branch(es)

check-open-branch-ids: AN ID IS CLAIMED TWICE ACROSS OPEN BRANCHES.
  ruling id R-128 is ALSO CLAIMED, with a different heading, on open branch triage/20260904-220003 (#207)
      here:  ### R-128
      there: ### R-128 - the three deviations in the input report, ratified individually ...
EXIT=1
```

**The gate works. It fires after the ruling is written.**

### And the one authoring-time signal it does emit pointed at the wrong branches

The same check, same worktree, **nothing yet written**, which is the moment a
session actually allocates:

```
  ids added vs main    none
  compared             6 of 6 other open branch(es)
  note: poc/state-20260906-040016 (#223) also points at R-128. Whoever writes second must re-read it.
  note: poc/report-20260905-010004 (#209) also points at R-128. Whoever writes second must re-read it.
  note: poc/report-20260904-220003 (#206) also points at R-128. Whoever writes second must re-read it.
check-open-branch-ids: OK. No id added by this branch is claimed on another open branch.
EXIT=0
```

| branch | its counter | highest ruling it has written | flagged? |
|---|---|---|---|
| `poc/state-20260906-040016` (#223) | R-128 | R-127 | **yes** |
| `poc/report-20260905-010004` (#209) | R-128 | R-127 | **yes** |
| `poc/report-20260904-220003` (#206) | R-128 | R-127 | **yes** |
| `triage/20260904-220003` (#207) | R-135 | **R-134** | no |
| `triage/20260905-010004` (#210) | R-142 | **R-141** | no |

The counter note is an **equality test**. A branch that has consumed R-128
through R-134 has a counter reading R-135, which is not equal to R-128, so it
produces silence. **The check is loudest about the three branches that claim
nothing and silent about the two that hold fourteen ids.**

### A second gap, found while allocating an id for the card

`check-open-branch-ids` reads `decisions/inbox.md` and `decisions/NEXT-RULING-ID`
and **never opens a board**. Card ids have no cross-branch check of any kind. The
scan found `RULE-07` on #207 and `RULE-08` on #210, neither on `main`. A session
allocating the next `RULE` id from `main` alone today would take `RULE-07` and
collide. **This card is `RULE-09`.**

---

## 4. CLAIM-01. One file per claim

Both halves of the card are answered: the collision half is fixed and proved, the
latency half is refused with its reason, which the card's own defaults permit in
terms.

### The collision half

Claims move out of the single `claims` object in `docs/poc/state.json` into **one
file per claim**, `docs/poc/claims/<CARD-ID>.json`. Two simultaneous claims are
then two **adds of different paths**; a release is a **deletion**. Git merges both
without overlap by construction, with no merge driver for anybody to configure.

`scripts/poc/claims.mjs` is the one reader and the one writer. `eligible.mjs`
imports it, `claim.sh` calls it. The logic used to be a `node -e` program inline
in `claim.sh` and **could not be reached from a test at all**, which is why it
moved.

`npm run prove:claim-merge`, wired into `quality` by name and not path filtered:
**29 of 29**. It performs real git merges in throwaway repositories, drives the
shipped writer, and runs the pre-CLAIM-01 shape beside it as a control that must
still conflict:

```
2. THE CONTROL: the same two claims in one object, which is what shipped before
PASS  the first legacy claim merges clean, exactly as it always did
PASS  the SECOND legacy claim CONFLICTS, which is the defect this card removes
PASS    ...and the conflict boundary runs THROUGH the claims object
PASS    ...so deleting only the markers leaves a claims map that does NOT parse
```

Case 8 drives the shipped `claim.sh` end to end against a bare origin on this
machine, twice in one session: each branch carries **only** its own claim file,
the second does not carry the first, the terminal is returned both times, and
both merge clean.

### The branch-return fix was wrong first, and the second is a trap

`claim.sh` used to leave the tree on the claim branch, so the second claim of a
session was cut from the first claim's tree and carried it in its diff. A closing
`git checkout` fixed it, verified working, and then the same test piped into
`head -1` left the terminal on `poc/claim-bbb-02`: `head` closes the pipe, the
script dies on SIGPIPE partway through its closing `echo`s, and the last line
never runs. It is now `trap claim_return EXIT PIPE TERM INT`, re-measured under
the same truncation.

### The latency half is not fixed

`claim.sh check` still cannot report a claim as held before its pull request
merges, because the claim is not on `main` until then. **A fifth instance was
measured today**, #229 above. What is used instead is what R-063 already
identified as the only signal that existed at the moment it was needed: the open
pull request list, read before starting. This card was itself taken that way,
with no lease at all.

### `run.sh` is deliberately unchanged

It writes the harness's own claim into `state.claims` and it is a **deployed
copy**: `install.sh` puts it in `POC_BIN_DIR` and installing is an owner action.
Moving its writer without an install would hide every harness claim for that
window. The reader is the **union** of both stores, directory winning, and
`docs/poc/claims/README.md` states the condition for dropping the legacy half.

`CLAUDE.md` section 13's claims bullet is corrected in place under section 9c,
with the old sentence quoted.

---

## 5. DIG-01. The recommendation reaches the digest whole, and so does the digest

Written after this report first landed in #231, and appended in #233 rather than
filed as a second report, because it is the same session.

### Three cuts where the card named two

`firstLine` does two things to this field and both are wrong for it: it keeps only
the **first line**, and it cuts that line at a limit.

| block | was | now |
|---|---|---|
| TRIAGE escalations | `firstLine(e.recommendation, 160)` | whole |
| EXECUTOR escalations | `firstLine(e.recommendation, 180)` | whole |
| WAITING ON YOU, via `recommendationOf` | `firstLine(..., 220)` | whole |

The same field was three different lengths in three places. The truncations the
card's defaults say stay are untouched: titles at 90, questions at 200, change
lines at 140.

### And a second cut that made the first fix worthless

`buildDigest` capped its **whole output** at `TELEGRAM_MAX = 4096` with
`"… truncated, see the run log."`. That output is the **full** digest, written to
a file under `FULL_DIGEST_DIR` and never sent; the message that goes to Telegram
is the **plain** digest, which was never capped at all. Telegram's limit was
cutting a file and telling the reader to see the log they were already reading,
while the string that actually has to fit in a Telegram message had no guard.

Measured: run `dig01-check` on 2026-09-06 wrote 5428 bytes, and the `ESCALATIONS`
block, the last block in the digest, was cut after its first entry. That block is
where this field lives.

**The two defects were masking each other.** Run against the pre-fix
`notify.mjs` from `origin/main`, the cap never fired, because `firstLine` had
already shortened every escalation enough to keep the digest under 4096. So the
case asserts separately that the restored cap **fired**.

### The before, from the real pre-fix file rather than a mutant

```
- MIG-01: Does the integration keep applying merged migrations to production, or is it turned off?
  recommended: Take option (b) and keep the integration, because it has applied at least five migrations correctly and the friction it removes is real.

--- marker present? ---
0
```

Four of the five lines gone, and `LAST-CHARACTERS-MARKER-8F2A` absent.

### A third defect, found while building the test seam

`notify.mjs` had no direct-run guard, so importing it built a whole digest and
**sent a Telegram message**. The guard added is the one `eligible.mjs` already
carries.

**The first version of that guard was wrong.** `import.meta.url` is resolved
through symlinks and `process.argv[1]` is not, so under a `/var/folders/...` path
on macOS the two differed, `RUN_DIRECTLY` came out false, and the script did
nothing and **exited 0**, which is indistinguishable from a digest with nothing
to say. It compares `realpathSync` on both sides now. `eligible.mjs` carries the
unhardened form and is exposed the same way; it was left alone because it is not
this card.

### The card's `plain` field was wrong and is corrected, with the old text quoted

It said the cut reaches the owner *"before sending it"*. It does not. Verified by
reading all three renderers rather than assuming: `renderBoth()` sends the plain
digest and writes the full one to a file marked *"not sent, not linked, not
announced"*; `plain-digest.mjs`'s NEEDS YOU block renders the card's own `plain`
field; `digest.mjs` renders `q.recommendation` from the `ask.sh` spool with **no
limit**, and reads `runState.escalations` only for a timestamp. The cut field is
read by whoever maintains the harness, in the run log.

### One process miss, recorded rather than tidied

CLAUDE.md 2 says `todo -> in_flight` is committed **first**. On DIG-01 it was not:
the work was written before that flip was committed. Nothing had been pushed, so
no reader saw a stale board and the cost was zero. It is on the card and in the
flip's own commit message, because a flip commit dated before the work it
precedes would read as compliance. AUT-9 and CLAIM-01 were both flipped first,
correctly.

### Two stray files left in the operator's log directory

`/Users/ivan/rc-poc-logs/dig01-check.full-digest.txt` and
`dig01-check2.full-digest.txt` were written by two measurement runs of
`notify.mjs --dry-run`. They are **not** real runs. They were left in place rather
than deleted, because CLAUDE.md's hard rules make deleting files outside a scratch
directory owner-confirmable, and they are named here so nobody mistakes them for
run records.

---

## What is owed, and to whom

| item | owed by | why |
|---|---|---|
| `scripts/poc/install.sh` re-run | **the owner** | `run.sh` on this branch is unchanged, so nothing breaks without it. The legacy read exists precisely so that no install is required today. Running it is what eventually lets the legacy read go. |
| RULE-09 | the board | the authoring-time id check. Carded, not built, per the dispatch. |
| CLAIM-01's latency half | a future card | it is a redesign of the lease and needs a decision this card does not carry. |
| the 4096 guard in `send()` | a future card | it was removed from the wrong string, not moved. A plain digest over 4096 characters is refused by Telegram with an HTTP status `notify.mjs` reports, which is loud rather than silent, so nothing is worse than before. |
| `eligible.mjs`'s direct-run guard | a future card | same symlink exposure as `notify.mjs` had. Left alone because it is not DIG-01. |
| two stray `dig01-check*.full-digest.txt` files | **the owner** | deleting outside a scratch directory is owner-confirmable. |
| P3-13b's stranded `in_flight` flip (R-078) | the same future card | the same latency at a three hour timescale. |

## Learnings appended

Eight entries in `docs/LEARNINGS.md`:

1. SIGTERM kills a stopped process on macOS and does not on Linux.
2. A mutation that changes nothing is a finding, not a nuisance.
3. A JSON object is not a mergeable store, however small the writes are.
4. The claim mechanism cannot protect work shorter than a CI cycle.
5. The script that fixes a session-scoped bug has to survive a killed session.
6. The cap was on the wrong string, in both directions.
7. Two defects can mask each other and make the fixture look harmless.
8. `import.meta.url` is a real path and `process.argv[1]` is whatever was typed.

## Rulings in force this session

R-059, R-082, R-085, R-086, R-098, R-122, R-123, R-124, R-127, R-142, and R-143
written here.
