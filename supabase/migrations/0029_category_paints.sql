-- 0029_category_paints.sql
-- RC Inventory phase 3, card P3-34. The nineteenth category.
--
-- WHY IT IS A ROW AND NOT AN ENUM VALUE. public.categories is a TABLE, by ruling
-- R-018, precisely so Mihai can rename an entry at P2-14 with no code change and
-- no migration. This file adds a row; it changes no type and no constraint.
--
-- SORT_ORDER IS THE NEXT ONE, 19, AND NOT AN INSERTION INTO THE MIDDLE.
-- Reordering the existing eighteen would move every category on every screen, in
-- a card nobody asked to do that in. The card's defaults say so.
--
-- on conflict (name) do nothing, for the same reason 0007 has it: a database
-- where somebody already added the row by hand is not an error, and this file
-- must be re-runnable against the shim, which applies every migration from empty
-- on every CI run.
--
-- ANDRE IS WAITING ON THIS ONE. Five or six lines across three of the sample
-- documents claim this category. R-057's enum-ordering rule applies: OUR side
-- accepts the value before he emits it, so this lands first and the landing is
-- confirmed to him live.

begin;

insert into public.categories (name, sort_order)
values
  ('Vopsele, lacuri și solvenți', 19)
on conflict (name) do nothing;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect nineteen rows, contiguous sort_order, and the new
-- one last.

select count(*) as categories_after from public.categories;

select name, sort_order
from public.categories
order by sort_order;
