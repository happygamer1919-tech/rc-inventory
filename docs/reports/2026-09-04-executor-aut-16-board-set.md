# EXECUTOR, unattended run 20260904-010000: AUT-16, one board set

**Role:** EXECUTOR
**Run:** 20260904-010000, unattended, scheduled, worktree `/Users/ivan/rc-inventory-poc-run`
**Date:** 2026-09-04
**Cap:** 45 minutes of wall clock, 2 cards. **The cap arrived with PR #186 open
and its `quality` check still running.** One card was worked, none was merged.

---

## 1. Boot status report, printed before any write

**`docs/board/rc-board-phase2.json`**, as_of 2026-09-03T22:18:00Z, 62 cards:
`shipped` 44, `in_flight` 1, `blocked` 2, `todo` 15, `halted` 0.
Launch gate **6/9** (G4, G7 and G9 fail).
Blocked: P2-08b on `andre`, P2-14 on `client`. In flight: AUT-3.

**`docs/board/rc-board-phase3.json`**, as_of 2026-09-03T21:05:00Z, 65 cards:
`shipped` 31, `todo` 34, nothing blocked, nothing in flight.
Launch gate **0/9**.

**Claims** in `docs/poc/state.json`: AUT-15 held by `harness` since
2026-09-04T02:53:49Z. That card is already `shipped`, so it blocked nothing. No
other claim existed and no card was skipped for one.

**Next eligible card: AUT-16.** Second AUT-17, third AUT-18.

**Open pull requests this run did not merge, reported and not touched:** #184,
#182, #181, #175, #172, #157.

---

## 2. Cards touched

### AUT-16, `todo` to `shipped` ON THE BRANCH. PR #186, OPEN AND NOT MERGED AT THE CAP.

**READ THIS FIRST.** The acceptance passed and the `quality` check was still
running its End to end step when the 45 minute wall clock cap arrived. **Nothing
was merged by this run.** The board edit in this pull request says `shipped`,
which is the normal pattern (the board flip rides in the same pull request as the
code), but `main` is untouched and AUT-16 is still `todo` there. The next run
merges PR #186 on green `quality` FOR WHATEVER ITS HEAD SHA IS THEN, read with
`npm run checks:state 186`, never on an inherited result.

**AND THIS COMMIT IS ITSELF THE REASON THAT SENTENCE IS WRITTEN THAT WAY.** The
green run described below belongs to sha `1d2dd22`. Correcting this report pushed
a new commit, so that result is now attached to a sha nobody is proposing to
merge, which is exactly the trap CLAUDE.md section 3 names. Read
`mergeStateStatus` beside the check result, always.

The first run for this branch FAILED on the new step with
`scripts/poc/claim.sh: line 79: node: command not found`. `claim.sh` replaced
`PATH` outright with this machine's tool paths, which is right for launchd and
makes the script unrunnable anywhere else; it had never been invoked outside this
machine until `test-board-set.sh` started calling it, so the defect had nowhere
to show. Fixed by appending the inherited `PATH` rather than replacing it. Every
step of the second run passed up to and including
`Prove the board set is the union of the boards`; only End to end was still
running at the cap.

**The card:** the harness resolves a card id against every open board, so the
owner can answer a phase 3 question from Telegram and the digest can see the work
that is actually being done.

**What was actually wrong.** Three components each independently hardcoded
`docs/board/rc-board-phase2.json`, while every unattended run since 2026-08-30
worked the phase 3 board. Nothing was red at any point, because a hardcoded path
does not fail, it answers about the wrong thing:

1. **The answer channel.** `scripts/poc/inbox.mjs` built its known-card set from
   that path, so `R P3-27 default` came back `no card P3-27 on the board`. P3-27
   was the oldest unanswered question in this repository. The owner could not
   have answered it from his phone if he had tried.
2. **The digest.** `plain-digest.mjs` counted shipped cards and read the launch
   gate off that one board, so the phase 3 cards shipped since 2026-08-30 were
   invisible and one gate figure silently meant the first board.
3. **Eligibility and claims.** `eligible.mjs`, `run.sh`, `claim.sh` and the
   silence rule computed against a board nobody was working. That is how a claim
   on AUT-10 came to be written at the end of a run that spent its time on P3-11.

**What shipped.** `scripts/poc/boards.mjs` is now the only place a board file is
named, and a fourth board is a one-line change there. The test greps every live
component for a board filename, because the property being protected is that
there is exactly one place, and a behavioural test cannot see a fourth copy
arriving.

Per the card's `defaults`, applied and logged rather than asked about:

- **The set is a LIST, not a repoint.** Pointing the old constant at the phase 3
  board would have moved the blindness rather than removed it.
- **Order is phase 3 first, then phase 2**, on R-061's stated priority, and the
  lowest-id rule applies WITHIN a board because two id namespaces do not sort
  against each other.
- **An id on two boards fails loudly** rather than resolving to one of them.
- **The closed phase 1 board is not in the working set.** It is named under
  `CLOSED_BOARDS` so a tool that wants it for id resolution can reach it without
  hardcoding a path, which leaves AUT-11 its own decision.
- **Each board reports its own launch gate figure.** 6 of 9 and 0 of 9 is not
  6 of 18.
- **Telegram is exactly as narrow as it was.** The two accepted forms are
  untouched and `TELEGRAM_OWNER_ID` still gates every message. Only which card
  ids resolve has widened.
- **No credential value is read, printed or logged** by anything this card
  touched.

