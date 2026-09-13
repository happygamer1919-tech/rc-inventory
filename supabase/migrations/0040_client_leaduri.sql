-- 0040_client_leaduri.sql
-- RC Inventory phase 3, card P3-45. The Leaduri list and the add-lead form: how
-- a lead came in, what it wants, who on the team owns it, the first stage it was
-- given, and one list query that filters by stage and puts overdue follow-ups
-- first.
--
-- WHAT IT ADDS, AND IT REMOVES NOTHING
--
--   type      public.client_source                five values, recomandare to altul
--   column    public.clients.source               client_source, nullable
--   column    public.clients.interest             text, nullable
--   column    public.clients.owner_id             uuid, nullable, references auth.users
--   index     clients_owner_id_idx
--   function  public.set_client_stage(uuid, client_stage, date, boolean)   the writer
--   function  public.set_client_stage(uuid, client_stage, date)           now delegates to it
--   function  public.match_clients()              the one search predicate
--   function  public.search_clients_by_stage()    the list, with views and stage
--   function  public.client_stage_counts()        the count per stage
--
-- NO UPDATE, NO DELETE, NO DROP AND NO TRUNCATE RUN IN THIS FILE. Every existing
-- row gets null in the three new columns, which is the truth about it: nobody
-- recorded a source, an interest or an owner for a client that already exists.
--
-- A LEAD IS STILL A CLIENT WITH A STAGE, NOT A SECOND TABLE. The owner's
-- handover, part 4.1, and card P3-43, which put the stage on public.clients.
-- Leaduri is /clienti filtered to every stage except `client`, and Clienti is
-- /clienti filtered to `client` (handover 4.3). Both views read this file's one
-- list function, so the two cannot drift apart.
--
-- CONTACT PERSON IS NOT A COLUMN. It is a row in public.contacts (0014), written
-- by the application through the contact action that already exists.
--
-- NO MONEY. A lead carries no deal value and no currency, handover 4.7.
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. The application code
-- that reads the new columns and calls the new functions ships in the same merge
-- and asks first whether they exist (hasClientLeaduri in
-- lib/data/schema-capability.ts), so the minutes between the code landing and this
-- file landing behave exactly as today. INC-05 is what happens without that
-- question.
--
-- IT RUNS AS ONE TRANSACTION and is NOT safe to run twice: a second run fails on
-- CREATE TYPE and rolls the whole file back.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs
-- scripts/poc-free/local-db/assertions/0040_client_leaduri.sql.

begin;


-- ===========================================================================
-- 1. HOW THE LEAD CAME IN
-- ===========================================================================
--
-- FIVE VALUES, IN THE ORDER THE HANDOVER LISTS THEM, part 4.4: "source
-- (recomandare, telefon, site, vizita, altul)". An enum and not text for the
-- reason 0016 gives for project_status and 0039 gives for the stage: five
-- spellings of one source in a text column is a count that silently misses rows.
-- Stored values are tokens; the Romanian labels, Recomandare, Telefon, Site,
-- Vizită and Altul, live in the presentation layer, which is the P2-01 convention.

create type public.client_source as enum (
  'recomandare',
  'telefon',
  'site',
  'vizita',
  'altul'
);

-- NULLABLE AND WITH NO DEFAULT. A client who arrived before anybody asked has no
-- source, and `altul` would be a claim nobody made.
alter table public.clients add column source public.client_source null;

comment on column public.clients.source is
  'How the lead came in: recomandare, telefon, site, vizita or altul, in the order of the owner''s handover part 4.4. Null when nobody recorded it, which is every client created before 0040.';


-- ===========================================================================
-- 2. WHAT THE LEAD WANTS
-- ===========================================================================
--
-- FREE TEXT, per handover 4.4: "interest as free text". Nothing joins to it and
-- nothing computes on it, the reason 0014 gives for contacts.role.

alter table public.clients add column interest text null;

comment on column public.clients.interest is
  'What the lead wants, in the operator''s words. Free text by the owner''s handover part 4.4. No deal value and no currency: handover 4.7 excludes both.';


