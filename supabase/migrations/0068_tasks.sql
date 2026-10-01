-- 0068_tasks.sql
-- RC Inventory phase 3, card P3-130, goal G73, Item 4 of Ivan's four items of
-- 2026-09-30. "Sarcini": the storage and the access rules under a proper to-do
-- list. NOTHING ON SCREEN. The tab, the panel and the Azi section are cards
-- P3-131, P3-132 and P3-133 and they are separate pull requests, clause 7.
--
-- WHAT IT ADDS, AND IT REMOVES NOTHING
--
--   type   public.task_status     todo, in_progress, done, cancelled
--   type   public.task_priority   low, medium, high
--   type   public.task_entity     client, project
--   table  public.tasks           one row is one job
--
-- NO EXISTING TABLE LOSES OR CHANGES A COLUMN. There is no DROP TABLE, no
-- TRUNCATE, no DELETE, no DROP COLUMN and no UPDATE of an existing row anywhere
-- in this file, and it performs no INSERT at all.
--
-- THE EXISTING NEXT STEP ON A CLIENT IS NOT TOUCHED, deviation D7 and the card's
-- acceptance (f). public.clients.next_action_at, public.clients.next_action and
-- public.search_clients_next_action, all added by 0058, are not read, not
-- written, not renamed and not migrated by this file or by the code that ships
-- with it. Clause 1 says why they are different shapes: the next step is ONE
-- promise per client, replaced each time, and Sarcini is a QUEUE of many jobs
-- each with its own status, priority, due date and assignee. One column cannot
-- be both. Azi showing tasks due today is card P3-133.
--
-- IT RUNS AS ONE TRANSACTION and IS safe to run twice: every create is guarded,
-- the policy block is the idempotent shape 0063 uses, and section 7 checks the
-- result on every run.
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. The application code
-- that reads and writes a task ships in the same merge and asks first whether
-- the table exists (hasTasks in lib/data/schema-capability.ts): in the minutes
-- between the code landing and this file landing, every task read answers empty
-- and every task write refuses in Romanian, and NOTHING ON ANY SCREEN CHANGES,
-- because this card builds no screen at all.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres and then runs
-- scripts/poc-free/local-db/assertions/0068_tasks.sql, and through real tokens
-- on a real stack by tests/e2e/tasks.spec.ts.
--
-- NO DIACRITIC IS IN THIS SCHEMA, deliberately, the convention 0063, 0066 and
-- 0067 state in terms: a schema carries no interface text. The Romanian words
-- live in TASK_STATUS_LABEL and TASK_PRIORITY_LABEL in lib/data/tasks-types.ts.

begin;


-- ===========================================================================
-- 1. THE STATUS ENUM
-- ===========================================================================
--
-- FOUR VALUES, AND THEY ARE THE FOUR IVAN NAMED. Clause 3 and card P2-01: the
-- stored value of an enum is NOT interface text, so the tokens are English and
-- the four Romanian words are rendered by the presentation layer, exactly as
-- unitLabel already does for units and as public.invoice_status does in 0063.
--
--   todo         De facut      written down, not started
--   in_progress  In lucru      somebody is on it
--   done         Finalizata    finished
--   cancelled    Anulata       called off, AND STILL ON THE RECORD
--
-- THE ORDER IS THE PIPELINE, and 'cancelled' is last because it is an end state
-- and not a deletion. Clause 4, which is Ivan's own sentence: ANULATA IS A
-- STATUS AND IS NEVER A DELETION. Section 6 gives this table no delete policy
-- at all and section 5 gives authenticated no delete privilege, so a cancelled
-- task stays readable, stays in its history and stays countable.

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'task_status') then
    create type public.task_status as enum ('todo', 'in_progress', 'done', 'cancelled');
  end if;
end
$$;


-- ===========================================================================
-- 2. THE PRIORITY ENUM
-- ===========================================================================
--
-- THREE VALUES, THE THREE IVAN NAMED, English tokens for the same reason.
--
--   low     Scazuta
--   medium  Medie
--   high    Ridicata

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'task_priority') then
    create type public.task_priority as enum ('low', 'medium', 'high');
  end if;
end
$$;


