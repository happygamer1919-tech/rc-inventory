-- scripts/poc-free/local-db/assertions/0021_projects_search_and_status.sql
-- Card P3-07. Assertions for the Proiecte list, the status writer and the
-- history reader. Ruling R-062.

do $$
declare
  n integer;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in ('search_projects', 'set_project_status', 'project_status_history');
  if n <> 3 then
    raise exception 'P3-07: expected all three functions, found %', n;
  end if;
end
$$;

begin;

insert into public.clients (id, name, fiscal_code) values
  ('e7000000-0000-0000-0000-000000000001', 'Client Unu SRL', '1001600000201'),
  ('e7000000-0000-0000-0000-000000000002', 'Client Doi SRL', '1001600000202');

insert into public.projects (id, client_id, name, address, status, budget_mdl, active) values
  ('e7100000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', 'Bloc Țiglă',  'Strada Ștefan 1', 'lead',      100000, true),
  ('e7100000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000001', 'Casa Verde',  'Strada Noua 2',   'contract',  null,   true),
  ('e7100000-0000-0000-0000-000000000003', 'e7000000-0000-0000-0000-000000000002', 'Depozit',     null,              'closed',    50000,  true),
  -- Deactivated. Never in the list, whatever the filters say: `active` is not a
  -- pipeline stage, it is whether the row exists for the user at all.
  ('e7100000-0000-0000-0000-000000000004', 'e7000000-0000-0000-0000-000000000002', 'Sters',       null,              'lead',      null,   false);

do $$
declare
  n     integer;
  txt   text;
  tot   bigint;
  res   record;
