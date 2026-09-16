# EXECUTOR report: P3-64, the four list screens on a phone (G23 part 2)

Date: 2026-09-16. Role: AUTHOR (card), then EXECUTOR (code). Lane B (BLUE).
Branch: `card/p3-64`, cut from `origin/main` at 31fd8f8. No pull request opened (Lane B rule).

## In plain words

The stock, client, lead, project and order lists now work on a phone. Each row of a list shows as
its own card, with every detail labelled, instead of a wide table you have to scroll sideways. The
filters stack one under the other and are big enough to tap, and the two order lists sit one under
the other. On a computer nothing changes: screenshots before and after are identical.

**It needs the phone shell (card P3-60) on main first.** Until that lands the whole app frame is
still 1100 px wide on a phone, so this branch's pull request should open after P3-60 merges.

## Card

- New card **P3-64** on `docs/board/rc-board-phase3.json`, id from `npm run id:free -- P3-64`
  (answered FREE, lane highest P3-59). `plain`, `defaults` (quotes the task's fix and acceptance,
  records G23 part 2), `depends_on: []`, machine-checkable `acceptance`.
- **Why P3-64 and not P3-61:** `id:free` reads only open pull requests, so it cannot see P3-60 (a
  pushed branch with no pull request yet), and the factory's POC answer q035 reserves P3-61 onward
  for the main line's next cards (G21, and G22 in two parts). P3-61 to P3-63 are left free for them.
- Lifecycle: authored `todo`, flipped `in_flight` when work started, `shipped` in the last commit.
- Acceptance clause (1) was tightened in wording before shipping: on Comenzi filtered by the seeded
  project there is exactly one outbound issue, so that view asks for at least one of each list.

## What changed

Only the four named files changed in the application. Every new class carries `max-md:` (under
768 px), so nothing applies on a computer.

| File | Change on a phone |
|---|---|
| `components/inventory/InventoryScreen.tsx` | Table rows become cards: Denumire across the top, then SKU, Categorie, Furnizor, Stoc, Prag, Valoare in two columns, each with its header as a label. Header hidden. The five filters stack. Search and selects 44 px tall with 16 px text. Header buttons stack in a column and are 44 px; the empty-state button is 44 px. |
| `components/clients/ClientsScreen.tsx` | Both tables (Toți/Clienți: 5 columns; Leaduri: 6 columns) become cards with labels. Name links are 44 px tap targets. Interes wraps instead of being cut. View and stage chips 44 px. Filters stack, 44 px, 16 px; the long search hint ends in an ellipsis. Pagination wraps and its buttons are 44 px. |
| `components/projects/ProjectsScreen.tsx` | Rows become cards (Denumire and Client across, then Stare, Termen estimat, Buget). Both links 44 px. Filters stack, 44 px, 16 px. Pagination as on Clienți. |
| `components/orders/OrdersScreen.tsx` | Intrări and Ieșiri stack instead of two columns. Long supplier and project names wrap instead of being cut. Status chips wrap under a long reference. "Vezi toate ieșirile" is 44 px. |
| `tests/e2e/phone-lists.spec.ts` | New acceptance spec (below). |

**How:** one DOM, restyled. No second hidden list, because every existing spec counts rows by
`data-testid` and a copy would double those counts on a computer. Each cell got a `data-label`
attribute holding the column header text it already had, drawn on a phone by CSS
(`before:content-[attr(data-label)]`), so no cell's text changed.

**No wording changed.** No empty-state text was touched, so nothing collides with G24 on the main line.
`ProductForm.tsx`, G22's files, `components/ui/primitives.tsx`, `app/(app)/layout.tsx` and Orange's
paths were not touched.

**No migration was added.**

## Acceptance spec: `tests/e2e/phone-lists.spec.ts`

Signs in at 1440 px like the rest of the suite, then switches to 390x844.

1. **Inventar**: search `TEST-NEC` (the seeded products), at least 3 rows.
2. **Clienți**: six TEST clients created through PostgREST as in `leaduri.spec.ts` (three leads, three
   moved to Client), checked in the Toți (6 rows), Leaduri (3) and Clienți (3) views.
3. **Proiecte**: `stare=toate`, search `TEST Necesar` (the seeded projects).
4. **Comenzi**: unfiltered (at least 1 inbound, 2 outbound) and filtered by the seeded contract project.

