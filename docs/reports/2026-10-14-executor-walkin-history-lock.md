# 2026-10-14 EXECUTOR report: walk-in buyer must be active, status history only from a real change (P3-277)

Role: EXECUTOR. Card: P3-277 (new, authored in the same pull request). Pull request: #523, branch `card/p3-277`.

## In plain words

A counter sale can no longer be saved to a customer who was switched off, and nobody can add a made-up line such as "shipped" or "became a client" to a record's history by going around the screens. Every screen works as before. Merging changes the live database (migration 0084), so it waits for the owner's OK.

## Source

The bug check of 2026-10-13 23:51Z, as quoted in the factory task: (1) `create_direct_client_issue` (0081) checks that the buyer exists but not that it is active; (2) the `status_history_insert` policy of 0073 lets any active account insert a fake `shipped` or `cold` to `client` event.

## What was built

- `supabase/migrations/0084_walkin_buyer_active_history_lock.sql`
  - `create_direct_client_issue`: 0081 body word for word plus a P0001 refusal, `Clientul ales este dezactivat. Alege alt client sau reactivează-l din fișa lui.`, when the client row is not active. Before any insert.
  - New BEFORE INSERT row trigger `status_history_guard` (SECURITY INVOKER): a signed-in caller's row is accepted only while the transaction-local flag `rc.status_history_write` equals its `entity_id`; otherwise 42501, `Istoricul stărilor se scrie numai odată cu schimbarea stării, din aplicație.` A caller with no identity (service role, seeds, extraction callback) is not guarded.
  - The seven writers set the flag right before their own insert and clear it right after, each the live body word for word: `create_inbound_order`, `confirm_extraction_draft`, `receive_inbound_order`, `outbound_issue_take_stock`, `ship_outbound_issue`, `set_project_status`, `set_client_stage` (4 args).
  - Policies of 0073, every signature, grant and comment unchanged. No DROP TABLE, TRUNCATE or DELETE.
- `docs/migrations/APPLY-LOG.md`: pending line for 0084.
- `scripts/poc-free/local-db/assertions/0084_walkin_buyer_active_history_lock.sql`: shape, then as an account manager and as the owner with a real role switch and JWT, every refusal and every normal path, then the server role.
- `scripts/poc-free/local-db/assertions/0039_client_stage.sql`: its other-kind fixture history row is written as a server role.
- `tests/e2e/outbound-lines-deactivated.spec.ts`: the two P3-179 cases that asserted an active account can post history now assert the refusal.
- `tests/e2e/outbound-direct-client.spec.ts`: new case, a sale to a switched-off client sent directly is refused, no slip, stock unchanged.
- `scripts/poc-free/check-pending-schema-reads.mjs`: `TOLERATED_FUNCTIONS`, one pair per entry (`lib/data/inbound-actions.ts` with `create_inbound_order` and `receive_inbound_order`), self-refusing when untrue.

## How the writers were found

On a throwaway Homebrew postgres with every migration to 0082 applied: `pg_proc` where `prosrc ilike '%status_history%'`. Nine functions: seven writers, two readers (`client_stage_history`, `project_status_history`). `walkin_lead_becomes_client` writes through `set_client_stage`. A grep of `app/`, `lib/`, `components/` shows the app only reads the table. The writers' `set_*` forms write only on a real move, and their `select ... for update` needs the owner-only update policy, so another account gets "no longer exists" and no row (assertion cases m and n).

## Why a trigger with a flag and not a policy or a function SET clause

- The 0082 precedent (`rc.outbound_ship`) already uses a transaction-local flag that a PostgREST request cannot set.
- A function `SET` clause would need `ALTER FUNCTION`, which `check:no-destructive-migration` does not know and refuses (fails closed).
- A policy refusal reads in English; the trigger gives a Romanian reason.

## Commands and results on this machine

No Docker here, so `npm run check:migrations`, `prove:applier` and `prove:assertions` run only in CI. Local stand-in: a throwaway Homebrew postgres, the shim, every migration, every assertion file (`p3-277-tools/localdb.mjs`, outside the repo).

- RED, 0084 set aside: the 0084 assertion fails on its shape; with the shape block removed, `walk-in case a to a switched-off buyer was not refused: accepted`; with only the history cases, `direct history insert case g was not refused by the guard, got accepted`.
- GREEN with 0084: `83 migrations applied, 65/65 assertion files passed` (after the 0039 fixture fix; before it, 64/65 with 0039 refused by the new guard).
- Gates, each exit read alone: `npx tsc --noEmit` 0, `npm run build` 0, `check:card-ids` 0, `check:board-edit` 0, `check:unique-ids` 0, `check:open-branch-ids` 0, `check:no-destructive-migration` 0, `check:conflict-residue` 0, `check:categories` 0, `check:ledger-rows` 0, `check:no-prod-target` 0, `check:pending-schema-reads` 0 (after the tolerated pair; 1 before), `check:removal-safety` 0, `check:assertion-register` 0, `check:board-clock` 0, `check:card-order` 0, `check:board-app` 0, `check:reset-sql` 0, `check:action-pins` 0, `check:executor-env` 0, `check:grant-revocation` 0, `check:live-fixtures` 0, `prove:no-destructive-migration` 0, `prove:board-edit` 0, `prove:unique-ids` 0, `prove:open-branch-ids` 0, `prove:schema-direction` 0. `prove:assertions` exit 2 here (needs Docker), left to CI.

## CI on head 06b302d (run 38557856812)

Every step up to and including "Apply every migration to a bare postgres, unmodified" PASSED: that step applies 0084 and runs the 0084 assertion file, so the refusals and the normal paths are proven in CI. "Refuse a migration that removes rows" and "Prove the destructive-migration check refuses" PASSED. "Prove the migration applier against the Docker shim" FAILED with `9 of 16 proofs passed`; End to end did not run.

## Known wait, and why it is only the number

Migration 0083 sits on the owner's pull request #518 (P3-274). The applier proof refuses a gap in the numbers (0082 then 0084). Reproduced here with a small stand-in for the four docker verbs the proof uses, over the Homebrew postgres, in a scratch copy of the repository:

- this branch as pushed: `9 of 16 proofs passed`, the same failures as CI, and the applier's own reason is `ASSERTION FAILED [ledger-no-gaps-ends-at-highest]: ledger holds 83 rows, expected 84 with no gaps`.
- the same copy plus #518's 0083: `14 of 16`, ledger 84 rows, every mutation proof refuses as it should.
- control, main's own migrations (no 0083, no 0084) on the same stand-in: `14 of 16`, the same two cases, which only miss a printed "COMMITTED" line while exiting 0 with the batch committed. Those two are an artefact of the stand-in, not of the SQL.

So with 0083 in, this branch behaves exactly like main in the applier proof. Order for the owner: #518 first; this branch then takes main (`gh pr update-branch 523`) and runs the full suite, End to end included.

## Learnings

Three entries appended to `docs/LEARNINGS.md`: the fake-able history table, the pending-schema-reads false positive, the assertion fixture written with a token.
