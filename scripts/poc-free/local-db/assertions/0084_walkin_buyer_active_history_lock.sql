-- assertions/0084_walkin_buyer_active_history_lock.sql
-- Card P3-277. A walk-in sale cannot go to a switched-off buyer, and nobody can
-- write a fake line into the status history, by a direct request.
--
--   1. THE SHAPE. The trigger status_history_guard exists, is enabled and fires
--      BEFORE INSERT; every writer keeps its signature and its security.
--   2. AS AN ACCOUNT MANAGER, with a real role switch and a JWT, so row level
--      security and the trigger apply exactly as on a PostgREST request:
--        a. a walk-in sale to a switched-off client is refused, P0001
--        b. a walk-in sale to a switched-off lead is refused, the lead keeps its stage
--        c. a walk-in sale to an active client saves, one history row
--        d. a walk-in sale to an active lead saves, the lead becomes client
--        e. a project slip saves, one history row
--        f. ship_outbound_issue ships the walk-in slip, one shipped row
--        g. a direct INSERT of a fake 'shipped' row on the project slip is refused
--        h. a direct INSERT of a fake 'cold' to 'client' row is refused
--        i. a direct INSERT on the slip f just shipped, in the same transaction,
--           is refused: the writer cleared its flag
--        j. create_inbound_order saves, one history row
--        k. receive_inbound_order receives it, one arrived row
--        l. confirm_extraction_draft confirms a draft, one history row
--        m. set_client_stage by the manager writes no history (owner only)
--        n. set_project_status by the manager writes no history (owner only)
--   3. AS THE OWNER, the guard applies too:
--        o. a direct INSERT of a fake row is refused
--        p. set_client_stage moves a client, one history row
--        q. set_client_stage records a first stage, one history row
--        r. set_project_status moves a project, one history row
--   4. A SERVER ROLE with no identity (service_role) can still write a row.
--
-- Refusals are read by SQLSTATE. Everything runs inside a transaction that is
-- rolled back.

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
  where tgrelid = 'public.status_history'::regclass
    and tgname = 'status_history_guard'
    and tgenabled = 'O'
    and (tgtype & 2) = 2   -- BEFORE
    and (tgtype & 4) = 4   -- INSERT
    and (tgtype & 1) = 1;  -- FOR EACH ROW
  if n <> 1 then
    raise exception 'P3-277: expected one enabled BEFORE INSERT row trigger status_history_guard, found %', n;
  end if;

  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and (p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef) in (
      ('create_direct_client_issue', 'p_reference text, p_lines jsonb, p_client_id uuid, p_pickup_date date', false),
      ('create_inbound_order', 'p_reference text, p_supplier_name text, p_currency currency_code, p_ordered_at date, p_expected_at date, p_total_mdl numeric, p_lines jsonb', false),
      ('confirm_extraction_draft', 'p_order_id uuid, p_reference text, p_supplier_name text, p_currency currency_code, p_ordered_at date, p_expected_at date, p_total_mdl numeric, p_lines jsonb', false),
      ('receive_inbound_order', 'p_order_id uuid', false),
      ('outbound_issue_take_stock', 'p_issue_id uuid, p_lines jsonb', true),
      ('ship_outbound_issue', 'p_issue_id uuid', false),
      ('set_project_status', 'p_project_id uuid, p_status project_status, p_note text', false),
      ('set_client_stage', 'p_client_id uuid, p_stage client_stage, p_follow_up_date date, p_first boolean', false),
      ('set_client_stage', 'p_client_id uuid, p_stage client_stage, p_follow_up_date date', false)
    );
  if n <> 9 then
    raise exception 'P3-277: expected the nine writer signatures with their security unchanged, found %', n;
  end if;

  if not has_function_privilege('authenticated', 'public.create_direct_client_issue(text, jsonb, uuid, date)', 'execute')
     or not has_function_privilege('authenticated', 'public.ship_outbound_issue(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_client_stage(uuid, public.client_stage, date, boolean)', 'execute') then
    raise exception 'P3-277: authenticated lost execute on a writer the screens call';
  end if;
end
$$;


