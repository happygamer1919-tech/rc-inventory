-- assertions/0089_sale_lines_and_slip_insert_lock.sql
-- Card P3-331. Nobody signed in, the owner included, adds or changes a sale line
-- by a direct request, and a new slip saved by a signed-in caller carries the
-- server's date and the next number in the series. Every screen path still works.
--
--   1. THE SHAPE. public.outbound_lines has one policy, select, and no insert,
--      update, delete or ALL policy; row level security stays on.
--      public.outbound_next_reference() is SECURITY DEFINER, executable by
--      authenticated and not by anon. The trigger outbound_issues_guard is
--      enabled and its function names P3-331.
--   2. THE NUMBERING, as the superuser, against the app's rule in
--      lib/data/outbound.ts nextOutboundReference: prefix IES-<year in Chisinau>-,
--      the highest reference with that prefix in text order, plus one, at least
--      four digits. Other years and other prefixes do not count; a tail that is
--      not a whole number is ignored (P3-334, 0090: it used to restart at 0001);
--      9999 is followed by 10000, not cut to four digits. 0090 reads the highest
--      by numeric value; its own assertion file proves 10000 to 10001.
--   3. AN ACTIVE ACCOUNT MANAGER, with a real role switch and a JWT, so row level
--      security and the guard apply exactly as for a PostgREST request:
--        THE SCREEN PATHS STILL WORK (the witnesses):
--          w_proj    create_outbound_issue with the next number
--          w_walk    create_direct_client_issue with the next number
--          w_ship    ship_outbound_issue on the walk-in slip
--          w_direct  a direct insert shaped like the doors' (next number, no
--                    dates), then outbound_issue_take_stock on it
--          w_empty   a direct insert with no number: the server sets the next one
--        EVERY DIRECT LINE WRITE IS REFUSED OR TOUCHES NO ROW:
--          m_line_insert, m_line_qty
--        EVERY BACKDATED OR RENUMBERED SLIP IS REFUSED (finding 1):
--          m_issued_past   issued_at 2025-01-01
--          m_created_past  created_at 2025-01-01
--          m_issued_future issued_at tomorrow
--          m_ref_chosen    IES-<year>-0001-X, the finding's own number
--          m_ref_skip      a number five past the next
--          m_ref_reuse     a number already taken (would have been a unique
--                          violation; now refused by the guard first)
--          m_door_ref      create_direct_client_issue with a chosen number
--   4. THE OWNER, the finding itself:
--          o_line_qty      PATCH quantity 0.01 on the shipped sale line (finding 0)
--          o_line_price    PATCH sale_price_mdl on the same line
--          o_line_insert   POST a line on the owner's own awaiting slip
--          o_issued_past, o_ref_chosen   the slip refusals hold for the owner too
--          w_owner         create_outbound_issue with the next number still works
--   5. THE VERDICT, as the superuser: every accepted slip carries now() and the
--      number that was next when it was saved, no refused slip exists, every
--      line keeps its quantity and price, and the stock of the product is
--      exactly 100 received minus what the witnesses took.
--
-- WITH NO UPDATE POLICY A DIRECT UPDATE IS NOT AN ERROR, IT MATCHES NO ROW, the
-- same as PostgREST returns. So those refusals are read as a row count of 0 and
-- then proved again by the line still holding its values.
--
-- Refusals are written without diacritics, the convention 0063 to 0088 follow.
-- Everything runs inside a transaction that is rolled back.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  v_n   integer;
  v_txt text;
