# P3-199: take stock adds lines only for the owner or the creator of an empty slip

Date: 2026-10-09. Executor. Branch card/p3-199.

## What changed
- `supabase/migrations/0077_take_stock_lines_guard.sql`: `create or replace` of
  `public.outbound_issue_take_stock(uuid, jsonb)`, same signature, definer, search_path and grants.
  After the existing refusals, a caller who is not the owner is refused unless they created the slip
  and it has no line yet. A caller with no identity (server role) is not refused. No drop, delete,
  truncate or row change.
- New spec `tests/e2e/take-stock-lines-guard.spec.ts` (acceptance a to c).
- Witnesses moved to the narrowest case still allowed: `scripts/poc-free/local-db/assertions/0075_take_stock_status_and_line_policies.sql`
  (fresh slip created by the manager), `tests/e2e/take-stock-guard.spec.ts` (owner as witness on the
  shipped-slip case), `tests/e2e/outbound-lines-deactivated.spec.ts` (empty slips of the account).
  The refusals those tests prove are unchanged.
- Card P3-199 on the phase 3 board.

## Not run here
The e2e suite and the applier proofs need Docker and Supabase; they run in CI only.
