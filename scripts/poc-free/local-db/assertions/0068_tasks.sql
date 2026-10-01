-- assertions/0068_tasks.sql
-- Card P3-130, goal G73, Item 4 of Ivan's four items. What 0068 must have left
-- behind, and what it must NOT have changed.
--
-- FOUR GROUPS, AND THEY ARE THE CARD'S ACCEPTANCE LINE (a) VERBATIM:
--
--   1. public.tasks EXISTS WITH EVERY COLUMN NAMED IN CLAUSE 2: title,
--      description, status, priority, due date, assignee referencing a profile,
--      the optional linked entity as a type and an id, created by, created at and
--      updated at. Each one by name, with its type and its nullability, plus the
--      assignee key's ON DELETE SET NULL, which is drafter's decision B and the
--      only one of the three delete rules that keeps a cancelled job readable.
--   2. THE ENUMS HOLD EXACTLY THE LABELS THE OWNER NAMED: the status enum four,
--      the priority enum three, and the linked entity enum TWO AND NOT THREE.
--      That last one is drafter's decision A: a lead in this platform is a row of
--      public.clients carrying a stage, from 0039, so a lead is attached as a
--      client. A third label would be a value nothing could ever reference, and
--      an enum label is not removable once a row carries it. The group reads
--      pg_class for public.leads too, so the day somebody adds that table this
--      assertion is the thing that says the reasoning needs looking at again.
--   3. THE LINKED ENTITY CONSTRAINT refuses a row with a type and no id, refuses
--      one with an id and no type, and ACCEPTS both null and both present. The
--      two acceptances are witnesses and they are not decoration: without them
--      the two refusals would pass just as well on a constraint that refuses
--      everything, which is how a constraint nobody can satisfy ships green.
--   4. THE POLICIES are select, insert and update, and there is NO DELETE POLICY
--      AT ALL, which is what public.invoices has carried since 0063 and
--      public.outbound_issues since 0067. The privilege half is asserted beside
--      it: authenticated holds no DELETE on the table either, because a policy
--      and a grant are two doors and closing one is not closing the other.
--
-- 0063 AND 0067 ARE READ RATHER THAN DESCRIBED, in group 4. This card copied
-- their no-delete shape, so if either of those tables ever gains a delete policy
-- the sentence this card was written on has stopped being true and somebody must
-- look. The same trick assertions/0067 plays on public.invoices.
--
-- WHAT IS DELIBERATELY NOT ASSERTED HERE, said so nobody reads it as proven:
-- A BARE POSTGRES RUNS AS SUPERUSER AND BYPASSES ROW LEVEL SECURITY, so every
-- assertion in this file can prove a policy EXISTS and NONE of them can prove
-- what it lets through. Everything that needs a real token through PostgREST is
-- a named case of tests/e2e/tasks.spec.ts and is proved there:
--
--   the three isolation cases of deviation D4
--     sarcini: o cerere nesemnata nu vede nicio sarcina
--     sarcini: un cont dezactivat nu vede nicio sarcina
--     sarcini: un rol fara permisiune nu poate scrie o sarcina
--   the cancellation case, acceptance (d)
--     sarcini: o sarcina anulata ramane citibila si numarabila
--   the no-delete case, acceptance (e)
--     sarcini: nu exista nicio cale de stergere a unei sarcini
--
-- The last two are the pair that matters most and the reason they cannot live
-- here: this file can see that no delete policy exists, and only a real token can
-- see that a DELETE sent anyway is REFUSED and the row is still there afterwards.
--
-- REFUSALS ARE WRITTEN WITHOUT DIACRITICS, the convention 0063, 0066 and 0067
-- follow: a schema carries no interface text.
--
-- Everything runs inside a transaction that is rolled back. Nothing here reaches
-- any real row, and nothing is ever deleted.

begin;


-- ===========================================================================
-- 1. THE TABLE AND EVERY COLUMN OF CLAUSE 2
-- ===========================================================================

do $$
declare
  n   integer;
  txt text;
  -- name, type, nullable. The whole of clause 2, read as data so a missing
  -- column is named rather than discovered as a later group failing oddly.
  cols text[][] := array[
    ['id',          'uuid',                      'no'],
    ['title',       'text',                      'no'],
    ['description', 'text',                      'yes'],
    ['status',      'task_status',               'no'],
    ['priority',    'task_priority',             'no'],
    ['due_date',    'date',                      'yes'],
    ['assignee_id', 'uuid',                      'yes'],
    ['entity_type', 'task_entity',               'yes'],
    ['entity_id',   'uuid',                      'yes'],
    ['created_by',  'uuid',                      'yes'],
    ['created_at',  'timestamp with time zone',  'no'],
    ['updated_at',  'timestamp with time zone',  'no']
  ];
  i integer;