-- ===========================================================================
-- 3. THE LINKED ENTITY ENUM, AND IT HAS TWO VALUES AND NOT THREE
-- ===========================================================================
--
-- THE CARD SAYS "a lead, a client or a project" AND THAT IS TWO TOKENS IN THIS
-- PLATFORM, NOT THREE. A LEAD IS NOT A SEPARATE THING HERE: it is a row of
-- public.clients carrying a stage, from migration 0039, and the decision is on
-- the operator's decided list as "A lead is a client row with a stage. No leads
-- table, no second detail page." There is no public.leads table in any of the
-- sixty eight migrations and the Leaduri screens read public.clients. A third
-- token would therefore be a value NOTHING COULD EVER REFERENCE, and an enum
-- label is not removable once a row carries it.
--
-- THIS DOES NOT WEAKEN P3-132, which wants a panel on a lead page, a client page
-- and a project page. The lead detail page reads a client row, so it queries the
-- 'client' token. Recorded in the card's notes as well, so P3-132's executor
-- does not rediscover it.
--
-- WHY A TYPE AND AN ID RATHER THAN THREE NULLABLE FOREIGN KEYS. The card's own
-- defaults say to pick the shape this repository already uses for a polymorphic
-- reference, and that shape is public.status_history in migration 0001:
-- `entity_type public.status_entity not null` plus `entity_id uuid not null`,
-- indexed as (entity_type, entity_id, created_at desc). Section 4 follows it,
-- index included.
--
-- public.status_entity IS NOT REUSED AND COULD NOT BE. It is
-- ('inbound_order', 'outbound_issue'): a task attaches to different things
-- entirely, so this card creates its own type rather than widening one whose
-- two labels are what the order history means.
--
-- THE PRICE OF THE SHAPE, SAID OUT LOUD RATHER THAN LEFT TO BE FOUND: entity_id
-- cannot carry a foreign key, because a polymorphic column references two
-- tables. public.status_history has paid the same price since 0001 and this file
-- does not invent a trigger to simulate one: a second rule about rows that the
-- constraint graph does not hold is a rule the next writer forgets. What IS held
-- here is the pair, below.

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'task_entity') then
    create type public.task_entity as enum ('client', 'project');
  end if;
end
$$;


-- ===========================================================================
-- 4. public.tasks
-- ===========================================================================

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),

  -- A JOB WITH NO TITLE IS A ROW NOBODY CAN READ ON A LIST. Refused here rather
  -- than caught by whichever screen happens to save, the standard 0025 and 0063
  -- set: make wrong data impossible rather than unlikely.
  title        text not null,

  -- NULLABLE. Ivan's field list has a description and most jobs are their title.
  description  text null,

  -- NOT NULL WITH A DEFAULT, because a job always has a state: a null state
  -- would be a fifth meaning the screens would each have to invent a word for.
  -- 'todo' is where a job written down and not started is.
  status       public.task_status not null default 'todo',

  -- NOT NULL WITH A DEFAULT, for the same reason. 'medium' is the middle of the
  -- three Ivan named, so a job created without a stated urgency does not arrive
  -- claiming to be either urgent or ignorable.
  priority     public.task_priority not null default 'medium',

  -- A DATE AND NOT A TIMESTAMP, the same choice 0067 made for pickup_date and
  -- 0058 for next_action_at. A job is due ON A DAY, and the day that matters in
  -- this application is the Chisinau calendar day, which chisinauToday() already
  -- defines for every other screen. NULLABLE: a job with no deadline is a job,
  -- and the three buckets of P3-131 simply do not contain it.
  due_date     date null,

  -- THE PERSON RESPONSIBLE. NULLABLE, because an unassigned job is a real state:
  -- somebody writes the job down before deciding who does it.
  --
  -- ON DELETE SET NULL, AND THE OTHER TWO OPTIONS ARE BOTH WRONG HERE.
  -- public.profiles.id cascades from auth.users, so deleting an auth user takes
  -- the profile row with it. Then:
  --   on delete cascade   would DELETE THE TASK, which clause 4 forbids outright.
  --   on delete restrict  would block the auth user deletion, making the task
  --                       table the reason an account cannot be removed.
  --   on delete set null  keeps the record and loses only the pointer.
  -- Only the third one keeps a cancelled or finished job readable and countable,
  -- which is the whole promise of this card. A profile is normally retired by
  -- setting `active` false rather than deleted, so this path should never fire;
  -- it is written this way so that it cannot destroy a job if it does.
  --
  -- IT REFERENCES public.profiles AND NOT auth.users, unlike created_by below,
  -- and the difference is deliberate: the assignee is a PERSON IN THIS BUSINESS
  -- that a screen lists and names, and public.profiles is the role carrier that
  -- holds full_name and active. created_by records an actor and is written by the
  -- database from auth.uid(), exactly as public.invoices.created_by is in 0063.
  assignee_id  uuid null references public.profiles (id) on delete set null,

  -- THE OPTIONAL LINKED RECORD, BOTH NULL TOGETHER OR BOTH PRESENT TOGETHER.
  -- Ivan: "linked entity (lead, client or project, optional)". The pair rule is
  -- the card's acceptance (a) third group and it is a CHECK below, not a
  -- convention: a type with no id points at nothing and an id with no type is an
  -- id nobody can resolve to a table.
  entity_type  public.task_entity null,
  entity_id    uuid null,

  -- WHO WROTE IT AND WHEN. DEFAULTS TO THE SIGNED IN USER, as
  -- public.invoices.created_by does in 0063 and public.documents.uploaded_by in
  -- 0044, so a writing path cannot forget to record who created the job.
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint tasks_title_not_blank check (btrim(title) <> ''),

  -- THE PAIR IS ALL OR NOTHING, acceptance (a). Written as an equality of two
  -- null tests, the same form public.invoices uses for its series and number in
  -- 0063: it accepts both null and both present, and refuses either half alone.
  constraint tasks_entity_both_or_neither
    check ((entity_type is null) = (entity_id is null))
);

