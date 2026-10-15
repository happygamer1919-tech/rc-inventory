# 2026-10-15 EXECUTOR report: incoming orders closed to switched-off accounts, arrival only through reception (P3-180)

Role: EXECUTOR. Card: P3-180 (phase 3 board, authored 2026-10-06 in the P3-179 pull request). Branch `card/p3-180`.

## In plain words

A switched-off employee whose login has not run out yet can no longer see or change incoming orders, their lines or the low stock reminders. And nobody, the owner included, can mark an order as arrived, or change its total or its number, by going around the screens: an order becomes arrived only through the reception button, which also adds the stock. Active employees notice no change. Merging changes the live database (migration 0086), so it waits for the owner's OK.

## Source

Card P3-180, plus the Fable bug check of 2026-10-14 18:46Z, finding 10, as quoted in the factory task: the 0001 policies on inbound_orders, order_lines and reminders are `using (true)`; add active-account policies like 0070 and 0073, and a column guard on inbound_orders like 0082 and 0083 (status to arrived only inside receive_inbound_order, total_mdl and reference only where a screen edits them).

## What was built

- `supabase/migrations/0086_inbound_orders_active_account.sql`
  - Nine policies dropped and created again on `public.current_app_role() is not null` (update on both using and with check): `inbound_orders_select`, `_insert`, `_update`, `order_lines_select`, `_insert`, `_update`, `reminders_select`, `_insert`, `_update`. The three delete policies stay on `is_owner()`.
  - `receive_inbound_order(uuid)`: the 0084 body word for word, plus `set_config('rc.inbound_receive', <order id>, true)` right before its update and a clear right after. Same signature, still SECURITY INVOKER.
  - New BEFORE UPDATE row trigger `inbound_orders_guard` (SECURITY INVOKER), for a signed-in caller (owner included): status or arrived_at change only from pending_arrival to arrived while the flag names the row; total_mdl and reference never change. 42501 with a Romanian sentence. A caller with no identity (service role, seeds, extraction callback) is not guarded. Every other column is left to the policies.
  - No DROP TABLE, TRUNCATE or DELETE; no row read or changed when it applies.
- `scripts/poc-free/local-db/assertions/0086_inbound_orders_active_account.sql`: shape (four policies per table, no bare true, delete on is_owner, trigger enabled, function signature and grant), then with a real role switch and JWT: one account manager does every read, insert and update while active (the witnesses), is switched off, and gets no row, every insert refused, every update on zero rows, create refused, receive "no such order"; an active manager against the guard (direct arrived, total, number, back to pending, arrival date rewrite, a flag naming another order: all refused; document path and supplier reference accepted; reception still makes one batch and one history row, a second is a no-op); the owner refused on total and status.
- `tests/e2e/inbound-active-account.spec.ts`: six cases through PostgREST with real tokens, each refusal with a witness while active, plus an active account recording an arrival end to end (create, read, receive once, receive again is a no-op, one batch, history pending then arrived, another active account sees it).
- `docs/migrations/APPLY-LOG.md`: pending line for 0086.
- `docs/LEARNINGS.md`: two entries (the ambiguous `cmd` variable, and the two writes left open on purpose).
- Board: P3-180 to shipped with evidence.

## Every writer read

grep of `supabase/migrations`, `lib/`, `app/`, `components/` for the three tables:

- inbound_orders: `create_inbound_order` and `confirm_extraction_draft` insert pending_arrival (invoker, unchanged); `receive_inbound_order` the one status change (flagged here); `uploadOrderDocument` PATCHes document_path and document_uploaded_at; `confirmExtractionDraft` PATCHes order_ref and order_ref_series; `inbound_orders_set_updated_at` sets updated_at. No screen writes total_mdl or reference after creation.
- order_lines: inserted only by the two functions; nothing updates a line.
- reminders: `checkThresholdsFor` (lib/reminders/notify.ts) selects, upserts and updates under the caller's token after a stock move by an active account.

## Left open on purpose (in LEARNINGS)

A direct INSERT of an already arrived order, and a direct change of an order line, by an active account. Both were outside the card and the finding; `batches_insert` already lets an active account add stock directly, so they are one later decision about who may write stock outside reception.

## Commands run locally, from the worktree

- Throwaway Homebrew postgres (no Docker on this machine), shim plus every migration plus every assertion file: 85 migrations applied, 67/67 assertion files passed.
- The same, red three ways: 0086 skipped (`inbound_orders_select ... found true`), policies only without the guard (`expected one enabled trigger inbound_orders_guard, found 0`), guard ignoring the flag (`case a was not refused by the guard, got accepted 1`).
- `npx tsc --noEmit` exit 0; `npm run build` exit 0.
- `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration` (1 file, 31 statements), `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`: all exit 0. `check:board-edit` exit 0 once the card is shipped on the branch.
- `npm run check:migrations` and both applier proofs need Docker and run in CI only.