begin
  if to_regclass('public.tasks') is null then
    raise exception 'P3-130: public.tasks does not exist';
  end if;

  for i in 1 .. array_length(cols, 1) loop
    select a.atttypid::regtype::text into txt
    from pg_attribute a
    where a.attrelid = 'public.tasks'::regclass and a.attname = cols[i][1] and a.attnum > 0
      and not a.attisdropped;

    if txt is null then
      raise exception 'P3-130: expected public.tasks.% to exist, found none', cols[i][1];
    end if;
    if txt <> cols[i][2] then
      raise exception 'P3-130: tasks.% must be %, found %', cols[i][1], cols[i][2], txt;
    end if;

    select count(*) into n
    from pg_attribute a
    where a.attrelid = 'public.tasks'::regclass and a.attname = cols[i][1] and a.attnotnull;

    if cols[i][3] = 'no' and n <> 1 then
      raise exception 'P3-130: tasks.% must be NOT NULL', cols[i][1];
    end if;
    if cols[i][3] = 'yes' and n <> 0 then
      raise exception 'P3-130: tasks.% must be NULLABLE', cols[i][1];
    end if;
  end loop;

  -- THE TWO DEFAULTS THAT CARRY A MEANING. A null state or a null urgency would
  -- be a fifth and a fourth value the screens would each have to invent a word
  -- for, so both columns are NOT NULL above and both have to land on a value.
  select pg_get_expr(d.adbin, d.adrelid) into txt
  from pg_attrdef d
  join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  where d.adrelid = 'public.tasks'::regclass and a.attname = 'status';
  if txt is null or txt not like '%todo%' then
    raise exception 'P3-130: tasks.status must default to todo, found %', coalesce(txt, 'no default');
  end if;

  select pg_get_expr(d.adbin, d.adrelid) into txt
  from pg_attrdef d
  join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  where d.adrelid = 'public.tasks'::regclass and a.attname = 'priority';
  if txt is null or txt not like '%medium%' then
    raise exception 'P3-130: tasks.priority must default to medium, found %', coalesce(txt, 'no default');
  end if;

  -- THE ASSIGNEE KEY, AND ITS DELETE RULE IS THE WHOLE OF DECISION B.
  -- public.profiles.id cascades from auth.users, so if an auth user is deleted
  -- the profile goes with it. CASCADE here would DELETE THE TASK, which clause 4
  -- forbids outright; RESTRICT would make this table the reason an account
  -- cannot be removed. 'n' is SET NULL and it is the only one of the three that
  -- keeps the record.
  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.tasks'::regclass
    and c.contype = 'f'
    and c.confrelid = 'public.profiles'::regclass
    and c.confdeltype = 'n';
  if n <> 1 then
    raise exception 'P3-130: expected exactly one SET NULL foreign key from tasks to profiles, found %. CASCADE would delete a task, which this card forbids.', n;
  end if;

  -- created_by POINTS AT auth.users AND NOT AT profiles, deliberately: it records
  -- an ACTOR and is written by the database from auth.uid(), exactly as
  -- public.invoices.created_by does in 0063. SET NULL for the same reason.
  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.tasks'::regclass
    and c.contype = 'f'
    and c.confrelid = 'auth.users'::regclass
    and c.confdeltype = 'n';
  if n <> 1 then
    raise exception 'P3-130: expected exactly one SET NULL foreign key from tasks to auth.users, found %', n;
  end if;

  -- NO OTHER FOREIGN KEY EXISTS, and entity_id having none is the stated price of
  -- the polymorphic shape rather than an oversight: a column cannot reference two
  -- tables. public.status_history has carried the same shape since 0001.
  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.tasks'::regclass and c.contype = 'f';
  if n <> 2 then
    raise exception 'P3-130: expected exactly 2 foreign keys on public.tasks, found %', n;
  end if;

  -- THE ENTITY INDEX IS status_history's, which is the precedent the card names.
  select count(*) into n
  from pg_indexes
  where schemaname = 'public' and tablename = 'tasks'
    and indexdef like '%entity_type%' and indexdef like '%entity_id%';
  if n < 1 then
    raise exception 'P3-130: expected an index on (entity_type, entity_id, ...), the status_history shape, found none';
  end if;

  -- The index on the assignee key, 0001's stated rule about the referencing side.
  select count(*) into n
  from pg_indexes
  where schemaname = 'public' and tablename = 'tasks' and indexdef like '%assignee_id%';
  if n < 1 then
    raise exception 'P3-130: expected an index covering tasks.assignee_id, found none';
  end if;

  -- updated_at THAT NEVER UPDATES IS A LIE THE WHOLE SYSTEM THEN READS, 0001's
  -- own sentence. The shared trigger function is attached.
  select count(*) into n
  from pg_trigger t
  where t.tgrelid = 'public.tasks'::regclass and not t.tgisinternal
    and pg_get_triggerdef(t.oid) like '%set_updated_at%';
  if n <> 1 then
    raise exception 'P3-130: expected the shared set_updated_at trigger on public.tasks, found %', n;
  end if;
