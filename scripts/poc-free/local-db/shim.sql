-- scripts/poc-free/local-db/shim.sql
-- AUT-14. The Supabase objects a stock postgres:16 image does not have.
--
-- WHY THIS FILE EXISTS. Every migration in supabase/migrations/ is written for
-- a Supabase project, so it references objects Supabase provisions before any
-- migration runs: three roles, two schemas, and five objects inside them. On a
-- bare postgres:16 those do not exist and 0001 fails on its first foreign key.
-- This file creates exactly those, and nothing else, so that every migration
-- applies UNMODIFIED. That last word is the whole point: a shim that required
-- editing a migration would prove nothing about the file that gets applied to
-- the client's database.
--
-- THE SCOPE RULE. This file contains ONLY what Supabase itself provides. It
-- never contains a table, column, function or policy that belongs to this
-- product; those live in supabase/migrations/ where they can be reviewed. If a
-- migration needs an object that is not here, ADD IT HERE WITH A COMMENT
-- NAMING THE MIGRATION THAT NEEDED IT. Do not edit the migration to suit the
-- shim.
--
-- THE OBJECT COUNT IS NOT ASSERTED ANYWHERE, deliberately. Three committed
-- documents disagree about whether it is five, nine or ten, and a check that
-- asserted a number would fail for a reason unrelated to whether the shim
-- works. This file is the authority on its own contents; the enumeration below
-- is a reading aid, not a contract.
--
--   roles     anon, authenticated, service_role
--   schemas   auth, storage
--   auth      users, uid(), role()
--   storage   buckets, objects
--
-- IT NEVER TOUCHES A REAL DATABASE. apply.mjs runs it inside a container it
-- started itself and takes no host argument. See that file's header.

-- ===========================================================================
-- 1. ROLES
-- ===========================================================================
--
-- Supabase creates these at project setup. The migrations grant to them by
-- name (`to anon`, `to authenticated`, `to service_role`) and a GRANT to a
-- role that does not exist is an error, not a no-op.
--
-- NOLOGIN on all three. Nothing here ever authenticates as them; the
-- migrations only name them in GRANT, REVOKE and policy `to` clauses. A
-- LOGIN role would be a password-less account on a container that also binds
-- a port, which is a worse shim than a correct one.
--
-- The DO block makes this file re-runnable against a container that already
-- has them. CREATE ROLE has no IF NOT EXISTS.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- service_role carries BYPASSRLS on a real project, which is what makes it the
-- service key. It is set above rather than mentioned in a comment because a
-- migration that tests a service_role path would otherwise pass here and fail
-- there.

grant usage on schema public to anon, authenticated, service_role;

-- --- DEFAULT PRIVILEGES, AND THIS IS THE LEAST OBVIOUS OBJECT IN THE FILE ---
--
-- A Supabase project sets ALTER DEFAULT PRIVILEGES so that anon, authenticated
-- and service_role are granted on every table created in `public` AT CREATE
-- TABLE TIME. Nothing in a migration does it; it is already there when the
-- first migration runs.
--
-- WITHOUT THIS THE SHIM MAKES A WHOLE CLASS OF ASSERTION VACUOUSLY TRUE. Every
-- migration in this repository revokes anon explicitly, and 0001 says why in a
-- comment: an accidentally permissive policy later must not be able to open a
-- table to the public internet on its own. On a bare postgres, anon is granted
-- nothing at CREATE TABLE, so "anon holds no privilege on this table" passes
-- whether or not the revoke is present.
--
-- FOUND BY MUTATION, NOT BY READING. Deleting `revoke all on table
-- public.clients from anon` from 0013 and re-running this check produced exit
-- 0, which is the answer that says the check is not checking. Added by card
-- P3-01, 2026-08-30.

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;


-- ===========================================================================
-- 2. SCHEMAS
-- ===========================================================================

create schema if not exists auth;
create schema if not exists storage;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role;


-- ===========================================================================
-- 3. auth.users
-- ===========================================================================
--
-- Referenced by six foreign keys across 0001, 0008 and 0010, always as
-- `references auth.users (id)`. Only the primary key is load-bearing for a
-- migration apply; the other columns are here because a fixture that seeds a
-- user needs somewhere to put an email, and a shim that forces the fixture to
-- invent a column is a shim the fixture has to work around.
--
-- This is NOT the real GoTrue table. It has the columns this repository
-- touches and no others, and it is never used to reason about what Supabase
-- auth does.

create table if not exists auth.users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);


-- ===========================================================================
-- 4. auth.uid() and auth.role()
-- ===========================================================================
--
-- Fifteen policies call auth.uid(). On a real project it reads the JWT claim
-- out of the request-local setting `request.jwt.claims`. That is reproduced
-- here rather than stubbed to null, so that a policy which compares
-- auth.uid() to a column can actually be exercised: a test sets
--
--   set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
--
-- and the policy behaves as it does in production. A stub returning null would
-- make every owner-scoped policy silently deny, and a suite that only ever
-- sees denial proves nothing about the allow path.
--
-- current_setting(..., true) returns null instead of erroring when the setting
-- is unset, which is the behaviour a policy needs outside a request.

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''),
    current_setting('request.jwt.claim.role', true),
    'anon'
  )
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;


-- ===========================================================================
-- 5. storage.buckets and storage.objects
-- ===========================================================================
--
-- Needed by 0002, which inserts the rc-docs bucket and creates three policies
-- on storage.objects.
--
-- The column list on buckets is the subset 0002 writes: id, name, public,
-- file_size_limit, allowed_mime_types. The column list on objects is the
-- subset its policies read, which is bucket_id, plus the identity columns any
-- fixture would need.
--
-- RLS IS ENABLED ON storage.objects HERE, because 0002's comment says "RLS is
-- already enabled on storage.objects by Supabase" and then relies on it: it
-- creates policies and never enables RLS itself. A shim that left RLS off
-- would apply 0002 cleanly and produce a bucket with policies that do not
-- restrict anything, which is the failure this whole tool exists to catch
-- before it reaches a real project.

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid references auth.users (id) on delete set null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null references storage.buckets (id) on delete cascade,
  name       text not null,
  owner      uuid references auth.users (id) on delete set null,
  metadata   jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- Supabase grants the API roles on its own storage tables. Reproduced so that
-- a REVOKE in a later migration has something to revoke, which is the shape
-- 0009 uses on the product tables and the shape a storage migration would use.
grant select, insert, update, delete on storage.buckets to service_role;
grant select, insert, update, delete on storage.objects to service_role;
grant select, insert, update on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
