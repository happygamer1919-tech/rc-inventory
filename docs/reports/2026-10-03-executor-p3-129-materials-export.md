# P3-129: materials export to CSV (EXECUTOR, lane B, BLUE)

Date: 2026-10-03. Card: P3-129. Branch: `card/p3-129`. No migration.

## What changed for Rapid Construct

The Inventar screen has an `Exportă CSV` button (administrator only, between `Importă din CSV` and `Adaugă produs`).
It saves what the operator is looking at, with search, category, supplier, stock level and active/inactive filters,
as `materiale.csv`. All rows of the filter are written, not only what fits on screen, up to 5000; past that a
Romanian sentence says the file was cut. The columns are the materials import template's, the unit is written the
way the template's example row writes it, and the file loads straight back into the materials import. Stock is not
in the file.

## Files

- `lib/data/material-export-actions.ts`: `exportMaterials`, owner only. Reads through `listProducts` (the page's own
  read, no new query), chooses rows with `filterProducts`, caps at 5000.
- `lib/data/material-export-types.ts`: `materialModelHeaders`, `materialExportCsv`, `exportNumber`,
  `materialExportTruncatedNotice`, `MATERIAL_EXPORT_FILE_NAME`.
- `lib/data/product-filter.ts`: the screen's five filters as pure functions. The body is the screen's old
  `useMemo` bodies, moved. The screen and the export both call it, so the file cannot be a different view.
- `components/inventory/InventoryScreen.tsx`: uses `filterByVisibility` and `filterByRest`; the button
  (`products-export`), notice and error lines; `data-testid` on the supplier and level selects (tests only).
- `components/inventory/MaterialImportSheet.tsx`: `download` is now exported (same body).
- `docs/board/rc-board-phase3.json`: P3-129 shipped.
- `tests/e2e/materials-export.spec.ts`: the six named cases plus one for all rows.
- Not touched: `lib/data/units.ts`, the four imports and three exports and their specs, `ProductForm`,
  `import-shared.ts`, `components/ui/primitives.tsx`, any migration.

## Decisions

1. **Unit as the on-screen label.** `material-import-types.ts` writes its example unit as `unitLabel("pcs")`, so the
   model's form is the label (`buc`, `m²`). `readUnit` accepts label or code. The export writes `unitLabel(unit)`,
   no list, no conversion. The unit case checks all nine against a hand-written list.
2. **Stock left out of the file.** Stock is computed from batches and the import has no stock field, so any
   quantity column would look editable and be ignored. The file has exactly the six model columns. `Prag recomandă`
   is a threshold and is written. The stock case edits threshold and value on every row, re-imports, and asserts
   batches, issues and the on-screen stock are unchanged.
3. **Category by name**, the form `buildCategoryLookup` resolves. **Numbers** as plain digits with a point
   (`12500.5`), which `readNumber` reads; zero is written as `0`, which the import stores as zero.
4. **Round trip** re-imports the untouched file (all duplicates by SKU, zero errors), then the file with SKU moved to
   a second series and category and unit untouched, and compares every stored field.
5. **Shared filter.** The filtering lives on the client, so the action takes the screen's five filter values and
   applies the same function. Unknown values fall back to the screen's defaults.

## Known limits, not fixed here

- `listProducts` reads through PostgREST with `max_rows = 1000` (`supabase/config.toml`), so the list, and so the
  export, sees at most 1000 products whatever the 5000 limit says. The screen has the same ceiling today. Fixing it
  means paging `listProducts`, which every screen uses, so it is a separate card.
- Two categories with the same name: the import refuses their rows (`ambiguousCategory`), so the round trip holds
  over distinct category names.
- The end to end suite needs Docker and runs only in CI.

## Local gates

Run from the worktree. `tsc --noEmit`, `npm run build`, the board validator and every `check:*` script in the
close-out list exit 0 (`check:board-edit` reports "not a pull request" until the branch is pushed). The
end to end suite runs only in CI.
