-- assertions/0086_inbound_orders_active_account.sql
-- Card P3-180. A switched-off account no longer reads or writes incoming orders,
-- their lines or the low stock reminders, and no signed-in account can mark an
-- order arrived, or change its total or its number, by a direct request.
--
--   1. THE SHAPE. public.inbound_orders, public.order_lines and public.reminders
--      each carry exactly four policies: select, insert and update on
--      public.current_app_role() is not null (update on both sides), no bare
--      true left, delete still on public.is_owner(). The trigger
--      inbound_orders_guard exists and is enabled; receive_inbound_order(uuid)
--      keeps its signature, stays SECURITY INVOKER and executable by
--      authenticated.
--   2. ONE ACCOUNT MANAGER, with a real role switch and a JWT, so row level
--      security applies (the same path as a PostgREST request):
--        WHILE ACTIVE, the witnesses: it reads an order, its line and a reminder,
--        creates an order through create_inbound_order, inserts an order, a line
--        and a reminder directly, and updates each of the three.
--        SWITCHED OFF, the same account: reads no row of any of the three,
--        every insert is refused, every update touches no row,
--        create_inbound_order is refused, receive_inbound_order finds no order.
--   3. AN ACTIVE ACCOUNT MANAGER, against the guard:
--        a. an UPDATE of status to arrived is refused
--        b. an UPDATE of total_mdl is refused
--        c. an UPDATE of reference is refused
--        d. an UPDATE of document_path and document_uploaded_at is accepted
--           (the document upload screen)
--        e. an UPDATE of order_ref and order_ref_series is accepted (the draft
--           confirmation screen)
--        f. receive_inbound_order still receives the order: one batch, one
--           arrived history row
--        g. an UPDATE of status back to pending_arrival is refused
--        h. an UPDATE of arrived_at on the arrived order is refused
--        i. a second receive_inbound_order is a no-op
--        j. a flag naming ANOTHER order does not open this one
--   4. THE OWNER is guarded too: an UPDATE of total_mdl and an UPDATE of status
--      are refused.
--
-- SINCE 0087 (card P3-312), three things here changed on purpose and the file
-- follows them: order_lines has THREE policies (order_lines_update is gone, and
-- order_lines_insert also needs the rc.inbound_lines flag and a pending order),
-- so an active account no longer inserts an order or a line directly (42501) and
-- its direct UPDATE of a line touches no row. Both used to be witnesses here.
-- assertions/0087 checks the new rules in detail.
--
-- Refusals are read by SQLSTATE. Everything runs inside a transaction that is
-- rolled back.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n    integer;
  txt  text;
  tbl  text;
  v_cmd text;
