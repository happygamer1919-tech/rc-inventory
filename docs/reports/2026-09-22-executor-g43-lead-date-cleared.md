# Executor report: P3-88, leaving De reluat clears the follow-up date (goal G43)

Role EXECUTOR. Branch `card/p3-88`, one pull request. Run date 2026-09-22 (UTC).

## In plain words

When Mihai's team moves a lead out of De reluat (to În cultivare, Ofertat or any
other stage), the call-back date is now removed, unless they type a new one in
the same save. The Leaduri list only says "Întârziat" for leads that are still in
De reluat. Leads that already left De reluat before this change keep the date
they carry, but they stop showing as late. Nothing is deleted.

The owner's words, 2026-09-22: "when you move a lead from De reluat to În
cultivare or Ofertat, the date is not cleared and it says it is late."

## Boot status (CLAUDE.md 1)

- Phase 2 board: 68 shipped, 2 blocked, 32 todo.
- Phase 3 board: 104 shipped, 32 todo before this card; P3-88 added.
- This work is an owner-reported defect against shipped card P3-45, not the next
  eligible card.

## Why a card was authored

The task asked for no new card unless nothing covered it. `check:board-edit`
refuses a pull request that carries code under a card id whose status does not
move, and the branch and title carry the allocated id P3-88 (`npm run id:free --
P3-88`: FREE, lane highest P3-87, zero open pull requests). So P3-88 is on the
phase 3 board, and P3-45 carries a pointer note in its `notes`, as the task asked.

## What was wrong, found in the code

Two causes, not one:

1. **The database kept the date by design.** `set_client_stage` (0039, and its
   four-parameter body in 0040) did `v_next_date := coalesce(p_follow_up_date,
   v_date)`, so a null date always meant "keep", and `search_clients_by_stage`
   computed `overdue` from the date alone, whatever the stage.
2. **The edit form sent the stored date back even when it could not be seen.**
   `ClientForm.tsx` shows the date field only at De reluat, but its state is
   initialised from the stored date and was sent on every save. So when the
   owner moved a lead to În cultivare, the form sent the old date as if typed.
   A database fix alone would not have fixed the screen.

## What changed

1. **Step 1, the mechanism: inside the function body, not a fifth parameter.**
   Migration `supabase/migrations/0057_lead_follow_up_date_cleared.sql`
   `create or replace`s the four-parameter `set_client_stage` body with one added
   condition: a move whose stored stage is `follow_up`, to a different stage,
   with no date passed, stores null. Everything else is 0040 line for line. The
   three-parameter form is not touched; it already delegates to that body.
   **Why this and not the fifth parameter:** no third overload of the same name
   (no PGRST203 risk), and no two-minute window after merge in which the new
   application code would call a signature production does not have yet
   (CLAUDE.md 8.0). The app keeps calling the three-parameter form it calls
   today. Before the migration lands a null keeps the date, as now; after, it
   clears. No save can fail in between.
2. **Step 2, the migration.** Number 0057, next after 0056 (checked against
   origin/main at f616c19). Additive only: two `create or replace function`, two
   `comment on function`, two `grant`s that already existed, one verification
   `select`. **No ALTER TABLE, no UPDATE, no DELETE, no DROP, no TRUNCATE. No
   stored row changes.** `check:no-destructive-migration` locally: 1 file, 10
   statements, OK. Listed as pending in `docs/migrations/APPLY-LOG.md`.
3. **Step 3, the list.** `search_clients_by_stage`'s `overdue` is now
   `coalesce(v.stage = 'follow_up' and v.follow_up_date < k.today, false)`. Same
   signature, same sort, same views, same Chisinau day. In the same migration
   file as step 1.
4. **Step 4, `lib/data/client-actions.ts`.** No logic change was needed: the
   action already sends null when no date is given, and null is now the clearing
   signal for exactly the move that leaves De reluat. The P3-45 comment in
   `validateStage` ("O DATA SCRISA SE PASTREAZA LA ORICE ETAPA") is kept, quoted,
   and corrected beneath it with what is true now.
5. **Step 5, screens.** No screen computes lateness itself. `ClientsScreen.tsx`
   shows the chip only from the `overdue` column, and `ClientDetailScreen.tsx`
   shows the date without a late marker. No screen change was needed.
6. **Step 6, the form. Yes, a change was needed.** The form closes and calls
   `router.refresh()` after save, so it does not keep stale state across saves;
   the defect was that it sent the hidden date. `ClientForm.tsx` now sends the
   date only when the chosen stage is De reluat, and the empty string otherwise.
   The add-lead form (`LeaduriForm.tsx`) is unchanged: it creates, and a first
   stage has no "from".

