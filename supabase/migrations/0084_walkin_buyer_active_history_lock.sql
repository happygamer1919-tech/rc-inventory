-- 0084_walkin_buyer_active_history_lock.sql
-- RC Inventory phase 3, card P3-277. Found by the bug check of 2026-10-13: a
-- walk-in sale could be saved to a switched-off buyer, and any active account
-- could write a fake line into 'Istoricul stărilor' by a direct request.
--
-- THE TWO DEFECTS
--
--   1. create_direct_client_issue (0081) checked that the buyer EXISTS and never
--      that it is ACTIVE. The screen offers active buyers only, but an
--      `rpc/create_direct_client_issue` call with the id of a deactivated client
--      saved a sale to it, took the stock, and moved it to stage client if it
--      was a lead.
--   2. The status_history_insert policy of 0073 is `current_app_role() is not
--      null`, so every active account could
--        POST /rest/v1/status_history
--        { "entity_type": "outbound_issue", "entity_id": "<slip>",
--          "from_status": "awaiting_shipment", "to_status": "shipped" }
--      or a 'cold' to 'client' event on any client, and the screens show it as
--      something that happened.
--
-- WHAT IT ADDS
--
--   function public.status_history_guard()               trigger, SECURITY INVOKER
--   trigger  status_history_guard                        BEFORE INSERT
--   function public.create_direct_client_issue(...)      body only, same signature
--   function public.create_inbound_order(...)            body only, same signature
--   function public.confirm_extraction_draft(...)        body only, same signature
--   function public.receive_inbound_order(uuid)          body only, same signature
--   function public.outbound_issue_take_stock(uuid, jsonb) body only, same signature
--   function public.ship_outbound_issue(uuid)            body only, same signature
--   function public.set_project_status(uuid, ...)        body only, same signature
--   function public.set_client_stage(uuid, ..., boolean) body only, same signature
--
-- THE BUYER. create_direct_client_issue refuses a buyer whose row is not active,
-- with P0001 and a Romanian sentence the screen shows as it is (outbound-actions
-- passes P0001 messages through). The check sits before the insert, so nothing
-- is written and no stock is taken.
--
-- THE HISTORY. The pattern of 0082 (rc.outbound_ship), applied to the history
-- table. Each function above that writes a status_history row sets the
-- transaction-local flag rc.status_history_write to the id of the row it has
-- just moved, right before its insert, and clears it right after. The trigger
-- accepts a row from a signed-in caller only while the flag names that row's
-- entity_id. A PostgREST request is one transaction and cannot run set_config,
-- so a direct POST never carries the flag, and a writer that has returned has
-- already cleared it.
--
-- EVERY WRITER WAS READ (pg_proc where prosrc mentions status_history, on a
-- local database with every migration to 0082 applied, plus a grep of app/,
-- lib/ and components/, which only READ the table):
--
--   create_inbound_order (0003)        new order, pending_arrival     flagged here
--   confirm_extraction_draft (0011)    new order from a draft         flagged here
--   receive_inbound_order (0003)       pending_arrival to arrived     flagged here
--   outbound_issue_take_stock (0077)   new slip, awaiting_shipment    flagged here
--   ship_outbound_issue (0082)         awaiting_shipment to shipped   flagged here
--   set_project_status (0021)          a real project status change   flagged here
--   set_client_stage, 4 args (0060)    first stage, or a real change  flagged here
--   set_client_stage, 3 args (0039)    calls the 4 argument form      unchanged
--   walkin_lead_becomes_client (0081)  calls set_client_stage         unchanged
--   client_stage_history, project_status_history                     readers only
--
-- Each body is the live body word for word (pg_get_functiondef on that local
-- database); the only new statements are the two set_config calls around each
-- status_history insert, and the buyer check in create_direct_client_issue. Each
-- of these writers writes history only on a real move: the two set_*_status
-- functions return early on no change, and their `select ... for update` needs
-- the owner-only update policy, so another account gets 'no longer exists'
-- and no row.
--
-- A CALLER WITH NO IDENTITY IS A SERVER ROLE and is not guarded, the convention
-- of 0075, 0077 and 0082: the extraction callback and the test seeds write with
-- the service role, and a migration that repairs data runs with no token.
-- anon is still refused by the status_history_insert policy, which is unchanged.
--
-- WHAT IT DOES NOT CHANGE. The status_history policies (0073), every function
-- signature, grant and comment, the outbound_issues guard of 0082 and 0083, the
-- screens. Every screen path writes history exactly as before.
--
-- WHAT IT REMOVES: nothing. There is NO DROP TABLE, NO TRUNCATE, NO DELETE and NO
-- UPDATE or INSERT of a row in this file. The one drop is `drop trigger if
-- exists` on the trigger this file creates, so the file is safe to run twice.
-- No existing row is read or changed when it applies.
--
-- MERGE IS APPLY. Merging this file applies it to the PRODUCTION database within
-- about two minutes (CLAUDE.md 8.0, ruling R-124). Every function keeps its
-- signature, so the deployed build keeps working in that window.
--
-- PROVEN BEFORE MERGE by `npm run check:migrations`, which applies it to a
-- throwaway postgres and runs
-- scripts/poc-free/local-db/assertions/0084_walkin_buyer_active_history_lock.sql.

