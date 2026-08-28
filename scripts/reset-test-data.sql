-- scripts/reset-test-data.sql
-- Cards P2-15 (authored) and RST-01 (made self-asserting, 2026-08-28).
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
-- RST-01, 2026-08-28: THE FILE NOW DECIDES ITS OWN OUTCOME
-- ===========================================================================
--
-- WHAT CHANGED, AND WHY IT IS NOT COSMETIC. Until now this file printed grids
-- and a human read them. Reading a grid is a judgement, and a judgement made at
-- the end of a long transaction against a client's production database, by
-- someone who has been told in advance what the numbers should be, is the
-- weakest link in the whole procedure. The numbers were also easy to misread by
-- construction: the old POST MIXED count was read from the same frozen
-- temporary table as the PRE MIXED count, so the two were identical whatever
-- the run did, and a grid that cannot disagree with itself is decoration.
--
-- NOW THE FILE EVALUATES ITS OWN PASS AND FAIL CONDITIONS IN SQL, INSIDE THE
-- TRANSACTION, AND COMMITS ONLY IF EVERY ONE OF THEM PASSES. If any assertion
-- fails, phase 4 raises, the transaction rolls back, and psql exits non-zero.
-- The person running it does not choose, and cannot choose wrongly. The grids
-- are still printed, and they are now a record rather than a decision.
--
-- HOW THE GATE RAISES, AND WHY IT LOOKS LIKE THAT. Phase 4 ends with a SELECT
-- that casts a text message to integer when, and only when, an assertion has
-- failed. That is deliberate and it is not to be "cleaned up" into a
-- DO $$ ... RAISE EXCEPTION ... $$ block. A DO block is a DoStmt whose body is
-- an opaque string literal, so scripts/poc-free/parse-reset-sql.mjs, which is
-- the only thing standing between this file and the client's data, could no
-- longer see what the file does: an INSERT, an UPDATE, a TRUNCATE or a DROP
-- hidden inside that string would pass every check. Keeping the gate as a plain
-- SELECT keeps every statement in this file visible to the real PostgreSQL
-- grammar. The cost is one ugly error prefix. The message itself names every
-- assertion that failed:
--
--   ERROR:  invalid input syntax for type integer:
--   "RESET ABORTED, 2 assertion(s) failed: no orphan batches; ..."
--
-- THE CAST TARGET IS A SUBQUERY, NOT A LITERAL, AND THAT MATTERS. PostgreSQL
-- constant-folds a literal cast at planning time, so 'boom'::int inside an
-- unreachable CASE branch raises anyway. Verified on PostgreSQL 16.15. The
-- failing-assertion message is built from a subquery over the assertions table,
-- which cannot be folded, so the gate is silent on a clean run.
--
-- ===========================================================================
-- IDENTIFICATION METHOD: A PREFIX REGISTRY, PLUS A CHAIN OF EVIDENCE
-- ===========================================================================
--
-- CORRECTED 2026-08-27 UNDER RULING R-033, then again by RST-01 on 2026-08-28.
--
-- The original file identified test data by ONE marker, products.sku LIKE
-- 'TEST-%'. R-033 added the extraction lane, reached by evidence rather than by
-- name. RST-01 adds the third thing both of those missed: SKU prefixes written
-- by machinery that is not the committed e2e suite.
--
-- A selector is a claim about what test data looks like, and it goes stale the
-- moment anything invents a new way to create a row. Twice now it has gone
-- stale in exactly that way. So the prefixes are no longer spelled into nine
-- predicates: they are ROWS in rc_reset_sku_prefixes, each carrying the
-- provenance that justifies it, and every predicate reads that one table. The
-- next prefix is a row and a line of provenance, not an edit to a WHERE clause
-- that someone has to find nine copies of.
--
-- THE REGISTRY, AND WHERE EACH ROW'S AUTHORITY COMES FROM:
--
--   'TEST-'         Every product the committed e2e suite creates. The specs
--                   build their SKU as TEST-<tag>-<run>: products.spec.ts,
--                   inbound.spec.ts (TEST-IN-), outbound.spec.ts (TEST-OUT-),
--                   dashboard.spec.ts (TEST-DASH-), extraction.spec.ts
--                   (TEST-EXT-). Enumerated from the test sources, not guessed.
--
--   'CRITIC-RACE-'  NOT PRODUCED BY ANY COMMITTED TEST SOURCE, and that is the
--   'CRITIC-RACE2-' finding rather than an oversight. These rows were created
--                   by the CRITIC's live concurrency testing at the wave 1
--                   boundary on 2026-08-25 and 2026-08-26, described in
--                   docs/reports/critic-wave1.md under "Concurrency, tested
--                   live rather than reasoned about": two simultaneous issues
--                   of an entire stock, fired by hand from two sessions. It
--                   needed a product, so it made one, from a session and not
--                   from a spec. docs/reports/forensics-20260826-product-count.md
--                   records the newest such row as CRITIC-RACE-1787702980667 at
--                   2026-08-26 00:09:40+00.
--
--                   A grep of tests/ finds none of this, at any commit in this
--                   repository's history, because a session that types SQL into
--                   a screen leaves nothing in tests/. That is the standing
--                   exposure: THE SUITE IS NOT THE ONLY THING THAT WRITES TO
--                   THE DATABASE, so a selector derived only from the suite is
--                   incomplete by construction. The registry is where anything
--                   found by forensics gets recorded instead of being fixed by
--                   hand once and forgotten.
--
-- CATEGORY NAMES have their own registry, rc_reset_category_prefixes, seeded
-- with 'TEST-'. The suite files its products under the literal string
-- 'TEST-Categorie' (dashboard.spec.ts, extraction.spec.ts).
--
-- DOCUMENT FILENAMES keep their marker, extraction_drafts.document_filename
-- LIKE 'TEST-%'. review.spec.ts uploads as TEST-<tag>-<run>.pdf, and every
-- EXT- product, order and draft that lane produces descends from one of those.
--
-- 'EXT-' IS STILL NOT A PREFIX IN THE REGISTRY, and must never become one.
-- EXT-<slug>-<hex> is what P2-09 writes for a flagged product, which is also
-- what real use will write after launch. Those products are in scope only when
-- they sit on an order that a seed draft became: a chain of evidence back to a
-- document the suite uploaded. A real EXT- product descends from a real
-- document and is never in the set. Adding 'EXT-' to the registry would delete
-- the client's catalogue.
--
-- THE ONLY FALSE POSITIVE THE REGISTRY CAN PRODUCE is a REAL product whose SKU
-- begins with one of the registered prefixes, or a real supplier document named
-- TEST-. That exposure is not new and is not larger than it was.
--
-- Orders and issues are reached THROUGH their lines rather than by a marker of
-- their own, because their references are auto-generated (INT-YYYY-NNNN and
-- IES-YYYY-NNNN) and carry no marker. An order is in scope only when it has at
-- least one line pointing at a product in the delete set AND no line pointing
-- at anything else. A GENUINELY MIXED ORDER, one real line and one test line,
-- is never deleted, and phase 4 now asserts that every one of them survived
-- rather than printing a number that could not disagree with itself.
--
-- ONE SENTENCE THAT WAS ONE WORD TOO STRONG, kept here because it is still
-- true: a mixed order is never DELETED, but it is not untouched. Its lines
-- pointing at a product in the delete set are removed, because
-- order_lines.product_id is ON DELETE RESTRICT and the product cannot go while
-- a line points at it. The order survives, keeps its real lines, loses its test
-- ones, and is printed by reference.
--
-- ===========================================================================
-- SHAPE
-- ===========================================================================
--
-- One transaction. Every statement or none.
-- Phase 0 resolves the target set into temporary tables, once.
-- Phase 1 pre-check captures what is about to go, by table, with literal
--         counts, into a temporary table, and prints it.
-- Phase 2 deletes, children before parents, respecting every ON DELETE RESTRICT.
-- Phase 3 post-check captures what remains and prints it.
-- Phase 4 evaluates every assertion and RAISES if any failed, which rolls the
--         whole thing back. Nothing below phase 4 runs on a failure.
--
-- The COMMIT is on the last line, uncommented. Run the file whole. There is no
-- longer a decision to make while reading: either it commits, or it rolled back
-- and told you which assertion stopped it.
--
-- RUN IT LIKE THIS, so a failure is an exit code and not something to notice:
--   psql "$RC_DB_URL" -v ON_ERROR_STOP=1 -f scripts/reset-test-data.sql
-- In the Supabase SQL editor, paste it whole; a failed assertion aborts the
-- transaction there too and nothing is committed.

