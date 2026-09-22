-- assertions/0040_client_leaduri.sql
-- Card P3-45. The source, interest and owner columns, the first-stage form of the
-- stage writer, the shared search predicate, the list with its two views, and the
-- count per stage. Ruling R-062.
--
-- WHAT THIS FILE CANNOT PROVE, SAID HERE SO NOBODY READS IT AS PROVEN. "Overdue
-- in Chisinau and not in UTC" differs only between midnight and about three in
-- the morning in Chisinau, and this file cannot choose the clock it runs at. It
-- asserts the flag against `now() at time zone 'Europe/Chisinau'` on the same
-- clock, which proves the comparison is against that day, and the end to end
-- suite computes the same day in the browser's test runner.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n        integer;
  declared text;
begin
  -- --- five sources, in the handover's order ------------------------------
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into declared
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'client_source';
  if declared is distinct from 'recomandare,telefon,site,vizita,altul' then
    raise exception 'P3-45: client_source is %, expected recomandare,telefon,site,vizita,altul', coalesce(declared, 'nothing');
  end if;

  -- --- three nullable columns, none with a default --------------------------
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'clients' and is_nullable = 'YES' and column_default is null
    and (
      (column_name = 'source'   and udt_name = 'client_source')
      or (column_name = 'interest' and data_type = 'text')
      or (column_name = 'owner_id' and data_type = 'uuid')
    );
  if n <> 3 then
    raise exception 'P3-45: expected source client_source, interest text and owner_id uuid, all nullable with no default, found %', n;
  end if;

  -- --- owner_id references auth.users, on delete set null, like created_by ---
  select count(*) into n
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = 'public.clients'::regclass
    and c.contype = 'f'
    and c.confrelid = 'auth.users'::regclass
    and c.confdeltype = 'n'
    and a.attname = 'owner_id';
  if n <> 1 then
    raise exception 'P3-45: clients.owner_id is not a foreign key to auth.users on delete set null (found %)', n;
  end if;

  select count(*) into n
  from pg_indexes
  where schemaname = 'public' and tablename = 'clients' and indexname = 'clients_owner_id_idx';
  if n <> 1 then
    raise exception 'P3-45: clients_owner_id_idx is missing';
  end if;

  -- --- the functions, pinned by signature -----------------------------------
  if to_regprocedure('public.set_client_stage(uuid, public.client_stage, date, boolean)') is null then
    raise exception 'P3-45: set_client_stage(uuid, client_stage, date, boolean) is missing';
  end if;
  if to_regprocedure('public.set_client_stage(uuid, public.client_stage, date)') is null then
    raise exception 'P3-45: the three-parameter set_client_stage from 0039 is gone';
  end if;
  if to_regprocedure('public.match_clients(text, text, text)') is null
     or to_regprocedure('public.search_clients_by_stage(text, text, text, text, text, integer, integer)') is null
     or to_regprocedure('public.client_stage_counts(text, text, text)') is null then
    raise exception 'P3-45: match_clients, search_clients_by_stage or client_stage_counts is missing';
  end if;

  -- 0020's list is kept, not dropped: the application calls it until the probe
  -- sees this file.
  if to_regprocedure('public.search_clients(text, text, text, integer, integer)') is null then
    raise exception 'P3-45: search_clients from 0020 was removed';
  end if;

  -- THE FOURTH PARAMETER HAS NO DEFAULT. With one, a three-argument call would be
  -- ambiguous between the two forms and every stage change would fail.
  select p.pronargdefaults into n
  from pg_proc p
  where p.oid = to_regprocedure('public.set_client_stage(uuid, public.client_stage, date, boolean)');
  if n <> 0 then
    raise exception 'P3-45: the four-parameter set_client_stage carries % default(s), expected none', n;
  end if;
end
$$;


-- ===========================================================================
-- 2. THE FIRST STAGE, AND THE WRITER FROM 0039 STILL BEHAVING AS IT DID
-- ===========================================================================

insert into auth.users (id, email)
values ('e4500000-0000-4000-8000-000000000001', 'p3-45@rc-inventory.local');

