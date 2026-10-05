# Executor report: a walk-in sale shows on the buyer's client page

Card P3-159, branch `card/walkin-on-client-page`. Written 2026-10-05.

## What changed for Rapid Construct
What a client bought at the counter without a project now appears on that client's page, in the
Consum materiale tab, added to the consumption on projects.

## Cause
`public.client_material_summary` (migration 0022) joined issue lines to a client only through
`projects.client_id`. A walk-in sale (migration 0067) has no project and names its buyer in
`outbound_issues.client_id`, so it never reached the tab.

## Change
- `supabase/migrations/0071_client_material_summary_walkin.sql`: same function, signature, return
  type, comment and grant. The project join is a left join, and a line counts when the project's
  client or the issue's own client is the asked client. One where clause over one row per line,
  so nothing is counted twice. No drop, truncate, delete or row change.
- `scripts/poc-free/local-db/assertions/0071_client_material_summary_walkin.sql`: walk-in only
  (50), project 30 plus walk-in 50 (80), another client does not leak (5000).
- `tests/e2e/client-material-walkin.spec.ts`: the same three cases through the API, plus the tab
  on screen.
- Card P3-159 on the phase 3 board (the brief named P3-145, then P3-153; both were taken).

## Two places the brief did not match the code
- **Status filter.** The brief says to keep the status filter. The function never had one, and an
  outbound issue has no cancelled state (enum `awaiting_shipment`, `shipped`; 0067 builds no cancel
  path). So there is no filter, and no "cancelled walk-in sale" case to test.
- **Vezi toate link.** It opens `/comenzi?client=<id>`, and `lib/data/outbound.ts` already adds
  `client_id.eq.<id>` next to the client's project ids. Walk-in sales already show there. No change.

## Local gates
Run from the worktree; results are in the PR body. The end to end spec, the assertion and both
applier proofs run only in CI (no Docker here).
