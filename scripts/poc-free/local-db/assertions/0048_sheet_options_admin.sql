-- assertions/0048_sheet_options_admin.sql
-- Card P3-68. A combination can be retired and is never deleted, and the owner,
-- and nobody else, may add combinations, add price lines, change a price and
-- retire or reactivate a combination.
--
-- WHAT THIS FILE CANNOT PROVE, SAID HERE SO NOBODY READS IT AS PROVEN. It proves
-- what the schema and the policies accept and refuse. That the screen writes
-- through them, that a retired combination disappears from the product form, and
-- that a product naming a retired combination still opens and saves, is
-- tests/e2e/sheet-options-admin.spec.ts, against a real local Supabase stack.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n integer;
begin
  -- --- the column: nullable timestamptz, no default, and no row retired --------
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sheet_options' and column_name = 'retired_at'
    and data_type = 'timestamp with time zone' and is_nullable = 'YES' and column_default is null;
  if n <> 1 then
    raise exception 'P3-68: sheet_options.retired_at is not a nullable timestamptz without a default';
  end if;

  select count(*) into n from public.sheet_options where retired_at is not null;
  if n <> 0 then
    raise exception 'P3-68: % combinations arrive retired, expected none', n;
  end if;

  -- --- each table: its select policy and two owner policies, nothing else ------
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'sheet_options';
  if n <> 3 then
    raise exception 'P3-68: sheet_options carries % policies, expected select, owner insert and owner update', n;
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'sheet_prices';
  if n <> 3 then
    raise exception 'P3-68: sheet_prices carries % policies, expected select, owner insert and owner update', n;
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and roles = '{authenticated}'::name[]
    and (
      (tablename = 'sheet_options' and policyname = 'sheet_options_owner_insert' and cmd = 'INSERT'
        and with_check like '%is_owner()%')
      or (tablename = 'sheet_options' and policyname = 'sheet_options_owner_update' and cmd = 'UPDATE'
        and qual like '%is_owner()%' and with_check like '%is_owner()%')
      or (tablename = 'sheet_prices' and policyname = 'sheet_prices_owner_insert' and cmd = 'INSERT'
        and with_check like '%is_owner()%')
      or (tablename = 'sheet_prices' and policyname = 'sheet_prices_owner_update' and cmd = 'UPDATE'
        and qual like '%is_owner()%' and with_check like '%is_owner()%')
    );
  if n <> 4 then
    raise exception 'P3-68: % of the four owner write policies have the expected command and is_owner() gate', n;
  end if;
end
$$;


-- ===========================================================================
-- 2. THE ACCOUNTS AND A PRODUCT THAT NAMES A COMBINATION
-- ===========================================================================

insert into auth.users (id, email) values
  ('e3680000-0000-4000-8000-000000000001', 'p3-68-owner@rc-inventory.local'),
  ('e3680000-0000-4000-8000-000000000002', 'p3-68-manager@rc-inventory.local'),
  ('e3680000-0000-4000-8000-000000000003', 'p3-68-former-owner@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3680000-0000-4000-8000-000000000001', 'p3-68-owner@rc-inventory.local', 'owner', true),
  ('e3680000-0000-4000-8000-000000000002', 'p3-68-manager@rc-inventory.local', 'account_manager', true),
  ('e3680000-0000-4000-8000-000000000003', 'p3-68-former-owner@rc-inventory.local', 'owner', false);

insert into public.categories (id, name)
values ('e3681000-0000-4000-8000-000000000001', 'Test P3-68');

insert into public.products
  (id, sku, name, category_id, unit, sheet_model, sheet_series, sheet_thickness_mm, sheet_finish)
values
  ('e3682000-0000-4000-8000-000000000001', 'P368-C10', 'Tablă cutată C-10 Standart Zn 0,45 mm',
   'e3681000-0000-4000-8000-000000000001', 'm2', 'C-10', 'Standart Zn', 0.45, '');