-- ===========================================================================
-- 3. WHO ON THE TEAM OWNS IT
-- ===========================================================================
--
-- THE SAME SHAPE AS clients.created_by (0013): a nullable reference to
-- auth.users, set to null if the user goes. The form picks it from active
-- profiles by full name; profiles.id is the auth user id (0001).
--
-- CALLED owner_id AND NOT owner, deliberately. `owner` is already the name of the
-- administrator ROLE in this schema, public.app_role and public.is_owner(), and
-- every RLS policy on this table reads `is_owner()`. A column called `owner` next
-- to those policies would read as a permission when it is an assignment.

alter table public.clients
  add column owner_id uuid null references auth.users (id) on delete set null;

-- Every foreign key gets an index on the referencing side, the rule 0014 writes
-- down: "the leads of this person" is the query this column exists for.
create index clients_owner_id_idx on public.clients (owner_id);

comment on column public.clients.owner_id is
  'The team member who owns this lead, picked from active profiles by full name. Same shape as created_by. Named owner_id and not owner because owner is the administrator role in this schema (app_role, is_owner()).';


-- ===========================================================================
-- 4. THE STAGE WRITER, WIDENED FOR THE FIRST STAGE
-- ===========================================================================
--
-- WHY IT CHANGES. Handover 4.8 line 3, as card P3-45 states it: "Creating a lead
-- writes its first history row, from no stage to the chosen one, with actor and
-- timestamp." set_client_stage from 0039 cannot write that row. It records a
-- MOVE, from the stage stored to the stage asked, and a freshly inserted client
-- already stores `cold` from the column default, so choosing `cold` wrote nothing
-- and choosing `quoted` wrote cold -> quoted.
--
-- WHY IT IS NOT A SECOND FUNCTION. Card P3-43: "THE STAGE IS WRITTEN IN ONE
-- PLACE." Card P3-45: the initial stage and every later stage change go through
-- that function. A second function that writes the stage column is the path both
-- cards refuse. So the writer gains a fourth parameter, and the three-parameter
-- form that the application and the end to end suite already call keeps its exact
-- signature, its exact behaviour and its exact name, and now calls this one.
-- There is one body that writes clients.stage.
--
-- WHY p_first HAS NO DEFAULT, AND IT IS THE WHOLE SAFETY OF THE OVERLOAD. With a
-- default, a call naming only the first three parameters would match both forms,
-- PostgreSQL would refuse it as ambiguous, and PostgREST would refuse it with
-- PGRST203: every stage change in production would fail the minute this file
-- landed. Without one, a three-argument call can only mean the three-parameter
-- form and a four-argument call only this one. The end to end suite proves it,
-- because every existing P3-43 case calls the three-parameter form by name.
--
-- WHY THE EXISTING CLIENT FORM DOES NOT WRITE A FIRST ROW. Card P3-43's case 4
-- creates a client through that form and asserts ZERO history rows, and card
-- P3-45 requires every existing case to pass unmodified. A trigger on insert
-- would break it. The first row is therefore written only when a caller asks for
-- it, which is the add-lead form.
--
-- p_first = true:
--   - refuses, and writes nothing, if the client already has ANY stage history
--     row, so it cannot be used afterwards to invent a "from nothing" entry in the
--     middle of a real history
--   - sets the stage and the date together, the date rule unchanged (null keeps
--     the stored one; De reluat with no date fails on
--     clients_follow_up_date_required, 23514, before the history insert)
--   - writes one history row with from_status NULL, even when the stage is `cold`
--     and equals what the default already stored: the row records that the lead
--     entered the pipeline, not that something moved
--
-- p_first = false: exactly 0039's behaviour, line for line.

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
  'The one writer of clients.stage. With p_first false it moves a client to a stage and writes the status_history row in the same transaction, exactly as 0039 defined it: the same stage writes no row, a null date keeps the stored one, De reluat with no date fails on 23514. With p_first true it records the stage a new lead was created at, with from_status null, and refuses if the client already has any stage history. p_first has no default on purpose: with one, a three-argument call would be ambiguous against the three-parameter form. THE STAGE IS NOT A STATE MACHINE.';

grant execute on function public.set_client_stage(uuid, public.client_stage, date, boolean) to authenticated;

