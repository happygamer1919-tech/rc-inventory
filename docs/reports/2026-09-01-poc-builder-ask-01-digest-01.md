# POC-BUILDER: ASK-01 and DIGEST-01

**Date:** 2026-09-01
**Role:** POC-BUILDER
**Cards:** ASK-01, DIGEST-01
**Branch:** `card/ask-01-digest-01`
**Acceptance:** `bash scripts/poc/test-ask-digest.sh`, exit 0, 72 assertions, wired into the
`quality` job as the step `Prove the question channel and the scheduled digest`.
**Migrations added:** none.

---

## 1. What was broken

A foreground EXECUTOR hit a decision it was not allowed to make, wrote the
question to a terminal nobody was watching, and stopped.

Nothing went red. Nothing was blocked on the board. Nothing reached Telegram. The
run was simply gone, and the question would have taken ten seconds to answer.

The two halves that already existed are the ruling inbox and the 60 second chat
poller. What did not exist is a role RAISING a question and BLOCKING on the
answer, and a report that arrives on Ivan's clock rather than on the build's.

---

## 2. ASK-01, the blocking question channel

`scripts/poc/ask.sh <card-id> --question ... --recommendation ... --if-silent ...`

All four payload fields are required and the script refuses without them. A
question with no recommendation hands the decision back with no work done on it;
a question that does not say what silence costs cannot be prioritised.

It sends ONE message, in the plain register:

```
Blocked on you.
Should the reminder email go out from the company address or from an address nobody reads?
My recommendation: Use the company address, so a reply reaches a person.
If I hear nothing by 18:00 today: No reminder goes out and the job waits for you.
Reply "go" to take the recommendation, or reply with what to do instead.
```

**One deviation from the dispatch, stated rather than buried.** The dispatch gave
a four line shape without the `If I hear nothing` line. It is a required payload
field, and a message headed `Blocked on you` that does not say what ignoring it
costs is the message that gets left unread, so it is in the message. Everything
else is the shape as given.

### The exit codes are the interface

| exit | meaning |
|---|---|
| 0 | `go`, take the recommendation |
| 10 | `stop`, halt the card |
| 11 | `instruction`, stdout carries the owner's words verbatim from line 2 |
| 12 | `expired`, the question is on the card and committed, move on |
| 2 | usage, the payload is incomplete |
| 3 | infrastructure, nothing was sent so nothing may be assumed answered |

**Exit 12 is deliberately not 0, and that is a judgement call worth naming.** The
dispatch says it "exits clean so the harness can move to another card", and it
does: it terminates promptly with the board committed and the harness free to
continue. It does not report SUCCESS, because 0 is the code that means `go`, and
a caller writing `if ask.sh ...; then take_recommendation; fi` would otherwise
take the recommendation on an expiry. That is the exact failure the deadline
exists to prevent, so the codes are arranged to make the lazy reading the safe
one.

### The deadline is a wall clock

Every wait compares `date +%s` against a deadline computed once. There is no
countdown, no decrementing counter and no `sleep $REMAINING`, because `nanosleep`
does not advance across a suspend, which is what let a run outrun a 2700 second
cap by 28600 seconds on 2026-08-27.

The block is fenced in `ask.sh` as `EXTRACT-BEGIN ask-deadline` and lifted
verbatim by the test, exactly as `run.sh` does for its watchdog.

### Silence is not consent

On expiry the recommendation is NOT taken. An owner who never saw the message and
an owner who read it and approved it produce the same empty inbox, and a channel
that cannot tell them apart must choose the recoverable outcome. The question
goes onto the card as `blocked_on: ivan`, `status: blocked`, with the full
payload in the structured DECISION NEEDED text, the validator is run, and the
board is committed on the current branch. It is not pushed: the caller's own pull
request carries it.

### Why the answer does not come from a second Telegram poller

`getUpdates` is DESTRUCTIVE. Acknowledging an offset deletes every update below
it, so two pollers do not share a queue, they race for it and the loser never
sees the message. `responder.sh` already polls every 60 seconds and already
acknowledges everything it reads.

So `ask.sh` does not poll Telegram at all. `chat-classify.mjs`, which the
responder already invokes, gained one outcome (`answer`) and writes to a spool
under `/Users/ivan/rc-poc-logs/asks/`. `ask.sh` reads the spool.

A useful consequence: the ANSWER path needs no reinstall. `chat-classify.mjs` is
read from a worktree pinned to `origin/main`, and the installed `responder.sh`
already skips every classified kind that is not `question`.

