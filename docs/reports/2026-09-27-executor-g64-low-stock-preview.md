# EXECUTOR: goal G64, card P3-107, the dashboard block Produse sub prag becomes a preview

Role AUTHOR, then EXECUTOR, in one pull request. Branch `card/p3-107`, cut from
`origin/main` at `68fe396`. Card id allocated with `npm run id:free -- P3-107`,
exit 0, lane highest `P3-106`.

## What changed for Rapid Construct

The box on the main screen that lists products which have run low used to print
every single one of them. After the roofing catalogue was loaded that means more
than eighty rows, and the two boxes under it were pushed off the first screen.

It now shows four rows. The fourth one fades away into the card, so it reads as a
list that carries on rather than a list that stops, and under the fade there is a
wide button saying how many products are under threshold in total. Pressing it
opens the thresholds screen, which is the same screen the small link in the top
right corner used to open. That small link is gone, because it moved.

When four or fewer products are under threshold, all of them are shown, with no
fade and no button, exactly as before. When none are, the sentence on screen is
the one that was there before.

The figure at the top of the screen labelled Produse sub prag is untouched. It
still counts every product under threshold, not the four on display.

## The measurement that explains why the card exists

Migration `0049_roofing_materials.sql` inserts eighty products. None of them has a
batch, so their stock is zero, and none sets `threshold`, so it takes the column
default of zero. The rule for under threshold is `stock <= threshold`, which zero
and zero satisfy. So eighty rows qualify in a database that has just been
migrated, before any person or any test has touched it.

## The background token the fade uses

**`bg-rc-white`**, the token on `Card` in `components/ui/primitives.tsx` line 29,
resolved in `app/globals.css` as `--color-rc-white: #ffffff`. The overlay is
`bg-gradient-to-b from-transparent to-rc-white`, so its arrival colour is the same
token the card is painted with and not a hardcoded white that could drift.

Measured on the stylesheet `npm run build` emitted, the browser computes:

    overlay background-image   linear-gradient(in oklab, rgba(0, 0, 0, 0) 0%, rgb(255, 255, 255) 100%)
    card   background-color    rgb(255, 255, 255)

The end to end spec makes exactly that comparison in CI: it reads both computed
values and asserts the gradient string contains the card's colour. A renamed token
or a hardcoded white that stops matching turns the spec red rather than shipping a
grey band.

## At four or fewer products: no button at all

The goal allows either no button or a button without the count. **No button is
drawn.** A control that appears when there is nothing more to see is a control the
owner has to explain, and the fade is absent in that state too, so the list simply
ends where it ends.

## The two findings, recorded and deliberately not acted on

**1. `/memento` is a thresholds screen, not a filtered list.** The button keeps the
destination the top right link had, as the task instructs. `loadThresholds()` in
`lib/data/dashboard.ts` returns every ACTIVE product sorted by name, and
`app/(app)/memento/page.tsx` renders all of them with their threshold and their
current stock. So a person pressing the button does not arrive at a list of only
the products it counted; they arrive at a list of every product with those among
them. That may be what the owner wants. It is not what the button's words promise.
A follow-up card would either filter that screen on arrival or give the button a
destination that is already filtered.

**2. Today's order is by SKU, not by urgency.** The goal says "most urgent first,
as today's order", and the second half of that phrase is what the code does:
`listProducts()` in `lib/data/products.ts` orders by `sku` ascending and the
dashboard filters that list. So the four rows drawn are the four alphabetically
first products under threshold, which after migration 0049 means the roofing
catalogue rather than whatever ran out this week. No sort was added, as instructed.
A follow-up card would decide what urgent means. The suggestion, for whoever writes
it: the largest shortfall against the threshold, not the smallest stock. A product
two units under a threshold of three is a worse problem than one twenty units under
a threshold of a thousand.

## How the fade survives both layouts

The four rows sit in a `relative` wrapper and the overlay is `absolute inset-x-0
bottom-0` against that wrapper. Nothing measures a row and nothing sets a top
offset, because at 390px `PHONE_TABLE` turns every row into a stacked card of a
different height and a fixed offset would land in the wrong place.

The overlay carries `pointer-events-none` and `aria-hidden="true"`. It is
decoration: the row under it keeps its link, and the button is a sibling BELOW the
wrapper, never inside the overlay.