begin
  -- --- the four live stages, which is the screen default -------------------
  select count(*) into n
  from public.search_projects('', array['lead','offer','contract','active']);
  if n <> 2 then
    raise exception 'P3-07: the four live stages found %, expected 2', n;
  end if;

  -- THE CLOSED ONE IS NOT IN THE DEFAULT. That is the whole reason the filter
  -- takes an array: a list that opens showing every closed job from two years
  -- ago is the failure the density doctrine exists to stop.
  select count(*) into n
  from public.search_projects('', array['lead','offer','contract','active'])
  where name = 'Depozit';
  if n <> 0 then
    raise exception 'P3-07: a closed project appeared in the default list';
  end if;

  -- And "toate" shows it.
  select count(*) into n
  from public.search_projects('', array['lead','offer','contract','active','suspended','closed']);
  if n <> 3 then
    raise exception 'P3-07: all six stages found %, expected 3 active rows', n;
  end if;

  -- --- A DEACTIVATED PROJECT IS NEVER LISTED -------------------------------
  select count(*) into n from public.search_projects('', null) where name = 'Sters';
  if n <> 0 then
    raise exception 'P3-07: a deactivated project was listed';
  end if;

  -- --- the client filter ----------------------------------------------------
  select count(*) into n
  from public.search_projects('', null, 'e7000000-0000-0000-0000-000000000001');
  if n <> 2 then
    raise exception 'P3-07: the client filter found %, expected 2', n;
  end if;

  -- --- THE CLIENT NAME IS JOINED, NOT RETYPED ------------------------------
  select client_name into txt from public.search_projects('Casa Verde');
  if txt is distinct from 'Client Unu SRL' then
    raise exception 'P3-07: expected the joined client name, found %', coalesce(txt, 'nothing');
  end if;

  -- --- the fold, over name AND address --------------------------------------
  select count(*) into n from public.search_projects('bloc tigla');
  if n <> 1 then
    raise exception 'P3-07: searching a name without diacritics found %, expected 1', n;
  end if;
  select count(*) into n from public.search_projects('stefan');
  if n <> 1 then
    raise exception 'P3-07: searching an address without diacritics found %, expected 1', n;
  end if;

  -- THE CLIENT NAME IS DELIBERATELY NOT SEARCHED by the box. Folding it in
  -- would make a project called "Client Unu" indistinguishable from every
  -- project OF Client Unu, and the client filter is a separate control.
  select count(*) into n from public.search_projects('Client Unu');
  if n <> 0 then
    raise exception 'P3-07: the search box matched a client name, found % rows', n;
  end if;

  -- --- the total travels with the page -------------------------------------
  select count(*), max(total_count) into n, tot
  from public.search_projects('', null, null, 1, 0);
  if n <> 1 or tot <> 3 then
    raise exception 'P3-07: a one-row page returned % rows with a total of %, expected 1 and 3', n, tot;
  end if;

  -- --- THE STATUS WRITER ----------------------------------------------------
  select * into res from public.set_project_status('e7100000-0000-0000-0000-000000000001', 'offer', 'Ofertă trimisă');
  if not res.changed or res.from_status <> 'lead' then
    raise exception 'P3-07: the first status change reported changed=% from=%', res.changed, res.from_status;
  end if;

  select status::text into txt from public.projects where id = 'e7100000-0000-0000-0000-000000000001';
  if txt <> 'offer' then
    raise exception 'P3-07: the status did not move, it is %', txt;
  end if;

  -- THE HISTORY ROW EXISTS, and carries both ends of the move.
  select count(*) into n from public.status_history
  where entity_type = 'project' and entity_id = 'e7100000-0000-0000-0000-000000000001'
    and from_status = 'lead' and to_status = 'offer';
  if n <> 1 then
    raise exception 'P3-07: expected one history row for lead -> offer, found %', n;
  end if;

  -- SETTING THE SAME STATUS WRITES NOTHING AND IS NOT AN ERROR. A double click
  -- is not an event, and a history full of "offer -> offer" is a history nobody
  -- reads.
  select * into res from public.set_project_status('e7100000-0000-0000-0000-000000000001', 'offer');
  if res.changed then
    raise exception 'P3-07: setting the same status reported a change';
  end if;
  select count(*) into n from public.status_history
  where entity_type = 'project' and entity_id = 'e7100000-0000-0000-0000-000000000001';
  if n <> 1 then
    raise exception 'P3-07: setting the same status wrote a row, history is now %', n;
  end if;

  -- THE PIPELINE IS NOT A STATE MACHINE. Every backwards move must work, and
  -- each one must be recorded.
  perform public.set_project_status('e7100000-0000-0000-0000-000000000001', 'active');
  perform public.set_project_status('e7100000-0000-0000-0000-000000000001', 'suspended');
  perform public.set_project_status('e7100000-0000-0000-0000-000000000001', 'closed');
  perform public.set_project_status('e7100000-0000-0000-0000-000000000001', 'lead');
  select count(*) into n from public.status_history
  where entity_type = 'project' and entity_id = 'e7100000-0000-0000-0000-000000000001';
  if n <> 5 then
    raise exception 'P3-07: expected 5 history rows after 5 real moves, found %', n;
  end if;

  -- --- THE HISTORY READER, NEWEST FIRST -------------------------------------
  select to_status into txt from public.project_status_history('e7100000-0000-0000-0000-000000000001') limit 1;
  if txt <> 'lead' then
    raise exception 'P3-07: the newest history entry is %, expected the last move to lead', txt;
  end if;

  -- AND IT DOES NOT LEAK ANOTHER ENTITY KIND. status_history is polymorphic and
  -- an outbound issue id could collide with a project id in a query that forgot
  -- the entity_type filter.
  insert into public.status_history (entity_type, entity_id, from_status, to_status)
  values ('outbound_issue', 'e7100000-0000-0000-0000-000000000001', 'x', 'y');
  select count(*) into n from public.project_status_history('e7100000-0000-0000-0000-000000000001');
  if n <> 5 then
    raise exception 'P3-07: the history reader picked up another entity kind, found % rows', n;
  end if;

  -- An unknown project id is refused with the Romanian sentence, not a null
  -- update that silently does nothing.
  begin
    perform public.set_project_status('00000000-0000-0000-0000-0000000000ff', 'lead');
    raise exception 'P3-07: an unknown project id was accepted by the status writer';
  exception
    when sqlstate 'P0002' then null;
  end;
end
$$;

rollback;