begin;


-- ===========================================================================
-- 1. THE GUARD
-- ===========================================================================

create or replace function public.status_history_guard()
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

  if coalesce(current_setting('rc.status_history_write', true), '') <> new.entity_id::text then
    raise exception 'Istoricul stărilor se scrie numai odată cu schimbarea stării, din aplicație.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.status_history_guard() is
  'Card P3-277. BEFORE INSERT on public.status_history, for a signed-in caller (owner included; a server role with no identity is not guarded). Accepts the row only while the transaction-local flag rc.status_history_write equals its entity_id, which only the functions that move a row set, right before their own insert, and clear right after. Closes the direct POST that wrote a fake shipped or cold to client event.';

revoke all on function public.status_history_guard() from public;
revoke all on function public.status_history_guard() from anon;

drop trigger if exists status_history_guard on public.status_history;
create trigger status_history_guard
  before insert on public.status_history
  for each row execute function public.status_history_guard();


-- ===========================================================================
-- 2. THE WALK-IN DOOR REFUSES A SWITCHED-OFF BUYER
-- ===========================================================================
--
-- 0081 word for word, plus the active check after the existence check.

create or replace function public.create_direct_client_issue(
  p_reference   text,
  p_lines       jsonb,
  p_client_id   uuid,
  p_pickup_date date
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_issue_id uuid;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Ieșirea trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  if p_client_id is null then
    raise exception 'Alege clientul care ridică materialele.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'Clientul ales nu mai există. Reîncarcă pagina și alege din nou.'
      using errcode = 'P0002';
  end if;

  -- P3-277. A switched-off buyer is not offered on screen and is refused here.
  if not exists (select 1 from public.clients where id = p_client_id and active) then
    raise exception 'Clientul ales este dezactivat. Alege alt client sau reactivează-l din fișa lui.'
      using errcode = 'P0001';
  end if;

  if p_pickup_date is null then
    raise exception 'Alege data ridicării materialelor.' using errcode = 'P0001';
  end if;

  insert into public.outbound_issues
    (reference, issue_mode, client_id, pickup_date, status, created_by)
  values
    (p_reference, 'direct_client', p_client_id, p_pickup_date, 'awaiting_shipment', auth.uid())
  returning id into v_issue_id;

  perform public.outbound_issue_take_stock(v_issue_id, p_lines);

  -- P3-262. A lead sold to at the counter is a client from this sale on.
  perform public.walkin_lead_becomes_client(v_issue_id);

  return v_issue_id;
end;
$$;


-- ===========================================================================
-- 3. EVERY WRITER NAMES THE ROW IT MOVES
-- ===========================================================================
--
-- Each body below is the live one word for word; the only new lines are the
-- set_config pair around the status_history insert.

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

  insert into public.inbound_orders
    (reference, supplier_name, currency, ordered_at, expected_at, total_mdl, status, created_by,
     document_path, document_uploaded_at)
  values
    (p_reference, p_supplier_name, p_currency, p_ordered_at, p_expected_at,
     coalesce(p_total_mdl, 0), 'pending_arrival', auth.uid(),
     v_draft.document_path, v_draft.callback_at)
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


create or replace function public.outbound_issue_take_stock(p_issue_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row        record;
  v_available  numeric;
  v_unit       public.unit_code;
  v_status     public.outbound_status;
  v_created_by uuid;
begin
  -- A token with no active profile is refused before anything is read. See 0075: a
  -- caller with no identity at all is a server role.
  if auth.uid() is not null and public.current_app_role() is null then
    raise exception 'Contul tău nu mai este activ. Stocul nu a fost scăzut.' using errcode = '42501';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Ieșirea trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  -- The issue row is locked, so public.ship_outbound_issue cannot move it to
  -- shipped, and a second call cannot see it empty, between these checks and the
  -- lines insert.
  select oi.status, oi.created_by into v_status, v_created_by
  from public.outbound_issues oi
  where oi.id = p_issue_id
  for update;

  if not found then
    raise exception 'Ieșirea nu mai există. Reîncarcă pagina.' using errcode = 'P0002';
  end if;

  if v_status <> 'awaiting_shipment' then
    raise exception 'Ieșirea a fost deja expediată. Stocul nu se mai poate scădea pe ea.'
      using errcode = 'P0001';
  end if;

  -- CARD P3-199: only the owner, or the creator of a still empty slip, may add lines.
  if auth.uid() is not null and not public.is_owner() then
    if v_created_by is distinct from auth.uid()
       or exists (select 1 from public.outbound_lines ol where ol.outbound_issue_id = p_issue_id) then
      raise exception 'Doar proprietarul sau autorul unei ieșiri încă goale poate adăuga poziții. Stocul nu a fost scăzut.'
        using errcode = '42501';
    end if;
  end if;

  -- FROM HERE ON, 0075 WORD FOR WORD.
  for v_row in
    select distinct (line ->> 'product_id')::uuid as product_id
    from jsonb_array_elements(p_lines) as line
    order by 1
  loop
    perform pg_advisory_xact_lock(hashtext(v_row.product_id::text));
  end loop;

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

  insert into public.outbound_lines (outbound_issue_id, product_id, quantity, sale_price_mdl)
  select
    p_issue_id,
    (line ->> 'product_id')::uuid,
    (line ->> 'quantity')::numeric,
    nullif(line ->> 'sale_price_mdl', '')::numeric
  from jsonb_array_elements(p_lines) as line;

  -- P3-277. The history guard accepts the row only while the flag names it.
  perform set_config('rc.status_history_write', p_issue_id::text, true);

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by)
  values
    ('outbound_issue', p_issue_id, null, 'awaiting_shipment',
     'Ieșire creată de operator. Stocul a fost scăzut.', auth.uid());

  perform set_config('rc.status_history_write', '', true);
end;
$$;


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

  -- P3-266. The guard trigger accepts a status change only for the slip named here.
  perform set_config('rc.outbound_ship', p_issue_id::text, true);

  update public.outbound_issues
     set status = 'shipped', shipped_at = now()
   where id = p_issue_id;

  perform set_config('rc.outbound_ship', '', true);

  -- P3-277. The history guard accepts the row only while the flag names it.
  perform set_config('rc.status_history_write', p_issue_id::text, true);

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by)
  values
    ('outbound_issue', p_issue_id, 'awaiting_shipment', 'shipped',
     'Expediere confirmată.', auth.uid());

  perform set_config('rc.status_history_write', '', true);

  return query select false;
