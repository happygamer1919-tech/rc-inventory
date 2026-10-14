-- 0085_walkin_direct_insert_inactive_buyer.sql
-- RC Inventory phase 3, card P3-305. Found by the bug check of 2026-10-14: the
-- "buyer must be active" rule of 0084 (P3-277) sat only inside
-- create_direct_client_issue, so the walk-in door had two side entrances.
--
-- THE DEFECT
--
--   1. The outbound_issues_insert policy (0067) lets every active account INSERT a
--      slip row, and the INSERT branch of outbound_issues_guard (0082, 0083) checks
--      only the row's shape. An account manager sending
--        POST /rest/v1/outbound_issues
--        { "reference": "X", "issue_mode": "direct_client",
--          "client_id": "<a deactivated client>", "pickup_date": "2026-10-14" }
--      saved a walk-in slip to a switched-off buyer.
--   2. outbound_issue_take_stock (0077, body 0084) is SECURITY DEFINER and granted
--      to authenticated. It accepts the creator of an empty slip, so the same
--      account then called
--        POST /rest/v1/rpc/outbound_issue_take_stock
--      on that slip and the stock left for a switched-off buyer.
--
-- WHAT IT CHANGES
--
--   function public.outbound_issues_guard()                body only, same trigger
--   function public.outbound_issue_take_stock(uuid, jsonb) body only, same signature
--
-- THE GUARD. 0083's body word for word, plus one refusal at the end of the INSERT
-- branch: a walk-in slip whose client row is not active is refused with P0001 and
-- the sentence 0084 uses, so the screen shows the same words whichever door was
-- tried. The guard is SECURITY INVOKER: it reads the client as the caller, the same
-- read create_direct_client_issue makes in 0084.
--
-- TAKE STOCK. 0084's body word for word, plus one refusal after the P3-199 guard: a
-- walk-in slip whose client row is not active is refused with P0001 and the same
-- sentence, owner included, before any lock, line or history row. The routine is
-- SECURITY DEFINER, so it reads the client row whatever the caller may see.
--
-- A CALLER WITH NO IDENTITY IS A SERVER ROLE and is not guarded, the convention of
-- 0075, 0077, 0082 and 0084: the test seeds and a migration that repairs data.
--
-- WHAT STILL WORKS. create_direct_client_issue (0084) refuses a switched-off buyer
-- itself, before its insert, so it never reaches these checks with one; with an
-- active buyer both new checks pass. Project slips (issue_mode 'project') have no
-- client and are not touched. Shipping, invoices and the screens are not touched.
--
-- WHAT IT DOES NOT CHANGE. Every policy, signature, grant, trigger and the body of
-- create_direct_client_issue. No existing slip is read or changed: the checks run
-- only on a new insert and on a take stock call.
--
-- WHAT IT REMOVES: nothing. There is NO DROP, NO TRUNCATE, NO DELETE and NO UPDATE
-- or INSERT of a row in this file.
--
-- MERGE IS APPLY. Merging this file applies it to the PRODUCTION database within
-- about two minutes (CLAUDE.md 8.0, ruling R-124). Both functions keep their
-- signatures, so the deployed build keeps working in that window.
--
-- PROVEN BEFORE MERGE by `npm run check:migrations`, which applies it to a
-- throwaway postgres and runs
-- scripts/poc-free/local-db/assertions/0085_walkin_direct_insert_inactive_buyer.sql.

begin;


-- ===========================================================================
-- 1. THE GUARD REFUSES A NEW WALK-IN SLIP FOR A SWITCHED-OFF BUYER
-- ===========================================================================

