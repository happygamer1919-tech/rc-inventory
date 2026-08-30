-- scripts/poc-free/local-db/assertions/0016_projects.sql
-- Card P3-03. Assertions for public.projects and for the 0015 enum value,
-- run against the throwaway container after every migration. Ruling R-062.
--
-- It covers both files, because 0015 is one statement whose only purpose is to
-- make this table's history recordable, and a separate assertion file for a
-- single enum value would be filing rather than checking.

do $$
declare
  n integer;
  txt text;
begin
  -- --- 0015: the status_entity value, IN ORDER ----------------------------
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into txt
  from pg_type t
  join pg_namespace ns on ns.oid = t.typnamespace
  join pg_enum e on e.enumtypid = t.oid
  where ns.nspname = 'public' and t.typname = 'status_entity';
  if txt is distinct from 'inbound_order,outbound_issue,project' then
    raise exception 'P3-03: expected status_entity to be (inbound_order, outbound_issue, project), found %', txt;
  end if;

  -- --- 0016: the pipeline enum, SIX VALUES IN DECLARATION ORDER -----------
  -- Order is asserted, not just membership. P3-03 says the declaration order IS
  -- the pipeline order and that the wave 3 pipeline view reads it rather than
  -- hardcoding a second list, so a reordering here silently reorders that board.
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into txt
  from pg_type t
  join pg_namespace ns on ns.oid = t.typnamespace
  join pg_enum e on e.enumtypid = t.oid
  where ns.nspname = 'public' and t.typname = 'project_status';
  if txt is distinct from 'lead,offer,contract,active,suspended,closed' then
    raise exception 'P3-03: expected project_status to be (lead, offer, contract, active, suspended, closed) IN THAT ORDER, found %', txt;
  end if;

  -- --- the table ----------------------------------------------------------
  select count(*) into n
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'projects' and c.relkind = 'r';
  if n <> 1 then
    raise exception 'P3-03: expected public.projects to exist as a table, found %', n;
  end if;

  -- --- row level security -------------------------------------------------
  select c.relrowsecurity into txt
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'projects';
  if txt is distinct from 'true' then
    raise exception 'P3-03: expected rowsecurity true on public.projects, found %', txt;
  end if;

  -- --- exactly three policies, and no delete policy ------------------------
  select string_agg(cmd, ',' order by cmd) into txt from pg_policies
  where schemaname = 'public' and tablename = 'projects';
  if txt is distinct from 'INSERT,SELECT,UPDATE' then
    raise exception 'P3-03: expected policies for exactly INSERT, SELECT and UPDATE on public.projects, found %', coalesce(txt, 'none');
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'projects' and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-03: public.projects must have NO delete policy, found %', n;
  end if;

  -- --- anon holds nothing, authenticated can read --------------------------
  select count(*) into n from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'projects' and grantee = 'anon';
  if n <> 0 then
    raise exception 'P3-03: anon must hold no privilege on public.projects, found % grants', n;
  end if;

  select count(*) into n from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'projects'
    and grantee = 'authenticated' and privilege_type = 'SELECT';
  if n <> 1 then
    raise exception 'P3-03: authenticated must hold SELECT on public.projects, found % grants', n;
  end if;

  -- --- the foreign key, and that it RESTRICTS ------------------------------
  -- The action is asserted, not only the key. P3-03 says restrict rather than
  -- cascade because a project carries issued material and cost history, and a
  -- client deleted out from under it would orphan real money. A key that had
  -- silently become CASCADE would satisfy "the foreign key is present".
  select pg_get_constraintdef(oid) into txt
  from pg_constraint
  where conrelid = 'public.projects'::regclass and contype = 'f'
    and conkey = array[(select attnum from pg_attribute
                        where attrelid = 'public.projects'::regclass and attname = 'client_id')];
  if txt is null then
    raise exception 'P3-03: expected a foreign key on public.projects.client_id, found none';
  end if;
  if txt not like '%REFERENCES clients(id)%' or txt not like '%ON DELETE RESTRICT%' then
    raise exception 'P3-03: expected client_id to reference clients(id) ON DELETE RESTRICT, found %', txt;
  end if;

  -- --- dates are date, not timestamptz ------------------------------------
  select string_agg(t.typname, ',' order by a.attname) into txt
  from pg_attribute a join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.projects'::regclass
    and a.attname in ('start_date', 'planned_end_date');
  if txt is distinct from 'date,date' then
    raise exception 'P3-03: start_date and planned_end_date must both be date, found %', txt;
  end if;

  -- --- indexes -------------------------------------------------------------
  for txt in select unnest(array['projects_client_id_idx', 'projects_status_idx', 'projects_active_name_idx'])
  loop
    select count(*) into n from pg_indexes
    where schemaname = 'public' and tablename = 'projects' and indexname = txt;
    if n <> 1 then
      raise exception 'P3-03: expected index %, found %', txt, n;
    end if;
  end loop;

  -- --- the updated_at trigger ---------------------------------------------
  select count(*) into n from pg_trigger
  where tgrelid = 'public.projects'::regclass and tgname = 'projects_set_updated_at'
    and not tgisinternal;
  if n <> 1 then
    raise exception 'P3-03: expected trigger projects_set_updated_at, found %', n;
  end if;
