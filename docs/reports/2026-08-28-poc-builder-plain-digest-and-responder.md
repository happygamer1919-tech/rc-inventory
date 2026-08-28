# POC-BUILDER, 2026-08-27 to 2026-08-28: the plain digest, the responder, and a credential I leaked

**Role:** POC-BUILDER. **Sessions:** 2026-08-27 and 2026-08-28 UTC.
**Cards:** none. This terminal builds the harness and never works board cards.

Committed per AUT-1. The previous POC-BUILDER report was printed and never
committed, so it could not be quoted for ratification. That is the defect this
file exists to stop repeating.

---

## 1. Incident first: I leaked TELEGRAM_BOT_TOKEN

**What happened.** To check the chat poller was reaching Telegram I ran
`bash -x /Users/ivan/rc-poc-bin/responder.sh`. The trace printed the full bot
token, twice: once in the expanded `curl` command line, and once as
`TELEGRAM_BOT_TOKEN=<value>` from the line that sources the secrets file.

**Scope, checked rather than assumed.** Zero files on disk contain it across the
log directory, all worktrees and the main clone. Zero commits contain it
(`git log --all -S`). It exists in the session transcript, which cannot be
scrubbed.

**Two distinct causes, both now closed.**

1. **The debug flag.** Sourcing a secrets file under `set -x` traces every
   assignment in it, so one flag dumps the whole file rather than one variable.
   The script's own "never echo a value" discipline was irrelevant, because the
   trace is produced by the shell and not by the script.
2. **The process table.** `curl "https://.../bot<token>/..."` places the token in
   argv, readable by any process on the machine via `ps aux` for the duration of
   the call. argv is published by the kernel; no care inside the script prevents
   it.

**Fixes.** `tg_get` now feeds the URL to `curl --config -` through a here-doc on
stdin. Tracing is suppressed across the whole secrets block in both `run.sh` and
`responder.sh`, with the prior state captured and restored, and presence is
recorded as a `NAME=set` string built inside the suppression so no later check
expands a value into a traced command word.

**Verified after the fix**, by running `bash -x` on the real script and grepping
the trace for every secret in the file: zero occurrences of the bot token, the
service role key, the database password, the Resend key, the Vercel token, the
Make callback secret, the database URL and the anon key. The single match is
`TELEGRAM_OWNER_ID`, which ruling R-006 records as not a credential. `ps aux`
shows nothing.

**Still outstanding, and only Ivan can do it:** rotate the leaked token via
`@BotFather` (`/revoke`, then `/token`), and replace the `TELEGRAM_BOT_TOKEN=`
line in the secrets file. The code is safe for the new token. It cannot un-leak
the old one.

---

## 2. What shipped

| PR | What |
|---|---|
| #70 | AUT-5, the plain digest and the full digest written to a log nothing links to |
| #71 | AUT-6, the conversational responder, read-only by construction |
| #77 | The per-message timeout, measured rather than guessed |
| #79 | An install must not kill the run it is replacing |
| #82 | The bot token out of argv and out of any trace |
| #84 | AUT-5 renders the why from the plain field, now that plain fields exist |
| #88 | The responder was throttled to a poll every half hour |

PR #81 was closed and rebuilt as #82 after it went `DIRTY`; PR #55 was closed
earlier for a worse reason, recorded below.

---

## 3. Defects found, all by measuring rather than reviewing

Each of these was invisible to inspection and obvious to a measurement.

**The per-message timeout was half what an answer needs.** Capped at 120
seconds. A real question against this repository took **158 seconds**. Every
honest answer would have been killed and replaced by the fallback apology, so
the feature would have looked broken while working correctly. Raised to 300, and
the stale-lock threshold is now derived (`timeout * max_per_poll + buffer`)
rather than separately guessed, because the old hardcoded 600 was already below
the 900 second worst case.

