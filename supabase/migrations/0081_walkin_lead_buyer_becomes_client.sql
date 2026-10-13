-- 0081_walkin_lead_buyer_becomes_client.sql
-- RC Inventory phase 3, card P3-262. A walk-in buyer who is still a lead can be
-- picked on Iesiri materiale, and the same save that records the sale moves the
-- record to stage client, for the owner and for the account manager.
--
-- WHAT FOUND IT. The 2026-10-10 bug check. Card P3-196 limited the walk-in
-- buyer picker to stage client. An account manager cannot change a stage
-- (clients_update is owner only, and set_client_stage is SECURITY INVOKER, so
-- it runs under that policy), so a buyer who already existed as a lead could not
-- be picked at all, and "+ Client nou" made a duplicate or was refused on IDNO.
--
-- THE OWNER'S DECISION, Max, 2026-10-10 (factory mailbox, the counter buyer is
-- a lead): "yes do the lead option". Leads show in the picker marked "Lead";
-- picking one sells to that record and moves it to Client inside the same save.
--
-- WHAT IT ADDS, AND IT REMOVES NOTHING
--
--   function public.walkin_lead_becomes_client(uuid)   NEW, SECURITY DEFINER
--   function public.create_direct_client_issue(text, jsonb, uuid, date)
--                                                      body only, same signature
--
-- HOW THE STAGE MOVES. create_direct_client_issue writes the slip and takes the
-- stock exactly as before, then calls walkin_lead_becomes_client with the id of
-- the slip it has just written. That function:
--
--   1. refuses a caller who is signed in but is not an active owner or account
--      manager (42501). A caller with no identity at all is a server role, the
--      convention of outbound_issue_take_stock since 0075.
--   2. locks the slip and refuses unless it is a direct_client slip, written by
--      this caller, IN THIS SAME TRANSACTION: its created_at, filled by the
--      column default now(), equals now(), which is the start time of the
--      current transaction and is the same inside a savepoint. A slip from any
--      earlier request carries an earlier time. So the function cannot be used
--      on its own to move a lead: without a sale being saved in the same call
--      there is no such slip. (The row's xmin was the other candidate; it is
--      the id of a savepoint when the insert runs inside one, so a caller that
--      wraps the call in an exception block would be refused for no reason.)
--   3. reads the slip's client. Stage client already: nothing happens. A lead
--      (cold, nurture, follow_up or quoted): set_client_stage moves it to client
--      and writes ONE status_history row, lead stage to client. set_client_stage
--      stays the one writer of clients.stage (0039, 0057, 0060): the follow-up
--      date rules of 0057 and 0060 apply here exactly as on the owner's screen.
--
-- ONE TRANSACTION. The slip, its lines, the stock check, the slip's history row,
-- the stage and the client's history row are written by one RPC call, so if
-- anything fails the lead keeps its stage and no slip exists.
--
-- WHAT IT DOES NOT CHANGE. clients_update stays owner only; set_client_stage
-- keeps its body, its grants and its owner-only effect for every other caller;
-- clients_insert, the 0079 trigger, contacts and notes are untouched. The
-- project door, create_outbound_issue, is untouched. No existing row is read,
-- changed or cancelled when this file applies.
--
-- WHAT IT REMOVES: nothing. There is NO DROP TABLE, NO TRUNCATE, NO DELETE, NO
-- DROP of any kind and NO UPDATE or INSERT of a row anywhere in this file.
--
-- MERGE IS APPLY. Merging this file applies it to the PRODUCTION database within
-- about two minutes, through the Supabase GitHub app (CLAUDE.md 8.0, ruling
-- R-124). create_direct_client_issue keeps its four argument signature, so the
-- deployed build keeps working in that window; the deployed picker still shows
-- clients only, and a slip to a client changes no stage.
--
-- IT RUNS AS ONE TRANSACTION and is safe to run twice: two `create or replace`.
--
-- PROVEN BEFORE MERGE by `npm run check:migrations`, which applies it unmodified
-- to a throwaway postgres and runs
-- scripts/poc-free/local-db/assertions/0081_walkin_lead_buyer_becomes_client.sql,
-- and on the local Supabase stack by tests/e2e/walkin-buyer-lead.spec.ts.

begin;


