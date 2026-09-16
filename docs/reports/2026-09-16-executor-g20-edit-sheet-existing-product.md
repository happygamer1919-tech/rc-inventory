# Executor report: G20, Model / Serie / Grosime editable on an existing product

- **Date:** 2026-09-16 (UTC)
- **Role:** AUTHOR (card), then EXECUTOR (code), one pull request
- **Card:** P3-59, phase 3 board, depends on P3-57 (shipped)
- **Branch / PR:** `card/p3-59`, pull request #308
- **Migration:** none. No file under `supabase/migrations/` added or changed.

## What changes for Rapid Construct

On a product that already exists, the operator can now change its model, series and thickness,
or clear them back to "Fără model". Before, those three lists only appeared when adding a product.
Opening a product shows its saved choice; editing its name or price leaves that choice as it was.

## Boot

Status report printed before any write. Phase 2: 68 shipped, 2 blocked, 32 todo, launch gate 6/9,
next eligible AUT-3. Phase 3: 76 shipped, 31 todo, launch gate 0/9, next eligible P3-14. P3-57 and
P3-58 both `shipped`. This run worked the owner-requested defect card instead, as the task says.

## AUTHOR

`npm run id:free -- P3-59` answered FREE (lane highest P3-58). Card written with `plain`,
`defaults` quoting the task, `depends_on: ["P3-57"]` and a named acceptance. Validator PASS on
all three boards, `check:card-ids` exit 0. Committed, then flipped to `in_flight` in its own commit.

One acceptance detail was corrected against the tree before writing: C-10 Standart Zn has no
0,50 mm line (migration 0046 lines 132 to 136), so case 2 changes 0,45 mm to 0,40 mm, whose
verified price is 126 (0047 line 148).

## EXECUTOR

Confirmed against the tree:
- `ProductForm.tsx` gated the lists with `!editing`, and the sheet state always started empty.
- `CatalogProduct` did not carry the four `sheet_*` columns.
- `updateProduct` never called `validateSheet` or `sheetColumns`.
- **The task's premise about `sheetColumns` was wrong:** for "no model" it returns `{}`, which
  writes nothing. On update that would have left a cleared combination in place.

Changes:
- `lib/data/products.ts`: `listProducts` selects the four columns behind `hasSheetOptions`, which
  already probes exactly those product columns, so no new probe was added. Each product carries
  `sheet: { model, series, thicknessMm, finish } | null`, thickness normalized to "0.45".
- `components/inventory/ProductForm.tsx`: `sheetActive = sheetOptions.length > 0`; model, series
  and thickness state start from `product.sheet`. That is initial state only, so opening the form
  rewrites nothing. Picking a thickness still fills name, unit, category, supplier and suggested
  price, as on create. When the lists are not shown, the `sheet` key is left out of the input.
- `components/inventory/InventoryScreen.tsx`: the edit form receives `sheetOptions`.
- `lib/data/product-actions.ts`: `updateProduct` calls `validateSheet` (same refusal message,
  not weakened) and a new `sheetUpdateColumns`: absent key writes nothing; a chosen combination
  goes through `sheetColumns` (checked against the list, before `resolveSupplier`); "Fără model"
  writes four explicit nulls while the columns exist. The unit lock is unchanged and still runs
  first. `createProduct` is unchanged.
- `tests/e2e/product-sheet-edit.spec.ts`: NEW, four cases as on the card.
- `tests/e2e/roofing-product-picker.spec.ts`: the one line that expected the lists to be absent
  on edit (the defect itself) now expects them visible with 0,45 mm selected.

Constraints kept: `products_sheet_complete` (all four or none) and `products_sheet_option_fk`
untouched; no extraction path touched; no `lead=` sweep.

## Commands run locally

All exit 0: `npx tsc --noEmit`, `npm run build`, the board validator on three boards,
`check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`
(0 files), `check:conflict-residue`, `check:categories`, `check:ledger-rows`,
`check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`,
`check:assertion-register`. `npx playwright test --list` parses both specs, 7 tests.

Left for CI: the end to end suite, which needs a local Supabase stack this machine does not have.
The `quality` result on the head sha is recorded in the pull request and in the owner question,
because writing its run id here would move the head sha.

## Learnings

One entry appended to `docs/LEARNINGS.md`: a spec that asserts a feature's scope limit locks the
defect in, and a helper returning `{}` for "nothing chosen" is only "clear" on insert.

## Merge

Not merged by this session. Real client data is in production, so the run files
`mailbox/questions/qNNN-approve-p3-59-merge.md` in the factory once `quality` is green and
`checks:state` exits 0, and POC merges.
