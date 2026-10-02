# EXECUTOR report, card P3-130: the Sarcini table, its access rules and its data layer

**Date:** 2026-10-02. **Goal:** G73, Item 4 of Ivan's four items of 2026-09-30, part one.
**Branch:** `card/p3-130`, cut from `origin/main` at `6f696eb`. **Role:** EXECUTOR.
**Migration added:** `supabase/migrations/0068_tasks.sql`.
**Screens built:** none. Clause 7. The tab is P3-131, the panel P3-132, the Azi section P3-133.

## This was a RESUME after a usage limit death, and what the four surviving commits held

The first run of this card died on 2026-10-01 at about 15:57 with a one line log, "You've hit your
weekly limit". That is an account allowance and **not a fault in the task, the card or the code**. No
check had failed and no tool had errored. The worktree, the branch and four commits survived, unpushed:

1. `5dfdaf9` the board edit opening the card into `in_flight`.
2. `b489cc4` migration `0068_tasks.sql`: `public.tasks`, the three enums, the indexes, the
   `updated_at` trigger, the grants with no DELETE and the three policies with no delete policy.
3. `21f4abf` `scripts/poc-free/local-db/assertions/0068_tasks.sql`, four named groups which are
   acceptance (a) verbatim, plus a D7 guard.
4. `cf6964c` the `docs/migrations/APPLY-LOG.md` pending line and the `hasTasks` capability gate.

Two more files were in the working tree and were committed first in this run: `lib/data/tasks-types.ts`
and the `TOLERATED_WORDS` entry in `scripts/poc-free/check-pending-schema-reads.mjs`.

**`origin/main` had not moved** (still `6f696eb` when this run started and when it pushed), so **0068
was still the next free migration number** and nothing had to be renumbered. That was checked before
anything was built, because two files sharing a number is a conflict the applier cannot resolve.

The recovery, and the reason it matters, is written into `docs/LEARNINGS.md` as a repeatable class:
the obvious move on a card sitting in `queue/failed/` is the setup block at the top of its brief,
`git worktree add ... -b card/<id> origin/main`, and that would have discarded five commits' worth of
work that existed nowhere else.

## The two drafter's decisions, and both were KEPT

### DECISION A: the linked entity enum has TWO values and not three. KEPT.

`public.task_entity` is `('client', 'project')`. The card's clause 2 says a task may be attached to
"a lead, a client or a project", and in this platform that is two tokens:

- **A lead is a row of `public.clients` carrying a stage** (migration 0039). The decision is on the
  operator's decided and not to be reopened list: "A lead is a client row with a stage. No leads
  table, no second detail page."
- There is **no `public.leads` table in any of the sixty eight migrations**, and the Leaduri screens
  read `public.clients`.
- A third token would therefore be an enum label **nothing could ever reference**, and an enum label
  cannot be removed once a row carries it.

This does not weaken P3-132, which wants a panel on a lead page, a client page and a project page: the
lead detail page reads a client row, so it queries the `client` token. The assertions file also pins
the premise rather than trusting it: group 2 fails loudly if `public.leads` ever comes to exist, so
the decision gets revisited by a card instead of being silently assumed. **Recorded in the card's
`notes` in the board edit**, so P3-132's executor does not rediscover it.

### DECISION B: the assignee is nullable and references `public.profiles (id)` ON DELETE SET NULL. KEPT.

`profiles.id` cascades from `auth.users`, so deleting an auth user takes the profile row with it. Of
the three available behaviours:

- `on delete cascade` would **delete the task**, which clause 4 forbids outright.
- `on delete restrict` would block the auth user deletion, making the tasks table the reason an
  account cannot be removed.
- `on delete set null` keeps the record and loses only the pointer.

Only the third keeps a cancelled or finished job readable and countable, which is the whole promise of
this card. A profile is normally retired by setting `active` false rather than deleted, so this path
should never fire; it is written this way so that it cannot destroy a job if it does. The assertions
file requires **exactly one SET NULL foreign key from tasks to profiles** and says in its refusal text
why CASCADE is wrong, so the choice cannot be quietly reversed.

Nullable because an unassigned job is a real state: somebody writes a job down before deciding who
does it.

## The polymorphic shape chosen, and why

**A type column plus an id column**, `entity_type public.task_entity null` and `entity_id uuid null`,
held in a pair by `constraint tasks_entity_both_or_neither check ((entity_type is null) = (entity_id
is null))`, with the index `tasks_entity_idx on (entity_type, entity_id, created_at desc)`.

**Not three nullable foreign keys.** The card's own `defaults` say either shape is defensible and to
pick the one this repository already uses for a polymorphic reference, and that shape is
`public.status_history` from migration 0001: `entity_type public.status_entity not null` plus
`entity_id uuid not null`, indexed as `(entity_type, entity_id, created_at desc)`. The index here is
that one literally, because it answers the same question, "the jobs of THIS record, newest first",
which is exactly what P3-132's panel is made of.

