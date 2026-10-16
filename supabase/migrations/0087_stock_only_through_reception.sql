-- 0087_stock_only_through_reception.sql
-- RC Inventory phase 3, card P3-312. Found by the bug check of 2026-10-16
-- (findings 0, 1 and 2): stock could grow without a delivery, by three direct
-- requests that go around the order and reception screens.
--
-- THE THREE DEFECTS
--
--   1. (finding 0, HIGH) 0073 wrote batches_insert as `with check
--      (current_app_role() is not null)`. Stock is batches minus outbound lines,
--      so any active account could send
--        POST /rest/v1/batches
--        { "product_id": "<p>", "inbound_order_id": "<o>",
--          "order_line_id": "<pending line>", "quantity": 100000 }
--      and the stock of that product rose by 100000 with nothing delivered. The
--      owner could also PATCH the quantity of an existing batch (batches_update,
--      0001, is_owner()).
--   2. (finding 1) 0086 wrote order_lines_insert and order_lines_update on the
--      same predicate. receive_inbound_order copies ol.quantity into the batch,
--      so an active account could PATCH the quantity of a pending line (or POST a
--      new line) and then press reception: stock rose by whatever the line said.
--      0086's own header says "no screen and no function updates a line".
--   3. (finding 2) inbound_orders_guard was BEFORE UPDATE only, so a direct
--        POST /rest/v1/inbound_orders
--        { "reference": "...", "status": "arrived", "arrived_at": "<now>",
--          "total_mdl": 999999, "created_by": "<someone else>" }
--      saved an order that read as already arrived, in another account's name,
--      with any total.
--
-- WHAT IT CHANGES
--
--   policy   batches_insert          dropped and created again: the caller must
--                                    be active AND the transaction-local flag
--                                    rc.inbound_receive must name the batch's
--                                    order
--   policy   batches_update          dropped, NOT created again
--   policy   order_lines_insert      dropped and created again: the caller must
--                                    be active, the flag rc.inbound_lines must
--                                    name the line's order, and that order must
--                                    still be pending_arrival
--   policy   order_lines_update      dropped, NOT created again
--   function public.inbound_orders_guard()      body, now also handles INSERT
--   trigger  inbound_orders_guard               BEFORE INSERT OR UPDATE (was
--                                               BEFORE UPDATE)
--   function public.create_inbound_order(...)   body only, same signature
--   function public.confirm_extraction_draft(...) body only, same signature
--   function public.receive_inbound_order(uuid) body only, same signature
--
-- THE FLAGS, the pattern of 0082, 0084 and 0086. A function sets a
-- transaction-local setting to the id (or number) of the row it is about to
-- write, right before the write, and clears it right after. A PostgREST request
-- is one statement in one transaction and cannot run set_config, so a direct
-- POST or PATCH never carries a flag, and a function that has returned has
-- already cleared it.
--
--   rc.inbound_create   the new order's reference, around the order insert in
--                       create_inbound_order and confirm_extraction_draft
--   rc.inbound_lines    the new order's id, around the lines insert in the same
--                       two functions
--   rc.inbound_receive  the order id, in receive_inbound_order. 0086 set it
--                       around the status update only; it is now set before the
--                       batches insert and cleared after the update, so the same
--                       flag opens both writes for that one order
--
-- THE INSERT GUARD ON inbound_orders, for a signed-in caller (owner included):
--   created_by    empty is filled with the caller; anyone else is refused
--   status        must be pending_arrival, arrived_at must be empty
--   the row       must be written by one of the two functions (rc.inbound_create
--                 equal to its reference). Lines can only be added by those same
--                 functions, so a bare order written directly could never carry
--                 a line anyway.
--   total_mdl     computed by the two functions, from the lines and the
--                 catalogue value of each product, rounded to the ban: the same
--                 sum the order screen and the draft confirmation compute
--                 (lib/data/inbound-actions.ts createInboundOrder and
--                 lib/data/extraction-actions.ts, quantity times
--                 products.unit_value_mdl). The p_total_mdl argument stays in
--                 both signatures so the deployed build keeps calling them, and
--                 is no longer what gets stored.
-- The UPDATE half of the guard is 0086 word for word.
--
-- EVERY WRITER WAS READ (grep of supabase/migrations, lib/, app/, components/,
-- scripts/ and tests/ for batches, order_lines and inbound_orders):
--
--   batches
--     receive_inbound_order (0086, here)     insert, invoker        flagged here
--     no screen, no other function, nothing updates a batch
--   order_lines
--     create_inbound_order (0084, here)      insert, invoker        flagged here
--     confirm_extraction_draft (0084, here)  insert, invoker        flagged here
--     no screen and no function updates a line; the screens only read lines
--     (lib/data/inbound.ts, inbound-actions.ts, product-movement.ts)
--   inbound_orders
--     create_inbound_order, confirm_extraction_draft  insert         flagged here
--     receive_inbound_order                  status update          unchanged rule
--     uploadOrderDocument (lib/data/inbound-actions.ts)
--                                            PATCH document_path    not guarded
--     confirmExtractionDraft (lib/data/extraction-actions.ts)
--                                            PATCH order_ref        not guarded
--   test seeds: tests/e2e specs write with the service role, except three that
--     wrote an arrived order, its line and its batch with the OWNER's token
--     (materials-export, stock-threshold-preview, materials-import). That is
--     the door this file closes; those seeds now create and receive the order
--     through the two functions, as the screens do.
--
-- A CALLER WITH NO IDENTITY IS A SERVER ROLE and is not guarded, the convention
-- of 0075, 0077, 0082, 0084 and 0086: the extraction callback and the test seeds
-- write with the service role (which also bypasses row level security), and a
-- migration that repairs data runs with no token. anon has no policy on these
-- tables and stays refused.
--
-- WHAT IT DOES NOT CHANGE. The select policies, the delete policies (owner
-- only), the reminders policies, every function signature and grant, the UPDATE
-- rules of 0086, the screens. An active operator, manager or owner creates an
-- order, confirms a draft and receives an order exactly as before.
--
-- WHAT IT REMOVES: no table, no row, no column. There is NO DROP TABLE, NO
-- TRUNCATE, NO DELETE and NO UPDATE or INSERT of a row in this file. The four
-- `drop policy if exists` remove rules about rows and remove no row (CLAUDE.md
-- 8.6); two of them (batches_update, order_lines_update) are not created again,
-- which takes a right away from signed-in callers and touches no row. The one
-- `drop trigger if exists` is on the trigger this file creates again, so the
-- file is safe to run twice. No existing row is read or changed when it
-- applies.
--
-- MERGE IS APPLY. Merging this file applies it to the PRODUCTION database within
-- about two minutes (CLAUDE.md 8.0, ruling R-124). Every function keeps its
-- signature, so the deployed build keeps working in that window.
--
-- PROVEN BEFORE MERGE by `npm run check:migrations`, which applies it to a
-- throwaway postgres and runs
-- scripts/poc-free/local-db/assertions/0087_stock_only_through_reception.sql.