end
$$;


-- ===========================================================================
-- BEHAVIOURAL CHECKS
-- ===========================================================================

begin;

insert into public.clients (id, name, fiscal_code) values
  ('33333333-3333-3333-3333-333333333333', 'Beneficiar A SRL', '1001600033333'),
  ('44444444-4444-4444-4444-444444444444', 'Beneficiar B SRL', '1001600044444');

do $$
declare
  n integer;
  s public.project_status;
begin
  -- A lead with nothing but a name must save. That is the row that starts the
  -- pipeline, and every nullable column on this table exists so it can.
  insert into public.projects (client_id, name)
  values ('33333333-3333-3333-3333-333333333333', 'Bloc A');
  select status into s from public.projects where name = 'Bloc A';
  if s <> 'lead' then
    raise exception 'P3-03: expected a new project to default to lead, found %', s;
  end if;

  -- TWO DIFFERENT CLIENTS MAY EACH HAVE A "Bloc A". If the unique constraint
  -- were on name alone this fails, and the second client could never name a
  -- project the same as somebody else's.
  insert into public.projects (client_id, name)
  values ('44444444-4444-4444-4444-444444444444', 'Bloc A');
  select count(*) into n from public.projects where name = 'Bloc A';
  if n <> 2 then
    raise exception 'P3-03: expected two clients to each hold a project named Bloc A, found %', n;
  end if;

  -- The SAME client may not have it twice.
  begin
    insert into public.projects (client_id, name)
    values ('33333333-3333-3333-3333-333333333333', 'Bloc A');
    raise exception 'P3-03: one client was allowed two projects with the same name';
  exception
    when unique_violation then null;
  end;

  -- THE PIPELINE IS NOT A STATE MACHINE. Every backwards move real construction
  -- work makes must be allowed, and the card names all three.
  update public.projects set status = 'contract' where name = 'Bloc A' and client_id = '33333333-3333-3333-3333-333333333333';
  update public.projects set status = 'suspended' where name = 'Bloc A' and client_id = '33333333-3333-3333-3333-333333333333';
  update public.projects set status = 'closed' where name = 'Bloc A' and client_id = '33333333-3333-3333-3333-333333333333';
  update public.projects set status = 'active' where name = 'Bloc A' and client_id = '33333333-3333-3333-3333-333333333333';
  update public.projects set status = 'lead' where name = 'Bloc A' and client_id = '33333333-3333-3333-3333-333333333333';
  select status into s from public.projects
  where name = 'Bloc A' and client_id = '33333333-3333-3333-3333-333333333333';
  if s <> 'lead' then
    raise exception 'P3-03: a closed project could not be walked back to lead, ended at %', s;
  end if;

  -- THE DATE ORDER CHECK, which is the card's named acceptance.
  begin
    insert into public.projects (client_id, name, start_date, planned_end_date)
    values ('33333333-3333-3333-3333-333333333333', 'Data gresita', date '2026-06-01', date '2026-05-01');
    raise exception 'P3-03: a planned end date before the start date was accepted';
  exception
    when check_violation then null;
  end;

  -- Equal dates are fine: a one-day job is a job.
  insert into public.projects (client_id, name, start_date, planned_end_date)
  values ('33333333-3333-3333-3333-333333333333', 'O zi', date '2026-06-01', date '2026-06-01');

  -- EITHER DATE ALONE IS FINE. The check must only bite when both are present,
  -- or a lead with a start date and no estimate could not be saved, which is
  -- the ordinary case this table is for.
  insert into public.projects (client_id, name, start_date)
  values ('33333333-3333-3333-3333-333333333333', 'Doar inceput', date '2026-06-01');
  insert into public.projects (client_id, name, planned_end_date)
  values ('33333333-3333-3333-3333-333333333333', 'Doar termen', date '2026-06-01');

  -- A NULL BUDGET IS NORMAL AND IS NOT AN ERROR, and P3-12 depends on that
  -- staying true: it shows a Romanian empty state rather than a zero, because
  -- zero is a number and an absent budget is not.
  select count(*) into n from public.projects where budget_mdl is null;
  if n < 4 then
    raise exception 'P3-03: expected budget_mdl to be nullable and commonly null, found only % null', n;
  end if;

  -- A client with projects cannot be deleted. This is the RESTRICT, exercised
  -- rather than read off a constraint definition.
  begin
    delete from public.clients where id = '33333333-3333-3333-3333-333333333333';
    raise exception 'P3-03: a client with projects was deleted, so the RESTRICT is not enforcing';
  exception
    when foreign_key_violation then null;
  end;

  -- A project can be recorded in status_history, which is the only reason 0015
  -- exists. Nothing writes this automatically; see the foot of 0016.
  insert into public.status_history (entity_type, entity_id, from_status, to_status)
  select 'project', id, 'lead', 'offer' from public.projects
  where name = 'Bloc A' and client_id = '33333333-3333-3333-3333-333333333333';
  select count(*) into n from public.status_history where entity_type = 'project';
  if n <> 1 then
    raise exception 'P3-03: a project status_history row could not be written, found %', n;
  end if;
end
$$;

rollback;
