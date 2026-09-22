-- assertions/0058_client_next_action.sql
-- Card P3-89. The two next step columns exist, nullable and without a default;
-- search_clients_next_action returns them and orders Leaduri by the next step
-- date, else the follow-up date; search_clients_by_stage is untouched and both
-- lists agree on every row, view and flag. Ruling R-062.
--
-- The same limit 0040's assertion file states: this file cannot choose the clock
-- it runs at, so "before today" is asserted against `now() at time zone
-- 'Europe/Chisinau'` on the same clock.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n integer;
  s text;
begin
  select string_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, 'none'), '|' order by column_name)
    into s
  from information_schema.columns
  where table_schema = 'public' and table_name = 'clients'
    and column_name in ('next_action_at', 'next_action');
  if s is distinct from 'next_action:text:YES:none|next_action_at:date:YES:none' then
    raise exception 'P3-89: the next step columns are %, expected two nullable columns with no default', coalesce(s, 'missing');
  end if;

  if to_regprocedure('public.search_clients_next_action(text, text, text, text, text, integer, integer)') is null then
    raise exception 'P3-89: search_clients_next_action with seven parameters is missing';
  end if;

  -- THE OLD LIST IS NOT TOUCHED: same signature, same ten output columns.
  if to_regprocedure('public.search_clients_by_stage(text, text, text, text, text, integer, integer)') is null then
    raise exception 'P3-89: search_clients_by_stage lost its seven-parameter signature';
  end if;
  select count(*) into n
  from pg_proc p, unnest(p.proargmodes) m
  where p.oid = to_regprocedure('public.search_clients_by_stage(text, text, text, text, text, integer, integer)')
    and m = 't';
  if n <> 10 then
    raise exception 'P3-89: search_clients_by_stage returns % columns, expected the ten from 0040', n;
  end if;

  -- The new list is callable by the application's role.
  if not has_function_privilege('authenticated',
       'public.search_clients_next_action(text, text, text, text, text, integer, integer)', 'execute') then
    raise exception 'P3-89: authenticated cannot execute search_clients_next_action';
  end if;
end
$$;


-- ===========================================================================
-- 2. THE LIST
-- ===========================================================================

do $$
declare
  today constant date := (now() at time zone 'Europe/Chisinau')::date;
  tag   constant text := 'P3-89 Lista';
  s     text;
  t     text;