-- THE THREE-PARAMETER FORM KEEPS ITS SIGNATURE, ITS DEFAULT AND ITS RESULT, and
-- only its body changes: it delegates. `create or replace` keeps the same function
-- object, so its grant from 0039 stands. The P3-43 assertions and end to end cases
-- that exercise it run again after this file, which is what proves the delegation
-- changed nothing.
create or replace function public.set_client_stage(
  p_client_id      uuid,
  p_stage          public.client_stage,
  p_follow_up_date date default null
)
returns table (changed boolean, from_stage public.client_stage)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  return query select * from public.set_client_stage(p_client_id, p_stage, p_follow_up_date, false);
end;
$$;

comment on function public.set_client_stage(uuid, public.client_stage, date) is
  'Moves a client to a lifecycle stage and writes its public.status_history row in the same transaction. Since 0040 it delegates to set_client_stage(uuid, client_stage, date, boolean) with p_first false, so one body writes the stage. Behaviour unchanged from 0039: the same stage writes no row and returns changed=false, a null follow-up date keeps the stored one, De reluat with no date fails on 23514. THE STAGE IS NOT A STATE MACHINE: any stage may follow any other.';


-- ===========================================================================
-- 5. THE ONE SEARCH PREDICATE
-- ===========================================================================
--
-- THE SAME FILTER AS public.search_clients IN 0020, written once for the two
-- functions below, so the list and its per-stage counts cannot disagree about
-- which rows a search matches. Card P3-45 acceptance clause 5 asks exactly that
-- the count equal the rows "under the same search and the same active or inactive
-- filter".
--
-- ONE BOX, FOUR COLUMNS, ONE FOLD, as 0020 explains: public.fold_text from 0017,
-- so "tigla" finds "Țiglă". Status defaults to active and anything unknown behaves
-- as active, as 0020 does.
--
-- THE TYPE IS COMPARED AS TEXT, which is the one difference from 0020, and it
-- only changes what happens to a type that does not exist: 0020 casts the
-- parameter and raises on a bad value, this matches no row. The application
-- never sends a bad value; a stale link should show an empty list, not an error.
--
-- 0020's search_clients IS NOT DROPPED AND NOT CHANGED. The application calls it
-- until the capability probe sees this file, which is the two minute window
-- 8.0 describes, and a DROP would turn that window into an outage.
--
-- SECURITY INVOKER, so RLS applies exactly as to a direct select.

create or replace function public.match_clients(
  p_q      text default '',
  p_type   text default null,
  p_status text default 'active'
)
returns setof public.clients
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select c.*
  from public.clients c
  where
    (
      p_status = 'toate'
      or (p_status = 'inactive' and c.active = false)
      or (p_status not in ('toate', 'inactive') and c.active = true)
    )
    and (p_type is null or p_type = '' or c.type::text = p_type)
    and (
      p_q is null or btrim(p_q) = ''
      or public.fold_text(c.name)                      like '%' || public.fold_text(p_q) || '%'
      or public.fold_text(coalesce(c.fiscal_code, '')) like '%' || public.fold_text(p_q) || '%'
      or public.fold_text(coalesce(c.phone, ''))       like '%' || public.fold_text(p_q) || '%'
      or public.fold_text(coalesce(c.email, ''))       like '%' || public.fold_text(p_q) || '%'
    )
$$;

comment on function public.match_clients(text, text, text) is
  'The client search predicate of 0020 written once: one folded box over name, IDNO, phone and email, a type, and a status defaulting to active. Read by search_clients_by_stage and client_stage_counts, so the Leaduri list and its counts match the same rows. SECURITY INVOKER.';

grant execute on function public.match_clients(text, text, text) to authenticated;


