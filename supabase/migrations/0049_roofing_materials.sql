-- 0049_roofing_materials.sql
-- RC Inventory phase 3, card P3-69. The 80 roofing materials of the owner's
-- verified list go into the catalog as products, with their partner price.
--
-- WHAT IT CHANGES, AND IT REMOVES NOTHING
--
--   column  public.products.source_note   text, nullable, new
--   rows    public.categories             up to 6 new rows, sort_order 20 to 25
--   rows    public.suppliers              up to 5 new rows, only a brand with no
--                                         supplier of the same folded name
--   rows    public.products               80 new rows, SKUs TM, TMRV, TC, SB, SS
--                                         and SSRB, three digits each
--
-- NO DELETE, NO DROP, NO TRUNCATE AND NO UPDATE RUN IN THIS FILE. Every row is
-- written by INSERT. No existing category, supplier or product row is touched, and
-- no existing price changes.
--
-- THE SOURCE IS ONE FILE. inputs/materiale-noi-2026-09-16-verificat.csv in the
-- operator's factory folder (80 data lines, checked by Max with POC on 2026-09-16,
-- no corrections), exported from materiale-noi-2026-09-16-verificat.xlsx. Before
-- this file was written every line was read again against its own source: the
-- three scanned price lists (pret parteneri.pdf, pret roca,Ceramica,sindrila.pdf,
-- sistem scurgere .pdf) and the photo of the Dasterum list of 27.03.2025, rows 49
-- to 63. No price, unit or name differed. Each line below is one CSV line in the
-- file's own order: denumire to name, categorie to category, unitate to unit,
-- pret_partener_lei to unit_value_mdl, and nota then sursa to source_note.
-- pret_lista_lei is not loaded: the inbound price is the supplier's price, and the
-- outbound price is typed on the outbound line when it is issued.
--
-- ===========================================================================
-- THE SIX DECISIONS THIS FILE CARRIES
-- ===========================================================================
--
-- 1. THE COLUMN IS source_note AND NOT notes. check:pending-schema-reads looks for
--    a pending column name as a whole word in every source file, and notes is
--    already a word in the client, contact, project and deviz files. The same trap
--    is named by 0048 decision (a) for an ordinary word.
--
-- 2. UNITS: m² is the unit code m2 and buc is pcs. Both exist since 0001 and the
--    app labels them m2 and buc. No unit is added.
--
-- 3. THE CATEGORY NAMES CARRY THEIR DIACRITICS, as CLAUDE.md 11 requires of every
--    string on screen and as the source PDF's own headings spell them. The CSV typed
--    three of them without: Tigla metalica cu roca vulcanica, Tigla ceramica and
--    Sindrila bituminoasa. The categories are rows (ruling R-018), so the owner can
--    rename one later with no migration.
--
-- 4. SUPPLIERS ARE RECORDS SINCE P3-05b. Each brand is matched exactly the way the
--    product form matches a typed supplier (public.find_supplier_by_folded_name):
--    the same public.fold_text on the name, an active row first, then the oldest.
--    A brand with no match is inserted. The 14 lines of sistem scurgere .pdf name
--    no brand and carry no supplier. The 51 photo lines are Dasterum's own list, so
--    their supplier is Dasterum although their category names Roofart/Bilka.
--
-- 5. THE SKU IS A PER CATEGORY PREFIX AND A THREE DIGIT NUMBER IN THE CSV'S ORDER:
--    TM Țiglă metalică, TMRV Țiglă metalică cu rocă vulcanică, TC Țiglă ceramică,
--    SB Șindrilă bituminoasă, SS Sistem de scurgere, SSRB Sistem de scurgere
--    Roofart/Bilka. That SKU shape together with a source_note is how section 5
--    finds exactly this load's rows and no other product.
--
-- 6. THE FILE IS RE-RUNNABLE, in the shape 0029 and 0047 use: add column if not
--    exists, categories on conflict (name) do nothing, a supplier only where none of
--    that folded name exists, products on conflict (sku) do nothing. A second run
--    writes no row, and section 5 holds on every run.
--
-- A PRODUCT THAT ALREADY CARRIES ONE OF THESE SKUS IS NOT OVERWRITTEN. Its insert
-- is skipped, section 5 then finds a row that is not this list's, raises, and the
-- whole file rolls back with nothing written. That is the intended failure: a
-- collision stops the load instead of mixing two products under one code.
--
-- ===========================================================================
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. It adds a column and
-- rows and removes nothing. The application code that reads the new column ships
-- in the same merge and asks first whether it exists (hasProductSourceNote in
-- lib/data/schema-capability.ts), so in the minutes between the code landing and
-- this file landing the catalog behaves exactly as it does today.
--
-- IT RUNS AS ONE TRANSACTION.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs
-- scripts/poc-free/local-db/assertions/0049_roofing_materials.sql.