end $$;


-- ===========================================================================
-- 2. THE ENUMS HOLD EXACTLY THE LABELS THE OWNER NAMED
-- ===========================================================================

do $$
declare
  txt text;
begin
  -- FOUR, AND THE FOUR IVAN NAMED: De facut, In lucru, Finalizata, Anulata.
  -- English tokens stored, P2-01, and the Romanian words are in
  -- TASK_STATUS_LABEL in lib/data/tasks-types.ts. A fifth token added later
  -- without a card would be a fifth meaning nobody decided.
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into txt
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'task_status';

  if txt is distinct from 'todo,in_progress,done,cancelled' then
    raise exception 'P3-130: task_status labels are (%), expected (todo,in_progress,done,cancelled)', txt;
  end if;

  -- 'cancelled' EXISTS AS A STATUS, which is the schema half of Ivan's own
  -- sentence that a cancelled job is never deleted. The other half is group 4.
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    join pg_namespace ns on ns.oid = t.typnamespace
    where ns.nspname = 'public' and t.typname = 'task_status' and e.enumlabel = 'cancelled'
  ) then
    raise exception 'P3-130: task_status has no cancelled label, so a job could only be removed by deleting it';
  end if;

  -- THREE, AND THE THREE HE NAMED: Scazuta, Medie, Ridicata.
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into txt
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'task_priority';

  if txt is distinct from 'low,medium,high' then
    raise exception 'P3-130: task_priority labels are (%), expected (low,medium,high)', txt;
  end if;

  -- TWO AND NOT THREE, DRAFTER'S DECISION A.
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into txt
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'task_entity';

  if txt is distinct from 'client,project' then
    raise exception 'P3-130: task_entity labels are (%), expected (client,project). A lead is a row of public.clients carrying a stage, migration 0039, so a lead attaches as a client.', txt;
  end if;

  -- THE REASON, READ FROM THE SCHEMA RATHER THAN BELIEVED. There is no
  -- public.leads table in any migration, which is what makes a third label a
  -- value nothing could reference. If this ever fires, the decision above needs
  -- looking at again rather than the assertion needs relaxing.
  if to_regclass('public.leads') is not null then
    raise exception 'P3-130: public.leads now EXISTS, so decision A (a lead attaches as a client, two enum labels) has to be revisited by a card rather than assumed';
  end if;

  -- public.status_entity IS NOT WIDENED BY THIS CARD. It is the order history's
  -- own type and its two labels are what that history means.
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into txt
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'status_entity';

  if txt is distinct from 'inbound_order,outbound_issue' then
    raise exception 'P3-130: status_entity labels are (%), and this card must not have touched them', txt;
  end if;
end $$;


-- ===========================================================================
-- FIXTURES for group 3
-- ===========================================================================
--
-- Built by hand, prefixed TEST, inside the transaction this file rolls back.
-- Nothing is ever deleted and nothing here reaches any real row.
--
-- A REAL CLIENT AND A REAL PROJECT, even though entity_id carries no foreign key
-- and any uuid would satisfy the constraint. The point of the group below is the
-- PAIR rule, and a fixture pointing at rows that exist is the one a reader can
-- check against the two enum labels.

create temporary table rc_p3_130_fixture (client_id uuid, project_id uuid);

with c as (
  insert into public.clients (name) values ('TEST P3-130 client') returning id
), p as (
  insert into public.projects (client_id, name)
  select c.id, 'TEST P3-130 proiect' from c
  returning id, client_id
)
insert into rc_p3_130_fixture (client_id, project_id)
select p.client_id, p.id from p;


-- ===========================================================================
-- 3. THE LINKED ENTITY CONSTRAINT: BOTH NULL, BOTH PRESENT, NEVER ONE HALF
-- ===========================================================================

do $$
declare
  v_client  uuid;
  v_project uuid;
  n         integer;
