# EXECUTOR: P3-97, the phone leftovers (goal G52, findings F9, F10 and F14)

Role: AUTHOR first, then EXECUTOR, in one pull request.
Branch: `card/p3-97`. Card: **P3-97**, phase 3 board.
Source: the operator factory's goal G52, against findings F9, F10 and F14 of
`docs/reports/2026-09-22-critic-bug-sweep.md`.

**In plain words, for the owner.** Two screens had been missed by the four cards that made this
application work on a phone: the sheet where a read document is checked before it becomes an
order, and the form where a product is added or changed. On a phone both were unusable rather
than merely ugly: the product form was wider than the screen, and the review sheet squeezed four
columns of fields into 390 pixels with boxes too small to hit with a thumb and text small enough
to make the phone zoom the whole page every time a field was touched. Both now behave like every
other screen. Tapping a low stock warning on the reminders screen used to land on that unusable
product form; it now lands on one that can be filled in. Separately, the phone layout rules had
been copied into the clients list instead of shared, and the copy had already started to
disagree with the original, so a client row and a row on any other list looked different for no
reason. The clients list now uses the shared rules. **Nothing changes on a computer screen.**

---

## 1. What was wrong, read from the code

### F14, the duplicated classes

`components/ui/phone.ts` exports the phone layout constants. `components/clients/ClientsScreen.tsx`
declared its own module constants under five of the same names, plus a sixth, `PHONE_CONTROL`,
that the shared file did not have. Two of the five had already drifted:

| name | in `ClientsScreen.tsx` | in `components/ui/phone.ts` |
|---|---|---|
| `PHONE_TABLE`, the row card padding | `px-5 pb-5` (20px sides, 20px bottom, 0 top) | `p-4` (16px all round) |
| `PHONE_LINK`, the name link display | `max-md:flex` | `max-md:inline-flex` |

So a Clienți row card and an Azi row card, which imports the shared constants, did not match on a
phone, and any later fix to the shared file would have missed this screen silently.

### F10, the product form

`components/inventory/ProductForm.tsx` had **zero** `max-md` classes in the whole 656 line file.
The side panel was `w-[520px]`, which is 130px wider than a 390px screen. The close button was
`w-8 h-8`, a 32px target. None of the three two-column field rows stacked. `ClientForm.tsx` and
`LeaduriForm.tsx`, built on the same shape, carry all three treatments; P3-65's own pull request
title says "ProductForm not included" and P3-67 did not pick it up.

### F9, the extraction review sheet

`components/orders/ExtractionReviewPanel.tsx`'s review form had no `max-md` classes at all (the
seven in the file were on the cancel block and the card header). The header block was
`grid grid-cols-4 gap-3` holding six controls. The per line block was
`grid grid-cols-[1fr_1fr_110px_110px] gap-2.5`, so 220px of that row was fixed at any width,
leaving the two flexible columns roughly 70px each at 390px. All ten inputs and selects in the
sheet are hand rolled rather than the `Input` and `Select` primitives, so none of them inherited
the `max-md:min-h-11 max-md:text-base` treatment P3-65 gave the primitives: they were
`py-1.5 text-[13px]`, under the 44px tap target and under the 16px at which iOS Safari stops
zooming the page on focus.

---

## 2. What was changed

### F14 first, because F10's fix imports from the file F14 repairs

`components/ui/phone.ts` gains `PHONE_CONTROL`, written as `` `${PHONE_TAP} max-md:text-base` ``,
the same shape `PHONE_WIDE` already uses. It is the combination a hand rolled field needs, 44px
plus 16px, and the review sheet needs exactly it, so writing it out a second time by hand would
have recreated the duplication this card removes.

`components/clients/ClientsScreen.tsx` deletes its six local declarations and imports
`PHONE_CELL`, `PHONE_CONTROL`, `PHONE_LINK`, `PHONE_ROW`, `PHONE_TABLE` and `PHONE_WIDE` from
`@/components/ui/phone`, the same import `ClientTabs.tsx`, `AziScreen.tsx` and
`InboundOrderForm.tsx` already use.

**THE DRIFT RESOLUTION, AND THE REASON.** Both drifted values are **adopted from the shared file,
with no call-site override**. `p-4` replaces `px-5 pb-5` and `inline-flex` replaces `flex`.
Neither the critic report nor this card found any reason the Clienți list needs a different
padding or a different display from every other list in the application, and the report's own
recommendation is that the screen should import the shared constants with any genuine difference
added at the call site. There was no genuine difference to add, so nothing was added. The visible
effect on a phone is 4px less side padding and 20px less bottom padding on a Clienți row card,
and a name link that is inline rather than block: in both directions the Clienți list moves
**towards** every other list rather than away from it, which is the whole point of the finding.

