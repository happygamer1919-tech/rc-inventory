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
-- IDENTIFICATION METHOD: TWO MARKERS, BOTH WRITTEN BY THE SUITE
-- ===========================================================================
--
-- CORRECTED 2026-08-27 UNDER RULING R-033. The file previously identified test
-- data by ONE marker, products.sku LIKE 'TEST-%'. That was every test product
-- when it was written, and it stopped being every test product the day the
-- extraction review lane shipped.
--
-- WHAT IT MISSED, AND WHY THE POST-CHECK WOULD NOT HAVE SAID SO. P2-09's review
-- screen creates a flagged product when an extracted line names something the
-- catalogue does not have, and its SKU is shaped EXT-<slug>-<hex>. Those rows
-- did not match 'TEST-%', so they survived. Worse than surviving alone: the
-- inbound order created by confirming that document has lines pointing ONLY at
-- them, so under the old definition it had a line pointing at a product outside
-- the delete set, which made it MIXED, which meant it was left alone by design.
-- One acceptance run therefore left behind a product, an order, its lines and
-- its history row, and the post-check still printed zero, because the post-check
-- counts what the selector selected.
--
-- A selector is a claim about what test data looks like, and it goes stale the
-- moment a card adds a new way to create a row.
--
-- MARKER ONE, products.sku LIKE 'TEST-%', chosen over the alternative for three
-- reasons:
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
-- MARKER TWO, extraction_drafts.document_filename LIKE 'TEST-%', which reaches
-- everything the extraction lane creates.
--
-- It is the same kind of marker as the first and for the same reason: it is what
-- the suite actually writes. tests/e2e/review.spec.ts uploads its documents as
-- TEST-<tag>-<run>.pdf, and every EXT- product, every order and every draft that
-- lane produces descends from one of those uploads. So the EXT- products in
-- scope are not "every product whose SKU starts with EXT-", which would catch
-- real ones the day after launch. They are the products that appear on an order
-- that was created by confirming a draft carrying the marker. The chain is
-- evidence, not a name pattern.
--
-- THE ONLY FALSE POSITIVE EITHER MARKER CAN PRODUCE is a REAL supplier document
-- whose filename begins with TEST-, or a real product whose SKU begins with
-- TEST-. That exposure is not new and is not larger than it was: it is exactly
-- the exposure marker one has always carried.
--
-- THE EXTRACTION DRAFTS THEMSELVES GO TOO, and they are the part nobody had
-- looked for. extraction_drafts and extraction_draft_lines were created by
-- migration 0008, after this file was authored, and nothing here has ever
-- touched them. Every acceptance run leaves rows in both. They are visible: the
-- review panel on /incarca-comanda lists them, so production would have opened
-- with a list of TEST- documents waiting for Mihai to verify. Three ways in,
-- all of them evidence rather than guesswork: the filename marker, a draft whose
-- order_id names an order in the delete set (the P2-08a attach lane, where
-- order_id IS an inbound_orders id), and a draft whose confirmed_inbound_order_id
-- names one (the P2-09 lane, where the draft records the order it became).
--
-- Orders and issues are reached THROUGH their lines rather than by a marker of
-- their own, because their references are auto-generated (INT-YYYY-NNNN and
-- IES-YYYY-NNNN) and carry no marker. An order is in scope only when it has at
-- least one line pointing at a product in the delete set AND no line pointing at
-- anything else. A GENUINELY MIXED ORDER, one real line and one test line, is
-- still left alone entirely and still reported at the end by reference for the
-- owner to handle by hand. That rule is unchanged and is the reason the delete
-- set is resolved in stages below: the order test is applied against the FULL
-- product set, so an order made only of EXT- products from a test document is
-- wholly test-originated and goes, while an order that really does mix a test
-- line with a real one is still never touched.
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

-- STAGE 1. The products the suite named directly.
create temporary table rc_reset_products_test on commit drop as
select id, sku, name
from public.products
where sku like 'TEST-%';

-- STAGE 2. The orders made only of those, needed here only to recognise the
-- drafts of the P2-08a attach lane, where order_id IS an inbound_orders id.
create temporary table rc_reset_orders_seed on commit drop as
select o.id
from public.inbound_orders o
where exists (
        select 1 from public.order_lines l
        where l.inbound_order_id = o.id
          and l.product_id in (select id from rc_reset_products_test)
      )
  and not exists (
        select 1 from public.order_lines l
        where l.inbound_order_id = o.id
          and l.product_id not in (select id from rc_reset_products_test)
      );

-- STAGE 3. The extraction drafts the suite created, by the three ways in.
create temporary table rc_reset_drafts_seed on commit drop as
select d.order_id, d.confirmed_inbound_order_id
from public.extraction_drafts d
where d.document_filename like 'TEST-%'
   or d.order_id in (select id from rc_reset_orders_seed)
   or d.confirmed_inbound_order_id in (select id from rc_reset_orders_seed);

