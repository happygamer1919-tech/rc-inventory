-- 0086_inbound_orders_active_account.sql
-- RC Inventory phase 3, card P3-180. Found by the P3-179 policy grep of
-- 2026-10-06 and again by the bug check of 2026-10-14 (finding 10): a switched-off
-- account could still read and change incoming orders, their lines and the low
-- stock reminders, and any active account could mark an order arrived, or change
-- its total or its number, by a direct request.
--
-- THE TWO DEFECTS
--
--   1. 0001 wrote the select, insert and update policies on public.inbound_orders,
--      public.order_lines and public.reminders as `to authenticated using (true)`
--      and `with check (true)`, and no later migration replaced them (grep of 0002
--      to 0085 for every policy name below finds none). `authenticated` is a
--      Postgres role and says nothing about public.profiles.active, so a
--      DEACTIVATED account still holding a valid token could read, add and change
--      all three through PostgREST.
--   2. Nothing guards the columns of public.inbound_orders. Any active account
--      could send
--        PATCH /rest/v1/inbound_orders?id=eq.<order>
--        { "status": "arrived", "arrived_at": "<now>" }
--      and the order reads arrived with no batch behind it and no history row,
--      so receive_inbound_order then treats it as already received and never
--      creates its stock. The same request could rewrite total_mdl or reference.
--
-- WHAT IT CHANGES
--
--   policies, dropped and created again on public.current_app_role() is not null,
--   the predicate of 0067, 0070 and 0073 (update on both using and with check):
--     public.inbound_orders   inbound_orders_select, _insert, _update
--     public.order_lines      order_lines_select, _insert, _update
--     public.reminders        reminders_select, _insert, _update
--   function public.inbound_orders_guard()     trigger, SECURITY INVOKER, new
--   trigger  inbound_orders_guard              BEFORE UPDATE, new
--   function public.receive_inbound_order(uuid) body only, same signature
--
-- current_app_role() is security definer from 0001 and reads public.profiles
-- filtered on p.active, so it returns null for a signed-out caller and for a
-- deactivated account still holding a valid token.
--
-- THE GUARD, for a signed-in caller (auth.uid() is not null), owner included, on
-- UPDATE only:
--
--   status and arrived_at change only inside public.receive_inbound_order,
--           pending_arrival to arrived, on the one order it was called for. That
--           function now sets a transaction-local flag, rc.inbound_receive, to the
--           order id right before its update and clears it right after; the
--           trigger accepts the change only when the flag names the row. A
--           PostgREST request is one transaction and cannot run set_config, so a
--           direct PATCH never carries the flag. The pattern of 0082.
--   total_mdl and reference never change once the row exists. Both are written
--           once, at creation, by the two functions below, and no screen edits
--           either afterwards.
--   every other column is left as it was: the document upload writes
--           document_path and document_uploaded_at, the draft confirmation writes
--           order_ref and order_ref_series, both by a PATCH from the screen.
--
-- EVERY WRITER WAS READ (grep of supabase/migrations, lib/, app/ and components/
-- for inbound_orders, order_lines and reminders):
--
--   inbound_orders
--     create_inbound_order (0084)          inserts pending_arrival, invoker  unchanged
--     confirm_extraction_draft (0084)      inserts pending_arrival, invoker  unchanged
--     receive_inbound_order (0084, here)   the one status change             flagged here
--     uploadOrderDocument (lib/data/inbound-actions.ts)
--                                          PATCH document_path, document_uploaded_at
--                                                                            not guarded
--     confirmExtractionDraft (lib/data/extraction-actions.ts)
--                                          PATCH order_ref, order_ref_series not guarded
--     inbound_orders_set_updated_at (0001) sets updated_at only              not guarded
--   order_lines
--     create_inbound_order, confirm_extraction_draft
--                                          insert, invoker, active caller passes
--     no screen and no function updates a line
--   reminders
--     checkThresholdsFor (lib/reminders/notify.ts)
--                                          select, upsert and update under the
--                                          caller's token, after a stock move made
--                                          by an active account
--
-- A CALLER WITH NO IDENTITY IS A SERVER ROLE and is not guarded, the convention
-- of 0075, 0077, 0082 and 0084: the extraction callback and the test seeds write
-- with the service role (which also bypasses row level security), and a
-- migration that repairs data runs with no token. anon has no policy on these
-- tables and stays refused.
--
-- WHAT IT DOES NOT CHANGE. The three delete policies stay 0001's owner only
-- `public.is_owner()`, which is built on current_app_role(), so a deactivated
-- owner already fails them. INSERT on inbound_orders is not guarded by the
-- trigger: both functions insert pending_arrival, and the test seeds insert
-- arrived orders as the owner, so a guard there is a separate decision. No
-- function signature, grant, table or column. The screens.
--
-- WHAT IT REMOVES: no table, no row, no column. There is NO DROP TABLE, NO
-- TRUNCATE, NO DELETE and NO UPDATE or INSERT of a row in this file. `drop
-- policy` removes a rule about rows and removes no row (CLAUDE.md 8.6); the one
-- `drop trigger if exists` is on the trigger this file creates, so the file is
-- safe to run twice. No existing row is read or changed when it applies. For an
-- active operator, manager or owner every policy predicate below is true,
-- exactly as `true` was.
--
-- MERGE IS APPLY. Merging this file applies it to the PRODUCTION database within
-- about two minutes (CLAUDE.md 8.0, ruling R-124). receive_inbound_order keeps
-- its signature, so the deployed build keeps working in that window.
--
-- PROVEN BEFORE MERGE by `npm run check:migrations`, which applies it to a
-- throwaway postgres and runs
-- scripts/poc-free/local-db/assertions/0086_inbound_orders_active_account.sql.

