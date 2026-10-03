# P3-125: materials import from CSV (EXECUTOR, lane B, BLUE)

Date: 2026-10-03. Card: P3-125. Branch: `card/p3-125`. No migration.

## What changed for Rapid Construct

The Inventar screen has an `Importă din CSV` button and a `Descarcă modelul de import` link. The owner uploads
a CSV of products, sees what was read (new, duplicate, with errors) before anything is saved, then confirms.
Unusable rows come back as a file with a `Motiv` column. A unit must be one of the nine the platform uses;
`set`, `cutie`, `palet` and `bax` are refused as units by name. A product that has already moved never has its
unit changed by a file.

## Files

- `lib/data/material-import-types.ts`: fields, labels, synonyms, unit reading, descriptor, preview, model, text.
- `lib/data/material-import-plan.ts`: dedupe on SKU, or name plus unit; unit rule; new / duplicate / error.
- `lib/data/material-import-actions.ts`: `planMaterialImport` (writes nothing) and `runMaterialImport`.
- `lib/data/product-movement.ts`: the one definition of "a product has moved", moved out of `updateProduct`.
- `lib/data/product-actions.ts`: `updateProduct` now calls `productHasMovements`. Behaviour identical.
- `components/inventory/MaterialImportSheet.tsx`: the four-step panel, same shape as the projects one.
- `components/inventory/InventoryScreen.tsx`: the button, the template link, the panel mount.
- `tests/e2e/materials-import.spec.ts`: the named cases.
- Not touched: `import-shared.ts`, `units.ts`, `ProductForm.tsx`, the lead, clients and projects modules and
  specs, any migration.

## Drafter's decisions, as built

1. **SKU is a match key, never invented.** `products.sku` is NOT NULL and unique. A row without a SKU that
   matches one stored product on name plus unit is a duplicate; one that matches nothing is a row error asking
   for a SKU; one that matches several stored products is a row error asking for the SKU. The model marks Cod
   SKU required because a new product needs it.
2. **Category must exist.** Unknown, or named by several categories, is a row error. None is created.
3. **Currency.** No currency column on products. A `Monedă` column with EUR or RON is refused in the preview
   with `Moneda "EUR" nu este acceptată. Platforma ține evidența numai în MDL.` and dropped. Not in the model.
4. **Package columns, supplier: left out of the model.** Supplier would silently create a supplier from a
   typo (`resolveSupplier`); the package pair must be complete (0035). Both stay on the product form.

## Other decisions

- **Units.** Read from `ALL_UNITS` by stored code or by on-screen label (`m²`, `buc`, `rolă`). Local key with
  NFKD so `m²` and `m³` do not collide. The accepted list in reasons and on screen is built from `ALL_UNITS`.
  No conversion anywhere.
- **Moved products.** SKU found, unit differs, product has movements: row error, stored unit stays, the row is
  in the error file. SKU found, unit differs, product has not moved: duplicate (skip or fill), and the unit is
  still never written; the duplicate line says the file's unit differed and stayed unchanged.
- **Fill empty fields** touches only `threshold` and `unit_value_mdl`, and only where the stored value is 0
  (the NOT NULL default) and the file value is above 0. Name, category and unit are never filled.
- **Dedupe keys** are lowercase. The database SKU constraint is case sensitive, so the plan is stricter than it
  and can only skip more.
- **Write path.** New products go through `createProduct`, the same path as the form, one insert per row.
- Existing tables are read in pages of 1000.

## Verification

No database or Docker here, so the end to end suite runs only in CI. Local gates are listed in the PR body.
Named cases in `tests/e2e/materials-import.spec.ts` cover acceptance (a) to (g); (h) is `tsc`, `build` and the
dash grep. Two extra cases cover fill-empty and the model file plus on-screen instructions.

## Left for the owner

Nothing blocking. Merge approval goes through the mailbox, since real client data is in production.