-- ===========================================================================
-- 2. FIXTURE, AS THE SUPERUSER
-- ===========================================================================

insert into auth.users (id, email) values
  ('e3277000-0000-4000-8000-000000000001', 'p3-277-owner@rc-inventory.local'),
  ('e3277000-0000-4000-8000-000000000002', 'p3-277-manager@rc-inventory.local');

insert into public.profiles (id, email, role, full_name, active) values
  ('e3277000-0000-4000-8000-000000000001', 'p3-277-owner@rc-inventory.local', 'owner', 'Test Owner 277', true),
  ('e3277000-0000-4000-8000-000000000002', 'p3-277-manager@rc-inventory.local', 'account_manager', 'Test Manager 277', true);

do $$
declare
  v_product uuid;
  v_order   uuid;
  v_oline   uuid;
  v_id      uuid;
begin
  select id into v_product from public.products order by sku limit 1;
  if v_product is null then
    raise exception 'P3-277: no product loaded, so every case below would pass on nothing';
  end if;

  insert into public.inbound_orders (reference, supplier_name)
  values ('TEST-P3277-STOC', 'TEST furnizor') returning id into v_order;
  insert into public.order_lines (inbound_order_id, product_id, quantity, unit_price)
  values (v_order, v_product, 100, 10) returning id into v_oline;
  insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
  values (v_product, v_order, v_oline, 100);
  perform set_config('p3_277.product', v_product::text, true);

  insert into public.clients (name, stage) values ('TEST P3-277 client', 'client') returning id into v_id;
  perform set_config('p3_277.client', v_id::text, true);
  insert into public.clients (name, stage) values ('TEST P3-277 lead', 'quoted') returning id into v_id;
  perform set_config('p3_277.lead', v_id::text, true);
  insert into public.clients (name, stage, active) values ('TEST P3-277 client dezactivat', 'client', false)
    returning id into v_id;
  perform set_config('p3_277.off_client', v_id::text, true);
  insert into public.clients (name, stage, active) values ('TEST P3-277 lead dezactivat', 'quoted', false)
    returning id into v_id;
  perform set_config('p3_277.off_lead', v_id::text, true);
  insert into public.clients (name, stage) values ('TEST P3-277 client fara istoric', 'cold') returning id into v_id;
  perform set_config('p3_277.fresh', v_id::text, true);

  insert into public.projects (client_id, name)
  values (current_setting('p3_277.client')::uuid, 'TEST P3-277 proiect') returning id into v_id;
  perform set_config('p3_277.project', v_id::text, true);

  v_id := gen_random_uuid();
  insert into public.extraction_drafts (order_id, document_path, document_filename, mime_type, size_bytes, status)
  values (v_id, 'test/p3-277.pdf', 'p3-277.pdf', 'application/pdf', 1, 'extracted');
  perform set_config('p3_277.draft', v_id::text, true);
end
$$;


-- ===========================================================================
-- 3. AN ACTIVE ACCOUNT MANAGER
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3277000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  v_lines   jsonb := jsonb_build_array(jsonb_build_object(
                       'product_id', current_setting('p3_277.product')::uuid, 'quantity', 1));
  v_inlines jsonb := jsonb_build_array(jsonb_build_object(
                       'product_id', current_setting('p3_277.product')::uuid, 'quantity', 3, 'unit_price', '5'));
  v_id      uuid;
