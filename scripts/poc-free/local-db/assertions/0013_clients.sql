-- scripts/poc-free/local-db/assertions/0013_clients.sql
-- Card P3-01. The acceptance assertions for public.clients, run against the
-- throwaway container AFTER every migration has been applied.
--
-- WHY THIS FILE EXISTS. P3-01's acceptance asks for a MIGRATION JOURNAL showing
-- the table present, RLS enabled, exactly three policies with no delete policy,
-- and anon holding SELECT on none of it. That journal is produced by an apply
-- against production, which is card P3-27 and is Ivan's. Everything in it
-- except the words "on production" is checkable here, on a container, with no
-- credentials, on every push. Ruling R-062.
--
-- IT RAISES RATHER THAN PRINTS. A grid a human reads is exactly the shape
-- CLAUDE.md 8.6 was written to stop. Every check below fails the transaction,
-- which fails psql under ON_ERROR_STOP, which fails the run. Nothing here
-- depends on anybody looking at output.

do $$
declare
  n integer;
  txt text;
begin
  -- --- the table ----------------------------------------------------------
  select count(*) into n
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'clients' and c.relkind = 'r';
  if n <> 1 then
    raise exception 'P3-01: expected public.clients to exist as a table, found % matching relations', n;
  end if;

  -- --- row level security -------------------------------------------------
  select c.relrowsecurity into txt
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'clients';
  if txt is distinct from 'true' then
    raise exception 'P3-01: expected rowsecurity true on public.clients, found %', txt;
  end if;

  -- --- exactly three policies, and which three ----------------------------
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'clients';
  if n <> 3 then
    raise exception 'P3-01: expected exactly 3 policies on public.clients, found %', n;
  end if;

  select string_agg(cmd, ',' order by cmd) into txt from pg_policies
  where schemaname = 'public' and tablename = 'clients';
  if txt <> 'INSERT,SELECT,UPDATE' then
    raise exception 'P3-01: expected policies for INSERT, SELECT and UPDATE, found %', txt;
  end if;

  -- --- and no delete policy, stated separately -----------------------------
  -- The count above already implies it. It is asserted again by name, because
  -- this is the rule the card is actually about: a client referenced by a
  -- project or an issue cannot disappear without making that history
  -- unreadable, and a future migration adding a delete policy must fail here
  -- rather than pass a count that happens to still be three.
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'clients' and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-01: public.clients must have NO delete policy, found %', n;
  end if;

  -- --- anon holds nothing -------------------------------------------------
  -- The acceptance says anon holds SELECT on zero of the phase 3 tables. This
  -- asserts the stronger and simpler thing: anon holds no privilege at all.
  select count(*) into n from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'clients' and grantee = 'anon';
  if n <> 0 then
    raise exception 'P3-01: anon must hold no privilege on public.clients, found % grants', n;
  end if;

  -- --- authenticated can still reach it -----------------------------------
  -- A revoke that took the table away from everybody would satisfy every check
  -- above and ship a table no screen can read.
  select count(*) into n from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'clients'
    and grantee = 'authenticated' and privilege_type = 'SELECT';
  if n <> 1 then
    raise exception 'P3-01: authenticated must hold SELECT on public.clients, found % grants', n;
  end if;

  -- --- the enum ------------------------------------------------------------
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into txt
  from pg_type t
  join pg_namespace ns on ns.oid = t.typnamespace
  join pg_enum e on e.enumtypid = t.oid
  where ns.nspname = 'public' and t.typname = 'client_type';
  if txt is distinct from 'company,individual' then
    raise exception 'P3-01: expected public.client_type to be (company, individual), found %', txt;
  end if;

  -- --- the partial unique index -------------------------------------------
  -- Asserted as a BEHAVIOUR below rather than by reading pg_index, because the
  -- rule is "at most one client per IDNO, and any number with none", and an
  -- index definition string is a description of that rule rather than the rule.
  select count(*) into n from pg_indexes
  where schemaname = 'public' and tablename = 'clients'
    and indexname = 'clients_fiscal_code_unique';
  if n <> 1 then
    raise exception 'P3-01: expected index clients_fiscal_code_unique, found %', n;
  end if;

  -- --- the updated_at trigger ---------------------------------------------
  select count(*) into n from pg_trigger
  where tgrelid = 'public.clients'::regclass and tgname = 'clients_set_updated_at'
    and not tgisinternal;
  if n <> 1 then
    raise exception 'P3-01: expected trigger clients_set_updated_at, found %', n;
  end if;
end
$$;


-- ===========================================================================
-- BEHAVIOURAL CHECKS
-- ===========================================================================
--
-- The block above reads the catalogue. These exercise the rules. A constraint
-- that exists and does not bite is the failure a catalogue read cannot see.
--
-- This runs as the superuser, so RLS is bypassed and these prove the
-- CONSTRAINTS rather than the policies. The policies are proved by the
-- Playwright suite against a real stack, where there is a real session.

begin;

insert into public.clients (name, fiscal_code) values ('Alfa SRL', '1001600012345');
insert into public.clients (name, fiscal_code) values ('Beta SRL', '1001600054321');

-- Two individuals with no IDNO must both be insertable. This is the whole
-- reason the unique index is partial, and the reason the column is nullable.
insert into public.clients (name, type) values ('Ion Popescu', 'individual');
insert into public.clients (name, type) values ('Maria Popescu', 'individual');

-- Two companies may share a trading name. The IDNO is what separates them.
insert into public.clients (name, fiscal_code) values ('Alfa SRL', '1001600099999');

do $$
declare
  n integer;
begin
  select count(*) into n from public.clients;
  if n <> 5 then
    raise exception 'P3-01: expected 5 rows after the inserts above, found %', n;
  end if;

  -- A duplicate IDNO must be refused.
  begin
    insert into public.clients (name, fiscal_code) values ('Gamma SRL', '1001600012345');
    raise exception 'P3-01: a duplicate fiscal_code was accepted, so clients_fiscal_code_unique is not enforcing';
  exception
    when unique_violation then null;
  end;

  -- The trigger must move updated_at. Asserted by comparing to the old value
  -- rather than to now(), because a default of now() would satisfy a
  -- comparison against now() while doing nothing at all.
  update public.clients set updated_at = timestamptz '2000-01-01' where name = 'Beta SRL';
  update public.clients set phone = '+37360000000' where name = 'Beta SRL';
  select count(*) into n from public.clients
  where name = 'Beta SRL' and updated_at > timestamptz '2020-01-01';
  if n <> 1 then
    raise exception 'P3-01: clients_set_updated_at did not move updated_at on update';
  end if;

  -- The default type is company.
  select count(*) into n from public.clients where name = 'Alfa SRL' and type = 'company';
  if n <> 2 then
    raise exception 'P3-01: expected type to default to company, found % of 2', n;
  end if;
end
$$;

-- The fixture is rolled back. This file must leave the container exactly as it
-- found it, so that a later assertion file cannot pass or fail because of rows
-- this one left behind.
rollback;