begin
  foreach tbl in array array['inbound_orders', 'order_lines', 'reminders'] loop
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = tbl;
    if n <> (case when tbl = 'order_lines' then 3 else 4 end) then
      raise exception 'P3-180: expected exactly % policies on public.%, found %',
        case when tbl = 'order_lines' then 3 else 4 end, tbl, n;
    end if;

    -- 0087 (P3-312): nobody signed in updates an order line.
    if tbl = 'order_lines' then
      select count(*) into n from pg_policies
      where schemaname = 'public' and tablename = tbl and cmd in ('UPDATE', 'ALL');
      if n <> 0 then
        raise exception 'P3-312: public.order_lines gained an update policy again';
      end if;
    end if;

    foreach v_cmd in array case when tbl = 'order_lines' then array['SELECT', 'INSERT']
                                else array['SELECT', 'INSERT', 'UPDATE'] end loop
      select coalesce(p.qual, '') || ' | ' || coalesce(p.with_check, '') into txt
      from pg_policies p
      where p.schemaname = 'public' and p.tablename = tbl
        and p.policyname = tbl || '_' || lower(v_cmd) and p.cmd = v_cmd;
      if txt is null then
        raise exception 'P3-180: policy %_% is missing on public.%', tbl, lower(v_cmd), tbl;
      end if;
      if v_cmd = 'UPDATE' and txt not ilike '%current_app_role()%is not null%|%current_app_role()%is not null%' then
        raise exception 'P3-180: %_update must test current_app_role() is not null on both sides, found %', tbl, txt;
      end if;
      if txt not ilike '%current_app_role()%is not null%' then
        raise exception 'P3-180: %_% must test current_app_role() is not null, found %', tbl, lower(v_cmd), txt;
      end if;
      -- A bare true is `true` on its own or in parentheses. Since 0087 (P3-312)
      -- order_lines_insert reads current_setting('rc.inbound_lines', true), and
      -- that argument, after a comma, is not a bare true.
      if txt ~* '(^|[(|] ?)true( ?[)|]|$)' then
        raise exception 'P3-180: %_% still carries a bare true, found %', tbl, lower(v_cmd), txt;
      end if;
    end loop;

    select p.qual into txt
    from pg_policies p
    where p.schemaname = 'public' and p.tablename = tbl
      and p.policyname = tbl || '_delete' and p.cmd = 'DELETE';
    if txt is null or txt not ilike '%is_owner()%' then
      raise exception 'P3-180: %_delete must stay on is_owner(), found %', tbl, coalesce(txt, 'nothing');
    end if;
  end loop;

  select count(*) into n
  from pg_trigger
  where tgrelid = 'public.inbound_orders'::regclass
    and tgname = 'inbound_orders_guard'
    and tgenabled = 'O';
  if n <> 1 then
    raise exception 'P3-180: expected one enabled trigger inbound_orders_guard, found %', n;
  end if;

  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'receive_inbound_order'
    and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid'
    and not p.prosecdef;
  if n <> 1 then
    raise exception 'P3-180: receive_inbound_order must keep (p_order_id uuid) and SECURITY INVOKER, found %', n;
  end if;

  if not has_function_privilege('authenticated', 'public.receive_inbound_order(uuid)', 'execute') then
    raise exception 'P3-180: authenticated cannot execute receive_inbound_order, so nothing can arrive';
  end if;
end
$$;


-- ===========================================================================
-- 2. FIXTURE, AS THE SUPERUSER
-- ===========================================================================

insert into auth.users (id, email) values
  ('e3180000-0000-4000-8000-000000000001', 'p3-180-owner@rc-inventory.local'),
  ('e3180000-0000-4000-8000-000000000002', 'p3-180-manager@rc-inventory.local'),
  ('e3180000-0000-4000-8000-000000000003', 'p3-180-switched-off@rc-inventory.local');

insert into public.profiles (id, email, role, full_name, active) values
  ('e3180000-0000-4000-8000-000000000001', 'p3-180-owner@rc-inventory.local', 'owner', 'Test Owner 180', true),
  ('e3180000-0000-4000-8000-000000000002', 'p3-180-manager@rc-inventory.local', 'account_manager', 'Test Manager 180', true),
  ('e3180000-0000-4000-8000-000000000003', 'p3-180-switched-off@rc-inventory.local', 'account_manager', 'Test Oprit 180', true);

do $$
declare
  v_category uuid;
  v_id       uuid;
  i          integer;
begin
  select id into v_category from public.categories order by name limit 1;
  if v_category is null then
    raise exception 'P3-180: no category loaded, so no test product can be written';
  end if;

  for i in 1 .. 3 loop
    insert into public.products (sku, name, category_id, unit, unit_value_mdl)
    values ('TEST-P3180-SKU-' || i, 'TEST P3-180 produs ' || i, v_category, 'pcs', 10)
    returning id into v_id;
    perform set_config('p3_180.product' || i, v_id::text, true);
  end loop;

  insert into public.inbound_orders (reference, supplier_name)
  values ('TEST-P3180-SEED', 'TEST furnizor') returning id into v_id;
  perform set_config('p3_180.seed', v_id::text, true);
  insert into public.order_lines (inbound_order_id, product_id, quantity, unit_price)
  values (v_id, current_setting('p3_180.product1')::uuid, 5, 10);

  insert into public.reminders (product_id) values (current_setting('p3_180.product1')::uuid);
