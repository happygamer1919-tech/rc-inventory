-- 0047_sheet_prices.sql
-- RC Inventory phase 3, card P3-58. The Dasterum price of every line of the
-- verified list, so that picking a model, series and thickness on the new
-- product form suggests the price instead of leaving it blank.
--
-- WHAT IT CHANGES, AND IT REMOVES NOTHING
--
--   table   public.sheet_prices   one row per price line of the list, 194 rows
--
-- NO DELETE, NO DROP, NO TRUNCATE AND NO UPDATE RUN IN THIS FILE. The only rows
-- written are the 194 new ones, by INSERT. public.sheet_options is READ ONLY here:
-- no column, no row and no constraint of it changes. public.products is not
-- touched at all, so no product's price changes: the price is only SUGGESTED on
-- the form that adds a product, and the operator can type over it before saving.
--
-- THE SOURCE IS ONE FILE. inputs/dasterum-pret-2026-08-07-verificat.csv in the
-- operator's factory folder (sheet Verificare of the Dasterum list of 07.08.2026,
-- checked by Max on 2026-09-15), 194 data lines, the same file migration 0046 took
-- its 194 price lines from. Each line becomes one row below, in the file's own
-- order: model to price_group, serie to series, grosime_mm to thickness_mm,
-- finisaj to finish (the empty string where the cell is empty), pret_lei to
-- price_lei. Nothing is rounded, converted or interpreted on the way.
--
-- ===========================================================================
-- THE FOUR DECISIONS THIS FILE CARRIES
-- ===========================================================================
--
-- 1. A NEW TABLE AND NOT A COLUMN ON sheet_options. A column would have to be
--    filled by UPDATE of 225 existing rows, and this card writes by INSERT only.
--    A separate table also keeps a shared price honest: "PK/PS-20, VP-20" is ONE
--    price line on the list, so it is ONE row here, and the two profiles that
--    share it both find it through their price_group.
--
-- 2. THE KEY IS (price_group, series, thickness_mm, finish) AND THERE IS NO
--    FOREIGN KEY TO sheet_options. price_group is deliberately not unique there
--    (the shared line above names 40 rows), so there is no key for a foreign key
--    to reference. Section 3 asserts the same property instead, and more
--    strongly: the two tables name exactly the same 194 price lines, both ways,
--    or this file fails and applies nothing.
--
-- 3. price_lei IS numeric(14,2), THE TYPE OF products.unit_value_mdl, which is
--    the field the suggestion fills. Lei and MDL are one currency. The list holds
--    whole lei today; the two decimals are there so a later list does not need a
--    migration to hold 142,50.
--
-- 4. THE FILE IS RE-RUNNABLE, in the shape 0029 and 0031 already use here:
--    create table if not exists, the select policy created only when it is
--    missing, and insert ... on conflict do nothing. A second run writes no row
--    and fails on nothing, and the count in section 3 holds on every run.
--
-- ===========================================================================
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. It adds reference data
-- and removes nothing. The application code that reads the new table ships in the
-- same merge and asks first whether it exists (hasSheetPrices in
-- lib/data/schema-capability.ts), so in the minutes between the code landing and
-- this file landing the product form behaves exactly as it does today.
--
-- IT RUNS AS ONE TRANSACTION.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs
-- scripts/poc-free/local-db/assertions/0047_sheet_prices.sql.

begin;


-- ===========================================================================
-- 1. THE PRICE OF A LINE
-- ===========================================================================
--
-- The four columns are the four values a sheet_options row carries for its price
-- line, with the same check-constraint style as that table: trimmed, non-empty
-- text, and finish the empty string rather than null, so the key is always whole.

create table if not exists public.sheet_prices (
  price_group   text          not null check (price_group <> '' and price_group = btrim(price_group)),
  series        text          not null check (series <> '' and series = btrim(series)),
  thickness_mm  numeric(3,2)  not null check (thickness_mm > 0),
  finish        text          not null default '' check (finish = btrim(finish)),
  price_lei     numeric(14,2) not null check (price_lei > 0),
  primary key (price_group, series, thickness_mm, finish)
);

