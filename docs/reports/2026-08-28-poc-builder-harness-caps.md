# POC-BUILDER, 2026-08-28: the cap that never fired, the ruling that was lost, and the lock nobody could take

**Role:** POC-BUILDER. **Session:** 2026-08-28 UTC.
**Cards:** none. This terminal builds the harness and never works board cards.
**Branch:** `poc/19-harness-caps`. One PR.

Committed per AUT-1. Three defects in `scripts/poc/run.sh`, all found in run
`20260827-220052`, all now closed and all now proved by a test that runs in CI.

---

## 0. The correction that changes what this card is for

**The three missed windows were not the lock's doing, and stale lock reclaim
would not have recovered them.** The card reads as though the 01:00, 04:00 and
07:00 runs started, found `run.lock`, logged a refusal and exited. They did not
start.

`run.sh` opens `/Users/ivan/rc-poc-logs/<run-id>.log` and tees into it *before*
it tests the lock, so a refused run leaves a log file by construction. There is
no `20260828-*` artifact of any kind in that directory: no log, no prompt, no
board snapshot. Those three invocations never happened, which is also why
`launchd.err.log` is empty and stamped Aug 26.

The mechanism is launchd's. A `StartCalendarInterval` that comes due while the
job is already running is dropped, not queued, because launchd will not run a
second instance of a label. And `pmset -g log` accounts for 29853 of those 31300
seconds with the machine asleep, so the firings that landed during sleep
coalesce into one on wake, which then hits the first rule anyway.

**What that means for the three fixes.** Fix 1 is what restores the windows: a
run that ends on time frees the label. Fix 3 is a backstop for a lock whose
process is already gone, and for the case where a run does start and finds
wreckage. It is worth having. It is not the repair for a lost window, and I
would rather say so now than have it look fixed and recur.

---

## 1. Why the 45 minute cap did not fire

**Root cause, measured, not hypothesised.** `sleep N` on macOS is `nanosleep`,
backed by `mach_absolute_time`, and **that clock does not advance while the
system is suspended**. The watchdog was a background `sleep 2700`. It was not
broken and it was not slow. It was waiting for 2700 seconds of *awake* time.

The executor was invoked at 02:00:52Z and returned at 10:42:32Z: 31300 seconds
of wall clock. Over that exact window `pmset -g log` accounts for **29853
seconds asleep against roughly 664 seconds awake** across 206 sleep/wake
transitions. The watchdog had been given about eleven minutes of the forty five
it was counting.

This also explains the thing that looked contradictory in the card: the TRIAGE
watchdog fired and the executor's did not, from identical code. TRIAGE ran
10:42:33Z to 10:57:34Z, by which time the machine was awake continuously, so its
900 seconds of sleep were 900 seconds of wall clock, to the second.

**Fix.** Every bounded wait in `run.sh` now stores a deadline and polls
`date +%s` against it. `date +%s` is `CLOCK_REALTIME` and does advance across a
suspend, so a suspend merely makes one poll interval long and the poll after it
finds the deadline already passed. Three call sites, all the same defect:

- the executor watchdog,
- the TRIAGE watchdog,
- the per-call killer inside `gh_bounded`. That one is included because it sits
  inside `merge_when_green`, inside the lock: a `gh` call that hung across a
  suspend would block the run for as long as the machine stayed asleep, which is
  another road to exactly this incident.

**The exit line now reports the truth.** `capped` is decided by elapsed against
the cap, never by whether a watchdog line was found:

```
EXECUTOR finished, exit 0, elapsed 31300s of 2700s cap, capped yes, watchdog fired no
```

The two are reported separately because when they disagree the disagreement is
the news, and the run says so in its own log:

```
HARNESS DEFECT: the executor outran its cap by 28600s and the watchdog did not
stop it. Read run.sh before trusting this run.
```

The old line, `capped no`, was not lying. It was truthfully reporting the only
thing it measured, which was whether a string was in a file.

---

## 2. TRIAGE now checkpoints its PR the moment the PR exists

