# EXECUTOR, 2026-09-02: P3-11a, the ruling path stops being consumed by the responder

Card **P3-11a**. Branch `card/p3-11a`. No migration, no database, no secret read,
no production write.

---

## 1. The defect, in one paragraph

Telegram's `getUpdates` is **destructive**: calling it with an offset deletes
every update below that offset, server side, for everybody. `responder.sh` polls
every 60 seconds, classifies, deliberately does **not** answer ruling forms
because `inbox.mjs` owns them, and then acknowledges the offset past **every**
update it read, rulings included. So a ruling the owner sent was deleted within a
minute, and `inbox.mjs`, which runs on the three hour harness cycle, never saw
it.

`inbox.mjs` has been printing a line describing exactly this failure mode for as
long as it has existed:

```
getUpdates returned no messages from a human.
Telegram keeps updates for 24 hours only, and a webhook or an earlier
read with an offset consumes them.
```

It was diagnosing itself.

## 2. The fix, which is the shape ASK-01 already chose

**One process reads the bot; everything else reads a file.** `ask.mjs` says this
in its own header and gives the reasoning: two processes polling one bot do not
share a queue, they race for it, and the loser never sees the message. ASK-01
applied it to the answer channel. This card applies it to the ruling channel.

- **`scripts/poc/ruling-spool.mjs`** - a spool, `pending/` and `consumed/`, one
  file per update, named by `update_id`.
- **`chat-classify.mjs`** now **writes** a ruling form to that spool where it
  used to only label it.
- **`inbox.mjs`** reads the spool. It no longer calls `getUpdates` on the ruling
  path at all.
- **`responder.sh`** keeps the socket.

### Which process keeps the socket, and why

**`responder.sh`.** It already holds it, it already polls on the 60-second cycle
the owner's answers need, and it already invokes `chat-classify.mjs`, which
ASK-01 had **already** made the single reader for the answer channel. Moving the
socket to `inbox.mjs` would put the owner's chat replies on the three hour
harness cycle in order to fix the ruling path, which trades one broken channel
for another.

### A second spool directory rather than the ask spool

An ask answer is consumed by a **blocked** role within seconds. A ruling is
consumed by the next harness run, hours later. One directory holding two
lifetimes is a directory whose cleanup rule cannot be stated.

## 3. The failure mode the fix could have introduced, and the guard for it

If the spool write fails, the ruling is lost exactly as before, and **worse**,
because now everyone believes it is on disk.

So `chat-classify.mjs` reports **two** outcomes where it used to report one:

| outcome | meaning | what `responder.sh` does |
|---|---|---|
| `ruling` | it reached the spool | acknowledges normally |
| `ruling_unspooled` | the write failed | **acknowledges nothing at or past it** |

A broken disk therefore costs a repeated classification and never a lost
decision.

**This is not the narrowed offset the card forbids.** Every ignored message,
every question and every routed answer is still acknowledged exactly as before.
The reclassify loop the old comment warns about needs a message that is read and
never acknowledged, and after this card the only message that can happen to is
one whose spool write failed.

## 4. The responder's offset program is RUN by the test, not copied into it

It sits between `# EXTRACT-BEGIN highest-ackable` and `# EXTRACT-END
highest-ackable` in `responder.sh`, and the test lifts it out and executes it.
That is the convention `test-ask-digest.sh` already uses for `ask.sh`, and the
reason is in that file: a copy drifts, and the assertion goes on passing about
the copy.

## 5. Acceptance, run

```
$ bash scripts/poc/test-ask-digest.sh
  ...
  P3-11a: a ruling in the same batch as a chat message
    ok    one batch classifies as one question and one ruling
    ok    the ruling reached the spool, named by its update id
    ok    the responder acknowledges past both updates, because the ruling is safely spooled
    ok    inbox.mjs reads the ruling off the spool AFTER the responder acknowledged it
    ok    inbox.mjs resolves the spooled ruling to its card
    ok    a dry run leaves the spool untouched
    ok    the old-classifier mutant was built
    ok    the mutant still runs and still classifies the ruling, so it is a real control
    ok    the old classifier spools nothing, which is the defect
    ok    against the old classifier the ruling is LOST, which is what this case had to show fail
    ok    the acknowledgement stops below a ruling that failed to spool, and does not skip past it
    ok    when the only update is an unspooled ruling, nothing is acknowledged at all
    ok    exactly one file acknowledges an offset, and it is responder.sh
  ...
  all ask and digest assertions passed        (85 assertions, exit 0)

$ node scripts/poc/inbox.mjs --self-test
  self test: 25 passed, 0 failed

$ npx tsc --noEmit
  (exit 0)
```

### The failing half

The card requires the case to **fail against the pre-card behaviour**, and it
does. The mutant is a copy of the tree whose `chat-classify.mjs` has its imported
`spoolRuling` replaced by a no-op **that succeeds** - which is precisely what the
file did before: report `ruling`, write nothing. Against it, the same two-update
batch produces `read 0 spooled ruling(s)` from `inbox.mjs`.

The mutant is additionally asserted to **run and still classify the ruling**,
because a mutant that dies on import writes nothing either and would satisfy the
same assertion while proving nothing. That control is `test-ask-digest.sh`'s own
standing rule and it is followed here.

## 6. One reader, checked mechanically rather than claimed

```
$ grep -l 'getUpdates?offset=\|getUpdates", "?offset=' scripts/poc/*.mjs scripts/poc/*.sh
  scripts/poc/responder.sh
```

That grep is one of the thirteen assertions, so the claim cannot quietly stop
being true.

**`inbox.mjs` still contains one `getUpdates`, and it is not a second reader.**
It is in `resolveOwner()`, it carries **no offset**, and an offset is the only
thing that consumes. It also is not a process: it runs only under
`--resolve-owner`, typed by hand, once, before `TELEGRAM_OWNER_ID` exists at all,
which is before the responder can classify anything. It is annotated in place.

**The grep found itself on the first run**, because the test file necessarily
contains the string it is searching for. It is now excluded by name rather than
by a cleverer pattern: a pattern tuned to exclude the searcher is a pattern that
can stop matching the real thing without anybody noticing. That is the same
defect class `docs/LEARNINGS.md` records as "a matcher that fails to match
reports as no work", caught here in its inverse form.

## 7. Consumed, never deleted

`inbox.mjs` **moves** a spooled ruling to `rulings/consumed/` rather than
removing it. After this card that file is the **only** surviving copy: Telegram
deleted the original the moment the responder acknowledged it. An unreadable
spool file is reported and left in place for a human rather than skipped, and an
archive move that fails leaves the file in `pending/` to be judged again, because
re-judging a ruling is survivable and losing one is not.
