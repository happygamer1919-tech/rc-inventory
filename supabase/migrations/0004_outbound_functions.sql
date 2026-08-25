-- 0004_outbound_functions.sql
-- RC Inventory phase 2, card P2-05. Issuing material out, and shipping it.
--
-- Applied by EXECUTOR under ruling R-001. Runs as one transaction.
--
-- THE POINT OF THIS FILE IS THE STOCK CHECK, and where it happens.
--
-- P2-05's defaults require that available stock is read at submit time INSIDE
-- the same transaction as the write, "so two simultaneous issues cannot both
-- pass a stale check". A check in the browser is a courtesy. A check in the
-- server action is better but still reads, decides, then writes as three
-- separate statements: two operators issuing the last 40 m2 at the same instant
-- both read 40, both decide yes, and the warehouse goes to minus 40 with no
-- error anywhere. Only a check that holds a lock across the read and the write
-- prevents that, and that is what this function does.
--
-- ERROR MESSAGES ARE MACHINE READABLE, NOT ROMANIAN. The insufficient-stock
-- error is raised as INSUFFICIENT_STOCK|<product_id>|<available>|<unit> and the
-- application turns it into the Romanian sentence with the proper unit label.
-- Interface copy does not belong in the database, for the same reason enum
-- values are English tokens.

begin;

-- ===========================================================================
-- 1. AVAILABLE STOCK FOR ONE PRODUCT
-- ===========================================================================
--
-- The single definition of "how much is there": batches in, outbound lines out.
-- Every caller uses this, so the number on the inventory screen and the number
-- the overdraw check enforces can never drift apart.

create or replace function public.product_available_stock(p_product_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce((select sum(b.quantity) from public.batches b where b.product_id = p_product_id), 0)
  - coalesce((select sum(ol.quantity) from public.outbound_lines ol where ol.product_id = p_product_id), 0)
$$;

comment on function public.product_available_stock is
  'Stock is a sum, never a column: batches in minus outbound lines out. One definition, so the screen and the overdraw check cannot disagree.';


-- ===========================================================================
-- 2. CREATE AN OUTBOUND ISSUE, WITH THE OVERDRAW CHECK HELD UNDER LOCK
-- ===========================================================================
--
-- Lines arrive as jsonb: [{"product_id": "...", "quantity": 1, "sale_price_mdl": 2}]
--
-- pg_advisory_xact_lock serialises every concurrent issue touching the same
-- product for the life of this transaction. The lock is taken BEFORE the stock
-- is read, so the value cannot change between the read and the insert. It is
-- released automatically at commit or rollback, so a crash cannot strand it.
--
-- Quantities for the same product across several lines are summed before the
-- check. Splitting 100 into two lines of 50 must not pass a check that 50 would
-- fail; the operator's line layout is not a way around the stock.

create or replace function public.create_outbound_issue(
  p_reference    text,
  p_client_name  text,
  p_project_name text,
  p_lines        jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_issue_id  uuid;
  v_row       record;
  v_available numeric;
  v_unit      public.unit_code;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Ieșirea trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  -- Lock every product involved, in a deterministic order. Sorting by id means
  -- two transactions touching the same two products take the locks in the same
  -- sequence, so they queue instead of deadlocking.
  for v_row in
    select distinct (line ->> 'product_id')::uuid as product_id
    from jsonb_array_elements(p_lines) as line
    order by 1
  loop
    perform pg_advisory_xact_lock(hashtext(v_row.product_id::text));
  end loop;

  -- Now check, with the locks held. Quantities are summed per product first.
  for v_row in
    select
      (line ->> 'product_id')::uuid as product_id,
      sum((line ->> 'quantity')::numeric) as wanted
    from jsonb_array_elements(p_lines) as line
    group by 1
  loop
    v_available := public.product_available_stock(v_row.product_id);
    if v_row.wanted > v_available then
      select unit into v_unit from public.products where id = v_row.product_id;
      raise exception 'INSUFFICIENT_STOCK|%|%|%',
        v_row.product_id, v_available, coalesce(v_unit::text, 'pcs')
        using errcode = 'P0001';
    end if;
  end loop;

  insert into public.outbound_issues
    (reference, client_name, project_name, status, created_by)
  values
    (p_reference, p_client_name, p_project_name, 'awaiting_shipment', auth.uid())
  returning id into v_issue_id;

  insert into public.outbound_lines (outbound_issue_id, product_id, quantity, sale_price_mdl)
  select
    v_issue_id,
    (line ->> 'product_id')::uuid,
    (line ->> 'quantity')::numeric,
    nullif(line ->> 'sale_price_mdl', '')::numeric
  from jsonb_array_elements(p_lines) as line;

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by)
  values
    ('outbound_issue', v_issue_id, null, 'awaiting_shipment',
     'Ieșire creată de operator. Stocul a fost scăzut.', auth.uid());

  return v_issue_id;
end;
$$;

comment on function public.create_outbound_issue is
  'Creates an outbound issue with its lines and first history row, refusing any line that would overdraw stock. The check is held under an advisory lock for the life of the transaction, so two simultaneous issues cannot both pass it.';


-- ===========================================================================
-- 3. SHIP AN OUTBOUND ISSUE
-- ===========================================================================
--
-- Idempotent, the same way receiving is: the row is locked, and an already
-- shipped issue is a no-op rather than an error.
--
-- Shipping does NOT move stock. Stock left the warehouse when the issue was
-- created, which is why the overdraw check lives there. Shipping records that
-- the goods physically went to site.

create or replace function public.ship_outbound_issue(p_issue_id uuid)
returns table (already_shipped boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status public.outbound_status;
begin
  select status into v_status
  from public.outbound_issues
  where id = p_issue_id
  for update;

  if not found then
    raise exception 'Ieșirea nu există.' using errcode = 'P0002';
  end if;

  if v_status = 'shipped' then
    return query select true;
    return;
  end if;

  update public.outbound_issues
     set status = 'shipped', shipped_at = now()
   where id = p_issue_id;

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by)
  values
    ('outbound_issue', p_issue_id, 'awaiting_shipment', 'shipped',
     'Expediere confirmată.', auth.uid());

  return query select false;
end;
$$;


-- ===========================================================================
-- 4. GRANTS
-- ===========================================================================

grant execute on function public.product_available_stock(uuid) to authenticated;
grant execute on function public.create_outbound_issue(text, text, text, jsonb) to authenticated;
grant execute on function public.ship_outbound_issue(uuid) to authenticated;

commit;


-- ===========================================================================
-- 5. VERIFICATION
-- ===========================================================================
-- Expect three rows, all security_definer = false.

select p.proname, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('product_available_stock', 'create_outbound_issue', 'ship_outbound_issue')
order by p.proname;
