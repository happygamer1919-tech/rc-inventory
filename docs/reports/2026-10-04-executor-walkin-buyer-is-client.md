# Executor report: walk-in buyer is a client (card P3-172)

Date: 2026-10-06 (bug check of 2026-10-04). Role: EXECUTOR. Branch `card/walkin-buyer-is-client`.

## In plain words

A buyer added at the counter during a walk-in sale ("+ Client nou" on Ieșiri materiale)
was saved as a cold lead. He showed under Leaduri as "Lead rece", raised the lead count,
and was missing from the Clienți view. From now on he is saved as a client and shows in
Clienți. Existing records are not changed.

## Cause

`InlineClientCreate` in `components/outbound/OutboundDirectClientForm.tsx` (card P3-119)
called `createClientRecord` with no stage. `createClientRecord` then leaves `stage` out of
the insert, so the row took the column default `cold` (migration 0039).

## Change

- `InlineClientCreate` passes `stage: "client"`.
- `lib/data/client-actions.ts` is not changed: `createClientRecord` already accepts a stage
  only when `isClientStage` allows it, and writes it through `set_client_stage`, which
  also writes the history row. Every other caller keeps what it sends today, so the Clienți
  form, the lead form and both imports are unchanged, and a call with no stage still
  gives `cold`.
- The walk-in server action (`lib/data/outbound-actions.ts`) does not create clients, so
  nothing changes there.
- No migration, no backfill, no screen change.

## Specs (tests/e2e/outbound-direct-client.spec.ts)

- `iesire client direct: un client nou creat din ecran apare apoi in Clienti`: now opens
  `/clienti?vedere=clienti&q=<name>`, asserts the Clienți pill is pressed, finds the row,
  and reads the stored stage `client`. Before, it opened `/clienti` with no view and so
  passed on the bug.
- New: `iesire client direct: un client nou creat din ecran nu apare printre Leaduri si numarul de leaduri nu creste`.
- New: `creare client fara etapa: randul ramane cold, implicitul pe care se bizuie celelalte cai`.
  The brief asked for a unit case. The repo has no unit runner (Playwright only), so this
  case writes the same insert `createClientRecord` writes without a stage, with the owner
  token through row security, and reads `cold`.

These need the CI database (no Docker or Supabase CLI on this machine), so they were not
run locally. They run in the pull request's `quality` run.

## Local gates (all exit 0)

`npx tsc --noEmit`, `npm run build`, board validator, `check:card-ids`, `check:board-edit`,
`check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`,
`check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`,
`check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`.

## Deviations and notes

- Card id: the brief named P3-147. `id:free` reported it claimed by open pull request #413
  and named P3-172.
- Overlap with #413 (P3-147, draft, migration 0071, waits for the owner): it replaces the
  `createClientRecord` call in `InlineClientCreate` with a new `createWalkInClient`, which
  sends no stage. Whichever pull request lands second gets a conflict on that call and must
  keep stage `client` on the walk-in path. If an account manager creates the buyer, the
  stage write goes through `set_client_stage`, which may be owner-only; #413 should check
  that before it merges.