begin;


-- ===========================================================================
-- 1. BATCHES: ONLY RECEPTION ADDS ONE, NOBODY SIGNED IN CHANGES ONE
-- ===========================================================================

drop policy if exists batches_insert on public.batches;
create policy batches_insert on public.batches
  for insert to authenticated
  with check (
    public.current_app_role() is not null
    and coalesce(current_setting('rc.inbound_receive', true), '') = batches.inbound_order_id::text
  );

drop policy if exists batches_update on public.batches;


-- ===========================================================================
-- 2. ORDER LINES: ONLY THE TWO ORDER FUNCTIONS ADD ONE, NOBODY CHANGES ONE
-- ===========================================================================

drop policy if exists order_lines_insert on public.order_lines;
create policy order_lines_insert on public.order_lines
  for insert to authenticated
  with check (
    public.current_app_role() is not null
    and coalesce(current_setting('rc.inbound_lines', true), '') = order_lines.inbound_order_id::text
    and exists (
      select 1 from public.inbound_orders o
      where o.id = order_lines.inbound_order_id and o.status = 'pending_arrival'
    )
  );

drop policy if exists order_lines_update on public.order_lines;


-- ===========================================================================
-- 3. THE ORDER FUNCTIONS SET THE FLAGS AND COMPUTE THE TOTAL
-- ===========================================================================
--
-- 0084's bodies word for word, plus: the total computed from the lines, and the
-- two set_config pairs around the order insert and the lines insert.

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
  v_total    numeric;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Comanda trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  -- P3-312. The total is the screen's sum, computed here: quantity times the
  -- catalogue value of each product, rounded to the ban. p_total_mdl is no
  -- longer stored.
  select coalesce(round(sum((line ->> 'quantity')::numeric * coalesce(p.unit_value_mdl, 0)), 2), 0)
    into v_total
  from jsonb_array_elements(p_lines) as line
  left join public.products p on p.id = (line ->> 'product_id')::uuid;

  -- P3-312. The order guard accepts a new order only while the flag names it.
  perform set_config('rc.inbound_create', coalesce(p_reference, ''), true);

  insert into public.inbound_orders
    (reference, supplier_name, currency, ordered_at, expected_at, total_mdl, status, created_by)
  values
    (p_reference, p_supplier_name, p_currency, p_ordered_at, p_expected_at,
     v_total, 'pending_arrival', auth.uid())
  returning id into v_order_id;

  perform set_config('rc.inbound_create', '', true);

  -- P3-312. The lines policy accepts a line only while the flag names its order.
  perform set_config('rc.inbound_lines', v_order_id::text, true);

  insert into public.order_lines (inbound_order_id, product_id, quantity, unit_price)
  select
    v_order_id,
    (line ->> 'product_id')::uuid,
    (line ->> 'quantity')::numeric,
    nullif(line ->> 'unit_price', '')::numeric
  from jsonb_array_elements(p_lines) as line;

  get diagnostics v_line_count = row_count;

  perform set_config('rc.inbound_lines', '', true);

  if v_line_count = 0 then
    raise exception 'Comanda trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  -- Every status change writes history, the first one included. An order whose
  -- history starts at its second status cannot be audited back to its creation.
  -- P3-277. The history guard accepts the row only while the flag names it.
  perform set_config('rc.status_history_write', v_order_id::text, true);

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by)
  values
    ('inbound_order', v_order_id, null, 'pending_arrival',
     'Comandă introdusă manual de operator.', auth.uid());

  perform set_config('rc.status_history_write', '', true);

  return v_order_id;