begin
  select client_id, project_id into v_client, v_project from rc_p3_130_fixture;

  -- THE FIRST WITNESS: BOTH NULL IS ACCEPTED. Ivan's field list says the linked
  -- entity is OPTIONAL, so a job attached to nothing at all is a job.
  insert into public.tasks (title) values ('TEST P3-130 fara legatura');

  -- THE SECOND AND THIRD WITNESSES: BOTH PRESENT IS ACCEPTED, for each of the two
  -- labels. Without these three the two refusals below would pass on a constraint
  -- that refuses everything, and the table would be unusable and green.
  insert into public.tasks (title, entity_type, entity_id)
  values ('TEST P3-130 pe client', 'client', v_client);

  insert into public.tasks (title, entity_type, entity_id)
  values ('TEST P3-130 pe proiect', 'project', v_project);

  select count(*) into n from public.tasks where title like 'TEST P3-130%';
  if n <> 3 then
    raise exception 'P3-130: expected the 3 witness rows to be accepted, found %', n;
  end if;

  -- A TYPE WITH NO ID POINTS AT NOTHING.
  begin
    insert into public.tasks (title, entity_type, entity_id)
    values ('TEST P3-130 tip fara id', 'client', null);
    raise exception 'P3-130: a task with an entity type and no id was accepted, and must not be';
  exception
    when check_violation then null;
  end;

  -- AN ID WITH NO TYPE IS AN ID NOBODY CAN RESOLVE TO A TABLE.
  begin
    insert into public.tasks (title, entity_type, entity_id)
    values ('TEST P3-130 id fara tip', null, v_client);
    raise exception 'P3-130: a task with an entity id and no type was accepted, and must not be';
  exception
    when check_violation then null;
  end;

  -- THE PAIR RULE ALSO HOLDS ON AN UPDATE, which is the half a constraint written
  -- as an insert-time trigger would have missed: a screen that clears one box
  -- without the other is the likeliest way this breaks in practice.
  begin
    update public.tasks set entity_id = null
    where title = 'TEST P3-130 pe client';
    raise exception 'P3-130: an update that cleared the entity id and left the type was accepted, and must not be';
  exception
    when check_violation then null;
  end;

  -- A BLANK TITLE IS A ROW NOBODY CAN READ ON A LIST.
  begin
    insert into public.tasks (title) values ('   ');
    raise exception 'P3-130: a task with a blank title was accepted, and must not be';
  exception
    when check_violation then null;
  end;
end $$;


-- ===========================================================================
-- 4. SELECT, INSERT AND UPDATE, AND NO DELETE POLICY AT ALL
-- ===========================================================================

do $$
declare
  n   integer;
  txt text;