comment on table public.tasks is
  'Sarcini. One row is one job: a title, a state, an urgency, a day it is due, the person responsible, and optionally the client or project it belongs to. A JOB IS NEVER DELETED: it is moved to the cancelled status and stays on the record, readable and countable, which is the owner request this card was written from. There is no delete policy and no delete privilege for any role, owner included. The single next step on a client, added by 0058, is a different shape and is untouched by this card. Card P3-130.';

comment on column public.tasks.status is
  'Stored tokens are English, P2-01: todo, in_progress, done, cancelled. The Romanian words De facut, In lucru, Finalizata and Anulata are rendered by TASK_STATUS_LABEL in lib/data/tasks-types.ts. cancelled is an END STATE AND NOT A DELETION.';

comment on column public.tasks.priority is
  'Stored tokens are English, P2-01: low, medium, high. The Romanian words Scazuta, Medie and Ridicata are rendered by TASK_PRIORITY_LABEL in lib/data/tasks-types.ts. Defaults to medium so a job created without a stated urgency does not claim to be urgent or ignorable.';

comment on column public.tasks.due_date is
  'The DAY the job is due, not a timestamp. The day boundary everywhere in this application is the Chisinau calendar day, through chisinauToday(); cards P3-131 and P3-133 read it from that one place. Nullable: a job with no deadline is a job.';

comment on column public.tasks.assignee_id is
  'The profile responsible. Nullable, because an unassigned job is a real state. ON DELETE SET NULL because profiles cascades from auth.users: cascade would delete the job, which this card forbids, and restrict would make this table the reason an account cannot be removed. A profile is normally retired by setting active false rather than deleted.';

comment on column public.tasks.entity_type is
  'Which kind of record the job is attached to, or null. TWO VALUES AND NOT THREE: a lead in this platform is a row of public.clients carrying a stage, from 0039, so a lead is attached as a client. There is no public.leads table. Paired with entity_id by tasks_entity_both_or_neither.';

comment on column public.tasks.entity_id is
  'The id of the attached record, in the table entity_type names. NO FOREIGN KEY, because a polymorphic reference points at two tables; public.status_history has carried the same shape and the same price since 0001. The pair is all or nothing.';


-- ===========================================================================
-- 5. INDEXES
-- ===========================================================================
--
-- Every foreign key is indexed on the REFERENCING side, 0001's stated rule,
-- because PostgreSQL indexes only the referenced side and every screen filters
-- on the other one.
--
-- THE COMPOSITE ENTITY INDEX IS status_history's, LITERALLY. 0001 has
-- `status_history_entity_idx on (entity_type, entity_id, created_at desc)` and
-- this is the same query: "the jobs of THIS record, newest first", which is
-- exactly what the panel of card P3-132 is made of.
--
-- (status, due_date) IS THE LIST AND THE THREE BUCKETS of card P3-131: "the open
-- jobs due in this window". It is built here rather than left to that card so
-- P3-131, P3-132 and P3-133 need no second migration, which the task this card
-- was dispatched under asks for in terms.

create index if not exists tasks_assignee_id_idx on public.tasks (assignee_id);
create index if not exists tasks_created_by_idx  on public.tasks (created_by);
create index if not exists tasks_entity_idx      on public.tasks (entity_type, entity_id, created_at desc);
create index if not exists tasks_status_due_date_idx on public.tasks (status, due_date);