begin;


-- ===========================================================================
-- 1. WHERE A PRODUCT CAME FROM
-- ===========================================================================

alter table public.products add column if not exists source_note text null;

comment on column public.products.source_note is
  'Free text naming where a product was loaded from: the note of its price list line, then Sursă: and the list. Null for a product added by hand. Written by migrations that load a verified list; card P3-69 is the first.';


-- ===========================================================================
-- 2. THE SIX CATEGORIES
-- ===========================================================================
--
-- After the nineteen of 0007 and 0029, in the order the list gives them.

insert into public.categories (name, sort_order)
values
  ('Țiglă metalică', 20),
  ('Țiglă metalică cu rocă vulcanică', 21),
  ('Țiglă ceramică', 22),
  ('Șindrilă bituminoasă', 23),
  ('Sistem de scurgere', 24),
  ('Sistem de scurgere Roofart/Bilka', 25)
on conflict (name) do nothing;


-- ===========================================================================
-- 3. THE FIVE BRANDS AS SUPPLIERS, ONLY WHERE NONE EXISTS
-- ===========================================================================

insert into public.suppliers (name)
select b.name
from (values
  ('Roofart/Bilka'),
  ('Novatik'),
  ('Creaton'),
  ('IKO'),
  ('Dasterum')
) as b(name)
where not exists (
  select 1 from public.suppliers s
  where public.fold_text(s.name) = public.fold_text(b.name)
);


-- ===========================================================================
-- 4. THE 80 PRODUCTS, IN THE ORDER OF THE VERIFIED LIST
-- ===========================================================================
--
-- Columns of each line: sku, name, category, unit, partner price in lei, supplier
-- brand (null for none), source_note.

insert into public.products (sku, name, category_id, unit, unit_value_mdl, supplier_id, source_note)
select
  v.sku,
  v.name,
  c.id,
  v.unit::public.unit_code,
  v.price::numeric(14,2),
  (
    select s.id from public.suppliers s
    where v.supplier is not null
      and public.fold_text(s.name) = public.fold_text(v.supplier)
    order by s.active desc, s.created_at
    limit 1
  ),
  v.source_note