-- STAGE 4. The flagged products those drafts produced at confirm.
--
-- NOT "every product whose SKU starts with EXT-". A product is here only when it
-- sits on an order that a seed draft became, which is a chain of evidence back
-- to a document the suite uploaded. A real EXT- product created after launch
-- descends from a real document and is never in this set.
create temporary table rc_reset_products_ext on commit drop as
select distinct p.id, p.sku, p.name
from public.products p
join public.order_lines l on l.product_id = p.id
where p.sku like 'EXT-%'
  and l.inbound_order_id in (
        select confirmed_inbound_order_id
        from rc_reset_drafts_seed
        where confirmed_inbound_order_id is not null
      );

-- STAGE 5. The full product set. Everything after this point uses only this.
create temporary table rc_reset_products on commit drop as
select id, sku, name from rc_reset_products_test
union
select id, sku, name from rc_reset_products_ext;

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

-- STAGE 6. The drafts, final. Widened now that the full order set is known: a
-- draft attached to, or confirmed into, any order in the delete set goes with
-- it. Deleting these BEFORE the orders means the reset never fires the
-- on delete set null path on extraction_drafts.confirmed_inbound_order_id at
-- all, which is one fewer thing that has to be true for this file to be safe.
create temporary table rc_reset_extraction_drafts on commit drop as
select d.order_id
from public.extraction_drafts d
where d.order_id in (select order_id from rc_reset_drafts_seed)
   or d.order_id in (select id from rc_reset_inbound_orders)
   or d.confirmed_inbound_order_id in (select id from rc_reset_inbound_orders);


-- Mixed orders: at least one line in the delete set and at least one that is not.
--
-- THE ORDER ROW IS NEVER DELETED. What is NOT true, and was not true before this
-- correction either, is that a mixed order is left byte-for-byte untouched: its
-- lines pointing at a product in the delete set ARE removed, because
-- order_lines.product_id is ON DELETE RESTRICT and the product cannot go while a
-- line still points at it. So a mixed order survives, keeps its real lines,
-- loses its test ones, and is printed by reference at the end for the owner to
-- finish by hand. Said plainly here because "mixed orders are never touched" is
-- the sentence everyone remembers, and it is one word too strong.
--
-- They are printed at the end so the owner sees them rather than discovering
-- them later.
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
select 'PRE extraction_drafts',     count(*) from rc_reset_extraction_drafts
union all
select 'PRE extraction_draft_lines', count(*) from public.extraction_draft_lines
       where order_id in (select order_id from rc_reset_extraction_drafts)
union all
select 'PRE categories TEST',       count(*) from public.categories where name like 'TEST-%'
union all
select 'PRE MIXED left alone',      count(*) from rc_reset_mixed;

-- The two halves of the product set, printed apart, because the second one is
-- new and the owner should see it as its own number rather than folded into a
-- total that looks the same as last time.
select 'PRE products TEST- sku'     as scope, count(*) as row_count from rc_reset_products_test
union all
select 'PRE products EXT- from a test document', count(*) from rc_reset_products_ext;


-- ===========================================================================
-- PHASE 2: DELETE. Children first. Every ON DELETE RESTRICT respected.
-- ===========================================================================

-- status_history is polymorphic and carries no foreign key, so it is deleted
-- first and by hand. It is append-only for the application; this file is the
-- only thing that ever removes a row, and only the owner runs it.
delete from public.status_history
where (entity_type = 'inbound_order'  and entity_id in (select id from rc_reset_inbound_orders))
   or (entity_type = 'outbound_issue' and entity_id in (select id from rc_reset_outbound_issues));

-- The extraction drafts, added 2026-08-27 under ruling R-033.
--
-- THEY GO FIRST, before the orders, and the order is the point: deleting them
-- here means the on delete set null on extraction_drafts.confirmed_inbound_order_id
-- never fires for a draft that is itself going, so this file leans on one fewer
-- thing being true. It still needs migration 0011 applied, because a draft that
-- is NOT in the delete set could point at an order that is, and that is the case
-- the corrected constraint exists for.
--
-- The lines are deleted explicitly even though the foreign key cascades, for the
-- same reason reminders are: the pre-check count is then the count that was
-- removed rather than a side effect nobody counted.
delete from public.extraction_draft_lines
where order_id in (select order_id from rc_reset_extraction_drafts);

delete from public.extraction_drafts
where order_id in (select order_id from rc_reset_extraction_drafts);

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
-- Not "no EXT- products remain": real ones are created by real confirms and
-- have every right to be there. What must be zero is the ones this run
-- identified as test-originated.
select 'POST products EXT- in scope',     count(*) from public.products p
       where p.id in (select id from rc_reset_products_ext)
union all
select 'POST extraction_drafts in scope', count(*) from public.extraction_drafts d
       where d.order_id in (select order_id from rc_reset_extraction_drafts)
union all
select 'POST orphan extraction_draft_lines', count(*) from public.extraction_draft_lines l
       where not exists (select 1 from public.extraction_drafts d where d.order_id = l.order_id)
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
