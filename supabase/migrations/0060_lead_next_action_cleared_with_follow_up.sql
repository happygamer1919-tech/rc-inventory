-- 0060_lead_next_action_cleared_with_follow_up.sql
-- RC Inventory phase 3, card P3-92, the CRITIC bug sweep of 2026-09-22, finding F3.
-- Leaving De reluat with no date typed clears the next-step DATE as well, but only
-- while that date is still the mirror of the follow-up date the row is leaving.
--
-- WHAT IT CHANGES, AND IT REMOVES NOTHING
--
--   function  public.set_client_stage(uuid, client_stage, date, boolean)   body only
--
-- `create or replace` with the SAME signature, the same return type and the same
-- grant, so every caller keeps working and PostgREST sees no new overload. NO
-- ALTER TABLE, NO NEW COLUMN, NO UPDATE, NO DELETE, NO DROP AND NO TRUNCATE RUN
-- IN THIS FILE. No stored row changes when it lands: a lead that already carries
-- a stale next-step date keeps it until its stage next moves, which is correct.
-- A migration that silently rewrote the next-step date of every real lead would
-- be exactly the data rewrite CLAUDE.md section 8 forbids.
--
-- THE CHAIN, SO A READER SEES ALL FOUR LINKS
--
-- 1. THE OWNER'S DECISION, Max, 2026-09-22, already quoted in 0057's own header:
--
--      "when you move a lead from De reluat to In cultivare or Ofertat, the date
--       is not cleared and it says it is late."
--
-- 2. 0057 (card P3-88) did that, for public.clients.follow_up_date, in the body of
--    this same function: moving FROM follow_up with no date passed sets the stored
--    follow-up date to null.
--
-- 3. 0058 (card P3-89) then added public.clients.next_action_at, the GENERAL
--    next-step date, valid at any stage, and with it the owner's rule that at De
--    reluat the two are one box: "setting one sets both". A lead saved at De reluat
--    with a date gets that same date written into next_action_at as well
--    (lib/data/client-actions.ts, validateNextAction, its second branch).
--
-- 4. THE GAP THE SWEEP FOUND, finding F3 of docs/reports/2026-09-22-critic-bug-sweep.md:
--
--      "Leaving De reluat clears the follow up date but leaves the next step date
--       behind, so the lead comes back on Azi, overdue and in red"
--
--    Step 2 clears one column. Nothing clears the other, because the two are
--    written by two different code paths: follow_up_date only by this function,
--    next_action_at only by the plain clients update behind the form, and the form
--    sends the next-step date only when it DIFFERS from the value it loaded, which
--    in this exact case it does not. The lead then reappears on /azi, overdue, in
--    red, with an empty next-step text, which undoes the owner's decision of point
--    1 on a screen built three cards later.
--
-- WHY IN THIS FUNCTION AND NOT IN THE FORM. set_client_stage is the single writer
-- of clients.stage, the reason 0039 gave for creating it and the reason 0057 put
-- the follow-up clearing here rather than in the application. A rule that lives
-- here cannot be forgotten by a second caller: a test that posts to the RPC, a
-- future bulk-action screen, or any other application path gets it by
-- construction. A rule that lives in one form is a rule the next form has to
-- remember. The application-side change that ships beside this file is about what
-- the operator SEES while the sheet is open, not about the stored truth.
--
-- WHY THE MIRROR GUARD, AND WHY IT IS NOT A BLIND CLEAR. next_action_at is the
-- general date (0058 header, section quoted there: "follow_up_date stays the De
-- reluat rule; next_action_at is the general one"). A lead can carry a next step
-- somebody set deliberately at another stage. Clearing it on every departure from
-- De reluat would erase those. So it is cleared only when it still EQUALS the
-- follow-up date being left behind, which is exactly the value the mirror wrote.
-- Its cost, stated rather than hidden: a next step deliberately set to the same
-- day as the De reluat date is indistinguishable from the mirror and is cleared
-- with it. The row is not destroyed, the operator retypes one date, and the
-- alternative was a fifth parameter, which is a third overload of this name with
-- the PGRST203 care 0040 took for p_first and a two-minute window where the
-- application calls a signature that does not exist (CLAUDE.md 8.0).
--
-- THE NEXT-STEP TEXT IS NOT TOUCHED. public.clients.next_action is a sentence the
-- operator typed. Only the DATE was ever written by the mirror, so only the date
-- is cleared here. "Clear both dates together" is the whole rule.
--
-- EVERY OTHER ARM OF THIS FUNCTION IS 0057 LINE FOR LINE: p_first, the same-stage
-- no-op, a date passed at any stage, the follow_up requires-a-date constraint. The
-- three-parameter form is untouched and still delegates here with p_first false,
-- so it clears in the same case; only its comment is brought up to date. The
-- `overdue` expression in search_clients_by_stage and search_clients_next_action
-- is untouched: this is a fix at the write side, not at the read side.
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124.
--
-- IT RUNS AS ONE TRANSACTION and IS safe to run twice: it only replaces one
-- function body.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs every assertion file,
-- scripts/poc-free/local-db/assertions/0060_lead_next_action_cleared_with_follow_up.sql
-- among them.

begin;


-- ===========================================================================
-- THE STAGE WRITER: LEAVING DE RELUAT ENDS BOTH DATES, WHEN THE SECOND IS
-- STILL THE MIRROR OF THE FIRST
-- ===========================================================================

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

    insert into public.status_history
      (entity_type, entity_id, from_status, to_status, changed_by, created_at)
    values
      ('client', p_client_id, null, p_stage::text, auth.uid(), clock_timestamp());

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

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, changed_by, created_at)
  values
    ('client', p_client_id, v_from::text, p_stage::text, auth.uid(), clock_timestamp());

  return query select true, v_from;
