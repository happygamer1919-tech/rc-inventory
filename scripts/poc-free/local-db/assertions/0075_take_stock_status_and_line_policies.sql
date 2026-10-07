-- assertions/0075_take_stock_status_and_line_policies.sql
-- Card P3-195. What 0075 must have left behind, and what it lets through.
--
--   1. THE SHAPE. outbound_issue_take_stock(uuid, jsonb) is one SECURITY DEFINER
--      function, executable by authenticated and not by anon; outbound_lines has
--      four policies, insert and update on is_owner(), select and delete as before.
--   2. AS AN ACCOUNT MANAGER, with a real role switch and a JWT, so row level
--      security applies: taking stock on an awaiting slip works (the witness),
--      taking stock on a shipped slip is refused and writes no line and no
--      history row, a direct line insert is refused and a direct price update
--      touches no row.
--   3. A DEACTIVATED ACCOUNT MANAGER is refused by the routine itself.
--   4. AN OWNER can still insert a line and change a price directly.
--
-- Values cross each role switch in transaction-local settings, the pattern of
-- assertions/0072. Refusals are written without diacritics, the convention 0063
-- to 0072 follow. Everything runs inside a transaction that is rolled back.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n   integer;
  txt text;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'outbound_issue_take_stock'
    and pg_get_function_identity_arguments(p.oid) = 'p_issue_id uuid, p_lines jsonb'
    and p.prosecdef;
  if n <> 1 then
    raise exception 'P3-195: expected one SECURITY DEFINER public.outbound_issue_take_stock(uuid, jsonb), found %', n;
  end if;

  if not has_function_privilege('authenticated', 'public.outbound_issue_take_stock(uuid, jsonb)', 'execute') then
    raise exception 'P3-195: authenticated cannot execute outbound_issue_take_stock, so no outbound can be written';
  end if;
  if has_function_privilege('anon', 'public.outbound_issue_take_stock(uuid, jsonb)', 'execute') then
    raise exception 'P3-195: anon can execute the SECURITY DEFINER outbound_issue_take_stock';
  end if;

  select count(*) into n
  from pg_policies where schemaname = 'public' and tablename = 'outbound_lines';
  if n <> 4 then
    raise exception 'P3-195: expected exactly 4 policies on public.outbound_lines, found %', n;
  end if;

  select coalesce(with_check, '') into txt
  from pg_policies
  where schemaname = 'public' and tablename = 'outbound_lines'
    and policyname = 'outbound_lines_insert' and cmd = 'INSERT';
  if txt is null or txt not ilike '%is_owner()%' then
    raise exception 'P3-195: outbound_lines_insert must be owner only, found %', coalesce(txt, 'nothing');
  end if;

  select coalesce(qual, '') || ' | ' || coalesce(with_check, '') into txt
  from pg_policies
  where schemaname = 'public' and tablename = 'outbound_lines'
    and policyname = 'outbound_lines_update' and cmd = 'UPDATE';
  if txt is null or txt not ilike '%is_owner()% | %is_owner()%' then
    raise exception 'P3-195: outbound_lines_update must be owner only on both sides, found %', coalesce(txt, 'nothing');
  end if;

  select qual into txt
  from pg_policies
  where schemaname = 'public' and tablename = 'outbound_lines'
    and policyname = 'outbound_lines_select' and cmd = 'SELECT';
  if txt is null or txt not ilike '%current_app_role()%is not null%' or txt ilike '%is_owner()%' then
    raise exception 'P3-195: outbound_lines_select must stay on current_app_role() is not null, found %', coalesce(txt, 'nothing');
  end if;
end
$$;


-- ===========================================================================
-- 2. FIXTURE, AS THE SUPERUSER
-- ===========================================================================
--
-- An owner, an account manager and a deactivated account manager; one product
-- with 100 in stock; a client; one AWAITING slip carrying one line, and one
-- SHIPPED slip with no line and no history row.

