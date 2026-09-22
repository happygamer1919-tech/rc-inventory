# Executor report: G45, notes on the lead and client, "Ce s-a discutat" (card P3-90)

Role: AUTHOR (the card), then EXECUTOR (the build), in one pull request, branch `card/p3-90`.
Run date: 2026-09-22 (UTC). Machine: the platform owner's, no Docker, no Supabase CLI, no
production access.

## In plain words

On every lead and client page, the Note tab (empty until now) has a box "Ce s-a discutat" and a
Salvează button. A saved note appears at the top of a list below, with who wrote it and when.
Stage changes (for example from Lead rece to Ofertat) appear in the same list in a lighter grey,
so the whole story of a lead reads top to bottom. The same save can also set the next step
(G44). Only the owner account can write a note, the same as who can edit a client today; the
account manager sees the list but no box. Nobody can edit or delete a note.

This pull request carries a migration. Merging it creates one new, empty table in the live
database. No existing row, column or rule is changed.

## Boot status (CLAUDE.md section 1)

- Phase 2 board: 68 shipped, 2 blocked, 32 todo. Launch gates 0/0.
- Phase 3 board: 106 shipped, 32 todo before this card. Launch gates 0/0.
- Next eligible by board order: P3-14 (phase 3). This run works the dispatched goal G45.

## Card

`npm run id:free -- P3-90` answered FREE, lane highest P3-89, zero open pull requests. P3-90 on
`docs/board/rc-board-phase3.json` with `plain`, `defaults` (a) to (i), `depends_on: []` and a
machine-checkable acceptance naming `tests/e2e/client-notes.spec.ts` and the 0059 assertion file.
Authored `in_flight`, flipped to `shipped` in the last commit of this pull request.

## What changed, by file

| File | Change |
|---|---|
| `supabase/migrations/0059_client_notes.sql` | NEW. Table `public.client_notes`, index `client_notes_client_created_idx`, check `client_notes_body_not_empty`, RLS, two policies. Create only. |
| `scripts/poc-free/local-db/assertions/0059_client_notes.sql` | NEW. Shape, grants, and who reads and writes, as three accounts. |
| `docs/migrations/APPLY-LOG.md` | Pending register line for 0059. |
| `lib/data/schema-capability.ts` | `hasClientNotes`, probing `client_notes` with `select id limit 1` (the `hasDocuments` idiom, since this is a whole table). |
| `lib/data/client-notes.ts` | NEW. `getClientTimeline(clientId)`: notes plus `client_stage_history`, merged newest first, authors in one batched `profiles` select. |
| `lib/data/clients.ts` | `ownerDisplayName` exported, unchanged otherwise. |
| `lib/data/clients-types.ts` | `ClientTimelineEntry` (kind `note` or `stage`). |
| `lib/data/format.ts` | `formatDateTime`, Chisinau date and time, `22.09.2026, 14:05`. |
| `lib/data/client-actions.ts` | `addClientNote`; `validateNextAction` now typed on the two fields it reads (behaviour unchanged). |
| `components/clients/ClientNotesPanel.tsx` | NEW. The Note tab's body. |
| `components/clients/ClientTabs.tsx` | Only the `active === "note"` block changed; three new props passed through. |
| `components/clients/ClientDetailScreen.tsx`, `app/(app)/clienti/[id]/page.tsx` | Read the timeline and pass it down. |
| `tests/e2e/client-notes.spec.ts` | NEW. Five G45 cases and a 390 px case. |

## Decisions, each with its reason

1. **Read rule: copied from `clients_select` AS IT IS TODAY**, `public.current_app_role() is not
   null` (migration 0055), not the `using (true)` the brief quoted from 0013. 0055 replaced that
   policy so a deactivated account reads no client; copying the old text would have let such an
   account read every note. This is the literal meaning of "RLS like the clients table" today.
2. **Write rule: owner only**, `public.is_owner()`, exactly `clients_insert`. So only the owner
   account adds a note, the same person who can edit a client at all today. This is a literal
   reading of the goal's words, not my own guess. I also require `created_by = auth.uid()` (with
   `created_by default auth.uid()`, the way 0044 fills `documents.uploaded_by`), so the author name
   shown beside a note is always who wrote it. The application never sends an author.
3. **No update policy and no update grant**, and no delete policy or grant. A note is written once;
   history that can be edited is not history, the reason 0001 gives for `status_history`. The goal
   asked for no delete policy; no update follows the same logic and the brief's default.