-- ===========================================================================
-- 6. THE updated_at TRIGGER
-- ===========================================================================
--
-- 0001's words, kept because they are the reason: "An updated_at column that
-- never updates is a lie the whole system then reads." One shared function,
-- public.set_updated_at() from 0001, one trigger per table.

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();


-- ===========================================================================
-- 7. GRANTS
-- ===========================================================================
--
-- REVOKE FROM authenticated FIRST, AND THAT LINE IS THE LOAD BEARING ONE.
-- 0009's header records what this project actually does: "Supabase grants table
-- privileges to anon AND authenticated AT CREATE TABLE TIME, from project-level
-- default privileges". So a table created by this file arrives on the production
-- project WITH DELETE ALREADY GRANTED to authenticated, and a file that only
-- ADDED grants would leave DELETE standing while claiming in its own header that
-- nothing can be deleted. 0044, 0046, 0059 and 0063 all revoke before granting
-- for exactly this reason, and this file follows them.
--
-- NO DELETE IS GRANTED, TO ANY ROLE. That is the privilege half of "a job is
-- never deleted"; section 8 is the policy half, and both are needed, because
-- either one alone would be a rule with a door.
--
-- The anon revoke is a no-op, as it is in 0013, 0016, 0025 and 0063: 0009 also
-- altered the default privileges so anon gets nothing on a table created
-- afterwards. It is kept so this table is closed by its own file, and this
-- comment is here so nobody deletes the line believing it was load bearing, or
-- keeps it believing it is.

revoke all on table public.tasks from anon;
revoke all on table public.tasks from authenticated;

grant select, insert, update on table public.tasks to authenticated;


-- ===========================================================================
-- 8. ROW LEVEL SECURITY
-- ===========================================================================
--
-- THE PREDICATES ARE THE ONES THAT ALREADY EXIST AND NOTHING IS INVENTED HERE,
-- deviation D4. THERE IS NO ORGANISATION OR TENANT MODEL IN THIS PLATFORM AND
-- NONE IS INVENTED BY THIS CARD. Inventing one to satisfy a test name would be
-- the largest schema change on this board, made by nobody's decision.
--
-- `public.current_app_role() is not null` means AN ACTIVE PROFILE OF ANY ROLE.
-- It and public.is_owner() are both from 0001, both SECURITY DEFINER, and 0001's
-- own comment records the consequence this card relies on: is_owner() "returns
-- false for an unauthenticated caller and for a deactivated profile, so a write
-- policy written as is_owner() denies by default". current_app_role() filters on
-- p.active, so an unauthenticated caller and a deactivated profile both read
-- null from it. Those are two of the three isolation cases, and the third, a
-- role without the permission, is the same null: the two roles are owner and
-- account_manager and both may operate, which is 0001 section 9's decision, so
-- "a role without the permission" in this platform is precisely a caller
-- current_app_role() answers null for.
--
-- WHO MAY DO WHAT:
--
--   read a job      an active profile, any role
--   write a job     an active profile, any role (owner or operator)
--   DELETE A JOB    NOBODY, owner included. NO POLICY EXISTS.
--
-- THE JOB LIST IS NOT SPLIT BY ASSIGNEE, and that is a decision rather than an
-- omission. Ivan's Item 4 asks for a QUEUE with an assignee FILTER, which is a
-- filter on a list everybody can see, not a wall. A policy keyed on
-- assignee_id = auth.uid() would make the Sarcini tab of card P3-131 show
-- different rows to two people looking at the same screen, and its assignee
-- filter would then be filtering something already filtered.
--
-- NO DELETE POLICY, matching public.invoices since 0063 and public.outbound_issues
-- since 0067. A cancelled job is the record of what was dropped and when, which
-- is the sentence the owner wrote the request with. Cancellation is a status;
-- deletion is not a feature.

alter table public.tasks enable row level security;

-- CREATE POLICY has no IF NOT EXISTS, which is why this is a block. The shape is
-- 0063's, so the file is re-runnable.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'tasks' and policyname = 'tasks_select') then
    create policy tasks_select on public.tasks
      for select to authenticated using (public.current_app_role() is not null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'tasks' and policyname = 'tasks_insert') then
    create policy tasks_insert on public.tasks
      for insert to authenticated with check (public.current_app_role() is not null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'tasks' and policyname = 'tasks_update') then
    create policy tasks_update on public.tasks
      for update to authenticated
      using (public.current_app_role() is not null)
      with check (public.current_app_role() is not null);
  end if;
