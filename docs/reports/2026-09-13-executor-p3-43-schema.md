# EXECUTOR report: P3-43, the client lifecycle stage

**Role:** EXECUTOR. **Date:** 2026-09-13 (UTC). **Worked from:** the new operator's
task queue, task G2 (`002-g2-p3-43-schema`), run headless on a machine with no
Docker, no Supabase CLI and no production credentials.

## In plain words

Every customer record now has a stage: a cold lead, a lead being worked, a lead to
chase on a set date, a lead that has been quoted, or a real client. A lead marked
"to chase" cannot be saved without the date. Every change of stage is remembered
with who made it and when. Every customer already in the system becomes "client".

**The pull request is open, green, and deliberately NOT merged.** Merging it
changes the live database within about two minutes (CLAUDE.md 8.0). The operator's
task for this card said to stop at green and ask the owner first, because this is
the first migration shipped from the new task queue. The question is in the
factory mailbox as `q003-approve-g2-merge.md`.

## Card touched

| card | status at start | status on this branch | pull request |
|---|---|---|---|
| P3-43 | todo | shipped (on the branch only; reaches `main` only when the merge is approved) | #278, open, not merged |

## Boot status report (CLAUDE.md section 1)

- Phase 2 board: 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted. Launch gate
  6/9 (G4, G7, G9 fail). Next eligible by id: AUT-3.
- Phase 3 board (read too, RULE-05): 52 shipped, 41 todo. P3-43 eligible: todo, no
  dependencies, not blocked. It is the card the task named.
- Open pull requests at pick time: 0. Highest migration: 0037.

## What was built

**Migrations, by path:**

- `supabase/migrations/0038_status_entity_client.sql` adds the label `client` to
  `public.status_entity`, alone, because a new enum label cannot be used in the
  transaction that added it (the 0015 precedent). Only `ALTER TYPE ... ADD VALUE IF
  NOT EXISTS` and a `SELECT`, the shape the applier's enum pre-phase admits.
- `supabase/migrations/0039_client_stage.sql` adds:
  - the ordered enum `public.client_stage`: cold, nurture, follow_up, quoted, client
  - `clients.stage`, added `NOT NULL` with default `client`. Every existing row
    becomes `client` in that one statement.
  - a `DO` block straight after, which raises (and rolls the file back) if any
    existing row carries another stage
  - the default then moved to `cold`
  - `clients.follow_up_date`, a nullable `date`
  - the check `clients_follow_up_date_required`
  - `set_client_stage()`: stage, date and history row in one transaction. The same
    stage writes no row; a null date keeps the stored one.
  - `client_stage_history()`

  The header and the column comment carry 0016's not-a-state-machine sentence.
  **No UPDATE, no DELETE, no DROP, no TRUNCATE.**

**Assertions:** `scripts/poc-free/local-db/assertions/0038_status_entity_client.sql`
and `0039_client_stage.sql`.

**Journal:** two `docs/migrations/APPLY-LOG.md` entries, predicting the apply by
merge and saying the merge is held for owner approval.

**Application:**

- `hasClientStage()` in `lib/data/schema-capability.ts` probes both columns in one
  select, so the minutes between the code landing and 0039 landing behave as today
  (INC-05).
- `getClient` reads the stage only when the probe says yes.
- The generic client update never names `stage` or `follow_up_date`; both go
  through `set_client_stage`, after a Romanian validation that runs before any
  write.
- The existing client form offers the five stages in declared order, and the date
  field only at De reluat.
- The existing detail screen shows the Romanian label with its colour dot beside
  it.

**Tests:** four new cases in `tests/e2e/clients.spec.ts`. No existing case modified.

## Acceptance, clause by clause

| clause | what proves it |
|---|---|
| (1) five stages, declared order, Romanian labels, colour beside the label, no raw token | clients.spec case "P3-43 (1)(5)": option labels and values in order, stage set from the form, read back from the stored row via PostgREST, label text and `data-colour` asserted, tokens absent from the detail text |
| (2) order is data, not screen | clients.spec case "P3-43 (2)": five clients ordered by `stage` in the database return the declared order, asserted unequal to both alphabetical orders; also the 0039 assertions file |
| (3) De reluat needs a date | clients.spec case "P3-43 (3)": Romanian message on screen, stored row (stage and a changed phone) unchanged; a direct PATCH refused with `23514`; saving with a date reads back `2026-10-15`; also the 0039 assertions file |
| (4) every change recorded, same stage writes none | clients.spec case "P3-43 (4)": one `status_history` row with client id, `cold`, `nurture`, the owner's user id and a timestamp; saving the same stage writes none; also the 0039 assertions file |
| (5) existing rows are clients; new client is cold | first half: the `DO` block in 0039 itself. **The end to end suite cannot prove it**, because the local stack creates its rows after every migration has run. Second half: case "P3-43 (1)(5)" |
| (6) follow-up date is its own nullable date column | 0039 assertions file: `data_type = 'date'`, nullable, no default |
| check:migrations, check:no-destructive-migration, both applier proofs | the `quality` run on the head sha (see CI below) |
| check:pending-schema-reads, tsc | local, exit 0; and in `quality` |
| existing clients.spec and client-detail.spec cases pass unmodified | the End to end step of `quality` on the head sha |

