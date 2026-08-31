-- scripts/poc-free/local-db/assertions/0025_deviz.sql
-- Card P3-13. public.devize and public.deviz_lines. Ruling R-062.
--
-- Every clause of the P3-13 acceptance is asserted here rather than printed as
-- a grid for a human to read, so the migration journal is a thing the pull
-- request PROVED and not a thing somebody transcribed.
--
-- The structural half runs first with no data. The behavioural half runs second
-- inside a transaction that is rolled back, because the no-edit rule and the
-- frozen price are properties of a running database and not of a catalogue
-- query.

-- ===========================================================================
-- STRUCTURE
-- ===========================================================================

do $$
declare
  n integer;
  txt text;
begin
  -- --- the enum, FIVE VALUES IN DECLARATION ORDER --------------------------
  -- Order is asserted, not just membership. The card says the order IS the
  -- pipeline, so a reordering here silently reorders every screen built on it.
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into txt
  from pg_type t
  join pg_namespace ns on ns.oid = t.typnamespace
  join pg_enum e on e.enumtypid = t.oid
  where ns.nspname = 'public' and t.typname = 'deviz_status';
  if txt is distinct from 'draft,sent,accepted,rejected,expired' then
    raise exception 'P3-13: expected deviz_status to be (draft, sent, accepted, rejected, expired) IN THAT ORDER, found %', coalesce(txt, 'no such type');
  end if;

  -- --- both tables exist ---------------------------------------------------
  select count(*) into n
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname in ('devize', 'deviz_lines') and c.relkind = 'r';
  if n <> 2 then
    raise exception 'P3-13: expected public.devize and public.deviz_lines to exist as tables, found % of 2', n;
  end if;

  -- --- NO unit COLUMN ON THE LINE, and that is a requirement, not an omission.
  -- The unit is inherited from public.products and never re-entered.
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'deviz_lines' and column_name = 'unit';
  if n <> 0 then
    raise exception 'P3-13: deviz_lines must have NO unit column, the unit is inherited from the product';
  end if;

  -- --- the money column carries the currency suffix -------------------------
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'deviz_lines' and column_name = 'unit_price_mdl';
  if n <> 1 then
    raise exception 'P3-13: expected deviz_lines.unit_price_mdl, found % (an unsuffixed money column is the odd one in this schema)', n;
  end if;

  -- --- row level security on BOTH ------------------------------------------
  select string_agg(c.relname || '=' || c.relrowsecurity, ',' order by c.relname) into txt
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname in ('devize', 'deviz_lines');
  if txt is distinct from 'devize=true,deviz_lines=true' then
    raise exception 'P3-13: expected rowsecurity true on both tables, found %', txt;
  end if;

  -- --- exactly three policies each, and NO delete policy --------------------
  select string_agg(cmd, ',' order by cmd) into txt from pg_policies
  where schemaname = 'public' and tablename = 'devize';
  if txt is distinct from 'INSERT,SELECT,UPDATE' then
    raise exception 'P3-13: expected policies for exactly INSERT, SELECT and UPDATE on public.devize, found %', coalesce(txt, 'none');
  end if;

  select string_agg(cmd, ',' order by cmd) into txt from pg_policies
  where schemaname = 'public' and tablename = 'deviz_lines';
  if txt is distinct from 'INSERT,SELECT,UPDATE' then
    raise exception 'P3-13: expected policies for exactly INSERT, SELECT and UPDATE on public.deviz_lines, found %', coalesce(txt, 'none');
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename in ('devize', 'deviz_lines') and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-13: neither table may have a delete policy, found %', n;
  end if;

  -- --- anon holds nothing ---------------------------------------------------
  select count(*) into n from information_schema.role_table_grants
  where table_schema = 'public' and table_name in ('devize', 'deviz_lines') and grantee = 'anon';
  if n <> 0 then
    raise exception 'P3-13: anon must hold no privilege on either table, found % grants', n;
  end if;

  -- --- the unique indexes, BY THEIR COLUMNS, not by their names -------------
  select count(*) into n
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'devize' and i.indisunique
    and pg_get_indexdef(i.indexrelid) like '%(project_id, version)%';
  if n <> 1 then
    raise exception 'P3-13: expected one unique index on devize (project_id, version), found %', n;
  end if;

  select count(*) into n
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'deviz_lines' and i.indisunique
    and pg_get_indexdef(i.indexrelid) like '%(deviz_id, product_id)%';
  if n <> 1 then
    raise exception 'P3-13: expected one unique index on deviz_lines (deviz_id, product_id), found %', n;
  end if;

  -- --- the foreign keys, WITH THEIR DELETE ACTIONS ---------------------------
  -- The action is the whole point of each: cascade on the parent because a line
  -- has no meaning apart from its deviz, restrict on the product because a
  -- quoted product cannot vanish out from under the estimate that quoted it.
  select confdeltype into txt from pg_constraint
  where conrelid = 'public.deviz_lines'::regclass and contype = 'f'
    and confrelid = 'public.devize'::regclass;
  if txt is distinct from 'c' then
    raise exception 'P3-13: expected deviz_lines -> devize ON DELETE CASCADE, found confdeltype %', coalesce(txt, 'no such foreign key');
  end if;

  select confdeltype into txt from pg_constraint
  where conrelid = 'public.deviz_lines'::regclass and contype = 'f'
    and confrelid = 'public.products'::regclass;
  if txt is distinct from 'r' then
    raise exception 'P3-13: expected deviz_lines -> products ON DELETE RESTRICT, found confdeltype %', coalesce(txt, 'no such foreign key');
  end if;

  select confdeltype into txt from pg_constraint
  where conrelid = 'public.devize'::regclass and contype = 'f'
    and confrelid = 'public.projects'::regclass;
  if txt is distinct from 'r' then
    raise exception 'P3-13: expected devize -> projects ON DELETE RESTRICT, found confdeltype %', coalesce(txt, 'no such foreign key');
  end if;

  -- --- the check constraints ------------------------------------------------
  select count(*) into n from pg_constraint
  where conrelid = 'public.devize'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%MDL%';
  if n <> 1 then
    raise exception 'P3-13: expected a check constraint pinning currency to MDL on public.devize, found %', n;
  end if;

  select count(*) into n from pg_constraint
  where conrelid = 'public.deviz_lines'::regclass and contype = 'c'
    and conname = 'deviz_lines_quantity_positive';
  if n <> 1 then
    raise exception 'P3-13: expected the quantity > 0 check on public.deviz_lines, found %', n;
  end if;

  -- --- the updated_at triggers ----------------------------------------------
  select count(*) into n from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname in ('devize', 'deviz_lines')
    and not t.tgisinternal and t.tgname like '%set_updated_at';
  if n <> 2 then
    raise exception 'P3-13: expected an updated_at trigger on each table, found %', n;
  end if;