begin;


-- ===========================================================================
-- 1. THE NINE POLICIES
-- ===========================================================================

drop policy if exists inbound_orders_select on public.inbound_orders;
create policy inbound_orders_select on public.inbound_orders
  for select to authenticated using (public.current_app_role() is not null);

drop policy if exists inbound_orders_insert on public.inbound_orders;
create policy inbound_orders_insert on public.inbound_orders
  for insert to authenticated with check (public.current_app_role() is not null);

drop policy if exists inbound_orders_update on public.inbound_orders;
create policy inbound_orders_update on public.inbound_orders
  for update to authenticated
  using (public.current_app_role() is not null)
  with check (public.current_app_role() is not null);

drop policy if exists order_lines_select on public.order_lines;
create policy order_lines_select on public.order_lines
  for select to authenticated using (public.current_app_role() is not null);

drop policy if exists order_lines_insert on public.order_lines;
create policy order_lines_insert on public.order_lines
  for insert to authenticated with check (public.current_app_role() is not null);

drop policy if exists order_lines_update on public.order_lines;
create policy order_lines_update on public.order_lines
  for update to authenticated
  using (public.current_app_role() is not null)
  with check (public.current_app_role() is not null);

drop policy if exists reminders_select on public.reminders;
create policy reminders_select on public.reminders
  for select to authenticated using (public.current_app_role() is not null);

drop policy if exists reminders_insert on public.reminders;
create policy reminders_insert on public.reminders
  for insert to authenticated with check (public.current_app_role() is not null);

drop policy if exists reminders_update on public.reminders;
create policy reminders_update on public.reminders
  for update to authenticated
  using (public.current_app_role() is not null)
  with check (public.current_app_role() is not null);


-- ===========================================================================
-- 2. RECEIVING SETS THE FLAG THE GUARD READS
-- ===========================================================================
--
-- 0084's body word for word, plus the two set_config calls around the update.

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

  -- P3-180. The guard trigger accepts a status change only for the order named here.
  perform set_config('rc.inbound_receive', p_order_id::text, true);

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
  'Receives an inbound order: one batch per line, status to arrived, one history row, all in one transaction. Idempotent by row lock plus the unique constraint on batches.order_line_id. CARD P3-180 (0086): sets the transaction-local flag rc.inbound_receive to the order id around its update, because the trigger inbound_orders_guard accepts a status change only when that flag names the row. This is the only path that changes status for a signed-in caller.';


-- ===========================================================================
-- 3. THE GUARD
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
  'Card P3-180. BEFORE UPDATE on public.inbound_orders, for a signed-in caller (owner included; a server role with no identity is not guarded). Refuses any change of status or arrived_at other than pending_arrival to arrived made inside public.receive_inbound_order (transaction-local flag rc.inbound_receive equal to the row id), and any change of total_mdl or reference. Every other column is left to the row level security policies. Closes the direct PATCH that marked an order arrived with no stock behind it.';

revoke all on function public.inbound_orders_guard() from public;
revoke all on function public.inbound_orders_guard() from anon;

drop trigger if exists inbound_orders_guard on public.inbound_orders;
create trigger inbound_orders_guard
  before update on public.inbound_orders
  for each row execute function public.inbound_orders_guard();

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect on each of the three tables four policies: select, insert and update on
-- current_app_role() is not null, delete on is_owner(). Expect the trigger
-- inbound_orders_guard, enabled; receive_inbound_order(uuid) still SECURITY
-- INVOKER.

select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('inbound_orders', 'order_lines', 'reminders')
order by tablename, policyname;

select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.inbound_orders'::regclass and not tgisinternal
order by tgname;

select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('receive_inbound_order', 'inbound_orders_guard')
order by p.proname;
