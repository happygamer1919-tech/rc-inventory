-- 0012_manager_flagged_products.sql
-- RC Inventory phase 2, card P2-18. The account_manager may create a product
-- only through the extraction confirm path, and only flagged.
--
-- Applied by EXECUTOR under ruling R-012. Runs as one transaction.
-- Contains no DROP TABLE, no TRUNCATE and no DELETE.
--
-- ONE NEAR-MISS, NAMED RATHER THAN BURIED, as ruling R-031 requires. This file
-- contains a `DROP POLICY`:
--
--     drop policy products_insert on public.products;
--
-- It removes a rule about rows and no row. R-031 widened CLAUDE.md 8.6 to the
-- operations that destroy rows and this is not one of them; the three
-- conditions it attaches are met: the statement is quoted verbatim in the
-- report, the file is parsed with pgsql-parser before it goes near the
-- database, and the apply is journalled with this near-miss named. A policy is
-- REPLACED, never edited, so there is no other way to change one.
--
-- ===========================================================================
-- WHAT WAS BROKEN
-- ===========================================================================
--
-- products_insert, from migration 0001, checks is_owner(). So an account_manager
-- confirming a document that names a product the catalogue does not have is
-- refused, in Romanian, at the moment of confirm.
--
-- The account_manager is the operator who uploads supplier documents every day.
-- The extraction lane exists to save that person typing, and it stopped working
-- the first time a supplier sent something new, which is the most ordinary thing
-- a supplier does. Ruling R-032.
--
-- ===========================================================================
-- WHY THE GRANT IS NARROW, AND WHAT MAKES IT CHECKABLE
-- ===========================================================================
--
-- The grant is NOT "an account_manager may create products". It is "an
-- account_manager may create a FLAGGED product", and the difference has to be
-- something the DATABASE can see rather than something the application
-- promises. An application-level check is a check the next screen can forget; a
-- policy is enforced wherever the write comes from.
--
-- needs_review IS THAT DIFFERENCE, and it is not a new column invented for this:
-- migration 0001 created it for exactly this purpose and its comment says so.
--
--   A product created at CONFIRM carries needs_review = true. It is anchored to
--   a document that was uploaded, fired, extracted and reviewed, and it arrives
--   visibly unfinished, waiting for the owner to complete it.
--
--   A product created from the CATALOGUE screen carries needs_review = false,
--   because the owner filling that form IS the review.
--
-- So: an owner may insert any product. Anyone else may insert only a flagged
-- one. That is one WITH CHECK clause and it needs no new column, no new role and
-- no new table.
--
-- WHAT KEEPS THE GRANT FROM BEING UNLIMITED CREATION: products_update still
-- checks is_owner(), untouched by this file. An account_manager cannot clear
-- needs_review, because clearing it is the act of accepting the product into the
-- catalogue, and that is the owner's. Every row that role creates therefore
-- stays visibly unfinished until an owner looks at it.
--
-- IF A LATER CHANGE EVER MAKES needs_review EDITABLE BY AN ACCOUNT_MANAGER,
-- THIS GRANT BECOMES UNLIMITED CREATION AND MUST BE RE-RULED. Written here
-- because the person making that change will be reading products_update, not
-- this file.

begin;

-- ===========================================================================
-- 1. THE INSERT POLICY, REPLACED
-- ===========================================================================

drop policy products_insert on public.products;

create policy products_insert on public.products
  for insert to authenticated
  with check (
    -- The owner, unchanged: any product, flagged or not.
    public.is_owner()
    -- Anyone else: only a flagged one. This is the extraction confirm path and
    -- nothing else reaches it, because no other screen writes needs_review true.
    or needs_review = true
  );

comment on column public.products.needs_review is
  'Set by P2-09 when an extraction names a product the catalogue does not have. Since P2-18 it is also the PRIVILEGE BOUNDARY: products_insert lets a non-owner insert a product only when this is true, so every row an account_manager creates is visibly unfinished and waiting for the owner. products_update stays owner-only, so that role cannot clear it. Making this column editable by an account_manager would turn a narrow grant into unlimited creation.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. The policy definitions are the database-level proof of
-- the rule and belong in the apply journal verbatim.
--
-- Expect three policies on public.products: select to authenticated using true,
-- insert with the two-branch check below, update still owner-only. And no
-- delete policy at all, which is unchanged: products are deactivated, never
-- removed.

select
  policyname,
  cmd,
  roles,
  qual        as using_expression,
  with_check  as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'products'
order by policyname;
