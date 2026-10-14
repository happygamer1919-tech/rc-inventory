-- assertions/0085_walkin_direct_insert_inactive_buyer.sql
-- Card P3-305. No walk-in slip and no stock for a switched-off buyer, whichever
-- door is tried: not only create_direct_client_issue (0084), but also a direct
-- INSERT on outbound_issues and a direct call of outbound_issue_take_stock.
--
--   1. THE SHAPE. The trigger outbound_issues_guard exists and is enabled; take
--      stock keeps its signature, SECURITY DEFINER and its grant to authenticated.
--   2. AS AN ACCOUNT MANAGER, with a real role switch and a JWT, so row level
--      security and the trigger apply exactly as on a PostgREST request:
--        a. a direct INSERT of a walk-in slip to a switched-off client is refused, P0001
--        b. take stock on a walk-in slip of a switched-off client (written by a
--           server role, created_by the manager, empty) is refused, P0001
--        c. a direct INSERT of a walk-in slip to an active client saves
--        d. take stock on that slip takes the stock, one line
--        e. create_direct_client_issue to an active client still saves
--        f. create_direct_client_issue to a switched-off client is still refused, P0001
--        g. a project slip still saves
--   3. AS THE OWNER:
--        h. take stock on the switched-off client's slip is refused too, P0001
--   4. A SERVER ROLE with no identity is not guarded (it wrote the fixture slip).
--
-- Refusals are read by SQLSTATE and message. Everything runs inside a transaction
-- that is rolled back.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n integer;
begin
  select count(*) into n
  from pg_trigger
  where tgrelid = 'public.outbound_issues'::regclass
    and tgname = 'outbound_issues_guard'
    and tgenabled = 'O';
  if n <> 1 then
    raise exception 'P3-305: expected one enabled trigger outbound_issues_guard, found %', n;
  end if;

  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'outbound_issue_take_stock'
    and pg_get_function_identity_arguments(p.oid) = 'p_issue_id uuid, p_lines jsonb'
    and p.prosecdef;
  if n <> 1 then
    raise exception 'P3-305: outbound_issue_take_stock lost its signature or SECURITY DEFINER, found %', n;
  end if;

  if not has_function_privilege('authenticated', 'public.outbound_issue_take_stock(uuid, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.outbound_issue_take_stock(uuid, jsonb)', 'execute') then
    raise exception 'P3-305: the grants of outbound_issue_take_stock changed';
  end if;
end
$$;


-- ===========================================================================
-- 2. FIXTURE, AS THE SUPERUSER (no identity, so the guard does not apply)
-- ===========================================================================

insert into auth.users (id, email) values
  ('e3305000-0000-4000-8000-000000000001', 'p3-305-owner@rc-inventory.local'),
  ('e3305000-0000-4000-8000-000000000002', 'p3-305-manager@rc-inventory.local');

insert into public.profiles (id, email, role, full_name, active) values
  ('e3305000-0000-4000-8000-000000000001', 'p3-305-owner@rc-inventory.local', 'owner', 'Test Owner 305', true),
  ('e3305000-0000-4000-8000-000000000002', 'p3-305-manager@rc-inventory.local', 'account_manager', 'Test Manager 305', true);

do $$
declare
  v_product uuid;
  v_order   uuid;
  v_oline   uuid;
  v_id      uuid;
begin
  select id into v_product from public.products order by sku limit 1;
  if v_product is null then
    raise exception 'P3-305: no product loaded, so every case below would pass on nothing';
  end if;

  insert into public.inbound_orders (reference, supplier_name)
  values ('TEST-P3305-STOC', 'TEST furnizor') returning id into v_order;
  insert into public.order_lines (inbound_order_id, product_id, quantity, unit_price)
  values (v_order, v_product, 100, 10) returning id into v_oline;
  insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
  values (v_product, v_order, v_oline, 100);
  perform set_config('p3_305.product', v_product::text, true);

  insert into public.clients (name, stage) values ('TEST P3-305 client', 'client') returning id into v_id;
  perform set_config('p3_305.client', v_id::text, true);
  insert into public.clients (name, stage, active) values ('TEST P3-305 client dezactivat', 'client', false)
    returning id into v_id;
  perform set_config('p3_305.off_client', v_id::text, true);

  insert into public.projects (client_id, name)
  values (current_setting('p3_305.client')::uuid, 'TEST P3-305 proiect') returning id into v_id;
  perform set_config('p3_305.project', v_id::text, true);

  -- The slip the defect left behind: a walk-in slip to a switched-off client, on
  -- the manager's name, still empty. Written here as a server role, because the
  -- guard now refuses it to a signed-in caller (case a).
  insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date, status, created_by)
  values ('TEST-P3305-OFFSLIP', 'direct_client', current_setting('p3_305.off_client')::uuid,
          date '2026-10-14', 'awaiting_shipment', 'e3305000-0000-4000-8000-000000000002')
  returning id into v_id;
  perform set_config('p3_305.off_slip', v_id::text, true);
end
$$;


