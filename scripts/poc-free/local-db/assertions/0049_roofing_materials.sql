-- assertions/0049_roofing_materials.sql
-- Card P3-69. The 80 roofing materials of the verified list, their categories,
-- their suppliers, the new products.source_note column, and that a second run adds
-- nothing.
--
-- WHAT THIS FILE CANNOT PROVE, SAID HERE SO NOBODY READS IT AS PROVEN. It proves
-- what the tables hold. That the Inventar screen shows these products with their
-- category, supplier and price is tests/e2e/load-80-materials.spec.ts, against a
-- real local Supabase stack.
--
-- THE EXPECTED VALUES BELOW ARE WRITTEN BY HAND FROM THE VERIFIED CSV, not read
-- from the table: an assertion that takes its expectation from the thing under
-- test passes on wrong data too.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n integer;
begin
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products' and column_name = 'source_note'
    and data_type = 'text' and is_nullable = 'YES' and column_default is null;
  if n <> 1 then
    raise exception 'P3-69: products.source_note is not a nullable text column without a default';
  end if;

  -- The six categories exist once each, after the nineteen, in the list's order.
  select count(*) into n
  from public.categories c
  join (values
    ('Țiglă metalică', 20),
    ('Țiglă metalică cu rocă vulcanică', 21),
    ('Țiglă ceramică', 22),
    ('Șindrilă bituminoasă', 23),
    ('Sistem de scurgere', 24),
    ('Sistem de scurgere Roofart/Bilka', 25)
  ) as e(name, sort_order) on e.name = c.name and e.sort_order = c.sort_order;
  if n <> 6 then
    raise exception 'P3-69: % of the six categories exist with their sort order', n;
  end if;

  -- The whole vocabulary is now 25, contiguous. assertions/0029 asserted the total
  -- as 19 until this card and now asserts only its own nineteen; the total moved here.
  select count(*) into n from public.categories;
  if n <> 25 then
    raise exception 'P3-69: expected 25 categories, found %', n;
  end if;
  if exists (
    select 1 from generate_series(1, 25) g
    where not exists (select 1 from public.categories c where c.sort_order = g)
  ) then
    raise exception 'P3-69: sort_order is not contiguous 1..25';
  end if;
end
$$;


-- ===========================================================================
-- 2. THE ROWS ARE THE VERIFIED ONES
-- ===========================================================================

do $$
declare
  n integer;
  total numeric;
  got record;
  want record;
begin
  -- The load's marker, as the migration defines it: the SKU shape and a Sursă note.
  select count(*), sum(unit_value_mdl) into n, total
  from public.products
  where sku ~ '^(TM|TMRV|TC|SB|SS|SSRB)-[0-9]{3}$'
    and position('Sursă: ' in coalesce(source_note, '')) > 0;
  if n <> 80 then
    raise exception 'P3-69: % products carry the load''s marker, expected 80', n;
  end if;
  if total <> 12842.88 then
    raise exception 'P3-69: the 80 partner prices sum to %, expected 12842.88', total;
  end if;

  -- Ten lines of the list, one or more per category, over every shape it has: a
  -- note and no note, a decimal price, both units, no supplier, a diacritic name,
  -- the first and the last line.
  for want in
    select * from (values
      ('TM-001',   'BARCELONA ECO 0.45',                             'Țiglă metalică',                   'm2',  129.00::numeric, 'Roofart/Bilka', 'Sursă: pret parteneri.pdf'),
      ('TM-008',   'IZI UTK 24',                                     'Țiglă metalică',                   'm2',  402.00::numeric, 'Roofart/Bilka', 'Sursă: pret parteneri.pdf'),
      ('TMRV-002', 'NOVATIK SLATE',                                  'Țiglă metalică cu rocă vulcanică', 'm2',  204.00::numeric, 'Novatik',       'Sursă: pret roca,Ceramica,sindrila.pdf'),
      ('TC-001',   'Creaton Balance',                                'Țiglă ceramică',                   'pcs',  43.00::numeric, 'Creaton',       '8,4 buc/m² · Sursă: pret roca,Ceramica,sindrila.pdf'),
      ('SB-002',   'IKO Superglass Hex',                             'Șindrilă bituminoasă',             'm2',  175.00::numeric, 'IKO',           'Sursă: pret roca,Ceramica,sindrila.pdf'),
      ('SS-001',   '125/90 MAT Jgheab Semicircular L-3000',          'Sistem de scurgere',               'pcs', 213.68::numeric, null,            'Sursă: sistem scurgere .pdf'),
      ('SS-013',   '125/90 MAT Ramificație Burlan',                  'Sistem de scurgere',               'pcs', 351.00::numeric, null,            'Sursă: sistem scurgere .pdf'),
      ('SSRB-001', 'Jgheab L-4000 RAL Ø125/87',                      'Sistem de scurgere Roofart/Bilka', 'pcs', 481.00::numeric, 'Dasterum',      'cod JB, lista Dasterum 27.03.2025 nr 49 · Sursă: poza lista Dasterum 27.03.2025'),
      ('SSRB-024', 'Colț exterior 90° / interior 90° RAL Ø125/87',   'Sistem de scurgere Roofart/Bilka', 'pcs', 361.00::numeric, 'Dasterum',      'cod KE / KI, lista Dasterum 27.03.2025 nr 57 · Sursă: poza lista Dasterum 27.03.2025'),
      ('SSRB-051', 'Cot evacuare Zn Ø150/100',                       'Sistem de scurgere Roofart/Bilka', 'pcs',  91.00::numeric, 'Dasterum',      'cod CE, lista Dasterum 27.03.2025 nr 63 · Sursă: poza lista Dasterum 27.03.2025')
    ) as v(sku, name, category, unit, price, supplier, source_note)
  loop
    select p.name, c.name as category, p.unit::text as unit, p.unit_value_mdl as price,
           s.name as supplier, p.source_note, p.active, p.needs_review, p.threshold
      into got
    from public.products p
    join public.categories c on c.id = p.category_id
    left join public.suppliers s on s.id = p.supplier_id
    where p.sku = want.sku;
    if not found then
      raise exception 'P3-69: % is not in the catalog', want.sku;
    end if;
    if got.name <> want.name or got.category <> want.category or got.unit <> want.unit
       or got.price <> want.price
       -- Folded, as the migration matches: an existing "DASTERUM" is the brand.
       or public.fold_text(got.supplier) is distinct from public.fold_text(want.supplier)
       or got.source_note <> want.source_note then
      raise exception 'P3-69: % holds (%, %, %, %, %, %), expected (%, %, %, %, %, %)', want.sku,
        got.name, got.category, got.unit, got.price, got.supplier, got.source_note,
        want.name, want.category, want.unit, want.price, want.supplier, want.source_note;
    end if;
    if not got.active or got.needs_review or got.threshold <> 0 then
      raise exception 'P3-69: % is not an active, reviewed product with threshold 0', want.sku;
    end if;
  end loop;

  -- The 14 lines of the 125/90 gutter list carry no supplier, and every other line does.
  select count(*) into n from public.products
  where sku ~ '^SS-[0-9]{3}$' and supplier_id is not null;
  if n <> 0 then
    raise exception 'P3-69: % of the 125/90 gutter lines carry a supplier, expected none', n;
  end if;
  select count(*) into n from public.products
  where sku ~ '^(TM|TMRV|TC|SB|SSRB)-[0-9]{3}$' and supplier_id is null;
  if n <> 0 then
    raise exception 'P3-69: % branded lines carry no supplier', n;
  end if;

  -- Thirteen lines are sold per square metre, the other 67 per piece.
  select count(*) into n from public.products
  where sku ~ '^(TM|TMRV|TC|SB|SS|SSRB)-[0-9]{3}$' and unit = 'm2';
  if n <> 13 then
    raise exception 'P3-69: % lines are per m2, expected 13', n;
  end if;
