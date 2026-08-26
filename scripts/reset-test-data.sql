-- scripts/reset-test-data.sql
-- Card P2-15. Production test-data reset before first real data.
--
-- THIS FILE IS NOT A MIGRATION AND IS NOT AUTO-APPLIED BY ANY TERMINAL.
-- It lives under scripts/, not under supabase/migrations/, on purpose: it is
-- not part of the schema history, it is a one-shot cleanup that only the owner
-- decides to run. CLAUDE.md section 8.6 stops a terminal applying any statement
-- set containing DELETE, and this file is the reason that rule exists.
--
-- WHO RUNS IT: Ivan, by hand, in the Supabase SQL editor, once, immediately
-- before the first real Rapid Construct data is entered and after P2-12 has
-- landed. The SQL editor connects as an owner role and therefore bypasses RLS,
-- which matters because status_history carries no delete policy for any
-- application role.
--
-- WHY IT EXISTS: CRIT-11 stopped the e2e suite writing into the production
-- project. It did not remove the roughly 300 rows already there. Production
-- opens on /inventar showing 128 active products with names like
-- TEST-DASH-mt8ztoqf, and gate G9 asks Mihai to complete a full cycle on that
-- screen. This file is the cleanup, held for the owner's decision.
--
-- IT CONTRADICTS A STANDING CONVENTION AND SAYS SO. The P2-07 and P2-13
-- convention is that test data is marked cancelled, never deleted. That
-- convention is what keeps a test run from destroying history. This file is the
-- deliberate exception: the rows below are not history, they are residue from a
-- suite that was pointed at the wrong project, and there is no real row among
-- them to protect. Marking 300 rows inactive still leaves them in every count,
-- every join and every export. That is why the exception is authored as a
-- separate owner-run file rather than folded into a card the executor can run.
--
-- ===========================================================================
-- IDENTIFICATION METHOD: THE CRIT-11 MARKER, products.sku LIKE 'TEST-%'
-- ===========================================================================
--
-- One root identifier, chosen over the alternative for three reasons:
--
-- 1. It is the marker the suite actually writes. Every product the e2e specs
--    create carries a TEST- prefix in its SKU (tests/e2e/products.spec.ts,
--    inbound.spec.ts, outbound.spec.ts, dashboard.spec.ts all build their SKU
--    as `TEST-<tag>-<run>`), and the category they file it under is the
--    literal string 'TEST-Categorie'.
--
-- 2. created_by cannot reach the root rows. The column exists on
--    inbound_orders and outbound_issues only. products and categories have no
--    created_by at all, so an identification keyed on the dev accounts could
--    not name a single one of the 128 products the client sees.
--
-- 3. created_by does not survive P2-13. That card retires the dev accounts
--    (owner@rc-inventory.local, manager@rc-inventory.local), and the foreign
--    keys on created_by and changed_by are ON DELETE SET NULL. Deleting the
--    auth users nulls the column, and an identifier that a later card erases is
--    not an identifier.
--
-- Orders and issues are reached THROUGH their lines rather than by a marker of
-- their own, because their references are auto-generated (INT-YYYY-NNNN and
-- IES-YYYY-NNNN) and carry no marker. An order is in scope only when it has at
-- least one line pointing at a TEST- product AND no line pointing at anything
-- else. A mixed order, one real line and one test line, is left alone entirely
-- and reported at the end for the owner to handle by hand. Today no such order
-- exists; the clause is there so this file stays safe if it is ever run late.
--
-- ===========================================================================
-- SHAPE
-- ===========================================================================
--
-- One transaction. Every statement or none.
-- Phase 1 pre-check prints what is about to go, by table, with literal counts.
-- Phase 2 deletes, children before parents, respecting every ON DELETE RESTRICT.
-- Phase 3 post-check prints what remains and asserts nothing marked survived.
--
-- The COMMIT is on the last line, uncommented. Run the file whole. If any
-- count in the pre-check looks wrong, ROLLBACK instead: the pre-check runs
-- inside the same transaction as the deletes, so the numbers you read are the
-- numbers that were true at delete time, not a snapshot from before.

begin;

-- ---------------------------------------------------------------------------
-- The target set, resolved once into temporary tables so that every later
-- statement deletes from exactly the same set. Resolving the predicate inline
-- in each DELETE would re-evaluate it against a table the previous DELETE has
-- already changed, which is how a cleanup half-runs.
-- ---------------------------------------------------------------------------

create temporary table rc_reset_products on commit drop as
select id, sku, name
from public.products
where sku like 'TEST-%';

create temporary table rc_reset_inbound_orders on commit drop as
select o.id, o.reference
from public.inbound_orders o
where exists (
        select 1
        from public.order_lines l
        where l.inbound_order_id = o.id
          and l.product_id in (select id from rc_reset_products)
      )
  and not exists (
        select 1
        from public.order_lines l
        where l.inbound_order_id = o.id
          and l.product_id not in (select id from rc_reset_products)
      );

create temporary table rc_reset_outbound_issues on commit drop as
select i.id, i.reference
from public.outbound_issues i
where exists (
        select 1
        from public.outbound_lines l
        where l.outbound_issue_id = i.id
          and l.product_id in (select id from rc_reset_products)
      )
  and not exists (
        select 1
        from public.outbound_lines l
        where l.outbound_issue_id = i.id
          and l.product_id not in (select id from rc_reset_products)
      );

