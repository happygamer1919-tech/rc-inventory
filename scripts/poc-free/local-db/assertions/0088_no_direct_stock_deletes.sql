-- assertions/0088_no_direct_stock_deletes.sql
-- Card P3-326. Nobody signed in, the owner included, deletes a sale line, a
-- stock batch, an order line or an order by a direct request, and every screen
-- path that moves stock still works.
--
--   1. THE SHAPE. public.outbound_lines, public.batches, public.order_lines and
--      public.inbound_orders carry NO delete policy and no ALL policy, and row
--      level security stays enabled on each. public.outbound_issues still has no
--      delete policy (0067), so a deleted slip cannot take its lines with it by
--      the cascade.
--   2. AN ACTIVE ACCOUNT MANAGER, with a real role switch and a JWT, so row level
--      security applies (the same path as a PostgREST request):
--        THE SCREEN PATHS STILL WORK (the witnesses):
--          w1 create_inbound_order saves two pending orders of one line of 10
--          w2 receive_inbound_order turns the first into one batch of 10
--          w3 outbound_issue_take_stock puts a line of 3 on the manager's slip
--          w4 ship_outbound_issue ships that slip
--        EVERY DIRECT DELETE TOUCHES NO ROW:
--          m_outbound_line, m_batch, m_order_line, m_order
--   3. THE OWNER, the finding itself:
--        w5 outbound_issue_take_stock puts a line of 2 on the owner's slip
--        EVERY DIRECT DELETE TOUCHES NO ROW:
--          o_outbound_line   the shipped sale line (the finding: stock back up)
--          o_batch           the received batch (stock down)
--          o_order_line      the line of the received order
--          o_pending_line    the line of the still pending order
--          o_order           the received order (its lines would cascade)
--          o_pending_order   the pending order
--          o_issue           the shipped slip (its lines would cascade)
--   4. THE VERDICT, as the superuser: every row is still there, and the stock of
--      the product is exactly 10 received minus 3 and 2 taken, which is 5.
--
-- WITH NO DELETE POLICY A DIRECT DELETE IS NOT AN ERROR, IT MATCHES NO ROW. That
-- is what PostgREST returns too (an empty result), and it is the shape 0067 gave
-- public.outbound_issues. So each refusal is read as a row count of 0 and then
-- proved again by the row still being there.
--
-- Refusals are written without diacritics, the convention 0063 to 0087 follow.
-- Everything runs inside a transaction that is rolled back.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  v_n   integer;
  v_tbl text;
begin
  foreach v_tbl in array array['outbound_lines', 'batches', 'order_lines', 'inbound_orders', 'outbound_issues'] loop
    select count(*) into v_n
    from pg_policies p
    where p.schemaname = 'public' and p.tablename = v_tbl and p.cmd in ('DELETE', 'ALL');
    if v_n <> 0 then
      raise exception 'P3-326: public.% has a delete policy, so a signed-in account can delete from it', v_tbl;
    end if;

    select count(*) into v_n
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = v_tbl and c.relrowsecurity;
    if v_n <> 1 then
      raise exception 'P3-326: row level security is not enabled on public.%', v_tbl;
    end if;
  end loop;
end
$$;


-- ===========================================================================
-- 2. FIXTURE, AS THE SUPERUSER
-- ===========================================================================
--
-- An owner and an account manager; one product valued 10; one client; two empty
-- awaiting slips, one created by each account.

insert into auth.users (id, email) values
  ('e3326000-0000-4000-8000-000000000001', 'p3-326-owner@rc-inventory.local'),
  ('e3326000-0000-4000-8000-000000000002', 'p3-326-manager@rc-inventory.local');

insert into public.profiles (id, email, role, full_name, active) values
  ('e3326000-0000-4000-8000-000000000001', 'p3-326-owner@rc-inventory.local', 'owner', 'Test Owner 326', true),
  ('e3326000-0000-4000-8000-000000000002', 'p3-326-manager@rc-inventory.local', 'account_manager', 'Test Manager 326', true);

do $$
declare
  v_category uuid;
  v_product  uuid;
  v_client   uuid;
  v_id       uuid;
