-- assertions/0029_category_paints.sql
-- Card P3-34. The nineteenth category, asserted against the finished schema.
--
-- WHAT IS WORTH ASSERTING. That the row is there, that it is LAST rather than
-- inserted into the middle, and that the eighteen before it did not move. The
-- card's default says reordering would move every category on every screen, so
-- the assertion is about the ORDER and not only about the count.

do $$
declare
  n   integer;
  txt text;
begin
  -- --- nineteen rows, no more and no fewer -----------------------------------
  select count(*) into n from public.categories;
  if n <> 19 then
    raise exception 'expected 19 categories, found %', n;
  end if;

  -- --- the new one exists, spelled with its diacritics -----------------------
  select count(*) into n
  from public.categories where name = 'Vopsele, lacuri și solvenți';
  if n <> 1 then
    raise exception 'the nineteenth category is missing or duplicated: % row(s)', n;
  end if;

  -- --- and it is LAST, which is the card's whole ordering rule ---------------
  select name into txt from public.categories order by sort_order desc limit 1;
  if txt <> 'Vopsele, lacuri și solvenți' then
    raise exception 'the last category by sort_order is %, expected the new one', txt;
  end if;

  -- --- the eighteen before it did not move -----------------------------------
  -- Two anchors, the first and the eighteenth, because a shift of the whole
  -- block would move both and a single-row insertion in the middle would move
  -- only the second.
  select name into txt from public.categories where sort_order = 1;
  if txt <> 'Cimenturi și mortare' then
    raise exception 'sort_order 1 is now %, so the existing categories were reordered', txt;
  end if;
  select name into txt from public.categories where sort_order = 18;
  if txt <> 'Altele' then
    raise exception 'sort_order 18 is now %, so the existing categories were reordered', txt;
  end if;

  -- --- contiguous 1..19, no gaps --------------------------------------------
  if exists (
    select 1 from generate_series(1, 19) g
    where not exists (select 1 from public.categories c where c.sort_order = g)
  ) then
    raise exception 'sort_order is not contiguous 1..19';
  end if;
end $$;