begin
  select count(*) into v_n
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'outbound_lines' and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  if v_n <> 0 then
    raise exception 'P3-331: public.outbound_lines has % insert, update, delete or ALL policy, so a signed-in account can write a sale line directly', v_n;
  end if;

  select count(*) into v_n
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'outbound_lines';
  if v_n <> 1 then
    raise exception 'P3-331: expected exactly 1 policy (select) on public.outbound_lines, found %', v_n;
  end if;

  select count(*) into v_n
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'outbound_lines' and c.relrowsecurity;
  if v_n <> 1 then
    raise exception 'P3-331: row level security is not enabled on public.outbound_lines';
  end if;

  select count(*) into v_n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'outbound_next_reference'
    and pg_get_function_identity_arguments(p.oid) = '' and p.prosecdef;
  if v_n <> 1 then
    raise exception 'P3-331: expected one SECURITY DEFINER public.outbound_next_reference(), found %', v_n;
  end if;
  if not has_function_privilege('authenticated', 'public.outbound_next_reference()', 'execute') then
    raise exception 'P3-331: authenticated cannot execute outbound_next_reference, so the guard refuses every slip';
  end if;
  if has_function_privilege('anon', 'public.outbound_next_reference()', 'execute') then
    raise exception 'P3-331: anon can execute outbound_next_reference';
  end if;

  select count(*) into v_n
  from pg_trigger t
  where t.tgrelid = 'public.outbound_issues'::regclass and t.tgname = 'outbound_issues_guard'
    and t.tgenabled <> 'D' and (t.tgtype & 4) <> 0 and (t.tgtype & 16) <> 0;
  if v_n <> 1 then
    raise exception 'P3-331: the trigger outbound_issues_guard is missing, disabled, or not on insert and update';
  end if;

  select p.prosrc into v_txt
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'outbound_issues_guard';
  if v_txt is null or position('P3-331' in v_txt) = 0 or position('outbound_next_reference' in v_txt) = 0 then
    raise exception 'P3-331: outbound_issues_guard does not carry the P3-331 insert checks';
  end if;
end
$$;


-- ===========================================================================
-- 2. THE NUMBERING, AS THE SUPERUSER
-- ===========================================================================
--
-- The superuser has no identity, so the guard lets these rows through as they
-- are: they stand for slips saved earlier in the year.

insert into auth.users (id, email) values
  ('e3331000-0000-4000-8000-000000000001', 'p3-331-owner@rc-inventory.local'),
  ('e3331000-0000-4000-8000-000000000002', 'p3-331-manager@rc-inventory.local');

insert into public.profiles (id, email, role, full_name, active) values
  ('e3331000-0000-4000-8000-000000000001', 'p3-331-owner@rc-inventory.local', 'owner', 'Test Owner 331', true),
  ('e3331000-0000-4000-8000-000000000002', 'p3-331-manager@rc-inventory.local', 'account_manager', 'Test Manager 331', true);

do $$
declare
  v_year     text := to_char(now() at time zone 'Europe/Chisinau', 'YYYY');
  v_prev     text := (to_char(now() at time zone 'Europe/Chisinau', 'YYYY')::int - 1)::text;
  v_category uuid;
  v_product  uuid;
  v_order    uuid;
  v_oline    uuid;
  v_client   uuid;
  v_project  uuid;
  v_got      text;