### F10, the product form

Modelled line for line on `ClientForm.tsx`: `PHONE_SHEET` appended to the panel's className,
`PHONE_CLOSE` to the close button's, and `PHONE_STACK` to every two column field row. There are
three such rows and every one of them is two ordinary fields, so none needed the
`InboundOrderForm.tsx` treatment for multi-column line rows; `grep -n "grid-cols-2 gap-3"` finds
three and all three now carry the class. The fields themselves are `Input` and `Select` from
primitives, which have carried 44px and 16px since P3-65, so they needed nothing.

**The Memento deep link is untouched.** `app/(app)/memento/page.tsx` links a threshold to
`/inventar?produs=<sku>&camp=prag`; `InventoryScreen.tsx:100` reads it into `editFromUrl`, which
opens this form with `focusField="threshold"`. Not one line of that path is in this diff. The new
test drives it at 390px and asserts the threshold field is focused and editable, which is the
goal's own sentence ("Memento's threshold link then lands on a usable form") turned into a check.

### F9, the review sheet

- **The header grid** takes `PHONE_STACK`, so its six controls stack to one column under 768px.
  Not two columns: two of the six are `DateField`s whose calendar button alone is a 44px target
  inside a field that already carries `pr-11`, and they do not fit a half-width column at 390px.
- **The per line grid** takes `max-md:grid-cols-2`, which is `InboundOrderForm.tsx`'s own choice
  for the nearest shape (product, quantity, unit, price, total), given the phone treatment in
  P3-65: the wide fields span the row and the short numeric fields share one. Here that is
  `Nume pe document` and `Produs din catalog` on `max-md:col-span-2`, and `Cantitate` beside
  `Preț unitar`. Four fields in one column would have made an already long sheet twice as long
  for two fields that are four characters wide.
- **The three children that cross the grid** (the scan notice, the EXT-34 detail row, and the new
  product block) move from `col-span-4` to `col-span-4 max-md:col-span-2`. This is not cosmetic:
  a span of four inside a two column grid makes CSS create two implicit columns to satisfy it,
  which would have widened the row back off the screen. The new product block additionally takes
  `max-md:grid-cols-1`, because its two fields are selects with long option text.
- **All ten hand rolled inputs and selects** take `PHONE_CONTROL`. The two `DateField`s already
  had the treatment through `DateField`'s own `CONTROL` string and were left alone.
- **The seven pre-existing `max-md` classes were not touched.** `grep -c max-md` on the file goes
  from 7 to 14 and every one of the original seven is still on the line it was on.

---

## 3. A finding this card did NOT fix, and the reason

While fixing the one screen F14 names, the same duplication was measured across the whole
application. It is far wider than the finding reported:

**10 other files hold 53 local copies of a name `components/ui/phone.ts` already exports, and 8
of those copies have drifted.** Measured with a throwaway script over `^const PHONE_` with
template literals resolved before comparing, so a copy written `` `${PHONE_TAP} max-md:text-base` ``
and one written out in full count as the same rather than as drift.

| file | drifted copies |
|---|---|
| `components/projects/ProjectsScreen.tsx` | `PHONE_TABLE` (`px-5 pb-5` against `p-4`), `PHONE_LINK` (`flex` against `inline-flex`) |
| `components/inventory/InventoryScreen.tsx` | `PHONE_TABLE` (`p-3` against `p-4`), `PHONE_CELL` (an extra `[&>span]:whitespace-normal`) |
| `components/inventory/ProcurementScreen.tsx` | `PHONE_TABLE` (no padding at all), `PHONE_LINK` (an extra `[overflow-wrap:anywhere]`) |
| `components/projects/DevizComparisonPanel.tsx` | `PHONE_TABLE` (no padding at all) |
| `components/projects/DevizPanel.tsx` | `PHONE_ACTIONS_CELL` (missing `max-md:text-left`) |

