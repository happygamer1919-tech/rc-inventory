# EXECUTOR report, 2026-09-15, card P3-57, model, series and thickness for roofing sheet

**Role:** AUTHOR (card written), then EXECUTOR (card built), in one pull request, as the
operator factory task for goal G13c asks. **Session:** the operator's task queue, on the
owner's machine (no Docker, no Supabase CLI, no production credentials).
**Branch:** `card/p3-57`. **Pull request:** #305. **State:** open, merge held for the owner:
real client data is in production, and merging applies migration 0046 to the live database
(CLAUDE.md 8.0). Max pre-approved this merge ("3rd approved", GOALS.md overnight order step 4),
so POC may merge on green after verifying the conditions.

## Boot status at the start

- Phase 2 board: 68 shipped, 32 todo, 2 blocked. Launch gate 0/9. Next eligible AUT-3.
- Phase 3 board: 73 shipped, 32 todo. Launch gate 0/9. Next eligible P3-14. P3-56 shipped.
- Open pull requests: #300 (Orange, board only). None of ours.
- Worked instead of the next eligible card: the new card P3-57, authored here, because the
  owner's goal G13c names it.

## Cards touched

| card | status at start | status in this pull request |
|---|---|---|
| P3-57 | did not exist | authored `todo`, then `in_flight`, then `shipped` with evidence PR #305 |

## What changes for Rapid Construct, once merged

The new product form gets three lists at the top: Model, Serie, Grosime. Each list shows only
what the previous choice allows, taken from the Dasterum price list Max verified on 2026-09-15.
Picking a thickness fills the name (for example "Tablă cutată C-10 Standart Zn 0,45 mm"), the
unit, the "Acoperișuri și tablă" category and the supplier Dasterum. Everything stays editable.
Each combination is its own product with its own code and stock. Ordinary products are added
exactly as before by leaving "Fără model". Nothing changes on the live site until the pull
request merges. **No price is loaded**; the price stays typed by hand until goal G13d.

## AUTHOR step

- `npm run id:free -- P3-57`: FREE, lane highest P3-56.
- Card appended to `docs/board/rc-board-phase3.json` with `plain`, `defaults` quoting the task's
  "The approved design", "Series and their thickness options" and "The fix" sections plus six
  decisions taken at authoring, `depends_on: ["P3-56"]`, and an acceptance naming
  `tests/e2e/roofing-product-picker.spec.ts`.
- Validator exit 0, `check:card-ids` exit 0. Commits `5f22c02` (authored) and `a905159`
  (in_flight).

## What the verified list holds

Read directly from `inputs/dasterum-pret-2026-08-07-verificat.csv` in the factory folder:
194 data lines, 8 columns each, 194 distinct (model, serie, grosime, finisaj) lines.

- Models in the CSV `model` column: PS-8, C-10, T-12, C-15, "PK/PS-20, VP-20", HC-35, C-44,
  H-57, H-60, "Monterrey, Valencia", Kascad, "Dastera (lei/bucată)", Tablă netedă,
  **Foaie în folie**.
- Series: AlZn Premium, Zinc (România/Turcia), Econom, Standart Zn, Premium Zn, Printek Econom,
  Printek Premium.
- Thicknesses: 0,30, 0,40, 0,45, 0,50, 0,70. Finishes: none, matt, W matt, Cr matt, W,
  matt (V/Q/H). Units: m² everywhere except Dastera, per piece.

## Decisions, and why

1. **Reference table, not four free columns with a CHECK.** `public.sheet_options` holds one row
   per combination; products carry `sheet_model`, `sheet_series`, `sheet_thickness_mm`,
   `sheet_finish` with an all-or-none check and a composite foreign key to the table. A
   combination off the list cannot be stored by any writer, and G13d has a table to join
   prices against.
2. **finish is `''` where the list has none**, never null, so the foreign key is always
   checked.
3. **The two shared price lines are split.** "PK/PS-20, VP-20" and "Monterrey, Valencia" are one
   CSV line each but four profiles in Max's list, stocked separately. 194 lines become 225 rows;
   `price_group` keeps the CSV text so G13d still matches exactly 194 prices.
