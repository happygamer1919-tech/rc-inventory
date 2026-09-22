# EXECUTOR report: P3-91, the Azi screen (goal G46)

Role EXECUTOR. Branch `card/p3-91`. Run date 2026-09-22 (UTC).

## In plain words

There is a new screen, **Azi**, at the top of the Relații group in the menu. It lists every
active lead and client who should be called today or is already late, the late ones first and
in red. Each row has the name, the phone (tap it on a phone to call), the next step, and a
button **Am sunat**. Am sunat opens the same note box as the Note tab, already filled with "Am
sunat"; Salvează logs the note and takes the person off the list. When nobody is due, the screen
says "Nimic de făcut azi." A Responsabil filter narrows the list to one person's leads.

No migration. Nothing in the live database changes shape.

## Boot

Status at boot, read from both boards on origin/main dee31e5:
- phase 2: 68 shipped, 2 blocked, 32 todo; launch gate 0/9; next eligible AUT-3.
- phase 3: 107 shipped, 32 todo; launch gate 0/9; next eligible P3-14.
The owner assigned G46 through the factory, so this card was worked instead. No card on any
board covered the Azi screen, so P3-91 was authored (`npm run id:free -- P3-91`: FREE, lane
highest P3-90, zero open pull requests).

## What changed

| File | What |
|---|---|
| `lib/nav.ts` | Azi (`/azi`, icon `bell`) added to the Relații group, before CRM. |
| `app/(app)/azi/page.tsx` | The route: phase 3 gate, session, the list, the owner choices, the `responsabil` filter. |
| `components/clients/AziScreen.tsx` | The screen: header, filter, table (cards under 768 px), empty state, Am sunat. |
| `components/clients/ClientNoteForm.tsx` | The note form, moved out of the Note tab unchanged, plus a clearing mode for Azi. |
| `components/clients/ClientNotesPanel.tsx` | Uses `ClientNoteForm`; same DOM, same test ids, same behaviour. |
| `lib/data/azi.ts` | `getAziList()`: the cross-client reader. |
| `lib/data/format.ts` | `chisinauToday()` and `chisinauDateOf()`. |
| `lib/data/clients-types.ts` | The `AziRow` type. |
| `tests/e2e/azi-screen.spec.ts` | Seven cases named G46. |
| `tests/e2e/crm-landing.spec.ts` | One menu order assertion updated for the new entry, see below. |

Untouched, as required: `addClientNote`, `validateNextAction`, `client_stage_history`,
`search_clients_next_action`, `search_clients_by_stage`, every rule on `follow_up_date`, the
`lead=` prop.

## Decisions, and why

**Nav placement.** The Relații group had exactly one entry, CRM. Azi is added as a second entry,
before CRM, so it reads first, which is the literal instruction once the group has more than one
member. It sits in `NAV` directly and NOT in `CRM_SCREENS`: it has its own menu entry and is not
reached through the CRM landing page, and `NAV` already feeds both readers, `labelForPath` (top
bar title "Azi") and `ALL_ROUTES` (the route walk in `headers.spec.ts`, case 4).

**One existing spec assertion changed.** `crm-landing.spec.ts` case P3-46 (1) asserted that the
entry right before CRM is "Adăugare manuală". With Azi first in the group that is no longer true
by the owner's own instruction. The assertion now requires exactly "Azi" right before CRM and
"Adăugare manuală" right before Azi, and still "Inventar" right after CRM: equally strict, one
more item. No other spec reads sidebar order (`phone-shell.spec.ts` reads labels but asserts only
that none is empty).

**The Chisinau date helper.** `chisinauToday()` returns the calendar day in Europe/Chisinau as
`YYYY-MM-DD`. The two dates compared (the follow-up date and the next step date) are `date`
columns with no time of day, so a string comparison is exactly the database's own
`(now() at time zone 'Europe/Chisinau')::date` comparison. The comment on the function says why it
must never become a `Date` comparison (midnight UTC is 03:00 in Chisinau, the instant-versus-day
trap 0040 warns about). It uses `formatToParts`, like `formatDateTime`, so ICU separators cannot
change the result.

**Which date qualifies a row.**
- The next step date, when set: due when it is today or earlier.
- When no next step date is set: the De reluat date, only at stage De reluat, due when today or
  earlier. This is the same stage-only rule 0057 gave `overdue`: a date left on a lead that has
  moved on is no longer a promise. The brief's reading ("`overdue` OR next step due") would also
  list a De reluat lead whose owner explicitly moved the next step later; the next step governs
  instead, because it is the newer promise and G44 made it the general rule.

**The De reluat edge case, a real gap, resolved without a write.** `addClientNote` writes only
the next step columns, never `follow_up_date` (its own header says so). Clearing the next step on
a De reluat lead leaves `next_action_at` null, so the list falls back to the follow-up date and
the lead would stay on Azi after Am sunat. The brief's suggested fix (set `next_action_at` to the
follow-up date and clear it in the same save) cannot be expressed: one call writes one value per
column, and the end state is null either way, the same state that triggers the fallback.
What was done instead: for rows brought in ONLY by the De reluat date, `getAziList` reads
`client_notes` for those ids and drops a row when a note exists on or after its due date, as a
Chisinau day. So Am sunat removes it, the follow-up date is untouched (the G46 case (5) asserts
the stored date is unchanged), and the lead comes back only when somebody sets a new date. This
is a read, through RLS the account already has (`client_notes_select`), no new write path.