-- ===========================================================================
-- 3. THE ACCOUNT MANAGER WRITES NOTHING
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3680000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  n integer;
begin
  select count(*) into n from public.sheet_options;
  if n <> 225 then
    raise exception 'P3-68: a signed-in account manager reads % of the 225 combinations', n;
  end if;

  begin
    insert into public.sheet_options (model, series, thickness_mm, finish, unit, price_group, sort_order)
    values ('P368-MANAGER', 'Econom', 0.45, '', 'm2', 'P368-MANAGER', 9001);
    raise exception 'P3-68: an account manager ADDED a combination';
  exception when insufficient_privilege then
    null; -- expected: the owner insert policy refuses the row
  end;

  begin
    insert into public.sheet_prices (price_group, series, thickness_mm, finish, price_lei)
    values ('P368-MANAGER', 'Econom', 0.45, '', 100);
    raise exception 'P3-68: an account manager ADDED a price';
  exception when insufficient_privilege then
    null; -- expected
  end;

  -- An update the policy does not let through touches no row and raises nothing.
  update public.sheet_options set retired_at = now() where model = 'C-10';
  update public.sheet_prices set price_lei = 1 where price_group = 'C-10';

  begin
    delete from public.sheet_options where model = 'C-10';
    raise exception 'P3-68: an account manager DELETED from sheet_options';
  exception when insufficient_privilege then
    null; -- expected: no delete grant exists
  end;
end
$$;

reset role;

do $$
declare
  n integer;
begin
  select count(*) into n from public.sheet_options where retired_at is not null;
  if n <> 0 then
    raise exception 'P3-68: an account manager retired % combinations', n;
  end if;
  select count(*) into n from public.sheet_prices where price_lei = 1;
  if n <> 0 then
    raise exception 'P3-68: an account manager changed % prices', n;
  end if;
end
$$;


-- ===========================================================================
-- 4. A DEACTIVATED OWNER WRITES NOTHING
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3680000-0000-4000-8000-000000000003","role":"authenticated"}';

do $$
begin
  begin
    insert into public.sheet_options (model, series, thickness_mm, finish, unit, price_group, sort_order)
    values ('P368-FORMER', 'Econom', 0.45, '', 'm2', 'P368-FORMER', 9002);
    raise exception 'P3-68: a deactivated owner ADDED a combination';
  exception when insufficient_privilege then
    null; -- expected: is_owner() is false for a deactivated profile
  end;
end
$$;

reset role;


-- ===========================================================================
-- 5. THE OWNER ADDS, PRICES, RETIRES AND REACTIVATES, AND DELETES NOTHING
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3680000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  n integer;
  price numeric;
