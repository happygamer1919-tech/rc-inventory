-- 0083_outbound_issue_reference_lock.sql
-- RC Inventory phase 3, card P3-274. Found by the bug check of 2026-10-13: after
-- 0082, a saved slip's number and dates could still be changed by a direct
-- request.
--
-- THE DEFECT. 0082 locked issue_mode, client_id, project_id, created_by, status
-- and shipped_at. The update policy of 0067 (`current_app_role() is not null`)
-- still let every active account PATCH every other column, shipped slips
-- included. The reference is what the invoice prints (lib/data/facturare-detail.ts)
-- and what nextOutboundReference() in lib/data/outbound.ts reads to pick the next
-- number, so an account manager sending
--   PATCH /rest/v1/outbound_issues?id=eq.<slip>
--   { "reference": "IES-2026-9999" }
-- renamed a slip already on an invoice and made the numbering jump.
--
-- WHAT IT CHANGES
--
--   function public.outbound_issues_guard()             body only, same trigger
--
-- 0082's body word for word, plus, on UPDATE for a signed-in caller (owner
-- included), a refusal with errcode 42501 and a Romanian reason for any change of
--
--   reference, issued_at, pickup_date, created_at, id
--
-- so after insert the only columns that move are status and shipped_at (inside
-- public.ship_outbound_issue, 0082) and updated_at (its own trigger). Writing the
-- same value back is not a change and is accepted.
--
-- CHECKED AGAINST EVERY WRITER OF THIS TABLE
--
--   app code (lib/, app/, components/)  no .update() on outbound_issues at all;
--                                       it calls the three functions below
--   create_outbound_issue (0067)        inserts, never updates
--   create_direct_client_issue (0081)   inserts, never updates
--   outbound_issue_take_stock (0077)    locks the row, never updates it
--   walkin_lead_becomes_client (0081)   locks the row, never updates it
--   ship_outbound_issue (0082)          updates status and shipped_at only
--   outbound_issues_set_updated_at      sets updated_at only, not guarded
--
-- WHICH COLUMNS STAY EDITABLE, AND WHY. updated_at only, because its trigger
-- sets it on every update. pickup_date is locked as well: no screen edits it
-- after save (the walk-in form only creates), so no working path is lost.
--
-- A CALLER WITH NO IDENTITY IS A SERVER ROLE and is not guarded, the convention
-- of 0075, 0077 and 0082: the service role used by the test seeds and a migration
-- that repairs data. anon is still refused by the 0067 policies.
--
-- WHAT IT DOES NOT CHANGE. The trigger itself (0082 created it and it calls this
-- function by name), the outbound_issues and outbound_lines policies of 0067,
-- ship_outbound_issue, the two doors, outbound_issue_take_stock,
-- walkin_lead_becomes_client.
--
-- WHAT IT REMOVES: nothing. There is NO DROP of any kind, NO TRUNCATE, NO DELETE
-- and NO UPDATE or INSERT of a row in this file. No existing row is read or
-- changed when it applies.
--
-- MERGE IS APPLY. Merging this file applies it to the PRODUCTION database within
-- about two minutes (CLAUDE.md 8.0, ruling R-124). No function signature changes,
-- so the deployed build keeps working in that window.
--
-- PROVEN BEFORE MERGE by `npm run check:migrations`, which applies it to a
-- throwaway postgres and runs
-- scripts/poc-free/local-db/assertions/0083_outbound_issue_reference_lock.sql
-- beside the 0082 assertions, which must stay green.

begin;


-- ===========================================================================
-- THE GUARD
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
  'Cards P3-266 (0082) and P3-274 (0083). BEFORE INSERT OR UPDATE on public.outbound_issues, for a signed-in caller (owner included; a server role with no identity is not guarded). On UPDATE refuses any change of issue_mode, client_id, project_id, created_by, reference, issued_at, pickup_date, created_at or id, and any change of status or shipped_at other than awaiting_shipment to shipped made inside public.ship_outbound_issue (transaction-local flag rc.outbound_ship equal to the row id); updated_at stays free for its own trigger. On INSERT refuses a row the two doors would not write: created_by not the caller (an empty one is filled with the caller), a status other than awaiting_shipment, a project slip without a project or with a client or pickup date, a walk-in slip without a client or pickup date or with a project. Closes the direct PATCH that retyped a walk-in sale as a project sale and the one that renumbered or redated a saved slip.';

revoke all on function public.outbound_issues_guard() from public;
revoke all on function public.outbound_issues_guard() from anon;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: the trigger outbound_issues_guard, enabled, BEFORE INSERT OR UPDATE;
-- the function body names reference and issued_at.

select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.outbound_issues'::regclass and not tgisinternal
order by tgname;

select p.proname, position('old.reference' in p.prosrc) > 0 as guards_reference
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'outbound_issues_guard';