begin;

-- ===========================================================================
-- PHASE 0: THE TARGET SET, resolved once into temporary tables so that every
-- later statement deletes from exactly the same set. Resolving the predicate
-- inline in each DELETE would re-evaluate it against a table the previous
-- DELETE has already changed, which is how a cleanup half-runs.
-- ===========================================================================

-- STAGE 0. THE PREFIX REGISTRY. One row per marker, each with the provenance
-- that justifies it. Every predicate below reads this table, so adding a
-- prefix is adding a row here and nowhere else.
create temporary table rc_reset_sku_prefixes on commit drop as
select * from (values
  ('TEST-',
   'committed e2e suite: products/inbound/outbound/dashboard/extraction .spec.ts build sku as TEST-<tag>-<run>'),
  ('CRITIC-RACE-',
   'CRITIC live concurrency testing at the wave 1 boundary, 2026-08-25/26, docs/reports/critic-wave1.md; newest row CRITIC-RACE-1787702980667 per docs/reports/forensics-20260826-product-count.md. Not produced by any committed test source.'),
  ('CRITIC-RACE2-',
   'CRITIC live concurrency testing, second session of the same pair, 2026-08-25/26. Not produced by any committed test source.')
) as t(prefix, provenance);

create temporary table rc_reset_category_prefixes on commit drop as
select * from (values
  ('TEST-',
   'committed e2e suite: dashboard.spec.ts and extraction.spec.ts file products under the literal category name TEST-Categorie')
) as t(prefix, provenance);

