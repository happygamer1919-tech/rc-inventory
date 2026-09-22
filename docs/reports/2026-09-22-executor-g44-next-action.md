# Executor report: P3-89, a next step on every lead and client (goal G44)

Role AUTHOR (the card), then EXECUTOR (the build). Branch `card/p3-89`, one pull
request. Run date 2026-09-22 (UTC).

## In plain words

Every lead and every client can now carry "Următorul pas": a date and one short
line, for example "trimit oferta". It sits right under the stage, on the lead or
client page and in the Modifică form. The Leaduri list has a new column showing
it, and the list now puts the soonest next step first. Leads that already have a
call-back date (De reluat) keep exactly the order they have today.

At De reluat there is only one date box, the call-back date, and saving it also
sets the next step date, as the owner asked ("setting one sets both").

Nothing is deleted and no existing lead or client is changed by the database
update: the two new fields start empty for everyone.

The owner's words, GOALS.md G44: "Next step on every lead and client. Two new
nullable columns on public.clients: next_action_at date and next_action text (one
line, e.g. 'trimit oferta'). Shown and editable on the lead page and the client
page, right under the stage, as 'Următorul pas' with a date box and a text box;
the Leaduri list shows it and sorts by it when set (the existing follow_up_date
stays the De reluat rule; next_action_at is the general one, and when a lead is in
De reluat the two dates are the same box: setting one sets both)."

## Boot status (CLAUDE.md 1)

- Phase 2 board: 68 shipped, 2 blocked, 32 todo. Launch gates 0/0.
- Phase 3 board: 105 shipped, 32 todo before this card; P3-89 added.
- Next eligible by lowest id: AUT-3 (phase 2), P3-14 (phase 3). This run works
  the owner's goal G44, queued by the operator factory, as new card P3-89.
- Id: `npm run id:free -- P3-89` answered FREE, lane highest P3-88, zero open
  pull requests.

## Two decisions that differ from the factory brief, and why

### 1. A new list function, not a drop and recreate

The brief said: drop `search_clients_by_stage` and create it again with two more
output columns (PostgreSQL cannot change a return type with `create or replace`).
I read the checks before writing it:

- `check:no-destructive-migration` would have passed: `DropStmt OBJECT_FUNCTION`
  is in its permitted set (`scripts/poc-free/check-no-destructive-migration.mjs`,
  `PERMITTED_DROP`).
- **`check:removal-safety` would have refused.** It reads every migration listed
  as pending in `docs/migrations/APPLY-LOG.md`, treats a `DROP FUNCTION` as a
  removal, and fails while any file under `lib`, `app` or `components` still
  calls `.rpc("search_clients_by_stage")`. `lib/data/clients.ts` does, and must
  (it is the fallback before the migration lands).
- A drop and recreate of a name the live app calls also opens the two-minute
  window CLAUDE.md 8.0 describes, in both directions.

So migration 0058 adds **`public.search_clients_next_action`**: the same seven
parameters and the same body as 0057's `search_clients_by_stage`, plus
`next_action_at` and `next_action` in the result, and the new Leaduri sort. The
old function is not touched at all. The app calls the new one only when the new
gate `hasClientNextAction` sees the columns (same transaction as the function);
before that, everything runs exactly as today. **The migration contains no DROP
of any kind**, so no comment to a reviewer about a function drop is needed.

### 2. The Leaduri order: next step date, else the call-back date

The brief proposed sorting by `next_action_at` alone, on the premise that it
equals `follow_up_date` at De reluat once the card lands. That is true only for
leads saved after the card: the migration writes no row, so every lead already
at De reluat would read null and drop to the bottom, losing the oldest-overdue
first order. The sort key is therefore `coalesce(next_action_at,
follow_up_date)`, nulls last, then name and id: a lead with a next step sorts by
it, every other lead exactly as before. This is also the goal's own wording,
"sorts by it when set". Consequence: no existing assertion or spec about the
Leaduri order needed any change.

## The same-box rule, and the precedence chosen

- At De reluat the edit form shows one date box (the existing "Data de reluare")
  and only the text box for the next step, with the hint "Data pasului este data
  de reluare."
- The server action (`validateNextAction` in `lib/data/client-actions.ts`): when
  the call carries stage `follow_up` with a date and **no explicit
  `nextActionAt`**, it writes that same date into `next_action_at`.
- **An explicit `nextActionAt` in the same call wins.** Someone typed it on
  purpose, and silently overwriting an explicit value is the worse surprise. The
  edit form never sends one at De reluat, so on screen the two stay equal.
- `follow_up_date` is still written only by `set_client_stage`; this card never
  writes it. Leaving De reluat still clears it (0057). `next_action_at` keeps its
  value after leaving De reluat, visible in its own box, until someone changes it.
- "Absent means do not touch": the form sends the date and text only when they
  differ from what the client had, like source, interest and owner. A save that
  touches only the phone sends neither. (At De reluat every save carries the
  call-back date, as since P3-43, so it also mirrors it into the next step date,
  which keeps the two equal.)

## What changed, by file

- `supabase/migrations/0058_client_next_action.sql`: two nullable columns on
  `public.clients` (`next_action_at date`, `next_action text`, no default, no
  check), and the new function with its grant to `authenticated`. One
  transaction. No UPDATE, DELETE, DROP or TRUNCATE.