On each screen: no sideways scroll on the document AND on `<main>` (the shell's `<main>` scrolls on its
own, so the document check alone is a false green; see learnings); every visible input, select, button,
link and clickable row inside `<main>` at least 44 px; every input and select at least 16 px; every
visible element between 0 and 390 px with no clipped text; no visible table header; each row is a grid
card whose CSS labels equal the column headers; a distinctive value per row is on screen (SKU, client
name, project and client names, order reference). A screenshot per screen goes to the test output.

5. **Desktop unchanged**: at 1440x900 the three tables still have a visible header, rows are table rows
   with no phone label, and the two Comenzi lists sit side by side. And
   `git diff --exit-code origin/main -- tests/e2e ':!tests/e2e/phone-lists.spec.ts'` exits 0: no
   existing spec was touched.

### What ran where

- **The signed-in cases need the local Supabase stack. This machine has no Docker and no Supabase
  CLI, so the spec itself runs only in CI**, on the pull request the later PR-opening task creates. It
  was not skipped silently; its checks were run locally as below.
- **Local harness:** a throwaway page under `app/auth/` (public in the proxy) rendered the four real
  screen components with fake rows (long names, long SKU, long interest text, inactive and out of
  stock products, overdue lead) inside the shell's `<main>` markup, with a dummy gitignored
  `.env.local`. The spec's measurement section was copied verbatim into a throwaway spec:
  - on this branch: **10 passed** (nine screen variants, the desktop case, and a negative control that
    forces the table layout back and confirms the checks throw);
  - with `origin/main`'s four files put back: **8 phone cases failed**, desktop and control passed.
    The checks can fail.
  - A standalone measurement over the same nine variants went from **344 issues** on main's files to **0**.
  - Harness page, throwaway spec and config, dummy env file and `.next` cache deleted, never committed.
- **Desktop unchanged, proved:** nine variants screenshotted at 1440x900, 1100x900 and 800x900 with
  main's files and with this branch: 27 of 27 byte-identical (sha256). One (Inventar with a search
  typed, 1100 px) first differed by 7 pixels at the search field's edge, the focus ring mid transition;
  re-shot, it matched (`6ecd9f3bc46194a5` both).

## Screenshots, 390x844 (from the local harness)

- Inventar: `docs/reports/2026-09-16-executor-g23-phone-lists-inventar-390.png`
- Clienți, Toți: `docs/reports/2026-09-16-executor-g23-phone-lists-clienti-toti-390.png`
- Leaduri: `docs/reports/2026-09-16-executor-g23-phone-lists-leaduri-390.png`
- Clienți view: `docs/reports/2026-09-16-executor-g23-phone-lists-clienti-vedere-clienti-390.png`
- Proiecte: `docs/reports/2026-09-16-executor-g23-phone-lists-proiecte-390.png`
- Comenzi: `docs/reports/2026-09-16-executor-g23-phone-lists-comenzi-390.png`

## Gates, from the worktree, all exit 0

`npx tsc --noEmit`, `npm run build`, `npm run check:card-ids`, `npm run check:board-edit`,
`npm run check:unique-ids`, `npm run check:open-branch-ids`, `npm run check:no-destructive-migration`,
`npm run check:conflict-residue`, `npm run check:categories`, `npm run check:ledger-rows`,
`npm run check:no-prod-target`, `npm run check:pending-schema-reads`, `npm run check:removal-safety`,
`npm run check:assertion-register`. Board validator exit 0 before every commit. Branch merged with
current `origin/main` before the push.

## Learnings

Two entries appended to `docs/LEARNINGS.md`: the `<main>` scroller that makes a document-only width
check a false green, and restyling one DOM (with CSS labels) instead of adding a hidden second list.

## Left for later

- Pull request after P3-60 merges (whole-page width depends on it).
- The page header on a phone keeps its side-by-side layout from `components/ui/primitives.tsx` (not
  this card's file): with two buttons the intro text beside them gets narrow. It fits and nothing is
  cut, but a later part could stack the header on phones.
- On Comenzi filtered by a project, the last outbound item keeps a bottom border (the loop compares
  against the unfiltered list length). Pre-existing, desktop too, not layout scope; noted only.
