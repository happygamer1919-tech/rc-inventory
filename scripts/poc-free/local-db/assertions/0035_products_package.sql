-- assertions/0035_products_package.sql
-- Card EXT-10. The packaging pair on public.products, asserted against the
-- finished schema.
--
-- THE CONSTRAINT IS THE POINT, NOT THE COLUMNS. Two nullable columns that any
-- write could fill independently would admit a package unit with nothing to
-- convert by, and a factor that converts nothing. Both are silent: the row looks
-- finished, and the number a receiving screen computes from it is wrong rather
-- than absent.
--
-- ALL FOUR COMBINATIONS ARE HERE, which is what the card's acceptance line
-- names, plus the zero and negative factors that the same constraint refuses.
--
-- WRITTEN AS SEPARATE DO BLOCKS WITH THEIR OWN sub-blocks, because a constraint
-- violation aborts the surrounding block: testing a refusal in the same block as
-- an acceptance would abort before reaching the rest.

do $$
declare
  n   integer;
  txt text;
begin
  -- --- both columns exist, both NULLABLE -------------------------------------
  -- Nullable is deliberate. Most products have no packaging at all, and a
  -- NOT NULL would force every existing row to claim one.
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products'
    and column_name in ('package_unit', 'package_factor');
  if n <> 2 then
    raise exception 'EXT-10: expected products.package_unit and products.package_factor, found % of 2', n;
  end if;

  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products'
    and column_name in ('package_unit', 'package_factor')
    and is_nullable = 'YES';
  if n <> 2 then
    raise exception 'EXT-10: one of the packaging columns is NOT NULL, and both must be nullable';
  end if;

  -- --- neither carries a column default --------------------------------------
  -- A default would write a claim onto every product that predates this
  -- migration, which is the same mistake 0033 was careful not to make.
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products'
    and column_name in ('package_unit', 'package_factor')
    and column_default is not null;
  if n <> 0 then
    raise exception 'EXT-10: a packaging column carries a default, which would rewrite rows that predate it';
  end if;

  -- --- package_factor is numeric, not integer ---------------------------------
  -- A set of 2.5 kg is a real factor. An integer column would round it and the
  -- rounding would be invisible.
  select data_type into txt
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products' and column_name = 'package_factor';
  if txt <> 'numeric' then
    raise exception 'EXT-10: package_factor is %, expected numeric', txt;
  end if;

  -- --- the paired constraint exists -------------------------------------------
  select count(*) into n
  from pg_constraint
  where conrelid = 'public.products'::regclass
    and conname = 'products_package_pair_complete';
  if n <> 1 then
    raise exception 'EXT-10: the products_package_pair_complete constraint is missing';
  end if;
end $$;

begin;

insert into public.categories (id, name)
values ('e1000000-0000-4000-8000-000000000001', 'Test EXT-10');

-- --- COMBINATION 1: NEITHER SET, INSERTS ------------------------------------
-- The ordinary product. A supplier that bills in the unit Mihai stocks carries
-- no packaging at all, and this is the case that must stay effortless.
do $$
begin
  insert into public.products (id, sku, name, category_id, unit)
  values ('e1100000-0000-4000-8000-000000000001', 'EXT10-NEITHER', 'Fara ambalaj',
          'e1000000-0000-4000-8000-000000000001', 'pcs');
exception when others then
  raise exception 'EXT-10: a product with NO packaging was REFUSED: %', sqlerrm;
end $$;

-- --- COMBINATION 2: BOTH SET, INSERTS ---------------------------------------
-- The case the card exists for: one palet of 48 saci.
do $$
declare
  got_unit   text;
  got_factor numeric;
begin
  insert into public.products (id, sku, name, category_id, unit, package_unit, package_factor)
  values ('e1100000-0000-4000-8000-000000000002', 'EXT10-BOTH', 'Saci pe palet',
          'e1000000-0000-4000-8000-000000000001', 'pcs', 'palet', 48);

  select package_unit, package_factor into got_unit, got_factor
  from public.products where id = 'e1100000-0000-4000-8000-000000000002';
  if got_unit <> 'palet' or got_factor <> 48 then
    raise exception 'EXT-10: stored packaging read back as (%, %), expected (palet, 48)', got_unit, got_factor;
  end if;
