-- 0088_no_direct_stock_deletes.sql
-- RC Inventory phase 3, card P3-326. Found by the bug check of 2026-10-20
-- (finding 3): the owner's session could delete a sale line, a stock batch, an
-- order line or a whole order by a direct request, and stock changed with no
-- trace.
--
-- THE DEFECT
--
-- 0001 wrote four delete policies on `is_owner()` and no later migration replaced
-- them (0070, 0075, 0086 and 0087 each kept them on purpose):
--
--   outbound_lines_delete   on public.outbound_lines
--   batches_delete          on public.batches
--   order_lines_delete      on public.order_lines
--   inbound_orders_delete   on public.inbound_orders
--
-- Available stock is batches minus outbound lines (product_available_stock,
-- 0004). So with the owner's session
--   DELETE /rest/v1/outbound_lines?id=eq.<line>
-- gave the line's quantity back to stock, with no history row and nothing left
-- on the slip to say a line had been there. The other three run the same way in
-- the other direction: a deleted batch takes received stock away, a deleted
-- order line or order (its lines cascade, 0001) removes the record that the
-- stock came from. 0087 "holds the owner to the same doors" for inserts and
-- updates; deletes were the door left open.
--
-- EVERY WRITER WAS READ (grep of supabase/migrations, lib/, app/, components/,
-- scripts/ and tests/ for a delete on any of the four tables):
--
--   no screen, no server action, no API route and no function deletes a row of
--   any of them. The one delete in the extraction flow is on
--   extraction_draft_lines (app/api/extraction/callback/route.ts), a draft
--   table this file does not touch. The only deletes on these four tables are
--   in scripts/reset-test-data.sql, which is not a migration, is run by hand by
--   the database owner in the SQL editor and bypasses row level security, so
--   this file does not change it. The test seeds write with the service role,
--   which also bypasses row level security. "ștergeți rândul" on the slip form
--   (lib/data/outbound-actions.ts) is a form row before saving, never a saved
--   line.
--
-- So there is no screen path to keep, and no SECURITY DEFINER function is
-- added: every direct delete is refused, for everybody signed in, the owner
-- included. A record that is wrong is cancelled, never deleted (P2-07), the rule
-- 0063, 0067 and 0068 already apply to invoices, slips and tasks.
--
-- WHAT IT CHANGES
--
--   policy   outbound_lines_delete   dropped, NOT created again
--   policy   batches_delete          dropped, NOT created again
--   policy   order_lines_delete      dropped, NOT created again
--   policy   inbound_orders_delete   dropped, NOT created again
--
-- Row level security stays enabled on all four tables, so with no delete policy
-- a signed-in DELETE matches no row and removes nothing, the shape 0067 gave
-- public.outbound_issues. anon has no policy on these tables and stays refused.
--
-- WHAT IT DOES NOT CHANGE. The select, insert and update policies, every
-- function, every trigger, every grant, the screens. Taking stock on a slip,
-- creating an order, confirming a draft and receiving an order work exactly as
-- before.
--
-- WHAT IT REMOVES: no table, no row, no column. There is NO DROP TABLE, NO
-- TRUNCATE, NO DELETE and NO UPDATE or INSERT of a row in this file. The four
-- `drop policy if exists` remove rules about rows and remove no row (CLAUDE.md
-- 8.6); none is created again, which takes a right away from the owner and
-- touches no row. The file is safe to run twice. No existing row is read or
-- changed when it applies.
--
-- MERGE IS APPLY. Merging this file applies it to the PRODUCTION database within
-- about two minutes (CLAUDE.md 8.0, ruling R-124). Nothing the deployed build
-- calls is changed, so it keeps working in that window.
--
-- PROVEN BEFORE MERGE by `npm run check:migrations`, which applies it to a
-- throwaway postgres and runs
-- scripts/poc-free/local-db/assertions/0088_no_direct_stock_deletes.sql.

begin;

drop policy if exists outbound_lines_delete on public.outbound_lines;
drop policy if exists batches_delete on public.batches;
drop policy if exists order_lines_delete on public.order_lines;
drop policy if exists inbound_orders_delete on public.inbound_orders;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect no DELETE (and no ALL) policy on any of the four tables, and row level
-- security still enabled on each.

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('outbound_lines', 'batches', 'order_lines', 'inbound_orders')
order by tablename, policyname;

select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('outbound_lines', 'batches', 'order_lines', 'inbound_orders')
order by c.relname;