end;
$$;

comment on function public.create_inbound_order(text, text, public.currency_code, date, date, numeric, jsonb) is
  'Creates an inbound order, its lines and its first status_history row in one transaction. SECURITY INVOKER: RLS still applies. CARD P3-312 (0087): computes total_mdl itself from the lines (quantity times products.unit_value_mdl, rounded to 2 places; p_total_mdl is kept in the signature and not stored), and sets the transaction-local flags rc.inbound_create (the reference) around the order insert and rc.inbound_lines (the order id) around the lines insert, because the order guard and the lines insert policy accept a signed-in write only while those flags name the row.';


create or replace function public.confirm_extraction_draft(
  p_order_id      uuid,
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
  v_draft      public.extraction_drafts%rowtype;
  v_order_id   uuid;
  v_line_count int;
  v_total      numeric;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Comanda trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  -- FOR UPDATE serialises two operators pressing confirm at the same moment.
  -- The second waits, then sees confirmed_at set and refuses.
  select * into v_draft
  from public.extraction_drafts
  where order_id = p_order_id
  for update;

  if not found then
    raise exception 'Ciorna nu mai există.' using errcode = 'P0002';
  end if;

  -- confirmed_at, not the foreign key. See the header, correction 2.
  if v_draft.confirmed_at is not null then
    raise exception 'Ciorna a fost deja confirmată.' using errcode = 'P0002';
  end if;

  if v_draft.status is null or v_draft.status = 'failed' then
    raise exception 'Documentul nu are date extrase de confirmat.' using errcode = 'P0001';
  end if;

  -- P3-312. The total is the screen's sum, computed here: quantity times the
  -- catalogue value of each product, rounded to the ban. p_total_mdl is no
  -- longer stored.
  select coalesce(round(sum((line ->> 'quantity')::numeric * coalesce(p.unit_value_mdl, 0)), 2), 0)
    into v_total
  from jsonb_array_elements(p_lines) as line
  left join public.products p on p.id = (line ->> 'product_id')::uuid;

  -- P3-312. The order guard accepts a new order only while the flag names it.
  perform set_config('rc.inbound_create', coalesce(p_reference, ''), true);

  insert into public.inbound_orders
    (reference, supplier_name, currency, ordered_at, expected_at, total_mdl, status, created_by,
     document_path, document_uploaded_at)
  values
    (p_reference, p_supplier_name, p_currency, p_ordered_at, p_expected_at,
     v_total, 'pending_arrival', auth.uid(),
     v_draft.document_path, v_draft.callback_at)
  returning id into v_order_id;

  perform set_config('rc.inbound_create', '', true);

  -- P3-312. The lines policy accepts a line only while the flag names its order.
  perform set_config('rc.inbound_lines', v_order_id::text, true);

  insert into public.order_lines (inbound_order_id, product_id, quantity, unit_price)
  select
    v_order_id,
    (line ->> 'product_id')::uuid,
    (line ->> 'quantity')::numeric,
    nullif(line ->> 'unit_price', '')::numeric
  from jsonb_array_elements(p_lines) as line;

  get diagnostics v_line_count = row_count;

  perform set_config('rc.inbound_lines', '', true);

  if v_line_count = 0 then
    raise exception 'Comanda trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  -- P3-277. The history guard accepts the row only while the flag names it.
  perform set_config('rc.status_history_write', v_order_id::text, true);

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by)
  values
    ('inbound_order', v_order_id, null, 'pending_arrival',
     'Comandă creată din document extras automat, verificat de operator.', auth.uid());

  perform set_config('rc.status_history_write', '', true);

  update public.extraction_drafts
     set confirmed_inbound_order_id = v_order_id,
         confirmed_at               = now(),
         confirmed_by               = auth.uid()
   where order_id = p_order_id;

  return v_order_id;