comment on table public.sheet_prices is
  'The price in lei of every line of the Dasterum price list of 07.08.2026, as verified by the owner on 2026-09-15. One row per price line, joined to public.sheet_options on price_group, series, thickness_mm and finish. Reference data: written only by migrations, and only ever suggested to an operator, never applied to a product by itself. Card P3-58.';
comment on column public.sheet_prices.price_group is
  'The model text exactly as the price list writes it, which is what sheet_options.price_group holds. Two profiles can share one price line ("PK/PS-20, VP-20"), and they share this row.';
comment on column public.sheet_prices.price_lei is
  'The price of one unit of that line, in lei, as the verified list gives it. The unit is the one sheet_options carries for the same line: m2, or a piece for Dastera.';

revoke all on table public.sheet_prices from anon;
revoke all on table public.sheet_prices from authenticated;
grant select on table public.sheet_prices to authenticated;

alter table public.sheet_prices enable row level security;

-- CREATE POLICY has no IF NOT EXISTS, and decision 4 above is why this is a block
-- rather than a bare statement.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sheet_prices' and policyname = 'sheet_prices_select'
  ) then
    create policy sheet_prices_select on public.sheet_prices
      for select to authenticated using (true);
  end if;
end
$$;


-- ===========================================================================
-- 2. THE 194 PRICES, IN THE ORDER OF THE VERIFIED LIST
-- ===========================================================================