end
$$;


-- ===========================================================================
-- 3. ONE ACCOUNT MANAGER, WHILE ACTIVE: THE WITNESSES
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3180000-0000-4000-8000-000000000003","role":"authenticated"}';

do $$
declare
  v_seed  uuid := current_setting('p3_180.seed')::uuid;
  v_p1    uuid := current_setting('p3_180.product1')::uuid;
  v_p2    uuid := current_setting('p3_180.product2')::uuid;
  v_lines jsonb := jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 2));
  v_id    uuid;
  v_n     integer;
begin
  select count(*) into v_n from public.inbound_orders where id = v_seed;
  perform set_config('p3_180.w_read_order', v_n::text, true);
  select count(*) into v_n from public.order_lines where inbound_order_id = v_seed;
  perform set_config('p3_180.w_read_line', v_n::text, true);
  select count(*) into v_n from public.reminders where product_id = v_p1;
  perform set_config('p3_180.w_read_reminder', v_n::text, true);

  begin
    v_id := public.create_inbound_order('TEST-P3180-W-RPC', 'TEST furnizor', 'MDL', null, date '2026-10-20', 20, v_lines);
    perform set_config('p3_180.w_create', 'accepted', true);
  exception when others then
    perform set_config('p3_180.w_create', sqlstate || ' ' || sqlerrm, true);
  end;

  begin
    insert into public.inbound_orders (reference, supplier_name)
    values ('TEST-P3180-W-DIRECT', 'TEST furnizor') returning id into v_id;
    insert into public.order_lines (inbound_order_id, product_id, quantity)
    values (v_id, v_p1, 1);
    perform set_config('p3_180.w_insert', 'accepted', true);
  exception when others then
    perform set_config('p3_180.w_insert', sqlstate || ' ' || sqlerrm, true);
  end;

  begin
    insert into public.reminders (product_id) values (v_p2);
    perform set_config('p3_180.w_insert_reminder', 'accepted', true);
  exception when others then
    perform set_config('p3_180.w_insert_reminder', sqlstate || ' ' || sqlerrm, true);
  end;

  update public.inbound_orders set supplier_name = 'TEST furnizor martor' where id = v_seed;
  get diagnostics v_n = row_count;
  perform set_config('p3_180.w_update_order', v_n::text, true);
  update public.order_lines set unit_price = 11 where inbound_order_id = v_seed;
  get diagnostics v_n = row_count;
  perform set_config('p3_180.w_update_line', v_n::text, true);
  update public.reminders set is_armed = false where product_id = v_p1;
  get diagnostics v_n = row_count;
  perform set_config('p3_180.w_update_reminder', v_n::text, true);
end
$$;


-- ===========================================================================
-- 4. THE SAME ACCOUNT, SWITCHED OFF
-- ===========================================================================

reset role;
set local request.jwt.claims = '{}';
update public.profiles set active = false where id = 'e3180000-0000-4000-8000-000000000003';

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3180000-0000-4000-8000-000000000003","role":"authenticated"}';

do $$
declare
  v_seed  uuid := current_setting('p3_180.seed')::uuid;
  v_p1    uuid := current_setting('p3_180.product1')::uuid;
  v_p3    uuid := current_setting('p3_180.product3')::uuid;
  v_lines jsonb := jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 2));
  v_n     integer;