set local request.jwt.claims = '{"sub":"e4500000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.clients (id, name) values
  ('e4510000-0000-4000-8000-000000000001', 'P3-45 Prima ofertat'),
  ('e4510000-0000-4000-8000-000000000002', 'P3-45 Prima rece'),
  ('e4510000-0000-4000-8000-000000000003', 'P3-45 Prima fara data');

do $$
declare
  v_quoted constant uuid := 'e4510000-0000-4000-8000-000000000001';
  v_cold   constant uuid := 'e4510000-0000-4000-8000-000000000002';
  v_nodate constant uuid := 'e4510000-0000-4000-8000-000000000003';
  actor    constant uuid := 'e4500000-0000-4000-8000-000000000001';
  n        integer;
  s        text;
  d        date;
  res      record;
  refused  boolean;
begin
  -- --- A FIRST STAGE IS RECORDED FROM NO STAGE, WITH WHO AND WHEN ------------
  select * into res from public.set_client_stage(v_quoted, 'quoted', date '2026-11-20', true);
  if not res.changed or res.from_stage is not null then
    raise exception 'P3-45: the first stage reported changed=% from=%', res.changed, res.from_stage;
  end if;

  select stage::text, follow_up_date into s, d from public.clients where id = v_quoted;
  if s is distinct from 'quoted' or d is distinct from date '2026-11-20' then
    raise exception 'P3-45: the first stage stored stage % date %', s, d;
  end if;

  select count(*) into n
  from public.status_history
  where entity_type = 'client' and entity_id = v_quoted
    and from_status is null and to_status = 'quoted'
    and changed_by = actor and created_at is not null;
  if n <> 1 then
    raise exception 'P3-45: expected one history row from no stage to quoted with the actor, found %', n;
  end if;

  -- --- COLD IS RECORDED TOO, although the column default already stored it ----
  perform public.set_client_stage(v_cold, 'cold', null, true);
  select count(*) into n
  from public.status_history
  where entity_type = 'client' and entity_id = v_cold and from_status is null and to_status = 'cold';
  if n <> 1 then
    raise exception 'P3-45: a first stage of cold wrote % history row(s), expected one from no stage', n;
  end if;

  -- --- A SECOND "FIRST" STAGE IS REFUSED AND WRITES NOTHING ------------------
  refused := false;
  begin
    perform public.set_client_stage(v_quoted, 'nurture', null, true);
  exception
    when sqlstate 'P0001' then refused := true;
  end;
  if not refused then
    raise exception 'P3-45: a first stage was accepted for a client that already has stage history';
  end if;
  select stage::text into s from public.clients where id = v_quoted;
  select count(*) into n from public.status_history where entity_type = 'client' and entity_id = v_quoted;
  if s is distinct from 'quoted' or n <> 1 then
    raise exception 'P3-45: the refused first stage left stage % and % history row(s)', s, n;
  end if;

  -- --- DE RELUAT WITH NO DATE IS REFUSED ON THE FIRST STAGE TOO, 23514 -------
  refused := false;
  begin
    perform public.set_client_stage(v_nodate, 'follow_up', null, true);
  exception
    when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-45: a first stage of follow_up with no date was accepted';
  end if;
  select stage::text into s from public.clients where id = v_nodate;
  select count(*) into n from public.status_history where entity_type = 'client' and entity_id = v_nodate;
  if s is distinct from 'cold' or n <> 0 then
    raise exception 'P3-45: the refused follow_up first stage left stage % and % history row(s)', s, n;
  end if;

  -- --- THE THREE-PARAMETER FORM STILL RECORDS A MOVE FROM THE STORED STAGE ----
  -- Called with three arguments, a typed null included, which is how the
  -- application and PostgREST call it. An ambiguity would raise here.
  select * into res from public.set_client_stage(v_quoted, 'client'::public.client_stage, null::date);
  if not res.changed or res.from_stage is distinct from 'quoted' then
    raise exception 'P3-45: the three-parameter form reported changed=% from=%', res.changed, res.from_stage;
  end if;
  select count(*) into n
  from public.status_history
  where entity_type = 'client' and entity_id = v_quoted and from_status = 'quoted' and to_status = 'client';
  if n <> 1 then
    raise exception 'P3-45: the move quoted -> client wrote % row(s), expected one', n;
  end if;

  -- The same stage writes nothing, as in 0039.
  perform public.set_client_stage(v_quoted, 'client');
  select count(*) into n from public.status_history where entity_type = 'client' and entity_id = v_quoted;
  if n <> 2 then
    raise exception 'P3-45: setting the same stage changed the history to % row(s), expected 2', n;
  end if;
