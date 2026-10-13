-- assertions/0081_walkin_lead_buyer_becomes_client.sql
-- Card P3-262. A walk-in sale to a lead moves the lead to client in the same
-- save, for the owner and the account manager, and nothing else lets the
-- account manager move a stage.
--
--   1. THE SHAPE. walkin_lead_becomes_client(uuid) is SECURITY DEFINER,
--      executable by authenticated and not by anon; create_direct_client_issue
--      keeps four arguments and stays SECURITY INVOKER.
--   2. AS AN ACCOUNT MANAGER, with a real role switch and a JWT, so row level
--      security applies:
--        a. a sale to a lead (quoted) writes the slip, the lead is now client,
--           with exactly one client history row quoted -> client by the manager
--        b. a sale to a client (the witness) leaves the stage and writes no
--           client history row
--        c. set_client_stage on another lead is refused and the stage stays
--        d. walkin_lead_becomes_client on a slip from an earlier request is
--           refused and the stage stays
--        e. a sale that overdraws stock is refused and the lead keeps its stage
--   3. AS THE OWNER, a sale to a lead (follow_up) moves it to client, and the
--      follow-up date is cleared the way set_client_stage always clears it.
--
-- Refusals are read as text without relying on diacritics. Everything runs
-- inside a transaction that is rolled back.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n integer;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'walkin_lead_becomes_client'
    and pg_get_function_identity_arguments(p.oid) = 'p_issue_id uuid'
    and p.prosecdef;
  if n <> 1 then
    raise exception 'P3-262: expected one SECURITY DEFINER public.walkin_lead_becomes_client(uuid), found %', n;
  end if;

  if not has_function_privilege('authenticated', 'public.walkin_lead_becomes_client(uuid)', 'execute') then
    raise exception 'P3-262: authenticated cannot execute walkin_lead_becomes_client, so no walk-in sale can be saved';
  end if;
  if has_function_privilege('anon', 'public.walkin_lead_becomes_client(uuid)', 'execute') then
    raise exception 'P3-262: anon can execute the SECURITY DEFINER walkin_lead_becomes_client';
  end if;

  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'create_direct_client_issue'
    and pg_get_function_identity_arguments(p.oid)
        = 'p_reference text, p_lines jsonb, p_client_id uuid, p_pickup_date date'
    and not p.prosecdef;
  if n <> 1 then
    raise exception 'P3-262: create_direct_client_issue must keep its four arguments and SECURITY INVOKER, found %', n;
  end if;
end
$$;


-- ===========================================================================
-- 2. FIXTURE, AS THE SUPERUSER
-- ===========================================================================

insert into auth.users (id, email) values
  ('e3262000-0000-4000-8000-000000000001', 'p3-262-owner@rc-inventory.local'),
  ('e3262000-0000-4000-8000-000000000002', 'p3-262-manager@rc-inventory.local');

insert into public.profiles (id, email, role, full_name, active) values
  ('e3262000-0000-4000-8000-000000000001', 'p3-262-owner@rc-inventory.local', 'owner', 'Test Owner 262', true),
  ('e3262000-0000-4000-8000-000000000002', 'p3-262-manager@rc-inventory.local', 'account_manager', 'Test Manager 262', true);

do $$
declare
  v_product uuid;
  v_order   uuid;
  v_oline   uuid;
  v_id      uuid;