insert into auth.users (id, email) values
  ('e3850000-0000-4000-8000-000000000001', 'p3-185-owner@rc-inventory.local'),
  ('e3850000-0000-4000-8000-000000000002', 'p3-185-manager@rc-inventory.local'),
  ('e3850000-0000-4000-8000-000000000003', 'p3-185-dezactivat@rc-inventory.local');

insert into public.profiles (id, email, role, full_name, active) values
  ('e3850000-0000-4000-8000-000000000001', 'p3-185-owner@rc-inventory.local', 'owner', 'Test Owner 185', true),
  ('e3850000-0000-4000-8000-000000000002', 'p3-185-manager@rc-inventory.local', 'account_manager', 'Test Manager 185', true),
  ('e3850000-0000-4000-8000-000000000003', 'p3-185-dezactivat@rc-inventory.local', 'account_manager', 'Test Dezactivat 185', false);

do $$
declare
  v_product uuid;
  v_order   uuid;
  v_oline   uuid;
  v_client  uuid;
  v_open    uuid;
  v_shipped uuid;
  v_line    uuid;
begin
  select id into v_product from public.products order by sku limit 1;
  if v_product is null then
    raise exception 'P3-195: no product loaded, so every case below would pass on nothing';
  end if;

  insert into public.inbound_orders (reference, supplier_name)
  values ('TEST-P3185-IN', 'TEST furnizor') returning id into v_order;
  insert into public.order_lines (inbound_order_id, product_id, quantity, unit_price)
  values (v_order, v_product, 100, 10) returning id into v_oline;
  insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
  values (v_product, v_order, v_oline, 100);

  insert into public.clients (name) values ('TEST P3-195 client') returning id into v_client;

  insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date, status)
  values ('TEST-P3185-OPEN', 'direct_client', v_client, date '2026-10-06', 'awaiting_shipment')
  returning id into v_open;
  insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date, status, shipped_at)
  values ('TEST-P3185-SHIPPED', 'direct_client', v_client, date '2026-10-06', 'shipped', now())
  returning id into v_shipped;

  insert into public.outbound_lines (outbound_issue_id, product_id, quantity, sale_price_mdl)
  values (v_open, v_product, 1, 20) returning id into v_line;

  perform set_config('p3_185.product', v_product::text, true);
  perform set_config('p3_185.open', v_open::text, true);
  perform set_config('p3_185.shipped', v_shipped::text, true);
  perform set_config('p3_185.line', v_line::text, true);
end
$$;


-- ===========================================================================
-- 3. AN ACTIVE ACCOUNT MANAGER
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3850000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  v_product uuid := current_setting('p3_185.product')::uuid;
  v_open    uuid := current_setting('p3_185.open')::uuid;
  v_shipped uuid := current_setting('p3_185.shipped')::uuid;
  v_line    uuid := current_setting('p3_185.line')::uuid;
  n         integer;
begin
  -- THE WITNESS: the same account takes stock on the awaiting slip.
  perform public.outbound_issue_take_stock(
    v_open, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 2)));

  begin
    perform public.outbound_issue_take_stock(
      v_shipped, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 3)));
    perform set_config('p3_185.manager_shipped', 'accepted', true);
  exception when others then
    perform set_config('p3_185.manager_shipped', sqlerrm, true);
  end;

  begin
    insert into public.outbound_lines (outbound_issue_id, product_id, quantity, sale_price_mdl)
    values (v_open, v_product, 1, 1);
    perform set_config('p3_185.manager_insert', 'accepted', true);
  exception when insufficient_privilege then
    perform set_config('p3_185.manager_insert', 'refused', true);
  end;

  update public.outbound_lines set sale_price_mdl = 999 where id = v_line;
  get diagnostics n = row_count;
  perform set_config('p3_185.manager_update', n::text, true);
end
$$;


-- ===========================================================================
-- 4. A DEACTIVATED ACCOUNT MANAGER
-- ===========================================================================