end
$$;


-- ===========================================================================
-- BEHAVIOUR
-- ===========================================================================
--
-- Rolled back. Nothing here survives the file.

begin;

insert into public.clients (id, name)
values ('ed000000-0000-0000-0000-000000000001', 'Client P3-13');

insert into public.projects (id, client_id, name) values
  ('ed100000-0000-0000-0000-000000000001', 'ed000000-0000-0000-0000-000000000001', 'Santier P3-13'),
  ('ed100000-0000-0000-0000-000000000002', 'ed000000-0000-0000-0000-000000000001', 'Santier P3-13 doi');

insert into public.categories (id, name) values ('ed200000-0000-0000-0000-000000000001', 'Test P3-13');

insert into public.products (id, sku, name, category_id, unit, unit_value_mdl) values
  ('ed300000-0000-0000-0000-000000000001', 'TEST-DEVIZ-01', 'Ciment P3-13', 'ed200000-0000-0000-0000-000000000001', 'buc', 100),
  ('ed300000-0000-0000-0000-000000000002', 'TEST-DEVIZ-02', 'Nisip P3-13',  'ed200000-0000-0000-0000-000000000001', 'buc', 50);

do $$
declare
  n integer;
  price numeric;
  approved timestamptz;
begin
  -- --- a draft version 1 ----------------------------------------------------
  insert into public.devize (id, project_id, version)
  values ('ed400000-0000-0000-0000-000000000001', 'ed100000-0000-0000-0000-000000000001', 1);

  select approved_at into approved from public.devize where id = 'ed400000-0000-0000-0000-000000000001';
  if approved is not null then
    raise exception 'P3-13: a draft deviz has approved_at %, expected null', approved;
  end if;

  -- --- TWO VERSIONS ON ONE PROJECT IS THE MODEL, not an error ---------------
  insert into public.devize (id, project_id, version)
  values ('ed400000-0000-0000-0000-000000000002', 'ed100000-0000-0000-0000-000000000001', 2);

  -- --- THE SAME VERSION TWICE ON ONE PROJECT IS NOT ------------------------
  begin
    insert into public.devize (project_id, version)
    values ('ed100000-0000-0000-0000-000000000001', 2);
    raise exception 'P3-13: a second version 2 on the same project was accepted';
  exception when unique_violation then null;
  end;

  -- --- the same version number on a DIFFERENT project is fine --------------
  insert into public.devize (id, project_id, version)
  values ('ed400000-0000-0000-0000-000000000009', 'ed100000-0000-0000-0000-000000000002', 1);

  -- --- currency is pinned to MDL -------------------------------------------
  begin
    insert into public.devize (project_id, version, currency)
    values ('ed100000-0000-0000-0000-000000000002', 77, 'EUR');
    raise exception 'P3-13: a deviz in EUR was accepted, the MDL check did not hold';
  exception when check_violation then null;
  end;

  -- --- a negative margin is refused ----------------------------------------
  begin
    insert into public.devize (project_id, version, margin_percent)
    values ('ed100000-0000-0000-0000-000000000002', 78, -1);
    raise exception 'P3-13: a negative margin_percent was accepted';
  exception when check_violation then null;
  end;

  -- --- lines on a draft -----------------------------------------------------
  insert into public.deviz_lines (deviz_id, product_id, quantity, unit_price_mdl)
  values ('ed400000-0000-0000-0000-000000000001', 'ed300000-0000-0000-0000-000000000001', 10, 100);

  -- --- ONE PRODUCT AT MOST ONCE PER DEVIZ ----------------------------------
  begin
    insert into public.deviz_lines (deviz_id, product_id, quantity, unit_price_mdl)
    values ('ed400000-0000-0000-0000-000000000001', 'ed300000-0000-0000-0000-000000000001', 5, 100);
    raise exception 'P3-13: the same product was accepted twice on one deviz';
  exception when unique_violation then null;
  end;

  -- --- quantity must be positive -------------------------------------------
  begin
    insert into public.deviz_lines (deviz_id, product_id, quantity, unit_price_mdl)
    values ('ed400000-0000-0000-0000-000000000001', 'ed300000-0000-0000-0000-000000000002', 0, 50);
    raise exception 'P3-13: a zero quantity line was accepted';
  exception when check_violation then null;
  end;

  -- --- a draft IS freely editable ------------------------------------------
  update public.deviz_lines set quantity = 12
  where deviz_id = 'ed400000-0000-0000-0000-000000000001';
  update public.devize set notes = 'ciorna, se poate edita'
  where id = 'ed400000-0000-0000-0000-000000000001';

  -- --- THE PRICE IS A SNAPSHOT ---------------------------------------------
  -- The catalogue price moves and the quoted line does not. This is the single
  -- most important behaviour in the card and it is asserted rather than argued.
  update public.products set unit_value_mdl = 999
  where id = 'ed300000-0000-0000-0000-000000000001';

  select unit_price_mdl into price from public.deviz_lines
  where deviz_id = 'ed400000-0000-0000-0000-000000000001'
    and product_id = 'ed300000-0000-0000-0000-000000000001';
  if price is distinct from 100 then
    raise exception 'P3-13: the quoted price followed the catalogue to %, expected the frozen 100', price;
  end if;

  -- --- SENDING IT IS ALLOWED, and it sets nothing ---------------------------
  update public.devize set status = 'sent' where id = 'ed400000-0000-0000-0000-000000000001';
  select approved_at into approved from public.devize where id = 'ed400000-0000-0000-0000-000000000001';
  if approved is not null then
    raise exception 'P3-13: a sent deviz has approved_at %, expected null', approved;
  end if;

  -- --- PAST DRAFT THE LINES ARE FROZEN --------------------------------------
  begin
    update public.deviz_lines set quantity = 99
    where deviz_id = 'ed400000-0000-0000-0000-000000000001';
    raise exception 'P3-13: a line on a SENT deviz was edited';
  exception when restrict_violation then null;
  end;

  -- --- AND SO IS ADDING ONE, which is the larger half of the same hole ------
  begin
    insert into public.deviz_lines (deviz_id, product_id, quantity, unit_price_mdl)
    values ('ed400000-0000-0000-0000-000000000001', 'ed300000-0000-0000-0000-000000000002', 3, 50);
    raise exception 'P3-13: a line was ADDED to a SENT deviz';
  exception when restrict_violation then null;
  end;

  -- --- AND SO IS WHAT THE CLIENT READ ON THE PAGE ---------------------------
  begin
    update public.devize set margin_percent = 15 where id = 'ed400000-0000-0000-0000-000000000001';
    raise exception 'P3-13: the margin on a SENT deviz was edited';
  exception when restrict_violation then null;
  end;

  begin
    update public.devize set notes = 'editat dupa emitere' where id = 'ed400000-0000-0000-0000-000000000001';
    raise exception 'P3-13: the notes on a SENT deviz were edited';
  exception when restrict_violation then null;
  end;

  begin
    update public.devize set version = 7 where id = 'ed400000-0000-0000-0000-000000000001';
    raise exception 'P3-13: the version of a SENT deviz was changed';
  exception when restrict_violation then null;
  end;

  -- --- THE STATUS ITSELF STAYS EDITABLE, or the pipeline cannot move --------
  update public.devize set status = 'accepted' where id = 'ed400000-0000-0000-0000-000000000001';
  select approved_at into approved from public.devize where id = 'ed400000-0000-0000-0000-000000000001';
  if approved is null then
    raise exception 'P3-13: accepting a deviz did not set approved_at';
  end if;

  update public.devize set status = 'rejected' where id = 'ed400000-0000-0000-0000-000000000001';
  select approved_at into approved from public.devize where id = 'ed400000-0000-0000-0000-000000000001';
  if approved is not null then
    raise exception 'P3-13: a deviz moved off accepted still carries approved_at %', approved;
  end if;

  -- --- A NEW VERSION IS HOW YOU CHANGE A QUOTE, and it is unobstructed ------
  insert into public.deviz_lines (deviz_id, product_id, quantity, unit_price_mdl)
  values ('ed400000-0000-0000-0000-000000000002', 'ed300000-0000-0000-0000-000000000001', 12, 999);

  -- --- the two reading queries the card names, and they differ --------------
  select version into n from public.devize
  where project_id = 'ed100000-0000-0000-0000-000000000001'
  order by version desc limit 1;
  if n <> 2 then
    raise exception 'P3-13: the current deviz is version %, expected 2', n;
  end if;

  update public.devize set status = 'accepted' where id = 'ed400000-0000-0000-0000-000000000001';

  select version into n from public.devize
  where project_id = 'ed100000-0000-0000-0000-000000000001' and status = 'accepted'
  order by version desc limit 1;
  if n <> 1 then
    raise exception 'P3-13: the current ACCEPTED deviz is version %, expected 1, which is the point of the two queries being different', n;
  end if;

  -- --- A QUOTED PRODUCT CANNOT BE DELETED OUT FROM UNDER THE LINE ----------
  begin
    delete from public.products where id = 'ed300000-0000-0000-0000-000000000001';
    raise exception 'P3-13: a product quoted on a deviz line was deleted';
  exception when foreign_key_violation then null;
  end;

  -- --- A PROJECT CARRYING A DEVIZ CANNOT BE DELETED EITHER ------------------
  begin
    delete from public.projects where id = 'ed100000-0000-0000-0000-000000000001';
    raise exception 'P3-13: a project carrying a deviz was deleted';
  exception when foreign_key_violation then null;
  end;
end
$$;

rollback;
