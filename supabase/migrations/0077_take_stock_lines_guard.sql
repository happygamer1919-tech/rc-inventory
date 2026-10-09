-- 0077_take_stock_lines_guard.sql
-- RC Inventory phase 3, card P3-199. Found by the bug check of 2026-10-09.
--
-- THE DOOR 0075 LEFT OPEN.
--
-- 0075 (card P3-195, #469) made direct inserts and updates on outbound_lines owner
-- only, and moved the line insert into public.outbound_issue_take_stock, which is
-- SECURITY DEFINER and granted to every authenticated user. The routine checked that
-- the caller was active, that the slip existed and that it was awaiting_shipment.
-- It did not check who the caller was in relation to the slip, nor that the slip was
-- still empty. So any account manager could call the routine on someone else's slip
-- awaiting shipment, or on their own slip after its first take stock, and add lines:
-- the owner-only rule on outbound_lines was bypassed through the back door.
--
-- WHAT IT CHANGES
--
--   function  public.outbound_issue_take_stock(uuid, jsonb)   SAME SIGNATURE, same
--             return type, still SECURITY DEFINER with the same search_path, same
--             grants. create or replace. After the existing refusals it now also
--             refuses a caller who is not the owner unless BOTH hold:
--               the caller created the slip (outbound_issues.created_by), and
--               the slip has no line yet.
--
-- WHY THE LEGITIMATE FLOW STILL WORKS. Both doors (create_outbound_issue and
-- create_direct_client_issue, 0067) insert the slip with created_by = auth.uid() and
-- call this routine as their last instruction in the same transaction, so at that
-- moment the caller is the creator and the slip has no line. A caller with no
-- identity (auth.uid() is null) is a server role, as in 0075, and is not refused.
-- The owner is never refused by this guard.
--
-- ORDER OF REFUSALS. The status check stays first, so a shipped slip still gets the
-- "deja expediata" message; the new guard comes after it. The slip row is already
-- locked by the status check, so two concurrent calls cannot both see it empty.
--
-- WHAT IT DOES NOT CHANGE. The outbound_lines policies of 0075, the two doors and
-- ship_outbound_issue. The locks, the summed overdraw check, the INSUFFICIENT_STOCK
-- contract, the lines insert and the history row are 0075 unchanged.
--
-- WHAT IT REMOVES: no table, no row, no column, no function. There is NO DROP, NO
-- TRUNCATE, NO DELETE, NO UPDATE and NO INSERT statement outside the function body.
--
-- MERGE IS APPLY: merging this file changes the production database within about
-- two minutes. The deployed build calls only the two doors, whose signatures do not
-- change, and both call the routine on a fresh slip they just created.

begin;

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

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by)
  values
    ('outbound_issue', p_issue_id, null, 'awaiting_shipment',
     'Ieșire creată de operator. Stocul a fost scăzut.', auth.uid());
end;
$$;

comment on function public.outbound_issue_take_stock(uuid, jsonb) is
  'Card P3-118, ruling R-215: THE ONE SUBTRACTION, called by both outbound doors. CARD P3-195 (0075): SECURITY DEFINER; refuses a token holder with no active profile, an issue that does not exist and an issue that is not awaiting_shipment. CARD P3-199 (0077): a caller who is not the owner is also refused unless they created the slip and it has no line yet, so the owner-only rule on outbound_lines cannot be bypassed through this routine. The locks, the summed overdraw check, the INSUFFICIENT_STOCK contract, the lines insert and the history row are unchanged.';

revoke all on function public.outbound_issue_take_stock(uuid, jsonb) from public;
revoke all on function public.outbound_issue_take_stock(uuid, jsonb) from anon;
grant execute on function public.outbound_issue_take_stock(uuid, jsonb) to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: take_stock security definer with an ACL naming authenticated and not anon.

select p.proname, p.prosecdef as security_definer,
       pg_catalog.array_to_string(p.proacl, E'\n') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'outbound_issue_take_stock';