4. **The CSV is the tie-breaker**, as the task says. Series are named as the CSV names them.
   Dastera fills unit buc. **Foaie în folie is offered** although Max's written list does not
   name it: the task requires that nothing on the verified CSV be unreachable, and the CSV
   already gives the Romanian name, so nothing had to be guessed. It is named to the owner in
   the merge question; hiding it later is a small migration that touches no product.
5. **Columns named `sheet_*`.** `check:pending-schema-reads` flags any source file that names a
   new column as a whole word without importing a guard, and "model" appears across the
   extraction code, which is Orange's and may not be edited.
6. **Existing category and supplier mechanisms.** The "Acoperișuri și tablă" row from migration
   0007, found by name; supplier Dasterum through the creatable supplier field, which finds or
   creates it by name. No new category, no second system.
7. **Picker on the new product form only.** `updateProduct` never writes the four columns, so an
   edit cannot clear the pick. The check that the combination exists runs before
   `resolveSupplier`, so a refused pick writes neither the product nor a supplier.
8. **Product name.** "Tablă cutată" before the ten profiled sheet models, "Țiglă metalică" before
   Monterrey, Valencia and Kascad, nothing before Dastera, Tablă netedă and Foaie în folie, then
   model, series, thickness and finish. The operator can change it.

## EXECUTOR step, files

- `supabase/migrations/0046_sheet_options.sql` (new): the table, 225 rows, RLS and grants, the
  four product columns, both constraints, a DO block counting 225 rows, 16 models, 194 price
  lines and the units. 27 statements, no DROP, TRUNCATE or DELETE.
- `scripts/poc-free/local-db/assertions/0046_sheet_options.sql` (new): shape, the list at the
  points where it is specific (T-12 has no Econom, H-57 one row, C-10 Econom's four
  thicknesses, one per-piece row, the split lines), accepted and refused product combinations
  (foreign key and check), owner reads 225 and cannot insert or update, anon cannot read.
- `docs/migrations/APPLY-LOG.md`: pending line `0046_sheet_options.sql`, card de aplicare P3-57.
- `lib/data/schema-capability.ts`: `hasSheetOptions`, one probe on the four product columns,
  same shape as `hasProductImage`.
- `lib/data/sheet-options-types.ts` (new): the option and choice types, supplier and category
  names, thickness labels and the name builder. Shared by browser and server.
- `lib/data/sheet-options.ts` (new): `listSheetOptions`, gated by `hasSheetOptions`, empty until
  0046 is applied.
- `lib/data/product-actions.ts`: `ProductInput.sheet`, `validateSheet`, `sheetColumns` (probe
  plus lookup in the list), `createProduct` writes the four columns.
- `app/(app)/inventar/page.tsx`, `components/inventory/InventoryScreen.tsx`: load the list and
  pass it to the new product form.
- `components/inventory/ProductForm.tsx`: the Model, Serie, Grosime lists and the prefill.
- `tests/e2e/roofing-product-picker.spec.ts` (new): the card's three cases.

## Commands run locally, all exit 0

`npx tsc --noEmit`, `npm run build`, the board validator on all three boards,
`check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`
(1 file, 27 statements), `check:conflict-residue`, `check:categories`, `check:ledger-rows`,
`check:no-prod-target`, `check:pending-schema-reads` (3 pending migrations),
`check:removal-safety`, `check:assertion-register`, `check:board-edit` (after the shipped flip).

**Left for CI**, because this machine has no Docker and no Supabase CLI:
`npm run check:migrations` (applies 0046 and runs its assertion file), `npm run prove:applier`,
`npm run prove:assertions`, and the Playwright suite including the acceptance spec. Their result
on the head sha is recorded in the pull request and in the owner question, not here, because
writing it here would move the head sha.

## Defects found

None while building. `docs/LEARNINGS.md` is untouched in this commit; if CI turns red, the
signature and its fix are appended there in the fixing commit.

## Left for the owner

- Approve the merge (pre-approved by Max; POC verifies and merges).
- Confirm "Foaie în folie" belongs in the picker, and that Dastera per piece is right.
- G13d, loading the Dasterum prices, is next and is not pre-approved.