end;
$$;


create or replace function public.set_project_status(
  p_project_id uuid,
  p_status     public.project_status,
  p_note       text default null
)
returns table (changed boolean, from_status public.project_status)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_from public.project_status;
begin
  select p.status into v_from from public.projects p where p.id = p_project_id for update;
  if not found then
    raise exception 'Proiectul nu mai există.' using errcode = 'P0002';
  end if;

  if v_from = p_status then
    return query select false, v_from;
    return;
  end if;

  update public.projects set status = p_status where id = p_project_id;

  -- created_at IS clock_timestamp() AND NOT THE now() DEFAULT, AND THAT IS A
  -- CORRECTION RATHER THAN A PREFERENCE.
  --
  -- now() returns the TRANSACTION start time, so every status change inside one
  -- transaction gets the identical timestamp. The history reader then falls
  -- back to its tiebreaker, which is a random uuid, and the order it shows is a
  -- coin flip. In production each change is its own transaction and the defect
  -- never appears; it appeared immediately in the fixture below, which moves a
  -- project five times in one block, and the reader returned the wrong newest.
  --
  -- clock_timestamp() is the actual moment, with microsecond resolution, so two
  -- changes a second apart and two changes in the same statement both order
  -- correctly. It is also the more truthful value for a row that records when
  -- something happened.
  --
  -- The 0003 and 0004 writers still use the default. They write exactly ONE
  -- history row per call, so they cannot produce the collision, and editing an
  -- applied migration is forbidden by CLAUDE.md 8.1 in any case.
  --
  -- P3-277. The history guard accepts the row only while the flag names it.
  perform set_config('rc.status_history_write', p_project_id::text, true);

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by, created_at)
  values
    ('project', p_project_id, v_from::text, p_status::text, p_note, auth.uid(), clock_timestamp());

  perform set_config('rc.status_history_write', '', true);

  return query select true, v_from;