-- STAGE 1. The products named directly by a registered prefix.
create temporary table rc_reset_products_test on commit drop as
select p.id, p.sku, p.name
from public.products p
where exists (
        select 1 from rc_reset_sku_prefixes r
        where p.sku like r.prefix || '%'
      );

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
-- NOT "every product whose SKU starts with EXT-". A product is here only when
-- it sits on an order that a seed draft became, which is a chain of evidence
-- back to a document the suite uploaded. A real EXT- product created after
-- launch descends from a real document and is never in this set.
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

-- STAGE 7. The categories in scope: named by a registered prefix and with
-- nothing outside the delete set pointing at them. products.category_id is
-- ON DELETE RESTRICT and NOT NULL, and products is the only table that
-- references categories at all, so "referencing rows" means products and
-- nothing else. A category still used by a product that is NOT going stays,
-- which is a skip rather than an error, and phase 3 prints it with the rows
-- that kept it.
create temporary table rc_reset_categories on commit drop as
select c.id, c.name
from public.categories c
where exists (
        select 1 from rc_reset_category_prefixes r
        where c.name like r.prefix || '%'
      )
  and not exists (
        select 1 from public.products p
        where p.category_id = c.id
          and p.id not in (select id from rc_reset_products)
      );

-- Mixed orders: at least one line in the delete set and at least one that is
-- not. THE ORDER ROW IS NEVER DELETED. Its lines pointing at a product in the
-- delete set ARE removed, because order_lines.product_id is ON DELETE RESTRICT
-- and the product cannot go while a line still points at it. So a mixed order
-- survives, keeps its real lines, loses its test ones, and is printed at the
-- end for the owner to finish by hand.
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
-- PHASE 1: PRE-CHECK. Captured, not just printed, because phase 4 asserts that
-- every one of these counts was fully consumed by its DELETE.
-- ===========================================================================