begin
  perform set_config('p3_331.year', v_year, true);

  -- With no slip of this year the series starts at 0001.
  if exists (select 1 from public.outbound_issues where reference like 'IES-' || v_year || '-%') then
    raise exception 'P3-331: the fixture expects no slip of % before it runs', v_year;
  end if;
  v_got := public.outbound_next_reference();
  if v_got <> 'IES-' || v_year || '-0001' then
    raise exception 'P3-331: an empty year should start at IES-%-0001, got %', v_year, v_got;
  end if;

  select id into v_category from public.categories order by name limit 1;
  if v_category is null then
    raise exception 'P3-331: no category loaded, so no test product can be written';
  end if;
  insert into public.products (sku, name, category_id, unit, unit_value_mdl)
  values ('TEST-P3331-SKU', 'TEST P3-331 produs', v_category, 'pcs', 10)
  returning id into v_product;
  perform set_config('p3_331.product', v_product::text, true);

  insert into public.inbound_orders (reference, supplier_name)
  values ('TEST-P3331-IN', 'TEST furnizor') returning id into v_order;
  insert into public.order_lines (inbound_order_id, product_id, quantity, unit_price)
  values (v_order, v_product, 100, 10) returning id into v_oline;
  insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
  values (v_product, v_order, v_oline, 100);

  insert into public.clients (name) values ('TEST P3-331 client') returning id into v_client;
  perform set_config('p3_331.client', v_client::text, true);
  insert into public.projects (name, client_id) values ('TEST P3-331 proiect', v_client)
  returning id into v_project;
  perform set_config('p3_331.project', v_project::text, true);

  -- Slips saved earlier: 0007 and 0041 of this year, one of last year, one test
  -- reference. The highest of this year in text order is 0041.
  insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date) values
    ('IES-' || v_year || '-0007', 'direct_client', v_client, date '2026-10-21'),
    ('IES-' || v_year || '-0041', 'direct_client', v_client, date '2026-10-21'),
    ('IES-' || v_prev || '-9999', 'direct_client', v_client, date '2026-10-21'),
    ('IES-TEST-P3331-ALTUL', 'direct_client', v_client, date '2026-10-21');

  v_got := public.outbound_next_reference();
  if v_got <> 'IES-' || v_year || '-0042' then
    raise exception 'P3-331: after 0007 and 0041 the next number should be IES-%-0042, got %', v_year, v_got;
  end if;

  -- Two edges of the app's rule, inside a block that is undone.
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date)
    values ('IES-' || v_year || '-9999', 'direct_client', v_client, date '2026-10-21');
    v_got := public.outbound_next_reference();
    if v_got <> 'IES-' || v_year || '-10000' then
      raise exception 'P3-331: after 9999 the next number should be IES-%-10000, got %', v_year, v_got;
    end if;

    -- P3-334 (0090) changed this edge: a tail that is not a whole number is
    -- ignored, it no longer restarts the series at 0001 (already taken).
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date)
    values ('IES-' || v_year || '-9999-X', 'direct_client', v_client, date '2026-10-21');
    v_got := public.outbound_next_reference();
    if v_got <> 'IES-' || v_year || '-10000' then
      raise exception 'P3-331: a tail that is not a whole number should be ignored (P3-334), so the next after 9999 stays IES-%-10000, got %', v_year, v_got;
    end if;

    raise exception using errcode = 'P0331', message = 'undo the edge rows';
  exception when sqlstate 'P0331' then
    null;
  end;

  v_got := public.outbound_next_reference();
  if v_got <> 'IES-' || v_year || '-0042' then
    raise exception 'P3-331: the edge rows were not undone, the next number reads %', v_got;
  end if;
end
$$;


-- ===========================================================================
-- 3. AN ACTIVE ACCOUNT MANAGER
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3331000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  v_year    text := current_setting('p3_331.year');
  v_product uuid := current_setting('p3_331.product')::uuid;
  v_client  uuid := current_setting('p3_331.client')::uuid;
  v_project uuid := current_setting('p3_331.project')::uuid;
  v_ref     text;
  v_id      uuid;
  v_line    uuid;
  v_n       integer;
