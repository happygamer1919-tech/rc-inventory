-- 0046_sheet_options.sql
-- RC Inventory phase 3, card P3-57. Model, series and thickness for roofing and
-- profiled sheet products, picked from the verified Dasterum list instead of typed.
--
-- WHAT IT CHANGES, AND IT REMOVES NOTHING
--
--   table       public.sheet_options                 the allowed combinations, 225 rows
--   columns     public.products.sheet_model          text, null
--               public.products.sheet_series         text, null
--               public.products.sheet_thickness_mm   numeric(3,2), null
--               public.products.sheet_finish         text, null
--   constraint  products_sheet_complete              the four are all null or all present
--   constraint  products_sheet_option_fk             the four name a row of sheet_options
--
-- NO DELETE, NO DROP AND NO TRUNCATE RUN IN THIS FILE. The only rows written are
-- the reference list. Every existing product keeps the four columns null, which
-- means "not picked from the list", and nothing about it changes.
--
-- NO PRICE IS WRITTEN. The list comes from the factory file
-- inputs/dasterum-pret-2026-08-07-verificat.csv (194 lines, checked by Max on
-- 2026-09-15), and its lei column is deliberately NOT here: loading prices is a
-- separate card that the owner approves on its own.
--
-- ===========================================================================
-- THE FOUR DECISIONS THIS FILE CARRIES
-- ===========================================================================
--
-- 1. A REFERENCE TABLE AND NOT FOUR FREE COLUMNS WITH A CHECK. A CHECK would have
--    to spell 225 combinations inside one constraint, and the next price card
--    would have nothing to match its lines against. A table is one row per
--    combination, a composite foreign key makes a combination outside it
--    unstorable by any writer, and the price card joins on it.
--
-- 2. finish IS '' WHERE THE LIST HAS NONE, NOT NULL. The primary key and the
--    foreign key both need the four values present: a null finish would leave the
--    foreign key unchecked for exactly the most common combinations. On products,
--    products_sheet_complete requires all four or none, so a picked product always
--    carries a finish, '' included, and the key is always checked.
--
-- 3. TWO CSV LINES NAME TWO PROFILES AT ONCE, "PK/PS-20, VP-20" and
--    "Monterrey, Valencia", and Rapid Construct stock each profile separately. Each
--    profile gets its own rows, which is why 194 lines become 225 rows.
--    price_group keeps the CSV's own model text, so the price card still matches
--    exactly 194 distinct lines, and section 3 asserts that.
--
-- 4. THE COLUMNS ARE CALLED sheet_* AND NOT model, series OR finish.
--    check:pending-schema-reads looks for a new column name, as a whole word, in
--    every source file, and "model" is an ordinary word in the extraction code.
--
-- ===========================================================================
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. The application code
-- that reads the new table and columns ships in the same merge and asks first
-- whether they exist (hasSheetOptions in lib/data/schema-capability.ts), so in the
-- minutes between the code landing and this file landing the product form looks
-- exactly as it does today.
--
-- IT RUNS AS ONE TRANSACTION and is NOT safe to run twice: a second run fails on
-- CREATE TABLE and rolls the whole file back.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs
-- scripts/poc-free/local-db/assertions/0046_sheet_options.sql.

begin;


-- ===========================================================================
-- 1. THE LIST OF ALLOWED COMBINATIONS
-- ===========================================================================

create table public.sheet_options (
  model         text          not null check (model <> '' and model = btrim(model)),
  series        text          not null check (series <> '' and series = btrim(series)),
  thickness_mm  numeric(3,2)  not null check (thickness_mm > 0),
  finish        text          not null default '' check (finish = btrim(finish)),
  unit          public.unit_code not null,
  price_group   text          not null check (price_group <> ''),
  sort_order    integer       not null unique,
  primary key (model, series, thickness_mm, finish)
);

comment on table public.sheet_options is
  'Every model, series, thickness and finish of roofing and profiled sheet that can be picked when a product is added, from the Dasterum price list of 07.08.2026 as verified by the owner on 2026-09-15. No prices. Written only by migrations. Card P3-57.';
comment on column public.sheet_options.finish is
  'The finish where the list names one (matt, W matt, Cr matt, W, matt (V/Q/H)), and the empty string where it names none. Never null, so the foreign key from products is always checked.';
