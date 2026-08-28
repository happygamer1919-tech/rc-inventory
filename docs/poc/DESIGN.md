# POC: the unattended run loop

**Status:** built 2026-08-26 by POC-BUILDER, authorized by R-005, with the
Telegram identity grant in R-006.

This document is the design of record for the four scheduled runs a day that
work the phase 2 board without a human in the terminal, and for the Telegram
loop that reports what they did and takes Ivan's answers back in.

It describes a **harness around EXECUTOR**, not a new role. Everything the
harness runs is bound by `CLAUDE.md`. Where this document and `CLAUDE.md`
disagree, `CLAUDE.md` wins, and the disagreement is a defect in this file.

---

## 1. What the loop is for

Ivan answers in batch, on his own schedule. The board loop already refuses to
halt on a question: it writes the question on the card, blocks the card, and
moves on. What was missing is the other half of that contract, which is that
somebody has to **ask** him, and somebody has to turn the answer into a
committed ruling.

The POC loop closes that circle:

```
  scheduled run  ->  work up to 2 cards  ->  digest to Telegram
       ^                                            |
       |                                            v
  ruling committed  <-  inbox reader  <-  Ivan answers in the group
```

Four runs a day at 22:00, 01:00, 04:00 and 07:00 local. Those hours are chosen
so that the work happens while Ivan is asleep and the digest is waiting for him
when he is not. He reads four short messages a day and answers the ones that
ask him something.

---

## 2. The pieces

| Path | What it is |
|---|---|
| `scripts/poc/run.sh` | The entrypoint. Sources secrets, takes the lock, refreshes the run worktree, invokes `claude -p` as EXECUTOR, logs, writes state. |
| `scripts/poc/inbox.mjs` | Runs first. Reads `getUpdates`, turns Ivan's replies into committed rulings, clears `blocked_on`. |
| `scripts/poc/notify.mjs` | Runs last. Sends the digest to the Telegram group. |
| `docs/poc/state.json` | What the last run did. The only POC state, and it is not on the board. |
| `docs/poc/com.ai.rc-poc.plist.template` | The launchd schedule, with no secret in it. |

### Directories, all absolute, never a tilde

| Path | Role |
|---|---|
| `/Users/ivan/rc-inventory` | EXECUTOR's interactive clone. The POC loop never touches it. |
| `/Users/ivan/rc-inventory-poc` | POC-BUILDER's build worktree. Where these files were written. |
| `/Users/ivan/rc-inventory-poc-run` | The run worktree. Reset to `origin/main` at the start of every run. |
| `/Users/ivan/rc-poc-logs` | One log per run, plus `run.lock`. Outside the repository, never committed. |
| `/Users/ivan/rc-secrets/phase2.env` | Sourced with `set -o allexport`. Never catted, never echoed. |

The run worktree is separate from the interactive clone for one specific
reason, learned the hard way: a session that runs `git checkout` in a working
copy another session is using changes that session's branch underneath it. A
scheduled run that fires at 04:00 while a terminal is open must not be able to
do that. It gets its own worktree, and it resets that worktree hard, because it
owns it completely.

---

## 3. What a run does, in order

1. **Refuse to start if `/Users/ivan/rc-poc-logs/run.lock` exists and is not
   stale.** Exit 0, log the refusal, and say how old the lock is and when it
   goes stale. Two runs in the same worktree would corrupt each other, and a
   scheduled job that overlaps its predecessor is the classic way to find that
   out at the worst moment.
1b. **Reclaim it if it is stale.** A lock older than the holder's own declared
   `cap_seconds` plus a fifteen minute margin is not a peer, it is wreckage, and
   honouring it costs one window every three hours for as long as it survives.
   The reclaim stops the holder first, process group included, and only after
   checking that the recorded pid still belongs to this harness. Every step is
   logged. See `CLAUDE.md` section 13.
2. **Take the lock.** Write the run id, pid, pgid, start time, start epoch and
   the cap this run declares, so the next run can judge this one against the
   budget it actually advertised. Release it on every exit path, including
   failure and timeout.
3. **Refresh the run worktree.** `git fetch origin`, then hard reset to
   `origin/main`. The run never inherits leftover state from the run before it.
4. **Read the inbox** (`inbox.mjs`). Ivan's answers become rulings, and the
   cards they unblock become eligible before the work starts, not after. This
   ordering is the point: an answer sent at 23:00 is acted on at 01:00.
5. **Work the board** as EXECUTOR, under the caps in section 4.
6. **Send the digest** (`notify.mjs`), on every run, including a run that did
   nothing. A silent night is indistinguishable from a broken scheduler, and
   the whole value of the loop is that Ivan does not have to wonder.
7. **Write `state.json`** through a PR, release the lock, exit.

---

## 4. The caps, and why each one exists

These are restated in `CLAUDE.md` so that a session which never opens this file
still obeys them.

**Boot as EXECUTOR.** A headless run is an EXECUTOR session with no human in
the loop. It is not a fifth role, and it gets no authority the interactive
EXECUTOR does not have.

**At most 2 cards per run.** Not a throughput target. A run that goes wrong
goes wrong on a bounded blast radius, and four runs a day at two cards is more
board movement than the backlog can absorb anyway.