exception when check_violation then
  raise exception 'EXT-10: a product with BOTH packaging fields was REFUSED by the constraint';
end $$;

-- --- COMBINATION 3: PACKAGE UNIT WITH NO FACTOR, REFUSED --------------------
-- A supplier billing in pallets with nothing to convert by. Every quantity read
-- off that supplier's documents would land in the catalogue as a package count
-- wearing the stock unit's name.
do $$
begin
  begin
    insert into public.products (id, sku, name, category_id, unit, package_unit)
    values ('e1100000-0000-4000-8000-000000000003', 'EXT10-UNIT-ONLY', 'Ambalaj fara factor',
            'e1000000-0000-4000-8000-000000000001', 'pcs', 'palet');
    raise exception 'EXT-10: a package_unit with NO package_factor was ACCEPTED, so the constraint is not enforcing';
  exception when check_violation then
    null; -- expected
  end;
end $$;

-- --- COMBINATION 4: FACTOR WITH NO PACKAGE UNIT, REFUSED --------------------
-- A number that converts nothing, and that a later reader would have to guess
-- the meaning of.
do $$
begin
  begin
    insert into public.products (id, sku, name, category_id, unit, package_factor)
    values ('e1100000-0000-4000-8000-000000000004', 'EXT10-FACTOR-ONLY', 'Factor fara ambalaj',
            'e1000000-0000-4000-8000-000000000001', 'pcs', 48);
    raise exception 'EXT-10: a package_factor with NO package_unit was ACCEPTED, so the constraint is not enforcing';
  exception when check_violation then
    null; -- expected
  end;
end $$;

-- --- THE FACTOR MUST BE GREATER THAN ZERO -----------------------------------
-- Zero makes every conversion zero and a delivery of ten pallets arrive as
-- nothing. Negative makes a delivery reduce stock. Neither is refused by the
-- pairing alone, so both are asserted here.
do $$
begin
  begin
    insert into public.products (id, sku, name, category_id, unit, package_unit, package_factor)
    values ('e1100000-0000-4000-8000-000000000005', 'EXT10-ZERO', 'Factor zero',
            'e1000000-0000-4000-8000-000000000001', 'pcs', 'palet', 0);
    raise exception 'EXT-10: a package_factor of 0 was ACCEPTED, and every conversion through it is zero';
  exception when check_violation then
    null; -- expected
  end;

  begin
    insert into public.products (id, sku, name, category_id, unit, package_unit, package_factor)
    values ('e1100000-0000-4000-8000-000000000006', 'EXT10-NEGATIVE', 'Factor negativ',
            'e1000000-0000-4000-8000-000000000001', 'pcs', 'palet', -48);
    raise exception 'EXT-10: a NEGATIVE package_factor was ACCEPTED, and a delivery through it reduces stock';
  exception when check_violation then
    null; -- expected
  end;
end $$;

-- --- A FRACTIONAL FACTOR IS LEGAL, AND THAT IS NOT AN OVERSIGHT -------------
-- A set of 2.5 kg is a real supplier package. It is asserted so that nobody
-- later "tightens" the column to an integer and rounds it away in silence.
do $$
begin
  insert into public.products (id, sku, name, category_id, unit, package_unit, package_factor)
  values ('e1100000-0000-4000-8000-000000000007', 'EXT10-FRACTION', 'Set fractionar',
          'e1000000-0000-4000-8000-000000000001', 'kg', 'set', 2.5);
exception when check_violation then
  raise exception 'EXT-10: a fractional package_factor was REFUSED, and 2.5 kg per set is a real package';
end $$;

-- --- THE STOCK UNIT IS UNTOUCHED --------------------------------------------
-- The whole reason packaging is not an enum value: products.unit still means
-- what a stored quantity is counted in, and no packaging label reached it.
do $$
declare
  n integer;
begin
  select count(*) into n
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'unit_code' and e.enumlabel in ('palet', 'cutie', 'set', 'bax');
  if n <> 0 then
    raise exception 'EXT-10: % packaging label(s) reached public.unit_code, and the quantity column now means two things', n;
  end if;
end $$;

rollback;