comment on column public.sheet_options.unit is
  'The stock unit a product of this combination is filled with: m2, or pcs for Dastera, which is sold per piece.';
comment on column public.sheet_options.price_group is
  'The model text exactly as the price list writes it. Two profiles can share one price line ("PK/PS-20, VP-20"), so a price card matches on price_group, series, thickness_mm and finish.';

revoke all on table public.sheet_options from anon;
revoke all on table public.sheet_options from authenticated;
grant select on table public.sheet_options to authenticated;

alter table public.sheet_options enable row level security;

create policy sheet_options_select on public.sheet_options
  for select to authenticated using (true);

insert into public.sheet_options (model, series, thickness_mm, finish, unit, price_group, sort_order) values
  ('PS-8',           'AlZn Premium',          0.45, '',             'm2',  'PS-8',                   1),
  ('PS-8',           'AlZn Premium',          0.50, '',             'm2',  'PS-8',                   2),
  ('PS-8',           'Zinc (România/Turcia)', 0.40, '',             'm2',  'PS-8',                   3),
  ('PS-8',           'Zinc (România/Turcia)', 0.45, '',             'm2',  'PS-8',                   4),
  ('PS-8',           'Zinc (România/Turcia)', 0.50, '',             'm2',  'PS-8',                   5),
  ('PS-8',           'Econom',                0.30, '',             'm2',  'PS-8',                   6),
  ('PS-8',           'Econom',                0.40, '',             'm2',  'PS-8',                   7),
  ('PS-8',           'Econom',                0.40, 'matt',         'm2',  'PS-8',                   8),
  ('PS-8',           'Econom',                0.40, 'W matt',       'm2',  'PS-8',                   9),
  ('PS-8',           'Standart Zn',           0.40, '',             'm2',  'PS-8',                  10),
  ('PS-8',           'Standart Zn',           0.40, 'W matt',       'm2',  'PS-8',                  11),
  ('PS-8',           'Standart Zn',           0.45, '',             'm2',  'PS-8',                  12),
  ('PS-8',           'Standart Zn',           0.45, 'Cr matt',      'm2',  'PS-8',                  13),
  ('PS-8',           'Standart Zn',           0.45, 'W',            'm2',  'PS-8',                  14),
  ('PS-8',           'Premium Zn',            0.40, '',             'm2',  'PS-8',                  15),
  ('PS-8',           'Premium Zn',            0.45, '',             'm2',  'PS-8',                  16),
  ('PS-8',           'Premium Zn',            0.45, 'matt (V/Q/H)', 'm2',  'PS-8',                  17),
  ('PS-8',           'Printek Econom',        0.40, '',             'm2',  'PS-8',                  18),
  ('PS-8',           'Printek Premium',       0.40, '',             'm2',  'PS-8',                  19),
  ('PS-8',           'Printek Premium',       0.45, '',             'm2',  'PS-8',                  20),
  ('C-10',           'AlZn Premium',          0.45, '',             'm2',  'C-10',                  21),
  ('C-10',           'AlZn Premium',          0.50, '',             'm2',  'C-10',                  22),
  ('C-10',           'Zinc (România/Turcia)', 0.40, '',             'm2',  'C-10',                  23),
  ('C-10',           'Zinc (România/Turcia)', 0.45, '',             'm2',  'C-10',                  24),
  ('C-10',           'Zinc (România/Turcia)', 0.50, '',             'm2',  'C-10',                  25),
  ('C-10',           'Econom',                0.30, '',             'm2',  'C-10',                  26),
  ('C-10',           'Econom',                0.40, '',             'm2',  'C-10',                  27),
  ('C-10',           'Econom',                0.40, 'matt',         'm2',  'C-10',                  28),
  ('C-10',           'Econom',                0.40, 'W matt',       'm2',  'C-10',                  29),
  ('C-10',           'Standart Zn',           0.40, '',             'm2',  'C-10',                  30),
  ('C-10',           'Standart Zn',           0.40, 'W matt',       'm2',  'C-10',                  31),
  ('C-10',           'Standart Zn',           0.45, '',             'm2',  'C-10',                  32),
  ('C-10',           'Standart Zn',           0.45, 'Cr matt',      'm2',  'C-10',                  33),
  ('C-10',           'Standart Zn',           0.45, 'W',            'm2',  'C-10',                  34),
  ('C-10',           'Premium Zn',            0.40, '',             'm2',  'C-10',                  35),
  ('C-10',           'Premium Zn',            0.45, '',             'm2',  'C-10',                  36),
  ('C-10',           'Premium Zn',            0.45, 'matt (V/Q/H)', 'm2',  'C-10',                  37),
  ('C-10',           'Printek Econom',        0.40, '',             'm2',  'C-10',                  38),
  ('C-10',           'Printek Premium',       0.40, '',             'm2',  'C-10',                  39),
  ('C-10',           'Printek Premium',       0.45, '',             'm2',  'C-10',                  40),
  ('T-12',           'AlZn Premium',          0.45, '',             'm2',  'T-12',                  41),
  ('T-12',           'AlZn Premium',          0.50, '',             'm2',  'T-12',                  42),
  ('T-12',           'Standart Zn',           0.45, '',             'm2',  'T-12',                  43),
  ('T-12',           'Standart Zn',           0.45, 'Cr matt',      'm2',  'T-12',                  44),
  ('T-12',           'Standart Zn',           0.45, 'W',            'm2',  'T-12',                  45),
  ('T-12',           'Premium Zn',            0.45, '',             'm2',  'T-12',                  46),
  ('T-12',           'Premium Zn',            0.45, 'matt (V/Q/H)', 'm2',  'T-12',                  47),
  ('T-12',           'Printek Premium',       0.45, '',             'm2',  'T-12',                  48),
  ('C-15',           'AlZn Premium',          0.45, '',             'm2',  'C-15',                  49),
  ('C-15',           'AlZn Premium',          0.50, '',             'm2',  'C-15',                  50),
  ('C-15',           'AlZn Premium',          0.70, '',             'm2',  'C-15',                  51),
  ('C-15',           'Zinc (România/Turcia)', 0.40, '',             'm2',  'C-15',                  52),
  ('C-15',           'Zinc (România/Turcia)', 0.45, '',             'm2',  'C-15',                  53),
  ('C-15',           'Zinc (România/Turcia)', 0.50, '',             'm2',  'C-15',                  54),
  ('C-15',           'Zinc (România/Turcia)', 0.70, '',             'm2',  'C-15',                  55),
  ('C-15',           'Econom',                0.30, '',             'm2',  'C-15',                  56),
  ('C-15',           'Econom',                0.40, '',             'm2',  'C-15',                  57),
  ('C-15',           'Econom',                0.40, 'matt',         'm2',  'C-15',                  58),
  ('C-15',           'Econom',                0.40, 'W matt',       'm2',  'C-15',                  59),
  ('C-15',           'Standart Zn',           0.40, '',             'm2',  'C-15',                  60),
  ('C-15',           'Standart Zn',           0.40, 'W matt',       'm2',  'C-15',                  61),
  ('C-15',           'Standart Zn',           0.45, '',             'm2',  'C-15',                  62),
  ('C-15',           'Standart Zn',           0.45, 'Cr matt',      'm2',  'C-15',                  63),
  ('C-15',           'Standart Zn',           0.45, 'W',            'm2',  'C-15',                  64),
  ('C-15',           'Premium Zn',            0.40, '',             'm2',  'C-15',                  65),
  ('C-15',           'Premium Zn',            0.45, '',             'm2',  'C-15',                  66),
  ('C-15',           'Premium Zn',            0.45, 'matt (V/Q/H)', 'm2',  'C-15',                  67),
  ('C-15',           'Printek Econom',        0.40, '',             'm2',  'C-15',                  68),
  ('C-15',           'Printek Premium',       0.40, '',             'm2',  'C-15',                  69),
  ('C-15',           'Printek Premium',       0.45, '',             'm2',  'C-15',                  70),
  ('PK/PS-20',       'AlZn Premium',          0.45, '',             'm2',  'PK/PS-20, VP-20',       71),
  ('PK/PS-20',       'AlZn Premium',          0.50, '',             'm2',  'PK/PS-20, VP-20',       72),
  ('PK/PS-20',       'Zinc (România/Turcia)', 0.40, '',             'm2',  'PK/PS-20, VP-20',       73),
  ('PK/PS-20',       'Zinc (România/Turcia)', 0.45, '',             'm2',  'PK/PS-20, VP-20',       74),
  ('PK/PS-20',       'Zinc (România/Turcia)', 0.50, '',             'm2',  'PK/PS-20, VP-20',       75),
  ('PK/PS-20',       'Econom',                0.30, '',             'm2',  'PK/PS-20, VP-20',       76),
  ('PK/PS-20',       'Econom',                0.40, '',             'm2',  'PK/PS-20, VP-20',       77),
  ('PK/PS-20',       'Econom',                0.40, 'matt',         'm2',  'PK/PS-20, VP-20',       78),
  ('PK/PS-20',       'Econom',                0.40, 'W matt',       'm2',  'PK/PS-20, VP-20',       79),
  ('PK/PS-20',       'Standart Zn',           0.40, '',             'm2',  'PK/PS-20, VP-20',       80),
  ('PK/PS-20',       'Standart Zn',           0.40, 'W matt',       'm2',  'PK/PS-20, VP-20',       81),
  ('PK/PS-20',       'Standart Zn',           0.45, '',             'm2',  'PK/PS-20, VP-20',       82),
  ('PK/PS-20',       'Standart Zn',           0.45, 'Cr matt',      'm2',  'PK/PS-20, VP-20',       83),
  ('PK/PS-20',       'Standart Zn',           0.45, 'W',            'm2',  'PK/PS-20, VP-20',       84),
  ('PK/PS-20',       'Premium Zn',            0.40, '',             'm2',  'PK/PS-20, VP-20',       85),
  ('PK/PS-20',       'Premium Zn',            0.45, '',             'm2',  'PK/PS-20, VP-20',       86),
  ('PK/PS-20',       'Premium Zn',            0.45, 'matt (V/Q/H)', 'm2',  'PK/PS-20, VP-20',       87),
  ('PK/PS-20',       'Printek Econom',        0.40, '',             'm2',  'PK/PS-20, VP-20',       88),
  ('PK/PS-20',       'Printek Premium',       0.40, '',             'm2',  'PK/PS-20, VP-20',       89),
  ('PK/PS-20',       'Printek Premium',       0.45, '',             'm2',  'PK/PS-20, VP-20',       90),
  ('VP-20',          'AlZn Premium',          0.45, '',             'm2',  'PK/PS-20, VP-20',       91),
  ('VP-20',          'AlZn Premium',          0.50, '',             'm2',  'PK/PS-20, VP-20',       92),
  ('VP-20',          'Zinc (România/Turcia)', 0.40, '',             'm2',  'PK/PS-20, VP-20',       93),
  ('VP-20',          'Zinc (România/Turcia)', 0.45, '',             'm2',  'PK/PS-20, VP-20',       94),
  ('VP-20',          'Zinc (România/Turcia)', 0.50, '',             'm2',  'PK/PS-20, VP-20',       95),
  ('VP-20',          'Econom',                0.30, '',             'm2',  'PK/PS-20, VP-20',       96),
  ('VP-20',          'Econom',                0.40, '',             'm2',  'PK/PS-20, VP-20',       97),
  ('VP-20',          'Econom',                0.40, 'matt',         'm2',  'PK/PS-20, VP-20',       98),
  ('VP-20',          'Econom',                0.40, 'W matt',       'm2',  'PK/PS-20, VP-20',       99),
  ('VP-20',          'Standart Zn',           0.40, '',             'm2',  'PK/PS-20, VP-20',      100),
  ('VP-20',          'Standart Zn',           0.40, 'W matt',       'm2',  'PK/PS-20, VP-20',      101),
  ('VP-20',          'Standart Zn',           0.45, '',             'm2',  'PK/PS-20, VP-20',      102),
  ('VP-20',          'Standart Zn',           0.45, 'Cr matt',      'm2',  'PK/PS-20, VP-20',      103),
  ('VP-20',          'Standart Zn',           0.45, 'W',            'm2',  'PK/PS-20, VP-20',      104),
  ('VP-20',          'Premium Zn',            0.40, '',             'm2',  'PK/PS-20, VP-20',      105),
  ('VP-20',          'Premium Zn',            0.45, '',             'm2',  'PK/PS-20, VP-20',      106),
  ('VP-20',          'Premium Zn',            0.45, 'matt (V/Q/H)', 'm2',  'PK/PS-20, VP-20',      107),
  ('VP-20',          'Printek Econom',        0.40, '',             'm2',  'PK/PS-20, VP-20',      108),
  ('VP-20',          'Printek Premium',       0.40, '',             'm2',  'PK/PS-20, VP-20',      109),
  ('VP-20',          'Printek Premium',       0.45, '',             'm2',  'PK/PS-20, VP-20',      110),
  ('HC-35',          'AlZn Premium',          0.45, '',             'm2',  'HC-35',                111),
  ('HC-35',          'AlZn Premium',          0.50, '',             'm2',  'HC-35',                112),
  ('HC-35',          'AlZn Premium',          0.70, '',             'm2',  'HC-35',                113),
  ('HC-35',          'Zinc (România/Turcia)', 0.40, '',             'm2',  'HC-35',                114),
  ('HC-35',          'Zinc (România/Turcia)', 0.45, '',             'm2',  'HC-35',                115),
  ('HC-35',          'Zinc (România/Turcia)', 0.50, '',             'm2',  'HC-35',                116),
  ('HC-35',          'Zinc (România/Turcia)', 0.70, '',             'm2',  'HC-35',                117),
  ('HC-35',          'Econom',                0.30, '',             'm2',  'HC-35',                118),
  ('HC-35',          'Econom',                0.40, '',             'm2',  'HC-35',                119),
  ('HC-35',          'Econom',                0.40, 'matt',         'm2',  'HC-35',                120),
  ('HC-35',          'Econom',                0.40, 'W matt',       'm2',  'HC-35',                121),
  ('HC-35',          'Standart Zn',           0.40, '',             'm2',  'HC-35',                122),
  ('HC-35',          'Standart Zn',           0.45, '',             'm2',  'HC-35',                123),
  ('HC-35',          'Standart Zn',           0.45, 'Cr matt',      'm2',  'HC-35',                124),
  ('HC-35',          'Standart Zn',           0.45, 'W',            'm2',  'HC-35',                125),
  ('HC-35',          'Premium Zn',            0.40, '',             'm2',  'HC-35',                126),
  ('HC-35',          'Premium Zn',            0.45, '',             'm2',  'HC-35',                127),
  ('HC-35',          'Premium Zn',            0.45, 'matt (V/Q/H)', 'm2',  'HC-35',                128),
  ('HC-35',          'Printek Econom',        0.40, '',             'm2',  'HC-35',                129),
  ('HC-35',          'Printek Premium',       0.40, '',             'm2',  'HC-35',                130),
  ('HC-35',          'Printek Premium',       0.45, '',             'm2',  'HC-35',                131),
  ('C-44',           'AlZn Premium',          0.45, '',             'm2',  'C-44',                 132),
  ('C-44',           'AlZn Premium',          0.50, '',             'm2',  'C-44',                 133),
  ('C-44',           'AlZn Premium',          0.70, '',             'm2',  'C-44',                 134),
  ('C-44',           'Zinc (România/Turcia)', 0.40, '',             'm2',  'C-44',                 135),
  ('C-44',           'Zinc (România/Turcia)', 0.45, '',             'm2',  'C-44',                 136),
  ('C-44',           'Zinc (România/Turcia)', 0.50, '',             'm2',  'C-44',                 137),
  ('C-44',           'Zinc (România/Turcia)', 0.70, '',             'm2',  'C-44',                 138),
  ('C-44',           'Standart Zn',           0.45, '',             'm2',  'C-44',                 139),
  ('C-44',           'Standart Zn',           0.45, 'Cr matt',      'm2',  'C-44',                 140),
  ('C-44',           'Standart Zn',           0.45, 'W',            'm2',  'C-44',                 141),
  ('C-44',           'Premium Zn',            0.40, '',             'm2',  'C-44',                 142),
  ('C-44',           'Premium Zn',            0.45, '',             'm2',  'C-44',                 143),
  ('C-44',           'Premium Zn',            0.45, 'matt (V/Q/H)', 'm2',  'C-44',                 144),
  ('H-57',           'Zinc (România/Turcia)', 0.70, '',             'm2',  'H-57',                 145),
  ('H-60',           'AlZn Premium',          0.45, '',             'm2',  'H-60',                 146),
  ('H-60',           'AlZn Premium',          0.50, '',             'm2',  'H-60',                 147),
  ('H-60',           'AlZn Premium',          0.70, '',             'm2',  'H-60',                 148),
  ('H-60',           'Zinc (România/Turcia)', 0.40, '',             'm2',  'H-60',                 149),
  ('H-60',           'Zinc (România/Turcia)', 0.45, '',             'm2',  'H-60',                 150),
  ('H-60',           'Zinc (România/Turcia)', 0.50, '',             'm2',  'H-60',                 151),
  ('H-60',           'Zinc (România/Turcia)', 0.70, '',             'm2',  'H-60',                 152),
  ('H-60',           'Econom',                0.40, 'matt',         'm2',  'H-60',                 153),
  ('H-60',           'Standart Zn',           0.45, '',             'm2',  'H-60',                 154),
  ('H-60',           'Standart Zn',           0.45, 'Cr matt',      'm2',  'H-60',                 155),
  ('H-60',           'Standart Zn',           0.45, 'W',            'm2',  'H-60',                 156),
  ('H-60',           'Premium Zn',            0.40, '',             'm2',  'H-60',                 157),
  ('H-60',           'Premium Zn',            0.45, '',             'm2',  'H-60',                 158),
  ('H-60',           'Premium Zn',            0.45, 'matt (V/Q/H)', 'm2',  'H-60',                 159),
  ('Monterrey',      'Econom',                0.40, '',             'm2',  'Monterrey, Valencia',  160),
  ('Monterrey',      'Econom',                0.40, 'matt',         'm2',  'Monterrey, Valencia',  161),
  ('Monterrey',      'Econom',                0.40, 'W matt',       'm2',  'Monterrey, Valencia',  162),
  ('Monterrey',      'Standart Zn',           0.40, '',             'm2',  'Monterrey, Valencia',  163),
  ('Monterrey',      'Standart Zn',           0.40, 'W matt',       'm2',  'Monterrey, Valencia',  164),
  ('Monterrey',      'Standart Zn',           0.45, '',             'm2',  'Monterrey, Valencia',  165),
  ('Monterrey',      'Standart Zn',           0.45, 'Cr matt',      'm2',  'Monterrey, Valencia',  166),
  ('Monterrey',      'Standart Zn',           0.45, 'W',            'm2',  'Monterrey, Valencia',  167),
  ('Monterrey',      'Premium Zn',            0.40, '',             'm2',  'Monterrey, Valencia',  168),
  ('Monterrey',      'Premium Zn',            0.45, '',             'm2',  'Monterrey, Valencia',  169),
  ('Monterrey',      'Premium Zn',            0.45, 'matt (V/Q/H)', 'm2',  'Monterrey, Valencia',  170),
  ('Valencia',       'Econom',                0.40, '',             'm2',  'Monterrey, Valencia',  171),
  ('Valencia',       'Econom',                0.40, 'matt',         'm2',  'Monterrey, Valencia',  172),
  ('Valencia',       'Econom',                0.40, 'W matt',       'm2',  'Monterrey, Valencia',  173),
  ('Valencia',       'Standart Zn',           0.40, '',             'm2',  'Monterrey, Valencia',  174),
  ('Valencia',       'Standart Zn',           0.40, 'W matt',       'm2',  'Monterrey, Valencia',  175),
  ('Valencia',       'Standart Zn',           0.45, '',             'm2',  'Monterrey, Valencia',  176),
  ('Valencia',       'Standart Zn',           0.45, 'Cr matt',      'm2',  'Monterrey, Valencia',  177),
  ('Valencia',       'Standart Zn',           0.45, 'W',            'm2',  'Monterrey, Valencia',  178),
  ('Valencia',       'Premium Zn',            0.40, '',             'm2',  'Monterrey, Valencia',  179),
  ('Valencia',       'Premium Zn',            0.45, '',             'm2',  'Monterrey, Valencia',  180),
  ('Valencia',       'Premium Zn',            0.45, 'matt (V/Q/H)', 'm2',  'Monterrey, Valencia',  181),
  ('Kascad',         'Standart Zn',           0.45, '',             'm2',  'Kascad',               182),
  ('Kascad',         'Standart Zn',           0.45, 'Cr matt',      'm2',  'Kascad',               183),
  ('Kascad',         'Standart Zn',           0.45, 'W',            'm2',  'Kascad',               184),
  ('Kascad',         'Premium Zn',            0.40, '',             'm2',  'Kascad',               185),
  ('Kascad',         'Premium Zn',            0.45, '',             'm2',  'Kascad',               186),
  ('Kascad',         'Premium Zn',            0.45, 'matt (V/Q/H)', 'm2',  'Kascad',               187),
  ('Dastera',        'Standart Zn',           0.45, 'Cr matt',      'pcs', 'Dastera (lei/bucată)', 188),
  ('Tablă netedă',   'AlZn Premium',          0.45, '',             'm2',  'Tablă netedă',         189),
  ('Tablă netedă',   'AlZn Premium',          0.50, '',             'm2',  'Tablă netedă',         190),
  ('Tablă netedă',   'AlZn Premium',          0.70, '',             'm2',  'Tablă netedă',         191),
  ('Tablă netedă',   'Zinc (România/Turcia)', 0.40, '',             'm2',  'Tablă netedă',         192),
  ('Tablă netedă',   'Zinc (România/Turcia)', 0.45, '',             'm2',  'Tablă netedă',         193),
  ('Tablă netedă',   'Zinc (România/Turcia)', 0.50, '',             'm2',  'Tablă netedă',         194),
  ('Tablă netedă',   'Zinc (România/Turcia)', 0.70, '',             'm2',  'Tablă netedă',         195),
  ('Tablă netedă',   'Econom',                0.30, '',             'm2',  'Tablă netedă',         196),
  ('Tablă netedă',   'Econom',                0.40, '',             'm2',  'Tablă netedă',         197),
  ('Tablă netedă',   'Econom',                0.40, 'matt',         'm2',  'Tablă netedă',         198),
  ('Tablă netedă',   'Econom',                0.40, 'W matt',       'm2',  'Tablă netedă',         199),
  ('Tablă netedă',   'Standart Zn',           0.40, '',             'm2',  'Tablă netedă',         200),
  ('Tablă netedă',   'Standart Zn',           0.40, 'W matt',       'm2',  'Tablă netedă',         201),
  ('Tablă netedă',   'Standart Zn',           0.45, '',             'm2',  'Tablă netedă',         202),
  ('Tablă netedă',   'Standart Zn',           0.45, 'Cr matt',      'm2',  'Tablă netedă',         203),
  ('Tablă netedă',   'Standart Zn',           0.45, 'W',            'm2',  'Tablă netedă',         204),
  ('Tablă netedă',   'Premium Zn',            0.40, '',             'm2',  'Tablă netedă',         205),
  ('Tablă netedă',   'Premium Zn',            0.45, '',             'm2',  'Tablă netedă',         206),
  ('Tablă netedă',   'Premium Zn',            0.45, 'matt (V/Q/H)', 'm2',  'Tablă netedă',         207),
  ('Tablă netedă',   'Printek Econom',        0.40, '',             'm2',  'Tablă netedă',         208),
  ('Tablă netedă',   'Printek Premium',       0.40, '',             'm2',  'Tablă netedă',         209),
  ('Tablă netedă',   'Printek Premium',       0.45, '',             'm2',  'Tablă netedă',         210),
  ('Foaie în folie', 'Econom',                0.30, '',             'm2',  'Foaie în folie',       211),
  ('Foaie în folie', 'Econom',                0.40, '',             'm2',  'Foaie în folie',       212),
  ('Foaie în folie', 'Econom',                0.40, 'matt',         'm2',  'Foaie în folie',       213),
  ('Foaie în folie', 'Econom',                0.40, 'W matt',       'm2',  'Foaie în folie',       214),
  ('Foaie în folie', 'Standart Zn',           0.40, '',             'm2',  'Foaie în folie',       215),
  ('Foaie în folie', 'Standart Zn',           0.40, 'W matt',       'm2',  'Foaie în folie',       216),
  ('Foaie în folie', 'Standart Zn',           0.45, '',             'm2',  'Foaie în folie',       217),
  ('Foaie în folie', 'Standart Zn',           0.45, 'Cr matt',      'm2',  'Foaie în folie',       218),
  ('Foaie în folie', 'Standart Zn',           0.45, 'W',            'm2',  'Foaie în folie',       219),
  ('Foaie în folie', 'Premium Zn',            0.40, '',             'm2',  'Foaie în folie',       220),
  ('Foaie în folie', 'Premium Zn',            0.45, '',             'm2',  'Foaie în folie',       221),
  ('Foaie în folie', 'Premium Zn',            0.45, 'matt (V/Q/H)', 'm2',  'Foaie în folie',       222),
  ('Foaie în folie', 'Printek Econom',        0.40, '',             'm2',  'Foaie în folie',       223),
  ('Foaie în folie', 'Printek Premium',       0.40, '',             'm2',  'Foaie în folie',       224),
  ('Foaie în folie', 'Printek Premium',       0.45, '',             'm2',  'Foaie în folie',       225);