**Two defects on the same path, found while working it and fixed with it.**
`claim.sh` upper-cased the id it was handed, so a lease on `P3-04b` was stored as
`P3-04B` and `eligible.mjs` looked it up verbatim and never found it: the lease
was written, reported as taken, and honoured by nobody. And `run.sh` read one
board when reporting branch work, so every phase 3 card worked on a branch
reported `unknown`, which is silence wearing a status.

**The merge window, which is the part that would have bitten later.** `run.sh`
and `digest.sh` are deployed copies under `/Users/ivan/rc-poc-bin`, while the
`.mjs` files beside them are read out of a worktree at `origin/main`. For one
merge window a NEW shell script calls an OLD parser. The first draft passed the
set as one packed `--board "a b"` argument and `test-install.sh` caught it:
`the board did not parse`. The set is now passed as **repeated `--board` flags**,
whose old reading is the old behaviour rather than an error, and both scripts
fall back to the phase boards present in the commit when `boards.mjs` is absent
from it, and log that they did.

**Acceptance, run and passed.** `bash scripts/poc/test-board-set.sh`, **25
passed, 0 failed**, wired into `quality` by name as the step
`Prove the board set is the union of the boards  # AUT-16-BOARD-SET-PROOF`.
Every half runs the real function, and **every half carries a failing case that
was RUN**, built by handing that same real function ONE board:

```
$ node scripts/poc/inbox.mjs --classify "R P3-27 default" --classify-from 111 \
    --classify-owner 111 --classify-boards "docs/board/rc-board-phase2.json"
{"accepted":false,"reason":"no card P3-27 on the board"}

$ node scripts/poc/inbox.mjs --classify "R P3-27 default" --classify-from 111 --classify-owner 111
{"accepted":true,"form":"default","cardId":"P3-27","text":null}
```

Also green in the same run: `test-harness-caps.sh`, `test-ask-digest.sh`,
`test-install.sh`, `inbox.mjs --self-test`, `validate-board.mjs`,
`check:unique-ids`, `check:conflict-residue`.

### AUT-17, not started

Second eligible card. Not claimed and not touched. It needs four proved-to-fail
halves against a constructed fixture repository with two same-date reports
committed in an inverted order, and the wall clock left after AUT-16 merged was
not enough to finish and merge it. Starting it would have left work on a branch,
which is the outcome CLAUDE.md section 13 names by name.

---

## 3. Escalations

**None.** Nothing on this run needed a decision the card's `defaults` did not
already cover, so nothing went to `ask.sh` and nothing was blocked on anybody.

## 4. Findings reported and deliberately not fixed, per CLAUDE.md section 3

1. **`R p3-04b default` is still refused by the accepted-form regex.**
   `FORM_DEFAULT` in `inbox.mjs` reads `[A-Za-z0-9]+-[0-9]+` and stops at the
   digits, so every card with a lower-case suffix (`P3-04b`, `P3-11a`, `P3-13c`)
   is unreachable through the message form even though the id now resolves
   correctly. AUT-16's `defaults` say in terms that the reader does not get wider
   here, so this is written up in `docs/LEARNINGS.md`, named in the test as
   deliberately not asserted, and wants a card of its own.
2. **`scripts/poc/test-chat-classify.sh` fails on `main`, before this branch.**
   Verified by running it in a clean worktree at `HEAD`:
   `the five outcomes, in order: expected [ignored,empty,ruling,ruling,question],
   got [ignored,empty,ruling,ruling,answer]`. It is **not wired into `quality`**,
   which is why nobody has seen it. Reported, not touched.
3. **`scripts/poc/install.sh` must be re-run.** CLAUDE.md section 15 requires it
   after any change to `run.sh`, `responder.sh` or `digest.sh`. This card changed
   `run.sh` and `digest.sh`. The deployed copies under `/Users/ivan/rc-poc-bin`
   are stale until somebody runs it. The fallback paths added in this card mean a
   stale deployed copy degrades to the old single-board behaviour with a log line
   rather than dying, but it is still stale.

## 5. Learnings

Three entries appended to `docs/LEARNINGS.md`:

- three components holding three copies of one path, and the rule that the list
  of a kind of thing becomes a module before the second consumer is written
- a deployed shell script and a worktree-read module do not upgrade together, so
  choose the argument shape whose OLD reading is the old behaviour
- folding an id on the way in and not on the way out makes a lease that protects
  nothing, which is the fourth instance of that class in this repository

## 6. What the next run should pick up first

**PR #186, this run's own card.** Run `npm run checks:state 186`, and merge on a
green `quality` that exists FOR THE CURRENT HEAD SHA. Do not trust the run that
was in flight when this report was written: committing this report moved the
head, so that result belongs to an earlier sha. Every step before End to end had
passed on it. Only after the merge is AUT-16 shipped on `main`.

After that, **AUT-17**, then AUT-18.

**But read this first: the eligible-card selector now returns phase 3 cards
ahead of phase 2 ones**, because that is what AUT-16's `defaults` require and
what R-061 says the owner's priority is. From the next run onward the harness
line will read `EXT-10, EXT-11, ...` before it reaches `AUT-16`'s neighbours. A
run that expected the phase 2 board to be the queue is reading a stale premise;
R-071 already superseded that half of R-061.

**And the three findings in section 4 are unowned.** The `install.sh` re-run in
particular is an owner-or-terminal action that nothing on the board tracks.