Routing is deliberately narrow, in this order: a Telegram reply to the question's
own message; `R <card-id> go|default|stop|no` or `R <card-id>: <text>` when that
card has a question outstanding; and any text at all when EXACTLY ONE question is
outstanding. **With two or more outstanding and no reply and no card id, nothing
is routed**, because a channel that guesses which decision was approved is worse
than one that asks again.

---

## 3. DIGEST-01, the scheduled report

A third launchd agent, `com.ai.rc-poc-digest`, at 08:00 and 19:00 local. Its own
lock, its own log, its own worktree detached at `origin/main`.

It renders through `buildPlainDigest` from AUT-5, so the plain register and the
`plain` field remain the single source of wording.

**It sends only when one of four things is true**: a card shipped, a card became
blocked, a question is outstanding, or a run failed. Staleness is decided by a
CONTENT fingerprint over those signals, never by date.

**A question outstanding leads every digest until it is answered.** That is
deliberate nagging. An unanswered question is the one thing that must never go
quiet, because a role is stopped behind it.

Two decisions worth naming:

- **"A run failed" is read as a new escalation in `docs/poc/state.json`.** That
  is the repository's own existing signal, already written by `run.sh`, and it
  needs no log parsing. The limitation is stated rather than hidden: escalations
  are also written for benign claim skips, so the condition is broader than the
  words.
- **The very first run records a baseline and stays quiet** unless a question is
  outstanding or a run failed. A digest whose whole content is the state of a
  system he has been watching for a week is the noise this card removes.
  `install.sh` prints the one line that sends a proof digest by hand.

### Where it does not apply, and why that had to be written down

CLAUDE.md now has two sections that would otherwise contradict each other.
Section 13 tells an unattended run to write the escalation and take the next
card, in `run.sh`'s own words: "Never wait for an answer." Section 14 tells a
role to call `ask.sh` and block.

Both are right, for different roles, and the wrong resolution is expensive: a
scheduled run has a 45 minute cap the harness enforces by killing it, so a six
hour `ask.sh` inside that cap is killed mid-wait and leaves an open question on
the spool with NOTHING written to the card. That is strictly worse than the
escalation skip-not-halt would have produced.

So section 14 states the precedence explicitly. Skip-not-halt is unchanged for
an unattended run. `ask.sh` is for a role that can afford to wait, which is the
case that had no channel: the escalation path already existed for a run that
moves on, and did not exist for a role that cannot. A role in doubt applies
skip-not-halt, because its failure mode is a card that waits for the next
digest and the other one loses a whole run.

The test asserts that sentence is present, so it cannot be dropped in a later
edit that only looks at section 14.

---

## 4. Four defects found while building, three fixed here

### 4.1 A silent success, from an unresolved symlink. FIXED.

`node ask.mjs open` printed nothing, wrote nothing, sent nothing and **exited
0**. `ask.sh` read that as a question asked and waited out the whole deadline
against a message that had never been sent.

The cause is the entry-point idiom this repository already uses:

```
const RUN_DIRECTLY = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
```

`import.meta.url` is already symlink-resolved; `process.argv[1]` is not. On macOS
`/var` is a symlink to `/private/var`, so the same file invoked through any
`mktemp -d` path compares unequal to itself, `main()` never runs, and node exits
0 because nothing failed.

Fixed by resolving both sides with `realpathSync`, AND separately by making
`ask.sh` refuse to wait unless the open-question record exists on disk. A zero
exit says a process ended without complaining; the file says the work happened.

`eligible.mjs`, `plain-digest.mjs` and `notify.mjs` still carry the unresolved
form. None is reached through a symlinked path today, so it is recorded in
`docs/LEARNINGS.md` rather than swept: fixing three files that are not broken is
scope.

### 4.2 The board validator wrote to the machine interface. FIXED.

`ask.sh` stdout carries the verdict and, for an instruction, the owner's words.
The validator's `PASS` banners were landing in it, so a caller parsing the first
line would have read `PASS docs/board/rc-board.json (0 violations)` as a verdict.
Every diagnostic now goes to stderr.

### 4.3 The credential guard refused the commit that added this work. FIXED.

The credential shape check copied from `inbox.mjs` is unanchored:

```
eyJ[A-Za-z0-9]|gho_[A-Za-z0-9]|sk-[A-Za-z0-9]|re_[A-Za-z0-9]|bot[0-9]{8}:
```

`sk-[A-Za-z0-9]` matches the MIDDLE of `test-ask-digest.sh`. Adding a file with
that name made every board card and every future ruling that names it look like a
credential. It fired 20 times on this pull request's own staged diff, all 20 on
the filename.