begin
  -- a.
  begin
    perform public.create_direct_client_issue(
      'TEST-P3277-OFF', v_lines, current_setting('p3_277.off_client')::uuid, date '2026-10-14');
    perform set_config('p3_277.a', 'accepted', true);
  exception when others then
    perform set_config('p3_277.a', sqlstate || ' ' || sqlerrm, true);
  end;

  -- b.
  begin
    perform public.create_direct_client_issue(
      'TEST-P3277-OFFLEAD', v_lines, current_setting('p3_277.off_lead')::uuid, date '2026-10-14');
    perform set_config('p3_277.b', 'accepted', true);
  exception when others then
    perform set_config('p3_277.b', sqlstate || ' ' || sqlerrm, true);
  end;

  -- c. Since 0089 (P3-331) a signed-in slip takes the next number in the series,
  -- so the accepted door calls c, d and e send it, as the screen does. a and b are
  -- refused by the door before its insert, so their references never reach it.
  v_id := public.create_direct_client_issue(
    public.outbound_next_reference(), v_lines, current_setting('p3_277.client')::uuid, date '2026-10-14');
  perform set_config('p3_277.walkin', coalesce(v_id::text, ''), true);

  -- d.
  v_id := public.create_direct_client_issue(
    public.outbound_next_reference(), v_lines, current_setting('p3_277.lead')::uuid, date '2026-10-14');
  perform set_config('p3_277.lead_slip', coalesce(v_id::text, ''), true);

  -- e.
  v_id := public.create_outbound_issue(
    public.outbound_next_reference(), null, null, v_lines, current_setting('p3_277.project')::uuid);
  perform set_config('p3_277.proj', coalesce(v_id::text, ''), true);

  -- f.
  perform public.ship_outbound_issue(current_setting('p3_277.walkin')::uuid);

  -- g. the defect itself: a fake shipment on a slip still waiting
  begin
    insert into public.status_history (entity_type, entity_id, from_status, to_status, note, changed_by)
    values ('outbound_issue', current_setting('p3_277.proj')::uuid, 'awaiting_shipment', 'shipped',
            'TEST P3-277 fals', 'e3277000-0000-4000-8000-000000000002');
    perform set_config('p3_277.g', 'accepted', true);
  exception when others then
    perform set_config('p3_277.g', sqlstate, true);
  end;

  -- h. the defect itself: a fake lead won
  begin
    insert into public.status_history (entity_type, entity_id, from_status, to_status, changed_by)
    values ('client', current_setting('p3_277.client')::uuid, 'cold', 'client',
            'e3277000-0000-4000-8000-000000000002');
    perform set_config('p3_277.h', 'accepted', true);
  exception when others then
    perform set_config('p3_277.h', sqlstate, true);
  end;

  -- i. right after a writer, in the same transaction, on the row it moved
  begin
    insert into public.status_history (entity_type, entity_id, from_status, to_status)
    values ('outbound_issue', current_setting('p3_277.walkin')::uuid, 'shipped', 'shipped');
    perform set_config('p3_277.i', 'accepted', true);
  exception when others then
    perform set_config('p3_277.i', sqlstate, true);
  end;

  -- j.
  v_id := public.create_inbound_order(
    'TEST-P3277-IN', 'TEST furnizor 277', 'MDL', date '2026-10-14', null, 15, v_inlines);
  perform set_config('p3_277.order', coalesce(v_id::text, ''), true);

  -- k.
  perform public.receive_inbound_order(current_setting('p3_277.order')::uuid);

  -- l.
  v_id := public.confirm_extraction_draft(
    current_setting('p3_277.draft')::uuid, 'TEST-P3277-DOC', 'TEST furnizor 277', 'MDL',
    date '2026-10-14', null, 15, v_inlines);
  perform set_config('p3_277.doc_order', coalesce(v_id::text, ''), true);

  -- m.
  begin
    perform public.set_client_stage(current_setting('p3_277.client')::uuid, 'cold', null, false);
    perform set_config('p3_277.m', 'accepted', true);
  exception when others then
    perform set_config('p3_277.m', sqlstate, true);
  end;

  -- n.
  begin
    perform public.set_project_status(current_setting('p3_277.project')::uuid, 'offer', null);
    perform set_config('p3_277.n', 'accepted', true);
  exception when others then
    perform set_config('p3_277.n', sqlstate, true);
  end;
end
$$;


-- ===========================================================================
-- 4. THE OWNER
-- ===========================================================================

set local request.jwt.claims = '{"sub":"e3277000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
begin
  -- o.
  begin
    insert into public.status_history (entity_type, entity_id, from_status, to_status)
    values ('outbound_issue', current_setting('p3_277.proj')::uuid, 'awaiting_shipment', 'shipped');
    perform set_config('p3_277.o', 'accepted', true);
  exception when others then
    perform set_config('p3_277.o', sqlstate, true);
  end;

  -- p.
  perform public.set_client_stage(current_setting('p3_277.client')::uuid, 'cold', null, false);

  -- q.
  perform public.set_client_stage(current_setting('p3_277.fresh')::uuid, 'nurture', null, true);

  -- r.
  perform public.set_project_status(current_setting('p3_277.project')::uuid, 'offer', 'TEST P3-277');
