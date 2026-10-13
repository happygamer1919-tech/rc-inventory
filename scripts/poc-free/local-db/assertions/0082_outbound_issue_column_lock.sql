-- assertions/0082_outbound_issue_column_lock.sql
-- Card P3-266. A walk-in sale can no longer be retyped as a project sale, moved
-- to another client, or have its status forced, by a direct request.
--
--   1. THE SHAPE. The trigger outbound_issues_guard exists and is enabled;
--      ship_outbound_issue(uuid) keeps its signature and stays executable by
--      authenticated.
--   2. AS AN ACCOUNT MANAGER, with a real role switch and a JWT, so row level
--      security applies (the same path as a PostgREST PATCH):
--        a. the normal walk-in create to a client saves
--        b. the walk-in create to a lead saves and the lead becomes client
--        c. the project create saves
--        d. an UPDATE of issue_mode to project on a walk-in slip is refused
--        e. an UPDATE of client_id on a walk-in slip is refused
--        f. an UPDATE of project_id on a project slip is refused
--        g. an UPDATE of created_by is refused
--        h. an UPDATE of status to shipped is refused
--        i. ship_outbound_issue still ships the slip
--        j. a direct INSERT of a project slip carrying a client is refused
--        k. a direct INSERT on another account's name is refused
--        l. a direct INSERT already shipped is refused
--        m. a direct INSERT of a walk-in slip with a project is refused
--        n. a direct INSERT of a walk-in slip the doors would write is accepted
--   3. THE OWNER is guarded too: an UPDATE of issue_mode is refused.
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
  where tgrelid = 'public.outbound_issues'::regclass
    and tgname = 'outbound_issues_guard'
    and tgenabled = 'O';
  if n <> 1 then
    raise exception 'P3-266: expected one enabled trigger outbound_issues_guard, found %', n;
  end if;

  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'ship_outbound_issue'
    and pg_get_function_identity_arguments(p.oid) = 'p_issue_id uuid'
    and not p.prosecdef;
  if n <> 1 then
    raise exception 'P3-266: ship_outbound_issue must keep (p_issue_id uuid) and SECURITY INVOKER, found %', n;
  end if;

  if not has_function_privilege('authenticated', 'public.ship_outbound_issue(uuid)', 'execute') then
    raise exception 'P3-266: authenticated cannot execute ship_outbound_issue, so nothing can be shipped';
  end if;
end
$$;


-- ===========================================================================
-- 2. FIXTURE, AS THE SUPERUSER
-- ===========================================================================

insert into auth.users (id, email) values
  ('e3266000-0000-4000-8000-000000000001', 'p3-266-owner@rc-inventory.local'),
  ('e3266000-0000-4000-8000-000000000002', 'p3-266-manager@rc-inventory.local');

insert into public.profiles (id, email, role, full_name, active) values
  ('e3266000-0000-4000-8000-000000000001', 'p3-266-owner@rc-inventory.local', 'owner', 'Test Owner 266', true),
  ('e3266000-0000-4000-8000-000000000002', 'p3-266-manager@rc-inventory.local', 'account_manager', 'Test Manager 266', true);

do $$
declare
  v_product uuid;
  v_order   uuid;
  v_oline   uuid;
  v_id      uuid;
begin
  select id into v_product from public.products order by sku limit 1;
  if v_product is null then
    raise exception 'P3-266: no product loaded, so every case below would pass on nothing';
  end if;

  insert into public.inbound_orders (reference, supplier_name)
  values ('TEST-P3266-IN', 'TEST furnizor') returning id into v_order;
  insert into public.order_lines (inbound_order_id, product_id, quantity, unit_price)
  values (v_order, v_product, 100, 10) returning id into v_oline;
  insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
  values (v_product, v_order, v_oline, 100);
  perform set_config('p3_266.product', v_product::text, true);

  insert into public.clients (name, stage) values ('TEST P3-266 client', 'client') returning id into v_id;
  perform set_config('p3_266.client', v_id::text, true);
  insert into public.clients (name, stage) values ('TEST P3-266 alt client', 'client') returning id into v_id;
  perform set_config('p3_266.client2', v_id::text, true);
  insert into public.clients (name, stage) values ('TEST P3-266 lead', 'quoted') returning id into v_id;
  perform set_config('p3_266.lead', v_id::text, true);

  insert into public.projects (client_id, name)
  values (current_setting('p3_266.client')::uuid, 'TEST P3-266 proiect') returning id into v_id;
  perform set_config('p3_266.project', v_id::text, true);
  insert into public.projects (client_id, name)
  values (current_setting('p3_266.client2')::uuid, 'TEST P3-266 alt proiect') returning id into v_id;
  perform set_config('p3_266.project2', v_id::text, true);