end;
$$;

comment on function public.confirm_extraction_draft(uuid, text, text, public.currency_code, date, date, numeric, jsonb) is
  'Confirms an extraction draft into an inbound order with its lines and first status_history row, in one transaction. SECURITY INVOKER. CARD P3-312 (0087): computes total_mdl itself from the lines (quantity times products.unit_value_mdl, rounded to 2 places; p_total_mdl is kept in the signature and not stored), and sets the transaction-local flags rc.inbound_create (the reference) around the order insert and rc.inbound_lines (the order id) around the lines insert, because the order guard and the lines insert policy accept a signed-in write only while those flags name the row.';


-- ===========================================================================
-- 4. RECEPTION OPENS THE BATCHES INSERT FOR ITS OWN ORDER
-- ===========================================================================
--
-- 0086's body word for word, with the rc.inbound_receive pair moved out to
-- cover the batches insert as well as the status update.

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

  -- P3-180 and P3-312. The batches insert policy and the order guard accept the
  -- write only for the order named here.
  perform set_config('rc.inbound_receive', p_order_id::text, true);

  insert into public.batches (product_id, inbound_order_id, order_line_id, quantity, arrived_at)
  select ol.product_id, ol.inbound_order_id, ol.id, ol.quantity, now()
  from public.order_lines ol
  where ol.inbound_order_id = p_order_id
  on conflict (order_line_id) do nothing;

  get diagnostics v_created = row_count;

  update public.inbound_orders
     set status = 'arrived', arrived_at = now()
   where id = p_order_id;

  perform set_config('rc.inbound_receive', '', true);

  -- P3-277. The history guard accepts the row only while the flag names it.
  perform set_config('rc.status_history_write', p_order_id::text, true);

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by)
  values
    ('inbound_order', p_order_id, 'pending_arrival', 'arrived',
     'Recepție confirmată. Loturile au fost create.', auth.uid());

  perform set_config('rc.status_history_write', '', true);

  return query select v_created, false;