create temporary table rc_reset_pre on commit drop as
select 1 as ord, 'products'::text as scope, count(*)::bigint as row_count from rc_reset_products
union all
select 2, 'inbound_orders',        count(*) from rc_reset_inbound_orders
union all
select 3, 'outbound_issues',       count(*) from rc_reset_outbound_issues
union all
select 4, 'order_lines',           count(*) from public.order_lines
       where inbound_order_id in (select id from rc_reset_inbound_orders)
          or product_id in (select id from rc_reset_products)
union all
select 5, 'outbound_lines',        count(*) from public.outbound_lines
       where outbound_issue_id in (select id from rc_reset_outbound_issues)
          or product_id in (select id from rc_reset_products)
union all
select 6, 'batches',               count(*) from public.batches
       where product_id in (select id from rc_reset_products)
union all
select 7, 'reminders',             count(*) from public.reminders
       where product_id in (select id from rc_reset_products)
union all
select 8, 'status_history',        count(*) from public.status_history
       where (entity_type = 'inbound_order'  and entity_id in (select id from rc_reset_inbound_orders))
          or (entity_type = 'outbound_issue' and entity_id in (select id from rc_reset_outbound_issues))
union all
select 9, 'extraction_drafts',     count(*) from rc_reset_extraction_drafts
union all
select 10, 'extraction_draft_lines', count(*) from public.extraction_draft_lines
       where order_id in (select order_id from rc_reset_extraction_drafts)
union all
select 11, 'categories',           count(*) from rc_reset_categories
union all
select 12, 'MIXED left alone',     count(*) from rc_reset_mixed;

select 'PRE ' || scope as scope, row_count from rc_reset_pre order by ord;

-- The three halves of the product set, printed apart. The registry half is
-- broken out per prefix so a prefix that matched nothing is visible as a zero
-- rather than hidden inside a total.
select 'PRE products by prefix ' || r.prefix as scope,
       count(p.id)::bigint as row_count
from rc_reset_sku_prefixes r
left join rc_reset_products_test p on p.sku like r.prefix || '%'
group by r.prefix
union all
select 'PRE products EXT- from a test document', count(*)::bigint from rc_reset_products_ext
order by scope;

-- What the registry is deleting, listed, because three of these prefixes were
-- found by forensics rather than by a spec and the owner should see the rows.
select p.sku, p.name from rc_reset_products_test p order by p.sku;


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

-- Categories last, resolved in phase 0 stage 7 rather than re-derived here, so
-- the row this deletes is the row the pre-check counted.
delete from public.categories c
where c.id in (select id from rc_reset_categories);


-- ===========================================================================
-- PHASE 3: POST-CHECK. Captured, then printed. Phase 4 rules on it.
-- ===========================================================================

create temporary table rc_reset_post on commit drop as
-- 1 to 11: every in-scope PRE count, re-counted against the live tables. Each
-- must now be 0, which is what "fully consumed by its DELETE" means.
select 1 as ord, 'in-scope products remaining'::text as scope,
       count(*)::bigint as row_count
       from public.products where id in (select id from rc_reset_products)
union all
select 2, 'in-scope inbound_orders remaining', count(*) from public.inbound_orders
       where id in (select id from rc_reset_inbound_orders)
union all
select 3, 'in-scope outbound_issues remaining', count(*) from public.outbound_issues
       where id in (select id from rc_reset_outbound_issues)
union all
select 4, 'in-scope order_lines remaining', count(*) from public.order_lines
       where inbound_order_id in (select id from rc_reset_inbound_orders)
          or product_id in (select id from rc_reset_products)
union all
select 5, 'in-scope outbound_lines remaining', count(*) from public.outbound_lines
       where outbound_issue_id in (select id from rc_reset_outbound_issues)
          or product_id in (select id from rc_reset_products)
union all
select 6, 'in-scope batches remaining', count(*) from public.batches
       where product_id in (select id from rc_reset_products)
union all
select 7, 'in-scope reminders remaining', count(*) from public.reminders
       where product_id in (select id from rc_reset_products)
