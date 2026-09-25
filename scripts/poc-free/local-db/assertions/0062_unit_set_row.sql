-- assertions/0062_unit_set_row.sql
-- Card P3-102, Ivan's finding F23, goal G59. The unit `set`, asserted against the
-- finished schema.
--
-- IT LIVES ON 0062 AND NOT ON 0061 BECAUSE IT ASSERTS BOTH HALVES: the label that
-- 0061 adds and the row that 0062 adds. Every file in this directory runs against
-- the schema AFTER all migrations have applied, so one file asserting the finished
-- state of both is right, and two would duplicate the enum half. That is the shape
-- assertions/0031 uses for t and l, and this file follows it deliberately.
--
-- THE TOTAL LIVES HERE NOW. assertions/0031 pinned "expected 9" for both the label
-- count and the row count, which is a total its own migration never decided, and
-- adding a tenth unit broke it. It now pins the nine it left behind, in order, and
-- the TOTAL moved to this file, the file of the migration that decides it. The next
-- card that adds a unit changes this one line and nothing else. assertions/0049 made
-- the same move when it took the category total off assertions/0029.
--
-- AND THE THING THIS CARD MUST NOT HAVE DONE IS ASSERTED TOO: no conversion, and
-- no existing unit moved. A set is not taught to be a thousand pieces. There is no
-- factor column anywhere to check, so what is asserted is that the nine units that
-- were there still carry exactly the sort_order they carried, and that `set` went
-- after them rather than among them.
--
-- WHAT THIS FILE CANNOT PROVE, SAID HERE SO NOBODY READS IT AS PROVEN. It proves
-- what the enum and the table hold. That the review screen maps `set` and `litri`
-- to a unit with no empty selector is
-- tests/e2e/extraction-units-and-zero-line.spec.ts, against a real local Supabase
-- stack, and that the settings screen names the new unit is the same suite.

do $$
declare
  n   integer;
  txt text;
begin
  -- --- the enum carries the label --------------------------------------------
  select count(*) into n
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'unit_code' and e.enumlabel = 'set';
  if n <> 1 then
    raise exception 'P3-102: unit_code carries % labels named set, expected 1', n;
  end if;

  -- --- ten labels in total, so nothing else crept in -------------------------
  select count(*) into n
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'unit_code';
  if n <> 10 then
    raise exception 'P3-102: unit_code carries % labels, expected 10', n;
  end if;

  -- --- and they are these ten, in this order ---------------------------------
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into txt
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'unit_code';
  if txt is distinct from 'm2,lm,pcs,bag,kg,roll,m3,t,l,set' then
    raise exception 'P3-102: the unit_code labels are %, expected m2,lm,pcs,bag,kg,roll,m3,t,l,set', coalesce(txt, 'none');
  end if;

  -- --- public.units has the row ----------------------------------------------
  select count(*) into n from public.units where code = 'set';
  if n <> 1 then
    raise exception 'P3-102: public.units has % rows for set, expected 1', n;
  end if;

  select count(*) into n from public.units;
  if n <> 10 then
    raise exception 'P3-102: public.units has % rows, expected 10', n;
  end if;

  -- --- set is LAST, and the nine before it did not move ----------------------
  select code::text into txt from public.units where sort_order = 10;
  if txt is distinct from 'set' then
    raise exception 'P3-102: sort_order 10 is %, expected set', coalesce(txt, 'missing');
  end if;

  select string_agg(code::text, ',' order by sort_order) into txt
  from public.units where sort_order between 1 and 9;
  if txt is distinct from 'm2,lm,pcs,bag,kg,roll,m3,t,l' then
    raise exception 'P3-102: the nine units before set are %, so they were reordered', coalesce(txt, 'none');
  end if;

  -- --- EVERY enum label has a row, and every row has a label -----------------
  -- The two sets must agree. A label with no row is a value nothing offers, and a
  -- row with no label cannot exist at all. assertions/0031 asserts the same thing
  -- and it is repeated here because this card added one of each.
  select string_agg(e.enumlabel, ', ') into txt
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'unit_code'
    and not exists (select 1 from public.units u where u.code::text = e.enumlabel);
  if txt is not null then
    raise exception 'P3-102: unit_code labels with no row in public.units: %', txt;
  end if;

  -- --- NO PRODUCT WAS MOVED ONTO THE NEW UNIT --------------------------------
  -- A migration that adds a unit and quietly reinterprets a stored quantity is
  -- the defect 0030 was written against. Adding the unit is all this card did.
  select count(*) into n from public.products where unit = 'set';
  if n <> 0 then
    raise exception 'P3-102: % products are already on the new unit, so something moved them', n;
  end if;
end $$;
