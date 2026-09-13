# EXECUTOR report: P3-46, the CRM sidebar entry and landing screen

**Role:** EXECUTOR. **Date:** 2026-09-13 (UTC). **Worked from:** the new operator's
task queue, task G4 (`005-g4-p3-46-crm-landing`), run headless on a machine with no
Docker, no Supabase CLI and no production credentials.

## In plain words

The sidebar now has one **CRM** entry where Clienți and Proiecte used to be. It opens
a page with three large coloured cards:

- **Clienți** (green) opens the client list showing only customers who became clients.
- **Leaduri** (amber) opens the same list showing everyone who is not a client yet.
- **Proiecte** (blue) opens the project list, exactly as before.

Every address people already use or have saved still opens the same screen. The
title in the top bar still reads Clienți or Proiecte on those lists, and the CRM entry
stays highlighted while someone is on them. The new page asks the database nothing,
so it adds no waiting time.

**No migration was added. Merging changes nothing in the database.**

## Card touched

| card | status at start | status on this branch | pull request |
|---|---|---|---|
| P3-46 | todo | shipped (reaches `main` with the merge) | #280 |

## Boot status report (CLAUDE.md section 1)

- Phase 2 board: 102 cards, 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted.
  Launch gate readiness 6/9. Next eligible by id: AUT-3.
