# EXECUTOR report: P3-45, the Leaduri list and the add-lead form

**Role:** EXECUTOR. **Date:** 2026-09-13 (UTC). **Worked from:** the new operator's
task queue, task G3 (`004-g3-p3-45-leaduri`), run headless on a machine with no
Docker, no Supabase CLI and no production credentials.

## In plain words

Mihai's team now has a Leaduri view on the client list. It shows every customer who
is not yet a client, with a coloured chip and a count for each stage. The leads they
promised to call back and have not are at the top, marked "Întârziat". They can
narrow it to one stage, search it by name, and send the filtered list to someone as
a link. A "Lead nou" form adds a lead with the person to talk to, how the lead came
in, what they want, who on the team owns it, when to chase it and notes. Moving a
lead to "Client" moves it to the Clienți view, as the same record.

The plain client list, with no view chosen, shows every customer exactly as before.

**Merging changes the live database within about two minutes.** It adds three empty
fields to every customer record (source, interest, owner) and the new list queries.
It removes nothing and changes no existing value.

## Card touched

| card | status at start | status on this branch | pull request |
|---|---|---|---|
| P3-45 | todo | shipped (reaches `main` with the merge) | #279 |

## Boot status report (CLAUDE.md section 1)

- Phase 2 board: 102 cards, 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted.
  Launch gate 0/9. Next eligible by id: AUT-3.