begin
  select string_agg(distinct cmd, ',' order by cmd) into txt
  from pg_policies where schemaname = 'public' and tablename = 'tasks';

  if txt is distinct from 'INSERT,SELECT,UPDATE' then
    raise exception 'P3-130: tasks policy commands are (%), expected (INSERT,SELECT,UPDATE)', txt;
  end if;

  -- SAID TWICE ON PURPOSE, the same way assertions/0067 says it. The line above
  -- would also pass if a delete policy existed alongside a fourth command nobody
  -- expected; this one asks the question the card asks, in the card's words.
  select count(*) into n
  from pg_policies where schemaname = 'public' and tablename = 'tasks' and cmd = 'DELETE';

  if n <> 0 then
    raise exception 'P3-130: public.tasks must carry NO delete policy, found %', n;
  end if;

  -- THE PRIVILEGE HALF. A policy and a grant are two doors, and closing one is
  -- not closing the other: Supabase grants DELETE to authenticated at CREATE
  -- TABLE time from project level default privileges, which 0009's header
  -- records, so 0068 had to REVOKE before granting. This is the line that proves
  -- it did.
  if has_table_privilege('authenticated', 'public.tasks', 'DELETE') then
    raise exception 'P3-130: authenticated holds DELETE on public.tasks, so the no-delete rule has a door';
  end if;

  if has_table_privilege('anon', 'public.tasks', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'P3-130: anon holds a privilege on public.tasks';
  end if;

  -- The three it DOES hold, so the table is not merely closed.
  if not has_table_privilege('authenticated', 'public.tasks', 'SELECT')
     or not has_table_privilege('authenticated', 'public.tasks', 'INSERT')
     or not has_table_privilege('authenticated', 'public.tasks', 'UPDATE') then
    raise exception 'P3-130: authenticated must hold SELECT, INSERT and UPDATE on public.tasks';
  end if;

  -- THE PREDICATES ARE THE ONES THIS REPOSITORY HAS, D4, AND NO ORGANISATION IS
  -- INVENTED. current_app_role() is security definer and filters on p.active, so
  -- an unauthenticated caller and a deactivated profile both read null from it.
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'tasks'
    and coalesce(qual, '') || coalesce(with_check, '') like '%current_app_role%';

  if n <> 3 then
    raise exception 'P3-130: expected all 3 tasks policies to use current_app_role(), found %', n;
  end if;

  -- NO POLICY IS KEYED ON THE ASSIGNEE, and that is a decision rather than an
  -- omission: Ivan asked for a queue with an assignee FILTER, so the rows are the
  -- same for everybody and the filter narrows them. A policy on assignee_id would
  -- make the Sarcini tab of P3-131 show two people different rows on one screen.
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'tasks'
    and coalesce(qual, '') || coalesce(with_check, '') like '%assignee_id%';
  if n <> 0 then
    raise exception 'P3-130: % tasks policies key on assignee_id, and none should', n;
  end if;

  -- RLS is still on, which a policy set says nothing about by itself.
  select count(*) into n from pg_class
  where oid = 'public.tasks'::regclass and relrowsecurity;
  if n <> 1 then
    raise exception 'P3-130: row level security must be enabled on public.tasks';
  end if;

  -- THE TWO TABLES THIS CARD COPIED ARE READ RATHER THAN DESCRIBED. If either
  -- gains a delete policy, the sentence this card was written on has stopped
  -- being true and somebody must look.
  select count(*) into n
  from pg_policies where schemaname = 'public' and tablename = 'invoices' and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-130: public.invoices was a model for no-delete and now has % delete policies', n;
  end if;

  select count(*) into n
  from pg_policies where schemaname = 'public' and tablename = 'outbound_issues' and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-130: public.outbound_issues was a model for no-delete and now has % delete policies', n;
  end if;
end $$;


-- ===========================================================================
-- 5. D7: THE EXISTING NEXT STEP ON A CLIENT IS EXACTLY AS 0058 LEFT IT
-- ===========================================================================
--
-- NOT A CLAUSE OF ACCEPTANCE (a). Acceptance (f) is a grep of the diff, which is
-- the right instrument for "this card did not edit those files" and cannot say
-- anything about the SCHEMA the two files produce together. This group is the
-- schema half, and it is cheap: the two columns still exist with the shapes 0058
-- gave them, and the function is still there with its seven parameters.
--
-- Clause 1 is why they are different shapes and both have to survive: the next
-- step is ONE promise per client, replaced each time; a task is one of many jobs
-- with its own status, priority, due date and assignee. One column cannot be both.

do $$
declare
  n   integer;
  txt text;
begin
  select a.atttypid::regtype::text into txt
  from pg_attribute a
  where a.attrelid = 'public.clients'::regclass and a.attname = 'next_action_at' and a.attnum > 0;
  if txt is distinct from 'date' then
    raise exception 'P3-130: clients.next_action_at must still be a date, found %', coalesce(txt, 'nothing');
  end if;

  select a.atttypid::regtype::text into txt
  from pg_attribute a
  where a.attrelid = 'public.clients'::regclass and a.attname = 'next_action' and a.attnum > 0;
  if txt is distinct from 'text' then
    raise exception 'P3-130: clients.next_action must still be text, found %', coalesce(txt, 'nothing');
  end if;

  select count(*) into n
  from pg_attribute a
  where a.attrelid = 'public.clients'::regclass
    and a.attname in ('next_action_at', 'next_action') and a.attnotnull;
  if n <> 0 then
    raise exception 'P3-130: the two next step columns must both still be NULLABLE';
  end if;

  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'search_clients_next_action';
  if n <> 1 then
    raise exception 'P3-130: expected exactly one public.search_clients_next_action, found %', n;
  end if;

  select array_to_string(array(select format_type(t, null) from unnest(p.proargtypes) as t), ', ')
    into txt
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'search_clients_next_action';
  if txt <> 'text, text, text, text, text, integer, integer' then
    raise exception 'P3-130: search_clients_next_action signature is (%), expected the untouched seven of 0058', txt;
  end if;

  -- AND public.tasks DOES NOT CARRY A COLUMN THAT DUPLICATES THE NEXT STEP. A
  -- next_action column here would be the folding-in D7 forbids, arriving as a
  -- helpful convenience rather than as a decision.
  if exists (
    select 1 from pg_attribute a
    where a.attrelid = 'public.tasks'::regclass and a.attnum > 0 and not a.attisdropped
      and a.attname in ('next_action', 'next_action_at')
  ) then
    raise exception 'P3-130: public.tasks carries a next step column, which is the folding-in D7 forbids';
  end if;
end $$;

rollback;
