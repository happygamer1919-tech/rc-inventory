# EXECUTOR report: P3-48, a lead's Interes, Sursă and Responsabil shown and editable

**Role:** EXECUTOR. **Date:** 2026-09-14 UTC. **Branch:** `card/p3-48`, cut from `origin/main` at `d1f7074`. **Pull request:** #289.

## Boot status, phase 2 board

- Cards by status: 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted.
- Launch gate: 6/9 (conditions 4, 7 and 9 at `fail`).
- Next eligible card: AUT-3. This run was dispatched to P3-48 on the phase 3 board (RULE-05 defect: section 1 names only phase 2). P3-48 was eligible there: todo, not blocked, no dependencies. Next eligible on phase 3 by the comparator: CI-04.

## Cards touched

| Card | Status at end |
|---|---|
| P3-48 | shipped (merge held for owner approval at the time of writing) |

## Premises re-read against `d1f7074`

- `getClient` selected neither `source`, `interest` nor `owner_id`.
- `listClients` reads `search_clients_by_stage` (migration 0040), whose result has no `interest` column. Changing that function would be a migration, which the card rules out.
- The Date de identificare card had no Interes, Sursă or Responsabil row.
- The Leaduri view columns were Denumire, Etapă, Data de reluare, Telefon, Stare.
- `ClientForm` had none of the three fields; `updateClientRecord` never called `validateLeaduri`.
- `profiles_select` (0001) shows every profile to the owner and only their own to anyone else.

## What changed

- `lib/data/clients.ts`
  - `getClient` selects `source, interest, owner_id` under `hasClientLeaduri`, and resolves the Responsabil name from that one profile (full name, else email). It reads the one profile, not the choices list, because the list holds only active profiles and a deactivated person still owns their leads.
  - `listClients` reads `id, interest` for the page rows with a plain `select ... in (ids)`, only in the Leaduri view. No migration.
  - The naming rule is one helper, `ownerDisplayName`, used by `listClientOwnerChoices` and `getClient`.
- `lib/data/clients-types.ts`: `ClientRow.interest`; `ClientDetail.leaduriAvailable, source, interest, ownerId, ownerName`.
- `components/clients/ClientDetailScreen.tsx`: rows Interes, Sursă (via `CLIENT_SOURCE_LABEL`), Responsabil, shown when `leaduriAvailable`. Responsabil is the name, the dash when unassigned, and "Alt membru al echipei" when an owner is set but the viewer cannot read that profile (an account manager looking at someone else's lead). Never the uuid.
- `components/clients/ClientsScreen.tsx`: Interes column right after Denumire, Leaduri view only, one line cut with `truncate`, full text in `title`. The Clienți view and the list with no view keep their columns.
- `components/clients/ClientForm.tsx`: Sursă (from `CLIENT_SOURCES`), Responsabil (from `listClientOwnerChoices`, Nealocat first) and Interes, shown only when the page passes `owners`, which it does only for the owner and only when `hasClientLeaduri` is true. The form sends only the fields whose value changed, so an unrelated edit does not rewrite them. A current Responsabil whose profile is no longer active keeps an option of their own.
- `lib/data/client-actions.ts`: `updateClientRecord` runs `validateLeaduri` before any write and writes the 0040 columns only when they exist, as `createClientRecord` does. Owner-only, unchanged.
- `app/(app)/clienti/[id]/page.tsx`: passes `listClientOwnerChoices()` for the owner.
- `tests/e2e/leaduri.spec.ts`: new describe block `Leaduri (P3-48)`, one case. The eight P3-45 cases are unmodified.

No migration (`git diff --name-only origin/main -- supabase/migrations` prints nothing). No new dependency. Side effect worth naming: `/comenzi` also calls `getClient` for its client filter, and now makes one extra profile read when that client has a Responsabil.

## Acceptance, clause by clause

| clause | how it is met |
|---|---|
| new case, fails first | red on quality run 34883757339, below |
| (1) create through Lead nou with the three set, Responsabil from the form's list | case step 1; the option label is asserted against the stored profile before it is chosen, and the stored row is read back |
| (2) three rows labelled exactly, Sursă as label, Responsabil as name, no token, no uuid | XPath on the row whose first span is exactly the label; `toHaveText` is exact and case-sensitive (`vizita` vs `Vizită`); the card text is asserted not to contain the owner id |
| (3) Interes column in the Leaduri list | headers asserted to start `Denumire, Interes`; cell text and `title` read. The list with no view is asserted to keep `Denumire, Tip, Telefon, Proiecte active, Stare` |
| (4) change all three through Modifică, reload, read on page and list | case step 4, plus the stored row; then an unrelated Note edit leaves the three stored values unchanged |
| (5) Interes empty, Responsabil Nealocat, dash on the page, null stored | case step 5; Sursă, untouched, stays |
| `npx tsc --noEmit` exits 0 | locally, and in `quality` |
| no migration, stated in the PR | PR body |

## Red first

Run 34883671991 on `d07c10b` failed at "Refuse a code pull request whose board edit is missing" because the card was still `in_flight` beside the spec. It proved nothing about the case. The board was moved to `shipped` naming #289 in `f945f6a`, as P3-47 did.

Quality run **34883757339** on `f945f6a`, the spec and the board only, with no application change, concluded failure at End to end: **1 failed, 224 passed**. The failure was the new case, at its first detail-page read:

```
Error: expect(locator).toHaveText(expected) failed
Locator: getByTestId('client-detail').locator('xpath=./div[span[1][normalize-space(.)="Interes"]]/span[2]')
Error: element(s) not found
```

All eight P3-45 cases passed in that run.

## Green after

The quality run on the implementation head is recorded in PR #289 and in the owner question for its merge, not on the board, because writing its id into the board would move the head.

## Local commands

From the worktree, each exit 0: `npx tsc --noEmit`, `npm run build`, the board validator on all three boards, `check:card-ids`, `check:board-edit`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`, `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`, `check:board-clock`. The Playwright suite and the applier proofs run only in CI (no Docker, no Supabase CLI on this machine).

## LEARNINGS

`docs/LEARNINGS.md` untouched. The one thing that broke, the first run refused by `check:board-edit` with the card at `in_flight`, is already recorded there as "A card cannot be pushed as in_flight beside its own code". It was a repeat, not a new defect, and the factory's known failures list now carries its signature so the operator's next task sees it before pushing.

## Merge

Not self-merged. Real client data is in production; the owner approves and POC merges.