end
$$;


-- ===========================================================================
-- 3. THE LIST, ITS TWO VIEWS, ITS ORDER AND ITS COUNTS
-- ===========================================================================
--
-- Fixtures are written with their stage directly: they are rows to list, not
-- stage changes, and there is nothing to record. Names sort the opposite way to
-- the dates, so an order by name cannot pass for an order by date.

do $$
declare
  today   constant date := (now() at time zone 'Europe/Chisinau')::date;
  tag     constant text := 'P3-45 Lista';
  n       integer;
  s       text;
  ids_all text;
  ids_two text;
begin
  insert into public.clients (id, name, stage, follow_up_date, active) values
    ('e4520000-0000-4000-8000-000000000001', tag || ' A viitor',    'follow_up', today + 10, true),
    ('e4520000-0000-4000-8000-000000000002', tag || ' Z intarziat', 'nurture',   today - 10, true),
    ('e4520000-0000-4000-8000-000000000003', tag || ' 0 fara data', 'cold',      null,       true),
    ('e4520000-0000-4000-8000-000000000004', tag || ' M azi',       'quoted',    today,      true),
    ('e4520000-0000-4000-8000-000000000005', tag || ' client',      'client',    null,       true),
    ('e4520000-0000-4000-8000-000000000006', tag || ' inactiv',     'cold',      null,       false);

  -- --- LEADURI: OVERDUE FIRST, THEN TODAY AND UPCOMING, THEN NO DATE ---------
  select string_agg(substr(r.name, length(tag) + 2), '|' order by r.ord) into s
  from public.search_clients_by_stage(tag, '', 'active', 'leaduri', null, 25, 0)
    with ordinality as r (id, name, type, phone, active, stage, follow_up_date, overdue, active_projects, total_count, ord);
  if s is distinct from 'Z intarziat|M azi|A viitor|0 fara data' then
    raise exception 'P3-45: the Leaduri order is %, expected Z intarziat|M azi|A viitor|0 fara data', coalesce(s, 'nothing');
  end if;

  -- --- OVERDUE MEANS BEFORE TODAY IN CHISINAU; TODAY IS DUE, NOT OVERDUE -----
  -- Since 0057 (card P3-88) overdue is also only at stage follow_up, so
  -- Z intarziat, a past date at nurture, is no longer overdue: the expected string
  -- read 'Z intarziat=true'. Its order above is unchanged, because the sort did
  -- not change. The follow_up case is asserted in the 0057 assertion file.
  select string_agg(substr(r.name, length(tag) + 2) || '=' || r.overdue::text, '|' order by r.name) into s
  from public.search_clients_by_stage(tag, '', 'active', 'leaduri', null, 25, 0) r;
  if s is distinct from '0 fara data=false|A viitor=false|M azi=false|Z intarziat=false' then
    raise exception 'P3-45: the overdue flags are %', coalesce(s, 'nothing');
  end if;

  -- --- THE TWO VIEWS PARTITION THE UNFILTERED LIST ---------------------------
  select count(*) into n from public.search_clients_by_stage(tag, '', 'active', 'leaduri', null, 25, 0) where stage = 'client';
  if n <> 0 then
    raise exception 'P3-45: the Leaduri view returned % row(s) at stage client', n;
  end if;
  select count(*) into n from public.search_clients_by_stage(tag, '', 'active', 'clienti', null, 25, 0) where stage <> 'client';
  if n <> 0 then
    raise exception 'P3-45: the Clienti view returned % row(s) not at stage client', n;
  end if;

  select string_agg(id::text, ',' order by id) into ids_all
  from public.search_clients_by_stage(tag, '', 'active', null, null, 25, 0);
  select string_agg(id::text, ',' order by id) into ids_two
  from (
    select id from public.search_clients_by_stage(tag, '', 'active', 'leaduri', null, 25, 0)
    union all
    select id from public.search_clients_by_stage(tag, '', 'active', 'clienti', null, 25, 0)
  ) u;
  if ids_all is null or ids_all is distinct from ids_two then
    raise exception 'P3-45: Leaduri plus Clienti is %, the unfiltered list is %', ids_two, ids_all;
  end if;

  -- AND THE UNFILTERED LIST MATCHES THE SAME ROWS AS 0020's search_clients, so the
  -- shared predicate did not drift from the one it replaces.
  select string_agg(id::text, ',' order by id) into s
  from public.search_clients(tag, '', 'active', 25, 0);
  if s is distinct from ids_all then
    raise exception 'P3-45: search_clients_by_stage matched %, search_clients matched %', ids_all, s;
  end if;

  -- The total is the filtered set, on every row.
  select min(total_count) into n from public.search_clients_by_stage(tag, '', 'active', 'leaduri', null, 2, 0);
  if n <> 4 then
    raise exception 'P3-45: the Leaduri total on a page of two is %, expected 4', n;
  end if;

  -- --- ONE STAGE; AN UNKNOWN STAGE OR TYPE IS AN EMPTY LIST, NOT AN ERROR ----
  select string_agg(substr(name, length(tag) + 2), '|') into s
  from public.search_clients_by_stage(tag, '', 'active', 'leaduri', 'quoted', 25, 0);
  if s is distinct from 'M azi' then
    raise exception 'P3-45: the quoted stage filter returned %', coalesce(s, 'nothing');
  end if;
  select count(*) into n from public.search_clients_by_stage(tag, '', 'active', 'leaduri', 'nu_exista', 25, 0);
  if n <> 0 then
    raise exception 'P3-45: an unknown stage token returned % row(s)', n;
  end if;
  select count(*) into n from public.search_clients_by_stage(tag, 'nu_exista', 'active', null, null, 25, 0);
  if n <> 0 then
    raise exception 'P3-45: an unknown type returned % row(s)', n;
  end if;

  -- --- THE STATUS FILTER APPLIES INSIDE THE VIEW -----------------------------
  select count(*) into n from public.search_clients_by_stage(tag, '', 'toate', 'leaduri', null, 25, 0);
  if n <> 5 then
    raise exception 'P3-45: the Leaduri view under toate returned %, expected 5', n;
  end if;

  -- --- THE COUNTS: ALL FIVE STAGES, IN ORDER, UNDER THE SAME FILTERS ---------
  select string_agg(stage::text || '=' || total, ',' order by stage) into s
  from public.client_stage_counts(tag, '', 'active');
  if s is distinct from 'cold=1,nurture=1,follow_up=1,quoted=1,client=1' then
    raise exception 'P3-45: the active counts are %', coalesce(s, 'nothing');
  end if;
  select string_agg(stage::text || '=' || total, ',' order by stage) into s
  from public.client_stage_counts(tag, '', 'toate');
  if s is distinct from 'cold=2,nurture=1,follow_up=1,quoted=1,client=1' then
    raise exception 'P3-45: the counts under toate are %', coalesce(s, 'nothing');
  end if;
  select string_agg(stage::text || '=' || total, ',' order by stage) into s
  from public.client_stage_counts('P3-45 nimic nu se potriveste', '', 'active');
  if s is distinct from 'cold=0,nurture=0,follow_up=0,quoted=0,client=0' then
    raise exception 'P3-45: the counts of an empty search are %, expected five zeros', coalesce(s, 'nothing');
  end if;
end
$$;

rollback;
