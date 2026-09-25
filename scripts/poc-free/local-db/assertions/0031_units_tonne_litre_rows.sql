-- assertions/0031_units_tonne_litre_rows.sql
-- Card P3-33. The two new units, asserted against the finished schema.
--
-- IT LIVES ON 0031 AND NOT ON 0030 BECAUSE IT ASSERTS BOTH HALVES: the labels
-- that 0030 adds and the rows that 0031 adds. Every file in this directory runs
-- against the schema AFTER all migrations have applied, so one file asserting
-- the finished state of both is right, and two would duplicate the enum half.
--
-- BOTH HALVES ARE ASSERTED SEPARATELY, and that is the point of the file. An
-- enum label with no row in public.units is a value the database accepts and no
-- screen offers; a row whose code is not a label cannot exist at all. They fail
-- in different ways and a single count would catch neither cleanly.
--
-- AND THE THING THIS CARD MUST NOT HAVE DONE IS ASSERTED TOO: no conversion.
-- A tonne is not taught to be a thousand kilograms anywhere, because replacing an
-- invisible multiplication by a thousand with a different invisible one is not a
-- fix. There is no factor column to check, so what is asserted is that the seven
-- original units still carry exactly the sort_order they carried.

do $$
declare
  n   integer;
  txt text;
begin
  -- --- the enum carries both labels ------------------------------------------
  select count(*) into n
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'unit_code' and e.enumlabel in ('t', 'l');
  if n <> 2 then
    raise exception 'unit_code carries % of the two new labels, expected 2', n;
  end if;

  -- --- nine labels in total, so nothing else crept in ------------------------
  select count(*) into n
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'unit_code';
  if n <> 9 then
    raise exception 'unit_code carries % labels, expected 9', n;
  end if;

  -- --- public.units has a row for each ---------------------------------------
  select count(*) into n from public.units where code in ('t', 'l');
  if n <> 2 then
    raise exception 'public.units has % of the two new rows, expected 2', n;
  end if;

  select count(*) into n from public.units;
  if n <> 9 then
    raise exception 'public.units has % rows, expected 9', n;
  end if;

  -- --- t then l, last, and the original seven did not move -------------------
  select code::text into txt from public.units where sort_order = 8;
  if txt <> 't' then
    raise exception 'sort_order 8 is %, expected t', txt;
  end if;
  select code::text into txt from public.units where sort_order = 9;
  if txt <> 'l' then
    raise exception 'sort_order 9 is %, expected l', txt;
  end if;
  select code::text into txt from public.units where sort_order = 1;
  if txt <> 'm2' then
    raise exception 'sort_order 1 is %, so the original units were reordered', txt;
  end if;
  select code::text into txt from public.units where sort_order = 7;
  if txt <> 'm3' then
    raise exception 'sort_order 7 is %, so the original units were reordered', txt;
  end if;

  -- --- EVERY enum label has a row, and every row has a label -----------------
  -- The two sets must agree. A label with no row is a value nothing offers.
  select string_agg(e.enumlabel, ', ') into txt
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'unit_code'
    and not exists (select 1 from public.units u where u.code::text = e.enumlabel);
  if txt is not null then
    raise exception 'unit_code labels with no row in public.units: %', txt;
  end if;
end $$;