end;
$$;

comment on function public.set_client_stage(uuid, public.client_stage, date, boolean) is
  'The one writer of clients.stage. With p_first false it moves a client to a stage and writes the status_history row in the same transaction: the same stage writes no row and a null date there keeps the stored one; a date passed is stored at any stage; since 0057 (card P3-88, the owner''s decision of 2026-09-22) a move AWAY from follow_up with no date passed clears the stored follow-up date, where 0039 and 0040 kept it; since 0060 (card P3-92, the bug sweep finding F3) the same move also clears clients.next_action_at, but ONLY while it still equals the follow-up date being left, which is the mirror the "setting one sets both" rule of 0058 writes at De reluat: a next step set independently at another stage survives, and clients.next_action, the text, is never cleared here. De reluat with no date fails on 23514. With p_first true it records the stage a new lead was created at, with from_status null, and refuses if the client already has any stage history. p_first has no default on purpose: with one, a three-argument call would be ambiguous against the three-parameter form. THE STAGE IS NOT A STATE MACHINE.';

grant execute on function public.set_client_stage(uuid, public.client_stage, date, boolean) to authenticated;

-- The three-parameter form still delegates to the body above with p_first false,
-- so it clears both dates in the same case. Its own comment is brought up to
-- date; its signature, body and grant from 0039 and 0040 are not touched.
comment on function public.set_client_stage(uuid, public.client_stage, date) is
  'Moves a client to a lifecycle stage and writes its public.status_history row in the same transaction. Since 0040 it delegates to set_client_stage(uuid, client_stage, date, boolean) with p_first false, so one body writes the stage. The same stage writes no row and returns changed=false, and a null follow-up date there keeps the stored one; since 0057 (card P3-88) a move away from De reluat with a null date clears the stored follow-up date, and since 0060 (card P3-92) it clears next_action_at too while that date is still the mirror of the one being left; De reluat with no date fails on 23514. THE STAGE IS NOT A STATE MACHINE: any stage may follow any other.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: both forms of set_client_stage, unchanged in number and signature, and
-- clients.next_action_at still a plain nullable date column.

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'set_client_stage'
order by arguments;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'clients'
  and column_name in ('follow_up_date', 'next_action_at', 'next_action')
order by column_name;
