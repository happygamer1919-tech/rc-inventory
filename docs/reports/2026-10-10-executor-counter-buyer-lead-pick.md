# EXECUTOR report, P3-262: the walk-in buyer can be a lead

Date: 2026-10-10. Role: EXECUTOR. Branch: `card/p3-262`.

## In plain words

At the counter (Ieșiri materiale, Client direct), staff can now pick a buyer
who is still a lead. The lead shows in the list with the word "Lead". When the
release slip is saved, the slip goes to that existing record and the record
becomes a Client in the same save. No duplicate client is made. If the save
fails (for example not enough stock), the lead stays exactly as it was.

The account manager still cannot change a stage anywhere else.

## Why

Bug check of 2026-10-10: card P3-196 showed only stage Client in the walk-in
picker, and an account manager cannot change a stage, so a buyer who existed as
a lead could not be sold to. Owner decision (Max, 2026-10-10): "yes do the lead
option".

## What changed

- `supabase/migrations/0081_walkin_lead_buyer_becomes_client.sql` (MERGE IS APPLY)
  - new `public.walkin_lead_becomes_client(uuid)`, SECURITY DEFINER, execute for
    `authenticated` only. Refuses a signed-in caller who is not an active owner
    or account manager (42501). Refuses unless the slip is a direct_client slip
    written by the caller in the current transaction (`created_at = now()`).
    Moves a lead to client through `set_client_stage`, which writes one
    `status_history` row. A record already at Client is left alone.
  - `public.create_direct_client_issue` body only, same signature: calls the
    function above after `outbound_issue_take_stock`.
  - no DROP, TRUNCATE, DELETE, UPDATE or INSERT of rows. `clients_update`,
    `set_client_stage`, `clients_insert` and the 0079 trigger unchanged.
- `scripts/poc-free/local-db/assertions/0081_walkin_lead_buyer_becomes_client.sql`
- `lib/data/client-options-read.ts`, `lib/data/projects-list.ts`: the buyer
  list reads every active record with its stage and marks leads.
- `components/outbound/OutboundDirectClientForm.tsx`: "Lead" in the row hint,
  a note when a lead is chosen, and a line on the success screen.
- `lib/data/outbound-actions.ts`: revalidates Clienți and Azi after a walk-in
  sale.
- `tests/e2e/walkin-buyer-lead.spec.ts`: new spec, six cases.
- `tests/e2e/outbound-direct-client.spec.ts`: the P3-196 case "un lead si un
  client inactiv nu apar in lista de cumparatori" now checks the owner's new
  rule (lead shown, marked Lead; inactive still out). Old name quoted in the spec.
- Board: card P3-262 on `docs/board/rc-board-phase3.json`.
- `docs/LEARNINGS.md`: two entries.

## Commands run locally (this machine has no Docker and no Supabase CLI)

- `npx tsc --noEmit`: exit 0
- `npm run build`: exit 0
- `npm run check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
  `check:no-destructive-migration`, `check:conflict-residue`,
  `check:categories`, `check:ledger-rows`, `check:no-prod-target`,
  `check:pending-schema-reads`, `check:removal-safety`,
  `check:assertion-register`: all exit 0
- `npm run check:board-edit`: exit 0 once the card is flipped to shipped in
  this pull request
- board validator: exit 0
- `npm run check:migrations`, the applier proofs and the e2e specs need Docker
  and the local Supabase stack: they run in CI `quality` only.

## Left for the owner

The pull request adds a migration, so it does not self-merge. A mailbox
question asks Max to approve the merge.