**The responder was throttled to a poll every half hour.** `StartInterval` 60
with `ProcessType Background`. Measured gaps: 18, 32 and 38 minutes. macOS
throttles that QoS class hard and `StartInterval` is a floor, not a guarantee.
Ivan would have waited half an hour and concluded the bot ignored him, while
every log line said the poller was healthy. `ProcessType Interactive` plus
`LowPriorityIO false`; measured again: 61, 61, 61, 61 seconds.

**Reinstalling killed the run it was replacing.** `launchctl bootout` terminates
a running job. A reinstall stopped an EXECUTOR 36 minutes into its work, which
logged `exit 143` and read as a model failure. The bootstrap that followed then
failed and the script exited **before installing the second agent at all**, so a
reinstall that appeared to succeed had deployed half of itself. `install.sh` now
refuses while the run lock exists, and a bootstrap failure no longer abandons the
other agent.

**The id filter did not match half the ids.** `\b[A-Z]{2,6}-\d{1,3}\b` does not
match `P2-15`, because that prefix carries a digit. Every P2 id passed the
sanitizer untouched and reached the rendered digest.

**`eligible.mjs` ran its CLI block on import.** Importing it from a file that
also takes `--board` made it answer the invocation instead of the caller. Both it
and `plain-digest.mjs` now guard on being run directly.

---

## 4. AUT-5, the plain digest

Five sections in order: what got done counted, NEEDS YOU with the plain question
and the exact line to send back, WAITING ON OTHERS with who owes what and days
outstanding and no reply line, NOT STARTED with what it needs first, and progress
as tasks done and launch conditions met.

Rendered from `card.plain` only. All 32 phase 2 cards now carry one. A card
without one prints its title and the gap is counted and reported on every send;
**the id is never a fallback**. The plain fields are authored as what in the
first sentence and why it matters after it, so the `Why:` line comes from the
plain field rather than from the card's jargon-heavy question text. A plain field
with no second sentence gets **no invented why** and is counted instead.

`assertPlain()` runs at send time, not only in tests. A negative test proves it
is not vacuous: five violation classes caught in deliberately dirty text.

**One deliberate exception, flagged for ratification.** The dispatch says no card
ids *and* the exact line to send back. Those conflict, because `inbox.mjs`
accepts only `R <card-id> default`. The id appears only inside the literal
`Reply:` line, as a copy-paste payload rather than a reference to decode, and the
assertion checks the prose with that line excluded. Changing `inbox.mjs` to
accept an id-free form would weaken the narrow parser that keeps the chat from
being a command line, so I did not.

---

## 5. AUT-6, the responder

A separate launchd label polling every 60 seconds, its own lock, its own log. It
shares nothing with the work harness but the repository it reads, so a question
never waits on the three hour cycle and never delays it.

**The boundary is structural, not instructed.** A prompt that says "do not write"
is a request; a read-only filesystem and an absent tool are a property.

1. A dedicated worktree pinned to `origin/main`, `chmod a-w` for the duration of
   every answer.
2. `--disallowedTools Write,Edit,NotebookEdit,Bash,Agent,Task,WebFetch,WebSearch`.
3. `env -u` strips every secret from the child, so the secrets path is
   unreachable from inside the answer rather than merely forbidden.

Proven: a write into the worktree returns `permission denied`, the worktree shows
zero modified files after four answers, and the stripped environment reports
`UNSET` for every secret.

Identity is checked before the text is read. A perfectly formed ruling from the
wrong sender is classified `ignored` on identity alone and logged without being
acted on.

---

## 6. State at the end

Both labels loaded: `com.ai.rc-poc` on 22:00, 01:00, 04:00 and 07:00 local, and
`com.ai.rc-poc-chat` polling every 61 seconds, measured.

The next session should know that the leaked token is **not yet rotated**, and
that one needs-you card has a plain field with no why sentence, which is a gap
for whoever writes the plain fields rather than a defect in the digest.
