-- 0057_lead_follow_up_date_cleared.sql
-- RC Inventory phase 3, card P3-88, the platform owner's report of 2026-09-22.
-- Leaving De reluat clears the follow-up date, and "Întârziat" is shown only on a
-- lead that is still at De reluat.
--
-- WHAT IT CHANGES, AND IT REMOVES NOTHING
--
--   function  public.set_client_stage(uuid, client_stage, date, boolean)   body only
--   function  public.search_clients_by_stage(...)                          overdue only
--
-- Both are `create or replace` with the SAME signature, the same return type and
-- the same grant, so every caller keeps working and PostgREST sees no new
-- overload. NO ALTER TABLE, NO UPDATE, NO DELETE, NO DROP AND NO TRUNCATE RUN IN
-- THIS FILE. No stored row changes when it lands: a lead that left De reluat
-- before today keeps the date it has, and only stops being marked late.
--
-- WHY. Max, 2026-09-22, quoted: "when you move a lead from De reluat to În
-- cultivare or Ofertat, the date is not cleared and it says it is late."
--
-- THIS CORRECTS A DECISION 0039 AND 0040 RECORDED AS DELIBERATE, and their text
-- is left exactly where it is. 0039, section 3, read:
--
--   "NULLABLE, AND NOT CLEARED WHEN THE STAGE MOVES ON. It is required only while
--    the stage is follow_up. Leaving De reluat keeps the date, because deleting a
--    value somebody typed is not this card's decision."
--
-- and its writer: "THE DATE PARAMETER MAY BE NULL AND NULL MEANS "KEEP THE ONE
-- STORED". That is how leaving De reluat keeps its date without the caller having
-- to send it back." 0040, section 6: "A date on a lead that has left De reluat
-- still sorts, because a date somebody set is still a promise." The decision was
-- not 0039's to take, as 0039 itself said, and the owner has now taken it the
-- other way: the date belongs to De reluat, and leaving De reluat ends it.
--
-- 1. THE WRITER. One condition is added to the stage-change branch of the
--    four-parameter body, which is the one body that writes clients.stage (the
--    three-parameter form delegates to it since 0040 and is not touched here):
--
--      moving FROM follow_up TO any other stage, with NO date passed
--        -> the stored date is set to null
--
--    Everything else is 0040 line for line:
--      - a date passed is stored, at any stage, leaving De reluat included
--      - the same stage writes no history row, and a null date there keeps the
--        stored one (a double click is not an event and not a clearing)
--      - a move that does not START at follow_up keeps the stored date when none
--        is passed
--      - follow_up with no date passed and none stored fails on
--        clients_follow_up_date_required, 23514, unchanged; moving BACK to De
--        reluat after a clearing therefore needs a date again, which is the point
--      - p_first is unchanged, because a first stage has no "from"
--
-- WHY IN THE BODY AND NOT A FIFTH PARAMETER. A null cannot mean "clear" for every
-- caller, but it CAN mean "clear" for exactly one transition, and the function
-- already knows the stage it is moving from. A fifth parameter would be a third
-- overload of the same name, with the PGRST203 care 0040 took for p_first, and
-- the application would have to call a signature that does not exist during the
-- two minutes between the code landing and this file landing (CLAUDE.md 8.0).
-- In the body, the application keeps calling the three-parameter form it calls
-- today: before this file lands a null keeps the date, as today, and after it the
-- date clears. No window where a save fails.
--
-- 2. THE LIST. `overdue` is true only when the row is AT follow_up and its date
--    is before today in Europe/Chisinau. The Chisinau comparison, the sort, the
--    views, the stage filter and every other column are unchanged. A date left on
--    a lead at another stage (every lead that left De reluat before this file,
--    and a lead created at another stage with a date typed) still shows and still
--    sorts; it is no longer called late.
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124.
--
-- IT RUNS AS ONE TRANSACTION and IS safe to run twice: it only replaces two
-- function bodies.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs every assertion file,
-- scripts/poc-free/local-db/assertions/0057_lead_follow_up_date_cleared.sql
-- among them.

begin;


-- ===========================================================================
-- 1. THE STAGE WRITER: LEAVING DE RELUAT WITH NO DATE CLEARS THE DATE
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
  v_from      public.client_stage;
  v_date      date;
  v_next_date date;