**`public.status_entity` is NOT reused and could not be.** It is `('inbound_order',
'outbound_issue')`. A task attaches to different things entirely, so this card creates its own type
rather than widening one whose two labels are what the order history means. An assertion pins
`status_entity` unchanged, so this card cannot have touched it.

**The price of the shape is said out loud rather than left to be found:** `entity_id` carries no
foreign key, because a polymorphic column references two tables. `public.status_history` has paid the
same price since 0001 and this migration does not invent a trigger to simulate one: a second rule
about rows that the constraint graph does not hold is a rule the next writer forgets. What IS held is
the pair, by the check constraint above, which is acceptance (a)'s third group.

## Where the card and the task brief disagreed

**They did not disagree on anything material.** Two small notes, both recorded because the brief asked:

1. The brief says "the two enums" in its heading and then describes the linked entity type as a third.
   The card's acceptance (a) also names only two ("the status enum holds exactly four values and the
   priority enum exactly three"). **The migration creates three** enums, because the linked entity of
   clause 2 needs a type and clause 2 is the card. The card wins and there is no conflict: acceptance
   (a) pins the two it names and the third is asserted beside them anyway.
2. The brief named the report file `2026-10-01-executor-p3-130-sarcini-table.md`. This run is on
   2026-10-02, so the report is dated for the day it was written, which the resume brief itself asks
   for. The work is the same card.

## What was built in this run

- `lib/data/tasks-types.ts` (committed from the surviving working tree): the three token unions, the
  Romanian label maps `TASK_STATUS_LABEL` and `TASK_PRIORITY_LABEL` with their diacritics, and the
  `Task`, `NewTaskInput` and `TaskPatch` shapes. A `Record` over the union and not a `Partial`, so
  `npx tsc --noEmit` refuses a future token with no label. The Romanian words for the two entity kinds
  are deliberately NOT written: they first appear as values of P3-131's linked-type filter and that
  card decides what the operator reads, the same pattern P3-118 followed for `OUTBOUND_MODE_LABEL`.
- `lib/data/tasks-shape.ts`, new, no server code: the three token lists and predicates, the refusal
  sentences, `validateNewTask` and `validateTaskPatch`. A plain module because a `"use server"` file
  may export only async functions and cannot be imported by a test that calls it directly, the lesson
  `lib/data/outbound-mode.ts` records. **No calendar check for the due day**: the only authority over
  whether a day exists is the `date` column in PostgreSQL, card P3-118's ruling; only the `yyyy-mm-dd`
  shape is required here and the database's refusal is translated into Romanian in the actions file.
- `lib/data/tasks.ts`, new, `server-only`, on the model of `lib/data/outbound.ts`: `tasksVisible`,
  `listTasks`, `getTask` and `listTasksForEntity`. **No filter, no sort and no bucket**: the five
  filters, three sorts and three buckets need one definition of the Chisinau day through
  `chisinauToday()`, read from where the Azi screen reads it, and that is P3-131 clause 6. Written
  here, by a card with no screen, they would be a second definition of "late".
- `lib/data/tasks-actions.ts`, new, `"use server"`, on the model of `lib/data/outbound-actions.ts`:
  `createTask` and `updateTask`, and no third function. **No delete and none is possible.** **No
  cancel function either**: cancelling is an update to `'cancelled'`, which `updateTask` performs like
  any other, exactly as the migration's closing section says. `created_by` is not sent from the
  application: the column defaults to `auth.uid()`, as `public.invoices.created_by` does in 0063, so no
  write path can forget who wrote the job. `revalidatePath` is deliberately not called, because this
  card builds no route to revalidate.
- `tests/e2e/tasks.spec.ts`, new: the five named cases under the card's exact names, plus one case
  proving the stored token and the Romanian label agree in both directions.
- `scripts/poc-free/check-pending-schema-reads.mjs`: one `TOLERATED_WORDS` entry for
  `lib/data/tasks-types.ts` and the word `description`, with the reason written out. **This is not a
  weakened check.** The pending column carrying that word is `extraction_draft_lines.description` from
  migration 0053; `tasks.description` is created inside `create table`, which the check does not index
  as a pending column at all; and the file names no table and calls no function, so it cannot reach
  either. `TOLERATED_WORDS` already holds entries of exactly this shape and for exactly this reason
  for `lib/data/facturare-create-types.ts`, `lib/data/facturare-detail-types.ts` and
  `components/facturare/FacturaEditor.tsx`. A tolerated word is not a refusal, so it needs no row in
  `docs/ASSERTION-REGISTER.md`; `npm run check:assertion-register` passes unchanged.
- `docs/LEARNINGS.md`: three ERROR and SOLUTION pairs, the usage limit resume among them.
- The board edit on `docs/board/rc-board-phase3.json` and this report.

## Both files that name the table go behind `hasTasks`, and why that is not optional