begin
  -- Direct inserts, as the owner's session is not needed to read the list here.
  -- follow_up rows carry both dates equal, as the edit sheet writes them.
  insert into public.clients (id, name, stage, follow_up_date, next_action_at, next_action, active) values
    ('e8920000-0000-4000-8000-000000000001', tag || ' A pas tarziu',       'nurture',   null,       today + 20, 'trimit oferta', true),
    ('e8920000-0000-4000-8000-000000000002', tag || ' B pas devreme',      'quoted',    null,       today + 2,  'sun',           true),
    ('e8920000-0000-4000-8000-000000000003', tag || ' C fara pas',         'cold',      null,       null,       null,            true),
    ('e8920000-0000-4000-8000-000000000004', tag || ' D reluat vechi',     'follow_up', today - 3,  null,       null,            true),
    ('e8920000-0000-4000-8000-000000000005', tag || ' E reluat cu pas',    'follow_up', today + 5,  today + 5,  null,            true),
    ('e8920000-0000-4000-8000-000000000006', tag || ' F client cu pas',    'client',    null,       today + 1,  'factura',       true);

  -- --- LEADURI ORDER: NEXT STEP DATE, ELSE FOLLOW-UP DATE, NONE LAST ----------
  -- D has only a follow-up date, three days ago, and keeps today's place first.
  select string_agg(substr(r.name, length(tag) + 2), '|' order by r.ord) into s
  from public.search_clients_next_action(tag, '', 'active', 'leaduri', null, 25, 0)
    with ordinality as r (id, name, type, phone, active, stage, follow_up_date, next_action_at, next_action, overdue, active_projects, total_count, ord);
  if s is distinct from 'D reluat vechi|B pas devreme|E reluat cu pas|A pas tarziu|C fara pas' then
    raise exception 'P3-89: the Leaduri order is %', coalesce(s, 'nothing');
  end if;

  -- --- THE TWO COLUMNS COME THROUGH AS STORED --------------------------------
  select string_agg(substr(r.name, length(tag) + 2) || '=' || coalesce((r.next_action_at - today)::text, '-')
                    || '/' || coalesce(r.next_action, '-'), '|' order by r.name) into s
  from public.search_clients_next_action(tag, '', 'active', null, null, 25, 0) r;
  if s is distinct from
     'A pas tarziu=20/trimit oferta|B pas devreme=2/sun|C fara pas=-/-|D reluat vechi=-/-|E reluat cu pas=5/-|F client cu pas=1/factura' then
    raise exception 'P3-89: the next step columns read %', coalesce(s, 'nothing');
  end if;

  -- --- OVERDUE IS 0057's: ONLY AT DE RELUAT, A PAST NEXT STEP IS NOT LATE ------
  update public.clients set next_action_at = today - 10
   where id = 'e8920000-0000-4000-8000-000000000001';
  select string_agg(substr(r.name, length(tag) + 2) || '=' || r.overdue::text, '|' order by r.name) into s
  from public.search_clients_next_action(tag, '', 'active', 'leaduri', null, 25, 0) r;
  select string_agg(substr(r.name, length(tag) + 2) || '=' || r.overdue::text, '|' order by r.name) into t
  from public.search_clients_by_stage(tag, '', 'active', 'leaduri', null, 25, 0) r;
  if s is distinct from 'A pas tarziu=false|B pas devreme=false|C fara pas=false|D reluat vechi=true|E reluat cu pas=false'
     or s is distinct from t then
    raise exception 'P3-89: the overdue flags are % on the new list and % on the old one', coalesce(s, 'nothing'), coalesce(t, 'nothing');
  end if;

  -- --- THE VIEWS, THE STAGE FILTER AND THE TOTAL MATCH THE OLD LIST -----------
  select string_agg(id::text, ',' order by id) into s
  from public.search_clients_next_action(tag, '', 'active', 'clienti', null, 25, 0);
  select string_agg(id::text, ',' order by id) into t
  from public.search_clients_by_stage(tag, '', 'active', 'clienti', null, 25, 0);
  if s is null or s is distinct from t then
    raise exception 'P3-89: the Clienti view is % on the new list and % on the old one', s, t;
  end if;

  select string_agg(substr(name, length(tag) + 2), '|') into s
  from public.search_clients_next_action(tag, '', 'active', 'leaduri', 'quoted', 25, 0);
  if s is distinct from 'B pas devreme' then
    raise exception 'P3-89: the quoted stage filter returned %', coalesce(s, 'nothing');
  end if;

  select min(total_count)::text into s from public.search_clients_next_action(tag, '', 'active', 'leaduri', null, 2, 0);
  if s is distinct from '5' then
    raise exception 'P3-89: the Leaduri total on a page of two is %, expected 5', coalesce(s, 'nothing');
  end if;

  -- --- THE OLD LIST STILL SORTS BY THE FOLLOW-UP DATE ALONE, AS 0057 ----------
  select string_agg(substr(r.name, length(tag) + 2), '|' order by r.ord) into s
  from public.search_clients_by_stage(tag, '', 'active', 'leaduri', null, 25, 0)
    with ordinality as r (id, name, type, phone, active, stage, follow_up_date, overdue, active_projects, total_count, ord);
  if s is distinct from 'D reluat vechi|E reluat cu pas|A pas tarziu|B pas devreme|C fara pas' then
    raise exception 'P3-89: the old Leaduri order changed to %', coalesce(s, 'nothing');
  end if;
end
$$;

rollback;
