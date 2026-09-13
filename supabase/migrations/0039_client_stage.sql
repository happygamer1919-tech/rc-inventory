-- 0039_client_stage.sql
-- RC Inventory phase 3, card P3-43. A client carries one of five ordered
-- lifecycle stages, a follow-up date that is required at De reluat, and every
-- stage change is recorded in public.status_history with who and when.
--
-- WHAT IT ADDS, AND IT REMOVES NOTHING
--
--   type      public.client_stage               five values, declared in stage order
--   column    public.clients.stage              not null, default 'cold'
--   column    public.clients.follow_up_date     date, nullable
--   check     clients_follow_up_date_required   a date is required at follow_up
--   function  public.set_client_stage()         the one writer of the stage
--   function  public.client_stage_history()     the one reader of its history
--
-- A LEAD IS A CLIENT WITH A STAGE, NOT A SECOND TABLE. The owner's handover,
-- part 4.1: no leads table and no second detail page. The stage is a column on
-- public.clients.
--
-- THE STAGE IS NOT A STATE MACHINE. Any stage may be set from any other. This
-- follows the precedent in 0016, whose column comment on projects.status reads:
-- "THE PIPELINE IS NOT A STATE MACHINE IN THIS PHASE. Any status may be set from
-- any other." The same holds here and for the same reason: a quoted lead goes
-- quiet and is worked again, and a client comes back as a lead for a new job. The
-- path taken is recoverable from public.status_history instead.
--
-- EVERY CLIENT THAT EXISTS BEFORE THIS FILE BECOMES 'client', AND THE FILE PROVES
-- IT ON ITSELF. Handover 4.2: "Existing client rows get stage client in the
-- migration. They are already customers." The column is added NOT NULL with the
-- default 'client', which fills every existing row in that one statement; a DO
-- block straight after it raises if any row carries anything else, the
-- self-asserting shape 0021 and 0026 already use; and only then is the default
-- moved to 'cold', so a client created afterwards starts as a cold lead. NO
-- UPDATE RUNS AND NO ROW IS REMOVED.
--
-- IT DEPENDS ON 0038 having added 'client' to public.status_entity, in a file of
-- its own, for the transaction reason written there.
--
-- IT RUNS AS ONE TRANSACTION and is NOT safe to run twice: a second run fails on
-- CREATE TYPE and rolls the whole file back.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs
-- scripts/poc-free/local-db/assertions/0039_client_stage.sql.
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. The application code
-- that reads the new columns ships in the same merge and asks first whether they
-- exist (hasClientStage in lib/data/schema-capability.ts), so the minutes between
-- the code landing and this file landing behave exactly as today. INC-05 is what
-- happens without that question.

begin;


-- ===========================================================================
-- 1. THE STAGE ENUM
-- ===========================================================================
--
-- FIVE VALUES, IN THIS ORDER, AND THE ORDER IS THE STAGE ORDER. A postgres enum
-- sorts by declaration, so `order by stage` returns cold, nurture, follow_up,
-- quoted, client. The alphabetical order of the tokens (client, cold, follow_up,
-- nurture, quoted) and of the Romanian labels are both different, and the
-- assertions file checks against that difference rather than assuming it.
--
-- An enum and not text, for the reason 0016 gives for project_status: five
-- spellings of follow_up in a text column is a filter that silently misses rows.
-- Stored values are English tokens. The Romanian labels, Lead rece, În cultivare,
-- De reluat, Ofertat and Client, live in the presentation layer, which is the
-- P2-01 convention.

create type public.client_stage as enum (
  'cold',
  'nurture',
  'follow_up',
  'quoted',
  'client'
);


-- ===========================================================================
-- 2. THE STAGE COLUMN, AND THE ROWS THAT ALREADY EXIST
-- ===========================================================================
--
-- The default here is 'client' ON PURPOSE AND ONLY FOR THIS STATEMENT. Adding a
-- NOT NULL column with a constant default fills every existing row with that
-- default in the same statement, without an UPDATE. The default is moved to
-- 'cold' three statements below, once the assertion has held.

alter table public.clients add column stage public.client_stage not null default 'client';

-- EVERY ROW PRESENT AT THIS MOMENT IS A CLIENT, OR NOTHING IN THIS FILE COMMITS.
-- It raises rather than prints, so a wrong result rolls the whole file back.
do $$
declare
  n bigint;
begin
  select count(*) into n from public.clients where stage <> 'client';
  if n <> 0 then
    raise exception 'P3-43: % existing client row(s) carry a stage other than client after the column was added', n;
  end if;
end
$$;

-- From here on, a new client starts as a cold lead.
alter table public.clients alter column stage set default 'cold';

comment on column public.clients.stage is
  'THE STAGE IS NOT A STATE MACHINE IN THIS PHASE. Any stage may be set from any other, the precedent 0016 set for projects.status; the path taken is recoverable from public.status_history. Five values in stage order: cold (Lead rece), nurture (În cultivare), follow_up (De reluat), quoted (Ofertat), client (Client). Every row that existed before 0039 was set to client, because those are real customers; a row created afterwards defaults to cold. Written only through public.set_client_stage(), which records the change.';