**Am sunat.** Only the owner sees the button: `client_notes_insert` is `is_owner()` and a button
the database refuses is the defect (P3-06). It opens the form INLINE, in a row under the lead,
not in a modal: the operator keeps seeing who they called while typing, and on a phone the row is
already a card, so the form stays in the same card. The body starts as "Am sunat" and can be
edited. The save calls `addClientNote(id, body, { at: "", text: "" })` when the next step columns
exist, which `validateNextAction` turns into null in both columns. The note's date is its
`created_at`, written by the database. A line under the box says "La salvare, următorul pas se
șterge."

**The note form, extracted.** It was written inline in `ClientNotesPanel.tsx`. It moved to
`ClientNoteForm.tsx` with the same elements, classes, test ids and texts; the Note tab passes the
same class string and `router.refresh()` on save. The new props (`initialBody`,
`clearNextAction`, `onCancel`) default to the Note tab's behaviour, so the tab renders the same
DOM as before. The existing `client-notes.spec.ts` is unchanged and must pass in CI as the proof.

**The Responsabil filter** lives in the address (`/azi?responsabil=<id>`), like every list filter
here, and is applied on the server to the already-read rows. The list function has no owner
parameter; adding one would be a migration, and the due list is small (it is a subset of the
active clients). An id not in the owner list filters nothing. The owner column is read with one
`select id, owner_id` per 100 due ids. The filter shows only when there is more than one person
to choose (an account manager can read only their own profile, so for them it is hidden).

**Directory.** `components/clients/`, beside `ClientsScreen.tsx`, because Azi is a view of the
clients table. The reader is its own file, `lib/data/azi.ts`, per the one-file-per-concern
convention `client-notes.ts` names.

## No migration, and why a full read is safe

`getAziList` reads every ACTIVE client through `search_clients_next_action` (or
`search_clients_by_stage` when the next step columns are absent), with `p_view` and `p_stage` null,
through `readAllPages` at 500 rows per page, which fails visibly if the pages do not add up to the
total. CONTEXT.md gives about 380 real leads in production, so this is ONE page today, and two
at 1,000. The page count could not be observed locally: this machine has no database. Then two
small reads on the due rows only: the owners, and the notes for rows due by the De reluat date.

## Checks run locally, from the worktree

Each exit 0 unless stated:
- `npx tsc --noEmit`
- `npm run build` (the `/azi` route is listed, dynamic)
- board validator, before every commit
- `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
  `check:no-destructive-migration` (0 files), `check:conflict-residue`, `check:categories`,
  `check:ledger-rows`, `check:no-prod-target`, `check:removal-safety`, `check:assertion-register`
- `check:pending-schema-reads`: refused once on a comment naming `next_action_at` in
  `lib/data/format.ts`; the comment now says it in words; exit 0 after.
- `check:board-edit`: refused while the card was `in_flight`, as designed; passes once the card is
  flipped in the last commit.
- `check:board-clock`: run after the final board stamp.
- Lint: the repository has no lint script and no ESLint config, so there is nothing to run.

## Left for CI (no Docker, no database here)

- `tests/e2e/azi-screen.spec.ts`, seven cases named G46: (1) due-today lead appears with name,
  next step, date and `tel:` link, and Azi is right before CRM in the menu; (2) overdue above
  due-today with the Întârziat chip; (3) due tomorrow, by next step or by De reluat date, absent;
  (4) Am sunat with the prefilled text removes the row after reload, stores the note "Am sunat"
  with the owner as author, and both next step columns are null; (5) a De reluat lead due today
  with no next step appears as "De reluat", Am sunat with edited text removes it, and its
  follow-up date is unchanged; (6) the Responsabil filter keeps one owner's row and hides the
  other's, both ways, and "Toți responsabilii" shows both again; (7) at 390 px no sideways scroll,
  Am sunat is at least 44 px tall, with a screenshot `azi-390.png` in the run's artifacts.
- Every existing spec, `crm-landing.spec.ts` with its updated order assertion,
  `client-notes.spec.ts` unchanged as the proof of the form extraction, and `headers.spec.ts`
  case 4, which now also walks `/azi` for console errors.
- The empty state "Nimic de făcut azi." is not asserted end to end: the shared test database
  always holds due TEST leads from other specs, so an empty list cannot be produced reliably. The
  exact text is in `AziScreen.tsx`.

## What `git grep` shows the change could affect

`git grep -n "search_clients_next_action\|search_clients_by_stage\|CRM_SCREENS" tests/e2e lib/nav.ts`
finds only `lib/nav.ts` itself: no spec calls the list functions directly, so reusing them
changes nothing for any spec. The nav change reaches `headers.spec.ts` (route walk, now with
`/azi`), `crm-landing.spec.ts` (menu order, updated as above; its `ALL_ROUTES` uniqueness check
still holds) and `phone-shell.spec.ts` (labels non-empty, unaffected).

## Learnings

Two entries appended to `docs/LEARNINGS.md`: the cleared-step fallback on De reluat leads, and
`check:pending-schema-reads` reading comments.

## Merge

No self-merge: real client data is in production. When `quality` is green on the head sha and
`checks:state` exits 0, an `OWNER:` merge-approval question goes to the factory mailbox.