end;
$$;

comment on function public.receive_inbound_order(uuid) is
  'Receives an inbound order: one batch per line, status to arrived, one history row, all in one transaction. Idempotent by row lock plus the unique constraint on batches.order_line_id. CARDS P3-180 (0086) and P3-312 (0087): sets the transaction-local flag rc.inbound_receive to the order id around its batches insert and its status update, because the batches insert policy and the trigger inbound_orders_guard accept those writes only when that flag names the order. This is the only path that adds stock or changes status for a signed-in caller.';


-- ===========================================================================
-- 5. THE ORDER GUARD COVERS INSERT TOO
-- ===========================================================================

create or replace function public.inbound_orders_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- A server role (no identity) is not guarded: the extraction callback, seeds
  -- and data repairs.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;

    if new.created_by <> auth.uid() then
      raise exception 'O comandă nouă se înregistrează numai pe numele contului care o salvează.'
        using errcode = '42501';
    end if;

    if new.status is distinct from 'pending_arrival' or new.arrived_at is not null then
      raise exception 'O comandă nouă începe în așteptare. Sosirea se confirmă numai prin recepție.'
        using errcode = '42501';
    end if;

    if coalesce(current_setting('rc.inbound_create', true), '') is distinct from new.reference then
      raise exception 'O comandă nouă se salvează numai din ecranul de comenzi, cu pozițiile ei.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if new.status is distinct from old.status or new.arrived_at is distinct from old.arrived_at then
    if not (
      old.status = 'pending_arrival'
      and new.status = 'arrived'
      and coalesce(current_setting('rc.inbound_receive', true), '') = old.id::text
    ) then
      raise exception 'O comandă se marchează sosită numai prin confirmarea recepției.'
        using errcode = '42501';
    end if;
  end if;

  if new.total_mdl is distinct from old.total_mdl then
    raise exception 'Valoarea unei comenzi nu se mai poate schimba după salvare.'
      using errcode = '42501';
  end if;

  if new.reference is distinct from old.reference then
    raise exception 'Numărul unei comenzi nu se mai poate schimba după salvare.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.inbound_orders_guard() is
  'Cards P3-180 (0086) and P3-312 (0087). BEFORE INSERT OR UPDATE on public.inbound_orders, for a signed-in caller (owner included; a server role with no identity is not guarded). On INSERT refuses a row the two order functions would not write: created_by not the caller (an empty one is filled with the caller), a status other than pending_arrival or an arrival date, or a row written outside create_inbound_order and confirm_extraction_draft (transaction-local flag rc.inbound_create equal to its reference). On UPDATE refuses any change of status or arrived_at other than pending_arrival to arrived made inside public.receive_inbound_order (flag rc.inbound_receive equal to the row id), and any change of total_mdl or reference. Every other column is left to the row level security policies.';

revoke all on function public.inbound_orders_guard() from public;
revoke all on function public.inbound_orders_guard() from anon;

drop trigger if exists inbound_orders_guard on public.inbound_orders;
create trigger inbound_orders_guard
  before insert or update on public.inbound_orders
  for each row execute function public.inbound_orders_guard();

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect on batches three policies (select, insert with the rc.inbound_receive
-- flag, delete on is_owner()) and on order_lines three (select, insert with the
-- rc.inbound_lines flag and the pending check, delete on is_owner()); no update
-- policy on either. Expect the trigger inbound_orders_guard, enabled, on insert
-- and update; the three functions still SECURITY INVOKER.

select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('batches', 'order_lines')
order by tablename, policyname;

select tgname, tgenabled, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.inbound_orders'::regclass and not tgisinternal
order by tgname;

select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_inbound_order', 'confirm_extraction_draft', 'receive_inbound_order', 'inbound_orders_guard')
order by p.proname;
