# Reports

Run reports from phase 2 sessions. One file per session or per wave.

**THIS CONVENTION IS BINDING SINCE 2026-08-27, card AUT-1.** It used to describe
what a report looked like when somebody wrote one. `CLAUDE.md` section 9b now
makes writing one the final act of every terminal, in every role: the file is
the original and what the terminal prints is a copy, committed first and printed
second. A report that exists only in a terminal is a report the next session
cannot read, and the whole chain is built on each role acting on the previous
role's output.

## What goes here

A report is written when a session ends, when a review wave closes, or when an
incident is resolved. It is the record a stranger reads to understand what
happened without replaying the git log.

Naming: `YYYY-MM-DD-<role>-<slug>.md`, lowercase, hyphens, for example
`2026-08-26-executor-p2-01-schema.md`. The date is the run date in UTC,
`<role>` is `executor`, `critic`, `poc-builder` or `triage`, and the slug names
the work rather than the outcome.

## What a report contains

- **Role and date.** Which terminal, which session.
- **Cards touched**, by id, with the status each ended in.
- **What shipped**, with the PR number and the acceptance line that passed.
- **What blocked**, on whom, and since when. Copy the ask, do not summarise it.
- **Defects found**, cross-referenced to the entries appended to
  `docs/LEARNINGS.md` in the same session.
- **State at the end**: what the next session should pick up first.

## What a report is not

Not a substitute for the board. The board is the live state; a report is the
history of one session. If a fact matters to the next session, it belongs on the
board or in CLAUDE.md, not only here.

Not a place for credentials. Environment variable names only, per CLAUDE.md
section 7.

## The files here, and which convention each follows

Two files predate the convention and are deliberately NOT renamed, because a
link that worked yesterday still works:

- `critic-wave1.md` - the CRITIC's wave 1 findings.
- `forensics-20260826-product-count.md` - the product-count forensics.

Everything committed from 2026-08-27 onward carries the dated name above.
