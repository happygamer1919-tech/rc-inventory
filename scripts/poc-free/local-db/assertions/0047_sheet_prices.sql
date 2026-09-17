-- assertions/0047_sheet_prices.sql
-- Card P3-58. The price of every line of the verified Dasterum list, the join
-- back to the combinations of 0046, and who may read or write the prices.
--
-- WHAT THIS FILE CANNOT PROVE, SAID HERE SO NOBODY READS IT AS PROVEN. It proves
-- what the table holds and what it refuses. That the product form fills Valoare
-- unitara (MDL) with the price of the combination picked, and that an operator can
-- type over it, is tests/e2e/roofing-product-prices.spec.ts, against a real local
-- Supabase stack.
--
-- THE EXPECTED PRICES BELOW ARE WRITTEN BY HAND FROM THE VERIFIED CSV, not read
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
  select count(*) into n from pg_class
  where oid = 'public.sheet_prices'::regclass and relrowsecurity;
  if n <> 1 then
    raise exception 'P3-58: row level security is not enabled on sheet_prices';
  end if;

  -- P3-68 ADDED TWO OWNER WRITE POLICIES, so the count of policies on this table
  -- is no longer this file's to assert. Until then this block read:
  --
  --   "sheet_prices carries % policies, expected exactly the one select policy"
  --
  -- That was true of 0047 and is false after 0048. The select policy below is
  -- still 0047's and is still asserted here; the full set of three is asserted by
  -- assertions/0048_sheet_options_admin.sql.

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'sheet_prices'
    and policyname = 'sheet_prices_select' and cmd = 'SELECT' and roles = '{authenticated}'::name[];
  if n <> 1 then
    raise exception 'P3-58: sheet_prices_select is not a select policy for authenticated';
  end if;

  -- price_lei is the type of products.unit_value_mdl, which is the field it fills.
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sheet_prices' and column_name = 'price_lei'
    and data_type = 'numeric' and numeric_precision = 14 and numeric_scale = 2 and is_nullable = 'NO';
  if n <> 1 then
    raise exception 'P3-58: sheet_prices.price_lei is not a not null numeric(14,2)';
  end if;

  -- the key is the whole price line, the four values sheet_options carries for it.
  select count(*) into n
  from pg_constraint c
  join lateral unnest(c.conkey) k(attnum) on true
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
  where c.conrelid = 'public.sheet_prices'::regclass and c.contype = 'p'
    and a.attname in ('price_group', 'series', 'thickness_mm', 'finish');
  if n <> 4 then
    raise exception 'P3-58: the primary key of sheet_prices is not (price_group, series, thickness_mm, finish)';
  end if;
end
$$;


-- ===========================================================================
-- 2. THE PRICES ARE THE VERIFIED ONES
-- ===========================================================================

do $$
declare
  n integer;
  total numeric;
  got numeric;
  want record;
begin
  select count(*) into n from public.sheet_prices;
  if n <> 194 then
    raise exception 'P3-58: sheet_prices holds % rows, expected the 194 lines of the verified list', n;
  end if;

  select sum(price_lei) into total from public.sheet_prices;
  if total <> 26832 then
    raise exception 'P3-58: the 194 prices sum to %, expected 26832', total;
  end if;

  -- Eight lines of the verified list, spread over the shapes the list has: no
  -- finish, a finish, a shared line, the per piece line, a one line model.
  for want in
    select * from (values
      ('C-10',                 'Standart Zn',           0.45::numeric, '',             144::numeric),
      ('C-10',                 'Standart Zn',           0.45::numeric, 'Cr matt',      134::numeric),
      ('PS-8',                 'Standart Zn',           0.45::numeric, 'W',            164::numeric),
      ('PK/PS-20, VP-20',      'Econom',                0.30::numeric, '',              82::numeric),
      ('Dastera (lei/bucată)', 'Standart Zn',           0.45::numeric, 'Cr matt',      137::numeric),
      ('H-57',                 'Zinc (România/Turcia)', 0.70::numeric, '',             253::numeric),
      ('Monterrey, Valencia',  'Premium Zn',            0.45::numeric, 'matt (V/Q/H)', 142::numeric),
      ('Tablă netedă',         'AlZn Premium',          0.70::numeric, '',             183::numeric)
    ) as v(price_group, series, thickness, finish, price)
  loop
    select price_lei into got from public.sheet_prices
    where price_group = want.price_group and series = want.series
      and thickness_mm = want.thickness and finish = want.finish;
    if got is null then
      raise exception 'P3-58: the line % / % / % / "%" has no price', want.price_group, want.series, want.thickness, want.finish;
    end if;
    if got <> want.price then
      raise exception 'P3-58: % / % / % / "%" costs %, expected %', want.price_group, want.series, want.thickness, want.finish, got, want.price;
    end if;
  end loop;
end
$$;


-- ===========================================================================
-- 3. EVERY COMBINATION FINDS ITS PRICE, AND NO PRICE IS ORPHANED
-- ===========================================================================
--
-- There is no foreign key here and there cannot be one: price_group is not unique
-- in sheet_options, because two profiles share one price line. This is the
-- property the key would have given, asserted in both directions.

do $$
declare
  n integer;
  got numeric;
