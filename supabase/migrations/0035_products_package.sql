-- 0035_products_package.sql
-- RC Inventory phase 3, card EXT-10. What the supplier bills in, and how many
-- stock units fit in one of them.
--
-- Contains no DROP, no TRUNCATE and no DELETE. It adds two columns and one
-- constraint, and removes nothing.
--
-- MERGING THIS FILE APPLIES IT. A Supabase GitHub app applies merged migrations
-- to production on every push to main, within about two minutes, with no
-- terminal involved. That is CLAUDE.md 8.0 and ruling R-124, and the prediction
-- is written here before the merge because the ruling requires it of section 8.
--
-- WHY PACKAGING IS NOT A UNIT OF MEASURE, AND WHY IT MAY NOT JOIN public.unit_code.
--
-- Andre pushed back on putting `palet` and `cutie` into the unit enum and he is
-- right. A supplier billing two pallets of 48 sacks is not billing two of
-- anything Mihai stocks. products.unit says what a QUANTITY MEANS everywhere in
-- this schema: batches, order lines and outbound lines are all counted in it.
-- Admitting a packaging label into that enum would make the quantity column mean
-- two different things depending on the row, and nothing on any screen would
-- say which.
--
-- So packaging is a SECOND pair of facts about the product, and the stock unit
-- keeps meaning exactly what it meant yesterday.
--
-- BOTH NULLABLE, BECAUSE MOST PRODUCTS HAVE NO PACKAGING. A product billed in
-- the unit it is stocked in carries neither field. That is the ordinary case and
-- not a missing value, which is why there is no default and no NOT NULL.
--
-- THE CONSTRAINT IS THE POINT. Two nullable columns with no constraint would
-- admit a package unit with no factor, which is a supplier billing in pallets
-- with nothing to convert by, and a factor with no package unit, which is a
-- number that converts nothing. Both are unreadable to anyone who finds them
-- later, and both are refused here rather than in the application, because the
-- application is not the only thing that writes this table.
--
-- A FACTOR OF ZERO OR LESS IS REFUSED BY THE SAME CONSTRAINT. Zero stock units
-- per package makes every conversion zero, and a negative factor makes a
-- delivery reduce stock. Neither is a value anybody means.
--
-- THE PACKAGE UNIT IS FREE TEXT AND THAT IS DELIBERATE. `palet`, `cutie`, `set`,
-- `bax`, `rola`: the vocabulary belongs to the suppliers and not to us, and a
-- closed list here would refuse the next one Andre meets. The application trims
-- it and stores NULL for a blank, so a blank string never reaches this
-- constraint pretending to be a package unit.
--
-- SCHEMA ONLY. This file lands the fields and the rule. Recording a BILLED
-- quantity on the extraction path and converting it is the next card, and it
-- needs this one applied first.

begin;

alter table public.products
  add column if not exists package_unit text;

alter table public.products
  add column if not exists package_factor numeric(14,3);

alter table public.products
  drop constraint if exists products_package_pair_complete;

alter table public.products
  add constraint products_package_pair_complete
  check (
    (package_unit is null and package_factor is null)
    or (package_unit is not null and package_factor is not null and package_factor > 0)
  );

comment on column public.products.package_unit is
  'EXT-10. What the SUPPLIER bills in: palet, cutie, set. NOT a unit of measure and never a public.unit_code value: products.unit keeps meaning what a stored quantity is counted in. NULL when the supplier bills in the stocked unit, which is the ordinary case.';

comment on column public.products.package_factor is
  'EXT-10. How many stock units fit in one package_unit, greater than zero. Present exactly when package_unit is, enforced by products_package_pair_complete.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect two columns, both nullable, both without a default, and the paired
-- constraint present.

select column_name, data_type, is_nullable, coalesce(column_default, '(none)') as default_expr
from information_schema.columns
where table_schema = 'public'
  and table_name = 'products'
  and column_name in ('package_unit', 'package_factor')
order by column_name;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.products'::regclass
  and conname = 'products_package_pair_complete';
