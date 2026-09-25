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
--
-- IT PINNED THE WHOLE SET UNTIL CARD P3-102 AND THAT WAS A TRAP, corrected here.
-- Two checks read "expected 9": the number of labels on unit_code, and the number
-- of rows in public.units. Every file in this directory runs after EVERY
-- migration, so a total pinned by an early file breaks on the next card that adds
-- a unit, which is what 0061 and 0062 did with `set`. The failure is real and the
-- fault is this file's: it was asserting something its own migration never
-- decided, namely that nobody would ever add a tenth unit. docs/LEARNINGS.md and
-- the factory's KNOWN-FAILURES.md both name the class.
--
-- WHAT IT PINS NOW is exactly what 0030 and 0031 did: the nine labels those two
-- files left behind, each in its own position, and the nine rows that match them.
-- Nothing is weakened: the two new labels, the two new rows, the order of all
-- nine and the agreement between labels and rows are all still asserted, and the
-- TOTAL moved to assertions/0062_unit_set_row.sql, where the migration that
-- decides it lives. That is the same move assertions/0049 made when it took the
-- category total off assertions/0029.

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

  -- --- the nine THIS CARD left behind, each in its own position --------------
  -- Not a total: see the header. A later card may add a tenth label, and it may
  -- not move any of these nine.
  select string_agg(first_nine.enumlabel, ',' order by first_nine.enumsortorder) into txt
  from (
    select e.enumlabel, e.enumsortorder
    from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'unit_code'
    order by e.enumsortorder
    limit 9
  ) as first_nine;
  if txt is distinct from 'm2,lm,pcs,bag,kg,roll,m3,t,l' then
    raise exception 'the first nine unit_code labels are %, expected m2,lm,pcs,bag,kg,roll,m3,t,l', coalesce(txt, 'none');
  end if;

  -- --- public.units has a row for each ---------------------------------------
  select count(*) into n from public.units where code in ('t', 'l');
  if n <> 2 then
    raise exception 'public.units has % of the two new rows, expected 2', n;
  end if;

  select count(*) into n from public.units where sort_order between 1 and 9;
  if n <> 9 then
    raise exception 'public.units has % rows in sort_order 1 to 9, expected 9', n;
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