**What was lost.** TRIAGE opened PR #83 on `triage/20260827-220052` at
10:57:07Z and was killed 27 seconds later. `claude -p` prints its transcript on
completion, so a session stopped mid-sentence prints nothing at all: the run log
named neither the PR nor the branch, and eight rulings sat in an open PR that no
later run and no reader had a pointer to. Everything needed to reach that work
was known to GitHub the instant the PR was created and known to the harness
never.

**Fix, and it does not rely on the model reporting anything.** A poller runs
beside TRIAGE and asks GitHub every 15 seconds whether a PR exists on the branch,
writing one line on first sighting, to the run log *and* to
`<run-id>.checkpoint`:

```
checkpoint run=20260827-220052 role=triage pr=83 branch=triage/20260827-220052 report=docs/reports/2026-08-28-executor-critic-acceptance-pass.md
```

Run id, report path, branch and PR number, which is what the card asked for. A
second read after TRIAGE exits catches a PR created inside the last poll
interval; the line is deduplicated so it is written once.

**The branch is now mandated in the TRIAGE prompt** as `triage/$RUN_ID`. A branch
the harness cannot predict is a PR the harness cannot find. The previous run
happened to choose that name unprompted; nothing now depends on it doing so
again.

**The cap is raised from 900s to 1800s.** That run reached PR creation at 14m34s
and was killed at 15m00s. 1800 is twice what it needed to get that far. It is not
raised further because the whole run has to fit the three hour gap between
windows: executor 2700 + TRIAGE 1800 + two merge waits of 900 is 6300 seconds,
and that number is now written into the lock (below).

---

## 3. Stale lock reclaim

A refusal is only correct while the holder is inside the budget it declared. Past
that it is not a running peer, it is wreckage.

The lock now carries `run_id`, `pid`, `pgid`, `started_at`, `started_epoch` and
`cap_seconds`. A lock is judged against **the holder's own declared cap** plus a
15 minute margin, so raising a cap here can never retroactively make a live run
look abandoned. The current sum is 7200 seconds, two hours, inside the three hour
window: a run that dies holding the lock costs at most the window it died in.

- **Inside the cap:** refused, exit 0, as before, but the refusal now says the
  age, the declared cap and how many seconds remain until it goes stale. It is no
  longer possible to read a refusal and not know how long it will keep happening.
- **Past it:** reclaimed, loudly, with every step logged.

**The reclaim stops the holder before taking the lock,** process group included,
because TERMing `run.sh` alone would leave the model process it started running
unsupervised, which was most of what was consuming the machine.

**It checks identity before it signals anything.** A pid recorded hours ago may
since have been recycled onto something unrelated, and killing whatever now
answers to that number would be a worse fault than the one being repaired. A pid
that is alive but is not this harness is left alone and the lock is reclaimed
around it, with the reason logged. Signalling this run's own process group is
also refused.

---

## 4. Acceptance

`scripts/poc/test-harness-caps.sh`, **23 assertions, added to the `quality`
workflow**. It runs in 12 seconds, needs no network, no `gh` and no credentials.

`run.sh` cannot execute in CI: it takes a lock, sources a secrets file and
invokes a model. So the blocks carrying the guarantees are fenced in `run.sh`
with `EXTRACT-BEGIN`/`EXTRACT-END` and **lifted verbatim** by the test. A test
that re-stated the logic would prove only that it agrees with itself; a deleted
fence fails the suite outright rather than passing on an empty extraction.

A suspend is reproduced honestly: `date` is shadowed so the wall clock jumps an
hour forward while `sleep` does not advance. That is precisely what a suspend
does to this script.

**It also runs the 2026-08-27 watchdog and requires it to fail.** A guard nobody
has watched fail is a guard nobody has tested; that rule is already in
`LEARNINGS` from P2-19 and this is it applied.

| Case | Proves |
|---|---|
| 1 | the shipped watchdog kills the process after the clock passes the deadline; the old `sleep`-based one, same input, does not |
| 2 | 31300s against a 2700s cap with no watchdog line reports `capped yes` and names the harness defect |
| 3a | a lock 600s into a 7200s cap is refused, not stolen, and the refusal reports the age and the staleness deadline |
| 3b | a 30000s old lock with a dead holder is reclaimed as an orphan |
| 3c | a stale lock whose pid has been recycled onto an unrelated process reclaims the lock **without signalling that process** |
| 3d | a lock in the pre-2026-08-28 format, with no `started_epoch`, is still aged and reclaimed |
| 4 | the checkpoint carries run id, role, PR, branch and report, once, to both places; `gh` answering empty, `null` or a non-number produces no checkpoint at all |

