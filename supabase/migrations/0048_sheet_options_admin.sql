-- 0048_sheet_options_admin.sql
-- RC Inventory phase 3, card P3-68. The owner manages the list of roofing and
-- profiled sheet combinations and their prices from a screen, instead of a
-- developer writing a migration for every change.
--
-- WHAT IT CHANGES, AND IT REMOVES NOTHING
--
--   column   public.sheet_options.retired_at   timestamptz, null
--   grant    insert on public.sheet_options, update (retired_at) on it, to authenticated
--   grant    insert on public.sheet_prices, update (price_lei) on it, to authenticated
--   policy   sheet_options_owner_insert, sheet_options_owner_update   is_owner()
--   policy   sheet_prices_owner_insert,  sheet_prices_owner_update    is_owner()
--
-- NO DELETE, NO DROP, NO TRUNCATE, NO INSERT AND NO UPDATE RUN IN THIS FILE. Not one
-- row of sheet_options, sheet_prices or products is written. Every existing
-- combination gets retired_at null, which means "offered", exactly as today. The
-- select policies of 0046 and 0047 are untouched, so who may READ is unchanged.
--
-- ===========================================================================
-- THE FOUR DECISIONS THIS FILE CARRIES
-- ===========================================================================
--
-- 1. RETIRED, NOT DELETED. A product that already names a combination keeps
--    products_sheet_option_fk satisfied because the row is still there. A retired
--    combination is only no longer offered when a product is added. There is no
--    delete policy and no delete grant, so no signed-in account can remove a row.
--
-- 2. retired_at AND NOT AN active BOOLEAN. check:pending-schema-reads looks for a
--    new column name, as a whole word, in every source file, and "active" is an
--    ordinary word across this codebase (0046 decision 4 names the same trap).
--    retired_at is not, and it also records when the combination was retired.
--
-- 3. UPDATE IS GRANTED PER COLUMN. authenticated may update sheet_options.retired_at
--    and sheet_prices.price_lei, and nothing else. The key columns, the unit and
--    price_group can never be rewritten from a screen, so a product's foreign key
--    (on update restrict) is never even tested by one, and a price line never
--    changes which combinations share it. A correction to a key is a new row.
--
-- 4. OWNER ONLY, WITH THE FUNCTION EVERY OWNER WRITE ALREADY USES. The grants open
--    the tables to authenticated and the policies narrow every insert and update
--    to public.is_owner() (0001), which is false for an account manager, for a
--    deactivated profile and for nobody signed in. anon keeps nothing: 0046 and
--    0047 revoked it and this file grants it nothing.
--
-- ===========================================================================
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. The application code
-- that reads retired_at ships in the same merge and asks first whether it exists
-- (hasSheetOptionRetirement in lib/data/schema-capability.ts): in the minutes
-- between the code landing and this file landing, the product form offers every
-- combination as it does today and the new screen shows the list without its
-- write controls.
--
-- IT RUNS AS ONE TRANSACTION AND IS RE-RUNNABLE, in the shape 0047 uses: add column
-- if not exists, grants that are idempotent, and each policy created only when it
-- is missing. Section 3 checks the result and holds on every run.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs
-- scripts/poc-free/local-db/assertions/0048_sheet_options_admin.sql.

begin;


-- ===========================================================================
-- 1. A COMBINATION CAN BE RETIRED
-- ===========================================================================

alter table public.sheet_options add column if not exists retired_at timestamptz null;

comment on column public.sheet_options.retired_at is
  'When the owner retired this combination from the list. Null means it is offered when a product is added. A retired combination is never deleted: products that already name it keep it. Card P3-68.';

comment on table public.sheet_options is
  'Every model, series, thickness and finish of roofing and profiled sheet that can be picked when a product is added, starting from the Dasterum price list of 07.08.2026 as verified by the owner on 2026-09-15. No prices. Written by migrations and, since card P3-68, by the owner from the Setari screen: added and retired, never deleted. Card P3-57.';

comment on table public.sheet_prices is
  'The price in lei of every line of the Dasterum price list of 07.08.2026, as verified by the owner on 2026-09-15. One row per price line, joined to public.sheet_options on price_group, series, thickness_mm and finish. Written by migrations and, since card P3-68, by the owner from the Setari screen: a line added or its price changed, never deleted. Only ever suggested to an operator, never applied to a product by itself. Card P3-58.';


