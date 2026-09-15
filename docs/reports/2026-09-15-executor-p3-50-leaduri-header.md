# Executor report: P3-50, the Leaduri view's own subtitle, top bar title and primary button

- **Role:** EXECUTOR (factory lane B, BLUE worker), run date 2026-09-15 UTC.
- **Card:** P3-50, ends this run `todo` on the board by instruction: this lane builds and
  pushes the branch, never opens a pull request and never edits the board.
- **Branch:** `card/p3-50`, cut from origin/main `2ac5905`, level with origin/main at push
  time. Pushed. No pull request.
- **NOT READY FOR A PULL REQUEST YET.** The card's acceptance contradicts itself (below).
  The question is with POC in the factory mailbox, with a recommended default.

## Update, second run (the pull request run), 2026-09-15 UTC

- **Answered:** PURPLE chose **Option A** (factory answer
  `q027-p3-50-topbar-title-contradicts-crm-landing.md`). Applied in commit `5c4cb11`: the one
  `/clienti?vedere=leaduri` row of `tests/e2e/crm-landing.spec.ts` case "P3-46 (4)" now
  expects Leaduri. Nothing else in that file changed; `headers.spec.ts` is unmodified.
- **Synced:** `git merge origin/main` at `8cbd3ce` (after P3-51, #302), clean, no conflicts.
- **Pull request:** #303, opened after a fresh local gate set on the merged tree: typecheck,
  build, validator and the eleven `check:*` scripts, all exit 0. The board flip to `shipped`
  with evidence naming #303 is its own commit, followed by `check:board-edit` and
  `check:board-clock`.
- **Not self-merged.** Real client data is in production; the owner approves the merge.
- Everything below this section is the first run's report, kept as written.

## Plain words

On the leads list, the description under the title, the title at the top of the window and
the orange button all belonged to the customer list. Now the leads list describes leads,
the top of the window says Leaduri, and its only button adds a lead. The customer list is
unchanged. No database change.

## The contradiction, and why the branch stops here

The card's acceptance asks for two things that cannot both hold:

1. clause (1): on `/clienti?vedere=leaduri` the top bar title reads exactly **Leaduri**;
2. `tests/e2e/crm-landing.spec.ts` passes **unmodified**
   (`git diff --exit-code origin/main -- tests/e2e/crm-landing.spec.ts` exits 0).

`tests/e2e/crm-landing.spec.ts` case "P3-46 (4)" (lines 351 to 360) loops over top bar
titles and one row is `["/clienti?vedere=leaduri", "Clienți"]`. With the top bar change,
that row fails; without it, the new P3-50 case fails. The card's `defaults` describe that
spec as guarding `labelForPath` and the route list only; it also pins this exact title.

P3-46's own acceptance clause 4 speaks only of `/clienti` and `/proiecte` ("on /clienti
and /proiecte the title in the top bar reads what it read before this card"). Both still
read Clienți and Proiecte after this branch. The `?vedere=leaduri` row went further than
that clause, and it is the exact behaviour the live-app review (finding F5) reports as a
defect.

Editing that spec is forbidden by this task's brief, so it was not edited. The branch is
built so either answer finishes quickly:

- **Option A, recommended:** change that one row of `crm-landing.spec.ts` to
  `["/clienti?vedere=leaduri", "Leaduri"]` in the pull request, and read the card's
  "unmodified" clause for that file as "changed in that one row only". A test that pins a
  reported defect is fixed by fixing the defect.
- **Option B:** leave the top bar alone. `git revert cd163f1` and drop the top bar lines
  from the new case (clause 1, and the top bar check in clause 4). The review's breadcrumb
  finding stays open.

## What changed

Three commits, in this order:

- `6b31eb0` **the red arm**, `tests/e2e/leaduri.spec.ts` alone: a new describe block
  "Leaduri (P3-50)" with one case. Signed in as the owner:
  - reads the background of the primary button Proiect nou on `/proiecte` at run time
    (mouse moved away, transitions finished), not a fixed colour;
  - on `/clienti?vedere=leaduri`: (1) top bar title exactly Leaduri; (2) subtitle visible,
    not empty, not containing the Clients sentence; (3) `leaduri-new` inside the page
    header reads Lead nou and has that background, and it is the only header button that
    does;
  - on `/clienti?vedere=clienti` and `/clienti`: (4) top bar Clienți, subtitle exactly
    "Beneficiarii, cu datele lor de contact și proiectele lor.", `client-new` reads Client
    nou with that background, and it is the only header button that does.
  The top bar locator is the same one crm-landing.spec uses, written here, not imported.
  Against the tree before this card, clause (1) fails (the bar reads Clienți).
- `252755c` `components/clients/ClientsScreen.tsx`: on the Leaduri view the PageHeader
  lead paragraph is "Persoanele și firmele care nu sunt încă clienți, cu etapa lor și data
  la care trebuie sunate." (the card's proposed wording, kept) and the header holds only
  Lead nou, as the default primary Button, same `data-testid="leaduri-new"`. Client nou is
  not offered on that view. The Clienți view and `/clienti` with no view are byte for byte
  the same header as before (Lead nou secondary when the schema is there, Client nou
  primary). Only this one `lead=` prop value changed; nothing was renamed or swept.
- `cd163f1` `components/layout/Topbar.tsx`: reads `useSearchParams()`; a small
  `titleFor(pathname, vedere)` returns Leaduri when the path is exactly `/clienti` and
  `vedere` is `leaduri`, and calls `labelForPath(pathname)` for everything else.
  `lib/nav.ts` is untouched, so `labelForPath` returns the same for every path. **No
  Suspense boundary was needed**: every screen under the app layout is dynamic (the layout
  reads the session), and `npm run build` exits 0 with the two static pages
  (`/autentificare`, `/cont-fara-acces`) outside that layout.
- `docs/LEARNINGS.md`: one entry, "A card that keeps a spec unmodified while changing what
  that spec pins".
- No migration was added. No new dependency.

Out of scope and unchanged, as the card says: `app/(app)/clienti/page.tsx` (SchemaPending
subtitle) and the Clienți description in `lib/nav.ts`.

Lane B file list respected: none of the files `card/p3-51` touches was edited, and none of
Orange's extraction or documents paths.

## Commands run and results

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0, no Suspense warning |
| board validator, all three boards | PASS, 0 violations, before every commit |
| `npm run check:card-ids` | exit 0 |
| `npm run check:board-edit` | **exit 1, expected in this lane**: P3-50 is `todo` at base and head because this task forbids the board edit. The pull request task flips the card. Same as P3-54, P3-53 and P3-52. |
| `npm run check:unique-ids` | exit 0 |
| `npm run check:open-branch-ids` | exit 0 (other open branch: Orange's #300) |
| `npm run check:no-destructive-migration` | exit 0, 0 files |
| `npm run check:conflict-residue` | exit 0 |
| `npm run check:categories` | exit 0 |
| `npm run check:ledger-rows` | exit 0 |
| `npm run check:no-prod-target` | exit 0 |
| `npm run check:pending-schema-reads` | exit 0 |
| `npm run check:removal-safety` | exit 0 |
| `npm run check:assertion-register` | exit 0 |
| `git diff --exit-code origin/main -- tests/e2e/crm-landing.spec.ts tests/e2e/headers.spec.ts lib/nav.ts docs/board` | exit 0 |
| `git merge origin/main` | already up to date |

## What did not run here, and is left for CI

`npx playwright test tests/e2e/leaduri.spec.ts tests/e2e/crm-landing.spec.ts
tests/e2e/headers.spec.ts` did **not** run. It needs the local Supabase stack and the test
accounts; this machine has no Docker and no Supabase CLI, and the factory forbids any
database access from here. The pull request's `quality` run is the first real run.

**What CI will show on this branch as it stands:** the new P3-50 case should pass, and
`crm-landing.spec.ts` case "P3-46 (4)" will fail on its `/clienti?vedere=leaduri` row. That
is the contradiction above, not a regression; it goes away under either option. If a red
run of the new case against the old tree is wanted, the spec alone is commit `6b31eb0`.

Other specs that open the Leaduri view or click the header buttons were read, not run:
`list-filters-layout.spec.ts` (filters row only), `button-contrast.spec.ts` (`client-new`
on `/clienti`, unchanged) and the specs that click `client-new` on `/clienti`. None clicks
Client nou on the Leaduri view.

## Defects found

One, in the card itself, entered in `docs/LEARNINGS.md`: its acceptance keeps
`crm-landing.spec.ts` unmodified while changing the title that spec pins.

## State at the end

- Branch `card/p3-50` pushed. Head sha in the factory mailbox question
  `q027-p3-50-topbar-title-contradicts-crm-landing.md`, which starts `POC:`.
- For the task that opens the pull request, once POC answers: apply Option A or B, flip
  P3-50 on `docs/board/rc-board-phase3.json` in that pull request (`last_checkpoint` from
  `date -u`, then `check:board-edit` and `check:board-clock`), log in the card notes which
  option was applied and on whose answer, sync with main, and state in the body that no
  migration was added.
