-- assertions/0039_client_stage.sql
-- Card P3-43. The client lifecycle stage, the follow-up date, the constraint
-- that ties them, the stage writer and the history reader. Ruling R-062.
--
-- WHAT THIS FILE CANNOT PROVE, SAID HERE SO NOBODY READS IT AS PROVEN. Every row
-- that existed before 0039 becoming 'client' is asserted by 0039 ON ITSELF, in
-- the DO block after the column is added. This file runs after every migration
-- on an empty database, so there is no pre-existing row for it to look at.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n        integer;
  declared text;
  alpha    text;
  txt      text;
begin
  -- --- five stages, in declared order -------------------------------------
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into declared
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'client_stage';
  if declared is distinct from 'cold,nurture,follow_up,quoted,client' then
    raise exception 'P3-43: client_stage is %, expected cold,nurture,follow_up,quoted,client', coalesce(declared, 'nothing');
  end if;

  -- THE ASSERTION ABOVE WOULD BE WORTH NOTHING IF THE DECLARED ORDER HAPPENED TO
  -- BE THE ALPHABETICAL ONE, so the difference is asserted too.
  select string_agg(e.enumlabel, ',' order by e.enumlabel collate "C") into alpha
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'client_stage';
  if alpha = declared then
    raise exception 'P3-43: the alphabetical order of the stages equals the declared order, so no ordering assertion can tell them apart';
  end if;

  -- --- stage: the enum, not null, default cold ------------------------------
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'clients' and column_name = 'stage'
    and udt_name = 'client_stage' and is_nullable = 'NO';
  if n <> 1 then
    raise exception 'P3-43: clients.stage is not a NOT NULL client_stage column (found %)', n;
  end if;

  select column_default into txt
  from information_schema.columns
  where table_schema = 'public' and table_name = 'clients' and column_name = 'stage';
  if txt is null or txt not like '''cold''::%' then
    raise exception 'P3-43: clients.stage defaults to %, expected cold', coalesce(txt, 'nothing');
  end if;

  -- --- follow_up_date: its own nullable DATE column -------------------------
  -- Not text, not timestamptz and not inside notes, so a list can order by it in
  -- the database. Acceptance clause 6.
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'clients' and column_name = 'follow_up_date'
    and data_type = 'date' and is_nullable = 'YES' and column_default is null;
  if n <> 1 then
    raise exception 'P3-43: clients.follow_up_date is not a nullable date column with no default (found %)', n;
  end if;

  -- --- the constraint and both functions ------------------------------------
  select count(*) into n
  from pg_constraint
  where conrelid = 'public.clients'::regclass
    and conname = 'clients_follow_up_date_required' and contype = 'c';
  if n <> 1 then
    raise exception 'P3-43: clients_follow_up_date_required is missing (found %)', n;
  end if;

  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname in ('set_client_stage', 'client_stage_history');
  if n <> 2 then
    raise exception 'P3-43: expected set_client_stage and client_stage_history, found % functions', n;
  end if;
end
$$;


-- ===========================================================================
-- 2. THE BEHAVIOUR
-- ===========================================================================
--
-- The acting user is set the way a real request sets it, so changed_by is
-- exercised rather than left null. The shim's auth.uid() reads this claim.

insert into auth.users (id, email)
values ('e4300000-0000-4000-8000-000000000001', 'p3-43@rc-inventory.local');

set local request.jwt.claims = '{"sub":"e4300000-0000-4000-8000-000000000001","role":"authenticated"}';

-- Created with NO stage named, which is what the client form does.
insert into public.clients (id, name) values
  ('e4310000-0000-4000-8000-000000000001', 'P3-43 Lead Unu');

-- Five fixtures, one per stage, inserted in an order that is neither declared nor
-- alphabetical, for the ordering assertion. Written directly as fixtures: they
-- are not stage CHANGES and there is nothing to record.
insert into public.clients (id, name, stage, follow_up_date) values
  ('e4320000-0000-4000-8000-000000000004', 'P3-43 Ordine D', 'quoted',    null),
  ('e4320000-0000-4000-8000-000000000001', 'P3-43 Ordine A', 'client',    null),
  ('e4320000-0000-4000-8000-000000000003', 'P3-43 Ordine C', 'follow_up', '2026-10-01'),
  ('e4320000-0000-4000-8000-000000000005', 'P3-43 Ordine E', 'cold',      null),
  ('e4320000-0000-4000-8000-000000000002', 'P3-43 Ordine B', 'nurture',   null);

do $$
declare
  v_client constant uuid :='e4310000-0000-4000-8000-000000000001';
  actor constant uuid := 'e4300000-0000-4000-8000-000000000001';
  n    integer;
  s    text;
  d    date;
  res  record;
begin
  -- --- A NEW CLIENT WITH NO STAGE CHOSEN IS A COLD LEAD --------------------
  select stage::text into s from public.clients where id = v_client;
  if s is distinct from 'cold' then
    raise exception 'P3-43: a client created with no stage stored %, expected cold', coalesce(s, 'nothing');
  end if;

  -- --- DE RELUAT WITHOUT A DATE IS REFUSED BY THE DATABASE, 23514 -----------
  -- Directly, as a path that skips every form would.
  begin
    update public.clients set stage = 'follow_up' where id = v_client;
    raise exception 'P3-43: a direct update to follow_up with no date was accepted';
  exception
    when check_violation then null;
  end;

  -- And through the writer, with no date passed and none stored.
  begin
    perform public.set_client_stage(v_client,'follow_up');
    raise exception 'P3-43: set_client_stage accepted follow_up with no date';
  exception
    when check_violation then null;
  end;

  -- THE ROW IS UNCHANGED AND NO HISTORY ROW WAS WRITTEN by either refusal.
  select stage::text, follow_up_date into s, d from public.clients where id = v_client;
  if s is distinct from 'cold' or d is not null then
    raise exception 'P3-43: after two refusals the row is stage % date %, expected cold and null', s, d;
  end if;
  select count(*) into n from public.status_history where entity_type = 'client' and entity_id = v_client;
  if n <> 0 then
    raise exception 'P3-43: a refused stage change wrote % history row(s)', n;
  end if;

  -- --- A STAGE CHANGE WRITES EXACTLY ONE HISTORY ROW, WITH WHO AND WHEN ------
  select * into res from public.set_client_stage(v_client,'nurture');
  if not res.changed or res.from_stage is distinct from 'cold' then
    raise exception 'P3-43: the first stage change reported changed=% from=%', res.changed, res.from_stage;
  end if;

  select count(*) into n
  from public.status_history
  where entity_type = 'client' and entity_id = v_client
    and from_status = 'cold' and to_status = 'nurture'
    and changed_by = actor and created_at is not null;
  if n <> 1 then
    raise exception 'P3-43: expected one history row cold -> nurture carrying the actor and a timestamp, found %', n;
  end if;

  -- --- THE SAME STAGE WRITES NO ROW AND IS NOT AN ERROR ----------------------
  select * into res from public.set_client_stage(v_client,'nurture');
  if res.changed then
    raise exception 'P3-43: setting the same stage reported a change';
  end if;
  select count(*) into n from public.status_history where entity_type = 'client' and entity_id = v_client;
  if n <> 1 then
    raise exception 'P3-43: setting the same stage wrote a row, history is now %', n;
  end if;

  -- --- DE RELUAT WITH A DATE SUCCEEDS, AND THE DATE READS BACK UNCHANGED -----
  perform public.set_client_stage(v_client,'follow_up', '2026-10-15');
  select stage::text, follow_up_date into s, d from public.clients where id = v_client;
  if s is distinct from 'follow_up' or d is distinct from date '2026-10-15' then
    raise exception 'P3-43: follow_up with a date stored stage % date %', s, d;
  end if;

  -- --- LEAVING DE RELUAT KEEPS THE DATE ------------------------------------
  perform public.set_client_stage(v_client,'quoted');
  select stage::text, follow_up_date into s, d from public.clients where id = v_client;
  if s is distinct from 'quoted' or d is distinct from date '2026-10-15' then
    raise exception 'P3-43: leaving follow_up gave stage % date %, expected quoted and the date kept', s, d;
  end if;

  -- --- NOT A STATE MACHINE: backwards moves work, and each one is recorded ---
  perform public.set_client_stage(v_client,'cold');
  perform public.set_client_stage(v_client,'client');
  -- Back to De reluat with no date passed: the kept date satisfies the constraint.
  perform public.set_client_stage(v_client,'follow_up');
  select count(*) into n from public.status_history where entity_type = 'client' and entity_id = v_client;
  if n <> 6 then
    raise exception 'P3-43: expected 6 history rows after 6 real stage changes, found %', n;
  end if;

  -- --- THE HISTORY READER: newest first, and no other entity kind ------------
  select to_status into s from public.client_stage_history(v_client) limit 1;
  if s is distinct from 'follow_up' then
    raise exception 'P3-43: the newest history entry is %, expected the last move to follow_up', s;
  end if;

  insert into public.status_history (entity_type, entity_id, from_status, to_status)
  values ('project', v_client, 'x', 'y');
  select count(*) into n from public.client_stage_history(v_client);
  if n <> 6 then
    raise exception 'P3-43: the history reader picked up another entity kind, found % rows', n;
  end if;

  -- --- THE ORDER IS PART OF THE DATA --------------------------------------
  select string_agg(stage::text, ',' order by stage) into s
  from public.clients
  where id in (
    'e4320000-0000-4000-8000-000000000001', 'e4320000-0000-4000-8000-000000000002',
    'e4320000-0000-4000-8000-000000000003', 'e4320000-0000-4000-8000-000000000004',
    'e4320000-0000-4000-8000-000000000005'
  );
  if s is distinct from 'cold,nurture,follow_up,quoted,client' then
    raise exception 'P3-43: ordering clients by stage gave %, expected the declared order', coalesce(s, 'nothing');
  end if;

  -- --- AN UNKNOWN CLIENT IS REFUSED WITH THE ROMANIAN SENTENCE ---------------
  begin
    perform public.set_client_stage('00000000-0000-0000-0000-0000000000ff', 'nurture');
    raise exception 'P3-43: an unknown client id was accepted by the stage writer';
  exception
    when sqlstate 'P0002' then null;
  end;
end
$$;

rollback;
