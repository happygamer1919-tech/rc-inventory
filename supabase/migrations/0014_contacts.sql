-- 0014_contacts.sql
-- RC Inventory phase 3, card P3-02. public.contacts, the people at a client.
--
-- WHAT THIS IS FOR. A construction client is three phone numbers, not one: the
-- site foreman, the accountant and the owner are different people, and the one
-- who answers about a delivery is not the one who answers about an invoice.
-- This table stops the system pretending a company has a single contact.
--
-- IT RUNS AS ONE TRANSACTION and is NOT safe to run twice, the same as every
-- migration before it.
--
-- PROVEN BEFORE IT WAS MERGED. `npm run check:migrations` applies this file,
-- unmodified, to a throwaway postgres:16 alongside every migration before it,
-- then runs scripts/poc-free/local-db/assertions/0014_contacts.sql.
--
-- NOT APPLIED TO PRODUCTION BY THIS PULL REQUEST. The apply is card P3-27,
-- blocked on Ivan, and this file is listed in the pending register in
-- docs/migrations/APPLY-LOG.md until it runs. Ruling R-062.

begin;


-- ===========================================================================
-- 1. TABLE
-- ===========================================================================
--
-- NO ENUM FOR role, AND THIS IS THE ONE PLACE ON THIS BOARD WHERE FREE TEXT IS
-- THE RIGHT ANSWER. P3-02 says so and says why: a role is a description of a
-- person, not an entity anything joins to, nothing computes on it, and the real
-- vocabulary on a Moldovan construction site is longer and less tidy than any
-- enum authored in advance. The interface offers Sef de santier, Contabil,
-- Administrator, Achizitii and Sofer as suggestions, and a user who types
-- something else is not corrected.

create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  -- ON DELETE CASCADE, and this is the only cascade on the phase 3 board.
  -- Every other foreign key here is on delete restrict. A contact has no
  -- meaning without its client and no history row references it, so it is the
  -- one child that should follow its parent. In practice a client is never
  -- deleted either, because there is no delete policy anywhere in this schema.
  client_id   uuid             not null references public.clients (id) on delete cascade,
  name        text             not null,
  role        text             null,
  -- TEXT, NEVER A NUMBER, AND NO FORMAT CHECK. Moldovan numbers are written six
  -- different ways, and a normaliser that reformats what somebody typed off a
  -- business card is a bug that looks like a feature.
  phone       text             null,
  email       text             null,
  is_primary  boolean          not null default false,
  notes       text             null,
  active      boolean          not null default true,
  created_at  timestamptz      not null default now(),
  updated_at  timestamptz      not null default now()
);

comment on table public.contacts is
  'People at a client. A construction client is three phone numbers and not one. Rows are deactivated, never deleted, except when their client is, which cannot happen because there is no delete policy on clients either.';

comment on column public.contacts.role is
  'Free text on purpose, per P3-02. A role is a description of a person, nothing joins to it and nothing computes on it. The interface suggests Sef de santier, Contabil, Administrator, Achizitii and Sofer, and does not correct anything else.';

comment on column public.contacts.is_primary is
  'At most one per client, enforced by contacts_one_primary_per_client. ZERO is legal: a client may have three people and no designated one, and forcing a choice would make the first contact form refuse to save. Setting a new primary clears the old one in the same transaction, which is the application''s job; the index is what makes forgetting it an error rather than a silent second primary.';


-- ===========================================================================
-- 2. INDEXES
-- ===========================================================================

-- AT MOST ONE PRIMARY CONTACT PER CLIENT, ENFORCED IN THE DATABASE. A UI-only
-- rule is not a rule. The index is PARTIAL, so that any number of non-primary
-- contacts coexist and zero primaries is legal.
create unique index contacts_one_primary_per_client
  on public.contacts (client_id)
  where is_primary;

-- Every foreign key gets an index on the REFERENCING side. PostgreSQL indexes
-- only the referenced side, and every screen here filters the other way:
-- "the contacts of this client" is the only query this table has.
create index contacts_client_id_idx on public.contacts (client_id);

-- Case-insensitive, for search across all clients. Not unique: two clients can
-- each employ a Ion Popescu, and so can one.
create index contacts_name_lower_idx on public.contacts (lower(name));


-- ===========================================================================
-- 3. UPDATED_AT TRIGGER
-- ===========================================================================

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();


-- ===========================================================================
-- 4. GRANTS
-- ===========================================================================
--
-- The revoke is a no-op and is here for the same reason it is in 0013: 0009
-- already revoked the anon default privilege for every table created in this
-- schema afterwards, so there is nothing left to take away. It is kept so that
-- this table is closed by its own file and not only by a rule set two
-- migrations before it, and the comment is here so nobody deletes it believing
-- it was load-bearing, or keeps it believing it is.

revoke all on table public.contacts from anon;

grant select, insert, update, delete on table public.contacts to authenticated;


-- ===========================================================================
-- 5. ROW LEVEL SECURITY
-- ===========================================================================

alter table public.contacts enable row level security;

create policy contacts_select on public.contacts
  for select to authenticated using (true);

create policy contacts_insert on public.contacts
  for insert to authenticated with check (public.is_owner());

create policy contacts_update on public.contacts
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- No delete policy, the same as every other table in this schema. A contact is
-- deactivated, not removed. The ON DELETE CASCADE above is about what happens
-- if a client row ever goes, which no policy permits either; it is correctness
-- of the constraint graph rather than a route anybody can take.


commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. These grids go into the apply journal for card P3-27,
-- verbatim, per CLAUDE.md 8.5.
--
-- Expect: public.contacts present with rowsecurity true; exactly three
-- policies, select and insert and update, and no delete row; the foreign key to
-- public.clients; and the partial unique index on client_id.

select
  c.relname        as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.polname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'contacts'
group by c.relname, c.relrowsecurity;

select policyname, cmd, roles, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'contacts'
order by policyname;

select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.contacts'::regclass and contype = 'f';

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'contacts'
order by indexname;
