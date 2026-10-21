-- assertions/0087_stock_only_through_reception.sql
-- Card P3-312. Stock grows only through the reception button: no signed-in
-- account adds or changes a batch, adds or changes an order line, or saves an
-- order that is already arrived, by a direct request.
--
--   1. THE SHAPE. public.batches and public.order_lines each carry exactly three
--      policies: select, insert and delete, and NO update. batches_insert tests
--      current_app_role() and the rc.inbound_receive flag; order_lines_insert
--      tests current_app_role(), the rc.inbound_lines flag and a pending order.
--      The trigger inbound_orders_guard fires BEFORE INSERT and BEFORE UPDATE.
--      create_inbound_order, confirm_extraction_draft and receive_inbound_order
--      keep their signatures, stay SECURITY INVOKER and executable by
--      authenticated.
--   2. AN ACTIVE ACCOUNT MANAGER, with a real role switch and a JWT, so row level
--      security applies (the same path as a PostgREST request):
--        THE SCREEN PATHS STILL WORK (the witnesses):
--          w1 create_inbound_order saves a pending order in the caller's name,
--             with its line, and the total the screen computes (4 x 10 = 40),
--             even when the call names another total
--          w2 receive_inbound_order creates one batch of the line's quantity and
--             marks the order arrived; a second call is a no-op
--          w3 confirm_extraction_draft saves a pending order with its line and
--             the computed total
--          w4 after each function returns, no flag is left set
--        EVERY DIRECT DOOR IS SHUT:
--          a  a batch on a pending line of a pending order          refused
--          b  the same, with the flag naming ANOTHER order          refused
--          c  an UPDATE of a batch quantity                         no row
--          d  an order line added to a pending order                refused
--          e  an UPDATE of a pending line's quantity                no row
--          f  a line added to an ARRIVED order, flag naming it      refused
--          g  an order inserted as arrived                          refused
--          h  an order inserted in another account's name           refused
--          i  a pending order inserted outside the order functions  refused
--          j  a pending order with a forged flag but another number refused
--   3. THE OWNER is held to the same doors: a batch insert is refused, a batch
--      UPDATE and a line UPDATE touch no row, an arrived order insert is refused.
--   4. A SERVER ROLE (no identity, the extraction callback and the test seeds)
--      still writes an arrived order directly: the guard does not touch it.
--   5. THE VERDICT, as the superuser: stock of the product is exactly what the
--      one reception brought in, quantities unchanged, no stray order.
--
-- SINCE 0088 (card P3-326), batches_delete and order_lines_delete are gone:
-- nobody signed in, the owner included, deletes a batch or a line. So each of
-- the two tables now carries TWO policies, select and insert, and still no
-- update. A delete policy that comes back must still be owner only.
-- assertions/0088 checks that no direct delete removes a row.
--
-- Refusals are read by SQLSTATE. Everything runs inside a transaction that is
-- rolled back.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n   integer;
  txt text;
  tbl text;