union all
select 8, 'in-scope status_history remaining', count(*) from public.status_history
       where (entity_type = 'inbound_order'  and entity_id in (select id from rc_reset_inbound_orders))
          or (entity_type = 'outbound_issue' and entity_id in (select id from rc_reset_outbound_issues))
union all
select 9, 'in-scope extraction_drafts remaining', count(*) from public.extraction_drafts
       where order_id in (select order_id from rc_reset_extraction_drafts)
union all
select 10, 'in-scope extraction_draft_lines remaining', count(*) from public.extraction_draft_lines
       where order_id in (select order_id from rc_reset_extraction_drafts)
union all
select 11, 'in-scope categories remaining', count(*) from public.categories
       where id in (select id from rc_reset_categories)
-- 12 to 16: orphan checks. Nothing may be left pointing at a row that is gone.
union all
select 12, 'orphan batches', count(*) from public.batches b
       where not exists (select 1 from public.products p where p.id = b.product_id)
union all
select 13, 'orphan order_lines', count(*) from public.order_lines l
       where not exists (select 1 from public.inbound_orders o where o.id = l.inbound_order_id)
union all
select 14, 'orphan outbound_lines', count(*) from public.outbound_lines l
       where not exists (select 1 from public.outbound_issues i where i.id = l.outbound_issue_id)
union all
select 15, 'orphan extraction_draft_lines', count(*) from public.extraction_draft_lines l
       where not exists (select 1 from public.extraction_drafts d where d.order_id = l.order_id)
union all
select 16, 'orphan status_history', count(*) from public.status_history h
       where (h.entity_type = 'inbound_order'
              and not exists (select 1 from public.inbound_orders o where o.id = h.entity_id))
          or (h.entity_type = 'outbound_issue'
              and not exists (select 1 from public.outbound_issues i where i.id = h.entity_id))
-- 17: the registry sweep. Not "in scope", which only counts what the selector
-- selected: this counts EVERY surviving product whose SKU carries a registered
-- prefix, so a row the evidence chain failed to reach is caught here.
union all
select 17, 'products remaining with a registered prefix', count(*) from public.products p
       where exists (select 1 from rc_reset_sku_prefixes r where p.sku like r.prefix || '%')
-- 18: a registered-prefix category that nothing points at should have been
-- deleted. One that survives because a product outside the delete set still
-- uses it is legitimate and is printed below, not counted here.
union all
select 18, 'unreferenced prefixed categories remaining', count(*) from public.categories c
       where exists (select 1 from rc_reset_category_prefixes r where c.name like r.prefix || '%')
         and not exists (select 1 from public.products p where p.category_id = c.id)
-- 19: a surviving prefixed category kept alive by a product that was itself in
-- the delete set means a delete did not happen. Distinct from 18 and from 1.
union all
select 19, 'prefixed categories held by an in-scope product', count(*) from public.categories c
       where exists (select 1 from rc_reset_category_prefixes r where c.name like r.prefix || '%')
         and exists (select 1 from public.products p
                     where p.category_id = c.id
                       and p.id in (select id from rc_reset_products))
-- 20: every mixed order and issue must still exist. The old file read this
-- from the frozen temporary table on both sides, so the two numbers agreed
-- whatever happened. This one counts the survivors in the live tables.
union all
select 20, 'MIXED entities surviving', count(*) from rc_reset_mixed m
       where (m.kind = 'inbound_order'  and exists (select 1 from public.inbound_orders o where o.id = m.id))
          or (m.kind = 'outbound_issue' and exists (select 1 from public.outbound_issues i where i.id = m.id))
-- 21: context, asserted against nothing. What the client is left holding.
union all
select 21, 'products remaining in total', count(*) from public.products;

select 'POST ' || scope as scope, row_count from rc_reset_post order by ord;

-- The mixed orders, listed by reference, so the owner can act on them by hand.
-- Empty result is the expected outcome.
select kind, reference from rc_reset_mixed order by kind, reference;

