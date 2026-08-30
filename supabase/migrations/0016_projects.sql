-- 0016_projects.sql
-- RC Inventory phase 3, card P3-03. public.projects, with the six-state
-- pipeline.
--
-- WHAT THIS CARRIES. Material cost per project, budget versus actual, the
-- deviz, the pipeline view and the forward-looking procurement card all reduce
-- to "group by project_id". None of them is buildable until this table exists,
-- which is why P3-03 is high priority and second in the wave rather than
-- sequenced by size.
--
-- IT DEPENDS ON 0015 having added 'project' to public.status_entity, in its own
-- file, for the transaction reason written there.
--
-- IT RUNS AS ONE TRANSACTION and is NOT safe to run twice.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs
-- scripts/poc-free/local-db/assertions/0016_projects.sql.
--
-- NOT APPLIED TO PRODUCTION BY THIS PULL REQUEST. The apply is card P3-27, and
-- both files are in the pending register in docs/migrations/APPLY-LOG.md until
-- it runs. Ruling R-062.

begin;


-- ===========================================================================
-- 1. THE PIPELINE ENUM
-- ===========================================================================
--
-- SIX VALUES, IN THIS ORDER, AND THE ORDER IS THE PIPELINE. The pipeline view
-- in wave 3 reads the declaration order rather than hardcoding a second list,
-- so the columns on that board cannot drift from the values in the database.
--
-- Stored values are English tokens; the Romanian labels the interface shows are
-- Prospect, Oferta, Contract, In lucru, Suspendat and Inchis, and they live in
-- the presentation layer. That is the P2-01 convention and it is what
-- public.unit_code and public.status_entity already do.

create type public.project_status as enum (
  'lead',
  'offer',
  'contract',
  'active',
  'suspended',
  'closed'
);


-- ===========================================================================
-- 2. TABLE
-- ===========================================================================

create table public.projects (
  id                uuid primary key default gen_random_uuid(),
  -- ON DELETE RESTRICT, not cascade. A project carries issued material and cost
  -- history, and a client deleted out from under it would orphan real money.
  -- Clients are deactivated, not deleted, and there is no delete policy anyway;
  -- this is the constraint graph agreeing with that rather than relying on it.
  client_id         uuid not null references public.clients (id) on delete restrict,
  name              text not null,
  address           text null,
  status            public.project_status not null default 'lead',
  -- date, NOT timestamptz. A construction start date has no time of day, and a
  -- timestamptz would silently move it across a timezone boundary.
  start_date        date null,
  planned_end_date  date null,
  -- Nullable, and in MDL, matching unit_value_mdl and sale_price_mdl already in
  -- the schema. A lead has no budget yet, and NOT NULL would block the row that
  -- starts the pipeline.
  --
  -- MULTI-CURRENCY IS NOT IN SCOPE. public.currency_code exists in this schema
  -- and is deliberately not used here: a second currency changes every
  -- computation in wave 3, and that is a phase 4 decision rather than a default.
  budget_mdl        numeric(14,2) null,
  notes             text null,
  active            boolean not null default true,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A project name is unique PER CLIENT, not globally. Two different clients
  -- each having a project called "Bloc A" is normal and common.
  constraint projects_name_unique_per_client unique (client_id, name),

  -- The planned end cannot precede the start. Both columns are nullable and
  -- either may be absent: a lead with a start date and no estimate must still
  -- save, and that is the ordinary case this table exists for.
  --
  -- THE TWO NULL GUARDS ARE REDUNDANT AND THEY STAY. A CHECK constraint that
  -- evaluates to NULL is SATISFIED in SQL, so `planned_end_date >= start_date`
  -- alone already accepts a row with either date absent. The guards were
  -- written as a safety net, and deleting them was then run as a mutation test
  -- against the assertion file: it passed, which is the answer that says the
  -- lines do nothing.
  --
  -- They are kept because three-valued logic is the thing a reader is most
  -- likely to get wrong about this constraint, and a rule that reads as it
  -- behaves is worth two clauses the planner discards. The comment is here so
  -- nobody removes them believing they were load-bearing, or keeps them
  -- believing they are.
  constraint projects_dates_in_order check (
    start_date is null
    or planned_end_date is null
    or planned_end_date >= start_date
  )
);