- `scripts/poc-free/local-db/assertions/0058_client_next_action.sql`: the column
  shape, the new function's signature and grant, the old function's ten output
  columns unchanged, the new Leaduri order, the columns read back, `overdue`
  identical between old and new, views, stage filter, total, and the old list's
  order unchanged.
- `docs/migrations/APPLY-LOG.md`: pending line for 0058, card P3-89.
- `lib/data/schema-capability.ts`: `hasClientNextAction`, modeled on
  `hasClientLeaduri`, probing the two columns.
- `lib/data/clients-types.ts`: `nextActionAt` and `nextAction` on `ClientRow`
  and `ClientDetail`, plus `nextActionAvailable` on `ClientDetail`.
- `lib/data/clients.ts`: `listClients` calls the new function behind the gate and
  reports `nextActionAvailable`; `getClient` selects the two columns behind it.
- `lib/data/client-actions.ts`: `ClientInput.nextActionAt` / `nextAction`,
  `validateNextAction`, written in the same insert or update as the other plain
  columns, behind the gate.
- `components/clients/ClientForm.tsx`: "Data următorului pas" and "Următorul pas"
  right under the stage (text only at De reluat).
- `components/clients/ClientDetailScreen.tsx`: a read-only "Următorul pas" row
  right under the stage and "Data de reluare" rows.
- `components/clients/ClientsScreen.tsx`, `app/(app)/clienti/page.tsx`: an
  "Următorul pas" column in the Leaduri view, after "Data de reluare". At De
  reluat it shows only the text (the date is in the column beside it); the
  "Întârziat" chip is untouched.
- `tests/e2e/lead-next-action.spec.ts`: the named test.

## The named test, `tests/e2e/lead-next-action.spec.ts`

Five G44 cases plus one phone check:

1. A next step set from Modifică on a lead at În cultivare that already carries a
   call-back date: both columns stored, the call-back date unchanged, the block
   sits below the stage, the detail page shows it.
2. The Leaduri list shows the column and orders earlier step, later step, no step
   (names in reverse order so a name sort cannot pass).
3. At De reluat: one date box only; saving it stores the same date in
   `follow_up_date` and `next_action_at`.
4. Emptying the date and the text stores null in both; the lead stays on the
   list with "-".
5. A save that changes only the phone leaves `next_action_at` and `next_action`
   exactly as they were (whole stored row compared).
6. At 390 px the date and text boxes stack and stay inside the screen. This is
   the phone layout proof in place of a screenshot: this machine has no
   database, so the app cannot be rendered here.

## Existing specs that touch the Leaduri list or these columns

`git grep` over `tests/e2e` for `search_clients_by_stage`, `follow_up_date`,
`p_follow_up_date` and the Leaduri view: `clients.spec.ts`, `crm-landing.spec.ts`,
`lead-follow-up-date-cleared.spec.ts`, `leaduri.spec.ts`,
`list-filters-layout.spec.ts`, `phone-forms.spec.ts`, `phone-lists.spec.ts`,
`phone-remainder.spec.ts`, `reactivate-lead.spec.ts`, `romanian-file-date.spec.ts`.
**No assertion was changed.** Read against this change:

- `leaduri.spec.ts` P3-45 (3), the only order assertion: its rows carry a
  call-back date and no next step, so the fallback sort gives the same order.
- Header checks (`leaduri.spec.ts` `headers.slice(0, 2)` and the no-view list's
  five headers): the new column is only in the Leaduri view, after the second
  header.
- Phone row cards (`phone-lists`, `phone-remainder`): the new cell carries
  `data-label` equal to its header and wraps on phone like Interes.
- G43 case 5 saves a De reluat lead unchanged: it now also mirrors the date into
  `next_action_at`, which that spec does not read; its assertions hold.

Whether each still passes is decided by the pull request's `quality` run.

## Local gates, run from the worktree, each exit 0 unless said

- `npx tsc --noEmit`: 0.
- `npm run build`: 0.
- Board validator on all three boards: 0 before every commit.
- `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
  `check:no-destructive-migration` (1 file, 10 statements, every kind
  classified), `check:conflict-residue`, `check:categories`, `check:ledger-rows`,
  `check:no-prod-target`, `check:pending-schema-reads` (15 pending, no unguarded
  read), `check:removal-safety` (15 pending, no reader of anything removed),
  `check:assertion-register`: all 0.
- `check:board-edit`: refused while the card was `in_flight`, as designed; 0
  after the flip to `shipped` in this pull request.
- No lint script exists in `package.json`.

## Left for CI (no Docker, no Supabase CLI on this machine)

- `npm run check:migrations`: 0058 applied to bare postgres and every assertion
  file, 0058's included.
- Both applier proofs (`prove:applier`, `prove:assertions`): must RUN, not skip,
  because this pull request touches `supabase/migrations/**`.
- The end to end suite, the new spec and every existing one.

## Learnings

Two entries appended to `docs/LEARNINGS.md`: widening a called function needs a
new name, not a drop; a sort key moved to a new nullable column needs the old key
as fallback. Nothing else broke.

## Merge

Not merged by this run. Real client data is in production and the pull request
carries a migration: an `OWNER:` approval question goes to the factory mailbox
once `quality` is green on the head sha.