begin
  select count(*) into v_n from public.inbound_orders;
  perform set_config('p3_180.d_read_order', v_n::text, true);
  select count(*) into v_n from public.order_lines;
  perform set_config('p3_180.d_read_line', v_n::text, true);
  select count(*) into v_n from public.reminders;
  perform set_config('p3_180.d_read_reminder', v_n::text, true);

  begin
    insert into public.inbound_orders (reference, supplier_name) values ('TEST-P3180-D-DIRECT', 'TEST furnizor');
    perform set_config('p3_180.d_insert_order', 'accepted', true);
  exception when others then
    perform set_config('p3_180.d_insert_order', sqlstate, true);
  end;

  begin
    insert into public.order_lines (inbound_order_id, product_id, quantity) values (v_seed, v_p1, 1);
    perform set_config('p3_180.d_insert_line', 'accepted', true);
  exception when others then
    perform set_config('p3_180.d_insert_line', sqlstate, true);
  end;

  begin
    insert into public.reminders (product_id) values (v_p3);
    perform set_config('p3_180.d_insert_reminder', 'accepted', true);
  exception when others then
    perform set_config('p3_180.d_insert_reminder', sqlstate, true);
  end;

  begin
    perform public.create_inbound_order('TEST-P3180-D-RPC', 'TEST furnizor', 'MDL', null, date '2026-10-20', 20, v_lines);
    perform set_config('p3_180.d_create', 'accepted', true);
  exception when others then
    perform set_config('p3_180.d_create', sqlstate, true);
  end;

  begin
    perform public.receive_inbound_order(v_seed);
    perform set_config('p3_180.d_receive', 'accepted', true);
  exception when others then
    perform set_config('p3_180.d_receive', sqlstate, true);
  end;

  update public.inbound_orders set supplier_name = 'TEST furnizor oprit' where id = v_seed;
  get diagnostics v_n = row_count;
  perform set_config('p3_180.d_update_order', v_n::text, true);
  update public.order_lines set unit_price = 999 where inbound_order_id = v_seed;
  get diagnostics v_n = row_count;
  perform set_config('p3_180.d_update_line', v_n::text, true);
  update public.reminders set is_armed = true where product_id = v_p1;
  get diagnostics v_n = row_count;
  perform set_config('p3_180.d_update_reminder', v_n::text, true);
end
$$;


-- ===========================================================================
-- 5. AN ACTIVE ACCOUNT MANAGER, AGAINST THE GUARD
-- ===========================================================================

set local request.jwt.claims = '{"sub":"e3180000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  v_p1    uuid := current_setting('p3_180.product1')::uuid;
  v_lines jsonb := jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 4));
  v_m     uuid;
  v_other uuid;
  v_n     integer;
  r       record;