end
$$;


-- ===========================================================================
-- 3. ONE SUPPLIER PER BRAND, AND A SECOND RUN ADDS NOTHING
-- ===========================================================================

do $$
declare
  n integer;
  brand text;
begin
  -- On an empty database each brand was created exactly once.
  foreach brand in array array['Roofart/Bilka', 'Novatik', 'Creaton', 'IKO', 'Dasterum'] loop
    select count(*) into n from public.suppliers where public.fold_text(name) = public.fold_text(brand);
    if n <> 1 then
      raise exception 'P3-69: % suppliers fold to %, expected exactly one', n, brand;
    end if;
  end loop;

  -- THE MIGRATION IS RE-RUNNABLE: its own statement shapes add nothing a second time.
  insert into public.categories (name, sort_order)
  values ('Țiglă metalică', 20), ('Sistem de scurgere', 24)
  on conflict (name) do nothing;

  insert into public.suppliers (name)
  select b.name from (values ('dasterum'), ('IKO')) as b(name)
  where not exists (
    select 1 from public.suppliers s where public.fold_text(s.name) = public.fold_text(b.name)
  );

  insert into public.products (sku, name, category_id, unit, unit_value_mdl, supplier_id, source_note)
  select v.sku, v.name, c.id, v.unit::public.unit_code, v.price::numeric(14,2), null, v.source_note
  from (values
    ('TM-001', 'BARCELONA ECO 0.45', 'Țiglă metalică', 'm2', 999, 'Sursă: pret parteneri.pdf'),
    ('SS-014', '125/90 MAT Cot Evacuare 60°', 'Sistem de scurgere', 'pcs', 999, 'Sursă: sistem scurgere .pdf')
  ) as v(sku, name, category, unit, price, source_note)
  join public.categories c on c.name = v.category
  on conflict (sku) do nothing;

  select count(*) into n from public.categories
  where name in ('Țiglă metalică', 'Sistem de scurgere');
  if n <> 2 then
    raise exception 'P3-69: re-inserting two categories left % rows of those names, expected 2', n;
  end if;

  select count(*) into n from public.suppliers
  where public.fold_text(name) in (public.fold_text('Dasterum'), public.fold_text('IKO'));
  if n <> 2 then
    raise exception 'P3-69: re-inserting two brands left % suppliers of those names, expected 2', n;
  end if;

  select count(*) into n from public.products where sku ~ '^(TM|TMRV|TC|SB|SS|SSRB)-[0-9]{3}$';
  if n <> 80 then
    raise exception 'P3-69: re-inserting two lines left % rows, expected 80', n;
  end if;

  -- And the skipped insert changed nothing on the row already there.
  select count(*) into n from public.products
  where sku in ('TM-001', 'SS-014') and unit_value_mdl = 999;
  if n <> 0 then
    raise exception 'P3-69: a second run CHANGED the price of % existing rows', n;
  end if;
end
$$;

rollback;
