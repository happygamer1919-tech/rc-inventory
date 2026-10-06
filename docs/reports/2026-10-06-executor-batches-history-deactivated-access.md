# 2026-10-06 executor report: P3-179, stock batches and status history sealed for a deactivated account

## In plain words
A switched-off employee whose login had not run out yet could still add a stock batch (which raises stock), read every batch, and read or add entries in the status history. After this change they see nothing there and can add nothing. Active employees notice no change: arrivals and walk-in sales work as before.

## The bug
- `supabase/migrations/0001_phase2_schema.sql`: `batches_select`, `batches_insert`, `status_history_select`, `status_history_insert` were `using (true)` / `with check (true)` for any `authenticated` caller. `authenticated` says nothing about `profiles.active`.
- A grep of migrations 0002 to 0071 for `batches_` and `status_history_` finds no later replacement (only comments in 0059 and 0068), so 0001's versions were the current ones.
- The brief named the outbound_lines fix "migration 0069"; the file is `0070_outbound_lines_active_account.sql` (0069 is an unrelated counter fix). 0070 is the pattern copied.

## The fix
- New migration `supabase/migrations/0073_batches_status_history_active_account.sql`, in begin/commit: drops and recreates the four policies on `public.current_app_role() is not null`, the predicate of 0067 and 0070. `batches_update` and `batches_delete` stay on `public.is_owner()`. `status_history` still has no update and no delete policy. No row, table, column, function or grant changes.
- Writers: every SQL function that inserts into these tables (0003, 0004, 0010, 0011, 0018, 0021, 0026, 0039, 0040, 0057, 0060, 0067) is either SECURITY DEFINER (policies skipped) or SECURITY INVOKER under an active caller (predicate true). The extraction callback writes with service_role, which bypasses row level security.

## Other open policies found (step 3 of the brief)
`using (true)` or `with check (true)` still present on tables tied to stock:
- `inbound_orders`: select, insert, update (0001).
- `order_lines`: select, insert, update (0001).
- `reminders`: select, insert, update (0001).
These are new card **P3-180** on the phase 3 board, not fixed here. `outbound_issues` (0001 lines 547 to 554) was already closed by 0067.
Not stock, recorded only: select-only `using (true)` on categories, units, products, contacts, suppliers, deviz, sheet options, sheet prices (catalog reads, kept by design per 0055), and the `extraction_drafts` policies of 0008 (extraction track).

## Proof
- `scripts/poc-free/local-db/assertions/0073_batches_status_history_active_account.sql` (applier run): batches has four policies with select and insert on the predicate and update/delete on is_owner(); status_history has exactly select and insert on the predicate and no update, delete or all policy; outbound_lines keeps its four 0070 policies.
- `tests/e2e/outbound-lines-deactivated.spec.ts`, three new cases (CI only, needs the local Supabase stack), each refusal with a witness from the same account while active: deactivated cannot insert a batch and reads none; deactivated cannot insert a history row and reads none; an active account reads batches and history written by someone else and inserts both.
- No Docker and no Supabase CLI on this machine: the e2e suite and applier proofs run only in CI.