begin
  v_m := public.create_inbound_order('TEST-P3180-M', 'TEST furnizor', 'MDL', null, date '2026-10-20', 40, v_lines);
  perform set_config('p3_180.m', v_m::text, true);
  v_other := public.create_inbound_order('TEST-P3180-N', 'TEST furnizor', 'MDL', null, date '2026-10-20', 40, v_lines);
  perform set_config('p3_180.n', v_other::text, true);

  -- a. the defect itself: an order marked arrived with no stock behind it
  begin
    update public.inbound_orders set status = 'arrived', arrived_at = now() where id = v_m;
    get diagnostics v_n = row_count;
    perform set_config('p3_180.a', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_180.a', sqlstate, true);
  end;

  -- b.
  begin
    update public.inbound_orders set total_mdl = 999 where id = v_m;
    get diagnostics v_n = row_count;
    perform set_config('p3_180.b', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_180.b', sqlstate, true);
  end;

  -- c.
  begin
    update public.inbound_orders set reference = 'TEST-P3180-M-ALT' where id = v_m;
    get diagnostics v_n = row_count;
    perform set_config('p3_180.c', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_180.c', sqlstate, true);
  end;

  -- d. the document upload screen
  begin
    update public.inbound_orders
       set document_path = 'inbound/' || v_m || '/factura.pdf', document_uploaded_at = now()
     where id = v_m;
    get diagnostics v_n = row_count;
    perform set_config('p3_180.d', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_180.d', sqlstate || ' ' || sqlerrm, true);
  end;

  -- e. the draft confirmation screen
  begin
    update public.inbound_orders set order_ref = '0009312', order_ref_series = 'AV' where id = v_m;
    get diagnostics v_n = row_count;
    perform set_config('p3_180.e', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_180.e', sqlstate || ' ' || sqlerrm, true);
  end;

  -- f.
  select * into r from public.receive_inbound_order(v_m);
  perform set_config('p3_180.f', r.created_batches || ' ' || r.already_arrived, true);

  -- g.
  begin
    update public.inbound_orders set status = 'pending_arrival', arrived_at = null where id = v_m;
    get diagnostics v_n = row_count;
    perform set_config('p3_180.g', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_180.g', sqlstate, true);
  end;

  -- h.
  begin
    update public.inbound_orders set arrived_at = now() - interval '3 days' where id = v_m;
    get diagnostics v_n = row_count;
    perform set_config('p3_180.h', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_180.h', sqlstate, true);
  end;

  -- i.
  select * into r from public.receive_inbound_order(v_m);
  perform set_config('p3_180.i', r.created_batches || ' ' || r.already_arrived, true);

  -- j. a flag naming the first order does not open the second
  begin
    perform set_config('rc.inbound_receive', v_m::text, true);
    update public.inbound_orders set status = 'arrived', arrived_at = now() where id = v_other;
    get diagnostics v_n = row_count;
    perform set_config('p3_180.j', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_180.j', sqlstate, true);
  end;
  perform set_config('rc.inbound_receive', '', true);
end
$$;


-- ===========================================================================
-- 6. THE OWNER
-- ===========================================================================

set local request.jwt.claims = '{"sub":"e3180000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  v_other uuid := current_setting('p3_180.n')::uuid;
  v_n     integer;
begin
  begin
    update public.inbound_orders set total_mdl = 1 where id = v_other;
    get diagnostics v_n = row_count;
    perform set_config('p3_180.owner_total', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_180.owner_total', sqlstate, true);
  end;

  begin
    update public.inbound_orders set status = 'arrived', arrived_at = now() where id = v_other;
    get diagnostics v_n = row_count;
    perform set_config('p3_180.owner_status', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_180.owner_status', sqlstate, true);
  end;
end
$$;

reset role;


-- ===========================================================================
-- 7. THE VERDICT, READ AS THE SUPERUSER
-- ===========================================================================

do $$
declare
  k    text;
  st   text;
  n    integer;
  v_m  uuid := current_setting('p3_180.m')::uuid;
  v_n  uuid := current_setting('p3_180.n')::uuid;
  v_p1 uuid := current_setting('p3_180.product1')::uuid;
  row_ record;
begin
  -- 2. the witnesses: while active the account did all of it
  foreach k in array array['w_read_order', 'w_read_line', 'w_read_reminder',
                           'w_update_order', 'w_update_reminder'] loop
    if current_setting('p3_180.' || k) <> '1' then
      raise exception 'P3-180: witness % saw %, expected 1 row while active', k, current_setting('p3_180.' || k);
    end if;
  end loop;
  foreach k in array array['w_create', 'w_insert_reminder'] loop
    if current_setting('p3_180.' || k) <> 'accepted' then
      raise exception 'P3-180: witness % was refused while active: %', k, current_setting('p3_180.' || k);
    end if;
  end loop;
  -- 0087 (P3-312): a direct order or line insert and a direct line update are
  -- refused even while active. Only the two order functions add them.
  if current_setting('p3_180.w_insert') not like '42501%' then
    raise exception 'P3-312: an active account inserted an order and a line directly: %', current_setting('p3_180.w_insert');
  end if;
  if current_setting('p3_180.w_update_line') <> '0' then
    raise exception 'P3-312: an active account updated % order line(s) directly', current_setting('p3_180.w_update_line');
  end if;

  -- 2. switched off: nothing read, nothing written
  foreach k in array array['d_read_order', 'd_read_line', 'd_read_reminder',
                           'd_update_order', 'd_update_line', 'd_update_reminder'] loop
    if current_setting('p3_180.' || k) <> '0' then
      raise exception 'P3-180: switched off, % still reached % row(s)', k, current_setting('p3_180.' || k);
    end if;
  end loop;
  foreach k in array array['d_insert_order', 'd_insert_line', 'd_insert_reminder', 'd_create'] loop
    if current_setting('p3_180.' || k) <> '42501' then
      raise exception 'P3-180: switched off, % was not refused by the policy, got %', k, current_setting('p3_180.' || k);
    end if;
  end loop;
  if current_setting('p3_180.d_receive') <> 'P0002' then
    raise exception 'P3-180: switched off, receive_inbound_order did not find the order missing, got %',
      current_setting('p3_180.d_receive');
  end if;

  select o.supplier_name, o.status::text, l.unit_price::text into row_
  from public.inbound_orders o join public.order_lines l on l.inbound_order_id = o.id
  where o.reference = 'TEST-P3180-SEED';
  -- unit_price stays 10.00: since 0087 the active witness could not change it either.
  if row_.supplier_name <> 'TEST furnizor martor' or row_.unit_price <> '10.00' or row_.status <> 'pending_arrival' then
    raise exception 'P3-180: the switched off account changed the seed order: % % %',
      row_.supplier_name, row_.unit_price, row_.status;
  end if;
  select count(*) into n from public.batches b join public.inbound_orders o on o.id = b.inbound_order_id
  where o.reference = 'TEST-P3180-SEED';
  if n <> 0 then
    raise exception 'P3-180: the switched off account received the seed order, % batch(es)', n;
  end if;
  select count(*) into n from public.reminders where product_id = v_p1 and not is_armed;
  if n <> 1 then
    raise exception 'P3-180: the switched off account re-armed the reminder';
  end if;
  select count(*) into n from public.inbound_orders where reference in ('TEST-P3180-D-DIRECT', 'TEST-P3180-D-RPC');
  if n <> 0 then
    raise exception 'P3-180: % order(s) written by the switched off account', n;
  end if;
  select count(*) into n from public.reminders where product_id = current_setting('p3_180.product3')::uuid;
  if n <> 0 then
    raise exception 'P3-180: a reminder was written by the switched off account';
  end if;

  -- 3 and 4. the guard
  foreach k in array array['a', 'b', 'c', 'g', 'h', 'j', 'owner_total', 'owner_status'] loop
    if current_setting('p3_180.' || k) <> '42501' then
      raise exception 'P3-180: case % was not refused by the guard, got %', k, current_setting('p3_180.' || k);
    end if;
  end loop;
  foreach k in array array['d', 'e'] loop
    if current_setting('p3_180.' || k) <> 'accepted 1' then
      raise exception 'P3-180: the screen update % was refused: %', k, current_setting('p3_180.' || k);
    end if;
  end loop;

  -- f. and i.
  if current_setting('p3_180.f') <> '1 false' then
    raise exception 'P3-180: receive_inbound_order returned %, expected one batch, not already arrived', current_setting('p3_180.f');
  end if;
  if current_setting('p3_180.i') <> '0 true' then
    raise exception 'P3-180: a second receive returned %, expected the no-op', current_setting('p3_180.i');
  end if;

  select status::text into st from public.inbound_orders
  where id = v_m and total_mdl = 40 and reference = 'TEST-P3180-M'
    and document_path is not null and order_ref = '0009312' and order_ref_series = 'AV';
  if st is distinct from 'arrived' then
    raise exception 'P3-180: order M is not arrived with its total, number, document and supplier reference intact (%)', coalesce(st, 'no row');
  end if;
  select count(*) into n from public.batches where inbound_order_id = v_m;
  if n <> 1 then
    raise exception 'P3-180: order M has % batch(es), expected 1', n;
  end if;
  select count(*) into n from public.status_history
  where entity_type = 'inbound_order' and entity_id = v_m and to_status = 'arrived';
  if n <> 1 then
    raise exception 'P3-180: receiving wrote % arrived history rows, expected 1', n;
  end if;

  select status::text into st from public.inbound_orders where id = v_n and total_mdl = 40;
  if st is distinct from 'pending_arrival' then
    raise exception 'P3-180: order N is % or lost its total, expected pending_arrival at 40', coalesce(st, 'no row');
  end if;
end
$$;

rollback;