begin
  select id into v_category from public.categories order by name limit 1;
  if v_category is null then
    raise exception 'P3-326: no category loaded, so no test product can be written';
  end if;

  insert into public.products (sku, name, category_id, unit, unit_value_mdl)
  values ('TEST-P3326-SKU', 'TEST P3-326 produs', v_category, 'pcs', 10)
  returning id into v_product;
  perform set_config('p3_326.product', v_product::text, true);

  insert into public.clients (name) values ('TEST P3-326 client') returning id into v_client;

  insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date, status, created_by)
  values ('TEST-P3326-MANAGER', 'direct_client', v_client, date '2026-10-20', 'awaiting_shipment',
          'e3326000-0000-4000-8000-000000000002')
  returning id into v_id;
  perform set_config('p3_326.slip_manager', v_id::text, true);

  insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date, status, created_by)
  values ('TEST-P3326-OWNER', 'direct_client', v_client, date '2026-10-20', 'awaiting_shipment',
          'e3326000-0000-4000-8000-000000000001')
  returning id into v_id;
  perform set_config('p3_326.slip_owner', v_id::text, true);
end
$$;


-- ===========================================================================
-- 3. AN ACTIVE ACCOUNT MANAGER
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3326000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  v_product uuid := current_setting('p3_326.product')::uuid;
  v_slip    uuid := current_setting('p3_326.slip_manager')::uuid;
  v_lines   jsonb := jsonb_build_array(jsonb_build_object('product_id', current_setting('p3_326.product'), 'quantity', 10, 'unit_price', 10));
  v_recv    uuid;
  v_open    uuid;
  v_n       integer;
  r         record;
begin
  -- --- w1. the order screen
  v_recv := public.create_inbound_order('TEST-P3326-RECV', 'TEST furnizor', 'MDL', null, date '2026-10-20', 100, v_lines);
  v_open := public.create_inbound_order('TEST-P3326-OPEN', 'TEST furnizor', 'MDL', null, date '2026-10-20', 100, v_lines);
  perform set_config('p3_326.recv', v_recv::text, true);
  perform set_config('p3_326.open', v_open::text, true);

  -- --- w2. the reception button
  select * into r from public.receive_inbound_order(v_recv);
  perform set_config('p3_326.w2', r.created_batches || ' ' || r.already_arrived, true);

  -- --- w3. taking stock on the slip screen
  perform public.outbound_issue_take_stock(
    v_slip, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 3, 'sale_price_mdl', 20)));

  -- --- w4. the ship button
  select * into r from public.ship_outbound_issue(v_slip);
  perform set_config('p3_326.w4', r.already_shipped::text, true);

  -- --- every direct delete, as the manager
  delete from public.outbound_lines where outbound_issue_id = v_slip;
  get diagnostics v_n = row_count;
  perform set_config('p3_326.m_outbound_line', v_n::text, true);

  delete from public.batches where inbound_order_id = v_recv;
  get diagnostics v_n = row_count;
  perform set_config('p3_326.m_batch', v_n::text, true);

  delete from public.order_lines where inbound_order_id = v_open;
  get diagnostics v_n = row_count;
  perform set_config('p3_326.m_order_line', v_n::text, true);

  delete from public.inbound_orders where id = v_open;
  get diagnostics v_n = row_count;
  perform set_config('p3_326.m_order', v_n::text, true);
end
$$;


-- ===========================================================================
-- 4. THE OWNER
-- ===========================================================================

set local request.jwt.claims = '{"sub":"e3326000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  v_product uuid := current_setting('p3_326.product')::uuid;
  v_slip_m  uuid := current_setting('p3_326.slip_manager')::uuid;
  v_slip_o  uuid := current_setting('p3_326.slip_owner')::uuid;
  v_recv    uuid := current_setting('p3_326.recv')::uuid;
  v_open    uuid := current_setting('p3_326.open')::uuid;
  v_n       integer;
