-- 0021_projects_search_and_status.sql
-- RC Inventory phase 3, card P3-07. The Proiecte list, and the status writer
-- P3-03 deliberately left for this card.
--
-- TWO FUNCTIONS, AND THE SECOND ONE IS A DEBT BEING PAID. P3-03 created
-- public.projects and added 'project' to public.status_entity so a project
-- status change could be recorded, and then did NOT write those rows: writing
-- them is a screen concern and P3-03 was a schema card. It wrote the requirement
-- onto this card instead, with the function to copy and the warning below.
--
-- THE CONVENTION IS ALREADY IN THIS SCHEMA AND IS COPIED, NOT INVENTED.
-- public.set_inbound_status in 0003 and public.set_outbound_status in 0004 both
-- write the status change and its history row together inside one SQL function,
-- SECURITY INVOKER so RLS still applies. set_project_status is the third of
-- them and is the same shape.
--
-- NOTHING AT THE DATABASE FORCES THE SCREEN TO USE IT. A direct UPDATE bypasses
-- it, which is why 0001's comment on status_history says a status that changes
-- without a row here is a defect that the P2-04 and P2-05 acceptance lines CHECK
-- FOR. This card does the same: projects.spec asserts the history row exists
-- after a status change, rather than assuming the function is the only path.
-- IF A LATER CARD ADDS A TRIGGER, THIS FUNCTION MUST STOP INSERTING, or every
-- change is recorded twice.
--
-- NOT APPLIED TO PRODUCTION BY THIS PULL REQUEST. The apply is card P3-27.

begin;


-- ===========================================================================
-- 1. THE LIST
-- ===========================================================================
--
-- Same shape and the same reasons as public.search_clients in 0020: the fold
-- cannot be expressed as a PostgREST filter, the total travels with the page as
-- a window function so the footer cannot disagree with the list, and the joined
-- client name comes back in the same pass rather than as a second query.
--
-- THE STATUS FILTER TAKES AN ARRAY, not a single value, because the default is
-- FOUR of the six stages. P3-07: a list that opens showing every closed job from
-- two years ago is the exact failure the density doctrine exists to stop. The
-- screen sends the four live stages by default and all six for "toate".

create or replace function public.search_projects(
  p_q         text    default '',
  p_statuses  text[]  default null,
  p_client_id uuid    default null,
  p_limit     integer default 25,
  p_offset    integer default 0
)
returns table (
  id               uuid,
  name             text,
  address          text,
  status           public.project_status,
  planned_end_date date,
  budget_mdl       numeric,
  client_id        uuid,
  client_name      text,
  total_count      bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered as (
    select p.id, p.name, p.address, p.status, p.planned_end_date, p.budget_mdl,
           p.client_id, c.name as client_name
    from public.projects p
    join public.clients c on c.id = p.client_id
    where p.active
      and (
        p_statuses is null
        or cardinality(p_statuses) = 0
        or p.status::text = any (p_statuses)
      )
      and (p_client_id is null or p.client_id = p_client_id)
      and (
        p_q is null or btrim(p_q) = ''
        -- NAME AND ADDRESS, which is what P3-07 names. The client name is
        -- deliberately NOT searched here: the client filter is a separate
        -- control and folding both into one box would make "Bloc A" for one
        -- client indistinguishable from a client called "Bloc A".
        or public.fold_text(p.name)                like '%' || public.fold_text(p_q) || '%'
        or public.fold_text(coalesce(p.address, '')) like '%' || public.fold_text(p_q) || '%'
      )
  )
  select
    f.id, f.name, f.address, f.status, f.planned_end_date, f.budget_mdl,
    f.client_id, f.client_name,
    count(*) over () as total_count
  from filtered f
  order by lower(f.name), f.id
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0)
$$;

comment on function public.search_projects(text, text[], uuid, integer, integer) is
  'The P3-07 Proiecte list: a search box over project name and address folded with public.fold_text, a status filter taking an ARRAY because the default is four of the six stages rather than all of them, a client filter, pagination, the joined client name, and the total for the filtered set as a window function. SECURITY INVOKER, so RLS applies unchanged.';

grant execute on function public.search_projects(text, text[], uuid, integer, integer) to authenticated;


-- ===========================================================================
-- 2. THE STATUS WRITER
-- ===========================================================================
--
-- The change and its history row in ONE transaction, so a status that moved
-- without a record is impossible through this path.
--
-- IT RETURNS THE PREVIOUS STATUS, so the caller can say what changed without a
-- read-then-write race: reading the old value first and updating second means
-- two people moving the same project record a history that lies about the order.
--
-- SETTING THE SAME STATUS TWICE WRITES NOTHING AND IS NOT AN ERROR. A double
-- click on a dropdown is not an event, and a history full of
-- "contract -> contract" rows is a history nobody reads.

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
  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by, created_at)
  values
    ('project', p_project_id, v_from::text, p_status::text, p_note, auth.uid(), clock_timestamp());

  return query select true, v_from;
end;
$$;

comment on function public.set_project_status(uuid, public.project_status, text) is
  'Moves a project to a new status and writes its public.status_history row in the same transaction, the same shape as set_inbound_status in 0003 and set_outbound_status in 0004. Returns the previous status so the caller need not read it first, which would race. Setting the SAME status writes nothing and returns changed=false: a double click is not an event. THE PIPELINE IS NOT A STATE MACHINE (P3-03): any status may follow any other, because real construction work goes backwards.';

grant execute on function public.set_project_status(uuid, public.project_status, text) to authenticated;


-- ===========================================================================
-- 3. THE HISTORY OF ONE PROJECT
-- ===========================================================================
--
-- status_history is polymorphic, so reading it needs the entity_type filter
-- every time. One function means one place that filter can be forgotten.

create or replace function public.project_status_history(p_project_id uuid)
returns table (
  from_status text,
  to_status   text,
  note        text,
  created_at  timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select h.from_status, h.to_status, h.note, h.created_at
  from public.status_history h
  where h.entity_type = 'project' and h.entity_id = p_project_id
  order by h.created_at desc, h.id desc
$$;

comment on function public.project_status_history(uuid) is
  'The status history of one project, newest first. status_history is polymorphic across entity kinds, so every read needs the entity_type filter; one function is one place it can be forgotten rather than one per screen.';

grant execute on function public.project_status_history(uuid) to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('search_projects', 'set_project_status', 'project_status_history')
order by p.proname;
