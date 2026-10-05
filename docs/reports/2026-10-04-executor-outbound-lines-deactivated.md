# 2026-10-04 executor report: P3-138, outbound lines sealed for a deactivated account

## In plain words
A switched-off employee whose login has not yet run out could still read every sale line (product, quantity, sale price), add or change lines, and take stock out. After this change they see nothing and can change nothing. Active employees notice no change.

## The bug
- `supabase/migrations/0001_phase2_schema.sql`: `outbound_lines_select`, `_insert`, `_update` were `using (true)` / `with check (true)` for any `authenticated` caller. `authenticated` says nothing about `profiles.active`.
- `0067_outbound_direct_client.sql` closed `outbound_issues` but left the lines, on the belief that a line is reachable only through its issue. Over PostgREST it is not.
- `outbound_issue_take_stock(uuid, jsonb)` is granted to `authenticated` and could be called on any existing issue id.

## The fix
- New migration `supabase/migrations/0070_outbound_lines_active_account.sql`, in begin/commit: drops and recreates the three line policies on `public.current_app_role() is not null`, the exact predicate 0067 uses for the header. `outbound_lines_delete` stays on `public.is_owner()`, which already filters active. No row, table, column, function or grant changes.
- `outbound_issue_take_stock` is NOT replaced. It is SECURITY INVOKER, so its lines insert runs into the tightened insert policy and a deactivated caller is refused with the whole call rolled back. An explicit early refusal was weighed and rejected: `assertions/0067` calls both outbound doors as superuser with no JWT, where `current_app_role()` is null, so it would fail that assertion. Deviation from the task brief, declared here and on the card.
- The other readers of `outbound_lines` (`client_material_summary`, `project_material_summary`, `project_material_cost`, `product_available_stock`) are all SECURITY INVOKER, so the select policy covers them too.

## Proof
- `scripts/poc-free/local-db/assertions/0070_outbound_lines_active_account.sql` (applier run): four line policies with the right predicates, delete unchanged, `outbound_issues` untouched, take stock still invoker.
- `tests/e2e/outbound-lines-deactivated.spec.ts` (CI only, needs the local Supabase stack): each refusal has a witness from the same account while active. Deactivated: direct select returns `[]`, insert refused, update touches zero rows and the service read shows lines unchanged, `rpc/outbound_issue_take_stock` refused with no new line. Active: create, read, take stock, and read another operator's lines.
- No Docker and no Supabase CLI on this machine: the e2e suite and applier proofs run only in CI.