create or replace function public.outbound_issues_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- A server role (no identity) is not guarded: seeds and data repairs.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;

    if new.created_by <> auth.uid() then
      raise exception 'O ieșire nouă se înregistrează numai pe numele contului care o salvează.'
        using errcode = '42501';
    end if;

    if new.status <> 'awaiting_shipment' or new.shipped_at is not null then
      raise exception 'O ieșire nouă începe ca neexpediată. Expedierea se confirmă separat.'
        using errcode = '42501';
    end if;

    if new.issue_mode = 'project'
       and (new.project_id is null or new.client_id is not null or new.pickup_date is not null) then
      raise exception 'O ieșire pe proiect are un proiect și nu are client direct sau dată de ridicare.'
        using errcode = '42501';
    end if;

    if new.issue_mode = 'direct_client'
       and (new.client_id is null or new.pickup_date is null or new.project_id is not null) then
      raise exception 'O vânzare la tejghea are un client și o dată de ridicare și nu are proiect.'
        using errcode = '42501';
    end if;

    -- P3-305. A switched-off buyer is refused here too, not only in
    -- create_direct_client_issue, so a direct POST cannot save the slip.
    if new.issue_mode = 'direct_client'
       and not exists (select 1 from public.clients c where c.id = new.client_id and c.active) then
      raise exception 'Clientul ales este dezactivat. Alege alt client sau reactivează-l din fișa lui.'
        using errcode = 'P0001';
    end if;

    return new;
  end if;

  -- UPDATE
  if new.issue_mode is distinct from old.issue_mode then
    raise exception 'Tipul ieșirii (proiect sau vânzare la tejghea) nu se mai poate schimba după salvare.'
      using errcode = '42501';
  end if;

  if new.client_id is distinct from old.client_id then
    raise exception 'Clientul unei ieșiri nu se mai poate schimba după salvare.'
      using errcode = '42501';
  end if;

  if new.project_id is distinct from old.project_id then
    raise exception 'Proiectul unei ieșiri nu se mai poate schimba după salvare.'
      using errcode = '42501';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'Autorul unei ieșiri nu se mai poate schimba.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status or new.shipped_at is distinct from old.shipped_at then
    if not (
      old.status = 'awaiting_shipment'
      and new.status = 'shipped'
      and coalesce(current_setting('rc.outbound_ship', true), '') = old.id::text
    ) then
      raise exception 'Starea unei ieșiri se schimbă numai prin confirmarea expedierii.'
        using errcode = '42501';
    end if;
  end if;

  -- P3-274. The number and the dates of a saved slip never change.
  if new.reference is distinct from old.reference then
    raise exception 'Numărul ieșirii nu se mai poate schimba după salvare.'
      using errcode = '42501';
  end if;

  if new.issued_at is distinct from old.issued_at then
    raise exception 'Data emiterii unei ieșiri nu se mai poate schimba.'
      using errcode = '42501';
  end if;

  if new.pickup_date is distinct from old.pickup_date then
    raise exception 'Data de ridicare a unei ieșiri nu se mai poate schimba după salvare.'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'Data creării unei ieșiri nu se mai poate schimba.'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id then
    raise exception 'Identificatorul unei ieșiri nu se mai poate schimba.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.outbound_issues_guard() is
  'Cards P3-266 (0082), P3-274 (0083) and P3-305 (0085). BEFORE INSERT OR UPDATE on public.outbound_issues, for a signed-in caller (owner included; a server role with no identity is not guarded). On UPDATE refuses any change of issue_mode, client_id, project_id, created_by, reference, issued_at, pickup_date, created_at or id, and any change of status or shipped_at other than awaiting_shipment to shipped made inside public.ship_outbound_issue (transaction-local flag rc.outbound_ship equal to the row id); updated_at stays free for its own trigger. On INSERT refuses a row the two doors would not write: created_by not the caller (an empty one is filled with the caller), a status other than awaiting_shipment, a project slip without a project or with a client or pickup date, a walk-in slip without a client or pickup date or with a project, and (P3-305) a walk-in slip whose client is not active. Closes the direct PATCH that retyped a walk-in sale as a project sale, the one that renumbered or redated a saved slip, and the direct POST of a walk-in slip to a switched-off buyer.';

revoke all on function public.outbound_issues_guard() from public;
revoke all on function public.outbound_issues_guard() from anon;


-- ===========================================================================
-- 2. TAKE STOCK REFUSES A WALK-IN SLIP FOR A SWITCHED-OFF BUYER
-- ===========================================================================
--
-- 0084 word for word, plus the issue_mode and client_id read and the P3-305 check.

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
  v_mode       public.outbound_mode;
  v_client_id  uuid;
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
  select oi.status, oi.created_by, oi.issue_mode, oi.client_id
    into v_status, v_created_by, v_mode, v_client_id
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

  -- P3-305. No stock leaves for a switched-off buyer, owner included.
  if auth.uid() is not null and v_mode = 'direct_client'
     and not exists (select 1 from public.clients c where c.id = v_client_id and c.active) then
    raise exception 'Clientul ales este dezactivat. Alege alt client sau reactivează-l din fișa lui.'
      using errcode = 'P0001';
  end if;

  -- FROM HERE ON, 0084 WORD FOR WORD.
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

comment on function public.outbound_issue_take_stock(uuid, jsonb) is
  'Card P3-118, ruling R-215: THE ONE SUBTRACTION, called by both outbound doors. CARD P3-195 (0075): SECURITY DEFINER; refuses a token holder with no active profile, an issue that does not exist and an issue that is not awaiting_shipment. CARD P3-199 (0077): a caller who is not the owner is also refused unless they created the slip and it has no line yet, so the owner-only rule on outbound_lines cannot be bypassed through this routine. CARD P3-305 (0085): a signed-in caller, owner included, is refused on a walk-in slip whose client is not active. The locks, the summed overdraw check, the INSUFFICIENT_STOCK contract, the lines insert and the history row are unchanged.';

revoke all on function public.outbound_issue_take_stock(uuid, jsonb) from public;
revoke all on function public.outbound_issue_take_stock(uuid, jsonb) from anon;
grant execute on function public.outbound_issue_take_stock(uuid, jsonb) to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: the trigger outbound_issues_guard, enabled; both bodies name P3-305;
-- take_stock still SECURITY DEFINER with an ACL naming authenticated and not anon.

select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.outbound_issues'::regclass and not tgisinternal
order by tgname;

select p.proname, p.prosecdef as security_definer,
       position('P3-305' in p.prosrc) > 0 as checks_active_buyer,
       pg_catalog.array_to_string(p.proacl, E'\n') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('outbound_issues_guard', 'outbound_issue_take_stock')
order by p.proname;
