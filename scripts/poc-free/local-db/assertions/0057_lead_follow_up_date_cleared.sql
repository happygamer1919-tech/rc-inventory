-- assertions/0057_lead_follow_up_date_cleared.sql
-- Card P3-88. Leaving De reluat with no new date clears the follow-up date, a
-- date passed in the same call is stored, the same stage and every other move
-- keep the date, and the list marks a row overdue only at De reluat. Ruling R-062.
--
-- The same limit 0040's assertion file states: this file cannot choose the clock
-- it runs at, so "before today" is asserted against `now() at time zone
-- 'Europe/Chisinau'` on the same clock.

begin;


-- ===========================================================================
-- 1. THE SHAPE: NO NEW OVERLOAD, NO DEFAULT ADDED
-- ===========================================================================

do $$
declare
  n integer;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'set_client_stage';
  if n <> 2 then
    raise exception 'P3-88: expected the two forms of set_client_stage from 0039 and 0040, found %', n;
  end if;

  select p.pronargdefaults into n
  from pg_proc p
  where p.oid = to_regprocedure('public.set_client_stage(uuid, public.client_stage, date, boolean)');
  if n <> 0 then
    raise exception 'P3-88: the four-parameter set_client_stage carries % default(s), expected none', n;
  end if;

  if to_regprocedure('public.search_clients_by_stage(text, text, text, text, text, integer, integer)') is null then
    raise exception 'P3-88: search_clients_by_stage lost its seven-parameter signature';
  end if;
end
$$;


-- ===========================================================================
-- 2. THE WRITER
-- ===========================================================================

insert into auth.users (id, email)
values ('e8800000-0000-4000-8000-000000000001', 'p3-88@rc-inventory.local');

set local request.jwt.claims = '{"sub":"e8800000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.clients (id, name) values
  ('e8810000-0000-4000-8000-000000000001', 'P3-88 Pleaca din reluat'),
  ('e8810000-0000-4000-8000-000000000002', 'P3-88 Pleaca cu data noua'),
  ('e8810000-0000-4000-8000-000000000003', 'P3-88 Fara data'),
  ('e8810000-0000-4000-8000-000000000004', 'P3-88 Aceeasi etapa'),
  ('e8810000-0000-4000-8000-000000000005', 'P3-88 Data la alta etapa');

do $$
declare
  v_leave   constant uuid := 'e8810000-0000-4000-8000-000000000001';
  v_newdate constant uuid := 'e8810000-0000-4000-8000-000000000002';
  v_nodate  constant uuid := 'e8810000-0000-4000-8000-000000000003';
  v_same    constant uuid := 'e8810000-0000-4000-8000-000000000004';
  v_other   constant uuid := 'e8810000-0000-4000-8000-000000000005';
  n         integer;
  s         text;
  d         date;
  res       record;
  refused   boolean;
