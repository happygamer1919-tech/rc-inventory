# EXECUTOR report, 2026-09-17, card P3-69, the 80 new roofing materials

Operator factory task for goal G25 (owner Max, 2026-09-16: "trebuie de bagat acestea ca
materiale in platforma"). One session, AUTHOR then EXECUTOR, one branch `card/p3-69`, one pull
request. **The merge is NOT pre-approved**: real client data is in production, so the session
stops at an owner question and POC merges only after Max says "merge" in chat.

## In plain words, for Rapid Construct

Once merged, the catalog gains 80 roofing materials with their partner price: 8 metal tiles
(Roofart/Bilka), 3 stone-coated metal tiles (Novatik), 2 ceramic tiles (Creaton), 2 bituminous
shingles (IKO), 14 parts of the 125/90 gutter system (no supplier named on that list) and 51 parts
of the Roofart/Bilka gutter system from Dasterum's photographed list (supplier Dasterum). They sit
in six new categories. Each product's panel says which price list it came from. Nothing already in
the catalog changes. They start at zero stock with a zero threshold, like any new product.

## Boot status at the start

- Role stated: AUTHOR, then EXECUTOR.
- Phase 2 board: 68 shipped, 32 todo, 2 blocked, 0 in flight, 0 halted. Launch gate 6/9.
- Phase 3 board: 83 shipped, 32 todo, 1 blocked, 0 in flight, 0 halted. Launch gate 0/9.
- Next eligible by lowest id: AUT-3. This session works the new card the owner's task names.
- `gh pr list --state open --author @me`: empty at the start.

## Cards touched

- **P3-69**, authored, in flight, shipped in this pull request. Id allocated with
  `npm run id:free -- P3-69`, which answered FREE (lane highest P3-68; origin holds
  `card/p3-67` for another factory task).

## Step 0: the re-check, run before anything was loaded

The CSV (`inputs/materiale-noi-2026-09-16-verificat.csv`, 81 stray `\r` characters stripped) was
read line by line against its four sources in the factory's `inputs/g25-sources/`, the three PDFs
viewed as page images and the photo viewed directly.

| Source | CSV rows | Result |
|---|---|---|
| `pret parteneri.pdf` | 8 Țiglă metalică | every name, list price and partner price matches |
| `pret roca,Ceramica,sindrila.pdf` | 3 Novatik, 2 Creaton, 2 IKO | every price matches; the 8,4 and 8,2 buc/m² notes match; page 2 names the brands Creaton and IKO for the rows the table writes as Balance, Rapido, Cambridge Xpress, Superglass Hex |
| `sistem scurgere .pdf` | 14 Sistem de scurgere | every partner and client price matches, across both pages |
| `dasterum-lista-27-03-2025-randuri-49-63.jpeg` | 51 Sistem de scurgere Roofart/Bilka | rows 49 to 63, every RAL Ø125/87, RAL Ø150/100, AlZn Ø125/87 and Zn Ø150/100 cell matches; the dashes on the photo (no price) are exactly the combinations the CSV leaves out; unit шт. is buc |

**No mismatch was found.** Cosmetic differences only, none of them a price, unit or product:
the PDF writes `FINN 2.0  UTK` and `ZET  UTK` with a double space; the gutter PDF writes `Braţara`
and `Ramificaţie` with a cedilla ţ where the CSV has the comma ț; the photo's Russian names are
translated into Romanian in the CSV (Желоб to Jgheab, Хомут to Colier, and so on).

Independently recomputed: **80 data rows, `pret_partener_lei` sums to 12842.88** (8 rows 1859,
3 rows 574, 2 rows 87, 2 rows 433, 14 rows 1833.88, 51 rows 8056).

## Decisions, and why

(a) **The column is `products.source_note`, not `products.notes`.** `check:pending-schema-reads`
looks for a pending column name as a whole word in every source file, and `notes` already appears
in seventeen client, contact, project and deviz files, the components among them importing no
capability gate. A column named `notes` would have failed that gate on files that never read
products. The content is exactly what the task asks: the list's note, then `Sursă: ` and the source.

(b) **Units:** `m²` is the existing unit code `m2`, `buc` is `pcs`. No unit invented.

(c) **Category names carry their diacritics** (CLAUDE.md 11): `Țiglă metalică cu rocă vulcanică`,
`Țiglă ceramică`, `Șindrilă bituminoasă`, as the source PDF's own headings spell them; the CSV had
typed those three without. The other three are the CSV's verbatim. Sort orders 20 to 25. Product
names are the CSV's verbatim. The owner can rename a category later with no migration.

(d) **Suppliers are records** since P3-05b. Each brand is matched the way the product form matches
a typed supplier (`public.fold_text` on the name, active first, then oldest) and inserted only when
no match exists. Proven locally: a pre-existing `DASTERUM` supplier was reused, not duplicated.

(e) **Brand check:** every Novatik, Creaton and IKO row's `denumire` starts with its brand, checked
by the generator before any SQL was written.

(f) **The load's marker** is the SKU shape `^(TM|TMRV|TC|SB|SS|SSRB)-[0-9]{3}$` AND a `Sursă: ` note.
The shape alone would count a hand-added product such as `SS-100` and stop the load in production
for no reason; with the note, such a product is ignored (proven locally), while a product that
already held one of the 80 SKUs leaves the marked count at 79 and the migration rolls back whole.

(g) **Outbound pricing finding:** the outbound screen already lets the operator type a sale price
on each line when the outbound is created (`issue-price-N`, stored in
`outbound_lines.sale_price_mdl`). **No follow-up card is needed.**

## The 80 generated SKUs

Prefixes: TM Țiglă metalică, TMRV Țiglă metalică cu rocă vulcanică, TC Țiglă ceramică,
SB Șindrilă bituminoasă, SS Sistem de scurgere, SSRB Sistem de scurgere Roofart/Bilka. In the
CSV's order, sequential within each category.

| SKU | Denumire | Categorie | Unitate | Preț partener (lei) | Furnizor |
|---|---|---|---|---|---|
| TM-001 | BARCELONA ECO 0.45 | Țiglă metalică | m² | 129 | Roofart/Bilka |
| TM-002 | BARCELONA 0.5 | Țiglă metalică | m² | 149 | Roofart/Bilka |
| TM-003 | MADRID 2.0/30 MAT 0.5 | Țiglă metalică | m² | 169 | Roofart/Bilka |
| TM-004 | BAVARIA 2.0/40 UTK | Țiglă metalică | m² | 221 | Roofart/Bilka |
| TM-005 | FINN 2.0 UTK | Țiglă metalică | m² | 221 | Roofart/Bilka |
| TM-006 | HETA 2.0 UTK | Țiglă metalică | m² | 232 | Roofart/Bilka |
| TM-007 | ZET UTK | Țiglă metalică | m² | 336 | Roofart/Bilka |
| TM-008 | IZI UTK 24 | Țiglă metalică | m² | 402 | Roofart/Bilka |
| TMRV-001 | NOVATIK CLASSIC | Țiglă metalică cu rocă vulcanică | m² | 185 | Novatik |
| TMRV-002 | NOVATIK SLATE | Țiglă metalică cu rocă vulcanică | m² | 204 | Novatik |
| TMRV-003 | NOVATIK ROMAN | Țiglă metalică cu rocă vulcanică | m² | 185 | Novatik |
| TC-001 | Creaton Balance | Țiglă ceramică | buc | 43 | Creaton |
| TC-002 | Creaton Rapido | Țiglă ceramică | buc | 44 | Creaton |
| SB-001 | IKO Cambridge Xpress | Șindrilă bituminoasă | m² | 258 | IKO |
| SB-002 | IKO Superglass Hex | Șindrilă bituminoasă | m² | 175 | IKO |
| SS-001 | 125/90 MAT Jgheab Semicircular L-3000 | Sistem de scurgere | buc | 213.68 | (niciunul) |
| SS-002 | 125/90 MAT Brațara Jgheab | Sistem de scurgere | buc | 45.6 | (niciunul) |
| SS-003 | 125/90 MAT Capac Universal | Sistem de scurgere | buc | 33.26 | (niciunul) |
| SS-004 | 125/90 MAT Coltar Exterior 90° | Sistem de scurgere | buc | 212.98 | (niciunul) |
| SS-005 | 125/90 MAT Coltar Interior 90° | Sistem de scurgere | buc | 212.98 | (niciunul) |
| SS-006 | 125/90 MAT Cirlig Jgheab | Sistem de scurgere | buc | 50.4 | (niciunul) |
| SS-007 | 125/90 MAT Cirlig Pazie Universal | Sistem de scurgere | buc | 36.77 | (niciunul) |
| SS-008 | 125/90 MAT Racord Jgheab | Sistem de scurgere | buc | 94.8 | (niciunul) |
| SS-009 | 125/90 MAT Cot Burlan 60° | Sistem de scurgere | buc | 94.8 | (niciunul) |
| SS-010 | 125/90 MAT Prelungitor Burlan L-1000 | Sistem de scurgere | buc | 89.22 | (niciunul) |
| SS-011 | 125/90 MAT Burlan Circular L-3000 | Sistem de scurgere | buc | 267.71 | (niciunul) |
| SS-012 | 125/90 MAT Brațara Burlan | Sistem de scurgere | buc | 34.28 | (niciunul) |
| SS-013 | 125/90 MAT Ramificație Burlan | Sistem de scurgere | buc | 351 | (niciunul) |
| SS-014 | 125/90 MAT Cot Evacuare 60° | Sistem de scurgere | buc | 96.4 | (niciunul) |
| SSRB-001 | Jgheab L-4000 RAL Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 481 | Dasterum |
| SSRB-002 | Jgheab L-4000 AlZn Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 302 | Dasterum |
| SSRB-003 | Jgheab L-3000 RAL Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 420 | Dasterum |
| SSRB-004 | Jgheab L-3000 Zn Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 295 | Dasterum |
| SSRB-005 | Jgheab L-2000 RAL Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 240 | Dasterum |
| SSRB-006 | Jgheab L-2000 AlZn Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 172 | Dasterum |
| SSRB-007 | Colier jgheab RAL Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 65 | Dasterum |
| SSRB-008 | Colier jgheab RAL Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 72 | Dasterum |
| SSRB-009 | Colier jgheab AlZn Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 58 | Dasterum |
| SSRB-010 | Colier jgheab Zn Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 55 | Dasterum |
| SSRB-011 | Capac universal RAL Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 58 | Dasterum |
| SSRB-012 | Capac universal RAL Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 62 | Dasterum |
| SSRB-013 | Capac universal AlZn Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 36 | Dasterum |
| SSRB-014 | Capac universal Zn Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 33 | Dasterum |
| SSRB-015 | Cârlig universal RAL Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 65 | Dasterum |
| SSRB-016 | Cârlig universal RAL Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 70 | Dasterum |
| SSRB-017 | Cârlig universal AlZn Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 52 | Dasterum |
| SSRB-018 | Cârlig universal Zn Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 40 | Dasterum |
| SSRB-019 | Cârlig lung RAL Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 85 | Dasterum |
| SSRB-020 | Cârlig lung RAL Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 110 | Dasterum |
| SSRB-021 | Cârlig lung AlZn Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 69 | Dasterum |
| SSRB-022 | Cârlig lung Zn Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 83 | Dasterum |
| SSRB-023 | Cârlig reglabil RAL Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 49 | Dasterum |
| SSRB-024 | Colț exterior 90° / interior 90° RAL Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 361 | Dasterum |
| SSRB-025 | Colț exterior 90° / interior 90° RAL Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 446 | Dasterum |
| SSRB-026 | Colț exterior 90° / interior 90° AlZn Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 185 | Dasterum |
| SSRB-027 | Colț exterior 90° / interior 90° Zn Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 301 | Dasterum |
| SSRB-028 | Pâlnie jgheab RAL Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 167 | Dasterum |
| SSRB-029 | Pâlnie jgheab RAL Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 171 | Dasterum |
| SSRB-030 | Pâlnie jgheab AlZn Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 69 | Dasterum |
| SSRB-031 | Pâlnie jgheab Zn Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 76 | Dasterum |
| SSRB-032 | Cot burlan 60° RAL Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 162 | Dasterum |
| SSRB-033 | Cot burlan 60° RAL Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 174 | Dasterum |
| SSRB-034 | Cot burlan 60° AlZn Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 73 | Dasterum |
| SSRB-035 | Cot burlan 60° Zn Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 89 | Dasterum |
| SSRB-036 | Burlan L-1000 RAL Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 145 | Dasterum |
| SSRB-037 | Burlan L-1000 RAL Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 164 | Dasterum |
| SSRB-038 | Burlan L-1000 AlZn Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 107 | Dasterum |
| SSRB-039 | Burlan L-1000 Zn Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 115 | Dasterum |
| SSRB-040 | Burlan L-3000 RAL Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 429 | Dasterum |
| SSRB-041 | Burlan L-3000 RAL Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 479 | Dasterum |
| SSRB-042 | Burlan L-3000 AlZn Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 323 | Dasterum |
| SSRB-043 | Burlan L-3000 Zn Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 336 | Dasterum |
| SSRB-044 | Colier burlan RAL Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 59 | Dasterum |
| SSRB-045 | Colier burlan RAL Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 62 | Dasterum |
| SSRB-046 | Colier burlan AlZn Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 33 | Dasterum |
| SSRB-047 | Colier burlan Zn Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 40 | Dasterum |
| SSRB-048 | Cot evacuare RAL Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 163 | Dasterum |
| SSRB-049 | Cot evacuare RAL Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 176 | Dasterum |
| SSRB-050 | Cot evacuare AlZn Ø125/87 | Sistem de scurgere Roofart/Bilka | buc | 88 | Dasterum |
| SSRB-051 | Cot evacuare Zn Ø150/100 | Sistem de scurgere Roofart/Bilka | buc | 91 | Dasterum |

## EXECUTOR step, files

- `supabase/migrations/0049_roofing_materials.sql` (new): `source_note` column, six categories,
  brand suppliers where missing, 80 products, in-transaction assertion (80 marked rows, sum
  12842.88, and per category count, sum, unit and supplier), commit, verification selects.
  Statements: 10, no DROP TABLE, TRUNCATE, DELETE or UPDATE.
- `scripts/poc-free/local-db/assertions/0049_roofing_materials.sql` (new): shape, the six
  categories and a 25 total, ten hand-written rows over every shape of the list, supplier and unit
  counts, one supplier per brand, and a re-run adding nothing and changing no price.
- `scripts/poc-free/local-db/assertions/0029_category_paints.sql`: amended under CLAUDE.md 9c; it
  asserted 19 categories in total and the paints category as last. Both sentences are quoted and
  kept; it now asserts its own nineteen and the paints category at sort_order 19, and the total
  moved to the 0049 file.
- `scripts/poc-free/check-categories.mjs` and `docs/contracts/categories.json`: 0049 added to the
  explicit list, 25 entries.
- `docs/migrations/APPLY-LOG.md`: pending register line for 0049.
- `lib/data/schema-capability.ts`: `hasProductSourceNote`, the column probe.
- `lib/data/products.ts`: reads `source_note` only when the probe says yes; `CatalogProduct.sourceNote`.
- `components/inventory/ProductPanel.tsx`: shows the source note (`panel-source-note`) when present.
- `tests/e2e/load-80-materials.spec.ts` (new): the card's four acceptance cases.
- `scripts/poc-free/check-board-edit.mjs`, `check-board-clock.mjs`, `check-open-branch-ids.mjs`:
  `maxBuffer` 64 MiB, because this card's entry took the phase 3 board past 1 MiB (see Defects).
- `docs/board/rc-board-phase3.json`: the card, todo, in_flight, shipped.

## Commands run locally

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| board validator, all three boards | PASS before every commit except d847ac6 (see Defects) |
| `npm run check:card-ids` | exit 0 |
| `npm run check:board-edit` | exit 1 while the card was in flight (expected); rerun after the shipped flip |
| `npm run check:unique-ids` | exit 0 |
| `npm run check:open-branch-ids` | exit 0 |
| `npm run check:no-destructive-migration` | exit 0, 1 file, 10 statements |
| `npm run check:conflict-residue` | exit 0 |
| `npm run check:categories` | exit 0, 25 |
| `npm run check:ledger-rows` | exit 0 |
| `npm run check:no-prod-target` | exit 0 |
| `npm run check:pending-schema-reads` | exit 0 |
| `npm run check:removal-safety` | exit 0 |
| `npm run check:assertion-register` | exit 0 |
| `npm run check:board-clock`, `check:card-order`, `check:board-app`, `check:reset-sql` | exit 0 |
| the prove and check scripts of `quality` that need no Docker (board-edit, open-branch-ids, unique-ids, claim-merge, live-fixtures, grant-revocation, executor-env, schema-direction, state-endpoint, document-url, page-count, reconciliation, extraction-budget, action-pins, no-destructive-migration) | all exit 0 |
| every migration and all 32 assertion files on a throwaway local postgres 17 (stand-in for `check:migrations`, no Docker here) | all passed; 0049 re-run clean |
| local: an existing `DASTERUM` supplier before 0049 | reused, not duplicated |
| local: a hand-added `SS-100` with no note, then 0049 re-run | ignored, re-run clean |
| mutation: one price changed, then 0049 re-run | refused: "the 80 partner prices sum to 12843.88, expected 12842.88" |
| mutation: `SS-001` held by a product that is not the list's, then 0049 re-run | refused: "79 products carry this load's marker" |
| mutation: a supplier removed from a branded line, then 0049 re-run | refused: "1 rows of prefix SB match ... expected 2" |

**Left for CI, because this machine has no Docker and no Supabase stack:** `npm run
check:migrations` on postgres 16, the migration applier proof, the proof that every applier
assertion can fail, and the whole Playwright suite including `load-80-materials.spec.ts`. The
Playwright acceptance was not run locally. Their results are read on the pull request's head sha
and quoted in the owner question.

## Defects found

Three, each appended to `docs/LEARNINGS.md`:

1. **The phase 3 board passed 1 MiB** with this card, and `check:board-clock`, `check:board-edit`
   and `check:open-branch-ids` read it with `execFileSync`'s 1 MiB default buffer (ENOBUFS). Fixed
   with an explicit 64 MiB buffer; nothing a check asserts changed. Every future board edit would
   have hit it.
2. **Commit d847ac6 was made while the board validator was red**, because the validator was piped
   into `tail` in the same command as the commit. Reverted by hand in c9887ce (`git revert` is not
   permitted in the operator factory), then re-committed green in a7220fb.
3. **A scripted SQL edit duplicated half the migration** through a `$'` in a JavaScript replacement
   string. The file was not yet committed; it was rebuilt and the whole local apply rerun.

## Left for the owner

- Approve or decline the merge ("merge" in chat). Merging applies 0049 to the live database within
  about two minutes: 80 new products in six new categories, up to five supplier records created
  only where none of that name exists, a new empty-by-default `source_note` column on products.
  INSERT only; no existing row is touched.
- If Mihai's live catalog already uses one of these 80 SKUs for a different product, the migration
  refuses and writes nothing. That is the safe failure, but it would need a new SKU prefix.
- Category spellings with diacritics (decision c) are a choice made here; say if the CSV's plain
  spelling was wanted instead.
- The 80 products start at stock 0 and threshold 0, so they show as out of stock until the first
  inbound, like any new product.
