# EXECUTOR, card P3-49: a Romanian file picker everywhere, and day-first dates

Run date 2026-09-15 (UTC 2026-09-16). Branch `card/p3-49`, pull request #307.

## What changed for Rapid Construct

Two things an operator sees, and one of them was losing days.

**The file button.** Everywhere a file is attached, the browser drew its own
button and its own empty message, in its own language: on a computer set to
English, "Choose File" and "No file chosen". That text is not in the page, so it
could not be translated and a search of the screen's text would never find it.
Now the button reads "Alege fișierul", the message beside it reads "Niciun
fișier ales", and after a choice it shows the file's name. The same button in
all six places.

**The dates.** The browser's own date field puts the month before the day when
the browser is set to English, whatever the page's language says. The keystrokes
`01122027` therefore stored 12 January 2027 while the operator was thinking 1
December 2027, with nothing on screen to say so. That is how a delivery gets
saved on the wrong day. Every date field is now a Romanian field that reads
"zz.ll.aaaa", takes the day first with or without the dots, refuses an
impossible date in Romanian, and keeps the calendar button. The date written out
in Romanian under the intake form's two fields, which card P3-41 added, is
untouched and follows the new field.

**No database change.** This pull request adds and modifies no file under
`supabase/migrations/`. Nothing in the live database changes.

## What was built

Two new shared components, because three hand-made copies of the same control is
drift:

- `components/ui/FilePicker.tsx`. The native input stays in the page, hidden with
  `display: none`, so `setInputFiles` and every existing upload action work
  unchanged; beside it a real `<button>` built on the shared `Button` and the
  chosen file's name.
- `components/ui/DateField.tsx`. A text field with the placeholder "zz.ll.aaaa"
  that hands the form exactly the same `yyyy-mm-dd` string the native field
  handed it, so no server action and no stored value changes; plus a hidden
  native date input that the calendar button opens through `showPicker()`.

Call sites, all found with a repository-wide search rather than taken from the
card's list, which was written before two of them existed:

| Control | File | Screens |
|---|---|---|
| file | `components/orders/OrderDocumentUpload.tsx` | `/incarca-comanda`, `/adauga-manual`, the order panel on `/comenzi` |
| file | `components/orders/ExtractionReviewPanel.tsx` | `/incarca-comanda` |
| file | `components/documents/DocumentsPanel.tsx` | client and project Documente tabs (P3-15) |
| file | `components/inventory/ProductForm.tsx` | product image (P3-56) |
| date x2 | `components/orders/InboundOrderForm.tsx` | intake form |
| date | `components/clients/LeaduriForm.tsx` | add lead |
| date | `components/clients/ClientForm.tsx` | client form |
| date x2 | `components/projects/ProjectForm.tsx` | project form |
| date x2 | `components/orders/ExtractionReviewPanel.tsx` | extraction review |

Four file inputs and eight date inputs: the card's own counts, re-verified.

### Two decisions taken on the card's authority

**The date question was answered with option (1)**, the shared Romanian
day.month.year field. That is what `mailbox/answers/q009-p3-49-date-field-order.md`
said and also the card's own recommendation for silence, so the acceptance stood
unchanged and no AUTHOR rewrite was needed.

**`display: none` and not `sr-only`.** P3-15 and P3-56 hid their file inputs by
clipping them to one pixel. A one-pixel clipped element still has a non-empty
bounding box, which is exactly what Playwright calls visible, and the acceptance
asks for no visible native control. Before writing any code, both alternatives
were measured in this repository's Chromium: `setInputFiles` works on a
`display: none` input and fires `change` as usual, and `showPicker()` works on a
`display: none` date input. Both old call sites were moved onto the shared
component and so onto `display: none`; the two existing bounding-box assertions
already accepted `null`, so they pass unchanged.

**The product image button was renamed.** It read "Alege imaginea" / "Nicio
imagine aleasă". The card's acceptance asks for one text everywhere a file is
attached, so it now reads "Alege fișierul" / "Niciun fișier ales" like the rest,
and `tests/e2e/product-image.spec.ts` was updated to match.

## Acceptance

`npx playwright test tests/e2e/romanian-file-date.spec.ts tests/e2e/inbound.spec.ts`
plus `npx tsc --noEmit`, both in the `quality` run on the head sha.