-- Mixed orders: at least one TEST- line and at least one line that is not.
-- Nothing below touches these. They are printed at the end so the owner sees
-- them rather than discovering them later.
create temporary table rc_reset_mixed on commit drop as
select 'inbound_order' as kind, o.id, o.reference
from public.inbound_orders o
where exists (
        select 1 from public.order_lines l
        where l.inbound_order_id = o.id
          and l.product_id in (select id from rc_reset_products)
      )
  and exists (
        select 1 from public.order_lines l
        where l.inbound_order_id = o.id
          and l.product_id not in (select id from rc_reset_products)
      )
union all
select 'outbound_issue' as kind, i.id, i.reference
from public.outbound_issues i
where exists (
        select 1 from public.outbound_lines l
        where l.outbound_issue_id = i.id
          and l.product_id in (select id from rc_reset_products)
      )
  and exists (
        select 1 from public.outbound_lines l
        where l.outbound_issue_id = i.id
          and l.product_id not in (select id from rc_reset_products)
      );


-- ===========================================================================
-- PHASE 1: PRE-CHECK. Read these numbers before you let the transaction commit.
-- ===========================================================================

select 'PRE products'          as scope, count(*) as row_count from rc_reset_products
union all
select 'PRE inbound_orders',        count(*) from rc_reset_inbound_orders
union all
select 'PRE outbound_issues',       count(*) from rc_reset_outbound_issues
union all
select 'PRE order_lines',           count(*) from public.order_lines
       where inbound_order_id in (select id from rc_reset_inbound_orders)
          or product_id in (select id from rc_reset_products)
union all
select 'PRE outbound_lines',        count(*) from public.outbound_lines
       where outbound_issue_id in (select id from rc_reset_outbound_issues)
          or product_id in (select id from rc_reset_products)
union all
select 'PRE batches',               count(*) from public.batches
       where product_id in (select id from rc_reset_products)
union all
select 'PRE reminders',             count(*) from public.reminders
       where product_id in (select id from rc_reset_products)
union all
select 'PRE status_history',        count(*) from public.status_history
       where (entity_type = 'inbound_order'  and entity_id in (select id from rc_reset_inbound_orders))
          or (entity_type = 'outbound_issue' and entity_id in (select id from rc_reset_outbound_issues))
union all
select 'PRE categories TEST',       count(*) from public.categories where name like 'TEST-%'
union all
select 'PRE MIXED left alone',      count(*) from rc_reset_mixed;


-- ===========================================================================
-- PHASE 2: DELETE. Children first. Every ON DELETE RESTRICT respected.
-- ===========================================================================

-- status_history is polymorphic and carries no foreign key, so it is deleted
-- first and by hand. It is append-only for the application; this file is the
-- only thing that ever removes a row, and only the owner runs it.
delete from public.status_history
where (entity_type = 'inbound_order'  and entity_id in (select id from rc_reset_inbound_orders))
   or (entity_type = 'outbound_issue' and entity_id in (select id from rc_reset_outbound_issues));

-- batches references products, inbound_orders and order_lines, all RESTRICT,
-- so it goes before any of the three.
delete from public.batches
where product_id in (select id from rc_reset_products);

-- outbound_lines references products RESTRICT.
delete from public.outbound_lines
where outbound_issue_id in (select id from rc_reset_outbound_issues)
   or product_id in (select id from rc_reset_products);

-- order_lines references products RESTRICT.
delete from public.order_lines
where inbound_order_id in (select id from rc_reset_inbound_orders)
   or product_id in (select id from rc_reset_products);

-- Both parents are now lineless.
delete from public.outbound_issues
where id in (select id from rc_reset_outbound_issues);

delete from public.inbound_orders
where id in (select id from rc_reset_inbound_orders);

-- reminders cascades from products, but is deleted explicitly so the count in
-- the pre-check is the count that was removed rather than a side effect.
delete from public.reminders
where product_id in (select id from rc_reset_products);

delete from public.products
where id in (select id from rc_reset_products);

-- Categories last, and only the ones the suite created, and only if nothing
-- still points at them. products.category_id is ON DELETE RESTRICT, so a
-- category that a surviving real product uses will not be removed; the NOT
-- EXISTS makes that a skip rather than an error that rolls the file back.
delete from public.categories c
where c.name like 'TEST-%'
  and not exists (select 1 from public.products p where p.category_id = c.id);


-- ===========================================================================
-- PHASE 3: POST-CHECK. Every count below must be 0 except the last two.
-- ===========================================================================

select 'POST products TEST-'        as scope, count(*) as row_count from public.products where sku like 'TEST-%'
union all
select 'POST categories TEST-',           count(*) from public.categories where name like 'TEST-%'
union all
select 'POST orphan batches',             count(*) from public.batches b
       where not exists (select 1 from public.products p where p.id = b.product_id)
union all
select 'POST orphan order_lines',         count(*) from public.order_lines l
       where not exists (select 1 from public.inbound_orders o where o.id = l.inbound_order_id)
union all
select 'POST orphan outbound_lines',      count(*) from public.outbound_lines l
       where not exists (select 1 from public.outbound_issues i where i.id = l.outbound_issue_id)
union all
select 'POST orphan status_history',      count(*) from public.status_history h
       where (h.entity_type = 'inbound_order'
              and not exists (select 1 from public.inbound_orders o where o.id = h.entity_id))
          or (h.entity_type = 'outbound_issue'
              and not exists (select 1 from public.outbound_issues i where i.id = h.entity_id))
union all
select 'POST products remaining',         count(*) from public.products
union all
select 'POST MIXED left alone',           count(*) from rc_reset_mixed;

-- The mixed orders, listed by reference, so the owner can act on them by hand.
-- Empty result is the expected outcome.
select kind, reference from rc_reset_mixed order by kind, reference;

commit;
