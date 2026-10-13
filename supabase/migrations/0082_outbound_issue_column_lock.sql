-- 0082_outbound_issue_column_lock.sql
-- RC Inventory phase 3, card P3-266. Found by the bug check: a walk-in sale could
-- be retyped as a project sale, or moved to another client, by a direct request.
--
-- THE DEFECT. 0067 wrote the insert and update policies on outbound_issues as
-- `current_app_role() is not null`, so every active account could PATCH every
-- column. Nothing after 0067 narrowed them. The walk-in invoice ban (P3-171,
-- P3-212) reads issue_mode in save_invoice_draft (0074), in the invoices trigger
-- (0078) and on screen. So an account manager sending
--   PATCH /rest/v1/outbound_issues?id=eq.<walk-in slip>
--   { "issue_mode": "project", "client_id": null, "pickup_date": null,
--     "project_id": "<any project>" }
-- turned a counter sale into a project sale that could be invoiced, and moved
-- the material from one client to another, with no status_history row.
--
-- WHAT IT ADDS
--
--   function public.outbound_issues_guard()             trigger, SECURITY INVOKER
--   trigger  outbound_issues_guard                      BEFORE INSERT OR UPDATE
--   function public.ship_outbound_issue(uuid)           body only, same signature
--
-- THE RULES, for a signed-in caller (auth.uid() is not null), owner included:
--
--   UPDATE  issue_mode, client_id, project_id and created_by never change once
--           the row exists. status and shipped_at change only inside
--           public.ship_outbound_issue, awaiting_shipment to shipped, on the one
--           slip it was called for. That function now sets a transaction-local
--           flag, rc.outbound_ship, to the slip id right before its update and
--           clears it right after; the trigger accepts a status change only when
--           the flag names the row. A PostgREST request is one transaction and
--           cannot run set_config, so a direct PATCH never carries the flag.
--   INSERT  the row must be one the two doors would write: created_by is the
--           caller (filled with the caller when left empty), status is
--           awaiting_shipment with no shipped_at, a project slip has a project
--           and no client or pickup date, a walk-in slip has a client and a
--           pickup date and no project. The 0067 constraints already refuse
--           most shapes; this adds the client on a project slip, the creator
--           and the status, and says it in Romanian.
--
-- WHAT STILL WORKS, CHECKED AGAINST EVERY WRITER OF THIS TABLE
--
--   create_outbound_issue (0067)        inserts project, caller, awaiting_shipment
--   create_direct_client_issue (0081)   inserts direct_client, caller, awaiting
--   outbound_issue_take_stock (0077)    locks the row, never updates it
--   walkin_lead_becomes_client (0081)   locks the row, never updates it
--   ship_outbound_issue (0004, here)    the one status change, flagged
--   outbound_issues_set_updated_at      sets updated_at only, not guarded
--
-- A CALLER WITH NO IDENTITY IS A SERVER ROLE and is not guarded, the convention
-- of 0075 and 0077: the service role used by the test seeds and a migration that
-- repairs data. anon is still refused by the 0067 policies.
--
-- WHAT IT DOES NOT CHANGE. The outbound_issues and outbound_lines policies, the
-- invoice functions of 0074 and 0078, the two doors, the screen gate.
--
-- WHAT IT REMOVES: nothing. There is NO DROP TABLE, NO TRUNCATE, NO DELETE and NO
-- UPDATE or INSERT of a row in this file. The one drop is `drop trigger if
-- exists` on the trigger this file creates, so the file is safe to run twice.
-- No existing row is read or changed when it applies.
--
-- MERGE IS APPLY. Merging this file applies it to the PRODUCTION database within
-- about two minutes (CLAUDE.md 8.0, ruling R-124). ship_outbound_issue keeps its
-- signature, so the deployed build keeps working in that window.
--
-- PROVEN BEFORE MERGE by `npm run check:migrations`, which applies it to a
-- throwaway postgres and runs
-- scripts/poc-free/local-db/assertions/0082_outbound_issue_column_lock.sql.

begin;


-- ===========================================================================
-- 1. SHIPPING SETS THE FLAG THE TRIGGER READS
-- ===========================================================================
--
-- 0004's body word for word, plus the two set_config calls around the update.

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

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by)
  values
    ('outbound_issue', p_issue_id, 'awaiting_shipment', 'shipped',
     'Expediere confirmată.', auth.uid());

  return query select false;
end;
$$;

comment on function public.ship_outbound_issue(uuid) is
  'Moves an outbound issue from awaiting_shipment to shipped and writes its status_history row; an issue already shipped is a no-op. CARD P3-266 (0082): sets the transaction-local flag rc.outbound_ship to the issue id around its update, because the trigger outbound_issues_guard accepts a status change only when that flag names the row. This is the only path that changes status for a signed-in caller.';

revoke all on function public.ship_outbound_issue(uuid) from public;
revoke all on function public.ship_outbound_issue(uuid) from anon;
grant execute on function public.ship_outbound_issue(uuid) to authenticated;


-- ===========================================================================
-- 2. THE GUARD
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

  return new;
end;
$$;

comment on function public.outbound_issues_guard() is
  'Card P3-266. BEFORE INSERT OR UPDATE on public.outbound_issues, for a signed-in caller (owner included; a server role with no identity is not guarded). On UPDATE refuses any change of issue_mode, client_id, project_id or created_by, and any change of status or shipped_at other than awaiting_shipment to shipped made inside public.ship_outbound_issue (transaction-local flag rc.outbound_ship equal to the row id). On INSERT refuses a row the two doors would not write: created_by not the caller (an empty one is filled with the caller), a status other than awaiting_shipment, a project slip without a project or with a client or pickup date, a walk-in slip without a client or pickup date or with a project. Closes the direct PATCH that retyped a walk-in sale as a project sale.';

revoke all on function public.outbound_issues_guard() from public;
revoke all on function public.outbound_issues_guard() from anon;

drop trigger if exists outbound_issues_guard on public.outbound_issues;
create trigger outbound_issues_guard
  before insert or update on public.outbound_issues
  for each row execute function public.outbound_issues_guard();

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: the trigger outbound_issues_guard, enabled, BEFORE INSERT OR UPDATE;
-- ship_outbound_issue(uuid) still SECURITY INVOKER and executable by
-- authenticated.

select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.outbound_issues'::regclass and not tgisinternal
order by tgname;

select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('ship_outbound_issue', 'outbound_issues_guard')
order by p.proname;
