-- 0007_seed_categories.sql
-- RC Inventory phase 2, card P2-17. The controlled category vocabulary.
--
-- Applied by EXECUTOR under ruling R-012. Runs as one transaction.
-- Contains no DROP, no TRUNCATE and no DELETE. INSERT only.
--
-- WHY THIS EXISTS. Extraction contract v2 maps an extracted category against
-- "our controlled list". There was no controlled list: public.categories held
-- exactly one row, TEST-Categorie, which is CRIT-11 e2e residue carrying every
-- product in the project. Exporting that as the client's vocabulary would have
-- committed one test string to be read by whoever builds the mapping, long
-- after P2-15 removed the row it named. Ruling R-018 ratified the halt and
-- directed the list to be authored as a schema decision instead. This is it.
--
-- ROWS, NOT AN ENUM, AND THAT IS THE WHOLE POINT. unit_code and currency_code
-- are enums because their members are fixed by physics and by finance. A
-- category vocabulary is neither: it is how one merchant thinks about stock,
-- and Mihai will disagree with some of it. As rows he renames an entry at P2-14
-- with no code change and no migration. As an enum every rename would be a
-- migration and he would stop asking.
--
-- SO THIS IS A WORKING DEFAULT, NOT A SPECIFICATION. Eighteen entries chosen as
-- a construction merchant's vocabulary rather than a generic taxonomy.
--
-- IDEMPOTENT ON RE-RUN. Every insert carries `on conflict (name) do nothing`
-- against the categories_name_unique constraint from migration 0001. A seed
-- that fails on a second run is a seed nobody dares re-run, and the acceptance
-- for this card runs it twice on purpose and asserts the row count does not
-- move.
--
-- THE TEST-Categorie ROW IS NOT TOUCHED. Not renamed, not deactivated, not
-- deleted, not merged into "Altele". It belongs to P2-15 and to the owner
-- decision recorded there. A seed migration that quietly tidied it would be
-- taking that decision on his behalf, which is precisely what P2-15 exists to
-- avoid.
--
-- sort_order IS SET EXPLICITLY, 1 through 18, in the order the list was given.
-- The column exists to control display order; leaving every row at the default
-- 0 would make the order arbitrary and the screen would sort by whatever the
-- planner felt like. "Altele" is last deliberately: a catch-all sorted into the
-- middle of the list reads as a category rather than as the fallback it is.

begin;

insert into public.categories (name, sort_order) values
  ('Cimenturi și mortare',            1),
  ('Zidărie și cărămidă',             2),
  ('Betoane și agregate',             3),
  ('Armături și oțel',                4),
  ('Lemn și plăci',                   5),
  ('Izolații termice',                6),
  ('Hidroizolații',                   7),
  ('Gips-carton și profile',          8),
  ('Finisaje pereți',                 9),
  ('Placări ceramice și adezivi',    10),
  ('Instalații sanitare',            11),
  ('Instalații electrice',           12),
  ('Acoperișuri și tablă',           13),
  ('Feronerie și fixări',            14),
  ('Scule și consumabile',           15),
  ('Uși și ferestre',                16),
  ('Amenajări exterioare',           17),
  ('Altele',                         18)
on conflict (name) do nothing;

commit;
