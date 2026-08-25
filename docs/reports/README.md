# Reports

Run reports from phase 2 sessions. One file per session or per wave.

## What goes here

A report is written when a session ends, when a review wave closes, or when an
incident is resolved. It is the record a stranger reads to understand what
happened without replaying the git log.

Naming: `YYYY-MM-DD-<role>-<slug>.md`, for example
`2026-08-26-executor-p2-01-schema.md`.

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

No reports yet.