begin
  select c.stage, c.follow_up_date into v_from, v_date
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
  if v_from = 'follow_up' and p_follow_up_date is null then
    v_next_date := null;
  end if;

  update public.clients
     set stage = p_stage,
         follow_up_date = v_next_date
   where id = p_client_id;

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, changed_by, created_at)
  values
    ('client', p_client_id, v_from::text, p_stage::text, auth.uid(), clock_timestamp());

  return query select true, v_from;
end;
$$;

comment on function public.set_client_stage(uuid, public.client_stage, date, boolean) is
  'The one writer of clients.stage. With p_first false it moves a client to a stage and writes the status_history row in the same transaction: the same stage writes no row and a null date there keeps the stored one; a date passed is stored at any stage; since 0057 (card P3-88, the owner''s decision of 2026-09-22) a move AWAY from follow_up with no date passed clears the stored date, where 0039 and 0040 kept it; De reluat with no date fails on 23514. With p_first true it records the stage a new lead was created at, with from_status null, and refuses if the client already has any stage history. p_first has no default on purpose: with one, a three-argument call would be ambiguous against the three-parameter form. THE STAGE IS NOT A STATE MACHINE.';

grant execute on function public.set_client_stage(uuid, public.client_stage, date, boolean) to authenticated;

-- The three-parameter form still delegates to the body above with p_first false,
-- so it clears in the same case. Its own comment is brought up to date; its
-- signature, body and grant from 0039 and 0040 are not touched.
comment on function public.set_client_stage(uuid, public.client_stage, date) is
  'Moves a client to a lifecycle stage and writes its public.status_history row in the same transaction. Since 0040 it delegates to set_client_stage(uuid, client_stage, date, boolean) with p_first false, so one body writes the stage. The same stage writes no row and returns changed=false, and a null follow-up date there keeps the stored one; since 0057 (card P3-88) a move away from De reluat with a null date clears the stored date; De reluat with no date fails on 23514. THE STAGE IS NOT A STATE MACHINE: any stage may follow any other.';


-- ===========================================================================
-- 2. THE LIST: LATE ONLY AT DE RELUAT
-- ===========================================================================
--
-- The body is 0040's with one expression changed, `overdue`. Nothing else in it
-- moves: the sort still puts every dated lead in date order, whatever its stage.

create or replace function public.search_clients_by_stage(
  p_q      text    default '',
  p_type   text    default null,
  p_status text    default 'active',
  p_view   text    default null,
  p_stage  text    default null,
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  id              uuid,
  name            text,
  type            public.client_type,
  phone           text,
  active          boolean,
  stage           public.client_stage,
  follow_up_date  date,
  overdue         boolean,
  active_projects bigint,
  total_count     bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with viewed as (
    select m.id, m.name, m.type, m.phone, m.active, m.stage, m.follow_up_date
    from public.match_clients(p_q, p_type, p_status) m
    where
      (p_view is distinct from 'leaduri' or m.stage <> 'client')
      and (p_view is distinct from 'clienti' or m.stage = 'client')
      and (p_stage is null or p_stage = '' or m.stage::text = p_stage)
  ),
  chisinau as (
    select (now() at time zone 'Europe/Chisinau')::date as today
  )
  select
    v.id,
    v.name,
    v.type,
    v.phone,
    v.active,
    v.stage,
    v.follow_up_date,
    coalesce(v.stage = 'follow_up' and v.follow_up_date < k.today, false) as overdue,
    (
      select count(*)
      from public.projects p
      where p.client_id = v.id and p.active and p.status <> 'closed'
    ) as active_projects,
    count(*) over () as total_count
  from viewed v
  cross join chisinau k
  order by
    case when p_view = 'leaduri' then v.follow_up_date end asc nulls last,
    lower(v.name),
    v.id
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0)
$$;

comment on function public.search_clients_by_stage(text, text, text, text, text, integer, integer) is
  'The Clienti list with its two views, card P3-45. p_view leaduri is every stage except client, ordered by follow-up date ascending with no date last, which puts the oldest overdue first; p_view clienti is stage client; anything else is every row by name, as 0020. p_stage narrows to one stage token. overdue is a row at stage follow_up whose follow-up date is before today in Europe/Chisinau, not UTC; since 0057 (card P3-88) a date on a row at any other stage is never overdue. The search is match_clients, shared with client_stage_counts. SECURITY INVOKER.';

grant execute on function public.search_clients_by_stage(text, text, text, text, text, integer, integer) to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: both forms of set_client_stage, unchanged in number and signature, and
-- search_clients_by_stage with its seven parameters.

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_client_stage', 'search_clients_by_stage')
order by p.proname, arguments;