`ProjectsScreen.tsx` carries **the identical two drifts F14 named on `ClientsScreen.tsx`**, so the
Proiecte list and the Clienți list were wrong in exactly the same way for exactly the same reason
and only one of them was reported. Five more files (`app/(app)/page.tsx`,
`app/(app)/memento/page.tsx`, `components/outbound/OutboundScreen.tsx`,
`components/settings/CategorySettings.tsx`, `components/settings/UnitSettings.tsx`) hold copies
that are currently identical, which is a hazard rather than a defect: they will drift the next
time the shared file is corrected.

**This card did not fix any of them.** CLAUDE.md section 3 says a defect noticed in passing
becomes a new card or a `docs/LEARNINGS.md` entry, not a quiet extra commit, and the task brief
repeats it. It is recorded here, in `docs/LEARNINGS.md`, and in the card's own notes, and it
wants a card of its own. **Because of this the card's `plain` and `title` were written to claim
only what is true**: the clients list screen stopped keeping its own copy. The application as a
whole does not yet keep these classes in one place.

---

## 4. The tests

Four new cases, every title starting `G52:`. They extend the two existing phone sweeps rather
than starting a new file, because both screens are exactly what those files already cover.

| case | file | what it proves |
|---|---|---|
| `G52: (F10) ...` | `tests/e2e/phone-forms.spec.ts` | at 390x844, `Adaugă produs` and `Modifică produsul` pass `expectFitsPhone` with the product form as root (panel exactly 390px, no element under 44px, no field under 16px, nothing outside the screen, no clipped text, no visible table header); `Valoare unitară` starts below `Prag recomandă`; a product is created and then edited and saved at that width; and `/inventar?produs=<sku>&camp=prag` opens the form with the threshold field focused and accepts a new value. |
| `G52: (F9) ...` | `tests/e2e/phone-forms.spec.ts` | at 390x844, a document is uploaded through the extraction band, a callback is posted with the shared test secret, the review sheet is opened and passes the same reading; `Monedă` starts below `Furnizor`; `Produs din catalog` starts below `Nume pe document` while `Preț unitar` stays level with `Cantitate`, which is the two column choice asserted rather than described; and the draft is edited and **confirmed** at that width, with the created order found on `/comenzi` by its reference. |
| `G52: (4) desktop neschimbat ...` | `tests/e2e/phone-forms.spec.ts` | at 1440x900 the product form still measures exactly 520px, `Prag recomandă` and `Valoare unitară` are still level, and in the review sheet `Furnizor` and `Monedă` are still level and the whole line row is still on one line. |
| `G52: (F14) ...` | `tests/e2e/phone-lists.spec.ts` | at 390x844 a Clienți row card reads `16px 16px 16px 16px` of padding on its `tbody` and `inline-flex` on its name link, with the link at least 44px tall, all read with `getComputedStyle` **in the page** rather than from a class string, so a second definition writing the same classes today and drifting next week still fails this; and at 1440x900 neither value applies. |

**A helper was added rather than reused, and the reason is in the file.** `expectFitsPhone`
requires a non-`main` root to be exactly the viewport width, which is true of a side panel that
opens over the page and false of the review sheet, which is drawn inside a card and is therefore
the card's width minus its padding. `expectFitsPhoneInPlace` is the same nine assertions minus
that one. Nothing else was weakened.

### Every existing spec this change could reach, and what was done about it

`git grep -l "product-form\|review-form" tests/e2e/` names fourteen specs outside the phone
sweeps: `cross-links`, `deviz-comparison`, `extraction-cancel-draft`, `load-80-materials`,
`product-image`, `product-sheet-edit`, `product-sheet-locked-hint`, `products`, `reminders`,
`review`, `romanian-file-date`, `roofing-product-picker`, `roofing-product-prices` and
`sheet-options-admin`. `phone-lists.spec.ts` case (2) is the existing spec that drives the
Clienți list at 390px.

**Not one assertion in any of them was changed, and none needed to be**, for a reason that is a
property of the diff rather than a hope: **this change adds no DOM node and removes none.** Every
edit is a `className` string or a comment. `max-md:` has no effect above 768px by construction and
every one of those fourteen specs runs at the suite's default 1440x900, so at that width the
rendered tree is byte for byte what it was. The two structural risks that would survive that
argument were checked by hand and are covered by the new desktop case above: the review sheet's
line row is still one row at 1440px, and the product form is still 520px wide.

`phone-lists.spec.ts` case (2) runs at 390px and DOES see the F14 change, since the Clienți row
card padding moves from 20px to 16px. Its assertions are about row cards being grids, about every
cell carrying its column header as a visible label, and about nothing overflowing 390px. None of
them reads a padding value, and a smaller padding cannot make a row overflow. It was not touched.