from (values
  ('TM-001', 'BARCELONA ECO 0.45', 'Țiglă metalică', 'm2', 129, 'Roofart/Bilka', 'Sursă: pret parteneri.pdf'),
  ('TM-002', 'BARCELONA 0.5', 'Țiglă metalică', 'm2', 149, 'Roofart/Bilka', 'Sursă: pret parteneri.pdf'),
  ('TM-003', 'MADRID 2.0/30 MAT 0.5', 'Țiglă metalică', 'm2', 169, 'Roofart/Bilka', 'Sursă: pret parteneri.pdf'),
  ('TM-004', 'BAVARIA 2.0/40 UTK', 'Țiglă metalică', 'm2', 221, 'Roofart/Bilka', 'Sursă: pret parteneri.pdf'),
  ('TM-005', 'FINN 2.0 UTK', 'Țiglă metalică', 'm2', 221, 'Roofart/Bilka', 'Sursă: pret parteneri.pdf'),
  ('TM-006', 'HETA 2.0 UTK', 'Țiglă metalică', 'm2', 232, 'Roofart/Bilka', 'Sursă: pret parteneri.pdf'),
  ('TM-007', 'ZET UTK', 'Țiglă metalică', 'm2', 336, 'Roofart/Bilka', 'Sursă: pret parteneri.pdf'),
  ('TM-008', 'IZI UTK 24', 'Țiglă metalică', 'm2', 402, 'Roofart/Bilka', 'Sursă: pret parteneri.pdf'),
  ('TMRV-001', 'NOVATIK CLASSIC', 'Țiglă metalică cu rocă vulcanică', 'm2', 185, 'Novatik', 'Sursă: pret roca,Ceramica,sindrila.pdf'),
  ('TMRV-002', 'NOVATIK SLATE', 'Țiglă metalică cu rocă vulcanică', 'm2', 204, 'Novatik', 'Sursă: pret roca,Ceramica,sindrila.pdf'),
  ('TMRV-003', 'NOVATIK ROMAN', 'Țiglă metalică cu rocă vulcanică', 'm2', 185, 'Novatik', 'Sursă: pret roca,Ceramica,sindrila.pdf'),
  ('TC-001', 'Creaton Balance', 'Țiglă ceramică', 'pcs', 43, 'Creaton', '8,4 buc/m² · Sursă: pret roca,Ceramica,sindrila.pdf'),
  ('TC-002', 'Creaton Rapido', 'Țiglă ceramică', 'pcs', 44, 'Creaton', '8,2 buc/m² · Sursă: pret roca,Ceramica,sindrila.pdf'),
  ('SB-001', 'IKO Cambridge Xpress', 'Șindrilă bituminoasă', 'm2', 258, 'IKO', 'Sursă: pret roca,Ceramica,sindrila.pdf'),
  ('SB-002', 'IKO Superglass Hex', 'Șindrilă bituminoasă', 'm2', 175, 'IKO', 'Sursă: pret roca,Ceramica,sindrila.pdf'),
  ('SS-001', '125/90 MAT Jgheab Semicircular L-3000', 'Sistem de scurgere', 'pcs', 213.68, null, 'Sursă: sistem scurgere .pdf'),
  ('SS-002', '125/90 MAT Brațara Jgheab', 'Sistem de scurgere', 'pcs', 45.6, null, 'Sursă: sistem scurgere .pdf'),
  ('SS-003', '125/90 MAT Capac Universal', 'Sistem de scurgere', 'pcs', 33.26, null, 'Sursă: sistem scurgere .pdf'),
  ('SS-004', '125/90 MAT Coltar Exterior 90°', 'Sistem de scurgere', 'pcs', 212.98, null, 'Sursă: sistem scurgere .pdf'),
  ('SS-005', '125/90 MAT Coltar Interior 90°', 'Sistem de scurgere', 'pcs', 212.98, null, 'Sursă: sistem scurgere .pdf'),
  ('SS-006', '125/90 MAT Cirlig Jgheab', 'Sistem de scurgere', 'pcs', 50.4, null, 'Sursă: sistem scurgere .pdf'),
  ('SS-007', '125/90 MAT Cirlig Pazie Universal', 'Sistem de scurgere', 'pcs', 36.77, null, 'Sursă: sistem scurgere .pdf'),
  ('SS-008', '125/90 MAT Racord Jgheab', 'Sistem de scurgere', 'pcs', 94.8, null, 'Sursă: sistem scurgere .pdf'),
  ('SS-009', '125/90 MAT Cot Burlan 60°', 'Sistem de scurgere', 'pcs', 94.8, null, 'Sursă: sistem scurgere .pdf'),
  ('SS-010', '125/90 MAT Prelungitor Burlan L-1000', 'Sistem de scurgere', 'pcs', 89.22, null, 'Sursă: sistem scurgere .pdf'),
  ('SS-011', '125/90 MAT Burlan Circular L-3000', 'Sistem de scurgere', 'pcs', 267.71, null, 'Sursă: sistem scurgere .pdf'),
  ('SS-012', '125/90 MAT Brațara Burlan', 'Sistem de scurgere', 'pcs', 34.28, null, 'Sursă: sistem scurgere .pdf'),
  ('SS-013', '125/90 MAT Ramificație Burlan', 'Sistem de scurgere', 'pcs', 351, null, 'Sursă: sistem scurgere .pdf'),
  ('SS-014', '125/90 MAT Cot Evacuare 60°', 'Sistem de scurgere', 'pcs', 96.4, null, 'Sursă: sistem scurgere .pdf'),
  ('SSRB-001', 'Jgheab L-4000 RAL Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 481, 'Dasterum', 'cod JB, lista Dasterum 27.03.2025 nr 49 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-002', 'Jgheab L-4000 AlZn Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 302, 'Dasterum', 'cod JB, lista Dasterum 27.03.2025 nr 49 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-003', 'Jgheab L-3000 RAL Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 420, 'Dasterum', 'cod JB, lista Dasterum 27.03.2025 nr 50 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-004', 'Jgheab L-3000 Zn Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 295, 'Dasterum', 'cod JB, lista Dasterum 27.03.2025 nr 50 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-005', 'Jgheab L-2000 RAL Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 240, 'Dasterum', 'cod JB, lista Dasterum 27.03.2025 nr 51 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-006', 'Jgheab L-2000 AlZn Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 172, 'Dasterum', 'cod JB, lista Dasterum 27.03.2025 nr 51 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-007', 'Colier jgheab RAL Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 65, 'Dasterum', 'cod BJ, lista Dasterum 27.03.2025 nr 52 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-008', 'Colier jgheab RAL Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 72, 'Dasterum', 'cod BJ, lista Dasterum 27.03.2025 nr 52 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-009', 'Colier jgheab AlZn Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 58, 'Dasterum', 'cod BJ, lista Dasterum 27.03.2025 nr 52 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-010', 'Colier jgheab Zn Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 55, 'Dasterum', 'cod BJ, lista Dasterum 27.03.2025 nr 52 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-011', 'Capac universal RAL Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 58, 'Dasterum', 'cod CU, lista Dasterum 27.03.2025 nr 53 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-012', 'Capac universal RAL Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 62, 'Dasterum', 'cod CU, lista Dasterum 27.03.2025 nr 53 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-013', 'Capac universal AlZn Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 36, 'Dasterum', 'cod CU, lista Dasterum 27.03.2025 nr 53 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-014', 'Capac universal Zn Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 33, 'Dasterum', 'cod CU, lista Dasterum 27.03.2025 nr 53 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-015', 'Cârlig universal RAL Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 65, 'Dasterum', 'cod CPU, lista Dasterum 27.03.2025 nr 54 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-016', 'Cârlig universal RAL Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 70, 'Dasterum', 'cod CPU, lista Dasterum 27.03.2025 nr 54 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-017', 'Cârlig universal AlZn Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 52, 'Dasterum', 'cod CPU, lista Dasterum 27.03.2025 nr 54 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-018', 'Cârlig universal Zn Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 40, 'Dasterum', 'cod CPU, lista Dasterum 27.03.2025 nr 54 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-019', 'Cârlig lung RAL Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 85, 'Dasterum', 'cod CJL, lista Dasterum 27.03.2025 nr 55 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-020', 'Cârlig lung RAL Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 110, 'Dasterum', 'cod CJL, lista Dasterum 27.03.2025 nr 55 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-021', 'Cârlig lung AlZn Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 69, 'Dasterum', 'cod CJL, lista Dasterum 27.03.2025 nr 55 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-022', 'Cârlig lung Zn Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 83, 'Dasterum', 'cod CJL, lista Dasterum 27.03.2025 nr 55 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-023', 'Cârlig reglabil RAL Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 49, 'Dasterum', 'cod CRG, lista Dasterum 27.03.2025 nr 56 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-024', 'Colț exterior 90° / interior 90° RAL Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 361, 'Dasterum', 'cod KE / KI, lista Dasterum 27.03.2025 nr 57 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-025', 'Colț exterior 90° / interior 90° RAL Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 446, 'Dasterum', 'cod KE / KI, lista Dasterum 27.03.2025 nr 57 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-026', 'Colț exterior 90° / interior 90° AlZn Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 185, 'Dasterum', 'cod KE / KI, lista Dasterum 27.03.2025 nr 57 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-027', 'Colț exterior 90° / interior 90° Zn Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 301, 'Dasterum', 'cod KE / KI, lista Dasterum 27.03.2025 nr 57 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-028', 'Pâlnie jgheab RAL Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 167, 'Dasterum', 'cod RA, lista Dasterum 27.03.2025 nr 58 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-029', 'Pâlnie jgheab RAL Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 171, 'Dasterum', 'cod RA, lista Dasterum 27.03.2025 nr 58 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-030', 'Pâlnie jgheab AlZn Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 69, 'Dasterum', 'cod RA, lista Dasterum 27.03.2025 nr 58 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-031', 'Pâlnie jgheab Zn Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 76, 'Dasterum', 'cod RA, lista Dasterum 27.03.2025 nr 58 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-032', 'Cot burlan 60° RAL Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 162, 'Dasterum', 'cod CB, lista Dasterum 27.03.2025 nr 59 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-033', 'Cot burlan 60° RAL Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 174, 'Dasterum', 'cod CB, lista Dasterum 27.03.2025 nr 59 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-034', 'Cot burlan 60° AlZn Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 73, 'Dasterum', 'cod CB, lista Dasterum 27.03.2025 nr 59 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-035', 'Cot burlan 60° Zn Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 89, 'Dasterum', 'cod CB, lista Dasterum 27.03.2025 nr 59 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-036', 'Burlan L-1000 RAL Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 145, 'Dasterum', 'cod BU, lista Dasterum 27.03.2025 nr 60 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-037', 'Burlan L-1000 RAL Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 164, 'Dasterum', 'cod BU, lista Dasterum 27.03.2025 nr 60 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-038', 'Burlan L-1000 AlZn Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 107, 'Dasterum', 'cod BU, lista Dasterum 27.03.2025 nr 60 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-039', 'Burlan L-1000 Zn Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 115, 'Dasterum', 'cod BU, lista Dasterum 27.03.2025 nr 60 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-040', 'Burlan L-3000 RAL Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 429, 'Dasterum', 'cod BU, lista Dasterum 27.03.2025 nr 61 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-041', 'Burlan L-3000 RAL Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 479, 'Dasterum', 'cod BU, lista Dasterum 27.03.2025 nr 61 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-042', 'Burlan L-3000 AlZn Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 323, 'Dasterum', 'cod BU, lista Dasterum 27.03.2025 nr 61 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-043', 'Burlan L-3000 Zn Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 336, 'Dasterum', 'cod BU, lista Dasterum 27.03.2025 nr 61 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-044', 'Colier burlan RAL Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 59, 'Dasterum', 'cod BB, lista Dasterum 27.03.2025 nr 62 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-045', 'Colier burlan RAL Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 62, 'Dasterum', 'cod BB, lista Dasterum 27.03.2025 nr 62 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-046', 'Colier burlan AlZn Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 33, 'Dasterum', 'cod BB, lista Dasterum 27.03.2025 nr 62 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-047', 'Colier burlan Zn Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 40, 'Dasterum', 'cod BB, lista Dasterum 27.03.2025 nr 62 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-048', 'Cot evacuare RAL Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 163, 'Dasterum', 'cod CE, lista Dasterum 27.03.2025 nr 63 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-049', 'Cot evacuare RAL Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 176, 'Dasterum', 'cod CE, lista Dasterum 27.03.2025 nr 63 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-050', 'Cot evacuare AlZn Ø125/87', 'Sistem de scurgere Roofart/Bilka', 'pcs', 88, 'Dasterum', 'cod CE, lista Dasterum 27.03.2025 nr 63 · Sursă: poza lista Dasterum 27.03.2025'),
  ('SSRB-051', 'Cot evacuare Zn Ø150/100', 'Sistem de scurgere Roofart/Bilka', 'pcs', 91, 'Dasterum', 'cod CE, lista Dasterum 27.03.2025 nr 63 · Sursă: poza lista Dasterum 27.03.2025')
) as v(sku, name, category, unit, price, supplier, source_note)
join public.categories c on c.name = v.category
on conflict (sku) do nothing;


-- ===========================================================================
-- 5. EXACTLY THE 80 LINES OF THE VERIFIED LIST ARE IN THE CATALOG
-- ===========================================================================
--
-- A check, not a change. The expectations are written by hand from the CSV, never
-- read back from the table. Any failure raises, and the whole file rolls back.
--
-- THE LOAD'S MARKER IS THE SKU SHAPE AND A Sursă NOTE, BOTH. The shape alone is
-- not enough: a product added by hand as SS-100 is not this list's, carries no
-- note (the column is new), and must neither be counted nor stop the load. A
-- product that already held one of the 80 SKUs kept its row, has no note, and so
-- leaves the count at 79, which is the collision this check exists to refuse.

do $$
declare
  n integer;
  total numeric;
  want record;
begin
  -- The column exists, as nullable text.
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products' and column_name = 'source_note'
    and data_type = 'text' and is_nullable = 'YES';
  if n <> 1 then
    raise exception 'P3-69: products.source_note is not a nullable text column';
  end if;

  select count(*), coalesce(sum(unit_value_mdl), 0) into n, total
  from public.products
  where sku ~ '^(TM|TMRV|TC|SB|SS|SSRB)-[0-9]{3}$'
    and position('Sursă: ' in coalesce(source_note, '')) > 0;
  if n <> 80 then
    raise exception 'P3-69: % products carry this load''s marker, expected the 80 lines of the verified list', n;
  end if;
  if total <> 12842.88 then
    raise exception 'P3-69: the 80 partner prices sum to %, expected 12842.88', total;
  end if;

  -- Per category: the SKU prefix, the category, the unit, the count, the sum and
  -- the supplier all agree, for every row.
  for want in
    select * from (values
      ('TM',   'Țiglă metalică',                   'm2',  8,  1859.00::numeric, 'Roofart/Bilka'),
      ('TMRV', 'Țiglă metalică cu rocă vulcanică', 'm2',  3,   574.00::numeric, 'Novatik'),
      ('TC',   'Țiglă ceramică',                   'pcs', 2,    87.00::numeric, 'Creaton'),
      ('SB',   'Șindrilă bituminoasă',             'm2',  2,   433.00::numeric, 'IKO'),
      ('SS',   'Sistem de scurgere',               'pcs', 14, 1833.88::numeric, null),
      ('SSRB', 'Sistem de scurgere Roofart/Bilka', 'pcs', 51, 8056.00::numeric, 'Dasterum')
    ) as e(prefix, category, unit, rows_expected, total_expected, brand)
  loop
    select count(*), coalesce(sum(p.unit_value_mdl), 0) into n, total
    from public.products p
    join public.categories c on c.id = p.category_id
    left join public.suppliers s on s.id = p.supplier_id
    where p.sku ~ ('^' || want.prefix || '-[0-9]{3}$')
      and position('Sursă: ' in coalesce(p.source_note, '')) > 0
      and c.name = want.category
      and p.unit::text = want.unit
      and p.unit_value_mdl > 0
      and (
        (want.brand is null and p.supplier_id is null)
        or (want.brand is not null and public.fold_text(s.name) = public.fold_text(want.brand))
      );
    if n <> want.rows_expected then
      raise exception 'P3-69: % rows of prefix % match category %, unit % and supplier %, expected %',
        n, want.prefix, want.category, want.unit, coalesce(want.brand, 'none'), want.rows_expected;
    end if;
    if total <> want.total_expected then
      raise exception 'P3-69: the % rows of prefix % sum to %, expected %', n, want.prefix, total, want.total_expected;
    end if;
  end loop;
end
$$;

commit;


-- ===========================================================================
-- 6. VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect 80 products summing to 12842.88, six categories, and
-- the supplier of each group.

select count(*) as products, sum(unit_value_mdl) as total_lei
from public.products
where sku ~ '^(TM|TMRV|TC|SB|SS|SSRB)-[0-9]{3}$' and source_note is not null;

select c.name as category, c.sort_order, count(p.id) as products, sum(p.unit_value_mdl) as total_lei,
       string_agg(distinct coalesce(s.name, '(fără furnizor)'), ', ') as suppliers
from public.products p
join public.categories c on c.id = p.category_id
left join public.suppliers s on s.id = p.supplier_id
where p.sku ~ '^(TM|TMRV|TC|SB|SS|SSRB)-[0-9]{3}$' and p.source_note is not null
group by c.name, c.sort_order
order by c.sort_order;