begin
  -- --- w5. the owner still takes stock on a slip
  perform public.outbound_issue_take_stock(
    v_slip_o, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 2, 'sale_price_mdl', 20)));

  -- --- the finding: the shipped sale line deleted gives its 3 back to stock
  delete from public.outbound_lines where outbound_issue_id = v_slip_m;
  get diagnostics v_n = row_count;
  perform set_config('p3_326.o_outbound_line', v_n::text, true);

  delete from public.batches where inbound_order_id = v_recv;
  get diagnostics v_n = row_count;
  perform set_config('p3_326.o_batch', v_n::text, true);

  delete from public.order_lines where inbound_order_id = v_recv;
  get diagnostics v_n = row_count;
  perform set_config('p3_326.o_order_line', v_n::text, true);

  delete from public.order_lines where inbound_order_id = v_open;
  get diagnostics v_n = row_count;
  perform set_config('p3_326.o_pending_line', v_n::text, true);

  delete from public.inbound_orders where id = v_recv;
  get diagnostics v_n = row_count;
  perform set_config('p3_326.o_order', v_n::text, true);

  delete from public.inbound_orders where id = v_open;
  get diagnostics v_n = row_count;
  perform set_config('p3_326.o_pending_order', v_n::text, true);

  delete from public.outbound_issues where id = v_slip_m;
  get diagnostics v_n = row_count;
  perform set_config('p3_326.o_issue', v_n::text, true);
end
$$;

reset role;


-- ===========================================================================
-- 5. THE VERDICT, READ AS THE SUPERUSER
-- ===========================================================================

set local request.jwt.claims = '{}';

do $$
declare
  v_k       text;
  v_n       integer;
  v_q       numeric;
  v_product uuid := current_setting('p3_326.product')::uuid;
  v_slip_m  uuid := current_setting('p3_326.slip_manager')::uuid;
  v_slip_o  uuid := current_setting('p3_326.slip_owner')::uuid;
  v_recv    uuid := current_setting('p3_326.recv')::uuid;
  v_open    uuid := current_setting('p3_326.open')::uuid;
begin
  -- --- the witnesses
  if current_setting('p3_326.w2') <> '1 false' then
    raise exception 'P3-326: w2, reception returned %, expected one batch', current_setting('p3_326.w2');
  end if;
  if current_setting('p3_326.w4') <> 'false' then
    raise exception 'P3-326: w4, shipping returned already_shipped %, expected false', current_setting('p3_326.w4');
  end if;
  select status::text into v_k from public.outbound_issues where id = v_slip_m;
  if v_k is distinct from 'shipped' then
    raise exception 'P3-326: w4, the manager''s slip is %, expected shipped', coalesce(v_k, 'no row');
  end if;

  -- --- every direct delete matched no row
  foreach v_k in array array['m_outbound_line', 'm_batch', 'm_order_line', 'm_order',
                             'o_outbound_line', 'o_batch', 'o_order_line', 'o_pending_line',
                             'o_order', 'o_pending_order', 'o_issue'] loop
    if current_setting('p3_326.' || v_k) <> '0' then
      raise exception 'P3-326: case % deleted % row(s) by a direct request', v_k, current_setting('p3_326.' || v_k);
    end if;
  end loop;

  -- --- and every row is still there
  select count(*), coalesce(sum(quantity), 0) into v_n, v_q from public.outbound_lines where outbound_issue_id = v_slip_m;
  if v_n <> 1 or v_q <> 3 then
    raise exception 'P3-326: the shipped slip has % line(s) totalling %, expected one of 3', v_n, v_q;
  end if;
  select count(*) into v_n from public.outbound_lines where outbound_issue_id = v_slip_o;
  if v_n <> 1 then
    raise exception 'P3-326: w5, the owner''s slip has % line(s), expected 1', v_n;
  end if;
  select count(*), coalesce(sum(quantity), 0) into v_n, v_q from public.batches where product_id = v_product;
  if v_n <> 1 or v_q <> 10 then
    raise exception 'P3-326: the product has % batch(es) totalling %, expected one of 10', v_n, v_q;
  end if;
  select count(*) into v_n from public.order_lines where inbound_order_id in (v_recv, v_open);
  if v_n <> 2 then
    raise exception 'P3-326: % order line(s) left of 2', v_n;
  end if;
  select count(*) into v_n from public.inbound_orders where id in (v_recv, v_open);
  if v_n <> 2 then
    raise exception 'P3-326: % order(s) left of 2', v_n;
  end if;
  select count(*) into v_n from public.outbound_issues where id in (v_slip_m, v_slip_o);
  if v_n <> 2 then
    raise exception 'P3-326: % slip(s) left of 2', v_n;
  end if;

  -- --- the stock is exactly 10 received minus 3 and 2 taken
  v_q := public.product_available_stock(v_product);
  if v_q <> 5 then
    raise exception 'P3-326: available stock is %, expected 10 - 3 - 2 = 5', v_q;
  end if;
end
$$;

rollback;
