# 2026-09-16 executor: G24, a deactivated lead or client comes back from its own page (P3-66)

Role: AUTHOR (card), then EXECUTOR (code), one pull request, branch `card/p3-66`.

## In plain words

Max, 2026-09-16: "if a lead is deactivated there is no option to add it back". The
option existed, but only behind the Inactivi filter, then Modifică, then a checkbox at
the bottom of the form. Now:

- A lead's or client's own page has a button in the "Date de identificare" box:
  **Reactivează** when it is switched off (right next to the word "Dezactivat"), and
  **Dezactivează** when it is on. Pressing it shows a short green confirmation line.
- When the Leaduri, Clienți or Toți list comes up empty on the default "Activi" filter,
  it now says that switched-off records are hidden there, with a button **Arată
  inactivii** that flips the filter to Inactivi.

Nothing is deleted and there is no database change.

## Boot

- Phase 2 board: 68 shipped, 32 todo, 2 blocked; launch gate 0/9. Lowest eligible: AUT-3.
- Phase 3 board: 80 shipped, 32 todo, 1 blocked; launch gate 0/9. Lowest eligible: P3-14.
- This run works the owner-assigned goal G24. No open pull request of ours.

## Card

- `npm run id:free -- P3-66`: FREE, lane highest P3-64. Its hint named P3-65 as next, but
  `git worktree list` showed `card/p3-65` checked out in Lane B's worktree
  (`lb8-g23-phone-forms`), unpushed. P3-66 taken. Recorded in `docs/LEARNINGS.md`.
- P3-66 authored on `docs/board/rc-board-phase3.json` with `plain`, `defaults` (the task's
  fix quoted, plus five authoring decisions), `depends_on: []` and a named acceptance spec.
- Commit order: authored `todo`, then `in_flight`, then built, then `shipped`.

## Decisions (card defaults a to e)

- (a) **The app has no toast.** No toast component or library exists; saves confirm by
  closing the form and refreshing. The confirmation is a `role="status"` line
  (`client-active-notice`) directly under the card header, kept until the next press.
- (b) **Write path is `updateClientRecord`**, as the task says, fed from the record's own
  fields with only `active` flipped. Stage, follow-up date, source, interest and owner are
  not sent, which the action reads as "do not touch": no stage move, no history row. The
  product panel's dedicated `setProductActive` was not copied, to avoid a second write path
  into `public.clients`.
- (c) Reactivează is the primary button, Dezactivează the secondary one. No confirmation
  dialog: nothing is deleted and the same button undoes it.
- (d) Shown only when `canWrite` (the owner), like Modifică.
- (e) The empty-state sentence and button show on every view whenever the status filter is
  Activi, search included. On Inactivi and Toate the empty state is unchanged.

## What changed

- `components/clients/ClientDetailScreen.tsx`: `CardHeader`'s existing `right` slot holds
  `client-active-toggle`; success shows `client-active-notice`, failure shows
  `client-active-error` with the action's Romanian message; `router.refresh()` after success.
- `components/clients/ClientsScreen.tsx`: on `query.status === "active"` the empty state's
  hint gains "Leadurile dezactivate nu apar aici, ci la filtrul Inactivi." (Leaduri view) or
  "Clienții dezactivați nu apar aici, ci la filtrul Inactivi." (other views), and the action
  `clients-show-inactive` ("Arată inactivii") pushes `stare=inactive`, keeping search and view.
- `tests/e2e/reactivate-lead.spec.ts`, new, three tests covering the card's four clauses:
  1. lead deactivated through the Modifică checkbox is gone from Leaduri on Activi; the empty
     state sentence and button show; the button sets `stare=inactive` and the row appears;
     on its page Reactivează sits in the same header as "Dezactivat"; pressing it shows the
     notice, the stored row (PostgREST, owner token) reads `active: true`, the hint is gone,
     and the row is back in Leaduri on Activi;
  2. the Clienți view offers the same button for a deactivated client, and the Inactivi
     filter does not offer it;
  3. an active record shows Dezactivează; pressing it stores `active: false` and swaps to
     Reactivează beside "Dezactivat"; pressing again stores `active: true` (round trip).
- `docs/LEARNINGS.md`: one entry, `id:free` cannot see an unpushed branch in a sibling worktree.

## Not changed

`ClientForm.tsx` and its checkbox; `lib/data/client-actions.ts`; `components/ui/primitives.tsx`;
Orange's extraction and documents paths. Nothing renamed on the word lead.
**No migration: no file under `supabase/migrations/` added or changed.**

## Local proof

- `npx tsc --noEmit` exit 0. `npm run build` exit 0.
- A throwaway Playwright probe (no database, not committed) ran the spec's header locator on
  a copy of the page markup: inactive header text "Date de identificare Dezactivat
  Reactivează", active header "Date de identificare Dezactivează", one toggle each time, and
  the notice line is outside the header in both states.
- Board validator exit 0 before every commit. `check:card-ids`, `check:unique-ids`,
  `check:open-branch-ids`, `check:no-destructive-migration`, `check:conflict-residue`,
  `check:categories`, `check:ledger-rows`, `check:no-prod-target`,
  `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`: all OK.
  `check:board-edit` refused while the card was `in_flight`, as designed, and is rerun after
  the `shipped` flip.

## Left for CI

This machine has no Docker and no Supabase CLI, so the end to end suite does not run here:
`reactivate-lead.spec.ts` and the unchanged `clients.spec.ts`, `leaduri.spec.ts` and
`client-detail.spec.ts` run only in `quality`. The run id and result are recorded in the pull
request and the owner question, not here, because writing them here would move the head sha.

## Merge

Not merged by this session. Real client data is in production, so no pull request
self-merges. The session files an `OWNER:` approval question in the factory mailbox once
`quality` is green on the head sha and `npm run checks:state` exits 0. The PR is screen-only.