-- ===========================================================================
-- 3. AN ACTIVE ACCOUNT MANAGER
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3305000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  v_lines jsonb := jsonb_build_array(jsonb_build_object(
                     'product_id', current_setting('p3_305.product')::uuid, 'quantity', 1));
  v_id    uuid;
begin
  -- a. the defect itself, step one: POST /rest/v1/outbound_issues
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date)
    values ('TEST-P3305-A', 'direct_client', current_setting('p3_305.off_client')::uuid, date '2026-10-14');
    perform set_config('p3_305.a', 'accepted', true);
  exception when others then
    perform set_config('p3_305.a', sqlstate || ' ' || sqlerrm, true);
  end;

  -- b. the defect itself, step two: POST /rest/v1/rpc/outbound_issue_take_stock
  begin
    perform public.outbound_issue_take_stock(current_setting('p3_305.off_slip')::uuid, v_lines);
    perform set_config('p3_305.b', 'accepted', true);
  exception when others then
    perform set_config('p3_305.b', sqlstate || ' ' || sqlerrm, true);
  end;

  -- c.
  insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date)
  values ('TEST-P3305-C', 'direct_client', current_setting('p3_305.client')::uuid, date '2026-10-14')
  returning id into v_id;
  perform set_config('p3_305.c', coalesce(v_id::text, ''), true);

  -- d.
  perform public.outbound_issue_take_stock(current_setting('p3_305.c')::uuid, v_lines);

  -- e.
  v_id := public.create_direct_client_issue(
    'TEST-P3305-E', v_lines, current_setting('p3_305.client')::uuid, date '2026-10-14');
  perform set_config('p3_305.e', coalesce(v_id::text, ''), true);

  -- f.
  begin
    perform public.create_direct_client_issue(
      'TEST-P3305-F', v_lines, current_setting('p3_305.off_client')::uuid, date '2026-10-14');
    perform set_config('p3_305.f', 'accepted', true);
  exception when others then
    perform set_config('p3_305.f', sqlstate || ' ' || sqlerrm, true);
  end;

  -- g.
  v_id := public.create_outbound_issue(
    'TEST-P3305-G', null, null, v_lines, current_setting('p3_305.project')::uuid);
  perform set_config('p3_305.g', coalesce(v_id::text, ''), true);
end
$$;


-- ===========================================================================
-- 4. THE OWNER
-- ===========================================================================

set local request.jwt.claims = '{"sub":"e3305000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
begin
  -- h.
  begin
    perform public.outbound_issue_take_stock(
      current_setting('p3_305.off_slip')::uuid,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('p3_305.product')::uuid, 'quantity', 1)));
    perform set_config('p3_305.h', 'accepted', true);
  exception when others then
    perform set_config('p3_305.h', sqlstate || ' ' || sqlerrm, true);
  end;
end
$$;

reset role;


-- ===========================================================================
-- 5. THE VERDICT, READ AS THE SUPERUSER
-- ===========================================================================

do $$
declare
  k text;
  n integer;
begin
  -- a, b, f, h: refused with P0001 and the Romanian reason of 0084
  foreach k in array array['a', 'b', 'f', 'h'] loop
    if current_setting('p3_305.' || k) not like 'P0001 Clientul ales este dezactivat%' then
      raise exception 'P3-305: case % for a switched-off buyer was not refused: %', k, current_setting('p3_305.' || k);
    end if;
  end loop;

  select count(*) into n from public.outbound_issues where reference in ('TEST-P3305-A', 'TEST-P3305-F');
  if n <> 0 then
    raise exception 'P3-305: % slip(s) saved to a switched-off buyer by a signed-in caller', n;
  end if;

  select count(*) into n from public.outbound_lines where outbound_issue_id = current_setting('p3_305.off_slip')::uuid;
  if n <> 0 then
    raise exception 'P3-305: stock left for a switched-off buyer: % line(s)', n;
  end if;
  select count(*) into n from public.status_history where entity_id = current_setting('p3_305.off_slip')::uuid;
  if n <> 0 then
    raise exception 'P3-305: % history row(s) on the switched-off buyer''s slip', n;
  end if;

  -- c, d, e, g: every normal path still works
  foreach k in array array['c', 'e', 'g'] loop
    if current_setting('p3_305.' || k) = '' then
      raise exception 'P3-305: case % returned no slip', k;
    end if;
    select count(*) into n from public.outbound_lines where outbound_issue_id = current_setting('p3_305.' || k)::uuid;
    if n <> 1 then
      raise exception 'P3-305: slip % has % line(s), expected 1', k, n;
    end if;
    select count(*) into n from public.status_history
    where entity_type = 'outbound_issue' and entity_id = current_setting('p3_305.' || k)::uuid
      and from_status is null and to_status = 'awaiting_shipment';
    if n <> 1 then
      raise exception 'P3-305: slip % has % creation history rows, expected 1', k, n;
    end if;
  end loop;

  select count(*) into n from public.outbound_issues
  where id = current_setting('p3_305.c')::uuid
    and created_by = 'e3305000-0000-4000-8000-000000000002' and issue_mode = 'direct_client';
  if n <> 1 then
    raise exception 'P3-305: the direct walk-in slip to an active client was not saved on the manager''s name';
  end if;
end
$$;

rollback;
