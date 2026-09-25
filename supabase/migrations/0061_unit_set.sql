-- 0061_unit_set.sql
-- RC Inventory phase 3, card P3-102, Ivan's finding F23 of 2026-09-24, goal G59.
-- One unit label: set.
--
-- WHY. Observed in production on 2026-09-24, on an MPC order confirmation. The
-- document bills "Șurub autoforant, cutie 1000 buc" with UM `set`, and there is
-- no such unit, so the selector on the review screen shows "Alege unitatea" with
-- "Pe document: set" underneath and the operator has to invent an answer. A set
-- is a real packaging unit on a supplier document and it is now a real unit here.
--
-- WHAT IT ADDS, AND IT CHANGES AND REMOVES NOTHING
--
--   enum label   public.unit_code 'set'      new, the tenth
--
-- NO UPDATE, NO DELETE, NO DROP AND NO TRUNCATE RUN IN THIS FILE. No existing
-- label is renamed, reordered or removed, no row of public.units is touched, and
-- no product changes unit. A product's unit is fixed at its first movement
-- (P2-03) and nothing here reaches one.
--
-- NO CONVERSION IS INTRODUCED, HERE OR ANYWHERE. 0030 says it in capitals about
-- the tonne and the litre and it is the rule here too: a set is not taught to be
-- a thousand pieces. A synonym renames a unit, it never multiplies a quantity.
-- Whoever ever adds a conversion factor adds it with a card that says what
-- happens to the quantities already stored.
--
-- `litri` NEEDED NOTHING FROM THIS FILE, and that is worth writing down because
-- the finding names both words. `l` has existed since 0030. Diluant nitro was
-- never a missing unit, it was a missing SYNONYM, and the synonym map in
-- lib/data/unit-synonyms.ts is the whole of its fix.
--
-- `cutie` IS DELIBERATELY NOT ADDED. The goal mentions the word without listing
-- it among the units to create, and a unit invented from a passing mention is a
-- unit every future quantity is read through. It stays unmapped, takes the "this
-- word does not map" path, and the operator's choice for it is remembered per
-- supplier by 0063. Adding it later is a card.
--
-- THE POSTGRESQL RULE THIS FILE IS SHAPED AROUND, AND WHY IT IS TWO FILES.
-- A newly added enum label CANNOT BE USED in the transaction that added it;
-- PostgreSQL raises 55P04. 0030 and 0031 record the whole trap: an explicit
-- `commit` between the two halves of ONE file is not enough, because
-- `supabase db reset`, which CI uses to build the end to end stack, wraps EACH
-- MIGRATION FILE in a transaction of its own and swallows that commit. This file
-- adds ONLY the label. The row is in 0062.
--
-- ADD VALUE IF NOT EXISTS, so this file is re-runnable against the shim, which
-- applies every migration from empty on every CI run.
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs every assertion file.

-- ---------------------------------------------------------------------------
-- THE ENUM LABEL, AND NOTHING ELSE. No transaction block: see above.
-- ---------------------------------------------------------------------------

alter type public.unit_code add value if not exists 'set';


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect ten labels on the enum, with set last. The row arrives in 0062.

select enumlabel, enumsortorder
from pg_enum e join pg_type t on t.oid = e.enumtypid
where t.typname = 'unit_code'
order by e.enumsortorder;