-- ===========================================================================
-- 1. THE LEAD BECOMES CLIENT, ONLY THROUGH A SLIP WRITTEN NOW
-- ===========================================================================

create or replace function public.walkin_lead_becomes_client(p_issue_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode       public.outbound_mode;
  v_client     uuid;
  v_created_by uuid;
  v_now        boolean;
  v_stage      public.client_stage;
begin
  if auth.uid() is not null
     and coalesce(public.current_app_role()::text, '') not in ('owner', 'account_manager') then
    raise exception 'Doar administratorul sau managerul de cont poate vinde la tejghea unui lead.'
      using errcode = '42501';
  end if;

  select oi.issue_mode, oi.client_id, oi.created_by, oi.created_at = now()
    into v_mode, v_client, v_created_by, v_now
  from public.outbound_issues oi
  where oi.id = p_issue_id
  for update;

  if not found then
    raise exception 'Ieșirea nu mai există. Reîncarcă pagina.' using errcode = 'P0002';
  end if;

  if v_mode <> 'direct_client'
     or v_client is null
     or v_created_by is distinct from auth.uid()
     or not v_now then
    raise exception 'Un lead devine Client la tejghea numai prin bonul de eliberare salvat chiar acum.'
      using errcode = '42501';
  end if;

  select c.stage into v_stage
  from public.clients c
  where c.id = v_client
  for update;

  if not found then
    raise exception 'Clientul ales nu mai există. Reîncarcă pagina și alege din nou.'
      using errcode = 'P0002';
  end if;

  if v_stage = 'client' then
    return false;
  end if;

  perform public.set_client_stage(v_client, 'client'::public.client_stage, null::date, false);
  return true;
end;
$$;

comment on function public.walkin_lead_becomes_client(uuid) is
  'Card P3-262, owner decision of 2026-10-10. Called by public.create_direct_client_issue with the slip it has just written. Refuses a signed-in caller who is not an active owner or account_manager, and refuses unless the slip is a direct_client slip written by this caller in the current transaction (created_at equals now()), so it cannot move a lead without a sale saved in the same call. When the slip''s client is a lead it moves it to client through public.set_client_stage, which writes the one status_history row; a client already at stage client is left alone and the function returns false. SECURITY DEFINER because clients_update is owner only; that policy and set_client_stage are not widened for any other path.';

revoke all on function public.walkin_lead_becomes_client(uuid) from public;
revoke all on function public.walkin_lead_becomes_client(uuid) from anon;
grant execute on function public.walkin_lead_becomes_client(uuid) to authenticated;


-- ===========================================================================
-- 2. THE DIRECT CLIENT DOOR CALLS IT, AFTER THE STOCK IS TAKEN
-- ===========================================================================
--
-- Everything above the last `perform` is 0067 word for word: the same refusals,
-- the same error codes, the same insert. The only new statement is the call to
-- section 1, after the stock is taken, so a refused stock check leaves the lead
-- exactly as it was.

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

comment on function public.create_direct_client_issue(text, jsonb, uuid, date) is
  'Card P3-118, ruling R-215. Creates an outbound issue to a DIRECT CLIENT collecting from the warehouse: a CRM client as a row and never a typed name, a pickup date, and lines. project_id is not named, so the constraint outbound_issues_direct_client_mode_shape can enforce that such a row has none. THE SUBTRACTION IS NOT ITS OWN: it calls the same public.outbound_issue_take_stock the project path runs. NO INVOICE AND NO SALE DOCUMENT EVER COMES OF THIS, by the owner instruction recorded in R-215. CARD P3-262 (0081): after the stock is taken it calls public.walkin_lead_becomes_client, so a buyer who is still a lead becomes a client in the same transaction, with one status_history row; a buyer already at stage client is unchanged.';

grant execute on function public.create_direct_client_issue(text, jsonb, uuid, date) to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: walkin_lead_becomes_client(uuid), SECURITY DEFINER, executable by
-- authenticated and not by anon; create_direct_client_issue still four
-- arguments and SECURITY INVOKER; set_client_stage unchanged, two forms.

select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer,
       pg_catalog.array_to_string(p.proacl, E'\n') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('walkin_lead_becomes_client', 'create_direct_client_issue', 'set_client_stage')
order by p.proname, args;