-- ===========================================================================
-- 6. THE LIST, WITH ITS TWO VIEWS AND ITS STAGE FILTER
-- ===========================================================================
--
-- p_view:
--   'leaduri'  every stage except client, ordered by follow-up date
--   'clienti'  stage client only
--   anything else, null included: every row, exactly as 0020's list, by name
--
-- THE TWO VIEWS PARTITION THE CLIENTS. A row is at `client` or it is not, and
-- stage is NOT NULL (0039), so no row falls in both or in neither. Handover 4.8
-- line 7.
--
-- p_stage narrows to one stage token. It is compared as text, so a stale link
-- carrying a token that does not exist shows an empty list instead of an error.
--
-- ORDER IN THE LEADURI VIEW, per card P3-45's defaults: overdue first, the oldest
-- at the top; then leads with an upcoming follow-up date, soonest first; then
-- leads with no date, by name. THAT IS ONE ASCENDING SORT ON THE DATE, nulls
-- last: every overdue date is before today, every upcoming one is today or later,
-- so ascending order already puts the oldest overdue first and the soonest
-- upcoming right after the last overdue one. A date on a lead that has left De
-- reluat still sorts, because a date somebody set is still a promise.
--
-- OVERDUE IS COMPUTED IN CHISINAU, NOT IN UTC. A follow-up date is a calendar day
-- in Moldova, and `current_date` is the server's day, which is UTC on Supabase.
-- Between midnight and three in the morning in Chisinau the two disagree, and a
-- UTC comparison would call a lead due today "not yet due" or one due yesterday
-- "due today". Today is `now() at time zone 'Europe/Chisinau'`, cast to a date. A
-- lead due today is due, not overdue. The flag is returned so the screen marks
-- the row without doing date arithmetic in a browser that may not be in Moldova.
--
-- THE TOTAL COMES WITH EVERY PAGE and the open-project count in the same pass,
-- for the reasons 0020 gives.

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
    coalesce(v.follow_up_date < k.today, false) as overdue,
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
  'The Clienti list with its two views, card P3-45. p_view leaduri is every stage except client, ordered by follow-up date ascending with no date last, which puts the oldest overdue first; p_view clienti is stage client; anything else is every row by name, as 0020. p_stage narrows to one stage token. overdue is a follow-up date before today in Europe/Chisinau, not UTC. The search is match_clients, shared with client_stage_counts. SECURITY INVOKER.';

grant execute on function public.search_clients_by_stage(text, text, text, text, text, integer, integer) to authenticated;


-- ===========================================================================
-- 7. THE COUNT PER STAGE
-- ===========================================================================
--
-- ALL FIVE STAGES, ALWAYS, IN STAGE ORDER, zero included. A stage with no row is
-- a zero on the screen and not a missing chip, and enum_range is the declared
-- order, so the counts come back in the order the chips are drawn.
--
-- UNDER THE SEARCH, TYPE AND STATUS, AND NOT UNDER THE VIEW OR THE STAGE. The
-- number beside a chip says how many rows that chip would show, which does not
-- change when a different chip is selected.
--
-- A SEPARATE CALL AND NOT A WINDOW ON THE LIST, because a page with no rows has no
-- row to carry a window, and the counts are exactly what an empty filtered page
-- still needs to show.

create or replace function public.client_stage_counts(
  p_q      text default '',
  p_type   text default null,
  p_status text default 'active'
)
returns table (stage public.client_stage, total bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select s.stage, count(m.id)
  from unnest(enum_range(null::public.client_stage)) as s (stage)
  left join public.match_clients(p_q, p_type, p_status) m on m.stage = s.stage
  group by s.stage
  order by s.stage
$$;

comment on function public.client_stage_counts(text, text, text) is
  'How many clients are at each of the five stages under a search, a type and a status, zero included, in stage order. Card P3-45: the count row at the top of the Leaduri view. Not narrowed by view or stage, so a chip''s number is what that chip would show.';

grant execute on function public.client_stage_counts(text, text, text) to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: the five sources in order; the three columns on public.clients, all
-- nullable; the owner_id foreign key; both forms of set_client_stage; and the
-- three read functions.

select e.enumlabel, e.enumsortorder
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public' and t.typname = 'client_source'
order by e.enumsortorder;

select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'clients'
  and column_name in ('source', 'interest', 'owner_id')
order by column_name;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.clients'::regclass and contype = 'f'
order by conname;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_client_stage', 'match_clients', 'search_clients_by_stage', 'client_stage_counts')
order by p.proname, arguments;
