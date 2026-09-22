-- 0058_client_next_action.sql
-- RC Inventory phase 3, card P3-89, the platform owner's goal G44 of 2026-09-22.
-- "Următorul pas": every lead and client can carry a next step, a date and one
-- line of text, and the Leaduri list shows it and sorts by it.
--
-- WHAT IT ADDS, AND IT CHANGES AND REMOVES NOTHING
--
--   column    public.clients.next_action_at   date, nullable, no default
--   column    public.clients.next_action      text, nullable, no default
--   function  public.search_clients_next_action(...)   new, seven parameters
--
-- NO UPDATE, NO DELETE, NO DROP AND NO TRUNCATE RUN IN THIS FILE. No existing
-- column, function, grant or row is touched: every lead and client reads null in
-- both new columns until somebody writes a next step.
--
-- WHY. Max, 2026-09-22, quoted: "Next step on every lead and client. Two new
-- nullable columns on public.clients: next_action_at date and next_action text
-- (one line, e.g. 'trimit oferta'). Shown and editable on the lead page and the
-- client page, right under the stage, as 'Următorul pas' with a date box and a
-- text box; the Leaduri list shows it and sorts by it when set (the existing
-- follow_up_date stays the De reluat rule; next_action_at is the general one, and
-- when a lead is in De reluat the two dates are the same box: setting one sets
-- both)."
--
-- 1. THE COLUMNS. Nullable, no default and NO CHECK, unlike follow_up_date: no
--    stage requires a next step. follow_up_date keeps every rule 0039, 0040 and
--    0057 gave it; this file does not name it except to read it in the sort.
--    "The same box" at De reluat is the application's rule (the edit sheet has
--    one date box at that stage and the save stores it in both columns), not a
--    trigger here: a trigger would be a second writer of follow_up_date beside
--    set_client_stage, which 0039 made the only one.
--
-- 2. THE LIST, AS A NEW FUNCTION AND NOT A REPLACED ONE. The goal needs the two
--    columns in the list's own result, because the list sorts by the date and a
--    sort has to happen before limit and offset. search_clients_by_stage cannot
--    gain output columns by `create or replace`: PostgreSQL refuses to change a
--    function's return type that way, and the only route is DROP FUNCTION and
--    create again. That route is refused here on purpose:
--      - check:removal-safety reads a pending migration's DROP FUNCTION as a
--        removal and refuses while deployed code still calls the name, which
--        lib/data/clients.ts does, rightly;
--      - a drop and create of the same name leaves the application calling the
--        new shape before its code has landed, or the old code calling it after.
--    A new name is additive. The application calls it only once the schema gate
--    hasClientNextAction sees the columns, which arrive in this same transaction,
--    and until then it keeps calling search_clients_by_stage exactly as today.
--    search_clients_by_stage (0040, 0057) is left exactly as it is.
--
--    THE BODY IS 0057's search_clients_by_stage LINE FOR LINE, with three
--    differences and no others:
--      - two more output columns, next_action_at and next_action, after
--        follow_up_date;
--      - the viewed rows carry the two columns through;
--      - the Leaduri sort key is coalesce(next_action_at, follow_up_date) where
--        0057 had follow_up_date. A lead with a next step sorts by its date; a
--        lead without one sorts by its follow-up date exactly as today; a lead
--        with neither is last. The goal says "sorts by it when set", and the
--        fallback is what keeps today's order for every lead already at De
--        reluat, which reads null in next_action_at until it is next saved,
--        because this file writes no row.
--    The seven parameters, the two views, the stage filter, `overdue` with its
--    Chisinau date and its follow_up-only rule from 0057, the project count, the
--    total and the paging are 0057's.
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124.
--
-- IT RUNS AS ONE TRANSACTION and IS safe to run twice: `add column if not
-- exists` and `create or replace`.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs every assertion file,
-- scripts/poc-free/local-db/assertions/0058_client_next_action.sql among them.

begin;


-- ===========================================================================
-- 1. THE TWO COLUMNS
-- ===========================================================================

alter table public.clients
  add column if not exists next_action_at date,
  add column if not exists next_action    text;

comment on column public.clients.next_action_at is
  'Card P3-89. The date of the next step with this lead or client, Următorul pas. Nullable, no rule by stage. At De reluat the application stores the follow-up date here too, because the edit sheet has one date box at that stage (the owner''s words: setting one sets both).';

comment on column public.clients.next_action is
  'Card P3-89. The next step in one line of words, for example "trimit oferta". Nullable.';


-- ===========================================================================
-- 2. THE LIST WITH THE NEXT STEP
-- ===========================================================================

create or replace function public.search_clients_next_action(
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
  next_action_at  date,
  next_action     text,
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
    select m.id, m.name, m.type, m.phone, m.active, m.stage, m.follow_up_date,
           c.next_action_at, c.next_action
    from public.match_clients(p_q, p_type, p_status) m
    join public.clients c on c.id = m.id
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
    v.next_action_at,
    v.next_action,
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
    case when p_view = 'leaduri' then coalesce(v.next_action_at, v.follow_up_date) end asc nulls last,
    lower(v.name),
    v.id
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0)
$$;

comment on function public.search_clients_next_action(text, text, text, text, text, integer, integer) is
  'Card P3-89. search_clients_by_stage (0040, 0057) with the next step: the same seven parameters, views, stage filter, overdue and paging, plus next_action_at and next_action in the result. p_view leaduri is ordered by the next step date, else the follow-up date, ascending with no date last. A new name rather than a replaced function, because adding output columns needs a drop and the application calls the old name until hasClientNextAction sees this file. SECURITY INVOKER.';

grant execute on function public.search_clients_next_action(text, text, text, text, text, integer, integer) to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: the two columns, both nullable; the old list and the new list, each
-- with seven parameters.

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'clients'
  and column_name in ('next_action_at', 'next_action')
order by column_name;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('search_clients_by_stage', 'search_clients_next_action')
order by p.proname;