- Phase 3 board (read too, RULE-05): 93 cards, 53 shipped, 40 todo. Launch gate 0/9.
  Next eligible by id: CI-04. P3-45 eligible: todo, not blocked, its one dependency
  P3-43 shipped (#278 merged). It is the card the task named.
- Open pull requests at pick time: 0. Highest migration: 0039, so 0040 was free.
- Production before the merge, read-only `GET /api/health`: commit `682f70d`,
  `ledger_version` `"0039"`.

## What was built

**Migration, by path:** `supabase/migrations/0040_client_leaduri.sql`

- type `public.client_source`: recomandare, telefon, site, vizita, altul
- `clients.source` (that enum), `clients.interest` (text), `clients.owner_id` (uuid,
  references `auth.users`, on delete set null, like `created_by`), all nullable with
  no default, and `clients_owner_id_idx`
- `set_client_stage(uuid, client_stage, date, boolean)`: the one writer of the stage.
  With `p_first` true it records the stage a new lead was created at, from no stage,
  and refuses if the client already has stage history. The fourth parameter has no
  default, so three-argument calls cannot become ambiguous.
- `set_client_stage(uuid, client_stage, date)` from 0039 keeps its signature and
  behaviour and now delegates with `p_first` false
- `match_clients()`: the 0020 search predicate written once
- `search_clients_by_stage()`: the list with `p_view` leaduri or clienti and
  `p_stage`, overdue flag computed in `Europe/Chisinau`, Leaduri ordered by follow-up
  date ascending with no date last
- `client_stage_counts()`: all five stages, zero included, under the same search,
  type and status

**No UPDATE, no DELETE, no DROP, no TRUNCATE.** `search_clients` from 0020 is kept.

**Assertions:** `scripts/poc-free/local-db/assertions/0040_client_leaduri.sql` (shape,
first-stage behaviour, the three-parameter form still resolving, the view partition,
the order, the overdue flag, counts). `assertions/0039_client_stage.sql` changed to pin
its functions by signature instead of counting names, because 0040 overloads one.

**Journal:** a `docs/migrations/APPLY-LOG.md` entry for 0040, predicting the apply by
merge and quoting the health read above.

**Application:**

- `hasClientLeaduri()` in `lib/data/schema-capability.ts` probes the three new
  columns, so the minutes between the code landing and 0040 landing behave as today.
- `parseClientQuery` reads `vedere` and `etapa`; an `etapa` alone decides the view.
- `listClients` calls `search_clients_by_stage` behind the probe and `search_clients`
  otherwise; `countClientsByStage` and `listClientOwnerChoices` are new, in the same
  file. One data function for every view.
- `createClientRecord` widened with source, interest, owner, contact person and the
  first-stage flag; the contact person goes through the existing `createContact`.
  No second insert path.
- `/clienti`: view buttons Toți, Leaduri (with total) and Clienți (with count); in
  Leaduri, four stage chips in stage order with colour, label and count; lead columns
  Denumire, Etapă, Data de reluare (with "Întârziat"), Telefon, Stare; a "Lead nou"
  button and `components/clients/LeaduriForm.tsx`.
- `components/clients/StageMark.tsx`: the stage label with its colour, moved out of
  the detail screen and reused by the list and the chips.

**Tests:** `tests/e2e/leaduri.spec.ts`, new, eight cases. No existing case modified.

## Acceptance, clause by clause

| clause | what proves it |
|---|---|
| (1) handoff 4.8 line 3, the form creates a client at any stage | leaduri.spec "P3-45 (1)": five leads through the form, every field and the contact row read back through PostgREST, one history row from no stage with actor and time; form opens at Lead rece; blank name refused in Romanian; source options exactly the five tokens with labels |
| (2) handoff 4.8 line 4, from this form | leaduri.spec "P3-45 (2)": Romanian message, total client count unchanged, no row with that name |
| (3) handoff 4.8 line 5, overdue first | leaduri.spec "P3-45 (3)" and the 0040 assertions: names sorting opposite to dates, overdue above today above upcoming above no date; only the overdue row marked |
| (4) handoff 4.8 line 6, each stage filters to itself | leaduri.spec "P3-45 (4)": four chips in order with label and colour, each stage returns only its row (stage read from the database), client through Clienți, filter in URL, back restores it |
| (5) the counts | leaduri.spec "P3-45 (5)" and the 0040 assertions: shown counts equal stored rows under the same search, unchanged by a chip, and different under `stare=toate` |
| (6) handoff 4.8 line 7, the views partition | leaduri.spec "P3-45 (6)": 30 rows over two pages; Leaduri has no client, Clienți only client, empty intersection, union equals the unfiltered list; also the 0040 assertions |
| (7) handoff 4.8 line 8, conversion | leaduri.spec "P3-45 (7)": same id moves view, client count unchanged, one history row quoted to client |
| (8) search by name | leaduri.spec "P3-45 (8)": a part of a name, in the URL, combined with a stage |
| existing clients.spec and client-detail.spec cases unmodified | End to end in `quality` on the head sha |
| check:migrations, check:no-destructive-migration, both applier proofs | `quality` on the head sha |
| check:pending-schema-reads, tsc | local, exit 0; and in `quality` |

## Commands run locally, and results

All from the worktree, each exit 0, on the implementation head:

- `npx tsc --noEmit`
- `npm run build`
- `node docs/board/validate-board.mjs` on the three boards: 0 violations
- `npm run check:card-ids`
- `npm run check:board-edit`
- `npm run check:unique-ids`
- `npm run check:open-branch-ids`
- `npm run check:no-destructive-migration`: 1 file, 28 statements, every kind
  classified, no DROP TABLE, no TRUNCATE, no DELETE
- `npm run check:conflict-residue`
- `npm run check:categories`
- `npm run check:ledger-rows`
- `npm run check:no-prod-target`
- `npm run check:pending-schema-reads`
- `npm run check:removal-safety`
- `npm run check:assertion-register`

The same set ran on the red-arm head before its push, each exit 0.

**Not run locally, and why:** `npm run check:migrations`, `npm run prove:applier`,
`npm run prove:assertions` and the Playwright suite need Docker or a local Supabase
stack, and this machine has neither. All run in `quality`.

## CI

**Red arm, run 34772991914** on the tests-only head `57dda10`: `quality` failure at
End to end only. Exactly the eight new cases failed (leaduri.spec.ts:262, 359, 384,
432, 500, 557, 599, 638); 199 passed. Every step in front of End to end passed; the
two applier proof steps were skipped, correctly, since that head carried no
migration. It was watched to completion before the implementation was pushed,
because `quality.yml` cancels an in-progress run on a new push.

**The red arm also caught a defect in the test.** Case (2) failed on its first read,
not on the missing form: PostgREST answered 206 to a counted read with `limit=1`, and
the helper demanded 200. Fixed on the implementation head, with two more test fixes
found while reading every case again: case (8) searched for a fragment in the wrong
word order, and case (2)'s "no row created" check used a pattern that could never
match. LEARNINGS entry "PostgREST answers 206, not 200, to a count=exact read whose
range is partial".

**Implementation head:** its `quality` run id, conclusion, the applier proof steps
and `npm run checks:state 279` are recorded in the pull request, because writing them
here would move the head sha away from the run that proved them.

## Decisions taken without asking, stated rather than buried

Each is logged in the card's `notes` too.

1. **The first history row.** Clause 1 wants a row from no stage when a lead is
   created. P3-43's case 4 pins zero history rows when a client is created through
   the existing form, and must pass unmodified. Both cards route every stage write
   through `set_client_stage`. So the writer gained a required fourth flag that only
   the add-lead form passes, and the three-parameter form delegates to it. There is
   still one body that writes the stage. A trigger would have broken P3-43; a second
   writer was refused by both cards.
2. **`owner_id`, not `owner`.** `owner` is the administrator role in this schema, and
   every policy on the table calls `is_owner()`.
3. **Follow-up date at any stage on the add-lead form**, required only at De reluat,
   because the Leaduri list sorts on it. The shared validator now keeps a typed date at
   any stage. A missing date still keeps the stored one.
4. **The contact person is saved as the primary contact**, being the only one on a new
   client. **The lead's type is company**, the column default, since the handover form
   has no type field.
5. **`StageMark` became its own component**, reused by the detail, the list and the
   chips, with the detail screen's test ids unchanged.

## Defects found, cross-referenced to docs/LEARNINGS.md

- "An assertion that counts a function by name breaks the day a later migration overloads it"
- "A history row "from no stage" cannot come from a trigger when an existing case pins zero rows on create"
- "PostgREST answers 206, not 200, to a count=exact read whose range is partial"

## Noticed and not touched

- P3-43's `evidence` on `main` still opens "RED ARM ONLY, NOT THE SHIP HEAD" although
  #278 merged green. Board hygiene on another card.
- On this machine `gh run watch` cannot outlast the tool's ten minute limit, and the
  End to end step alone took 29 minutes on the red arm. The watch has to be repeated in
  the foreground.

## Left for the owner

- Nothing to decide for this card. When #279 merges, the live database gains the
  three empty lead fields and the list queries, and `GET /api/health` should show the
  merge commit and `ledger_version` `"0040"`.
- The CRM sidebar entry and landing screen are card P3-46, still to do.