begin
  -- --- LEAVING DE RELUAT WITH NO DATE CLEARS IT, THROUGH EITHER FORM ---------
  perform public.set_client_stage(v_leave, 'follow_up', date '2026-09-01');
  select * into res from public.set_client_stage(v_leave, 'nurture'::public.client_stage, null::date);
  if not res.changed or res.from_stage is distinct from 'follow_up' then
    raise exception 'P3-88: leaving follow_up reported changed=% from=%', res.changed, res.from_stage;
  end if;
  select stage::text, follow_up_date into s, d from public.clients where id = v_leave;
  if s is distinct from 'nurture' or d is not null then
    raise exception 'P3-88: leaving follow_up with no date gave stage % date %, expected nurture and null', s, d;
  end if;

  -- The move still wrote its history row: the mechanism did not change.
  select count(*) into n from public.status_history
  where entity_type = 'client' and entity_id = v_leave and from_status = 'follow_up' and to_status = 'nurture';
  if n <> 1 then
    raise exception 'P3-88: the move follow_up -> nurture wrote % history row(s), expected one', n;
  end if;

  -- --- AND BACK TO DE RELUAT NEEDS A DATE AGAIN, 23514 ------------------------
  refused := false;
  begin
    perform public.set_client_stage(v_leave, 'follow_up');
  exception
    when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-88: follow_up with no date was accepted after the date was cleared';
  end if;
  select stage::text, follow_up_date into s, d from public.clients where id = v_leave;
  if s is distinct from 'nurture' or d is not null then
    raise exception 'P3-88: the refused move back left stage % date %', s, d;
  end if;

  -- The four-parameter form, p_first false, clears the same way.
  perform public.set_client_stage(v_leave, 'follow_up', date '2026-09-02', false);
  perform public.set_client_stage(v_leave, 'quoted', null, false);
  select follow_up_date into d from public.clients where id = v_leave;
  if d is not null then
    raise exception 'P3-88: the four-parameter form kept % after leaving follow_up', d;
  end if;

  -- --- LEAVING DE RELUAT WITH A NEW DATE STORES THE NEW DATE -------------------
  perform public.set_client_stage(v_newdate, 'follow_up', date '2026-09-03');
  perform public.set_client_stage(v_newdate, 'quoted', date '2026-12-01');
  select stage::text, follow_up_date into s, d from public.clients where id = v_newdate;
  if s is distinct from 'quoted' or d is distinct from date '2026-12-01' then
    raise exception 'P3-88: leaving follow_up with a new date gave stage % date %', s, d;
  end if;

  -- --- NO DATE, BETWEEN TWO OTHER STAGES: STAYS NULL, NO ERROR ----------------
  perform public.set_client_stage(v_nodate, 'nurture');
  perform public.set_client_stage(v_nodate, 'quoted');
  select stage::text, follow_up_date into s, d from public.clients where id = v_nodate;
  if s is distinct from 'quoted' or d is not null then
    raise exception 'P3-88: a dateless lead moved nurture -> quoted gave stage % date %', s, d;
  end if;

  -- --- THE SAME STAGE KEEPS THE DATE AND WRITES NO ROW ------------------------
  perform public.set_client_stage(v_same, 'follow_up', date '2026-09-04');
  select count(*) into n from public.status_history where entity_type = 'client' and entity_id = v_same;
  select * into res from public.set_client_stage(v_same, 'follow_up');
  if res.changed then
    raise exception 'P3-88: setting follow_up again reported a change';
  end if;
  select follow_up_date into d from public.clients where id = v_same;
  if d is distinct from date '2026-09-04' then
    raise exception 'P3-88: setting follow_up again with no date gave %, expected the date kept', d;
  end if;
  select count(*) - n into n from public.status_history where entity_type = 'client' and entity_id = v_same;
  if n <> 0 then
    raise exception 'P3-88: setting follow_up again wrote % history row(s)', n;
  end if;

  -- --- A MOVE THAT DOES NOT START AT DE RELUAT KEEPS A DATE IT CARRIES ---------
  -- A lead can carry a date at another stage: the add-lead form takes one at any
  -- stage. Only leaving De reluat ends it.
  perform public.set_client_stage(v_other, 'nurture', date '2026-11-11', true);
  perform public.set_client_stage(v_other, 'quoted');
  select follow_up_date into d from public.clients where id = v_other;
  if d is distinct from date '2026-11-11' then
    raise exception 'P3-88: nurture -> quoted with no date gave %, expected the date kept', d;
  end if;
end
$$;


-- ===========================================================================
-- 3. THE LIST: OVERDUE ONLY AT DE RELUAT
-- ===========================================================================

do $$
declare
  today constant date := (now() at time zone 'Europe/Chisinau')::date;
  tag   constant text := 'P3-88 Lista';
  s     text;
begin
  insert into public.clients (id, name, stage, follow_up_date, active) values
    ('e8820000-0000-4000-8000-000000000001', tag || ' reluat trecut',   'follow_up', today - 3, true),
    ('e8820000-0000-4000-8000-000000000002', tag || ' reluat azi',      'follow_up', today,     true),
    ('e8820000-0000-4000-8000-000000000003', tag || ' cultivare trecut', 'nurture',  today - 3, true),
    ('e8820000-0000-4000-8000-000000000004', tag || ' ofertat trecut',  'quoted',    today - 3, true),
    ('e8820000-0000-4000-8000-000000000005', tag || ' rece fara data',  'cold',      null,      true);

  select string_agg(substr(r.name, length(tag) + 2) || '=' || r.overdue::text, '|' order by r.name) into s
  from public.search_clients_by_stage(tag, '', 'active', 'leaduri', null, 25, 0) r;
  if s is distinct from
     'cultivare trecut=false|ofertat trecut=false|rece fara data=false|reluat azi=false|reluat trecut=true' then
    raise exception 'P3-88: the overdue flags are %', coalesce(s, 'nothing');
  end if;

  -- The sort is unchanged: every past date still sorts before today, whatever the
  -- stage, and a row with no date is last.
  select string_agg(substr(r.name, length(tag) + 2), '|' order by r.ord) into s
  from public.search_clients_by_stage(tag, '', 'active', 'leaduri', null, 25, 0)
    with ordinality as r (id, name, type, phone, active, stage, follow_up_date, overdue, active_projects, total_count, ord);
  if s is distinct from 'cultivare trecut|ofertat trecut|reluat trecut|reluat azi|rece fara data' then
    raise exception 'P3-88: the Leaduri order is %', coalesce(s, 'nothing');
  end if;
end
$$;

rollback;