comment on table public.projects is
  'Job sites. The thing material is issued to, cost is counted against, and the sales pipeline is built from. Rows are deactivated, never deleted.';

comment on column public.projects.status is
  'THE PIPELINE IS NOT A STATE MACHINE IN THIS PHASE. Any status may be set from any other. Real construction work goes backwards: a contract stalls into suspended, a closed job reopens, an offer becomes a lead again when the client goes quiet. Enforcing a forward-only path would make the field lie within a month. The path taken is recoverable from public.status_history instead.';

comment on column public.projects.budget_mdl is
  'Nullable because a lead has no budget yet. MDL only this phase: public.currency_code exists and is deliberately unused, because a second currency changes every computation in wave 3.';


-- ===========================================================================
-- 3. INDEXES
-- ===========================================================================

-- Every foreign key gets an index on the REFERENCING side. PostgreSQL indexes
-- only the referenced side, and "the projects of this client" is the query the
-- client detail screen is made of.
create index projects_client_id_idx on public.projects (client_id);

-- The pipeline view groups by status and the Proiecte list filters on it.
create index projects_status_idx on public.projects (status);

-- Every list surface filters on active and sorts by name straight afterwards.
create index projects_active_name_idx on public.projects (active, lower(name));


-- ===========================================================================
-- 4. UPDATED_AT TRIGGER
-- ===========================================================================

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();


-- ===========================================================================
-- 5. GRANTS
-- ===========================================================================
--
-- The revoke is a no-op, as it is in 0013 and 0014: 0009 already revoked the
-- anon default privilege for every table created in this schema afterwards. It
-- is kept so this table is closed by its own file, and the comment is here so
-- nobody deletes it believing it was load-bearing, or keeps it believing it is.

revoke all on table public.projects from anon;

grant select, insert, update, delete on table public.projects to authenticated;


-- ===========================================================================
-- 6. ROW LEVEL SECURITY
-- ===========================================================================

alter table public.projects enable row level security;

create policy projects_select on public.projects
  for select to authenticated using (true);

create policy projects_insert on public.projects
  for insert to authenticated with check (public.is_owner());

create policy projects_update on public.projects
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- No delete policy. A project referenced by an issued material line, a cost
-- report or a deviz cannot disappear without making that history unreadable.


commit;


-- ===========================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ===========================================================================
--
-- NOTHING HERE WRITES public.status_history WHEN A PROJECT STATUS CHANGES, and
-- that is worth stating because 0015 exists precisely so those rows can be
-- written.
--
-- The convention in this schema is that a status change and its history row are
-- written together inside a SQL FUNCTION: public.set_inbound_status in 0003 and
-- public.set_outbound_status in 0004 both do exactly that, and no trigger
-- enforces it. 0001's own comment on status_history says "a status that changes
-- without a row here is a defect (P2-04 and P2-05 acceptance both check for
-- it)", which is an admission that the rule is tested rather than enforced.
--
-- A trigger on this table would close that hole for projects and would be a NEW
-- convention, invented in a card whose acceptance does not mention it. P3-03 is
-- a schema card. **The writer belongs to P3-07**, the Proiecte screen, and a
-- note has been added to that card so it arrives with the requirement rather
-- than discovering it.
--
-- If a later card does add a trigger here, the function it replaces must stop
-- inserting, or every project status change will be recorded twice.


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- These grids go into the apply journal for card P3-27, verbatim, per
-- CLAUDE.md 8.5.

select
  c.relname        as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.polname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'projects'
group by c.relname, c.relrowsecurity;

select policyname, cmd, roles, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'projects'
order by policyname;

select e.enumlabel, e.enumsortorder
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public' and t.typname = 'project_status'
order by e.enumsortorder;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.projects'::regclass
order by conname;
