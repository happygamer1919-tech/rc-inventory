-- assertions/0079_clients_insert_manager_columns.sql
-- Card P3-255. public.clients refuses an account manager's insert that sets
-- anything beyond name, type, IDNO and phone, and nothing else changes.
--
-- FIVE GROUPS, each with a witness so a trigger that refuses everything, or
-- nothing, fails one of them:
--   1. the account manager's four-field insert is written, stage cold
--   2. the account manager's insert in exactly the shape createWalkInClient
--      sends (address, email and notes null, active true, stage client) is
--      written
--   3. the account manager's insert naming stage quoted, owner_id, notes,
--      active false, source, follow_up_date or created_by of somebody else is
--      refused with P0001 naming the column, and no row is left
--   4. the owner's insert with every column set is written
--   5. THE COLUMN LIST of public.clients is exactly the one the trigger was
--      written for. A migration that adds a column fails here until somebody
--      decides whether an account manager may set it, in the trigger.
--
-- Everything runs inside a transaction that is rolled back.

begin;

insert into auth.users (id, email) values
  ('e3790000-0000-4000-8000-000000000001', 'p3-255-owner@rc-inventory.local'),
  ('e3790000-0000-4000-8000-000000000002', 'p3-255-manager@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3790000-0000-4000-8000-000000000001', 'p3-255-owner@rc-inventory.local', 'owner', true),
  ('e3790000-0000-4000-8000-000000000002', 'p3-255-manager@rc-inventory.local', 'account_manager', true);

-- --- 5. the column list, read as the superuser -----------------------------
do $$
declare
  cols text;
begin
  select string_agg(column_name, ',' order by column_name) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'clients';
  if cols <> 'active,address,created_at,created_by,email,fiscal_code,follow_up_date,id,interest,name,next_action,next_action_at,notes,owner_id,phone,source,stage,type,updated_at' then
    raise exception 'P3-255: public.clients has columns %, the trigger clients_insert_manager_columns was written for another list. Decide in the trigger whether an account manager may set the new column, then update this list.', cols;
  end if;
end
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3790000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  manager constant uuid := 'e3790000-0000-4000-8000-000000000002';
  owner_u constant uuid := 'e3790000-0000-4000-8000-000000000001';
  id1     uuid;
  st      text;
  n       integer;
  refused boolean;
  state   text;
  msg     text;
  bad     record;
begin
  -- 1. THE FOUR FIELDS ARE WRITTEN.
  insert into public.clients (name, type, fiscal_code, phone)
  values ('P3-255 patru campuri', 'company', '1009600099255', '069000255')
  returning id, stage::text into id1, st;
  if id1 is null or st <> 'cold' then
    raise exception 'P3-255: the manager four-field insert was not written with stage cold (got %)', st;
  end if;

  -- 2. THE WALK-IN SHAPE IS WRITTEN.
  insert into public.clients (name, type, fiscal_code, address, phone, email, notes, active, stage)
  values ('P3-255 tejghea', 'individual', null, null, '069000256', null, null, true, 'client')
  returning id, stage::text into id1, st;
  if id1 is null or st <> 'client' then
    raise exception 'P3-255: the manager walk-in insert was not written with stage client (got %)', st;
  end if;

  -- 3. EVERY OTHER COLUMN IS REFUSED, one at a time.
  -- The value is a text literal; postgres casts it to the column's type.
  for bad in
    select * from (values
      ('stage',          'quoted'),
      ('owner_id',       manager::text),
      ('notes',          'nota interzisa'),
      ('active',         'false'),
      ('source',         'recomandare'),
      ('follow_up_date', '2026-12-01'),
      ('created_by',     owner_u::text)
    ) as v(col, val)
  loop
    refused := false;
    begin
      execute format(
        'insert into public.clients (name, type, %I) values (%L, %L, %L)',
        bad.col, 'P3-255 refuzat ' || bad.col, 'company', bad.val);
    exception when others then
      refused := true;
      get stacked diagnostics state = returned_sqlstate, msg = message_text;
    end;
    if not refused then
      raise exception 'P3-255: the manager inserted a client setting %', bad.col;
    end if;
    if state <> 'P0001' or msg not like '%' || bad.col || '%' then
      raise exception 'P3-255: the % refusal is % "%", expected P0001 naming the column', bad.col, state, msg;
    end if;
    select count(*) into n from public.clients where name = 'P3-255 refuzat ' || bad.col;
    if n <> 0 then
      raise exception 'P3-255: a refused % insert left % rows', bad.col, n;
    end if;
  end loop;
end
$$;

-- 4. THE OWNER STILL WRITES EVERY COLUMN.
set local request.jwt.claims = '{"sub":"e3790000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  owner_u constant uuid := 'e3790000-0000-4000-8000-000000000001';
  id1     uuid;
begin
  insert into public.clients (name, type, fiscal_code, address, phone, email, notes, active,
                              created_by, stage, follow_up_date, source, interest, owner_id,
                              next_action_at, next_action)
  values ('P3-255 administrator', 'company', '1009600099257', 'Chisinau', '069000257',
          'p3-255@rc-inventory.local', 'nota', false, owner_u, 'follow_up', date '2026-12-01',
          'recomandare', 'acoperis', owner_u, date '2026-12-01', 'sun')
  returning id into id1;
  if id1 is null then
    raise exception 'P3-255: the owner insert with every column was not written';
  end if;
end
$$;

reset role;

rollback;
