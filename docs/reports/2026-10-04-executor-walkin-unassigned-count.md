# P3-152: a walk-in sale no longer makes every client page warn about an issue without a project

Date: 2026-10-05. Role: EXECUTOR. Source: bug check of 2026-10-04.

## What changed for Rapid Construct

After the first walk-in sale, every client page showed the line saying an outgoing issue has no project yet. That was false: a walk-in sale has no project by design. The line now counts only project issues that lost their project, so it stays quiet until a real one appears.

## Cause

`unassigned_issue_count()` (0022) counted every outbound issue with no project. Migration 0067 added walk-in issues and narrowed the twin `unassigned_outbound_count()`, but missed this one.

## Change

- `supabase/migrations/0069_unassigned_issue_count_walkin.sql`: `create or replace` of the function, same signature, `security invoker`, `stable`, same `search_path`, new body `issue_mode = 'project' and project_id is null` (the condition 0067 uses), new comment, grant to `authenticated` stated again. No drop, no row change.
- `scripts/poc-free/local-db/assertions/0069_unassigned_issue_count_walkin.sql`: a walk-in issue leaves the count unchanged; a project issue with no project raises it by one (the 0067 shape constraint is dropped inside the rolled-back transaction to allow that row); signature and grant; the twin counter agrees.
- `docs/migrations/APPLY-LOG.md`: waiting-register line for 0069.
- Board card P3-152 in `rc-board-phase3.json`, depends on P3-118.
- `docs/LEARNINGS.md`: one entry.

## Not changed

`unassigned_outbound_count()`, `lib/reporting/material-cost.ts`, the Romanian warning text, `ClientTabs` layout, the `hasPhase3Schema` gate.

## Notes

- Migration number 0069 is the next free on main. Open PRs 407 and 413 also carry a 0069 file; whichever merges second needs a renumber.
- The test runs in CI only (no Docker on this machine).
