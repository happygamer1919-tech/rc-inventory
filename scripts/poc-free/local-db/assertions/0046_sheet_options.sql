-- assertions/0046_sheet_options.sql
-- Card P3-57. The list of roofing and profiled sheet combinations, the four
-- columns a product carries when it was picked from that list, and the two
-- constraints that keep a product from naming a combination the list does not have.
--
-- WHAT THIS FILE CANNOT PROVE, SAID HERE SO NOBODY READS IT AS PROVEN. It proves
-- what the schema refuses and accepts. That the product form offers only these
-- combinations and fills the name, unit, category and supplier is
-- tests/e2e/roofing-product-picker.spec.ts, against a real local Supabase stack.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n integer;
begin
  -- --- the list: 225 rows, sixteen models, row level security on -------------
  select count(*) into n from public.sheet_options;
  if n <> 225 then
    raise exception 'P3-57: sheet_options holds % rows, expected 225', n;
  end if;

  select count(distinct model) into n from public.sheet_options;
  if n <> 16 then
    raise exception 'P3-57: sheet_options names % models, expected 16', n;
  end if;

  select count(*) into n from pg_class
  where oid = 'public.sheet_options'::regclass and relrowsecurity;
  if n <> 1 then
    raise exception 'P3-57: row level security is not enabled on sheet_options';
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'sheet_options';
  if n <> 1 then
    raise exception 'P3-57: sheet_options carries % policies, expected exactly the one select policy', n;
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'sheet_options'
    and policyname = 'sheet_options_select' and cmd = 'SELECT' and roles = '{authenticated}'::name[];
  if n <> 1 then
    raise exception 'P3-57: sheet_options_select is not a select policy for authenticated';
  end if;

  -- --- the four product columns: nullable, no default --------------------------
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products'
    and column_name in ('sheet_model', 'sheet_series', 'sheet_thickness_mm', 'sheet_finish')
    and is_nullable = 'YES' and column_default is null;
  if n <> 4 then
    raise exception 'P3-57: % of the four sheet_* product columns are nullable without a default, expected 4', n;
  end if;

  -- --- both constraints exist ------------------------------------------------------
  select count(*) into n from pg_constraint
  where conrelid = 'public.products'::regclass
    and ((conname = 'products_sheet_complete' and contype = 'c')
      or (conname = 'products_sheet_option_fk' and contype = 'f'));
  if n <> 2 then
    raise exception 'P3-57: products_sheet_complete and products_sheet_option_fk are not both present';
  end if;
end
$$;


-- ===========================================================================
-- 2. THE LIST IS THE VERIFIED ONE, WHERE THE OWNER AND THE LIST ARE SPECIFIC
-- ===========================================================================

do $$
declare
  n integer;
  got text;
begin
  -- T-12 has no Econom series on the verified list.
  select count(*) into n from public.sheet_options where model = 'T-12' and series = 'Econom';
  if n <> 0 then
    raise exception 'P3-57: T-12 offers Econom, which the verified list does not have';
  end if;

  -- H-57 is one combination: Zinc (România/Turcia) at 0,70.
  select string_agg(series || ' ' || thickness_mm::text || ' ' || finish, ';') into got
  from public.sheet_options where model = 'H-57';
  if got is distinct from 'Zinc (România/Turcia) 0.70 ' then
    raise exception 'P3-57: H-57 offers "%", expected only Zinc (România/Turcia) 0.70', got;
  end if;

  -- C-10 Econom: 0,30, 0,40, 0,40 matt, 0,40 W matt, in list order.
  select string_agg(thickness_mm::text || '/' || finish, ';' order by sort_order) into got
  from public.sheet_options where model = 'C-10' and series = 'Econom';
  if got is distinct from '0.30/;0.40/;0.40/matt;0.40/W matt' then
    raise exception 'P3-57: C-10 Econom offers "%"', got;
  end if;

  -- Dastera is sold per piece, and nothing else is.
  select count(*) into n from public.sheet_options where unit = 'pcs';
  if n <> 1 then
    raise exception 'P3-57: % combinations are per piece, expected only Dastera', n;
  end if;

  -- The two shared price lines became two profiles each, keeping their price line.
  select count(*) into n from public.sheet_options
  where price_group = 'PK/PS-20, VP-20' and model in ('PK/PS-20', 'VP-20');
  if n <> 40 then
    raise exception 'P3-57: PK/PS-20 and VP-20 carry % rows of their shared price line, expected 40', n;
  end if;

  select count(*) into n from public.sheet_options
  where price_group = 'Monterrey, Valencia' and model in ('Monterrey', 'Valencia');
  if n <> 22 then
    raise exception 'P3-57: Monterrey and Valencia carry % rows of their shared price line, expected 22', n;
  end if;

  select count(*) into n from (
    select distinct price_group, series, thickness_mm, finish from public.sheet_options
  ) lines;
  if n <> 194 then
    raise exception 'P3-57: sheet_options covers % price lines, expected 194', n;
  end if;
end
$$;


-- ===========================================================================
-- 3. WHAT A PRODUCT MAY CARRY
-- ===========================================================================