begin
  -- --- a new combination and its price line ------------------------------------
  insert into public.sheet_options (model, series, thickness_mm, finish, unit, price_group, sort_order)
  values ('P368-NOU', 'Econom', 0.55, 'matt', 'm2', 'P368-NOU', 9003);

  insert into public.sheet_prices (price_group, series, thickness_mm, finish, price_lei)
  values ('P368-NOU', 'Econom', 0.55, 'matt', 211);

  -- --- the same combination again is refused by the key -------------------------
  begin
    insert into public.sheet_options (model, series, thickness_mm, finish, unit, price_group, sort_order)
    values ('P368-NOU', 'Econom', 0.55, 'matt', 'm2', 'P368-NOU', 9004);
    raise exception 'P3-68: the owner added the same combination twice';
  exception when unique_violation then
    null; -- expected
  end;

  -- --- the table's own checks still hold for the owner ----------------------------
  begin
    insert into public.sheet_options (model, series, thickness_mm, finish, unit, price_group, sort_order)
    values (' P368-SPATIU', 'Econom', 0.55, '', 'm2', 'P368-SPATIU', 9005);
    raise exception 'P3-68: the owner added a model with a leading space';
  exception when check_violation then
    null; -- expected
  end;

  begin
    insert into public.sheet_prices (price_group, series, thickness_mm, finish, price_lei)
    values ('P368-NOU', 'Econom', 0.60, 'matt', 0);
    raise exception 'P3-68: the owner added a price of zero';
  exception when check_violation then
    null; -- expected
  end;

  -- --- a price changes ----------------------------------------------------------
  update public.sheet_prices set price_lei = 233.50
  where price_group = 'P368-NOU' and series = 'Econom' and thickness_mm = 0.55 and finish = 'matt';
  select price_lei into price from public.sheet_prices
  where price_group = 'P368-NOU' and series = 'Econom' and thickness_mm = 0.55 and finish = 'matt';
  if price is distinct from 233.50 then
    raise exception 'P3-68: the owner changed the price to 233.50 and it reads %', price;
  end if;

  -- --- a key column cannot be rewritten, even by the owner -------------------------
  begin
    update public.sheet_options set model = 'P368-ALTUL' where model = 'P368-NOU';
    raise exception 'P3-68: the owner rewrote the model of a combination';
  exception when insufficient_privilege then
    null; -- expected: update is granted on retired_at only
  end;

  begin
    update public.sheet_prices set price_group = 'P368-ALTUL' where price_group = 'P368-NOU';
    raise exception 'P3-68: the owner rewrote the price group of a price line';
  exception when insufficient_privilege then
    null; -- expected: update is granted on price_lei only
  end;

  -- --- nothing is deleted, even by the owner ---------------------------------------
  begin
    delete from public.sheet_options where model = 'P368-NOU';
    raise exception 'P3-68: the owner DELETED a combination';
  exception when insufficient_privilege then
    null; -- expected
  end;

  begin
    delete from public.sheet_prices where price_group = 'P368-NOU';
    raise exception 'P3-68: the owner DELETED a price';
  exception when insufficient_privilege then
    null; -- expected
  end;

  -- --- the combination a product names is retired, and the product is untouched ----
  update public.sheet_options set retired_at = now()
  where model = 'C-10' and series = 'Standart Zn' and thickness_mm = 0.45 and finish = '';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'P3-68: the owner retired % rows of C-10 Standart Zn 0,45 mm, expected 1', n;
  end if;
end
$$;

reset role;

do $$
declare
  n integer;
begin
  select count(*) into n from public.sheet_options;
  if n <> 226 then
    raise exception 'P3-68: sheet_options holds % rows after one addition and one retirement, expected 226', n;
  end if;

  select count(*) into n from public.products
  where id = 'e3682000-0000-4000-8000-000000000001'
    and sheet_model = 'C-10' and sheet_series = 'Standart Zn' and sheet_thickness_mm = 0.45 and sheet_finish = '';
  if n <> 1 then
    raise exception 'P3-68: the product naming the retired combination lost it';
  end if;

  -- The product still saves: its foreign key names a row that is still there.
  begin
    update public.products set name = 'Tablă C-10 redenumită'
    where id = 'e3682000-0000-4000-8000-000000000001';
  exception when foreign_key_violation then
    raise exception 'P3-68: a product naming a retired combination can no longer be saved';
  end;
end
$$;

-- --- the owner reactivates it ----------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"e3680000-0000-4000-8000-000000000001","role":"authenticated"}';

update public.sheet_options set retired_at = null
where model = 'C-10' and series = 'Standart Zn' and thickness_mm = 0.45 and finish = '';

reset role;

do $$
declare
  n integer;
begin
  select count(*) into n from public.sheet_options where retired_at is not null;
  if n <> 0 then
    raise exception 'P3-68: after reactivation % combinations are still retired, expected none', n;
  end if;
end
$$;


-- ===========================================================================
-- 6. NOBODY SIGNED IN WRITES NOTHING
-- ===========================================================================

set local role anon;

do $$
begin
  begin
    insert into public.sheet_options (model, series, thickness_mm, finish, unit, price_group, sort_order)
    values ('P368-ANON', 'Econom', 0.45, '', 'm2', 'P368-ANON', 9006);
    raise exception 'P3-68: anon ADDED a combination';
  exception when insufficient_privilege then
    null; -- expected
  end;

  begin
    insert into public.sheet_prices (price_group, series, thickness_mm, finish, price_lei)
    values ('P368-ANON', 'Econom', 0.45, '', 100);
    raise exception 'P3-68: anon ADDED a price';
  exception when insufficient_privilege then
    null; -- expected
  end;
end
$$;

reset role;

rollback;
