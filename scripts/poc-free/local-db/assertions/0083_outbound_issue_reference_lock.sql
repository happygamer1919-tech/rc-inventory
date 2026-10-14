-- assertions/0083_outbound_issue_reference_lock.sql
-- Card P3-274. A saved slip keeps its number and its dates: a direct request can
-- no longer change reference, issued_at, pickup_date, created_at or id.
--
--   1. THE SHAPE. The trigger outbound_issues_guard exists and is enabled, and
--      its function names reference and issued_at, so it is the 0083 body.
--   2. AS AN ACCOUNT MANAGER, with a real role switch and a JWT, so row level
--      security applies (the same path as a PostgREST PATCH):
--        a. an UPDATE of reference on a slip awaiting shipment is refused
--        b. an UPDATE of issued_at on a slip awaiting shipment is refused
--        c. an UPDATE of reference on a shipped slip is refused
--        d. an UPDATE of issued_at on a shipped slip is refused
--        e. an UPDATE of pickup_date on a walk-in slip is refused
--        f. an UPDATE of created_at is refused
--        g. an UPDATE of id is refused
--        h. an UPDATE that writes the same reference back is accepted
--        i. an UPDATE of updated_at only is accepted
--        j. ship_outbound_issue still ships the slip, with one history row
--   3. THE OWNER is guarded too: an UPDATE of reference is refused.
--   4. A SERVER ROLE with no identity can still change reference.
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
  src text;
begin
  select count(*) into n
  from pg_trigger
  where tgrelid = 'public.outbound_issues'::regclass
    and tgname = 'outbound_issues_guard'
    and tgenabled = 'O';
  if n <> 1 then
    raise exception 'P3-274: expected one enabled trigger outbound_issues_guard, found %', n;
  end if;

  select p.prosrc into src
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'outbound_issues_guard';
  if src is null or position('old.reference' in src) = 0 or position('old.issued_at' in src) = 0 then
    raise exception 'P3-274: outbound_issues_guard does not guard reference and issued_at';
  end if;
end
$$;


-- ===========================================================================
-- 2. FIXTURE, AS THE SUPERUSER
-- ===========================================================================

insert into auth.users (id, email) values
  ('e3274000-0000-4000-8000-000000000001', 'p3-274-owner@rc-inventory.local'),
  ('e3274000-0000-4000-8000-000000000002', 'p3-274-manager@rc-inventory.local');

insert into public.profiles (id, email, role, full_name, active) values
  ('e3274000-0000-4000-8000-000000000001', 'p3-274-owner@rc-inventory.local', 'owner', 'Test Owner 274', true),
  ('e3274000-0000-4000-8000-000000000002', 'p3-274-manager@rc-inventory.local', 'account_manager', 'Test Manager 274', true);

do $$
declare
  v_product uuid;
  v_order   uuid;
  v_oline   uuid;
  v_id      uuid;
begin
  select id into v_product from public.products order by sku limit 1;
  if v_product is null then
    raise exception 'P3-274: no product loaded, so every case below would pass on nothing';
  end if;

  insert into public.inbound_orders (reference, supplier_name)
  values ('TEST-P3274-IN', 'TEST furnizor') returning id into v_order;
  insert into public.order_lines (inbound_order_id, product_id, quantity, unit_price)
  values (v_order, v_product, 100, 10) returning id into v_oline;
  insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
  values (v_product, v_order, v_oline, 100);
  perform set_config('p3_274.product', v_product::text, true);

  insert into public.clients (name, stage) values ('TEST P3-274 client', 'client') returning id into v_id;
  perform set_config('p3_274.client', v_id::text, true);

  insert into public.projects (client_id, name)
  values (current_setting('p3_274.client')::uuid, 'TEST P3-274 proiect') returning id into v_id;
  perform set_config('p3_274.project', v_id::text, true);
end
$$;


-- ===========================================================================
-- 3. AN ACTIVE ACCOUNT MANAGER
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3274000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  v_lines   jsonb := jsonb_build_array(jsonb_build_object(
                       'product_id', current_setting('p3_274.product')::uuid, 'quantity', 1));
  v_walkin  uuid;
  v_proj    uuid;
  v_n       integer;
