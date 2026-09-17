# EXECUTOR report: P3-65, the forms and detail panels on a phone (G23 part 3)

Date: 2026-09-16. Role: AUTHOR (card), then EXECUTOR (code). Lane B (BLUE).
Branch: `card/p3-65`, cut from `origin/main` at d48304d, merged with `origin/main` at b80f1b3.
No pull request opened (Lane B rule).

## In plain words

The product, client, lead, contact, project and order screens and forms now work on a phone. Side
panels and forms open across the whole screen, fields sit one under the other, buttons and fields
are big enough to tap without the phone zooming in, and the small tables inside them (stock lots,
order lines, contacts, documents, costs) show as one card per row instead of scrolling sideways.
On a computer nothing changes: the layout of every checked screen was measured before and after
and is identical.

**Not included:** the product add/edit form (`components/inventory/ProductForm.tsx`) and the Model,
Serie and Grosime picker inside it. The main line still holds that file: G21 merged (#312) during
this run, but G24 (#313) is still open, and the task allows the file only when both have merged.
Also left for a later part: the project Deviz and Comparație tabs and the extraction review panel
(see "Left for later").

## Card

- New card **P3-65** on `docs/board/rc-board-phase3.json`, id from `npm run id:free -- P3-65`
  (answered FREE, lane highest P3-64, one open pull request, #312).
- `plain`, `defaults` (quotes the task's fix and acceptance, records G23 part 3), `depends_on: []`,
  machine-checkable `acceptance`. Lifecycle: `todo` at authoring, `in_flight` when work started,
  `shipped` in the last commit.

## What changed

Every new class carries `max-md:` (under 768 px), the P3-60 and P3-64 mechanism, so nothing applies
on a computer. One DOM, restyled; no hidden second copy. No wording changed and no behaviour changed.

| File | Change on a phone |
|---|---|
| `components/ui/phone.ts` (new) | The shared phone classes: full-width sheet, 44 px close button, stacked field rows, row cards with CSS labels (as P3-64), wrapping tab strips, 44 px links and label rows. |
| `components/ui/primitives.tsx` | Inputs, selects and textareas 44 px tall with 16 px text; buttons 44 px tall; `PageHeader` and `CardHeader` may wrap so their buttons drop under the title instead of pushing the page wider. |
| `components/ui/DateField.tsx` | The date field 44 px and 16 px; the calendar button a 44 px target. |
| `components/ui/FilePicker.tsx` | The chosen file name wraps instead of being cut. |
| `components/inventory/ProductPanel.tsx` | Full width; figures stacked; Loturi and Mișcări rows as cards; supplier link and close button 44 px. |
| `components/orders/Panel.tsx`, `InboundPanel.tsx`, `OutboundPanel.tsx`, `OrderDocumentUpload.tsx` | Full width; title and status chip wrap; order lines and lots as cards; ship box stacked; links 44 px. |
| `components/orders/InboundOrderForm.tsx` | Details fields one per row; each order line a card (product across, then quantity, unit, price, total); totals and confirm row stacked. |
| `components/orders/ManualOrderScreen.tsx`, `UploadOrderScreen.tsx` | Buttons after confirming wrap; the inline link is a 44 px target. |
| `components/clients/ClientForm.tsx`, `LeaduriForm.tsx`, `ContactForm.tsx` | Full width; paired fields one per row; checkbox rows 44 px; close button 44 px. |
| `components/clients/ClientDetailScreen.tsx` | Layout classes only: each label sits above its value instead of in a fixed 160 px column. Nothing G24 changes (the header button, the notice, the list empty state) was touched. |
| `components/clients/ClientTabs.tsx` | Tab strip wraps, tabs 44 px; contacts, projects and material rows as cards. |
| `components/projects/ProjectForm.tsx` | As the client form. |
| `components/projects/ProjectDetailScreen.tsx` | The 360 px status column moves under the details; labels above values. |
| `components/projects/ProjectBudgetPanel.tsx` | The five figures stacked instead of side by side. |
| `components/projects/ProjectTabs.tsx` | Tab strip wraps; Consum, Cost (both tables) and Istoric rows as cards; filter links 44 px. |
| `components/documents/DocumentsPanel.tsx` | Upload fields full width; document rows as cards; delete confirmation and pager wrap. |
| `tests/e2e/phone-forms.spec.ts` (new) | Acceptance spec, below. |

**No migration was added.** `ProductForm.tsx`, anything G22 adds, and Orange's paths were not touched.

## Acceptance spec: `tests/e2e/phone-forms.spec.ts`

Signs in at 1440 px like the rest of the suite, then switches to 390x844. On each screen, measured
on the screen's root (`main`, or the open panel): no sideways scroll on the document, on `main` and
on the panel, the panel exactly as wide as the screen, every visible field, button and link at least
44 px (a checkbox through its label, a link wrapping a button through the button), every field at
least 16 px text, nothing outside 0 to 390 px, no clipped text, no visible table header, and row
cards whose CSS labels equal the column headers.

- (a) product panel for the seeded TEST-NEC-03, with its lot and movement rows;
- (b) Client nou, then (d) the new client's detail screen, Contact nou saved and its row, Documente
  with a long-named PDF chosen and uploaded and its row; (e) Proiect nou for that client; (f) its
  detail screen and Modifică (with the Activ checkbox) saved, the new address shown;
- (c) Lead nou at De reluat, saved, its detail screen;
- (f) the seeded contract project's Consum rows;
- (g) the manual order form filled with two lines, confirmed, reference shown;
- (h) the seeded inbound and outbound panels with their lines;
- (4) at 1440x900 the panels and forms keep 620, 640, 520 and 560 px, panel tables keep a visible
  header and table rows, and the order form's fields sit side by side. No existing spec was edited.

### What ran where

- **The signed-in spec needs the local Supabase stack. This machine has no Docker and no Supabase CLI,
  so the spec itself runs only in CI**, on the pull request a later task opens. It was not skipped
  silently; its measurement code ran locally as below.
- **Local harness:** a throwaway page under `app/auth/` rendered the real components with fake rows
  (long names, long emails, long file names, large numbers) inside the shell's markup, with a dummy
  gitignored `.env.local`. The spec's measurement section was copied verbatim into a throwaway spec
  covering 19 screen variants (9 panels and forms including both edit forms, 9 detail screens and tabs,
  the order form filled with two lines and its problem list), a desktop case and a negative control.
  - On this branch: **21 of 21 passed.**
  - With the base commit's 21 application files put back: **all 19 phone cases failed**, desktop and
    control passed. The checks can fail.
  - Harness page, spec, config and dummy env file deleted, never committed.
- **Desktop unchanged, proved exactly:** a computed-layout dump (tag, own text, bounding box, display,
  font, colours, paddings, margins, borders, radius, alignment, wrapping, overflow, min-height, grid and
  flex settings, `::before` content) of every text, control and table element on all 19 harness screens
  at 1440, 1100 and 800 px, with the base files and with the branch: **6,615 rows, 0 differences**
  (per-page Next.js script tags excluded, they carry a random request id). Pixel hashes were tried first
  and flickered between two runs of the same files, see learnings.

## Screenshots, 390x844 (from the local harness)

- Product panel: `docs/reports/2026-09-16-executor-g23-phone-forms-product-panel-390.png`
- Inbound order panel: `docs/reports/2026-09-16-executor-g23-phone-forms-inbound-panel-390.png`
- Outbound order panel: `docs/reports/2026-09-16-executor-g23-phone-forms-outbound-panel-390.png`
- Client form (Client nou): `docs/reports/2026-09-16-executor-g23-phone-forms-client-form-390.png`
- Lead form (Lead nou): `docs/reports/2026-09-16-executor-g23-phone-forms-lead-form-390.png`
- Contact form: `docs/reports/2026-09-16-executor-g23-phone-forms-contact-form-390.png`
- Project form (Modifică): `docs/reports/2026-09-16-executor-g23-phone-forms-project-form-390.png`
- Client detail: `docs/reports/2026-09-16-executor-g23-phone-forms-client-detail-390.png`
- Client Contacte tab: `docs/reports/2026-09-16-executor-g23-phone-forms-client-contacts-390.png`
- Documente upload and list: `docs/reports/2026-09-16-executor-g23-phone-forms-documents-390.png`
- Project detail: `docs/reports/2026-09-16-executor-g23-phone-forms-project-detail-390.png`
- Project Cost tab: `docs/reports/2026-09-16-executor-g23-phone-forms-project-cost-390.png`
- Order form: `docs/reports/2026-09-16-executor-g23-phone-forms-order-form-390.png`
- Order form lines: `docs/reports/2026-09-16-executor-g23-phone-forms-order-lines-390.png`

The CI run of the spec also writes a screenshot per screen to its test output.

## Gates, from the worktree, on the merged tree, all exit 0

`npx tsc --noEmit`, `npm run build`, `npm run check:card-ids`, `npm run check:board-edit` (after the
ship commit), `npm run check:unique-ids`, `npm run check:open-branch-ids`,
`npm run check:no-destructive-migration`, `npm run check:conflict-residue`, `npm run check:categories`,
`npm run check:ledger-rows`, `npm run check:no-prod-target`, `npm run check:pending-schema-reads`,
`npm run check:removal-safety`, `npm run check:assertion-register`. Board validator exit 0 before every
commit.

## Merge with main

- `origin/main` at b80f1b3 (P3-61, #312) merged into `card/p3-65` (merge commit, no rebase).
- `docs/board/rc-board-phase3.json` rebuilt from both parents by script, keeping both sides: every card
  from main (P3-61 flipped there), P3-65 from this branch; the script refuses if this branch changed any
  other card. `docs/LEARNINGS.md` keeps all four entries.
- Open pull request #313 (P3-66, G24) touches `components/clients/ClientDetailScreen.tsx` too. Its
  changes (a button in the card header's right slot, a notice line, an import) do not overlap the lines
  this card changed (the label and value rows), so no conflict is expected; the card header now wraps
  on a phone, which gives its button room.

## Pull request stage, 2026-09-16 (the re-queued pull request task)

- Started only after `gh pr list --state open --author @me` and `gh pr list --state open` were both
  empty (#313 merged).
- `origin/main` at 96266d1 (P3-66, #313) merged into `card/p3-65` in 0290efc (merge commit, no
  rebase). `docs/board/rc-board-phase3.json` conflicted and was rebuilt from both parents by script,
  keeping both sides: main's P3-66 exactly as main has it, P3-65 from this branch; the script refuses if
  this branch changed any other card or top-level key. `as_of` and P3-65 `last_checkpoint` bumped.
  `components/clients/ClientDetailScreen.tsx` and `docs/LEARNINGS.md` merged without conflict; G24's
  new header button is a shared `Button`, which already takes 44 px on a phone at every size, and the
  card header wraps, so the phone checks cover it unchanged.
- **`components/inventory/ProductForm.tsx` is still NOT included.** G21 and G24 have both merged and
  no open pull request touches it (the P3-67 branch does not either), but this card's acceptance names
  its exact file list without it, and a new layout for it could not be proved here without the local
  database. A later card takes it, with the Model, Serie and Grosime picker.
- Re-run on the merged tree, all exit 0: board validator (3 boards), `npx tsc --noEmit`,
  `npm run build`, `npm run check:card-ids`, `npm run check:board-edit`, `npm run check:board-clock`,
  `npm run check:unique-ids`, `npm run check:open-branch-ids`, `npm run check:no-destructive-migration`,
  `npm run check:conflict-residue`, `npm run check:categories`, `npm run check:ledger-rows`,
  `npm run check:no-prod-target`, `npm run check:pending-schema-reads`, `npm run check:removal-safety`,
  `npm run check:assertion-register`. `git diff --exit-code origin/main -- tests/e2e
  ':!tests/e2e/phone-forms.spec.ts'` exit 0, and `git diff --name-only origin/main` lists only the
  files the acceptance allows.
- `tests/e2e/phone-forms.spec.ts` needs the local Supabase stack and runs in CI's `quality` job only.
- No new defect hit at this stage, so no new learning.

## Learnings

Three entries appended to `docs/LEARNINGS.md`: pixel hashes flicker in dev mode, so desktop-unchanged is
proved with a computed-layout diff; a tap-target check must measure a checkbox through its label and a
link through the button it wraps; `origin/main` is shared across worktrees and moves under a two-dot diff.

## Left for later

- `components/inventory/ProductForm.tsx` and the Model, Serie and Grosime picker inside it: free once
  G24 (#313) merges.
- The project Deviz tab (estimate editor with an 8-column line table) and Comparație tab: larger
  surfaces with their own spec reading cell attributes; a later part.
- `components/orders/ExtractionReviewPanel.tsx` (the document review after upload): on the extraction
  track, left alone.
- The shell's `main` keeps its 32 px side padding on a phone (from `app/(app)/layout.tsx`, not this
  card's file), so cards are 326 px wide; everything fits, but a later part could tighten it.