insert into public.sheet_prices (price_group, series, thickness_mm, finish, price_lei) values
  ('PS-8',                 'AlZn Premium',          0.45, '',             125),
  ('PS-8',                 'AlZn Premium',          0.50, '',             135),
  ('PS-8',                 'Zinc (România/Turcia)', 0.40, '',             110),
  ('PS-8',                 'Zinc (România/Turcia)', 0.45, '',             117),
  ('PS-8',                 'Zinc (România/Turcia)', 0.50, '',             126),
  ('PS-8',                 'Econom',                0.30, '',              81),
  ('PS-8',                 'Econom',                0.40, '',              95),
  ('PS-8',                 'Econom',                0.40, 'matt',          99),
  ('PS-8',                 'Econom',                0.40, 'W matt',       117),
  ('PS-8',                 'Standart Zn',           0.40, '',             124),
  ('PS-8',                 'Standart Zn',           0.40, 'W matt',       125),
  ('PS-8',                 'Standart Zn',           0.45, '',             142),
  ('PS-8',                 'Standart Zn',           0.45, 'Cr matt',      132),
  ('PS-8',                 'Standart Zn',           0.45, 'W',            164),
  ('PS-8',                 'Premium Zn',            0.40, '',             125),
  ('PS-8',                 'Premium Zn',            0.45, '',             140),
  ('PS-8',                 'Premium Zn',            0.45, 'matt (V/Q/H)', 142),
  ('PS-8',                 'Printek Econom',        0.40, '',             133),
  ('PS-8',                 'Printek Premium',       0.40, '',             143),
  ('PS-8',                 'Printek Premium',       0.45, '',             159),
  ('C-10',                 'AlZn Premium',          0.45, '',             127),
  ('C-10',                 'AlZn Premium',          0.50, '',             137),
  ('C-10',                 'Zinc (România/Turcia)', 0.40, '',             112),
  ('C-10',                 'Zinc (România/Turcia)', 0.45, '',             119),
  ('C-10',                 'Zinc (România/Turcia)', 0.50, '',             128),
  ('C-10',                 'Econom',                0.30, '',              82),
  ('C-10',                 'Econom',                0.40, '',              97),
  ('C-10',                 'Econom',                0.40, 'matt',         101),
  ('C-10',                 'Econom',                0.40, 'W matt',       119),
  ('C-10',                 'Standart Zn',           0.40, '',             126),
  ('C-10',                 'Standart Zn',           0.40, 'W matt',       127),
  ('C-10',                 'Standart Zn',           0.45, '',             144),
  ('C-10',                 'Standart Zn',           0.45, 'Cr matt',      134),
  ('C-10',                 'Standart Zn',           0.45, 'W',            167),
  ('C-10',                 'Premium Zn',            0.40, '',             127),
  ('C-10',                 'Premium Zn',            0.45, '',             142),
  ('C-10',                 'Premium Zn',            0.45, 'matt (V/Q/H)', 144),
  ('C-10',                 'Printek Econom',        0.40, '',             136),
  ('C-10',                 'Printek Premium',       0.40, '',             146),
  ('C-10',                 'Printek Premium',       0.45, '',             162),
  ('T-12',                 'AlZn Premium',          0.45, '',             129),
  ('T-12',                 'AlZn Premium',          0.50, '',             140),
  ('T-12',                 'Standart Zn',           0.45, '',             147),
  ('T-12',                 'Standart Zn',           0.45, 'Cr matt',      136),
  ('T-12',                 'Standart Zn',           0.45, 'W',            170),
  ('T-12',                 'Premium Zn',            0.45, '',             145),
  ('T-12',                 'Premium Zn',            0.45, 'matt (V/Q/H)', 147),
  ('T-12',                 'Printek Premium',       0.45, '',             165),
  ('C-15',                 'AlZn Premium',          0.45, '',             130),
  ('C-15',                 'AlZn Premium',          0.50, '',             141),
  ('C-15',                 'AlZn Premium',          0.70, '',             190),
  ('C-15',                 'Zinc (România/Turcia)', 0.40, '',             115),
  ('C-15',                 'Zinc (România/Turcia)', 0.45, '',             122),
  ('C-15',                 'Zinc (România/Turcia)', 0.50, '',             131),
  ('C-15',                 'Zinc (România/Turcia)', 0.70, '',             178),
  ('C-15',                 'Econom',                0.30, '',              84),
  ('C-15',                 'Econom',                0.40, '',              99),
  ('C-15',                 'Econom',                0.40, 'matt',         103),
  ('C-15',                 'Econom',                0.40, 'W matt',       122),
  ('C-15',                 'Standart Zn',           0.40, '',             130),
  ('C-15',                 'Standart Zn',           0.40, 'W matt',       130),
  ('C-15',                 'Standart Zn',           0.45, '',             148),
  ('C-15',                 'Standart Zn',           0.45, 'Cr matt',      137),
  ('C-15',                 'Standart Zn',           0.45, 'W',            171),
  ('C-15',                 'Premium Zn',            0.40, '',             130),
  ('C-15',                 'Premium Zn',            0.45, '',             146),
  ('C-15',                 'Premium Zn',            0.45, 'matt (V/Q/H)', 148),
  ('C-15',                 'Printek Econom',        0.40, '',             139),
  ('C-15',                 'Printek Premium',       0.40, '',             150),
  ('C-15',                 'Printek Premium',       0.45, '',             166),
  ('PK/PS-20, VP-20',      'AlZn Premium',          0.45, '',             130),
  ('PK/PS-20, VP-20',      'AlZn Premium',          0.50, '',             141),
  ('PK/PS-20, VP-20',      'Zinc (România/Turcia)', 0.40, '',             115),
  ('PK/PS-20, VP-20',      'Zinc (România/Turcia)', 0.45, '',             122),
  ('PK/PS-20, VP-20',      'Zinc (România/Turcia)', 0.50, '',             131),
  ('PK/PS-20, VP-20',      'Econom',                0.30, '',              82),
  ('PK/PS-20, VP-20',      'Econom',                0.40, '',              96),
  ('PK/PS-20, VP-20',      'Econom',                0.40, 'matt',         100),
  ('PK/PS-20, VP-20',      'Econom',                0.40, 'W matt',       119),
  ('PK/PS-20, VP-20',      'Standart Zn',           0.40, '',             128),
  ('PK/PS-20, VP-20',      'Standart Zn',           0.40, 'W matt',       128),
  ('PK/PS-20, VP-20',      'Standart Zn',           0.45, '',             146),
  ('PK/PS-20, VP-20',      'Standart Zn',           0.45, 'Cr matt',      135),
  ('PK/PS-20, VP-20',      'Standart Zn',           0.45, 'W',            169),
  ('PK/PS-20, VP-20',      'Premium Zn',            0.40, '',             128),
  ('PK/PS-20, VP-20',      'Premium Zn',            0.45, '',             144),
  ('PK/PS-20, VP-20',      'Premium Zn',            0.45, 'matt (V/Q/H)', 145),
  ('PK/PS-20, VP-20',      'Printek Econom',        0.40, '',             139),
  ('PK/PS-20, VP-20',      'Printek Premium',       0.40, '',             150),
  ('PK/PS-20, VP-20',      'Printek Premium',       0.45, '',             166),
  ('HC-35',                'AlZn Premium',          0.45, '',             142),
  ('HC-35',                'AlZn Premium',          0.50, '',             153),
  ('HC-35',                'AlZn Premium',          0.70, '',             206),
  ('HC-35',                'Zinc (România/Turcia)', 0.40, '',             125),
  ('HC-35',                'Zinc (România/Turcia)', 0.45, '',             132),
  ('HC-35',                'Zinc (România/Turcia)', 0.50, '',             142),
  ('HC-35',                'Zinc (România/Turcia)', 0.70, '',             193),
  ('HC-35',                'Econom',                0.30, '',              92),
  ('HC-35',                'Econom',                0.40, '',             108),
  ('HC-35',                'Econom',                0.40, 'matt',         112),
  ('HC-35',                'Econom',                0.40, 'W matt',       132),
  ('HC-35',                'Standart Zn',           0.40, '',             141),
  ('HC-35',                'Standart Zn',           0.45, '',             160),
  ('HC-35',                'Standart Zn',           0.45, 'Cr matt',      149),
  ('HC-35',                'Standart Zn',           0.45, 'W',            186),
  ('HC-35',                'Premium Zn',            0.40, '',             142),
  ('HC-35',                'Premium Zn',            0.45, '',             158),
  ('HC-35',                'Premium Zn',            0.45, 'matt (V/Q/H)', 160),
  ('HC-35',                'Printek Econom',        0.40, '',             151),
  ('HC-35',                'Printek Premium',       0.40, '',             162),
  ('HC-35',                'Printek Premium',       0.45, '',             180),
  ('C-44',                 'AlZn Premium',          0.45, '',             143),
  ('C-44',                 'AlZn Premium',          0.50, '',             155),
  ('C-44',                 'AlZn Premium',          0.70, '',             208),
  ('C-44',                 'Zinc (România/Turcia)', 0.40, '',             126),
  ('C-44',                 'Zinc (România/Turcia)', 0.45, '',             134),
  ('C-44',                 'Zinc (România/Turcia)', 0.50, '',             144),
  ('C-44',                 'Zinc (România/Turcia)', 0.70, '',             196),
  ('C-44',                 'Standart Zn',           0.45, '',             162),
  ('C-44',                 'Standart Zn',           0.45, 'Cr matt',      151),
  ('C-44',                 'Standart Zn',           0.45, 'W',            188),
  ('C-44',                 'Premium Zn',            0.40, '',             143),
  ('C-44',                 'Premium Zn',            0.45, '',             160),
  ('C-44',                 'Premium Zn',            0.45, 'matt (V/Q/H)', 162),
  ('H-57',                 'Zinc (România/Turcia)', 0.70, '',             253),
  ('H-60',                 'AlZn Premium',          0.45, '',             146),
  ('H-60',                 'AlZn Premium',          0.50, '',             158),
  ('H-60',                 'AlZn Premium',          0.70, '',             213),
  ('H-60',                 'Zinc (România/Turcia)', 0.40, '',             129),
  ('H-60',                 'Zinc (România/Turcia)', 0.45, '',             137),
  ('H-60',                 'Zinc (România/Turcia)', 0.50, '',             147),
  ('H-60',                 'Zinc (România/Turcia)', 0.70, '',             200),
  ('H-60',                 'Econom',                0.40, 'matt',         116),
  ('H-60',                 'Standart Zn',           0.45, '',             166),
  ('H-60',                 'Standart Zn',           0.45, 'Cr matt',      154),
  ('H-60',                 'Standart Zn',           0.45, 'W',            192),
  ('H-60',                 'Premium Zn',            0.40, '',             146),
  ('H-60',                 'Premium Zn',            0.45, '',             164),
  ('H-60',                 'Premium Zn',            0.45, 'matt (V/Q/H)', 166),
  ('Monterrey, Valencia',  'Econom',                0.40, '',              95),
  ('Monterrey, Valencia',  'Econom',                0.40, 'matt',          99),
  ('Monterrey, Valencia',  'Econom',                0.40, 'W matt',       117),
  ('Monterrey, Valencia',  'Standart Zn',           0.40, '',             124),
  ('Monterrey, Valencia',  'Standart Zn',           0.40, 'W matt',       125),
  ('Monterrey, Valencia',  'Standart Zn',           0.45, '',             142),
  ('Monterrey, Valencia',  'Standart Zn',           0.45, 'Cr matt',      132),
  ('Monterrey, Valencia',  'Standart Zn',           0.45, 'W',            165),
  ('Monterrey, Valencia',  'Premium Zn',            0.40, '',             125),
  ('Monterrey, Valencia',  'Premium Zn',            0.45, '',             140),
  ('Monterrey, Valencia',  'Premium Zn',            0.45, 'matt (V/Q/H)', 142),
  ('Kascad',               'Standart Zn',           0.45, '',             145),
  ('Kascad',               'Standart Zn',           0.45, 'Cr matt',      134),
  ('Kascad',               'Standart Zn',           0.45, 'W',            168),
  ('Kascad',               'Premium Zn',            0.40, '',             128),
  ('Kascad',               'Premium Zn',            0.45, '',             144),
  ('Kascad',               'Premium Zn',            0.45, 'matt (V/Q/H)', 146),
  ('Dastera (lei/bucată)', 'Standart Zn',           0.45, 'Cr matt',      137),
  ('Tablă netedă',         'AlZn Premium',          0.45, '',             125),
  ('Tablă netedă',         'AlZn Premium',          0.50, '',             135),
  ('Tablă netedă',         'AlZn Premium',          0.70, '',             183),
  ('Tablă netedă',         'Zinc (România/Turcia)', 0.40, '',              94),
  ('Tablă netedă',         'Zinc (România/Turcia)', 0.45, '',              99),
  ('Tablă netedă',         'Zinc (România/Turcia)', 0.50, '',             108),
  ('Tablă netedă',         'Zinc (România/Turcia)', 0.70, '',             143),
  ('Tablă netedă',         'Econom',                0.30, '',              81),
  ('Tablă netedă',         'Econom',                0.40, '',              95),
  ('Tablă netedă',         'Econom',                0.40, 'matt',          99),
  ('Tablă netedă',         'Econom',                0.40, 'W matt',       117),
  ('Tablă netedă',         'Standart Zn',           0.40, '',             124),
  ('Tablă netedă',         'Standart Zn',           0.40, 'W matt',       125),
  ('Tablă netedă',         'Standart Zn',           0.45, '',             142),
  ('Tablă netedă',         'Standart Zn',           0.45, 'Cr matt',      132),
  ('Tablă netedă',         'Standart Zn',           0.45, 'W',            164),
  ('Tablă netedă',         'Premium Zn',            0.40, '',             125),
  ('Tablă netedă',         'Premium Zn',            0.45, '',             140),
  ('Tablă netedă',         'Premium Zn',            0.45, 'matt (V/Q/H)', 142),
  ('Tablă netedă',         'Printek Econom',        0.40, '',             133),
  ('Tablă netedă',         'Printek Premium',       0.40, '',             143),
  ('Tablă netedă',         'Printek Premium',       0.45, '',             159),
  ('Foaie în folie',       'Econom',                0.30, '',              86),
  ('Foaie în folie',       'Econom',                0.40, '',             100),
  ('Foaie în folie',       'Econom',                0.40, 'matt',         117),
  ('Foaie în folie',       'Econom',                0.40, 'W matt',       122),
  ('Foaie în folie',       'Standart Zn',           0.40, '',             131),
  ('Foaie în folie',       'Standart Zn',           0.40, 'W matt',       131),
  ('Foaie în folie',       'Standart Zn',           0.45, '',             147),
  ('Foaie în folie',       'Standart Zn',           0.45, 'Cr matt',      139),
  ('Foaie în folie',       'Standart Zn',           0.45, 'W',            169),
  ('Foaie în folie',       'Premium Zn',            0.40, '',             130),
  ('Foaie în folie',       'Premium Zn',            0.45, '',             145),
  ('Foaie în folie',       'Premium Zn',            0.45, 'matt (V/Q/H)', 150),
  ('Foaie în folie',       'Printek Econom',        0.40, '',             138),
  ('Foaie în folie',       'Printek Premium',       0.40, '',             148),
  ('Foaie în folie',       'Printek Premium',       0.45, '',             164)