- Phase 3 board (read too, RULE-05): 93 cards, 54 shipped, 39 todo. Next eligible by
  id: CI-04. P3-46 eligible: todo, not blocked, both dependencies P3-43 and P3-45
  shipped (#278 and #279 merged). It is the card the task named.
- Open pull requests at pick time: 0.
- P3-45 shipped the view parameters its defaults proposed, read from
  `parseClientQuery` in `lib/data/clients.ts`: `vedere=clienti` and `vedere=leaduri`
  (`etapa=<stage>` alone also decides the view).

## What was built

**`lib/nav.ts`**

- The Relații group's two items, `/clienti` Clienți and `/proiecte` Proiecte, are
  replaced by one item: `/crm`, labelled `CRM`. The group title stays.
- The two lists move to a new exported `CRM_SCREENS` list. `ALL_ROUTES` and
  `labelForPath` read the sidebar items and then `CRM_SCREENS`, so
  `tests/e2e/headers.spec.ts` still sweeps `/clienti` and `/proiecte` (and now `/crm`),
  and the top bar keeps their titles.
- `NavItem` gains an optional `activeFor`; the CRM item's is derived from
  `CRM_SCREENS`. The old inline path test became the exported `pathMatches`, used by
  both `labelForPath` and the sidebar, with the same behaviour.

**`components/layout/Sidebar.tsx`**: an entry is marked active on its own route and on
its `activeFor` routes, so CRM is marked on `/clienti`, `/clienti/<id>`, `/proiecte`
and `/proiecte/<id>`.

**`app/(app)/crm/page.tsx`**, new: a page header and three large cards in a
three-column grid, in order Clienți, Leaduri, Proiecte, each a link with a colour band,
a colour dot beside its label (`data-colour` green, amber, blue) and a one-line
description. It imports nothing from the data layer and makes no query; the session is
read by the signed-in layout, as for every screen.

**Tests:** `tests/e2e/crm-landing.spec.ts`, new, six cases. No existing spec modified.

**Unchanged, proved with `git diff --exit-code origin/main`, each exit 0:**

- `tests/e2e/cross-links.spec.ts`
- the six secondary surface files: `app/(app)/page.tsx`,
  `components/orders/OrdersScreen.tsx`, `components/orders/OutboundPanel.tsx`,
  `components/outbound/OutboundScreen.tsx`, `components/inventory/ProcurementScreen.tsx`,
  `components/projects/DevizComparisonPanel.tsx`
- the nine specs clause 7 names: `headers`, `dashboard`, `outbound`, `procurement`,
  `deviz-comparison`, `client-detail`, `project-detail`, `clients`, `projects`

No file under `app/(app)/clienti` or `app/(app)/proiecte` changed, and nothing in
`lib/data/` or `components/layout/Topbar.tsx` changed.

## Acceptance, clause by clause

| clause | what proves it |
|---|---|
| (1) handoff 4.8 line 1 | crm-landing.spec "P3-46 (1)": exactly one sidebar link labelled CRM, between Adăugare manuală and Inventar; no sidebar label Clienți or Proiecte and no sidebar href to /clienti or /proiecte; CRM opens /crm and is marked; exactly three cards labelled Clienți, Leaduri, Proiecte in order; in each card's title row a visible colour dot with the expected `data-colour`, a painted background, three distinct colours |
| (2) handoff 4.8 line 2, destinations | "P3-46 (2)": a fixture of one lead (În cultivare) and one client; from /crm, Clienți lands on /clienti and every row on the landed page is stored at `client`; the same filter narrowed to the fixture shows exactly the client; Leaduri lands on /clienti and no row is stored at `client`; narrowed, exactly the lead; Proiecte lands on /proiecte with no parameter and the Proiecte heading |
| (3) handoff 4.8 line 2, old URLs | "P3-46 (3)": /clienti, /clienti/<fixture id>, /proiecte, /proiecte/<seeded id>, ?fila=comparatie and ?fila=deviz each answer 200, end on the exact requested address, show their h1 heading and their screen's ready element, with CRM marked in the sidebar; bare /clienti shows "N clienți" where N is the stored count of active clients, and both fixture rows appear under a search |
| (4) top bar title | "P3-46 (4)": /crm reads CRM; /clienti, /clienti?vedere=leaduri and /proiecte read Clienți, Clienți and Proiecte |
| (5) route list | "P3-46 (5)": imports `ALL_ROUTES`; contains /crm, /clienti and /proiecte, no duplicate |
| (6) behind sign-in | "P3-46 (6)": signed out, /crm ends on /autentificare with the login form and no card; signed in, /crm shows three cards |
| (7) secondary surfaces | the `git diff --exit-code` above, exit 0; the nine specs unmodified and run in `quality` |
| PLUS tsc, no migration | `npx tsc --noEmit` exit 0 locally and in `quality`; the pull request states no migration was added |

## Commands run locally, and results

All from the worktree, each exit 0.

On the red arm head `bdf7aba`, before its push: `npx tsc --noEmit`, `npm run build`,
the board validator on the three boards (0 violations), `check:card-ids`,
`check:board-edit`, `check:unique-ids`, `check:open-branch-ids`,
`check:no-destructive-migration` (0 files), `check:conflict-residue`,
`check:categories`, `check:ledger-rows`, `check:no-prod-target`,
`check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`.

On the implementation head, before its push: the same set. `npm run build` lists the new
`ƒ /crm` route.

**Not run locally, and why:** the Playwright suite, `check:migrations` and the two
applier proofs need Docker or a local Supabase stack, which this machine does not have.
They run in `quality`.

## CI

**Red arm, run 34777407962** on the tests-only head `bdf7aba`: `quality` failure at
End to end only, 26.7 minutes. Exactly the six new cases failed, 207 passed,
`cross-links.spec.ts` among them. Every step in front of End to end passed; the two
applier proof steps were skipped, correctly, since the pull request adds no migration.

Every failure message was read, not only the count (the P3-45 lesson), and each is
the missing feature:

| case | line | message |
|---|---|---|
| (1) | :188 | sidebar read "Tablou de bord, Încarcă comandă, Adăugare manuală, Clienți, Proiecte, Inventar, ..."; CRM count 0 |
| (2) | :246 | the Clienți card could not be found to click; the fixture had already been created |
| (3) | :329 | CRM link count 0 on /clienti, after the 200, the exact address, the heading and the list had all passed |
| (4) | :359 | no top bar on /crm |
| (5) | :364 | `ALL_ROUTES` without /crm |
| (6) | :382 | three cards expected on /crm once signed in, 0 found, after the signed-out redirect had passed |

It was watched to completion before the implementation was pushed, because
`quality.yml` cancels an in-progress run on a new push.

**Implementation head:** its `quality` run id, conclusion and `npm run checks:state 280`
are recorded in the pull request, because writing them here would move the head sha
away from the run that proved them.

## Decisions taken without asking, stated rather than buried

Each is logged in the card's `notes` too.

1. **How the two readers of the nav list keep the old routes.** The two items moved to
   `CRM_SCREENS`, read by `labelForPath` and `ALL_ROUTES` after the sidebar items,
   instead of a special case in either reader. Every named screen is still declared in
   `lib/nav.ts`.
2. **The sidebar highlight.** Before the card, the Clienți or Proiecte entry was marked
   on its screens. With both gone, nothing would have been marked there, which reads as
   being nowhere. The CRM entry is marked instead, through `activeFor`, and case 3
   asserts it. `components/layout/Sidebar.tsx` is not one of the six protected files.
3. **The card colours**, which the handover does not name: Clienți green (the client
   stage colour from P3-43), Leaduri amber, Proiecte blue, from the existing rc- tokens.
4. **Cases that guard what already worked.** Clauses 3 to 6 describe behaviour that
   was already true, so a case that only asserted it could not fail first. Each also
   asserts the new part of the same clause, which is why all six failed on the red arm.

## Defects found, cross-referenced to docs/LEARNINGS.md

None. The red arm failed only on the missing feature, local gates passed first time,
and no fix attempt was needed, so `docs/LEARNINGS.md` gets no entry from this card.

## Noticed and not touched

- By the tuple sort the lowest eligible ids are AUT-3 on phase 2 and CI-04 on phase 3.
  The operator task named P3-46, as it named P3-43 and P3-45.
- A red-arm case whose first missing element is a click target waits for the whole test
  timeout (case 2 took 4.0 minutes), because `locator.click` has no timeout of its own
  here. It costs minutes on a red arm and nothing on a green one.

## Left for the owner

- Nothing to decide for this card. After #280 merges, the live site shows the CRM entry
  and the three-card page; `GET /api/health` should show the merge commit, and
  `ledger_version` stays `"0040"` because nothing touches the database.
