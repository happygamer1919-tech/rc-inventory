-- 0003_inbound_functions.sql
-- RC Inventory phase 2, card P2-04. Inbound order creation and receipt, atomic.
--
-- Applied by EXECUTOR under ruling R-001. Runs as one transaction.
--
-- WHY THESE ARE DATABASE FUNCTIONS AND NOT APPLICATION CODE.
--
-- Creating an order is three writes: the order, its lines, and a status_history
-- row. Receiving one is also three: the batches, the status change, and another
-- history row. Over PostgREST each of those is a separate HTTP request with its
-- own transaction, so a failure between two of them leaves the database in a
-- state the application says is impossible: an order with no lines, or an order
-- marked received with no batches behind it, which is a stock figure that is
-- silently wrong.
--
-- Both functions are SECURITY INVOKER on purpose. They run as the caller, so
-- every row level security policy from 0001 still applies. These functions
-- bundle work into one transaction; they do not grant anyone new rights.
--
-- Both are also IDEMPOTENT, which is the card's own requirement: a second
-- "mark arrived" must not create a second batch. That is enforced here, at the
-- row lock, and not by hoping the button is only clicked once.

begin;

-- ===========================================================================
-- 1. CREATE AN INBOUND ORDER, WITH ITS LINES AND ITS FIRST HISTORY ROW
-- ===========================================================================
--
-- Lines arrive as jsonb: [{"product_id": "...", "quantity": 1, "unit_price": 2}]
-- An order with no lines is rejected. An order is a promise about goods, and a
-- promise about nothing is a row that every later screen has to special-case.

create or replace function public.create_inbound_order(
  p_reference     text,
  p_supplier_name text,
  p_currency      public.currency_code,
  p_ordered_at    date,
  p_expected_at   date,
  p_total_mdl     numeric,
  p_lines         jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_line_count int;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Comanda trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  insert into public.inbound_orders
    (reference, supplier_name, currency, ordered_at, expected_at, total_mdl, status, created_by)
  values
    (p_reference, p_supplier_name, p_currency, p_ordered_at, p_expected_at,
     coalesce(p_total_mdl, 0), 'pending_arrival', auth.uid())
  returning id into v_order_id;

  insert into public.order_lines (inbound_order_id, product_id, quantity, unit_price)
  select
    v_order_id,
    (line ->> 'product_id')::uuid,
    (line ->> 'quantity')::numeric,
    nullif(line ->> 'unit_price', '')::numeric
  from jsonb_array_elements(p_lines) as line;

  get diagnostics v_line_count = row_count;
  if v_line_count = 0 then
    raise exception 'Comanda trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  -- Every status change writes history, the first one included. An order whose
  -- history starts at its second status cannot be audited back to its creation.
  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by)
  values
    ('inbound_order', v_order_id, null, 'pending_arrival',
     'Comandă introdusă manual de operator.', auth.uid());

  return v_order_id;
end;
$$;

comment on function public.create_inbound_order is
  'Creates an inbound order, its lines and its first status_history row in one transaction. SECURITY INVOKER: RLS still applies.';


-- ===========================================================================
-- 2. RECEIVE AN INBOUND ORDER
-- ===========================================================================
--
-- One batch per order line, the order flipped to arrived, one history row.
--
-- IDEMPOTENCE HAS TWO LOCKS, not one:
--   * SELECT ... FOR UPDATE serialises two simultaneous callers, so the second
--     waits and then sees status = 'arrived' and does nothing.
--   * batches.order_line_id is UNIQUE (from 0001), so even a caller that got
--     past the first check cannot insert a second batch for the same line.
-- The first is the intended path; the second is what makes the guarantee true
-- rather than likely.

create or replace function public.receive_inbound_order(p_order_id uuid)
returns table (created_batches integer, already_arrived boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status public.inbound_status;
  v_created integer := 0;
begin
  select status into v_status
  from public.inbound_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Comanda nu există.' using errcode = 'P0002';
  end if;

  if v_status = 'arrived' then
    -- Already received. No second batch, no second history row, no error: the
    -- operator clicked twice and the system simply agrees with itself.
    return query select 0, true;
    return;
  end if;

  insert into public.batches (product_id, inbound_order_id, order_line_id, quantity, arrived_at)
  select ol.product_id, ol.inbound_order_id, ol.id, ol.quantity, now()
  from public.order_lines ol
  where ol.inbound_order_id = p_order_id
  on conflict (order_line_id) do nothing;

  get diagnostics v_created = row_count;

  update public.inbound_orders
     set status = 'arrived', arrived_at = now()
   where id = p_order_id;

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by)
  values
    ('inbound_order', p_order_id, 'pending_arrival', 'arrived',
     'Recepție confirmată. Loturile au fost create.', auth.uid());

  return query select v_created, false;
end;
$$;

comment on function public.receive_inbound_order is
  'Receives an inbound order: one batch per line, status to arrived, one history row, all in one transaction. Idempotent by row lock plus the unique constraint on batches.order_line_id.';


-- ===========================================================================
-- 3. GRANTS
-- ===========================================================================
-- Both roles run the daily cycle, so both may call these. RLS still decides
-- what the caller can actually touch.

grant execute on function public.create_inbound_order(text, text, public.currency_code, date, date, numeric, jsonb) to authenticated;
grant execute on function public.receive_inbound_order(uuid) to authenticated;

commit;


-- ===========================================================================
-- 4. VERIFICATION
-- ===========================================================================
-- Expect two rows, both security_definer = false (they are invoker on purpose).

select p.proname, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_inbound_order', 'receive_inbound_order')
order by p.proname;