4. **Empty note refused twice.** In the action (`Scrie ce s-a discutat.`, trimmed first) and by a
   check on the column, `btrim(body) <> ''`, the shape 0046 uses for `sheet_options.model`,
   loosened so a note keeps its own inner spaces and line breaks.
5. **Reader in a new file**, `lib/data/client-notes.ts`, following the file-per-concern convention
   (`client-detail.ts`, `client-actions.ts`). `lib/data/clients.ts` is already the list and
   detail reader and is long.
6. **"Sistem" and "Alt membru al echipei".** A stage change with `changed_by` null reads "Sistem";
   nothing in the app had a precedent for a missing actor. An author whose profile the viewer
   cannot read reads "Alt membru al echipei", the words `ClientDetailScreen` already uses for an
   unreadable responsible person. This matters because the brief's premise that `profiles_select`
   shows every row is false: 0001 has `using (id = auth.uid() or public.is_owner())`, so the
   account manager reads only its own profile.
7. **Date with time.** `formatDate` has no time variant, and several notes on the same day are
   normal, so I added `formatDateTime` (Chisinau time). It assembles digit parts itself rather than
   using the whole ICU string, so the server render and the browser render cannot differ.
8. **One save, two requests, next step first.** Everything is validated before the first write.
   The next step is written first, then the note. If the note fails after the step, a second click
   rewrites the same step and leaves no trace; the other order could save the note twice. A single
   RPC transaction was not needed for that. The next step reuses G44's `validateNextAction`, no
   second copy of the rules.
9. **At De reluat the note form offers only the step text**, because there the step date is the
   follow-up date box (G44's rule, "setting one sets both"). Empty step fields mean "leave the step
   as it is".
10. **Before 0059 applies** the tab shows exactly today's empty state (same title and hint).

## Existing tests that touch the Note tab

`git grep -n "ClientTabs\|active === \"note\"\|client_notes\|client_stage_history" tests/e2e components`
and a wider grep for `tab-note`, `panel-note` and `Nicio notă`:

- `tests/e2e/client-detail.spec.ts` clicks every tab by `tab-<id>` and waits for `panel-<id>`
  (lines 57 to 74): tab list, order, count and test ids are unchanged, so it holds.
- The same file expects `panel-note` to contain "Nicio notă" for a new empty client (line 96). Its
  client is created from the client form at the default stage Lead rece, which writes no history
  row, so the new panel shows its empty state, whose title is still "Nicio notă". **No existing
  assertion was changed.**
- Nothing else in `tests/e2e` or `components` referenced the Note tab, `client_notes` or
  `client_stage_history`.

## Commands run locally, and results

Each exit 0 unless stated:

- `node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json` before every commit: PASS, 0 violations on all three.
- `npx tsc --noEmit`: exit 0.
- `npm run build`: exit 0.
- `npm run check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
  `check:no-destructive-migration` (1 file, 17 statements parsed, no DROP TABLE, TRUNCATE or
  DELETE), `check:conflict-residue`, `check:categories`, `check:ledger-rows`,
  `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`,
  `check:assertion-register`: all OK.
- `npm run check:board-edit`: refused while the card was `in_flight` (correct), passes once the
  card is `shipped` in the last commit.
- `npx playwright test tests/e2e/client-notes.spec.ts --list`: 6 tests listed.
- Lint: this repo has no `lint` script (`npm run lint` answers "Missing script"), so none ran.

## Left for CI, and why

This machine has no Docker and no Supabase CLI, and the throwaway local postgres run I tried
needed a permission this headless session does not have. So these run only in `quality`:

- `npm run check:migrations`: applies 0059 unmodified to a bare postgres and runs
  `assertions/0059_client_notes.sql`.
- The destructive-migration step and both applier proof steps (they must show RAN and passed).
- The whole end to end suite, including the six new cases and every existing spec.
- The 390 px check: the brief allowed one screenshot; I could not run the app without a database,
  so the spec's sixth case asserts the same thing (form fields stacked, every box inside 390 px,
  list below the button) in CI instead.

## Known risk

`created_at` for a note is `now()` and for a stage change `clock_timestamp()`. Both are real
moments of separate requests, so the order is the order things happened; two events in the same
millisecond keep each source's own order.

## Learnings

Two entries appended to `docs/LEARNINGS.md`: "RLS like the clients table" means the policies after
0055; and `profiles_select` is self-or-owner, so author names need a fallback.

## Merge

Not merged by this session. Real client data is in production and this pull request carries a
migration, so the owner approves the merge.