begin
  -- --- w_proj. the project slip screen, as lib/data/outbound-actions.ts calls it
  v_ref := public.outbound_next_reference();
  v_id := public.create_outbound_issue(
    v_ref, '', '', jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 3, 'sale_price_mdl', 20)),
    v_project);
  perform set_config('p3_331.w_proj', v_id::text, true);
  perform set_config('p3_331.w_proj_ref', v_ref, true);

  -- --- w_walk. the walk-in sale screen
  v_ref := public.outbound_next_reference();
  v_id := public.create_direct_client_issue(
    v_ref, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 2, 'sale_price_mdl', 25)),
    v_client, date '2026-10-21');
  perform set_config('p3_331.w_walk', v_id::text, true);
  perform set_config('p3_331.w_walk_ref', v_ref, true);

  -- --- w_ship. the ship button
  perform public.ship_outbound_issue(v_id);

  -- --- w_direct. a direct insert shaped like the doors' row, then take stock
  v_ref := public.outbound_next_reference();
  insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date)
  values (v_ref, 'direct_client', v_client, date '2026-10-21')
  returning id into v_id;
  perform public.outbound_issue_take_stock(
    v_id, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1)));
  perform set_config('p3_331.w_direct', v_id::text, true);
  perform set_config('p3_331.w_direct_ref', v_ref, true);

  -- --- w_empty. no number sent: the server sets the next one
  perform set_config('p3_331.w_empty_expect', public.outbound_next_reference(), true);
  insert into public.outbound_issues (reference, issue_mode, project_id)
  values (null, 'project', v_project)
  returning id into v_id;
  perform set_config('p3_331.w_empty', v_id::text, true);

  -- --- m_line_insert
  select id into v_line from public.outbound_lines
  where outbound_issue_id = current_setting('p3_331.w_proj')::uuid;
  perform set_config('p3_331.line_proj', v_line::text, true);
  begin
    insert into public.outbound_lines (outbound_issue_id, product_id, quantity, sale_price_mdl)
    values (current_setting('p3_331.w_proj')::uuid, v_product, 50, 1);
    perform set_config('p3_331.m_line_insert', 'accepted', true);
  exception when others then
    perform set_config('p3_331.m_line_insert', sqlstate, true);
  end;

  -- --- m_line_qty
  update public.outbound_lines set quantity = 0.01 where id = v_line;
  get diagnostics v_n = row_count;
  perform set_config('p3_331.m_line_qty', v_n::text, true);

  -- --- m_issued_past, the finding itself
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date, issued_at)
    values (public.outbound_next_reference(), 'direct_client', v_client, date '2026-10-21', timestamptz '2025-01-01 10:00:00+02');
    perform set_config('p3_331.m_issued_past', 'accepted', true);
  exception when others then
    perform set_config('p3_331.m_issued_past', sqlstate || ' ' || sqlerrm, true);
  end;

  -- --- m_created_past
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date, created_at)
    values (public.outbound_next_reference(), 'direct_client', v_client, date '2026-10-21', timestamptz '2025-01-01 10:00:00+02');
    perform set_config('p3_331.m_created_past', 'accepted', true);
  exception when others then
    perform set_config('p3_331.m_created_past', sqlstate || ' ' || sqlerrm, true);
  end;

  -- --- m_issued_future
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date, issued_at)
    values (public.outbound_next_reference(), 'direct_client', v_client, date '2026-10-21', now() + interval '1 day');
    perform set_config('p3_331.m_issued_future', 'accepted', true);
  exception when others then
    perform set_config('p3_331.m_issued_future', sqlstate || ' ' || sqlerrm, true);
  end;

  -- --- m_ref_chosen, the finding's own number
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date)
    values ('IES-' || v_year || '-0001-X', 'direct_client', v_client, date '2026-10-21');
    perform set_config('p3_331.m_ref_chosen', 'accepted', true);
  exception when others then
    perform set_config('p3_331.m_ref_chosen', sqlstate || ' ' || sqlerrm, true);
  end;

  -- --- m_ref_skip, five past the next
  begin
    v_ref := public.outbound_next_reference();
    v_ref := 'IES-' || v_year || '-' || lpad((substr(v_ref, 10)::int + 5)::text, 4, '0');
    perform set_config('p3_331.m_ref_skip_ref', v_ref, true);
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date)
    values (v_ref, 'direct_client', v_client, date '2026-10-21');
    perform set_config('p3_331.m_ref_skip', 'accepted', true);
  exception when others then
    perform set_config('p3_331.m_ref_skip', sqlstate || ' ' || sqlerrm, true);
  end;

  -- --- m_ref_reuse, a number already taken this year
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date)
    values ('IES-' || v_year || '-0007', 'direct_client', v_client, date '2026-10-21');
    perform set_config('p3_331.m_ref_reuse', 'accepted', true);
  exception when others then
    perform set_config('p3_331.m_ref_reuse', sqlstate || ' ' || sqlerrm, true);
  end;

  -- --- m_door_ref, the walk-in door with a chosen number
  begin
    perform public.create_direct_client_issue(
      'IES-' || v_year || '-0001-Y',
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 4)),
      v_client, date '2026-10-21');
    perform set_config('p3_331.m_door_ref', 'accepted', true);
  exception when others then
    perform set_config('p3_331.m_door_ref', sqlstate || ' ' || sqlerrm, true);
  end;
end
$$;


-- ===========================================================================
-- 4. THE OWNER
-- ===========================================================================

set local request.jwt.claims = '{"sub":"e3331000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  v_year    text := current_setting('p3_331.year');
  v_product uuid := current_setting('p3_331.product')::uuid;
  v_client  uuid := current_setting('p3_331.client')::uuid;
  v_project uuid := current_setting('p3_331.project')::uuid;
  v_walk    uuid := current_setting('p3_331.w_walk')::uuid;
  v_line    uuid;
  v_ref     text;
  v_id      uuid;
  v_n       integer;