-- ===========================================================================
-- 2. THE PICKED COMBINATION, ON THE PRODUCT
-- ===========================================================================
--
-- NULLABLE AND WITHOUT A DEFAULT. Most of the catalogue is not roofing sheet, and
-- a default would write a claim onto every product that predates this file.

alter table public.products add column sheet_model text null;
alter table public.products add column sheet_series text null;
alter table public.products add column sheet_thickness_mm numeric(3,2) null;
alter table public.products add column sheet_finish text null;

comment on column public.products.sheet_model is
  'The model picked from public.sheet_options when the product was added. Null for a product not picked from the list. Card P3-57.';
comment on column public.products.sheet_series is
  'The series picked with sheet_model. Present exactly when sheet_model is.';
comment on column public.products.sheet_thickness_mm is
  'The thickness in millimetres picked with sheet_model. Present exactly when sheet_model is.';
comment on column public.products.sheet_finish is
  'The finish picked with sheet_model, the empty string when the list names none. Present exactly when sheet_model is.';

alter table public.products add constraint products_sheet_complete
  check (
    (sheet_model is null and sheet_series is null and sheet_thickness_mm is null and sheet_finish is null)
    or (sheet_model is not null and sheet_series is not null and sheet_thickness_mm is not null and sheet_finish is not null)
  );

