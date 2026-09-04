-- 0030_units_tonne_litre.sql
-- RC Inventory phase 3, card P3-33 (Andre's EXT-04). Two unit labels: t and l.
--
-- WHY. A supplier billing in TONE currently has no unit to be billed in, so the
-- quantity lands under kg and the number is silently multiplied by a thousand.
-- Litri has the same shape with no unit at all behind it.
--
-- NO CONVERSION IS INTRODUCED, AND THAT IS THE CARD'S POINT, not an omission.
-- This file adds two units. It does NOT teach the system that a tonne is a
-- thousand kilograms, because a silent conversion is the defect being fixed, and
-- teaching it one here would replace an invisible multiplication by a thousand
-- with a different invisible multiplication by a thousand.
--
-- THE POSTGRESQL RULE THIS FILE IS SHAPED AROUND, AND WHY IT IS TWO FILES.
--
-- A newly added enum label CANNOT BE USED in the transaction that added it.
-- PostgreSQL raises 55P04, `unsafe use of new value "t" of enum type unit_code`.
--
-- THE FIRST DRAFT WAS ONE FILE with the ADD VALUEs and the rows separated by an
-- explicit `commit`. It applied cleanly through the applier and through the
-- Docker shim, because both feed the file to `psql`, which honours that commit.
-- IT FAILED UNDER `supabase db reset`, which wraps EACH MIGRATION FILE in one
-- transaction of its own: the explicit commit is swallowed and the insert is in
-- the same transaction as the ADD VALUE after all. That is the command CI uses
-- to build the end-to-end stack, so the file worked everywhere it was tested and
-- broke in the one place it had not been.
--
-- The card's defaults said, in terms: "If it turns out not to be fine, split the
-- file and say so." It was not fine. This file adds ONLY the labels. The rows
-- are in 0031, which is a separate file and therefore a separate transaction
-- under every one of the three runners.
--
-- ADD VALUE IF NOT EXISTS, so this file is re-runnable against the shim, which
-- applies every migration from empty on every CI run.

-- ---------------------------------------------------------------------------
-- THE ENUM LABELS, AND NOTHING ELSE. No transaction block: see above.
-- ---------------------------------------------------------------------------

alter type public.unit_code add value if not exists 't';
alter type public.unit_code add value if not exists 'l';


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect nine labels on the enum. The rows arrive in 0031.

select enumlabel, enumsortorder
from pg_enum e join pg_type t on t.oid = e.enumtypid
where t.typname = 'unit_code'
order by e.enumsortorder;