-- Every prefixed category still standing, with the product that kept it. An
-- empty result is the expected outcome. A row here is permitted, and it is the
-- owner's to decide about: the category is test-named, and something outside
-- this run's delete set is filed under it.
select c.name as surviving_category, p.sku as held_by_sku, p.name as held_by_name,
       case when p.id in (select id from rc_reset_products) then 'IN SCOPE - THIS IS A DEFECT'
            else 'out of scope, legitimately kept' end as verdict
from public.categories c
join public.products p on p.category_id = c.id
where exists (select 1 from rc_reset_category_prefixes r where c.name like r.prefix || '%')
order by c.name, p.sku;


-- ===========================================================================
-- PHASE 4: THE GATE. Every assertion, evaluated in SQL. Commit only on
-- all-pass. There is nothing here for a human to decide.
-- ===========================================================================

create temporary table rc_reset_assertions on commit drop as
-- Assertions 1 to 11 are the consumption rule, one per in-scope PRE count:
-- whatever the pre-check counted, the delete removed all of it.
select post.ord as ord,
       'in-scope ' || pre.scope || ' fully consumed by its DELETE (PRE '
         || pre.row_count || ', remaining ' || post.row_count || ')' as name,
       0::bigint as expected,
       post.row_count as actual,
       (post.row_count = 0) as passed
from rc_reset_post post
join rc_reset_pre pre on pre.ord = post.ord
where post.ord between 1 and 11
union all
-- 12 to 16: every orphan check is 0.
select post.ord,
       post.scope || ' is 0 (found ' || post.row_count || ')',
       0::bigint, post.row_count, (post.row_count = 0)
from rc_reset_post post
where post.ord between 12 and 16
union all
-- 17: no product carrying a registered prefix survives, in scope or not.
select 17,
       'no product with a registered SKU prefix remains (found '
         || (select row_count from rc_reset_post where ord = 17) || ')',
       0::bigint,
       (select row_count from rc_reset_post where ord = 17),
       (select row_count from rc_reset_post where ord = 17) = 0
union all
-- 18: no unreferenced prefixed category survives.
select 18,
       'no prefixed category with zero referencing products remains (found '
         || (select row_count from rc_reset_post where ord = 18) || ')',
       0::bigint,
       (select row_count from rc_reset_post where ord = 18),
       (select row_count from rc_reset_post where ord = 18) = 0
union all
-- 19: and none is being held up by a product that should itself be gone.
select 19,
       'no prefixed category is held by an in-scope product (found '
         || (select row_count from rc_reset_post where ord = 19) || ')',
       0::bigint,
       (select row_count from rc_reset_post where ord = 19),
       (select row_count from rc_reset_post where ord = 19) = 0
union all
-- 20: MIXED before equals MIXED after, counted against the live tables on the
-- after side. Not deleting a mixed order is the one promise this file makes
-- about data it does not own.
select 20,
       'every MIXED entity survived (PRE '
         || (select row_count from rc_reset_pre where ord = 12)
         || ', surviving '
         || (select row_count from rc_reset_post where ord = 20) || ')',
       (select row_count from rc_reset_pre where ord = 12),
       (select row_count from rc_reset_post where ord = 20),
       (select row_count from rc_reset_pre where ord = 12)
         = (select row_count from rc_reset_post where ord = 20);

select ord, name, expected, actual,
       case when passed then 'PASS' else 'FAIL' end as result
from rc_reset_assertions order by ord;

-- THE GATE. On all-pass this returns one row of text and the file commits.
-- On any failure the cast raises, the transaction aborts, and psql exits
-- non-zero. The cast target is a subquery so PostgreSQL cannot constant-fold
-- it on the passing path. See the header before changing the shape of this.
select case
         when (select count(*) from rc_reset_assertions where not passed) = 0
           then 'ALL ' || (select count(*) from rc_reset_assertions)::text
                || ' ASSERTIONS PASSED, COMMITTING'
         else ('RESET ABORTED, '
                || (select count(*) from rc_reset_assertions where not passed)::text
                || ' assertion(s) failed: '
                || (select string_agg(name, ' | ' order by ord)
                    from rc_reset_assertions where not passed))::int::text
       end as assertion_gate;

commit;