begin
  select id into v_product from public.products order by sku limit 1;
  if v_product is null then
    raise exception 'P3-262: no product loaded, so every case below would pass on nothing';
  end if;

  insert into public.inbound_orders (reference, supplier_name)
  values ('TEST-P3262-IN', 'TEST furnizor') returning id into v_order;
  insert into public.order_lines (inbound_order_id, product_id, quantity, unit_price)
  values (v_order, v_product, 100, 10) returning id into v_oline;
  insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
  values (v_product, v_order, v_oline, 100);
  perform set_config('p3_262.product', v_product::text, true);

  insert into public.clients (name, stage) values ('TEST P3-262 lead manager', 'quoted') returning id into v_id;
  perform set_config('p3_262.lead_m', v_id::text, true);
  insert into public.clients (name, stage) values ('TEST P3-262 client', 'client') returning id into v_id;
  perform set_config('p3_262.client', v_id::text, true);
  insert into public.clients (name, stage) values ('TEST P3-262 lead fara vanzare', 'cold') returning id into v_id;
  perform set_config('p3_262.lead_alone', v_id::text, true);
  insert into public.clients (name, stage) values ('TEST P3-262 lead stoc', 'nurture') returning id into v_id;
  perform set_config('p3_262.lead_stock', v_id::text, true);
  insert into public.clients (name, stage, follow_up_date)
  values ('TEST P3-262 lead owner', 'follow_up', date '2026-12-01') returning id into v_id;
  perform set_config('p3_262.lead_o', v_id::text, true);

  -- A slip to lead_alone from an EARLIER request: written by the manager, its
  -- created_at one minute before this transaction.
  insert into public.outbound_issues
    (reference, issue_mode, client_id, pickup_date, status, created_by, created_at)
  values
    ('TEST-P3262-OLD', 'direct_client', current_setting('p3_262.lead_alone')::uuid,
     date '2026-10-10', 'awaiting_shipment',
     'e3262000-0000-4000-8000-000000000002', now() - interval '1 minute')
  returning id into v_id;
  perform set_config('p3_262.old_slip', v_id::text, true);
end
$$;


-- ===========================================================================
-- 3. AN ACTIVE ACCOUNT MANAGER
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3262000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  v_product uuid := current_setting('p3_262.product')::uuid;
  v_lines   jsonb;
  v_id      uuid;
begin
  v_lines := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1));

  -- a. the sale to a lead
  v_id := public.create_direct_client_issue(
    'TEST-P3262-M-LEAD', v_lines, current_setting('p3_262.lead_m')::uuid, date '2026-10-10');
  perform set_config('p3_262.slip_m', coalesce(v_id::text, ''), true);

  -- b. the witness: the sale to a client
  v_id := public.create_direct_client_issue(
    'TEST-P3262-M-CLIENT', v_lines, current_setting('p3_262.client')::uuid, date '2026-10-10');
  perform set_config('p3_262.slip_c', coalesce(v_id::text, ''), true);

  -- c. set_client_stage, without a sale
  begin
    perform public.set_client_stage(
      current_setting('p3_262.lead_alone')::uuid, 'client'::public.client_stage, null::date, false);
    perform set_config('p3_262.m_set_stage', 'accepted', true);
  exception when others then
    perform set_config('p3_262.m_set_stage', 'refused: ' || sqlerrm, true);
  end;

  -- d. the helper on a slip from an earlier request
  begin
    perform public.walkin_lead_becomes_client(current_setting('p3_262.old_slip')::uuid);
    perform set_config('p3_262.m_old_slip', 'accepted', true);
  exception when others then
    perform set_config('p3_262.m_old_slip', sqlstate || ' ' || sqlerrm, true);
  end;

  -- e. a sale that overdraws stock
  begin
    perform public.create_direct_client_issue(
      'TEST-P3262-M-STOCK',
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 100000)),
      current_setting('p3_262.lead_stock')::uuid, date '2026-10-10');
    perform set_config('p3_262.m_stock', 'accepted', true);
  exception when others then
    perform set_config('p3_262.m_stock', 'refused: ' || sqlerrm, true);
  end;
end
$$;


-- ===========================================================================
-- 4. THE OWNER
-- ===========================================================================

set local request.jwt.claims = '{"sub":"e3262000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  v_product uuid := current_setting('p3_262.product')::uuid;
  v_id      uuid;
begin
  v_id := public.create_direct_client_issue(
    'TEST-P3262-O-LEAD',
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1)),
    current_setting('p3_262.lead_o')::uuid, date '2026-10-10');
  perform set_config('p3_262.slip_o', coalesce(v_id::text, ''), true);
end
$$;

reset role;


-- ===========================================================================
-- 5. THE VERDICT, READ AS THE SUPERUSER
-- ===========================================================================