alter table public.products add constraint products_sheet_option_fk
  foreign key (sheet_model, sheet_series, sheet_thickness_mm, sheet_finish)
  references public.sheet_options (model, series, thickness_mm, finish)
  on update restrict on delete restrict;


-- ===========================================================================
-- 3. THE LIST IS THE VERIFIED ONE, COUNTED
-- ===========================================================================
--
-- A check, not a change. 225 rows, sixteen models, 194 distinct price lines, the
-- units the list names, and not one combination offered twice.

do $$
declare
  n integer;
begin
  select count(*) into n from public.sheet_options;
  if n <> 225 then
    raise exception 'P3-57: sheet_options holds % rows, expected 225', n;
  end if;

  select count(distinct model) into n from public.sheet_options;
  if n <> 16 then
    raise exception 'P3-57: sheet_options names % models, expected 16', n;
  end if;

  select count(*) into n from (
    select distinct price_group, series, thickness_mm, finish from public.sheet_options
  ) lines;
  if n <> 194 then
    raise exception 'P3-57: sheet_options covers % price lines, expected the 194 of the verified list', n;
  end if;

  select count(*) into n from public.sheet_options
  where not (unit = 'm2' or (unit = 'pcs' and model = 'Dastera'));
  if n <> 0 then
    raise exception 'P3-57: % sheet_options rows carry a unit the list does not name', n;
  end if;
end
$$;

commit;


-- ===========================================================================
-- 4. VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect 225 rows over sixteen models, the four nullable
-- columns on products, and both constraints.

select model, count(*) as combinations
from public.sheet_options
group by model
order by min(sort_order);

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'products' and column_name like 'sheet\_%'
order by column_name;

select conname
from pg_constraint
where conrelid = 'public.products'::regclass
  and conname in ('products_sheet_complete', 'products_sheet_option_fk');