begin
  select id into v_line from public.outbound_lines where outbound_issue_id = v_walk;
  perform set_config('p3_331.line_walk', v_line::text, true);

  -- --- o_line_qty, finding 0 itself: the shipped sale line, quantity 0.01
  update public.outbound_lines set quantity = 0.01 where id = v_line;
  get diagnostics v_n = row_count;
  perform set_config('p3_331.o_line_qty', v_n::text, true);

  -- --- o_line_price
  update public.outbound_lines set sale_price_mdl = 1 where id = v_line;
  get diagnostics v_n = row_count;
  perform set_config('p3_331.o_line_price', v_n::text, true);

  -- --- w_owner. the project slip screen still works for the owner
  v_ref := public.outbound_next_reference();
  v_id := public.create_outbound_issue(
    v_ref, '', '', jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 4, 'sale_price_mdl', 30)),
    v_project);
  perform set_config('p3_331.w_owner', v_id::text, true);
  perform set_config('p3_331.w_owner_ref', v_ref, true);

  -- --- o_line_insert, on the owner's own awaiting slip
  begin
    insert into public.outbound_lines (outbound_issue_id, product_id, quantity, sale_price_mdl)
    values (v_id, v_product, 50, 1);
    perform set_config('p3_331.o_line_insert', 'accepted', true);
  exception when others then
    perform set_config('p3_331.o_line_insert', sqlstate, true);
  end;

  -- --- o_issued_past
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date, issued_at, created_at)
    values (public.outbound_next_reference(), 'direct_client', v_client, date '2026-10-21',
            timestamptz '2025-01-01 10:00:00+02', timestamptz '2025-01-01 10:00:00+02');
    perform set_config('p3_331.o_issued_past', 'accepted', true);
  exception when others then
    perform set_config('p3_331.o_issued_past', sqlstate || ' ' || sqlerrm, true);
  end;

  -- --- o_ref_chosen
  begin
    insert into public.outbound_issues (reference, issue_mode, project_id)
    values ('IES-' || v_year || '-0001-X', 'project', v_project);
    perform set_config('p3_331.o_ref_chosen', 'accepted', true);
  exception when others then
    perform set_config('p3_331.o_ref_chosen', sqlstate || ' ' || sqlerrm, true);
  end;
end
$$;

reset role;


-- ===========================================================================
-- 5. THE VERDICT, READ AS THE SUPERUSER
-- ===========================================================================

do $$
declare
  v_year    text := current_setting('p3_331.year');
  v_product uuid := current_setting('p3_331.product')::uuid;
  k         text;
  v_n       integer;
  v_txt     text;
  v_q       numeric;
  v_p       numeric;
  v_stock   numeric;