`tests/e2e/romanian-file-date.spec.ts` is a new file with four cases. Each one
launches its own Chromium with the process language set to English, the same way
the P3-41 case in `inbound.spec.ts` does, because that is the only condition
under which the browser draws its English controls. Because that text is outside
the page, the cases assert on the controls themselves: the native input must
exist and be hidden, the Romanian button must be visible with the exact text,
the date field must carry the placeholder, no `input[type=file]` and no
`input[type=date]` may be visible anywhere on the screen, and the day typed must
be read back out of the database.

### The red-first proof could not be a CI run, and why

The card asks that the new spec be proved to fail first against the tree before
this card. The end to end suite runs only in CI on this machine (no Docker, no
Supabase CLI), so that means a pull request. It was attempted: the first commit
of this branch, `a36d046`, carried the new spec **alone**, with no code change,
and pull request #307 was opened on it. Run **35040244048** went red in 38
seconds, at the step `Refuse a code pull request whose board edit is missing`,
before any test ran:

```
P3-49: status is "in_flight" at the head, which means the work is still in hand.
REFUSED. This pull request carries code under a card whose board edit is missing.
```

`check:board-edit` refuses any pull request carrying code under a card that is
not terminal, and a spec file counts as code. The card cannot honestly be
`shipped` before the work is done, so there is no tree on which CI will run this
spec against the unfixed components. CLAUDE.md section 2 wins over the card's
acceptance wording, per the project's own precedence rule.

The failure was therefore proved statically, against `origin/main`, with
commands a stranger can re-run:

```
git grep "zz.ll.aaaa" origin/main -- components/                     -> no match
git grep "extraction-choose" origin/main -- components/              -> no match
git grep "doc-choose" origin/main -- components/                     -> no match
git grep "order-expected-at-native" origin/main -- components/       -> no match
git grep "order-ordered-at-native" origin/main -- components/        -> no match
git grep "review-ordered-at-native" origin/main -- components/       -> no match
git grep "sr-only" origin/main -- components/documents/DocumentsPanel.tsx
  -> components/documents/DocumentsPanel.tsx:193: className="sr-only"
```

Case 1 asserts `extraction-choose` and `doc-choose`, which do not exist there.
Case 2 asserts that `document-input` and `field-image-input` are hidden, and on
that tree both are `sr-only`, which Playwright counts as visible. Cases 3 and 4
assert the placeholder "zz.ll.aaaa" and the `-native` fields, none of which exist
there. Every case fails on that tree.

This is written up as an ERROR/SOLUTION pair in `docs/LEARNINGS.md`, because the
next card whose acceptance asks for a red-first run will hit the same wall.

## The existing tests that were touched

Three assertions in the existing suite read the value of the control that this
card replaces. None was deleted, skipped or loosened; each now states what is on
screen and, in addition, what is stored.

**`tests/e2e/inbound.spec.ts`, the P3-41 case, clause 1.** It pinned the
browser's month-first behaviour as a fact. The card says explicitly that this one
changes. Clauses 2 to 4, which are the subject of card P3-41 (the date written
out in Romanian), keep their expected text letter for letter: only their
keystrokes were rewritten in day-first order so they land on the same days,
12 January 2027 and 10 September 2026. The full diff is quoted in the pull
request body.

**`tests/e2e/review.spec.ts`.** `toHaveValue("2026-08-14")` became
`toHaveValue("14.08.2026")` on the visible field plus `toHaveValue("2026-08-14")`
on the hidden native one: strictly more than before.

**`tests/e2e/product-image.spec.ts`.** The two label assertions follow the
rename described above.

## Commands run locally, each exit 0

```
npx tsc --noEmit
npm run build
npm run check:card-ids
npm run check:board-edit
npm run check:unique-ids
npm run check:open-branch-ids
npm run check:no-destructive-migration
npm run check:conflict-residue
npm run check:categories
npm run check:ledger-rows
npm run check:no-prod-target
npm run check:pending-schema-reads
npm run check:removal-safety
npm run check:assertion-register
node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json
```

The end to end suite cannot run on this machine: no Docker and no Supabase CLI.
It runs in CI, inside `quality`.

## Orange's track

Nothing under `app/api/extraction/**`, `app/api/documents/**`,
`lib/data/extraction*` or `docs/contracts/extraction*` was opened or edited. The
change in `components/orders/ExtractionReviewPanel.tsx` is the appearance of two
controls, inside `components/`.

## Migrations

None. This pull request adds and modifies no file under `supabase/migrations/`.

## What is left for the owner

The pull request is left open, green and unmerged. No pull request self-merges
any more: real client data is in production. The approval question is filed at
`mailbox/questions/q033-approve-p3-49-merge.md` in the factory folder. Per the
operator's standing rule this one merges under "merge screen-only when green",
because it carries no migration.