insert into public.categories (id, name)
values ('e3571000-0000-4000-8000-000000000001', 'Test P3-57');

-- --- NO COMBINATION, AND A COMBINATION ON THE LIST, ARE ACCEPTED ---------------
do $$
begin
  begin
    insert into public.products (id, sku, name, category_id, unit) values
      ('e3572000-0000-4000-8000-000000000001', 'P357-OBISNUIT', 'Produs obișnuit',
       'e3571000-0000-4000-8000-000000000001', 'pcs');
  exception when others then
    raise exception 'P3-57: a product with no sheet combination was REFUSED: %', sqlerrm;
  end;

  begin
    insert into public.products
      (id, sku, name, category_id, unit, sheet_model, sheet_series, sheet_thickness_mm, sheet_finish)
    values
      ('e3572000-0000-4000-8000-000000000002', 'P357-C10-STD-045', 'Tablă cutată C-10 Standart Zn 0,45 mm',
       'e3571000-0000-4000-8000-000000000001', 'm2', 'C-10', 'Standart Zn', 0.45, ''),
      ('e3572000-0000-4000-8000-000000000003', 'P357-C10-STD-045-CR', 'Tablă cutată C-10 Standart Zn 0,45 mm Cr matt',
       'e3571000-0000-4000-8000-000000000001', 'm2', 'C-10', 'Standart Zn', 0.45, 'Cr matt');
  exception when others then
    raise exception 'P3-57: a product naming a combination on the list was REFUSED: %', sqlerrm;
  end;
end
$$;

-- --- A COMBINATION OFF THE LIST IS REFUSED BY THE FOREIGN KEY --------------------
do $$
declare
  bad record;
begin
  for bad in
    select * from (values
      -- a thickness the series does not have
      ('C-10', 'Econom', 0.45::numeric, ''),
      -- a series the model does not have
      ('T-12', 'Econom', 0.40::numeric, ''),
      -- a finish the thickness does not have
      ('C-10', 'Standart Zn', 0.40::numeric, 'Cr matt'),
      -- the shared price line text is not a model
      ('PK/PS-20, VP-20', 'Econom', 0.30::numeric, ''),
      -- a model spelled in Cyrillic, as on the paper catalogue
      ('С-10', 'Standart Zn', 0.45::numeric, '')
    ) as v(model, series, thickness, finish)
  loop
    begin
      update public.products
      set sheet_model = bad.model, sheet_series = bad.series,
          sheet_thickness_mm = bad.thickness, sheet_finish = bad.finish
      where id = 'e3572000-0000-4000-8000-000000000001';
      raise exception 'P3-57: the combination % / % / % / "%" was ACCEPTED, and products_sheet_option_fk must refuse it',
        bad.model, bad.series, bad.thickness, bad.finish;
    exception when foreign_key_violation then
      null; -- expected
    end;
  end loop;
end
$$;

-- --- A PARTLY PICKED COMBINATION IS REFUSED BY THE CHECK --------------------------
do $$
begin
  begin
    update public.products set sheet_model = 'C-10'
    where id = 'e3572000-0000-4000-8000-000000000001';
    raise exception 'P3-57: a product with a model and no series, thickness or finish was ACCEPTED';
  exception when check_violation then
    null; -- expected
  end;

  begin
    update public.products set sheet_finish = null
    where id = 'e3572000-0000-4000-8000-000000000002';
    raise exception 'P3-57: a picked product with a null finish was ACCEPTED; the foreign key would go unchecked';
  exception when check_violation then
    null; -- expected
  end;
end
$$;


-- ===========================================================================
-- 4. WHO MAY READ AND WRITE THE LIST
-- ===========================================================================

insert into auth.users (id, email) values
  ('e3570000-0000-4000-8000-000000000001', 'p3-57-owner@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3570000-0000-4000-8000-000000000001', 'p3-57-owner@rc-inventory.local', 'owner', true);

-- The owner, signed in: reads all 225, writes none.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e3570000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  n integer;
begin
  select count(*) into n from public.sheet_options;
  if n <> 225 then
    raise exception 'P3-57: a signed-in owner reads % of the 225 combinations', n;
  end if;

  begin
    insert into public.sheet_options (model, series, thickness_mm, finish, unit, price_group, sort_order)
    values ('C-10', 'Econom', 0.45, '', 'm2', 'C-10', 9001);
    raise exception 'P3-57: a signed-in owner ADDED a combination; the list is written only by migrations';
  exception when insufficient_privilege then
    null; -- expected
  end;

  begin
    update public.sheet_options set unit = 'pcs' where model = 'C-10';
    raise exception 'P3-57: a signed-in owner CHANGED a combination; the list is written only by migrations';
  exception when insufficient_privilege then
    null; -- expected
  end;
end
$$;

reset role;

-- Nobody signed in: reads nothing.
set local role anon;

do $$
begin
  begin
    perform 1 from public.sheet_options limit 1;
    raise exception 'P3-57: anon READ sheet_options';
  exception when insufficient_privilege then
    null; -- expected
  end;
end
$$;

reset role;

rollback;