begin
  -- The witnesses: every accepted slip has the number that was next, in order
  -- after 0041, and is dated now().
  foreach k in array array['w_proj', 'w_walk', 'w_direct', 'w_owner'] loop
    select reference into v_txt from public.outbound_issues
    where id = current_setting('p3_331.' || k)::uuid
      and issued_at = now() and created_at = now();
    if v_txt is null then
      raise exception 'P3-331: witness % is missing or not dated now()', k;
    end if;
    if v_txt <> current_setting('p3_331.' || k || '_ref') then
      raise exception 'P3-331: witness % carries %, expected %', k, v_txt, current_setting('p3_331.' || k || '_ref');
    end if;
  end loop;

  if current_setting('p3_331.w_proj_ref') <> 'IES-' || v_year || '-0042'
     or current_setting('p3_331.w_walk_ref') <> 'IES-' || v_year || '-0043'
     or current_setting('p3_331.w_direct_ref') <> 'IES-' || v_year || '-0044' then
    raise exception 'P3-331: the screen numbers did not follow 0041 in order: %, %, %',
      current_setting('p3_331.w_proj_ref'), current_setting('p3_331.w_walk_ref'), current_setting('p3_331.w_direct_ref');
  end if;

  select reference into v_txt from public.outbound_issues
  where id = current_setting('p3_331.w_empty')::uuid and issued_at = now() and created_at = now();
  if v_txt is null or v_txt <> current_setting('p3_331.w_empty_expect') or v_txt <> 'IES-' || v_year || '-0045' then
    raise exception 'P3-331: a slip sent with no number got %, expected the server''s next IES-%-0045', coalesce(v_txt, 'nothing'), v_year;
  end if;

  if current_setting('p3_331.w_owner_ref') <> 'IES-' || v_year || '-0046' then
    raise exception 'P3-331: the owner''s slip got %, expected IES-%-0046', current_setting('p3_331.w_owner_ref'), v_year;
  end if;

  select status::text into v_txt from public.outbound_issues where id = current_setting('p3_331.w_walk')::uuid;
  if v_txt <> 'shipped' then
    raise exception 'P3-331: ship_outbound_issue left the walk-in slip at %', v_txt;
  end if;

  -- The line refusals.
  foreach k in array array['m_line_insert', 'o_line_insert'] loop
    if current_setting('p3_331.' || k) <> '42501' then
      raise exception 'P3-331: case % was not refused by row level security, got %', k, current_setting('p3_331.' || k);
    end if;
  end loop;
  foreach k in array array['m_line_qty', 'o_line_qty', 'o_line_price'] loop
    if current_setting('p3_331.' || k) <> '0' then
      raise exception 'P3-331: case % changed % sale line(s) directly', k, current_setting('p3_331.' || k);
    end if;
  end loop;

  select quantity, sale_price_mdl into v_q, v_p from public.outbound_lines
  where id = current_setting('p3_331.line_proj')::uuid;
  if v_q <> 3 or v_p <> 20 then
    raise exception 'P3-331: the project sale line reads % at %, expected 3 at 20', v_q, v_p;
  end if;
  select quantity, sale_price_mdl into v_q, v_p from public.outbound_lines
  where id = current_setting('p3_331.line_walk')::uuid;
  if v_q <> 2 or v_p <> 25 then
    raise exception 'P3-331: the shipped walk-in line reads % at %, expected 2 at 25 (the owner gave stock back)', v_q, v_p;
  end if;

  select count(*) into v_n from public.outbound_lines
  where outbound_issue_id in (current_setting('p3_331.w_proj')::uuid, current_setting('p3_331.w_owner')::uuid);
  if v_n <> 2 then
    raise exception 'P3-331: expected one line on each project slip, found % in all', v_n;
  end if;

  -- The slip refusals: dates by the guard (42501), numbers by the guard (P0001).
  foreach k in array array['m_issued_past', 'm_created_past', 'm_issued_future', 'o_issued_past'] loop
    if current_setting('p3_331.' || k) not like '42501 O ie%ire nou% poart% data%' then
      raise exception 'P3-331: case % was not refused on its date, got %', k, current_setting('p3_331.' || k);
    end if;
  end loop;
  foreach k in array array['m_ref_chosen', 'm_ref_skip', 'm_ref_reuse', 'm_door_ref', 'o_ref_chosen'] loop
    if current_setting('p3_331.' || k) not like 'P0001 Num%rul ie%irii nu este urm%torul din serie%' then
      raise exception 'P3-331: case % was not refused on its number, got %', k, current_setting('p3_331.' || k);
    end if;
  end loop;

  -- Nothing refused left a slip: no slip of these accounts dated other than now(),
  -- no chosen or skipped number.
  select count(*) into v_n from public.outbound_issues
  where created_by in ('e3331000-0000-4000-8000-000000000001', 'e3331000-0000-4000-8000-000000000002')
    and (issued_at <> now() or created_at <> now());
  if v_n <> 0 then
    raise exception 'P3-331: % slip(s) saved with a date other than now()', v_n;
  end if;
  select count(*) into v_n from public.outbound_issues
  where reference in ('IES-' || v_year || '-0001-X', 'IES-' || v_year || '-0001-Y', current_setting('p3_331.m_ref_skip_ref'));
  if v_n <> 0 then
    raise exception 'P3-331: % slip(s) saved with a chosen number', v_n;
  end if;
  select count(*) into v_n from public.outbound_issues
  where created_by in ('e3331000-0000-4000-8000-000000000001', 'e3331000-0000-4000-8000-000000000002');
  if v_n <> 5 then
    raise exception 'P3-331: expected exactly the 5 witness slips by the two accounts, found %', v_n;
  end if;

  -- Stock: 100 received minus 3, 2, 1 and 4 taken by the witnesses.
  v_stock := public.product_available_stock(v_product);
  if v_stock <> 90 then
    raise exception 'P3-331: available stock is %, expected 100 - 3 - 2 - 1 - 4 = 90', v_stock;
  end if;
end
$$;

rollback;