---

## 5. What was run here, and what is left for CI

This machine has no Docker and no Supabase CLI, so the end to end suite runs only in CI. Run in
this worktree, each on its own, each exit 0:

```
npx tsc --noEmit
npm run build
node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json
npm run check:card-ids
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
npm run check:board-clock
npx playwright test --list --project=chromium tests/e2e/phone-forms.spec.ts tests/e2e/phone-lists.spec.ts
```

`check:board-clock` is not in the close-out block's gate list. It is run anyway, after the commit
that writes the board and before the push, because it is the one check that reads the commit and
therefore cannot be satisfied before the commit exists. Section 6 records what it caught.

`npx playwright test --list` collects 16 cases in the two files, four of them the new `G52:` ones.

`npm run check:board-edit` was red until the commit that flips P3-97 to `shipped`, which is the
last commit of this pull request, and it is green afterwards. That is the check working: it
refuses a pull request that carries code under a card still in hand.

A **style probe on the built CSS** was run in place of the browser this machine cannot drive
against a database: every class this change depends on is present in
`.next/static/chunks/*.css` under its `max-md` media query, including
`.max-md\:\[\&_tbody\:not\(\:empty\)\]\:p-4 tbody:not(:empty){padding:calc(var(--spacing) * 4)}`
with `--spacing: .25rem`, which is the 16px the F14 case asserts.

**LEFT FOR CI, and it is the whole acceptance:** the four `G52:` cases, plus every other case in
the suite, against a local Supabase stack. No migration is added or changed by this pull request,
so the destructive-migration check parses zero files and both applier proofs are correctly
skipped by `applier_scope`; this is not a documentation-only diff, so `Build`, the migration apply
and the whole End to end block must have RUN and passed.

**No production database was touched and none could be**: this pull request adds no file under
`supabase/migrations/`, there are no production credentials on this machine, and the whole diff is
layout classes, their shared definitions, two test files and these documents.

---

## 6. Learnings

Two entries appended to `docs/LEARNINGS.md`:

1. **Changing a grid's column count on a phone leaves every `col-span-N` child pointing at columns
   that no longer exist.** A span wider than the track count makes CSS grid create implicit
   columns rather than clipping, so the symptom is "the fix did not work" rather than an error.
2. **A phone class copied into a screen instead of imported is a class that stops being the same
   class**, with the measurement of section 3 and the rule that a fix removing a duplicate should
   count the remaining copies before the commit message claims they are gone.

**A third thing broke and gets no LEARNINGS entry, on purpose.** The first CI run, 36003920985,
failed in 1 minute 27 seconds at `Refuse a board timestamp from the future`: the card's
`last_checkpoint` and `evidence.at` were typed as a rounded `13:20:00Z` while the commit that
wrote them landed at `13:09:47Z`, ten minutes earlier, and a card timestamp gets zero slack where
the top-level `as_of` gets sixty. Attempt 1 replaced all four occurrences with the output of
`date -u +%Y-%m-%dT%H:%M:%SZ` read immediately before the edit, committed, and ran
`npm run check:board-clock` locally, which now reports every timestamp at or before its commit.

No entry was appended for it because **this file already carries the rule six times** (around
lines 4156, 4174, 4810, 5398, 5945, 6374) and the factory's `KNOWN-FAILURES.md` carries the exact
signature under "A board time ahead of its commit", each saying the same sentence: read the time
from `date -u` just before the edit, and run `check:board-clock` after the commit and before the
push, **because it is not in the close-out gate list**. A seventh copy of a rule that has been
written down six times and broken seven is noise, not a learning. The failure here was not
reading what was already written, and the honest record of that is this paragraph rather than
another entry.

Nothing else broke while working this card.

---

## 7. Decisions taken under the card's `defaults`, logged per CLAUDE.md section 5

- **The two drifted values adopted from the shared file, no call-site override.** Section 2, with
  the reason.
- **`PHONE_CONTROL` promoted to the shared file** rather than left local in `ClientsScreen.tsx`,
  because F9 needs the identical combination.
- **The review sheet's line grid at two columns, not one**, following `InboundOrderForm.tsx`; the
  header grid at one column, not two, because of the date fields.
- **The wider duplication reported and not fixed**, per CLAUDE.md section 3.

Nothing on the R-057 escalation list was reached, so nothing was asked.

---

Role EXECUTOR. Card P3-97. Branch `card/p3-97`.