## Commands run locally, and results

All from the worktree, each exit 0:

- `npx tsc --noEmit`
- `npm run build`
- `node docs/board/validate-board.mjs` on the three boards: 0 violations
- `npm run check:card-ids`
- `npm run check:board-edit`: P3-43, todo to shipped, flipped
- `npm run check:unique-ids`
- `npm run check:open-branch-ids`
- `npm run check:no-destructive-migration`: 2 files, 22 statements, every kind
  classified, no DROP TABLE, no TRUNCATE, no DELETE
- `npm run check:conflict-residue`
- `npm run check:categories`
- `npm run check:ledger-rows`
- `npm run check:no-prod-target`
- `npm run check:pending-schema-reads`
- `npm run check:removal-safety`
- `npm run check:assertion-register`

**Not run locally, and why:**

- `npm run check:migrations`, `npm run prove:applier` and `npm run prove:assertions`
  need Docker.
- The Playwright suite, `headers.spec` included, needs a local Supabase stack.
- This machine has neither. All of these run in `quality`, and that run is the only
  one.

## CI

**Red arm, run 34767124117** on the tests-only head `7fb916c`: `quality` failure,
at End to end only. Exactly the four new cases failed (clients.spec.ts:360, 394,
447, 498, the P3-43 (1)(5), (2), (3) and (4) cases); 195 passed. Every step in
front of End to end passed. The two applier proof steps were skipped there, as they
should be: that head carries no migration.

The red arm was watched to completion before the implementation was pushed,
because `quality.yml` sets `cancel-in-progress: true` and a push to the branch
would have cancelled it and lost the red-before.

**Implementation head:** pushed after the red arm concluded. Its `quality` run id,
conclusion and the applier proof steps are recorded in the pull request and in the
owner's merge question, `q003-approve-g2-merge.md`, because writing them here would
move the head sha away from the run that proved it.

## Deviations, stated rather than buried

1. **The board flip rides in this pull request, although the task said to wait
   for the apply.** `check:board-edit` refuses a code pull request whose card is
   not at a terminal status, and CLAUDE.md section 2 forbids landing the board edit
   separately. The operator's own rules say the repository's rules win. On `main`
   the board reads `shipped` at the moment of the merge, and under CLAUDE.md 8.0
   the merge is the apply, so holding the merge holds both. LEARNINGS entry "A task
   brief that defers the board flip until after the apply cannot hold here".
2. **The red-before ran in CI, not locally.** There is no local stack. The red arm
   was a pushed head carrying the cases alone, with the card at `shipped` and an
   evidence line opening "RED ARM ONLY, NOT THE SHIP HEAD". Without that status
   `check:board-edit` would have stopped the run before End to end. LEARNINGS
   entry "A red-before in CI has to survive every step in front of End to end".
3. **Branch name `card/p3-43-schema`, not `card/p3-43`.** That name carried #277,
   the AUTHOR widening of this card, already merged. `check:board-edit` reads the
   id from the branch prefix and from every commit subject, and resolved it.
4. **The history reader is SQL only.** `client_stage_history()` exists, as the
   card's defaults ask, but no screen shows history. Handover 4.7 excludes an
   activity timeline and the acceptance reads history from the stored rows.

## Defects found, cross-referenced to docs/LEARNINGS.md

- "A shipped card's lane is derived, and flipping only the status is refused"
- "A red-before in CI has to survive every step in front of End to end"
- "A task brief that defers the board flip until after the apply cannot hold here"

## Left for the owner

- **Approve or refuse the merge of #278**, question `q003-approve-g2-merge.md` in
  the factory mailbox. When it merges, the live database gains:
  - the stage and follow-up date fields on every client record
  - the stage-change history
  - every current client marked as a client

  Nothing else in the data changes.
- After the merge, `GET https://app.rapidconstruct.md/api/health` should show the
  merge commit and `ledger_version` `"0039"`.

## State at the end

P3-43 is complete on its branch and waits only on the owner's merge decision. The
next cards that build on it are P3-45 (the Leaduri list) and P3-46 (the CRM entry
and landing screen).
