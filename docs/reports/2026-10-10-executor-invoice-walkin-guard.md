# P3-212: the invoices table refuses a walk-in sale, not only save_invoice_draft

Date: 2026-10-10. Executor. Branch card/invoice-walkin-guard.

## What changed
- `supabase/migrations/0078_invoices_refuse_walkin_issue.sql`: new SECURITY DEFINER trigger function
  `public.invoices_refuse_walkin_issue()` and trigger `invoices_refuse_walkin_issue`, BEFORE INSERT OR
  UPDATE OF `outbound_issue_id` on `public.invoices`. It raises P0001 with the 0074 text (it names
  `direct_client`) when a row newly names an issue whose `issue_mode` is `direct_client`. An update
  that keeps the same issue is not checked, so any existing row stays editable. Execute revoked from
  public, anon and authenticated. No drop of a table, no delete, truncate or row change.
- `scripts/poc-free/local-db/assertions/0078_invoices_refuse_walkin_issue.sql`: six cases with
  witnesses (direct insert refused, direct update refused, project issue and no issue still write,
  an old walk-in row stays editable, save_invoice_draft unchanged).
- `tests/e2e/facturare-walkin-refused.spec.ts`: three `tabela:` cases over PostgREST with a real
  account token (direct POST refused, direct PATCH refused, a normal invoice still writes and edits).
- `docs/migrations/APPLY-LOG.md`: 0078 listed pending, as every migration since R-062.
- Card P3-212 on the phase 3 board.

## Not changed
`save_invoice_draft`, every policy on invoices, `invoices_require_draft_to_edit`, the numbering, the
one-live-invoice index.

## Run here
`npx tsc --noEmit`, `npm run build` and every `check:*` in the close-out list exit 0.

## Not run here
The e2e suite and `npm run check:migrations` need Docker and Supabase; they run in CI only.