begin
  select count(*) into n
  from public.sheet_options o
  join public.sheet_prices p
    on p.price_group = o.price_group and p.series = o.series
   and p.thickness_mm = o.thickness_mm and p.finish = o.finish;
  if n <> 225 then
    raise exception 'P3-58: % of the 225 combinations find a price', n;
  end if;

  select count(*) into n
  from public.sheet_prices p
  where not exists (
    select 1 from public.sheet_options o
    where o.price_group = p.price_group and o.series = p.series
      and o.thickness_mm = p.thickness_mm and o.finish = p.finish
  );
  if n <> 0 then
    raise exception 'P3-58: % prices name a line sheet_options does not have', n;
  end if;

  -- The shared line is one price and both profiles read it.
  for n in 1..2 loop
    select p.price_lei into got
    from public.sheet_options o
    join public.sheet_prices p
      on p.price_group = o.price_group and p.series = o.series
     and p.thickness_mm = o.thickness_mm and p.finish = o.finish
    where o.model = (array['PK/PS-20', 'VP-20'])[n]
      and o.series = 'Econom' and o.thickness_mm = 0.30 and o.finish = '';
    if got is distinct from 82 then
      raise exception 'P3-58: % Econom 0,30 costs %, expected the shared 82', (array['PK/PS-20', 'VP-20'])[n], got;
    end if;
  end loop;
end
$$;


-- ===========================================================================
-- 4. WHAT THE TABLE REFUSES, AND THAT A SECOND RUN ADDS NOTHING
-- ===========================================================================

do $$
declare
  n integer;
begin
  begin
    insert into public.sheet_prices (price_group, series, thickness_mm, finish, price_lei)
    values ('C-10', 'Econom', 0.30, '', 0);
    raise exception 'P3-58: a price of zero was ACCEPTED';
  exception when check_violation then
    null; -- expected
  end;

  begin
    insert into public.sheet_prices (price_group, series, thickness_mm, finish, price_lei)
    values (' C-10', 'Econom', 0.30, '', 82);
    raise exception 'P3-58: an untrimmed price_group was ACCEPTED';
  exception when check_violation then
    null; -- expected
  end;

  begin
    insert into public.sheet_prices (price_group, series, thickness_mm, finish, price_lei)
    values ('C-10', '', 0.30, '', 82);
    raise exception 'P3-58: an empty series was ACCEPTED';
  exception when check_violation then
    null; -- expected
  end;

  begin
    insert into public.sheet_prices (price_group, series, thickness_mm, finish, price_lei)
    values ('C-10', 'Standart Zn', 0.45, '', 999);
    raise exception 'P3-58: a second price for one line was ACCEPTED';
  exception when unique_violation then
    null; -- expected
  end;

  -- THE MIGRATION IS RE-RUNNABLE: its own insert shape adds nothing a second time.
  insert into public.sheet_prices (price_group, series, thickness_mm, finish, price_lei)
  values ('C-10', 'Standart Zn', 0.45, '', 144), ('H-57', 'Zinc (România/Turcia)', 0.70, '', 253)
  on conflict (price_group, series, thickness_mm, finish) do nothing;

  select count(*) into n from public.sheet_prices;
  if n <> 194 then
    raise exception 'P3-58: re-inserting two lines left % rows, expected 194', n;
  end if;
end
$$;


-- ===========================================================================
-- 5. WHO MAY READ AND WRITE THE PRICES
-- ===========================================================================

-- THE PRICES ARE NO LONGER WRITTEN ONLY BY MIGRATIONS. Card P3-68 (migration
-- 0048) lets the owner add a price line and change a price from a screen. Until
-- then this section signed in as the OWNER and read:
--
--   "a signed-in owner CHANGED a price; the list is written only by migrations"
--
-- That sentence is false after 0048, and it is kept here rather than deleted
-- (CLAUDE.md 9c). What stays true of every account that is not the owner is
-- asserted below, against an account manager; what the owner may and may not do
-- is asserted in assertions/0048_sheet_options_admin.sql.

insert into auth.users (id, email) values
  ('e3580000-0000-4000-8000-000000000001', 'p3-58-manager@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3580000-0000-4000-8000-000000000001', 'p3-58-manager@rc-inventory.local', 'account_manager', true);

-- An account manager, signed in: reads all 194, writes none.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e3580000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  n integer;
begin
  select count(*) into n from public.sheet_prices;
  if n <> 194 then
    raise exception 'P3-58: a signed-in account manager reads % of the 194 prices', n;
  end if;

  begin
    insert into public.sheet_prices (price_group, series, thickness_mm, finish, price_lei)
    values ('C-10', 'Econom', 0.30, '', 82);
    raise exception 'P3-58: a signed-in account manager ADDED a price';
  exception when insufficient_privilege then
    null; -- expected
  end;

  -- An update the owner policy does not let through touches no row and raises
  -- nothing, so the proof is the price read back afterwards.
  update public.sheet_prices set price_lei = 1 where price_group = 'C-10';
end
$$;

reset role;

do $$
declare
  n integer;
begin
  select count(*) into n from public.sheet_prices where price_lei = 1;
  if n <> 0 then
    raise exception 'P3-58: a signed-in account manager CHANGED % prices', n;
  end if;
end
$$;

-- Nobody signed in: reads nothing.
set local role anon;

do $$
begin
  begin
    perform 1 from public.sheet_prices limit 1;
    raise exception 'P3-58: anon READ sheet_prices';
  exception when insufficient_privilege then
    null; -- expected
  end;
end
$$;

reset role;

rollback;