## Tests

New file `tests/e2e/lead-follow-up-date-cleared.spec.ts`, five cases named G43:

1. De reluat with a past date, moved to În cultivare from the edit form, no date
   typed: stored `follow_up_date` is null; the Leaduri row shows no date and no
   `row-overdue`. The case first asserts the chip IS there before the move.
2. The same kind of lead moved back to De reluat from the form with no date: the
   Romanian refusal shows and the stored row is unchanged.
3. De reluat moved to Ofertat with a new date in the same call: the new date is
   stored. Through `set_client_stage` directly, because the edit form shows the
   date field only at De reluat, so the screen cannot type a date at Ofertat.
4. No date, moved Lead rece to În cultivare to Ofertat from the form: stays null,
   no error.
5. De reluat saved again at De reluat, once through the function with a null
   date and once from the form with nothing changed: date kept, no history row.

New assertion file `scripts/poc-free/local-db/assertions/0057_lead_follow_up_date_cleared.sql`
proves the same at the database, plus: still exactly two `set_client_stage`
forms, no default added, the four-parameter form with `p_first` false clears
too, a move that does not start at De reluat keeps a date it carries, the
overdue flags per stage, and that the sort is unchanged.

### Existing assertions deliberately updated (each encoded the old rule)

- `scripts/poc-free/local-db/assertions/0039_client_stage.sql`, block "LEAVING DE
  RELUAT KEEPS THE DATE": now expects the date cleared after follow_up to quoted,
  and the later move back to follow_up now passes a date, because none is left.
  The old heading and line are quoted beside the new ones. These files run
  against the finished schema, so they must state today's rule.
- `scripts/poc-free/local-db/assertions/0040_client_leaduri.sql`, the overdue
  string: `Z intarziat` (a past date at nurture) now expects `false`, was `true`.
  Its order assertion is unchanged.
- `tests/e2e/leaduri.spec.ts`, P3-45 (3), line 406: the overdue fixture was
  `stage: "nurture"` with a past date; it is now `stage: "follow_up"`. The order
  and chip assertions it proves are unchanged. No other assertion in that file
  was touched.

### Every existing spec that calls `set_client_stage` or reads the date or overdue

`git grep -n "p_follow_up_date\|set_client_stage" tests/e2e` and the date and
overdue readers:

- `clients.spec.ts`: P3-43 (2) moves from `cold` only; P3-43 (3) goes cold to
  follow_up with a date and reads it back; nothing leaves follow_up with a null
  date. Unchanged, still expects what it expects.
- `leaduri.spec.ts`: fixtures move from `cold` (never from follow_up), so dates
  are kept as before; only the P3-45 (3) line above changed.
- `crm-landing.spec.ts`, `phone-lists.spec.ts`, `reactivate-lead.spec.ts`: move
  from `cold` with a null date. Unaffected.
- `romanian-file-date.spec.ts`: creates a lead at De reluat through the add-lead
  form and reads the date back. First stage, unaffected.

## Commands run locally, each exit 0 unless said

- `npx tsc --noEmit`: exit 0.
- `npm run build`: exit 0.
- Board validator on all three boards before every commit: PASS, 0 violations.
- `npm run check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
  `check:no-destructive-migration`, `check:conflict-residue`, `check:categories`,
  `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`,
  `check:removal-safety`, `check:assertion-register`: all OK.
- `npm run check:board-edit`: refused while the card was `in_flight`, as it
  should; rerun after the flip to `shipped`.
- Lint: this repository has no `lint` script (`npm run lint`: missing script).
- Dash scan of the whole diff: no em dash, no en dash.

## Left for CI (this machine has no Docker and no Supabase CLI)

- `npm run check:migrations`: applies 0057 unmodified to postgres:16 and runs
  every assertion file, the three touched here included.
- `Refuse a migration that removes rows` and both applier proof steps: must RUN
  and pass on the head sha.
- The whole end to end suite, the five G43 cases and every existing spec.

## Real client data

This card touches the table where about 380 real leads live in production. This
run never read production and has no credentials for it. Nothing seen suggested a
real record was involved in any test; every test row carries the TEST prefix. The
migration changes no stored row; after merge, real leads that already left De
reluat keep their date and simply stop showing as late.

## Learnings

Two entries added to `docs/LEARNINGS.md`: a hidden form field still sends the
value its state holds; assertion files run against the finished schema, so a
reversed rule edits the older card's assertion file.

## Merge

No self-merge: the pull request carries a migration and real client data is in
production. The merge is the owner's, after CI is green.