Migration 0068 is in the pending register from the moment its line was added, and
`npm run check:pending-schema-reads` refuses any file under `lib/` or `app/` that names an object a
pending migration adds unless that file also carries a capability gate. The reason is INC-05 of
2026-08-31, when every screen in the platform answered 500 because migrations were merged and not
applied and the merged code asked for columns that did not exist. `lib/data/tasks.ts` and
`lib/data/tasks-actions.ts` both import and use `hasTasks`; `lib/data/tasks-types.ts` and
`lib/data/tasks-shape.ts` name no table and have nothing for a gate to protect.

`hasTasks` is its own gate and reuses nobody else's, following `hasDocuments` for a whole new table.
`hasPhase3Schema` asks whether the phase 3 tables are applied, which is a different question: 0068 is
a separate migration and can be applied before or after any other, and a gate that answers the wrong
question is a gate that opens on the wrong day.

**Behaviour before the migration applies is the behaviour of today**, and that is cheap to promise for
this card because it builds no screen: every read answers empty, every write refuses in Romanian, and
nothing answers 500.

## D7: the existing next step field is untouched. Acceptance (f).

`git diff --name-only origin/main...HEAD` contains none of these paths and no changed file names any of
these objects outside a comment explaining that it does not touch them:

- `public.clients.next_action_at` and `public.clients.next_action` (migration 0058)
- `supabase/migrations/0058_client_next_action.sql`
- `public.search_clients_next_action`
- `hasClientNextAction` in `lib/data/schema-capability.ts`
- the Azi screen (card P3-91) and `lib/data/azi.ts`

Clause 1 says why they are different shapes: the next step is ONE promise per client, replaced each
time, and Sarcini is a QUEUE of many jobs each with its own status, priority, due date and assignee.
One column cannot be both. Azi showing tasks due today is card P3-133. The assertions file carries a
guard group for this as well.

## MERGE IS APPLY, and what changes in the live database

This pull request adds `supabase/migrations/0068_tasks.sql`, so **merging it changes the production
database within about two minutes** (CLAUDE.md 8.0, ruling R-124), and real client data has been in
production since 2026-09-14.

**In one plain sentence:** the database gains one new table, `public.tasks`, and three new enum types
for its status, its urgency and the kind of record a job is attached to, and nothing that exists today
is changed, moved or removed.

**Additive only.** No `DROP TABLE`, no `TRUNCATE`, no `DELETE`, no `DROP COLUMN`, no `DROP FUNCTION`,
no `UPDATE` of an existing row, and no `INSERT` at all.
`npm run check:no-destructive-migration` **RAN** and exited 0: "1 file(s) parsed, 32 statement(s), no
DROP TABLE, no TRUNCATE, no DELETE, and every statement kind classified."

**No self merge.** `gh pr merge` was never run by this session. The OWNER mailbox question exists as a
**record and not a gate**, because the platform owner's auto-merge script squash merges any green pull
request of ours within seconds and has landed 0063, 0064, 0065, 0066 and 0067 that way. The apply is
verified afterwards by reading `https://app.rapidconstruct.md/api/health` and confirming the merge
commit and `ledger_version` `0068`, which was `0067` at `6f696eb`.

## Local gates, each command run alone so the exit code is its own

All exit 0: `npx tsc --noEmit`; `npm run build`; the board validator over all three board files before
every commit; `check:card-ids`; `check:unique-ids`; `check:open-branch-ids`;
`check:no-destructive-migration`; `check:conflict-residue`; `check:categories`; `check:ledger-rows`;
`check:no-prod-target`; `check:pending-schema-reads`; `check:removal-safety`;
`check:assertion-register`; `check:board-clock`; `check:board-edit`.

`check:board-edit` refused the branch while the card was `in_flight`, which is exactly what it is for,
and passes once the card is flipped. `check:board-clock` was red on arrival for a reason belonging to
the previous run and now fixed: `P3-130.last_checkpoint` had been written eight minutes ahead of the
commit that carried it. Both are in `docs/LEARNINGS.md`.

**This machine has no Docker and no Supabase CLI**, so `check:migrations`, `prove:applier`,
`prove:assertions` and the end to end suite run **only in CI**, and nothing here claims otherwise.

## No production access

No live site was opened beyond the public `/api/health` endpoint, no production row was read, no
credential was sourced, and environment variable NAMES only appear anywhere in this work. No file
under `app/api/extraction/**`, `app/api/documents/**`, `lib/data/extraction*` or
`docs/contracts/extraction*` was touched, so there is nothing to tell Andre.

## What is left for the three cards that depend on this one

- **P3-131** owns the Sarcini tab: the list, the five filters, the three sorts, the three buckets and
  the overdue flag, all from one definition of the Chisinau day. It also decides the Romanian words for
  the two linked record kinds and writes them into `lib/data/tasks-types.ts`.
- **P3-132** owns the panel on the lead, client and project detail pages. It queries the `client`
  token for a lead, for the reason recorded in the card's notes.
- **P3-133** owns the Azi section. The index `tasks_status_due_date_idx` is already built for it, so
  none of the three needs a second migration.