-- ===========================================================================
-- 3. THE FOLLOW-UP DATE
-- ===========================================================================
--
-- ITS OWN COLUMN, A `date`, NOT TEXT AND NOT INSIDE notes. A list of leads has to
-- order by it in the database, and text in notes cannot be ordered. `date` and not
-- timestamptz, for the reason 0016 gives for start_date: a day to call somebody
-- has no time of day, and a timestamptz would move it across a timezone boundary.
--
-- NULLABLE, AND NOT CLEARED WHEN THE STAGE MOVES ON. It is required only while the
-- stage is follow_up. Leaving De reluat keeps the date, because deleting a value
-- somebody typed is not this card's decision.

alter table public.clients add column follow_up_date date null;

-- THE DATABASE REFUSES DE RELUAT WITHOUT A DATE ON ITS OWN, SQLSTATE 23514, so a
-- path that skips the form cannot store that state either. The form says the same
-- thing first, in Romanian, and the raw constraint error never reaches a screen.
--
-- A CHECK that evaluates to NULL is satisfied, and `stage <> 'follow_up'` is never
-- NULL because stage is NOT NULL, so the expression reads exactly as it behaves.
alter table public.clients
  add constraint clients_follow_up_date_required
  check (stage <> 'follow_up' or follow_up_date is not null);

comment on column public.clients.follow_up_date is
  'The day to chase this lead. Its own date column so a list can order by it in the database. Required while stage is follow_up, by clients_follow_up_date_required. Not cleared when the stage moves on: deleting a value somebody typed is not a migration''s decision.';


-- ===========================================================================
-- 4. THE STAGE WRITER
-- ===========================================================================
--
-- THE STAGE, THE DATE AND THE HISTORY ROW IN ONE TRANSACTION, so a stage that
-- moved without a record is impossible through this path. It is the fourth
-- function of this shape: set_inbound_status in 0003, set_outbound_status in 0004
-- and set_project_status in 0021 came first, and this copies 0021.
--
-- THE STAGE IS WRITTEN IN ONE PLACE. The application's generic client update does
-- not write stage or follow_up_date; it calls this. As 0021 says of its own
-- function, nothing at the database forces a caller to use it, which is why the
-- end to end suite reads the history row back rather than trusting the path.
--
-- THE DATE PARAMETER MAY BE NULL AND NULL MEANS "KEEP THE ONE STORED". That is how
-- leaving De reluat keeps its date without the caller having to send it back.
-- A stage of follow_up with no date passed and none stored fails on
-- clients_follow_up_date_required, 23514, and writes no history row, because the
-- insert below never runs.
--
-- SETTING THE SAME STAGE WRITES NO HISTORY ROW AND IS NOT AN ERROR. A double click
-- is not an event. A changed date on the same stage is stored, and is still not a
-- stage change.
--
-- created_at IS clock_timestamp(), NOT THE now() DEFAULT, for the reason 0021
-- records at length: now() is the transaction start, and several changes in one
-- transaction would share a timestamp and order by a random uuid.
--
-- SECURITY INVOKER, so RLS still applies: the update policy on clients is
-- owner-only (0013), and a caller who may not update the row does not find it.

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

comment on function public.set_client_stage(uuid, public.client_stage, date) is
  'Moves a client to a lifecycle stage and writes its public.status_history row in the same transaction, the shape of set_project_status in 0021. A null follow-up date keeps the stored one, so leaving De reluat does not erase it. Setting the SAME stage writes no history row and returns changed=false; a new date on the same stage is still stored. De reluat with no date fails on clients_follow_up_date_required, 23514. THE STAGE IS NOT A STATE MACHINE: any stage may follow any other.';

grant execute on function public.set_client_stage(uuid, public.client_stage, date) to authenticated;


-- ===========================================================================
-- 5. THE STAGE HISTORY OF ONE CLIENT
-- ===========================================================================
--
-- status_history is polymorphic, so every read needs the entity_type filter. One
-- function is one place that filter can be forgotten, the reason 0021 gives for
-- project_status_history, whose shape this copies, with changed_by added because
-- "who" is half of what handover 4.8 line 9 asks for.

create or replace function public.client_stage_history(p_client_id uuid)
returns table (
  from_status text,
  to_status   text,
  changed_by  uuid,
  created_at  timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select h.from_status, h.to_status, h.changed_by, h.created_at
  from public.status_history h
  where h.entity_type = 'client' and h.entity_id = p_client_id
  order by h.created_at desc, h.id desc
$$;

comment on function public.client_stage_history(uuid) is
  'The stage history of one client, newest first, with who made each change. status_history is polymorphic across entity kinds, so every read needs the entity_type filter; one function is one place it can be forgotten.';

grant execute on function public.client_stage_history(uuid) to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: the five stages in declaration order; both columns on public.clients,
-- stage not null with default cold and follow_up_date nullable; the check
-- constraint; and both functions.

select e.enumlabel, e.enumsortorder
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public' and t.typname = 'client_stage'
order by e.enumsortorder;

select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'clients'
  and column_name in ('stage', 'follow_up_date')
order by column_name;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.clients'::regclass and conname = 'clients_follow_up_date_required';

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_client_stage', 'client_stage_history')
order by p.proname;