begin
  foreach tbl in array array['batches', 'order_lines'] loop
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = tbl;
    if n <> 2 then
      raise exception 'P3-312: expected exactly 2 policies on public.% (3 until 0088 dropped the delete), found %', tbl, n;
    end if;

    select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = tbl and cmd in ('UPDATE', 'ALL');
    if n <> 0 then
      raise exception 'P3-312: public.% has an update policy, so a signed-in account can change it', tbl;
    end if;

    select qual into txt from pg_policies
    where schemaname = 'public' and tablename = tbl and policyname = tbl || '_delete' and cmd = 'DELETE';
    -- 0088 (P3-326) dropped both delete policies.
    if txt is not null and txt not ilike '%is_owner()%' then
      raise exception 'P3-312: %_delete, if present, must stay on is_owner(), found %', tbl, txt;
    end if;

    select qual into txt from pg_policies
    where schemaname = 'public' and tablename = tbl and policyname = tbl || '_select' and cmd = 'SELECT';
    if txt is null or txt not ilike '%current_app_role()%is not null%' then
      raise exception 'P3-312: %_select must stay on current_app_role() is not null, found %', tbl, coalesce(txt, 'nothing');
    end if;
  end loop;

  select with_check into txt from pg_policies
  where schemaname = 'public' and tablename = 'batches' and policyname = 'batches_insert' and cmd = 'INSERT';
  if txt is null or txt not ilike '%current_app_role()%is not null%'
     or txt not ilike '%rc.inbound_receive%' or txt not ilike '%inbound_order_id%' then
    raise exception 'P3-312: batches_insert must test current_app_role() and the rc.inbound_receive flag against the order, found %',
      coalesce(txt, 'nothing');
  end if;

  select with_check into txt from pg_policies
  where schemaname = 'public' and tablename = 'order_lines' and policyname = 'order_lines_insert' and cmd = 'INSERT';
  if txt is null or txt not ilike '%current_app_role()%is not null%'
     or txt not ilike '%rc.inbound_lines%' or txt not ilike '%pending_arrival%' then
    raise exception 'P3-312: order_lines_insert must test current_app_role(), the rc.inbound_lines flag and a pending order, found %',
      coalesce(txt, 'nothing');
  end if;

  -- tgtype bits: 2 BEFORE, 4 INSERT, 16 UPDATE, 1 ROW.
  select count(*) into n
  from pg_trigger
  where tgrelid = 'public.inbound_orders'::regclass
    and tgname = 'inbound_orders_guard'
    and tgenabled = 'O'
    and (tgtype & 2) = 2 and (tgtype & 4) = 4 and (tgtype & 16) = 16 and (tgtype & 1) = 1;
  if n <> 1 then
    raise exception 'P3-312: expected one enabled row trigger inbound_orders_guard BEFORE INSERT OR UPDATE, found %', n;
  end if;

  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and not p.prosecdef
    and (
      (p.proname = 'receive_inbound_order' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid')
      or (p.proname = 'create_inbound_order' and pg_get_function_identity_arguments(p.oid) =
          'p_reference text, p_supplier_name text, p_currency currency_code, p_ordered_at date, p_expected_at date, p_total_mdl numeric, p_lines jsonb')
      or (p.proname = 'confirm_extraction_draft' and pg_get_function_identity_arguments(p.oid) =
          'p_order_id uuid, p_reference text, p_supplier_name text, p_currency currency_code, p_ordered_at date, p_expected_at date, p_total_mdl numeric, p_lines jsonb')
    );
  if n <> 3 then
    raise exception 'P3-312: the three inbound functions must keep their signatures and stay SECURITY INVOKER, found % of 3', n;
  end if;

  if not has_function_privilege('authenticated', 'public.receive_inbound_order(uuid)', 'execute')
     or not has_function_privilege('authenticated',
          'public.create_inbound_order(text, text, public.currency_code, date, date, numeric, jsonb)', 'execute')
     or not has_function_privilege('authenticated',
          'public.confirm_extraction_draft(uuid, text, text, public.currency_code, date, date, numeric, jsonb)', 'execute') then
    raise exception 'P3-312: authenticated lost execute on one of the three inbound functions';
  end if;
end
$$;


-- ===========================================================================
-- 2. FIXTURE, AS THE SUPERUSER
-- ===========================================================================

insert into auth.users (id, email) values
  ('e3312000-0000-4000-8000-000000000001', 'p3-312-owner@rc-inventory.local'),
  ('e3312000-0000-4000-8000-000000000002', 'p3-312-manager@rc-inventory.local');

insert into public.profiles (id, email, role, full_name, active) values
  ('e3312000-0000-4000-8000-000000000001', 'p3-312-owner@rc-inventory.local', 'owner', 'Test Owner 312', true),
  ('e3312000-0000-4000-8000-000000000002', 'p3-312-manager@rc-inventory.local', 'account_manager', 'Test Manager 312', true);

do $$
declare
  v_category uuid;
  v_id       uuid;
begin
  select id into v_category from public.categories order by name limit 1;
  if v_category is null then
    raise exception 'P3-312: no category loaded, so no test product can be written';
  end if;

  insert into public.products (sku, name, category_id, unit, unit_value_mdl)
  values ('TEST-P3312-SKU', 'TEST P3-312 produs', v_category, 'pcs', 10)
  returning id into v_id;
  perform set_config('p3_312.product', v_id::text, true);

  -- A draft read by the extraction service, waiting for the operator to confirm.
  insert into public.extraction_drafts
    (order_id, document_path, document_filename, mime_type, size_bytes, status, callback_at)
  values
    ('e3312000-0000-4000-8000-0000000d0001', 'inbound/e3312000/factura.pdf', 'factura.pdf',
     'application/pdf', 1, 'extracted', now());
end
$$;


-- ===========================================================================
-- 3. AN ACTIVE ACCOUNT MANAGER
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3312000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  v_p      uuid := current_setting('p3_312.product')::uuid;
  v_lines  jsonb := jsonb_build_array(jsonb_build_object('product_id', current_setting('p3_312.product'), 'quantity', 4, 'unit_price', 10));
  v_open   uuid;   -- pending, never received
  v_recv   uuid;   -- received through the button
  v_draft  uuid;   -- confirmed from the draft
  v_line   uuid;
  v_n      integer;
  r        record;
begin
  -- --- w1. the order screen: a total of 999999 is named, the screen's 40 is stored
  v_open := public.create_inbound_order('TEST-P3312-OPEN', 'TEST furnizor', 'MDL', null, date '2026-10-20', 999999, v_lines);
  perform set_config('p3_312.open', v_open::text, true);
  v_recv := public.create_inbound_order('TEST-P3312-RECV', 'TEST furnizor', 'MDL', null, date '2026-10-20', 40, v_lines);
  perform set_config('p3_312.recv', v_recv::text, true);
  perform set_config('p3_312.w4_create',
    coalesce(current_setting('rc.inbound_create', true), '') || '|' || coalesce(current_setting('rc.inbound_lines', true), ''), true);

  -- --- w2. the reception button
  select * into r from public.receive_inbound_order(v_recv);
  perform set_config('p3_312.w2_first', r.created_batches || ' ' || r.already_arrived, true);
  perform set_config('p3_312.w4_receive', coalesce(current_setting('rc.inbound_receive', true), ''), true);
  select * into r from public.receive_inbound_order(v_recv);
  perform set_config('p3_312.w2_second', r.created_batches || ' ' || r.already_arrived, true);

  -- --- w3. the draft confirmation
  begin
    v_draft := public.confirm_extraction_draft('e3312000-0000-4000-8000-0000000d0001', 'TEST-P3312-DRAFT',
      'TEST furnizor', 'MDL', null, date '2026-10-20', 5, v_lines);
    perform set_config('p3_312.draft', v_draft::text, true);
    perform set_config('p3_312.w3', 'accepted', true);
  exception when others then
    perform set_config('p3_312.w3', sqlstate || ' ' || sqlerrm, true);
  end;

  select id into v_line from public.order_lines where inbound_order_id = v_open;

  -- --- a. the HIGH finding: a batch posted straight onto a pending line
  begin
    insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
    values (v_p, v_open, v_line, 100000);
    perform set_config('p3_312.a', 'accepted', true);
  exception when others then
    perform set_config('p3_312.a', sqlstate, true);
  end;

  -- --- b. a flag naming another order does not open this one
  begin
    perform set_config('rc.inbound_receive', v_recv::text, true);
    insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
    values (v_p, v_open, v_line, 100000);
    perform set_config('p3_312.b', 'accepted', true);
  exception when others then
    perform set_config('p3_312.b', sqlstate, true);
  end;
  perform set_config('rc.inbound_receive', '', true);

  -- --- c. a received batch's quantity raised directly
  update public.batches set quantity = 100000 where inbound_order_id = v_recv;
  get diagnostics v_n = row_count;
  perform set_config('p3_312.c', v_n::text, true);

  -- --- d. a line added directly to a pending order
  begin
    insert into public.order_lines (inbound_order_id, product_id, quantity) values (v_open, v_p, 100000);
    perform set_config('p3_312.d', 'accepted', true);
  exception when others then
    perform set_config('p3_312.d', sqlstate, true);
  end;

  -- --- e. finding 1: a pending line's quantity raised before reception
  update public.order_lines set quantity = 100000 where inbound_order_id = v_open;
  get diagnostics v_n = row_count;
  perform set_config('p3_312.e', v_n::text, true);

  -- --- f. a line on an arrived order, even with the flag naming it
  begin
    perform set_config('rc.inbound_lines', v_recv::text, true);
    insert into public.order_lines (inbound_order_id, product_id, quantity) values (v_recv, v_p, 100000);
    perform set_config('p3_312.f', 'accepted', true);
  exception when others then
    perform set_config('p3_312.f', sqlstate, true);
  end;
  perform set_config('rc.inbound_lines', '', true);

  -- --- g. finding 2: an order saved as already arrived
  begin
    insert into public.inbound_orders (reference, supplier_name, status, arrived_at, total_mdl)
    values ('TEST-P3312-G', 'TEST furnizor', 'arrived', now(), 999999);
    perform set_config('p3_312.g', 'accepted', true);
  exception when others then
    perform set_config('p3_312.g', sqlstate || ' ' || sqlerrm, true);
  end;

  -- --- h. an order saved in the owner's name
  begin
    insert into public.inbound_orders (reference, supplier_name, created_by)
    values ('TEST-P3312-H', 'TEST furnizor', 'e3312000-0000-4000-8000-000000000001');
    perform set_config('p3_312.h', 'accepted', true);
  exception when others then
    perform set_config('p3_312.h', sqlstate || ' ' || sqlerrm, true);
  end;

  -- --- i. a pending order saved outside the order functions
  begin
    insert into public.inbound_orders (reference, supplier_name, total_mdl)
    values ('TEST-P3312-I', 'TEST furnizor', 999999);
    perform set_config('p3_312.i', 'accepted', true);
  exception when others then
    perform set_config('p3_312.i', sqlstate || ' ' || sqlerrm, true);
  end;

  -- --- j. a flag naming one number does not open another
  begin
    perform set_config('rc.inbound_create', 'TEST-P3312-OTHER', true);
    insert into public.inbound_orders (reference, supplier_name) values ('TEST-P3312-J', 'TEST furnizor');
    perform set_config('p3_312.j', 'accepted', true);
  exception when others then
    perform set_config('p3_312.j', sqlstate, true);
  end;
  perform set_config('rc.inbound_create', '', true);
end
$$;


-- ===========================================================================
-- 4. THE OWNER
-- ===========================================================================

set local request.jwt.claims = '{"sub":"e3312000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  v_p    uuid := current_setting('p3_312.product')::uuid;
  v_open uuid := current_setting('p3_312.open')::uuid;
  v_recv uuid := current_setting('p3_312.recv')::uuid;
  v_line uuid;
  v_n    integer;
begin
  select id into v_line from public.order_lines where inbound_order_id = v_open;

  begin
    insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
    values (v_p, v_open, v_line, 100000);
    perform set_config('p3_312.owner_batch_insert', 'accepted', true);
  exception when others then
    perform set_config('p3_312.owner_batch_insert', sqlstate, true);
  end;

  update public.batches set quantity = 100000 where inbound_order_id = v_recv;
  get diagnostics v_n = row_count;
  perform set_config('p3_312.owner_batch_update', v_n::text, true);

  update public.order_lines set quantity = 100000 where inbound_order_id = v_open;
  get diagnostics v_n = row_count;
  perform set_config('p3_312.owner_line_update', v_n::text, true);

  begin
    insert into public.inbound_orders (reference, supplier_name, status, arrived_at)
    values ('TEST-P3312-OWNER', 'TEST furnizor', 'arrived', now());
    perform set_config('p3_312.owner_order_insert', 'accepted', true);
  exception when others then
    perform set_config('p3_312.owner_order_insert', sqlstate, true);
  end;
end
$$;

reset role;


-- ===========================================================================
-- 5. A SERVER ROLE IS NOT GUARDED
-- ===========================================================================

set local request.jwt.claims = '{}';

do $$
begin
  insert into public.inbound_orders (reference, supplier_name, status, arrived_at)
  values ('TEST-P3312-SERVER', 'TEST furnizor', 'arrived', now());
  perform set_config('p3_312.server', 'accepted', true);
exception when others then
  perform set_config('p3_312.server', sqlstate || ' ' || sqlerrm, true);
end
$$;


-- ===========================================================================
-- 6. THE VERDICT, READ AS THE SUPERUSER
-- ===========================================================================

do $$
declare
  k      text;
  n      integer;
  q      numeric;
  v_p    uuid := current_setting('p3_312.product')::uuid;
  v_open uuid := current_setting('p3_312.open')::uuid;
  v_recv uuid := current_setting('p3_312.recv')::uuid;
  row_   record;
begin
  -- --- the witnesses
  select o.status::text as status, o.total_mdl, o.created_by, o.arrived_at, count(l.id) as lines, sum(l.quantity) as qty
    into row_
  from public.inbound_orders o left join public.order_lines l on l.inbound_order_id = o.id
  where o.id = v_open
  group by o.id;
  if row_.status <> 'pending_arrival' or row_.total_mdl <> 40 or row_.arrived_at is not null
     or row_.created_by <> 'e3312000-0000-4000-8000-000000000002'::uuid or row_.lines <> 1 or row_.qty <> 4 then
    raise exception 'P3-312: w1, the order screen did not save a pending order of one line of 4 at the computed 40 in the caller''s name: % % % % %',
      row_.status, row_.total_mdl, row_.created_by, row_.lines, row_.qty;
  end if;

  if current_setting('p3_312.w2_first') <> '1 false' then
    raise exception 'P3-312: w2, reception returned %, expected one batch', current_setting('p3_312.w2_first');
  end if;
  if current_setting('p3_312.w2_second') <> '0 true' then
    raise exception 'P3-312: w2, a second reception returned %, expected the no-op', current_setting('p3_312.w2_second');
  end if;
  select status::text into k from public.inbound_orders where id = v_recv and arrived_at is not null;
  if k is distinct from 'arrived' then
    raise exception 'P3-312: w2, the received order is %, expected arrived', coalesce(k, 'no row');
  end if;

  if current_setting('p3_312.w3') <> 'accepted' then
    raise exception 'P3-312: w3, the draft confirmation was refused: %', current_setting('p3_312.w3');
  end if;
  select o.status::text as status, o.total_mdl, count(l.id) as lines into row_
  from public.inbound_orders o left join public.order_lines l on l.inbound_order_id = o.id
  where o.id = current_setting('p3_312.draft')::uuid
  group by o.id;
  if row_.status <> 'pending_arrival' or row_.total_mdl <> 40 or row_.lines <> 1 then
    raise exception 'P3-312: w3, the confirmed draft is not a pending order of one line at 40: % % %',
      row_.status, row_.total_mdl, row_.lines;
  end if;

  if current_setting('p3_312.w4_create') <> '|' or current_setting('p3_312.w4_receive') <> '' then
    raise exception 'P3-312: w4, a flag was left set after a function returned: create %, receive %',
      current_setting('p3_312.w4_create'), current_setting('p3_312.w4_receive');
  end if;

  -- --- every direct door refused
  foreach k in array array['a', 'b', 'd', 'f', 'j', 'owner_batch_insert', 'owner_order_insert'] loop
    if current_setting('p3_312.' || k) <> '42501' then
      raise exception 'P3-312: case % was not refused, got %', k, current_setting('p3_312.' || k);
    end if;
  end loop;
  foreach k in array array['c', 'e', 'owner_batch_update', 'owner_line_update'] loop
    if current_setting('p3_312.' || k) <> '0' then
      raise exception 'P3-312: case % changed % row(s)', k, current_setting('p3_312.' || k);
    end if;
  end loop;

  -- the refusals say why, in Romanian
  if current_setting('p3_312.g') not like '42501 %Sosirea se confirmă numai prin recepție%' then
    raise exception 'P3-312: case g, an arrived order insert was not refused by the guard: %', current_setting('p3_312.g');
  end if;
  if current_setting('p3_312.h') not like '42501 %numai pe numele contului%' then
    raise exception 'P3-312: case h, an order in another name was not refused by the guard: %', current_setting('p3_312.h');
  end if;
  if current_setting('p3_312.i') not like '42501 %numai din ecranul de comenzi%' then
    raise exception 'P3-312: case i, a direct pending order was not refused by the guard: %', current_setting('p3_312.i');
  end if;

  -- --- the server role
  if current_setting('p3_312.server') <> 'accepted' then
    raise exception 'P3-312: a server role (no identity) could not write an arrived order: %', current_setting('p3_312.server');
  end if;

  -- --- the stock is exactly what one reception brought in
  select coalesce(sum(quantity), 0), count(*) into q, n from public.batches where product_id = v_p;
  if q <> 4 or n <> 1 then
    raise exception 'P3-312: product stock is % in % batch(es), expected 4 in one', q, n;
  end if;
  select coalesce(sum(quantity), 0) into q from public.order_lines where inbound_order_id = v_open;
  if q <> 4 then
    raise exception 'P3-312: the pending line now reads %, expected 4', q;
  end if;
  select count(*) into n from public.order_lines where inbound_order_id = v_recv;
  if n <> 1 then
    raise exception 'P3-312: the arrived order has % line(s), expected 1', n;
  end if;
  select count(*) into n from public.inbound_orders
  where reference in ('TEST-P3312-G', 'TEST-P3312-H', 'TEST-P3312-I', 'TEST-P3312-J', 'TEST-P3312-OWNER');
  if n <> 0 then
    raise exception 'P3-312: % order(s) were saved by a direct request', n;
  end if;
end
$$;

rollback;
