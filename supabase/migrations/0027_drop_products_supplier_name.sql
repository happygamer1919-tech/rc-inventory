-- 0027_drop_products_supplier_name.sql
-- RC Inventory phase 3, card P3-05b. The supplier stops having two
-- representations.
--
-- ONE COLUMN, ON ONE TABLE, AND THE NAME IS SHARED BY TWO OTHERS THAT ARE NOT
-- TOUCHED. `supplier_name` also exists on public.inbound_orders and on
-- public.extraction_drafts. Neither is in scope and neither is altered here.
-- Only public.products.supplier_name is dropped, because only that one has a
-- record to replace it: products.supplier_id, added by 0019.
--
-- THE VERIFICATION IT RESTS ON IS A VACUOUS ZERO, AND THE CARD SAYS SO IN PLAIN
-- WORDS RATHER THAN LETTING ITS EVIDENCE READ AS A PROVEN BACKFILL.
-- On 2026-09-01, on production:
--
--     select count(*) from public.products
--      where supplier_id is null and supplier_name is not null
--        and btrim(supplier_name) <> '';                       -> 0
--     select count(*) from public.products;                    -> 0
--
-- The first zero is true because the second is. NO ROW WAS MATCHED, BECAUSE NO
-- ROW EXISTED. 0019's backfill created zero suppliers and linked zero products.
-- The owner ratified the drop on exactly that basis on 2026-09-01: being wrong
-- today costs nothing because there is nothing to lose, and the alternative is a
-- second production apply against a catalogue holding real client data. Anyone
-- reading this later must not mistake it for a backfill verified against real
-- rows.
--
-- CONTAINS NO DROP TABLE, NO TRUNCATE AND NO DELETE.
--
-- IT CONTAINS ONE `DROP COLUMN` AND ONE `DROP FUNCTION`, BOTH DECLARED HERE.
--   alter table public.products drop column supplier_name;
--   drop function if exists public.backfill_product_suppliers(integer);
-- Neither reduces the number of rows in any table, which is the test CLAUDE.md
-- 8.6 applies. The applier's zero-rows-deleted assertion compares every table's
-- count before and after, and its declared-column-drops-only assertion refuses
-- any column disappearance this file did not name.
--
-- THE COLUMN IS NOT REPLACED BY A NOT NULL. products.supplier_id STAYS NULLABLE,
-- and that is the difference from P3-04b. A product may genuinely have no
-- supplier: 0019's own header says the backfill creates nothing for an empty
-- supplier_name and leaves supplier_id null. An outbound issue must go
-- somewhere; a catalogue entry need not come from anywhere.

begin;


-- ===========================================================================
-- 1. THE BACKFILL FUNCTION, WHOSE JOB IS DONE
-- ===========================================================================
--
-- public.backfill_product_suppliers(integer) reads p.supplier_name to fold
-- spellings into supplier records. The column is dropped below, so the function
-- could never run again. Nothing in the application calls it: 0019 called it
-- once, itself, at apply time.
--
-- It removes a rule about rows and no row.

drop function if exists public.backfill_product_suppliers(integer);


-- ===========================================================================
-- 2. THE COLUMN
-- ===========================================================================
--
-- Every reader was changed in the same pull request to take the supplier from
-- the joined record. The one remaining spelling of a supplier now lives in
-- public.suppliers.name, reached through products.supplier_id.

alter table public.products
  drop column supplier_name;

comment on column public.products.supplier_id is
  'The supplier, as a record, and since P3-05b the ONLY representation of one: products.supplier_name is gone. Still NULLABLE, because a product may genuinely have no supplier, which is not true of an outbound issue and its project.';


commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: no supplier_name on products, supplier_id present and nullable, and
-- the two OTHER supplier_name columns untouched on their own tables.

select table_name, column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'products' and column_name in ('supplier_name', 'supplier_id'))
    or (table_name in ('inbound_orders', 'extraction_drafts') and column_name = 'supplier_name')
  )
order by table_name, column_name;