**Mutation tested.** Reverting the capped decision to the old grep-only form
turns case 2 red: `expected CAPPED=yes WATCHDOG_FIRED=no, got: ... capped no`.

**Run on ubuntu as well as macOS**, in a container, and it earned its keep
immediately: `stat -f %m` is the BSD spelling, and on GNU coreutils `-f` means
the *file system* and `%m` its mount point, so it succeeds and returns `/`. The
unchecked fallback made an old-format lock look zero seconds old, which is to say
immortal. Both spellings are now tried and every fallback is re-validated as a
number. Case 3d is that regression.

**End to end, against a sandboxed copy of the real script** with `claude` and
`gh` stubbed and only the absolute paths repointed:

- A hanging TRIAGE under a 30 second cap: checkpoint line written on the first
  poll, then `TRIAGE finished, exit 143, elapsed 30s of 30s cap, capped yes, pr 83`.
- `SIGTERM` to **`run.sh` itself** after the PR appeared: the checkpoint line
  survived in both the run log and the checkpoint file, and the trap released the
  lock.
- **The incident, reconstructed.** A live run holding the lock with a hanging
  model process, its `started_epoch` backdated by 30000 seconds. The next run
  logged `STALE LOCK ... has held ... for 30012s, past its declared 6300s plus a
  900s margin`, stopped process group 2059, and took the lock 15 seconds later.
  Holder, model process, watchdog and tee subshell all confirmed gone.

The real `/Users/ivan/rc-poc-logs/run.lock` was never touched by any of this.

---

## 5. Doctrine changed, deliberately

`CLAUDE.md` section 13 said flatly that a run never starts while `run.lock`
exists. Fix 3 amends that rule, so the rule is amended rather than quietly
contradicted by the code. `docs/poc/DESIGN.md` section 3 and its cap paragraph
follow. Both now also state that a cap is a deadline comparison and never a
countdown, and both name the test.

---

## 6. Not done, deliberately

- **`claim.sh` untouched**, per the card. The branch-from-`main` defect that
  closed PR #86 unmerged is real and gets its own card.
- **AUT-3 not edited**, per the card.
- **The leftover sweep still does not know about `triage/*`.** It merges open PRs
  whose head branch starts with `poc/state-` or `poc/ruling-`. TRIAGE opens on
  `triage/<run-id>`, which matches neither, which is why **PR #83 is still open
  today** with eight rulings in it. This PR makes that PR *findable* and does not
  merge it. `CLAUDE.md` section 3: the PR does what the card says and nothing
  else, and a defect noticed in passing becomes a card or a `LEARNINGS` entry. It
  is now a `LEARNINGS` entry and wants a card. It is a one-line change once
  there is one, because the branch name is now mandated and held in a single
  variable.
- **`responder.sh` not touched.** It has its own launchd agent and is not called
  by `run.sh`. Its lock staleness check already compares against `date +%s`. Its
  `POC_CHAT_TIMEOUT_SECONDS` killer is still a `sleep` and has the same latent
  defect, on a 60 second poller where the consequence is far smaller. Named here
  so it is not discovered again as if it were new.

---

## 7. What the owner has to do

**`scripts/poc/install.sh` has to be re-run after this merges.**
`/Users/ivan/rc-poc-bin/run.sh` is a deployed artifact; the repository is the
source of truth and nothing in this PR changes the deployed copy. Until that runs,
the harness on this machine still has the 2026-08-27 watchdog. I have not run it:
it does `launchctl bootout`, which terminates a live run, and the install script
refuses while `run.lock` exists for that reason.

```
cd /Users/ivan/rc-inventory && git pull && scripts/poc/install.sh
```

Then the next scheduled run reports `elapsed Ns of 2700s cap` on its exit line,
and that number is the proof the deploy took.

**Still outstanding from the previous report and not mine to do:** the leaked
`TELEGRAM_BOT_TOKEN` wants rotating via `@BotFather`.
