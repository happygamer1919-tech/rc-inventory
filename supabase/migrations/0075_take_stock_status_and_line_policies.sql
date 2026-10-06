-- 0075_take_stock_status_and_line_policies.sql
-- RC Inventory phase 3, card P3-185. Found by the bug check of 2026-10-06.
--
-- TWO DOORS THAT ONLY A HAND-BUILT CALL COULD OPEN, BOTH CLOSED HERE.
--
--   1. public.outbound_issue_take_stock(uuid, jsonb), granted to authenticated
--      by 0067, checked nothing about the issue it was handed. Called on a
--      SHIPPED issue it wrote lines (the stock decrement) and a fresh
--      `null -> awaiting_shipment` history row, which reads as if the issue had
--      been created a second time.
--   2. 0070 kept outbound_lines INSERT and UPDATE open to every active role, so
--      an account manager could POST a line or PATCH sale_price_mdl straight
--      through PostgREST. A POSTed line skips the overdraw check under the
--      advisory locks; a PATCHed price changes what an invoice will charge.
--
-- WHAT IT CHANGES
--
--   function  public.outbound_issue_take_stock(uuid, jsonb)   SAME SIGNATURE,
--             create or replace, now SECURITY DEFINER, and it refuses:
--               a caller with a token but no active profile (the refusal 0070
--               got from the insert policy, now said out loud),
--               an issue that does not exist,
--               an issue whose status is not awaiting_shipment.
--             Grants: revoked from public and anon, kept for authenticated.
--   policy    outbound_lines_insert   owner only
--   policy    outbound_lines_update   owner only, on both sides
--
-- WHY awaiting_shipment. public.outbound_status has two values, awaiting_shipment
-- and shipped (0001). Both doors of 0067 insert the issue as awaiting_shipment and
-- call this routine on it in the same transaction; public.ship_outbound_issue
-- (0004) is the only thing that moves it to shipped, and after that the material
-- has left the warehouse. Taking stock is valid only before that.
--
-- WHY THE ROUTINE BECOMES SECURITY DEFINER. The screens write lines ONLY through
-- this routine: lib/data/outbound-actions.ts calls create_outbound_issue and
-- create_direct_client_issue, both of which end in this routine, and nothing in
-- lib/, app/ or components/ inserts or updates public.outbound_lines directly.
-- Account managers use both doors every day. So the direct INSERT and UPDATE can
-- be narrowed to the owner only if the routine's own insert stops depending on
-- the caller's insert policy, which is what definer does. The routine keeps every
-- refusal it had and gains the ones above.
--
-- THE ACTIVE CHECK AND THE SUPERUSER. 0070 did not write an explicit
-- `current_app_role() is null` refusal because assertions/0067 calls both doors as
-- a superuser with no JWT, where that is null. The refusal here applies only when
-- there IS a user identity (auth.uid() is not null): a token holder whose profile
-- is missing or switched off. A caller with no identity is a server role
-- (postgres, service_role), which bypasses row level security anyway; anon cannot
-- reach the routine because its EXECUTE is revoked below.
--
-- WHAT IT DOES NOT CHANGE
--   outbound_lines_select stays 0070's current_app_role() is not null.
--   outbound_lines_delete stays 0001's is_owner().
--   The outbound_issues policies of 0067, create_outbound_issue,
--   create_direct_client_issue and ship_outbound_issue are not touched.
--   A valid slip (fresh, awaiting_shipment) is taken exactly as 0067 takes it:
--   same locks, same summed overdraw check under them, same INSUFFICIENT_STOCK
--   contract, same lines insert, same history row and note.
--
-- WHAT IT REMOVES: no table, no row, no column, no function. There is NO DROP
-- TABLE, NO TRUNCATE, NO DELETE, NO UPDATE and NO INSERT statement in this file.
-- `drop policy` removes a rule about rows and removes no row (CLAUDE.md 8.6).
--
-- MERGE IS APPLY: merging this file changes the production database within about
-- two minutes. The deployed build calls only the two doors, whose signatures do
-- not change, so nothing deployed breaks across the apply.

begin;


-- ===========================================================================
-- 1. THE ROUTINE: SAME BODY, THREE REFUSALS IN FRONT OF IT
-- ===========================================================================

create or replace function public.outbound_issue_take_stock(
  p_issue_id uuid,
  p_lines    jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row       record;
  v_available numeric;
  v_unit      public.unit_code;
  v_status    public.outbound_status;
begin
  -- A token with no active profile is refused before anything is read. See the
  -- header: a caller with no identity at all is a server role.
  if auth.uid() is not null and public.current_app_role() is null then
    raise exception 'Contul tău nu mai este activ. Stocul nu a fost scăzut.' using errcode = '42501';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Ieșirea trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  -- The issue row is locked, so public.ship_outbound_issue cannot move it to
  -- shipped between this check and the lines insert.
  select oi.status into v_status
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

  -- FROM HERE ON, 0067 SECTION 6 WORD FOR WORD.
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

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by)
  values
    ('outbound_issue', p_issue_id, null, 'awaiting_shipment',
     'Ieșire creată de operator. Stocul a fost scăzut.', auth.uid());
end;
$$;

comment on function public.outbound_issue_take_stock(uuid, jsonb) is
  'Card P3-118, ruling R-215: THE ONE SUBTRACTION, called by both outbound doors. CARD P3-185 (0075): SECURITY DEFINER, so its lines insert no longer depends on the caller''s insert policy and direct line writes can be owner only. It refuses a token holder with no active profile, an issue that does not exist and an issue that is not awaiting_shipment (the issue row is locked for the check). The locks, the summed overdraw check under them, the INSUFFICIENT_STOCK contract, the lines insert and the history row are 0067 unchanged.';

revoke all on function public.outbound_issue_take_stock(uuid, jsonb) from public;
revoke all on function public.outbound_issue_take_stock(uuid, jsonb) from anon;
grant execute on function public.outbound_issue_take_stock(uuid, jsonb) to authenticated;


-- ===========================================================================
-- 2. DIRECT LINE WRITES: OWNER ONLY
-- ===========================================================================
--
-- is_owner() is built on current_app_role(), so a deactivated owner already
-- fails it (0001's comment on is_owner()). The `current_app_role() is not null`
-- term is kept in front of it so every outbound_lines policy still states the
-- active-account predicate 0070 introduced, in the same words.

drop policy if exists outbound_lines_insert on public.outbound_lines;
create policy outbound_lines_insert on public.outbound_lines
  for insert to authenticated
  with check (public.current_app_role() is not null and public.is_owner());

drop policy if exists outbound_lines_update on public.outbound_lines;
create policy outbound_lines_update on public.outbound_lines
  for update to authenticated
  using (public.current_app_role() is not null and public.is_owner())
  with check (public.current_app_role() is not null and public.is_owner());

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: take_stock security definer with an ACL naming authenticated and not
-- anon; four outbound_lines policies, insert and update on is_owner().

select p.proname, p.prosecdef as security_definer,
       pg_catalog.array_to_string(p.proacl, E'\n') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'outbound_issue_take_stock';

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'outbound_lines'
order by policyname;