-- ===========================================================================
-- 2. THE OWNER MAY ADD AND CHANGE, NOBODY MAY DELETE
-- ===========================================================================

grant insert on table public.sheet_options to authenticated;
grant update (retired_at) on table public.sheet_options to authenticated;

grant insert on table public.sheet_prices to authenticated;
grant update (price_lei) on table public.sheet_prices to authenticated;

-- CREATE POLICY has no IF NOT EXISTS, which is why each is a block.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sheet_options' and policyname = 'sheet_options_owner_insert'
  ) then
    create policy sheet_options_owner_insert on public.sheet_options
      for insert to authenticated with check (public.is_owner());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sheet_options' and policyname = 'sheet_options_owner_update'
  ) then
    create policy sheet_options_owner_update on public.sheet_options
      for update to authenticated using (public.is_owner()) with check (public.is_owner());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sheet_prices' and policyname = 'sheet_prices_owner_insert'
  ) then
    create policy sheet_prices_owner_insert on public.sheet_prices
      for insert to authenticated with check (public.is_owner());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sheet_prices' and policyname = 'sheet_prices_owner_update'
  ) then
    create policy sheet_prices_owner_update on public.sheet_prices
      for update to authenticated using (public.is_owner()) with check (public.is_owner());
  end if;
end
$$;


-- ===========================================================================
-- 3. THE RESULT, CHECKED
-- ===========================================================================
--
-- A check, not a change. The column is there and nullable, each table carries its
-- select policy and the two owner policies and no delete policy, authenticated
-- may update only the one column on each table and may delete from neither, and
-- anon holds nothing on either.

do $$
declare
  n integer;
begin
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sheet_options' and column_name = 'retired_at'
    and data_type = 'timestamp with time zone' and is_nullable = 'YES' and column_default is null;
  if n <> 1 then
    raise exception 'P3-68: sheet_options.retired_at is not a nullable timestamptz without a default';
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename in ('sheet_options', 'sheet_prices') and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-68: % delete policies exist on sheet_options or sheet_prices, expected none', n;
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename in ('sheet_options', 'sheet_prices')
    and policyname in ('sheet_options_owner_insert', 'sheet_options_owner_update',
                       'sheet_prices_owner_insert', 'sheet_prices_owner_update')
    and roles = '{authenticated}'::name[]
    and coalesce(qual, with_check) like '%is_owner()%';
  if n <> 4 then
    raise exception 'P3-68: % of the four owner write policies are in place, expected 4', n;
  end if;

  if has_table_privilege('authenticated', 'public.sheet_options', 'DELETE')
     or has_table_privilege('authenticated', 'public.sheet_prices', 'DELETE') then
    raise exception 'P3-68: authenticated may delete from sheet_options or sheet_prices';
  end if;

  if has_table_privilege('authenticated', 'public.sheet_options', 'UPDATE')
     or has_table_privilege('authenticated', 'public.sheet_prices', 'UPDATE') then
    raise exception 'P3-68: authenticated may update every column of sheet_options or sheet_prices, expected one column each';
  end if;

  if not has_column_privilege('authenticated', 'public.sheet_options', 'retired_at', 'UPDATE')
     or has_column_privilege('authenticated', 'public.sheet_options', 'model', 'UPDATE')
     or has_column_privilege('authenticated', 'public.sheet_options', 'price_group', 'UPDATE') then
    raise exception 'P3-68: on sheet_options authenticated may update exactly retired_at';
  end if;

  if not has_column_privilege('authenticated', 'public.sheet_prices', 'price_lei', 'UPDATE')
     or has_column_privilege('authenticated', 'public.sheet_prices', 'price_group', 'UPDATE') then
    raise exception 'P3-68: on sheet_prices authenticated may update exactly price_lei';
  end if;

  if has_table_privilege('anon', 'public.sheet_options', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('anon', 'public.sheet_prices', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'P3-68: anon holds a privilege on sheet_options or sheet_prices';
  end if;
end
$$;

commit;


-- ===========================================================================
-- 4. VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect the 225 combinations with none retired, the 194
-- prices unchanged, and six policies over the two tables.

select count(*) as combinations, count(retired_at) as retired from public.sheet_options;

select count(*) as prices, sum(price_lei) as total_lei from public.sheet_prices;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('sheet_options', 'sheet_prices')
order by tablename, policyname;
