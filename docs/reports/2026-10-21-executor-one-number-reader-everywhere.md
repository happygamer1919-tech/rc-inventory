# Executor report: P3-332, one number reader on every form

Role EXECUTOR. Date 2026-10-21. Branch `card/p3-332`. Source: Fable bug check of 2026-10-21 19:18Z, findings 2 and 3 (zero based).

## What changed for Rapid Construct

- The product form (threshold, unit value, package factor), the project budget, the incoming order (quantity and unit price), the quote line quantity, the invoice editor and the owner's sheet price now read a typed number the way the counter does. 1.250 is 1250, 1 250 is 1250, 1.200,50 is 1200,50, the comma is always the decimal mark.
- Money boxes show "Citit: ..." under the box, like the counter. On the incoming order it names the order currency.
- A price with more than 2 decimals, or a quantity with more than 3, is refused on screen and on the server, at the counter too: "Prețul are cel mult 2 zecimale." and "Cantitatea are cel mult 3 zecimale." Before, the screen showed 1,255 and the database stored 1,26.
- Import files refuse a unit value or budget past 2 decimals and a threshold past 3.
- On the incoming order the boxes are now text boxes. A quantity typed with a comma ("2,5") used to be NaN on screen, so the line was not counted.

## How

- `lib/data/form-numbers.ts` (new): one function per field, wrapping `price-input.ts`, which wraps `import-number.ts` in screen mode. Screens and server actions call the same function.
- `lib/data/price-input.ts`: `tooManyDecimals` result, `readMoneyField`, `readQuantityField`, `priceProblem`, `quantityToField`, `priceReadLabel(raw, unit)`.
- `lib/data/import-number.ts`: `realDecimals`.
- `components/ui/NumberNote.tsx` (new): the red sentence or the "Citit: ..." line under a box.
- Percent fields (quote margin, VAT rate) keep their own reading on purpose: a percent has no thousands separator.

## Left alone, for Ivan's extraction track

`lib/data/extraction-actions.ts` lines 527 and 531 (`confirmExtractionDraft`) and `components/orders/ExtractionReviewPanel.tsx` line 286 still use `Number(text.replace(",", "."))`. Factory close-out step 4 forbids editing `lib/data/extraction*`, and changing only the screen would make screen and server disagree. A question for Ivan was filed in the factory mailbox.

## Existing tests changed (they encoded the bug)

- `tests/e2e/number-reader.spec.ts`: `priceReadLabel("1,255")` is now null, `parsePriceText("1,255")` is `tooManyDecimals`; the 20 case loop expects `tooManyDecimals` for 0,125 as a price.
- `tests/e2e/price-input.spec.ts` (P3-327 round trip): removed 0,125, 999,123, 12345,678 from the valid prices.
- `tests/e2e/facturare-create.spec.ts` case 10: invoice quantities 1.005 and 8.165 are unclear at the counter, so they are typed 1,0050 and 8,1650 (same numbers, same totals).

## Tests added

- `tests/e2e/one-number-reader.spec.ts` (no database): per form, the same typed texts read the same number as at the counter; empty boxes keep their meaning; extra decimals are refused with the Romanian sentence. Ran locally with a temporary Playwright config (no web server): 71 passed, including the number-reader, price-input, import-number, import-preview-rows and import-shared specs.
- `tests/e2e/one-number-reader-forms.spec.ts` (needs the database, runs in CI): product form and manual incoming order.

## Commands run locally

- `npx tsc --noEmit`: exit 0.
- Board validator: exit 0.
- See the PR body for the rest of the close-out gate list.

## Not run here

No Docker and no Supabase CLI on this machine: the end to end suite runs only in CI.
