-- 0013_clients.sql
-- RC Inventory phase 3, card P3-01. public.clients, the root of the CRM.
--
-- WHAT THIS IS FOR. Today a customer is free text: outbound_issues carries a
-- client_name column that anybody can spell any way they like. This makes the
-- customer a record, so that a job, a delivery and a document can all point at
-- the same one instead of at five spellings of it. Every other card in wave 1
-- and wave 2 hangs off this table.
--
-- IT RUNS AS ONE TRANSACTION: either every object below exists afterwards or
-- none of them do. It is NOT safe to run twice; a second run fails on the first
-- CREATE TYPE and rolls the whole thing back, which is the intended behaviour
-- and is the same behaviour as every migration before it.
--
-- CONVENTIONS ARE COPIED FROM 0001, NOT INVENTED: uuid primary key from
-- gen_random_uuid(); created_at and updated_at timestamptz not null default
-- now() with a trigger calling public.set_updated_at(); enums as
-- create type public.<name> as enum; snake_case; RLS enabled with a select
-- policy to authenticated using (true), insert and update gated on
-- public.is_owner(), and NO delete policy for any role.
--
-- PROVEN BEFORE IT WAS MERGED, WHICH IS NEW. `npm run check:migrations` applies
-- this file, unmodified, to a throwaway postgres:16 alongside every migration
-- before it, then runs the assertions in
-- scripts/poc-free/local-db/assertions/0013_clients.sql against the result.
-- Migrations 0001 to 0012 were merged without any parser having read them.
--
-- NOT APPLIED TO PRODUCTION BY THIS PULL REQUEST. The apply is card P3-27,
-- blocked on Ivan. Merging a migration file changes one text file in a git
-- repository and changes nothing in any database (R-059).

begin;


-- ===========================================================================
-- 1. ENUM
-- ===========================================================================
--
-- Two values, exactly the two P3-01 names. An enum rather than a text column so
-- that a third kind of counterparty is a migration somebody has to write, and
-- not a typo somebody has to find. Stored values are English tokens and the
-- Romanian labels (Companie, Persoana fizica) live in the presentation layer,
-- which is the P2-01 convention and is what public.unit_code and
-- public.status_entity already do.

create type public.client_type as enum ('company', 'individual');


-- ===========================================================================
-- 2. TABLE
-- ===========================================================================

create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  name         text             not null,
  type         public.client_type not null default 'company',
  -- IDNO in the interface. Nullable because in Moldova a company carries one
  -- and a private person does not, so NOT NULL would make the individual type
  -- unusable on the day it is first needed.
  fiscal_code  text             null,
  address      text             null,
  phone        text             null,
  email        text             null,
  notes        text             null,
  -- Hidden from pickers, present in history. Exactly how products.active
  -- already works. There is no delete policy and no delete button anywhere.
  active       boolean          not null default true,
  created_by   uuid             references auth.users (id) on delete set null,
  created_at   timestamptz      not null default now(),
  updated_at   timestamptz      not null default now()
);

comment on table public.clients is
  'Counterparties Rapid Construct sells to. The root of the phase 3 CRM: contacts, projects and every cross-link in wave 2 reference this table. Rows are deactivated, never deleted.';

comment on column public.clients.fiscal_code is
  'IDNO in the interface. Nullable, because an individual has none. Unique only among the rows that have one, via clients_fiscal_code_unique. No format check and no checksum: an IDNO copied off a real contract is the source of truth, and a regex that rejects a valid one is worse than a free text field.';

comment on column public.clients.name is
  'NOT unique. Two legally distinct companies can share a trading name and the IDNO is what separates them. clients_name_lower_idx exists for search, not for uniqueness.';


-- ===========================================================================
-- 3. INDEXES
-- ===========================================================================
--
-- PARTIAL unique on fiscal_code, so that two individuals with no IDNO do not
-- collide. A plain unique index would treat every NULL as distinct in
-- PostgreSQL and would therefore also work, but it would say the wrong thing:
-- the rule is "at most one client per IDNO", and the WHERE clause is that rule
-- written down rather than inferred from NULL semantics.

create unique index clients_fiscal_code_unique
  on public.clients (fiscal_code)
  where fiscal_code is not null;

-- Case-insensitive, for search. Not unique, deliberately, per the column
-- comment above.
create index clients_name_lower_idx on public.clients (lower(name));

-- Every list surface filters on active, and nearly every one of them sorts by
-- name straight afterwards.
create index clients_active_name_idx on public.clients (active, lower(name));


-- ===========================================================================
-- 4. UPDATED_AT TRIGGER
-- ===========================================================================
--
-- public.set_updated_at() already exists, created by 0001. An updated_at column
-- that never updates is a lie the whole system then reads.

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();


-- ===========================================================================
-- 5. GRANTS
-- ===========================================================================
--
-- Deny by default, then grant, exactly as 0001 does.
--
-- THE REVOKE BELOW IS ALREADY A NO-OP, AND IT IS HERE ANYWAY. Supabase grants
-- anon at CREATE TABLE time from project-level default privileges, which is why
-- P3-01 asks for an explicit revoke. **0009 already fixed that one layer
-- deeper**: `alter default privileges for role postgres in schema public revoke
-- all on tables from anon`, so every table created in this schema after 0009,
-- this one included, starts with anon holding nothing.
--
-- PROVEN, NOT ASSUMED. Deleting this line and re-running
-- `npm run check:migrations` still passes, because there is nothing left for it
-- to revoke. Adding `grant select on public.clients to anon` fails, which is
-- what the assertion is actually for.
--
-- It stays because it costs one statement and because the durable protection
-- lives in a different file: if a future migration ever re-grants the anon
-- default privilege, every table that declared its own revoke is still closed
-- and every table that relied on 0009 is open. The comment is here so nobody
-- deletes the line believing it was load-bearing, and nobody keeps it believing
-- it is.
--
-- The revoke is scoped to this table rather than to the whole schema, because a
-- schema-wide statement in a phase 3 migration would silently re-assert a
-- decision that belongs to 0001 and 0009, and would mask a later divergence.

revoke all on table public.clients from anon;

grant select, insert, update, delete on table public.clients to authenticated;

-- DELETE is granted at the table level and denied by RLS, which is the same
-- shape 0001 uses for products and for every other table with no delete policy.
-- The privilege and the policy are two different gates, and this file changes
-- only the second one.


-- ===========================================================================
-- 6. ROW LEVEL SECURITY
-- ===========================================================================

alter table public.clients enable row level security;

create policy clients_select on public.clients
  for select to authenticated using (true);

create policy clients_insert on public.clients
  for insert to authenticated with check (public.is_owner());

create policy clients_update on public.clients
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- No delete policy, and that is the point rather than an omission. A client
-- referenced by a project, an issue or a document cannot disappear without
-- making that history unreadable, so DELETE is denied to every role, owner
-- included. Deactivation is the active boolean; deletion is not a feature.


commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. These three grids are what goes into the apply journal for
-- card P3-27, verbatim, per CLAUDE.md 8.5.
--
-- Expect: public.clients present with rowsecurity true; exactly three policies,
-- select and insert and update, and no delete row at all; and anon holding zero
-- privileges on it.

select
  c.relname                as table_name,
  c.relrowsecurity         as rls_enabled,
  count(p.polname)         as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'clients'
group by c.relname, c.relrowsecurity;

select
  policyname,
  cmd,
  roles,
  qual       as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'clients'
order by policyname;

select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'clients' and grantee = 'anon';