A guard that refuses a legitimate commit is a guard that gets switched off. In
`ask.sh` the shapes are now anchored at a non-alphanumeric, non-underscore
boundary, fenced as `EXTRACT-BEGIN credential-shapes`, and exercised in BOTH
directions: an ordinary diff naming `test-ask-digest.sh` and containing
`features_are_re_enabled` is not refused, all five real shapes still are, and the
old unanchored form is required to fail the first of those so the case keeps
explaining why the anchor exists.

The five credential shapes the test proves are caught are ASSEMBLED AT RUN TIME
from a prefix and a body, never written as literals. Section 7 says a credential
value never appears in a commit, and a credential-shaped literal committed in a
test file is exactly what a repository-wide secret scan exists to find. Nothing
in that fixture is or ever was a real token.

`inbox.mjs` still carries the unanchored form. Recorded in `docs/LEARNINGS.md`
rather than swept.

### 4.4 The responder eats a ruling before the inbox reader sees it. NOT FIXED.

`responder.sh` acknowledges the Telegram offset for every message it read,
including the ones it classified `ruling` and deliberately did not act on.
Acknowledging deletes them server side, so `R P2-12 default` sent while the
responder is running is consumed, logged as "not answered here", and destroyed
before `inbox.mjs` ever calls `getUpdates`.

Not fixed here. It belongs to the ruling path, and CLAUDE.md section 3 says a
defect noticed in passing becomes an entry or a card, not a quiet extra commit.
Recorded in `docs/LEARNINGS.md` with both candidate fixes. **ASK-01 is unaffected:
it does not use the ruling path, which is the reason the spool design was chosen
before this defect was found.**

---

## 5. The acceptance, and why every assertion is mutation tested

Both cards are about a system being honest when nobody is watching, and every
guarantee in them fails SILENTLY when it breaks. A deadline that never fires
looks like a question nobody answered. A recommendation taken on silence looks
like an approval. A reply accepted from the wrong sender looks like a reply.

So each assertion is proved to FAIL against a mutated copy, to the standard
`test-harness-caps.sh` set.

**And each mutant is proved to RUN first, against an unmutated control in the
same scratch tree.** That control is not ceremony. The first draft of this suite
wrote each mutant as a single file into a scratch directory; those modules import
each other by relative path, so all three mutants died on the import and wrote
nothing, which looks exactly like a mutant the guard correctly refused. All three
mutation cases passed while proving nothing at all. The controls are what caught
it.

The three the dispatch names specifically:

1. **A suspend across the deadline.** The fenced block is lifted verbatim from
   `ask.sh` and run against a shadowed `date` whose offset jumps 3600 seconds
   forward. The shipped loop returns expired within seconds. The 2026-08-27
   sleep-counter shape is run on the identical input and REQUIRED TO FAIL. A
   mutant whose loop condition is not the wall clock is required to fail too.
2. **An expired question landing as `blocked_on`.** The real `ask.sh` runs end to
   end in a throwaway git repository with `--deadline-seconds 1`. It exits 12 and
   prints `expired`, never 0 and never `go`; the card is blocked on ivan with the
   payload intact; the validator is green; the edit is committed and the tree is
   clean. An expire mutated to leave the card unblocked fails the case.
3. **A non-owner reply being ignored.** A stranger sending `go` while a question
   is outstanding spools nothing and leaves the question open. An
   instruction-shaped message from a stranger reaches nothing. An unset owner id
   accepts nothing even from the right numeric sender. A classifier with the
   identity check removed is required to ACCEPT the stranger.

Full run:

```
ask.sh under test:   /Users/ivan/rc-inventory-ask/scripts/poc/ask.sh
digest.mjs under test: /Users/ivan/rc-inventory-ask/scripts/poc/digest.mjs

1. the deadline is a wall clock, and a suspend crosses it
  ok    the shipped wait returned expired once the clock jumped past the deadline
  ok    a sleep-counter deadline does NOT fire on the same input, which is the defect
  ok    an answer already on the spool is returned rather than waited out
  ok    a wait whose condition is not the wall clock fails this case, so the case has teeth

2. the question reaches the owner in the plain register, or it is refused
  ok    a well formed question is accepted and rendered
  ok    it leads with Blocked on you.
  ok    the message carries: My recommendation: 
  ok    the message carries: If I hear nothing
  ok    the message carries: Reply "go" to take the recommendation
  ok    zero card ids, ruling ids, pull request numbers, links or file paths in the message
  ok    a payload with no if-silent is refused with exit 2, nothing sent and nothing recorded

3. an expired question lands as blocked_on, and the recommendation is NOT taken
  ok    an expired question exits 12, which is not the 0 that means go
  ok    stdout says expired, and never says go
  ok    the card is blocked
  ok    it is blocked on ivan
  ok    the card question carries: DECISION NEEDED
  ok    the card question carries: RECOMMENDATION
  ok    the card question carries: IMPACT IF UNANSWERED
  ok    the card question carries: Use the company address
  ok    the card question carries: No reminder goes out
  ok    the working tree is clean, so the board edit was committed and not left loose
  ok    the commit message says the recommendation was not taken
  ok    the board validator is green on the committed board
  ok    the expired question is off the open spool
  ok    an unknown verdict is not consumed, prints nothing, and leaves the question open
  ok    it is archived where a human can see it rather than silently deleted
  ok    the unmutated copy in the same scratch tree still blocks the card, so the mutant below actually runs
  ok    an expire that does not block the card fails this case, so the case has teeth

3b. the credential guard refuses a credential and NOT an ordinary filename
  ok    an ordinary diff naming test-ask-digest.sh and ask-answer is not refused
  ok    the unanchored shape DOES refuse that same ordinary diff, which is why it is anchored
  ok    all five credential shapes are still refused, so the anchor narrowed nothing that matters

4. the three answer forms, and who they are routed to
  ok    go is read as go
  ok    default is read as go
  ok    GO is read as go
  ok    no is read as stop
  ok    stop is read as stop
  ok    nu is read as stop
  ok    anything else is an instruction, passed through verbatim
  ok    a reply to a question's own message answers that question and no other
  ok    a bare go with two questions outstanding is routed nowhere and guesses nothing
  ok    naming the card disambiguates when two are outstanding

5. a reply from anyone but the owner is ignored
  ok    a stranger's message is classified ignored
  ok    no answer was spooled from a stranger
  ok    the question is still outstanding after a stranger tried to answer it
  ok    the refusal is logged with the reason, so it is visible rather than silent
  ok    an instruction-shaped message from a stranger reaches nothing
  ok    an unset owner id accepts nothing, so a stranger cannot become the owner by messaging first
  ok    the copy in the mutant tree runs and still answers the owner, so the mutant below actually executes
  ok    a classifier without the identity check DOES accept a stranger, so case 5 has teeth

6. the digest is silent when nothing changed
  ok    the very first run records a baseline and sends nothing, rather than reporting a week of history as news
  ok    two further runs against an unchanged board sent nothing

7. the digest speaks when, and only when, one of the four things is true
  ok    a card shipping makes it speak
  ok    a card becoming blocked makes it speak
  ok    an outstanding question makes it speak
  ok    a run failing makes it speak
  ok    the copy in the mutant tree runs and still sends when something is outstanding, so the mutant below executes
  ok    a digest that always sends DOES send on an unchanged board, so case 6 has teeth

8. an outstanding question leads the digest, and repeats until answered
  ok    three runs with the question still open sent three digests, so it does not go quiet on him
  ok    the outstanding question leads the digest
  ok    the repeated digest still carries: Should the reminder email go out
  ok    the repeated digest still carries: My recommendation: Use the company address
  ok    the repeated digest still carries: Reply "go" to take the recommendation
  ok    the digest is in the plain register: no card ids, ruling ids, pull request numbers, links or file paths
  ok    once the question is answered the digest goes quiet again

9. the pieces are wired the way the installer and the poller expect
  ok    install.sh installs the digest agent
  ok    install.sh creates the answer spool, rather than leaving the poller to race for it
  ok    the responder still forwards only questions to the model, so an answer never reaches it
  ok    CLAUDE.md names ask.sh as the escalation path
  ok    CLAUDE.md says an unattended run does not block, so the 45 minute cap and the 6 hour deadline cannot collide
  ok    ask.sh parses
  ok    digest.sh parses
  ok    the digest plist parses

all ask and digest assertions passed
```

---

## 6. What Ivan has to do

**Re-run the installer on the Mac.** `digest.sh` is a deployed copy under
`/Users/ivan/rc-poc-bin`, like `run.sh` and `responder.sh`, and the launchd agent
does not exist until the installer runs:

```
bash /Users/ivan/rc-inventory/scripts/poc/install.sh
```

It refuses while a work run is in flight, which is correct. Wait, or pass
`--force`.

To see a digest immediately rather than waiting for 08:00:

```
bash /Users/ivan/rc-poc-bin/digest.sh --force
```

The ANSWER path needs no reinstall: `chat-classify.mjs` is read from a worktree
pinned to `origin/main` by the responder that is already running.

Nothing else. No credential is read, printed or logged by anything in this pull
request, and no migration is added.