set local request.jwt.claims = '{"sub":"e3850000-0000-4000-8000-000000000003","role":"authenticated"}';

do $$
declare
  v_product uuid := current_setting('p3_185.product')::uuid;
  v_open    uuid := current_setting('p3_185.open')::uuid;
begin
  perform public.outbound_issue_take_stock(
    v_open, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 4)));
  perform set_config('p3_185.inactive_take', 'accepted', true);
exception when others then
  perform set_config('p3_185.inactive_take', sqlerrm, true);
end
$$;


-- ===========================================================================
-- 5. AN OWNER
-- ===========================================================================

set local request.jwt.claims = '{"sub":"e3850000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  v_product uuid := current_setting('p3_185.product')::uuid;
  v_open    uuid := current_setting('p3_185.open')::uuid;
  v_line    uuid := current_setting('p3_185.line')::uuid;
  n         integer;
begin
  insert into public.outbound_lines (outbound_issue_id, product_id, quantity, sale_price_mdl)
  values (v_open, v_product, 1, 30);

  update public.outbound_lines set sale_price_mdl = 21 where id = v_line;
  get diagnostics n = row_count;
  perform set_config('p3_185.owner_update', n::text, true);
end
$$;

reset role;


-- ===========================================================================
-- 6. THE VERDICT, READ AS THE SUPERUSER
-- ===========================================================================

do $$
declare
  v_open    uuid := current_setting('p3_185.open')::uuid;
  v_shipped uuid := current_setting('p3_185.shipped')::uuid;
  v_line    uuid := current_setting('p3_185.line')::uuid;
  n         integer;
  txt       text;
begin
  txt := current_setting('p3_185.manager_shipped');
  if txt not like '%deja expediat%' then
    raise exception 'P3-195: take stock on a shipped slip was not refused by its status, got %', txt;
  end if;

  select count(*) into n from public.outbound_lines where outbound_issue_id = v_shipped;
  if n <> 0 then
    raise exception 'P3-195: the refused take stock on a shipped slip wrote % line(s)', n;
  end if;
  select count(*) into n from public.status_history
  where entity_type = 'outbound_issue' and entity_id = v_shipped;
  if n <> 0 then
    raise exception 'P3-195: the refused take stock on a shipped slip wrote % history row(s)', n;
  end if;

  if current_setting('p3_185.manager_insert') <> 'refused' then
    raise exception 'P3-195: an account manager inserted an outbound line directly';
  end if;
  if current_setting('p3_185.manager_update') <> '0' then
    raise exception 'P3-195: an account manager changed % outbound line(s) directly', current_setting('p3_185.manager_update');
  end if;

  txt := current_setting('p3_185.inactive_take');
  if txt not like '%nu mai este activ%' then
    raise exception 'P3-195: a deactivated account was not refused by take stock, got %', txt;
  end if;

  if current_setting('p3_185.owner_update') <> '1' then
    raise exception 'P3-195: the owner could not change a line price, % row(s)', current_setting('p3_185.owner_update');
  end if;

  -- Fixture line, the manager's take stock and the owner's insert: three.
  select count(*) into n from public.outbound_lines where outbound_issue_id = v_open;
  if n <> 3 then
    raise exception 'P3-195: expected 3 lines on the awaiting slip (fixture, manager take stock, owner insert), found %', n;
  end if;

  select count(*) into n from public.outbound_lines where id = v_line and sale_price_mdl = 21;
  if n <> 1 then
    select coalesce(sale_price_mdl::text, 'null') into txt from public.outbound_lines where id = v_line;
    raise exception 'P3-195: the line price is %, expected the owner''s 21', txt;
  end if;

  -- Only the manager's take stock wrote history on the awaiting slip.
  select count(*) into n from public.status_history
  where entity_type = 'outbound_issue' and entity_id = v_open;
  if n <> 1 then
    raise exception 'P3-195: expected 1 history row on the awaiting slip, found %', n;
  end if;
end
$$;

rollback;