end
$$;


-- ===========================================================================
-- 9. THE RESULT, CHECKED
-- ===========================================================================
--
-- A check, not a change. One table with row level security on, three policies
-- and no fourth, no delete policy, no delete privilege for authenticated, and
-- anon holding nothing. It holds on every run, which is what makes this file
-- re-runnable rather than merely idempotent looking.

do $$
declare
  n   integer;
  txt text;
begin
  select count(*) into n from pg_class
  where oid = 'public.tasks'::regclass and relrowsecurity;
  if n <> 1 then
    raise exception 'P3-130: row level security is not enabled on public.tasks';
  end if;

  select string_agg(distinct cmd, ',' order by cmd) into txt
  from pg_policies where schemaname = 'public' and tablename = 'tasks';
  if txt is distinct from 'INSERT,SELECT,UPDATE' then
    raise exception 'P3-130: tasks policy commands are (%), expected (INSERT,SELECT,UPDATE)', txt;
  end if;

  select count(*) into n
  from pg_policies where schemaname = 'public' and tablename = 'tasks' and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-130: public.tasks must carry NO delete policy, found %', n;
  end if;

  if has_table_privilege('authenticated', 'public.tasks', 'DELETE') then
    raise exception 'P3-130: authenticated may delete a task, and must not';
  end if;

  if has_table_privilege('anon', 'public.tasks', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'P3-130: anon holds a privilege on public.tasks';
  end if;

  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into txt
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'task_status';
  if txt is distinct from 'todo,in_progress,done,cancelled' then
    raise exception 'P3-130: task_status labels are (%), expected (todo,in_progress,done,cancelled)', txt;
  end if;

  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into txt
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'task_priority';
  if txt is distinct from 'low,medium,high' then
    raise exception 'P3-130: task_priority labels are (%), expected (low,medium,high)', txt;
  end if;

  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into txt
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'task_entity';
  if txt is distinct from 'client,project' then
    raise exception 'P3-130: task_entity labels are (%), expected (client,project). A lead is a client row with a stage and there is no leads table.', txt;
  end if;
end
$$;

commit;


-- ===========================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ===========================================================================
--
-- NO SCREEN, clause 7. No component, no route, no tab, no sidebar entry. The
-- list and its filters, sorts and buckets are P3-131, the panel on the linked
-- record is P3-132, and the Azi section is P3-133. The existing rule that
-- nothing appears in the menu that cannot be used yet is the reason the order is
-- this way round.
--
-- NOTHING IS DONE TO THE EXISTING NEXT STEP ON A CLIENT, deviation D7 and
-- acceptance (f). public.clients.next_action_at and public.clients.next_action
-- from 0058 are not read, not written, not renamed, not migrated and not folded
-- in, and public.search_clients_next_action is not touched. They answer "what is
-- the one promise to this customer"; this table answers "what jobs are open".
--
-- NOTHING WRITES public.status_history WHEN A TASK STATUS CHANGES. That is the
-- same seam 0016, 0025 and 0063 all documented: public.status_entity does not
-- carry a 'task' value, and adding an enum label is a migration of its own, in
-- the card that needs the history. created_at, updated_at and the status itself
-- carry what part one was asked for.
--
-- NOTHING CANCELS A TASK FOR YOU. Cancelling is an UPDATE that sets the status to
-- 'cancelled', which the update policy permits. A cancel FUNCTION with rules of
-- its own would belong to the card that owns the screen pressing the button.
--
-- NO RECURRENCE, NO SUBTASK, NO REMINDER EMAIL AND NO ATTACHMENT. None of them
-- is in Ivan's field list and none is invented here.


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- These grids go into the pull request body, verbatim. Every one of them is also
-- asserted, so a failure fails the pull request rather than waiting to be read
-- off a grid: scripts/poc-free/local-db/assertions/0068_tasks.sql.

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'tasks'
order by ordinal_position;

select t.typname, e.enumlabel, e.enumsortorder
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public' and t.typname in ('task_status', 'task_priority', 'task_entity')
order by t.typname, e.enumsortorder;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.tasks'::regclass
order by conname;

select
  c.relname        as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.polname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'tasks'
group by c.relname, c.relrowsecurity;

select policyname, cmd, roles, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'tasks'
order by policyname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'tasks'
order by indexname;

select c.relname as table_name, t.tgname as trigger_name, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'tasks' and not t.tgisinternal
order by t.tgname;