do $$
declare
  st  text;
  n   integer;
  fr  text;
  by_ uuid;
  fud date;
  txt text;
begin
  -- a.
  if current_setting('p3_262.slip_m') = '' then
    raise exception 'P3-262: the manager sale to a lead returned no slip';
  end if;
  select stage::text into st from public.clients where id = current_setting('p3_262.lead_m')::uuid;
  if st <> 'client' then
    raise exception 'P3-262: the manager sale to a lead left the stage at %', st;
  end if;
  select count(*) into n from public.status_history
  where entity_type = 'client' and entity_id = current_setting('p3_262.lead_m')::uuid;
  if n <> 1 then
    raise exception 'P3-262: the manager sale to a lead wrote % client history rows, expected 1', n;
  end if;
  select from_status, changed_by into fr, by_ from public.status_history
  where entity_type = 'client' and entity_id = current_setting('p3_262.lead_m')::uuid;
  if fr <> 'quoted' or by_ <> 'e3262000-0000-4000-8000-000000000002' then
    raise exception 'P3-262: the history row reads from % by %, expected quoted by the manager', fr, by_;
  end if;
  select client_id::text into txt from public.outbound_issues where id = current_setting('p3_262.slip_m')::uuid;
  if txt <> current_setting('p3_262.lead_m') then
    raise exception 'P3-262: the slip names another client';
  end if;

  -- b.
  select stage::text into st from public.clients where id = current_setting('p3_262.client')::uuid;
  select count(*) into n from public.status_history
  where entity_type = 'client' and entity_id = current_setting('p3_262.client')::uuid;
  if st <> 'client' or n <> 0 or current_setting('p3_262.slip_c') = '' then
    raise exception 'P3-262: the sale to a client changed something: stage %, % history rows', st, n;
  end if;

  -- c.
  txt := current_setting('p3_262.m_set_stage');
  select stage::text into st from public.clients where id = current_setting('p3_262.lead_alone')::uuid;
  if st <> 'cold' then
    raise exception 'P3-262: the manager moved a lead with set_client_stage and no sale (%), stage %', txt, st;
  end if;

  -- d.
  txt := current_setting('p3_262.m_old_slip');
  if txt not like '42501%' then
    raise exception 'P3-262: the helper on an earlier slip was not refused with 42501, got %', txt;
  end if;
  select stage::text into st from public.clients where id = current_setting('p3_262.lead_alone')::uuid;
  if st <> 'cold' then
    raise exception 'P3-262: the helper on an earlier slip moved the lead to %', st;
  end if;

  -- e.
  txt := current_setting('p3_262.m_stock');
  if txt not like 'refused:%INSUFFICIENT_STOCK%' then
    raise exception 'P3-262: the overdrawing sale was not refused on stock, got %', txt;
  end if;
  select stage::text into st from public.clients where id = current_setting('p3_262.lead_stock')::uuid;
  select count(*) into n from public.status_history
  where entity_type = 'client' and entity_id = current_setting('p3_262.lead_stock')::uuid;
  if st <> 'nurture' or n <> 0 then
    raise exception 'P3-262: a refused sale moved the lead to % with % history rows', st, n;
  end if;
  select count(*) into n from public.outbound_issues where reference = 'TEST-P3262-M-STOCK';
  if n <> 0 then
    raise exception 'P3-262: a refused sale left its slip';
  end if;

  -- owner
  select stage::text, follow_up_date into st, fud from public.clients
  where id = current_setting('p3_262.lead_o')::uuid;
  if st <> 'client' or fud is not null then
    raise exception 'P3-262: the owner sale to a lead left stage % and follow-up date %', st, fud;
  end if;
  select count(*) into n from public.status_history
  where entity_type = 'client' and entity_id = current_setting('p3_262.lead_o')::uuid
    and from_status = 'follow_up' and to_status = 'client';
  if n <> 1 then
    raise exception 'P3-262: the owner sale to a lead wrote % follow_up -> client rows, expected 1', n;
  end if;
end
$$;

rollback;