end
$$;


-- ===========================================================================
-- 5. A SERVER ROLE WITH NO IDENTITY
-- ===========================================================================

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

do $$
begin
  insert into public.status_history (entity_type, entity_id, from_status, to_status, note)
  values ('inbound_order', current_setting('p3_277.order')::uuid, 'arrived', 'arrived', 'TEST P3-277 server');
  perform set_config('p3_277.server', 'accepted', true);
exception when others then
  perform set_config('p3_277.server', sqlstate || ' ' || sqlerrm, true);
end
$$;

reset role;


-- ===========================================================================
-- 6. THE VERDICT, READ AS THE SUPERUSER
-- ===========================================================================

do $$
declare
  k   text;
  st  text;
  n   integer;
begin
  -- a, b: refused with P0001 and the Romanian reason, nothing written
  foreach k in array array['a', 'b'] loop
    if current_setting('p3_277.' || k) not like 'P0001 Clientul ales este dezactivat%' then
      raise exception 'P3-277: walk-in case % to a switched-off buyer was not refused: %', k, current_setting('p3_277.' || k);
    end if;
  end loop;
  select count(*) into n from public.outbound_issues where reference in ('TEST-P3277-OFF', 'TEST-P3277-OFFLEAD');
  if n <> 0 then
    raise exception 'P3-277: % slip(s) saved to a switched-off buyer', n;
  end if;
  select stage::text into st from public.clients where id = current_setting('p3_277.off_lead')::uuid;
  if st <> 'quoted' then
    raise exception 'P3-277: the switched-off lead moved to %', st;
  end if;
  select count(*) into n from public.status_history
  where entity_id in (current_setting('p3_277.off_client')::uuid, current_setting('p3_277.off_lead')::uuid);
  if n <> 0 then
    raise exception 'P3-277: % history row(s) written for a switched-off buyer', n;
  end if;

  -- c, d, e: every normal create saved
  if current_setting('p3_277.walkin') = '' or current_setting('p3_277.lead_slip') = ''
     or current_setting('p3_277.proj') = '' then
    raise exception 'P3-277: a normal create returned no slip: walkin %, lead %, project %',
      current_setting('p3_277.walkin'), current_setting('p3_277.lead_slip'), current_setting('p3_277.proj');
  end if;
  foreach k in array array['walkin', 'lead_slip', 'proj'] loop
    select count(*) into n from public.status_history
    where entity_type = 'outbound_issue' and entity_id = current_setting('p3_277.' || k)::uuid
      and from_status is null and to_status = 'awaiting_shipment';
    if n <> 1 then
      raise exception 'P3-277: slip % has % creation history rows, expected 1', k, n;
    end if;
  end loop;
  select stage::text into st from public.clients where id = current_setting('p3_277.lead')::uuid;
  if st <> 'client' then
    raise exception 'P3-277: the walk-in sale to an active lead left the stage at %', st;
  end if;
  select count(*) into n from public.status_history
  where entity_type = 'client' and entity_id = current_setting('p3_277.lead')::uuid
    and from_status = 'quoted' and to_status = 'client';
  if n <> 1 then
    raise exception 'P3-277: the lead won at the counter has % history rows, expected 1', n;
  end if;

  -- f.
  select status::text into st from public.outbound_issues where id = current_setting('p3_277.walkin')::uuid;
  if st <> 'shipped' then
    raise exception 'P3-277: ship_outbound_issue left the slip at %', st;
  end if;
  select count(*) into n from public.status_history
  where entity_type = 'outbound_issue' and entity_id = current_setting('p3_277.walkin')::uuid
    and to_status = 'shipped';
  if n <> 1 then
    raise exception 'P3-277: the shipped slip has % shipped history rows, expected 1 (case i must add none)', n;
  end if;

  -- g, h, i, o: the guard refused every direct insert, owner included
  foreach k in array array['g', 'h', 'i', 'o'] loop
    if current_setting('p3_277.' || k) <> '42501' then
      raise exception 'P3-277: direct history insert case % was not refused by the guard, got %', k, current_setting('p3_277.' || k);
    end if;
  end loop;
  select count(*) into n from public.status_history
  where entity_type = 'outbound_issue' and entity_id = current_setting('p3_277.proj')::uuid
    and to_status = 'shipped';
  if n <> 0 then
    raise exception 'P3-277: the waiting project slip carries % fake shipped row(s)', n;
  end if;
  select count(*) into n from public.status_history
  where entity_type = 'client' and entity_id = current_setting('p3_277.client')::uuid
    and from_status = 'cold' and to_status = 'client';
  if n <> 0 then
    raise exception 'P3-277: the client carries % fake cold to client row(s)', n;
  end if;

  -- j, k: a manual order, created then received
  if current_setting('p3_277.order') = '' then
    raise exception 'P3-277: create_inbound_order returned no order';
  end if;
  select count(*) into n from public.status_history
  where entity_type = 'inbound_order' and entity_id = current_setting('p3_277.order')::uuid
    and from_status is null and to_status = 'pending_arrival';
  if n <> 1 then
    raise exception 'P3-277: the manual order has % creation history rows, expected 1', n;
  end if;
  select status::text into st from public.inbound_orders where id = current_setting('p3_277.order')::uuid;
  if st <> 'arrived' then
    raise exception 'P3-277: receive_inbound_order left the order at %', st;
  end if;
  select count(*) into n from public.status_history
  where entity_type = 'inbound_order' and entity_id = current_setting('p3_277.order')::uuid
    and from_status = 'pending_arrival' and to_status = 'arrived';
  if n <> 1 then
    raise exception 'P3-277: the received order has % arrived history rows, expected 1', n;
  end if;

  -- l.
  if current_setting('p3_277.doc_order') = '' then
    raise exception 'P3-277: confirm_extraction_draft returned no order';
  end if;
  select count(*) into n from public.status_history
  where entity_type = 'inbound_order' and entity_id = current_setting('p3_277.doc_order')::uuid
    and from_status is null and to_status = 'pending_arrival';
  if n <> 1 then
    raise exception 'P3-277: the confirmed draft order has % creation history rows, expected 1', n;
  end if;

  -- m, n: the manager moved nothing and wrote nothing (refused or no row seen)
  if current_setting('p3_277.m') = 'accepted' or current_setting('p3_277.n') = 'accepted' then
    raise exception 'P3-277: the manager ran an owner-only move: client %, project %',
      current_setting('p3_277.m'), current_setting('p3_277.n');
  end if;

  -- p: the owner moved the client, one row client to cold
  select count(*) into n from public.status_history
  where entity_type = 'client' and entity_id = current_setting('p3_277.client')::uuid
    and from_status = 'client' and to_status = 'cold'
    and changed_by = 'e3277000-0000-4000-8000-000000000001';
  if n <> 1 then
    raise exception 'P3-277: the owner''s client move wrote % history rows, expected 1 (case m must add none)', n;
  end if;

  -- q.
  select count(*) into n from public.status_history
  where entity_type = 'client' and entity_id = current_setting('p3_277.fresh')::uuid
    and from_status is null and to_status = 'nurture';
  if n <> 1 then
    raise exception 'P3-277: the first stage wrote % history rows, expected 1', n;
  end if;

  -- r.
  select count(*) into n from public.status_history
  where entity_type = 'project' and entity_id = current_setting('p3_277.project')::uuid
    and to_status = 'offer';
  if n <> 1 then
    raise exception 'P3-277: the project move wrote % history rows, expected 1 (case n must add none)', n;
  end if;

  -- server role
  if current_setting('p3_277.server') <> 'accepted' then
    raise exception 'P3-277: a server role with no identity could not write history: %', current_setting('p3_277.server');
  end if;

  -- the flag is never left set after a writer returns
  if coalesce(current_setting('rc.status_history_write', true), '') <> '' then
    raise exception 'P3-277: rc.status_history_write left set to %', current_setting('rc.status_history_write', true);
  end if;
end
$$;

rollback;
