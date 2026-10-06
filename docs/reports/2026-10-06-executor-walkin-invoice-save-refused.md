# EXECUTOR report: P3-170, a walk-in sale cannot be invoiced, enforced on the server and in the database

Role EXECUTOR. Card P3-170 (phase 3 board), branch `card/walkin-invoice-save-refused`.
Run date 2026-10-06 UTC. The task brief named the file `2026-10-04-...`; CLAUDE.md 9b
says the date is the run date, and the repository rule wins.

## In plain words

A walk-in sale (material collected at the counter, no project) is never invoiced,
by the owner's instruction. Until now only the screen knew that: it hid the button.
A request built by hand could still create a draft invoice for a walk-in sale. Now
the server refuses it before asking the database, and the database refuses it too.
Project sales and invoices with no sale behind them work exactly as before.

## What changed

- `lib/data/facturare-actions.ts`: `saveInvoiceDraft`, on a new draft with an
  `outboundIssueId`, asks `getIssueInvoiceability` (the same read the issue screen
  uses, not a copy) through `saveUnlessNeverInvoiceable`. When the answer is
  `neverInvoiceable` it returns the existing sentence
  `DIRECT_CLIENT_NOT_INVOICEABLE` and the RPC is not called. `refusal()` maps the
  new database error (P0001 with `direct_client` in the text) to the same sentence.
- `lib/data/facturare-issue-gate.ts` (new): the gate as a small function with the
  read and the save passed in, so a spec can prove the save is not called.
- `supabase/migrations/0072_save_invoice_draft_refuses_walkin.sql` (new):
  `create or replace function public.save_invoice_draft(uuid, jsonb, uuid, uuid,
  uuid, date, text)`, same signature, 0064's body plus one check on
  `issue_mode = 'direct_client'`, the same three grant lines, the comment extended.
  No DROP TABLE, no TRUNCATE, no DELETE. MERGE IS APPLY.
- `scripts/poc-free/local-db/assertions/0072_save_invoice_draft_refuses_walkin.sql`
  (new): walk-in refused with P0001 and no invoice row; project issue, no-issue
  invoice and draft edit still work.
- `tests/e2e/facturare-walkin-refused.spec.ts` (new): the four acceptance cases.
- `docs/migrations/APPLY-LOG.md`: the 0072 row. `docs/LEARNINGS.md`: two entries.
- `docs/board/rc-board-phase3.json`: card P3-170, authored and shipped in this PR.

## Defaults applied (card `defaults`)

- The walk-in flag is `issue_mode = 'direct_client'` from 0067; no new flag.
- The server refuses only on `neverInvoiceable`. The read's other answers (no lines,
  an invoice already exists, a failed read) are for the button and do not block a
  save, so a project issue saves exactly as before; the 0064 index still refuses a
  second live invoice.

## Checks run locally

`npx tsc --noEmit` exit 0, `npm run build`, and the `check:*` gate set: results are in
the pull request body. No Docker and no Supabase CLI on this machine, so
`npm run check:migrations`, the database cases of the spec and the applier proofs run
only in CI.

## Left open

`public.invoices` still accepts a direct PostgREST insert naming a walk-in issue in
`outbound_issue_id`: the brief fixed the save function only. A trigger on `invoices`
would close it; that is a separate card.

## Learnings

Two entries appended to `docs/LEARNINGS.md`: a rule enforced only in the read that
hides a button is not enforced; a PostgREST rpc call is a thenable, not a Promise.