**Hard cap 45 minutes.** Wall clock, enforced by the harness with a timeout,
not by the model's own judgement. A model asked to watch its own clock will
lose track of it. When the cap fires, the run stops where it is, the digest
says so, and nothing half-finished is merged.

The timeout is a **deadline the harness compares the clock against**, never a
countdown it sleeps through, because `sleep` on macOS does not advance while the
machine is suspended and an overnight countdown therefore measures awake time.
Every run reports elapsed seconds beside the cap, and elapsed is what decides
whether the run was capped. TRIAGE has its own cap of 30 minutes.
`scripts/poc/test-harness-caps.sh` proves all of this in CI by lifting the
blocks out of `run.sh` and moving the clock underneath them.

**CRITIC when the board is dry.** When every unblocked card is shipped, there
is nothing to execute and the correct next action is review, not idling. The
run invokes CRITIC against the acceptance lines instead.

**A question with no default writes an escalation and moves on.** This is
`CLAUDE.md` section 4 and section 5 wearing a different hat. If the card's
`defaults` covers the ambiguity, apply it and log it. If it does not, write the
structured decision-needed text with a recommendation, append the escalation to
`state.json` so the digest carries it to Telegram, and take the next card. The
run never waits for a human.

**DELETE-class migrations are never applied.** `DROP TABLE`, `TRUNCATE` and
`DELETE` are blocked in `CLAUDE.md` section 8.6 for an interactive session that
a human is watching. Unattended at 04:00 the answer is not "more careful", it
is no. The card blocks on Ivan with the statement quoted.

**P2-08 and P2-09 stay untouched while P2-08 is parked on andre.** P2-08 waits
on a third party, and P2-09 depends on it. An unattended run must not decide on
Andre's behalf what the webhook contract is, and it must not build P2-09 against
a contract that has not been agreed. They are skipped by id until the
`blocked_on` is cleared by a ruling.

**Never start if a lock file exists.** Restated from section 3 because it is the
one that prevents two runs from writing the same worktree.

---

## 5. Escalations

An escalation is a question that reached Ivan. It is written in `state.json` and
carried into the digest.

```json
{
  "card_id": "P2-11",
  "question": "DECISION NEEDED: ...",
  "recommendation": "...",
  "raised_at": "2026-08-26T22:14:00Z",
  "run_id": "20260826-220000"
}
```

The board is the authority on what is blocked and on whom. `state.json` is a
transport, not a second source of truth: it exists so the digest can quote the
question without re-reading every card, and so a repeated escalation can be
recognised as repeated. If the two ever disagree, the board wins.

---

## 6. The Telegram protocol

**Outbound**, every run, one message: cards shipped with PR links, cards blocked
with their question and the recommended default, CI status, escalations, and the
next eligible card.

**Inbound**, exactly two forms, and nothing else:

```
R <card-id> default
R <card-id>: <text>
```

The first accepts the recommendation the card already carries. The second is a
free-text ruling. Both become an entry in `decisions/inbox.md`, committed
through a PR labelled `poc-ruling`, and both clear the card's `blocked_on`.

Everything else in that group is **logged and never acted on**, no matter what
it says. This is deliberate and it is not a parsing convenience:

- The bot reads a group. Group membership is not authentication.
- `from.id` is checked against `TELEGRAM_OWNER_ID` before the text is even
  looked at, so a message from anyone else is discarded on identity alone.
- A natural-language instruction in that group is **not** a command. An
  unattended agent that acts on free text from a chat window is an agent whose
  authority is whoever can type in the window. The two exact forms exist so that
  authority stays with the ruling file, where it is reviewable, and not with the
  chat.

While `TELEGRAM_OWNER_ID` is unset, the reader accepts nothing at all. See R-006.

---

## 7. State, and what is not state

`docs/poc/state.json`:

| Field | Meaning |
|---|---|
| `last_run` | ISO 8601 timestamp the last run finished. |
| `run_id` | Identifier of that run, `YYYYMMDD-HHMMSS` local, matching its log filename. |
| `cards_touched` | Card ids the run moved, with what it did to each. |
| `escalations` | Open questions raised, per section 5. |
| `digest_last_sent` | ISO 8601 timestamp the last digest reached Telegram. |

**POC state never goes on the board.** The board describes the product's work.
The harness's own bookkeeping is not the product's work, and putting it there
would mean every run edits a board file it has no card for, which is exactly the
kind of quiet write the board rules exist to prevent.

The reverse also holds: `state.json` never carries a card's status. Status lives
on the board.

---

## 8. Secrets

`run.sh` sources `/Users/ivan/rc-secrets/phase2.env` with `set -o allexport` and
that is the only contact any POC file has with that directory. Values are never
echoed, never logged, never written into `state.json`, never put in a digest.
The log files are written under `/Users/ivan/rc-poc-logs`, outside the
repository, and the plist template carries a path and no value.

`TELEGRAM_OWNER_ID` is the single exception, and it is not a secret: R-006
records why.

---

## 9. What this loop deliberately cannot do

- It cannot merge on a check that is pending, failed, skipped or absent.
- It cannot push to `main`, or force push anywhere.
- It cannot apply a DELETE-class migration.
- It cannot act on free text from Telegram.
- It cannot work P2-08 or P2-09 while P2-08 is parked on andre.
- It cannot run two copies of itself.
- It cannot decide a product question. It can only ask one well and move on.