end;
$$;


create or replace function public.set_client_stage(
  p_client_id      uuid,
  p_stage          public.client_stage,
  p_follow_up_date date,
  p_first          boolean
)
returns table (changed boolean, from_stage public.client_stage)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_from       public.client_stage;
  v_date       date;
  v_step_date  date;
  v_next_date  date;
  v_clear_step boolean := false;
begin
  -- P3-92. next_action_at is READ here, beside the two columns 0057 read, so the
  -- mirror test below can compare it against the follow-up date being left. The
  -- row is already locked for update by this same statement.
  select c.stage, c.follow_up_date, c.next_action_at
    into v_from, v_date, v_step_date
  from public.clients c
  where c.id = p_client_id
  for update;
  if not found then
    raise exception 'Clientul nu mai există.' using errcode = 'P0002';
  end if;

  v_next_date := coalesce(p_follow_up_date, v_date);

  if p_first then
    if exists (
      select 1 from public.status_history h
      where h.entity_type = 'client' and h.entity_id = p_client_id
    ) then
      raise exception 'Etapa inițială a acestui client este deja înregistrată.' using errcode = 'P0001';
    end if;

    update public.clients
       set stage = p_stage,
           follow_up_date = v_next_date
     where id = p_client_id;

    -- P3-277. The history guard accepts the row only while the flag names it.
    perform set_config('rc.status_history_write', p_client_id::text, true);

    insert into public.status_history
      (entity_type, entity_id, from_status, to_status, changed_by, created_at)
    values
      ('client', p_client_id, null, p_stage::text, auth.uid(), clock_timestamp());

    perform set_config('rc.status_history_write', '', true);

    return query select true, null::public.client_stage;
    return;
  end if;

  if v_from = p_stage then
    if v_next_date is distinct from v_date then
      update public.clients set follow_up_date = v_next_date where id = p_client_id;
    end if;
    return query select false, v_from;
    return;
  end if;

  -- P3-88. LEAVING DE RELUAT WITH NO NEW DATE ENDS THE DATE. A date passed in the
  -- same call is still stored, whatever the stage.
  --
  -- P3-92. AND THE NEXT-STEP DATE GOES WITH IT, but only while it is still the
  -- mirror the "setting one sets both" rule of 0058 wrote, that is while it still
  -- equals the follow-up date being left. A next step set independently at another
  -- stage is a date somebody meant, and it survives. The next-step TEXT is never
  -- touched.
  if v_from = 'follow_up' and p_follow_up_date is null then
    v_next_date := null;
    v_clear_step := v_date is not null and v_step_date is not distinct from v_date;
  end if;

  update public.clients
     set stage = p_stage,
         follow_up_date = v_next_date,
         next_action_at = case when v_clear_step then null else next_action_at end
   where id = p_client_id;

  -- P3-277. The history guard accepts the row only while the flag names it.
  perform set_config('rc.status_history_write', p_client_id::text, true);

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, changed_by, created_at)
  values
    ('client', p_client_id, v_from::text, p_stage::text, auth.uid(), clock_timestamp());

  perform set_config('rc.status_history_write', '', true);

  return query select true, v_from;
end;
$$;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: the trigger status_history_guard, enabled, BEFORE INSERT; every
-- function below with its old signature and security (outbound_issue_take_stock
-- SECURITY DEFINER, the others SECURITY INVOKER).

select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.status_history'::regclass and not tgisinternal
order by tgname;

select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('status_history_guard', 'create_direct_client_issue', 'create_inbound_order',
                    'confirm_extraction_draft', 'receive_inbound_order', 'outbound_issue_take_stock',
                    'ship_outbound_issue', 'set_project_status', 'set_client_stage')
order by p.proname, args;