begin
  v_walkin := public.create_direct_client_issue(
    'TEST-P3274-WALKIN', v_lines, current_setting('p3_274.client')::uuid, date '2026-10-13');
  perform set_config('p3_274.walkin', coalesce(v_walkin::text, ''), true);

  v_proj := public.create_outbound_issue(
    'TEST-P3274-PROJ', null, null, v_lines, current_setting('p3_274.project')::uuid);
  perform set_config('p3_274.proj', coalesce(v_proj::text, ''), true);

  -- the project slip is shipped first, so c and d hit a shipped slip
  perform public.ship_outbound_issue(v_proj);

  -- a. the defect itself: bump the number of a slip awaiting shipment
  begin
    update public.outbound_issues set reference = 'IES-2026-9999' where id = v_walkin;
    get diagnostics v_n = row_count;
    perform set_config('p3_274.a', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_274.a', sqlstate, true);
  end;

  -- b.
  begin
    update public.outbound_issues set issued_at = timestamptz '2020-01-01 10:00:00+00' where id = v_walkin;
    get diagnostics v_n = row_count;
    perform set_config('p3_274.b', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_274.b', sqlstate, true);
  end;

  -- c.
  begin
    update public.outbound_issues set reference = 'IES-2026-9998' where id = v_proj;
    get diagnostics v_n = row_count;
    perform set_config('p3_274.c', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_274.c', sqlstate, true);
  end;

  -- d.
  begin
    update public.outbound_issues set issued_at = timestamptz '2020-01-01 10:00:00+00' where id = v_proj;
    get diagnostics v_n = row_count;
    perform set_config('p3_274.d', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_274.d', sqlstate, true);
  end;

  -- e.
  begin
    update public.outbound_issues set pickup_date = date '2020-01-01' where id = v_walkin;
    get diagnostics v_n = row_count;
    perform set_config('p3_274.e', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_274.e', sqlstate, true);
  end;

  -- f.
  begin
    update public.outbound_issues set created_at = timestamptz '2020-01-01 10:00:00+00' where id = v_walkin;
    get diagnostics v_n = row_count;
    perform set_config('p3_274.f', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_274.f', sqlstate, true);
  end;

  -- g.
  begin
    update public.outbound_issues set id = gen_random_uuid() where id = v_walkin;
    get diagnostics v_n = row_count;
    perform set_config('p3_274.g', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_274.g', sqlstate, true);
  end;

  -- h. writing the same values back is not a change
  begin
    update public.outbound_issues
       set reference = reference, issued_at = issued_at, pickup_date = pickup_date
     where id = v_walkin;
    get diagnostics v_n = row_count;
    perform set_config('p3_274.h', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_274.h', sqlstate || ' ' || sqlerrm, true);
  end;

  -- i.
  begin
    update public.outbound_issues set updated_at = now() where id = v_walkin;
    get diagnostics v_n = row_count;
    perform set_config('p3_274.i', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_274.i', sqlstate || ' ' || sqlerrm, true);
  end;

  -- j.
  perform public.ship_outbound_issue(v_walkin);
end
$$;


-- ===========================================================================
-- 4. THE OWNER
-- ===========================================================================

set local request.jwt.claims = '{"sub":"e3274000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  v_n integer;
begin
  begin
    update public.outbound_issues set reference = 'IES-2026-9997'
     where id = current_setting('p3_274.walkin')::uuid;
    get diagnostics v_n = row_count;
    perform set_config('p3_274.owner', 'accepted ' || v_n, true);
  exception when others then
    perform set_config('p3_274.owner', sqlstate, true);
  end;
end
$$;

reset role;


-- ===========================================================================
-- 5. A SERVER ROLE, NO IDENTITY
-- ===========================================================================

set local request.jwt.claims = '{}';

do $$
declare
  v_n integer;
begin
  update public.outbound_issues set reference = 'TEST-P3274-SERVER'
   where id = current_setting('p3_274.proj')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'P3-274: a server role changed % rows, expected 1', v_n;
  end if;
end
$$;


-- ===========================================================================
-- 6. THE VERDICT, READ AS THE SUPERUSER
-- ===========================================================================

do $$
declare
  k   text;
  rf  text;
  st  text;
  n   integer;
begin
  if current_setting('p3_274.walkin') = '' or current_setting('p3_274.proj') = '' then
    raise exception 'P3-274: a normal create returned no slip: walkin %, project %',
      current_setting('p3_274.walkin'), current_setting('p3_274.proj');
  end if;

  -- a to g and the owner: every one refused by the guard
  foreach k in array array['a', 'b', 'c', 'd', 'e', 'f', 'g', 'owner'] loop
    if current_setting('p3_274.' || k) <> '42501' then
      raise exception 'P3-274: case % was not refused by the guard, got %', k, current_setting('p3_274.' || k);
    end if;
  end loop;

  -- h, i
  foreach k in array array['h', 'i'] loop
    if current_setting('p3_274.' || k) <> 'accepted 1' then
      raise exception 'P3-274: case % should update the slip, got %', k, current_setting('p3_274.' || k);
    end if;
  end loop;

  -- the walk-in slip kept its number and dates, and was shipped by j
  select reference, status::text into rf, st
  from public.outbound_issues where id = current_setting('p3_274.walkin')::uuid;
  if rf <> 'TEST-P3274-WALKIN' then
    raise exception 'P3-274: the walk-in slip now reads reference %', rf;
  end if;
  select count(*) into n from public.outbound_issues
  where id = current_setting('p3_274.walkin')::uuid
    and pickup_date = date '2026-10-13'
    and issued_at > timestamptz '2021-01-01 00:00:00+00'
    and created_at > timestamptz '2021-01-01 00:00:00+00';
  if n <> 1 then
    raise exception 'P3-274: the walk-in slip lost its pickup date, issue date or creation date';
  end if;

  -- j.
  if st <> 'shipped' then
    raise exception 'P3-274: ship_outbound_issue left the slip at %', st;
  end if;
  select count(*) into n from public.status_history
  where entity_type = 'outbound_issue' and entity_id = current_setting('p3_274.walkin')::uuid
    and to_status = 'shipped';
  if n <> 1 then
    raise exception 'P3-274: shipping wrote % shipped history rows, expected 1', n;
  end if;

  -- the server role change landed
  select reference into rf from public.outbound_issues where id = current_setting('p3_274.proj')::uuid;
  if rf <> 'TEST-P3274-SERVER' then
    raise exception 'P3-274: the server role could not change the reference, it reads %', rf;
  end if;

  select count(*) into n from public.outbound_issues
  where reference in ('IES-2026-9999', 'IES-2026-9998', 'IES-2026-9997');
  if n <> 0 then
    raise exception 'P3-274: % refused reference changes left a row', n;
  end if;
end
$$;

rollback;