on conflict (price_group, series, thickness_mm, finish) do nothing;


-- ===========================================================================
-- 3. THE PRICES ARE THE VERIFIED ONES, AND THEY COVER THE LIST EXACTLY
-- ===========================================================================
--
-- A check, not a change. 194 rows, a sum that changes if any single price was
-- mistyped, and the same 194 price lines as sheet_options in both directions, so
-- neither a price without a combination nor a combination without a price can
-- survive this file.

do $$
declare
  n integer;
  total numeric;
begin
  select count(*) into n from public.sheet_prices;
  if n <> 194 then
    raise exception 'P3-58: sheet_prices holds % rows, expected the 194 lines of the verified list', n;
  end if;

  select sum(price_lei) into total from public.sheet_prices;
  if total <> 26832 then
    raise exception 'P3-58: the 194 prices sum to %, expected 26832', total;
  end if;

  select count(*) into n
  from (select distinct price_group, series, thickness_mm, finish from public.sheet_options) o
  where not exists (
    select 1 from public.sheet_prices p
    where p.price_group = o.price_group and p.series = o.series
      and p.thickness_mm = o.thickness_mm and p.finish = o.finish
  );
  if n <> 0 then
    raise exception 'P3-58: % price lines of sheet_options have no price', n;
  end if;

  select count(*) into n
  from public.sheet_prices p
  where not exists (
    select 1 from public.sheet_options o
    where o.price_group = p.price_group and o.series = p.series
      and o.thickness_mm = p.thickness_mm and o.finish = p.finish
  );
  if n <> 0 then
    raise exception 'P3-58: % prices name a line that sheet_options does not have', n;
  end if;
end
$$;

commit;


-- ===========================================================================
-- 4. VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect 194 prices over the sixteen models of the list, and
-- every one of the 225 combinations able to find its price.

select count(*) as prices, sum(price_lei) as total_lei from public.sheet_prices;

select o.model, count(*) as combinations, min(p.price_lei) as pret_min, max(p.price_lei) as pret_max
from public.sheet_options o
join public.sheet_prices p
  on p.price_group = o.price_group and p.series = o.series
 and p.thickness_mm = o.thickness_mm and p.finish = o.finish
group by o.model
order by min(o.sort_order);