end
$$;


-- ===========================================================================
-- 3. AN ACTIVE ACCOUNT MANAGER
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3266000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  v_lines   jsonb := jsonb_build_array(jsonb_build_object(
                       'product_id', current_setting('p3_266.product')::uuid, 'quantity', 1));
  v_walkin  uuid;
  v_lead    uuid;
  v_proj    uuid;
  v_n       integer;
begin
  -- a.
  v_walkin := public.create_direct_client_issue(
    'TEST-P3266-WALKIN', v_lines, current_setting('p3_266.client')::uuid, date '2026-10-13');
  perform set_config('p3_266.walkin', coalesce(v_walkin::text, ''), true);

  -- b.
  v_lead := public.create_direct_client_issue(
    'TEST-P3266-LEAD', v_lines, current_setting('p3_266.lead')::uuid, date '2026-10-13');
  perform set_config('p3_266.lead_slip', coalesce(v_lead::text, ''), true);

  -- c.
  v_proj := public.create_outbound_issue(
    'TEST-P3266-PROJ', null, null, v_lines, current_setting('p3_266.project')::uuid);
  perform set_config('p3_266.proj', coalesce(v_proj::text, ''), true);

  -- d. the defect itself: retype the walk-in slip as a project sale
  begin
    update public.outbound_issues
       set issue_mode = 'project', client_id = null, pickup_date = null,
           project_id = current_setting('p3_266.project')::uuid
     where id = v_walkin;
    get diagnostics v_n = row_count;
    perform set_config('p3_266.d', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_266.d', sqlstate, true);
  end;

  -- e.
  begin
    update public.outbound_issues
       set client_id = current_setting('p3_266.client2')::uuid
     where id = v_walkin;
    get diagnostics v_n = row_count;
    perform set_config('p3_266.e', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_266.e', sqlstate, true);
  end;

  -- f.
  begin
    update public.outbound_issues
       set project_id = current_setting('p3_266.project2')::uuid
     where id = v_proj;
    get diagnostics v_n = row_count;
    perform set_config('p3_266.f', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_266.f', sqlstate, true);
  end;

  -- g.
  begin
    update public.outbound_issues
       set created_by = 'e3266000-0000-4000-8000-000000000001'
     where id = v_walkin;
    get diagnostics v_n = row_count;
    perform set_config('p3_266.g', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_266.g', sqlstate, true);
  end;

  -- h.
  begin
    update public.outbound_issues
       set status = 'shipped', shipped_at = now()
     where id = v_walkin;
    get diagnostics v_n = row_count;
    perform set_config('p3_266.h', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_266.h', sqlstate, true);
  end;

  -- i.
  perform public.ship_outbound_issue(v_walkin);

  -- j.
  begin
    insert into public.outbound_issues (reference, issue_mode, project_id, client_id, status, created_by)
    values ('TEST-P3266-J', 'project', current_setting('p3_266.project')::uuid,
            current_setting('p3_266.client2')::uuid, 'awaiting_shipment',
            'e3266000-0000-4000-8000-000000000002');
    perform set_config('p3_266.j', 'accepted', true);
  exception when others then
    perform set_config('p3_266.j', sqlstate, true);
  end;

  -- k.
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date, status, created_by)
    values ('TEST-P3266-K', 'direct_client', current_setting('p3_266.client')::uuid,
            date '2026-10-13', 'awaiting_shipment', 'e3266000-0000-4000-8000-000000000001');
    perform set_config('p3_266.k', 'accepted', true);
  exception when others then
    perform set_config('p3_266.k', sqlstate, true);
  end;

  -- l.
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date, status, shipped_at, created_by)
    values ('TEST-P3266-L', 'direct_client', current_setting('p3_266.client')::uuid,
            date '2026-10-13', 'shipped', now(), 'e3266000-0000-4000-8000-000000000002');
    perform set_config('p3_266.l', 'accepted', true);
  exception when others then
    perform set_config('p3_266.l', sqlstate, true);
  end;

  -- m.
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date, project_id, status, created_by)
    values ('TEST-P3266-M', 'direct_client', current_setting('p3_266.client')::uuid,
            date '2026-10-13', current_setting('p3_266.project')::uuid, 'awaiting_shipment',
            'e3266000-0000-4000-8000-000000000002');
    perform set_config('p3_266.m', 'accepted', true);
  exception when others then
    perform set_config('p3_266.m', sqlstate, true);
  end;

  -- n.
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date, status, created_by)
    values ('TEST-P3266-N', 'direct_client', current_setting('p3_266.client')::uuid,
            date '2026-10-13', 'awaiting_shipment', 'e3266000-0000-4000-8000-000000000002');
    perform set_config('p3_266.n', 'accepted', true);
  exception when others then
    perform set_config('p3_266.n', sqlstate || ' ' || sqlerrm, true);
  end;
end
$$;


-- ===========================================================================
-- 4. THE OWNER
-- ===========================================================================

set local request.jwt.claims = '{"sub":"e3266000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  v_n integer;
begin
  begin
    update public.outbound_issues
       set issue_mode = 'project', client_id = null, pickup_date = null,
           project_id = current_setting('p3_266.project')::uuid
     where id = current_setting('p3_266.lead_slip')::uuid;
    get diagnostics v_n = row_count;
    perform set_config('p3_266.owner', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_266.owner', sqlstate, true);
  end;
end
$$;

reset role;


-- ===========================================================================
-- 5. THE VERDICT, READ AS THE SUPERUSER
-- ===========================================================================

do $$
declare
  k   text;
  st  text;
  md  text;
  cl  text;
  n   integer;
begin
  -- a, b, c
  if current_setting('p3_266.walkin') = '' or current_setting('p3_266.lead_slip') = ''
     or current_setting('p3_266.proj') = '' then
    raise exception 'P3-266: a normal create returned no slip: walkin %, lead %, project %',
      current_setting('p3_266.walkin'), current_setting('p3_266.lead_slip'), current_setting('p3_266.proj');
  end if;
  select stage::text into st from public.clients where id = current_setting('p3_266.lead')::uuid;
  if st <> 'client' then
    raise exception 'P3-266: the walk-in sale to a lead left the stage at %', st;
  end if;

  -- d to h, j to m, owner: every one refused with 42501 or a check violation
  foreach k in array array['d', 'e', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'owner'] loop
    if current_setting('p3_266.' || k) not in ('42501', '23514') then
      raise exception 'P3-266: case % was not refused, got %', k, current_setting('p3_266.' || k);
    end if;
  end loop;
  -- d, e and the owner are the defect itself and must be refused by the guard
  foreach k in array array['d', 'e', 'owner'] loop
    if current_setting('p3_266.' || k) <> '42501' then
      raise exception 'P3-266: case % refused by %, expected the guard 42501', k, current_setting('p3_266.' || k);
    end if;
  end loop;

  -- the walk-in slip is still a walk-in sale to the first client
  select issue_mode::text, client_id::text, status::text into md, cl, st
  from public.outbound_issues where id = current_setting('p3_266.walkin')::uuid;
  if md <> 'direct_client' or cl <> current_setting('p3_266.client') then
    raise exception 'P3-266: the walk-in slip now reads mode % client %', md, cl;
  end if;

  -- i.
  if st <> 'shipped' then
    raise exception 'P3-266: ship_outbound_issue left the slip at %', st;
  end if;
  select count(*) into n from public.status_history
  where entity_type = 'outbound_issue' and entity_id = current_setting('p3_266.walkin')::uuid
    and to_status = 'shipped';
  if n <> 1 then
    raise exception 'P3-266: shipping wrote % shipped history rows, expected 1', n;
  end if;

  -- the project slip kept its project
  select project_id::text into cl from public.outbound_issues where id = current_setting('p3_266.proj')::uuid;
  if cl <> current_setting('p3_266.project') then
    raise exception 'P3-266: the project slip moved to project %', cl;
  end if;

  -- the lead slip, after the owner case, is still a walk-in sale
  select issue_mode::text into md from public.outbound_issues where id = current_setting('p3_266.lead_slip')::uuid;
  if md <> 'direct_client' then
    raise exception 'P3-266: the owner retyped a walk-in slip to %', md;
  end if;

  -- n.
  if current_setting('p3_266.n') <> 'accepted' then
    raise exception 'P3-266: a direct insert the doors would write was refused: %', current_setting('p3_266.n');
  end if;

  select count(*) into n from public.outbound_issues
  where reference in ('TEST-P3266-J', 'TEST-P3266-K', 'TEST-P3266-L', 'TEST-P3266-M');
  if n <> 0 then
    raise exception 'P3-266: % refused direct inserts left a row', n;
  end if;
end
$$;

rollback;