Two heights, because one cannot serve both layouts: `h-10` (40px) on a desk
computer where a row is about 58px, and `max-md:h-16` (64px) on a phone where a
stacked card is about 152px.

## Local geometry, measured before the numbers were written

A static probe was used, because this machine has no Docker and no Supabase CLI so
the real dashboard cannot be rendered here: the stylesheet emitted by `npm run
build` plus a hand-written page carrying the exact classes of the new markup, read
with the locally installed chromium.

| | 1440x900 | 390x844 |
|---|---|---|
| rows drawn | 4 | 4 |
| overlay top..bottom | 332.0 .. 372.0 | 727.3 .. 791.3 |
| fourth row top..bottom | 313.4 .. 371.5 | 623.8 .. 775.3 |
| button top | 384.0 | 803.3 |
| button height | 41.5px | 44.0px |
| button width | 128.2px, centred | 308.0px in a 308.0px content box |
| `elementFromPoint` at the fourth link's centre | the link | the link |
| `documentElement.scrollWidth` vs `clientWidth` | 1440 vs 1440 | 390 vs 390 |

So the overlay ends inside the button's clear space at both widths, starts inside
the fourth row at both widths, and reaches the bottom of the fourth row at both.

Screenshots, committed beside this report:

- `2026-09-27-executor-g64-low-stock-preview-1440.png`
- `2026-09-27-executor-g64-low-stock-preview-390.png`

These are the probe, not the running application. The running application is
proven by the end to end spec in CI, which asserts the same geometry against real
rows.

## The acceptance spec, and the one thing a reviewer should read twice

`tests/e2e/stock-threshold-preview.spec.ts`, five cases.

The states the card promises cannot be produced by adding rows. Eighty products are
already under threshold in a fresh stack, so "three under threshold" and "none under
threshold" are not reachable by inserting anything. The dashboard reads ACTIVE
products only, so the spec restricts what is active:

1. it creates seven products of its own, six under threshold and one with a stock of
   ten against a threshold of zero,
2. it records every OTHER active product by id and deactivates those,
3. it plays its four states by switching its own seven on and off,
4. it reactivates, by recorded id, exactly the products it switched off.

**Nothing is deleted.** Deactivation is the cancellation this repository already
uses for test data, and `products` has no delete policy for any role at all.

Three things bound the blast radius, and they were the condition for doing it this
way at all:

- **the spec sorts LAST in the suite by filename**, after
  `sheet-options-admin.spec.ts`, so if the restore ever failed there is no spec
  left to trip over it. A spec added later that must run after it needs a name
  sorting after `stock-threshold-preview`.
- **the restore is by recorded id**, so a product that was already inactive before
  this spec ran stays inactive.
- **the restore is asserted**, not assumed: `afterAll` re-reads the count and fails
  the file if it does not match.

## The existing assertion that had to change, and why it is not a weakening

`tests/e2e/dashboard.spec.ts` read the new product's SKU out of the dashboard's own
table:

    await expect(page.getByTestId("dashboard-low-stock")).toContainText(sku);

After this card the block draws four rows of a list ordered by SKU. The test's
product is genuinely under threshold and is not among the four alphabetically first
of eighty-odd, so that line became an assertion about the PREVIEW rather than about
the number, and it would have failed. The old line is quoted in place at the point
of the change, per CLAUDE.md section 9c.

It is replaced by two readings of the same fact, both stronger:

- the stat tile labelled Produse sub prag rises by exactly one, which is card
  P2-06's actual thesis (the number is computed, never written by hand), and
- the product is found on `/memento`, the screen the new button opens.

No assertion was deleted, skipped, loosened or made conditional.

## Commands run on this machine, each alone, each exit 0

    npx tsc --noEmit
    npm run build
    node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json
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
    npm run check:board-clock
    npx playwright test tests/e2e/stock-threshold-preview.spec.ts --list

**This machine has no Docker and no Supabase CLI.** The bare postgres apply, both
applier proofs and the whole End to end suite run only in CI. Nothing in this report
claims a database ran here.

## Safety

No migration: `git diff --name-only origin/main...HEAD` carries no file under
`supabase/migrations/`, and no file under `lib/data/` either.

No production access: the live site was not opened and no production row was read.
No credential was sourced; environment variable names only.

No extraction file was touched, so there is nothing to tell Andre.

No self-merge: real client data has been in production since 2026-09-14, so the
merge question is filed for the owner with the pull request number and the head sha.
