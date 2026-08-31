-- 0025_deviz.sql
-- RC Inventory phase 3, card P3-13. public.devize and public.deviz_lines: the
-- estimate a job is quoted on, versioned, with the five-state pipeline and the
-- unit price frozen on the line at the moment it is quoted.
--
-- ONE ROW OF public.devize IS ONE VERSION. Versioning is not a second table.
-- The CURRENT deviz of a project is the highest version on it. The CURRENT
-- ACCEPTED deviz is the highest version whose status is accepted, and that is
-- the one and only row the procurement card reads. Two different queries, both
-- needed, and neither of them is a column here.
--
-- THE PRICE IS A SNAPSHOT AND THIS FILE IS WHERE THAT BECOMES TRUE.
-- deviz_lines.unit_price_mdl is written once from the catalogue and is never
-- refreshed from it. No view, function or query in this card or any later one
-- joins a deviz line to the live catalogue price to produce the quoted figure.
-- A default-and-override would look identical on the day it was written and
-- diverge silently three months later, which is the failure the owner addendum
-- names by hand.
--
-- THE UNIT IS THE DELIBERATE OPPOSITE AND BOTH ARE RIGHT. There is no unit
-- column here: the line renders public.products.unit and nobody re-types it. A
-- unit is a property of the product and does not change because of who is being
-- quoted. A price is a promise made on a day.
--
-- IT RUNS AS ONE TRANSACTION and is NOT safe to run twice.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs
-- scripts/poc-free/local-db/assertions/0025_deviz.sql.
--
-- NOT APPLIED TO PRODUCTION BY THIS PULL REQUEST. The apply is card P3-27, and
-- this file joins the pending register in docs/migrations/APPLY-LOG.md until it
-- runs. Ruling R-062.

begin;


-- ===========================================================================
-- 1. THE STATUS ENUM
-- ===========================================================================
--
-- FIVE VALUES, IN THIS ORDER, AND THE ORDER IS THE PIPELINE. The owner addendum
-- fixed the set and the sequence; only 'accepted' feeds the procurement card.
--
-- Stored values are English tokens and the Romanian labels the interface shows
-- are Ciorna, Emis, Acceptat, Respins and Expirat, living in the presentation
-- layer. That is the P2-01 convention, and public.project_status in 0016
-- already follows it. The addendum writes the pipeline as "draft, emis,
-- acceptat, respins, expirat", which is a list of UI states rather than a list
-- of SQL tokens: it is followed on the thing it is about, which is WHICH five
-- states exist and in what order.

create type public.deviz_status as enum (
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired'
);


-- ===========================================================================
-- 2. public.devize
-- ===========================================================================

create table public.devize (
  id              uuid primary key default gen_random_uuid(),

  -- ON DELETE RESTRICT, matching public.projects.client_id in 0016. A deviz is
  -- evidence in a renegotiation and cannot be orphaned by a project row going
  -- away. There is no delete policy on either table anyway; this is the
  -- constraint graph agreeing with that rather than relying on it.
  project_id      uuid not null references public.projects (id) on delete restrict,

  -- Nullable. A first estimate is usually just "the deviz", and forcing a name
  -- onto it would put "Deviz 1" in every row. It earns a name when a project
  -- carries several in parallel.
  name            text null,

  -- NO DEFAULT, deliberately. The next version number is max(version) + 1 on
  -- the project, which a default expression cannot compute without reading the
  -- table it is defaulting on. P3-13b owns the creation path and computes it
  -- there; the unique constraint below is what makes a wrong answer fail loudly
  -- instead of quietly producing two version 1 rows.
  version         integer not null,

  status          public.deviz_status not null default 'draft',

  -- CURRENCY IS A COLUMN BECAUSE THE ADDENDUM LISTS IT, AND THE CHECK PINS IT
  -- TO MDL FOR THIS PHASE. P3-03 ruled multi-currency out of scope and every
  -- wave 3 computation sums MDL. Storing a currency the arithmetic ignores is
  -- the third silent-wrong-number path on this board. The constraint is what a
  -- later card relaxes: CLAUDE.md 8.6 permits ALTER TABLE DROP CONSTRAINT for
  -- exactly this, because a constraint is replaced and never edited.
  currency        public.currency_code not null default 'MDL',

  -- ON THE DEVIZ, NOT ON THE LINE, AND IT APPLIES TO THE TOTAL. The addendum
  -- lists it in the devize field list and lists no per-line markup column. Foot
  -- rows are Subtotal, Adaos, Total.
  margin_percent  numeric(6,2) not null default 0,

  -- RECORDED, NOT ENFORCED BY A JOB. Nothing in this card flips a status on a
  -- date. A deviz still 'sent' whose valid_until has passed is DISPLAYED as
  -- expired with a Romanian warning; the enum value is set by a person. A
  -- scheduler is a separate card and inventing one here is scope.
  valid_until     date null,

  notes           text null,

  -- Set when status becomes accepted and null otherwise, held by the trigger in
  -- section 5 rather than by whichever screen happens to write the status.
  approved_at     timestamptz null,

  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- ONE VERSION NUMBER PER PROJECT. This is the whole versioning model: a
  -- second row claiming version 3 on the same project cannot exist.
  constraint devize_version_unique_per_project unique (project_id, version),

  constraint devize_currency_mdl check (currency = 'MDL'),

  constraint devize_margin_percent_non_negative check (margin_percent >= 0)
);

comment on table public.devize is
  'Estimates. One row is one VERSION. A draft is freely editable; anything past draft is superseded by a new version rather than changed, because a client who received an estimate holds a copy of it and a silently edited estimate is a dispute.';

comment on column public.devize.version is
  'Highest version on a project is the current deviz. Highest version whose status is accepted is the current ACCEPTED deviz, and that is the only row the procurement card reads.';

comment on column public.devize.currency is
  'Pinned to MDL by devize_currency_mdl for this phase. The column exists because the field list asks for it; the constraint exists because every wave 3 computation sums MDL and a currency the arithmetic ignores is a wrong number waiting.';

comment on column public.devize.valid_until is
  'Recorded, never enforced by a scheduler. An expired-looking deviz is DISPLAYED as expired; the enum value is set by a person.';


-- ===========================================================================
-- 3. public.deviz_lines
-- ===========================================================================

create table public.deviz_lines (
  id              uuid primary key default gen_random_uuid(),

  -- ON DELETE CASCADE. A line has no meaning apart from its deviz. This is the
  -- one cascade in the pair and it is deliberate: nothing can delete a deviz
  -- through RLS anyway, so the cascade describes the ownership rather than
  -- opening a path.
  deviz_id        uuid not null references public.devize (id) on delete cascade,

  -- ON DELETE RESTRICT. A quoted product cannot vanish out from under the
  -- estimate that quoted it. Products are deactivated, not deleted.
  product_id      uuid not null references public.products (id) on delete restrict,

  quantity        numeric(14,3) not null,

  -- THE SUFFIX IS NOT DECORATION. Every money column already in this schema
  -- carries it (unit_value_mdl, sale_price_mdl, budget_mdl) and a single
  -- unsuffixed one would be the odd column a later reader has to go and check.
  unit_price_mdl  numeric(14,2) not null,

  line_note       text null,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- ONE PRODUCT AT MOST ONCE PER DEVIZ, so the estimat-against-emis comparison
  -- in P3-13c is a clean join rather than an aggregation over duplicates. A
  -- user needing two lines of the same product is adding quantity, not lines.
  constraint deviz_lines_product_unique_per_deviz unique (deviz_id, product_id),

  constraint deviz_lines_quantity_positive check (quantity > 0),

  constraint deviz_lines_unit_price_non_negative check (unit_price_mdl >= 0)
);

comment on table public.deviz_lines is
  'The lines of one estimate version. No unit column: the unit is inherited from public.products and never re-entered.';

comment on column public.deviz_lines.unit_price_mdl is
  'A SNAPSHOT, written once at line creation from the catalogue and never refreshed from it. Nothing joins this row to the live product price to produce the quoted figure. A price is a promise made on a day.';


-- ===========================================================================
-- 4. INDEXES
-- ===========================================================================
--
-- Every foreign key is indexed on the REFERENCING side, because PostgreSQL
-- indexes only the referenced side and every screen filters on the other one.
--
-- devize.project_id and deviz_lines.deviz_id need no separate index: each is
-- the LEADING column of the unique constraint above it, and the index that
-- constraint creates serves the lookup. Stated here rather than left to be
-- rediscovered as an omission.

create index deviz_lines_product_id_idx on public.deviz_lines (product_id);

-- "The current accepted deviz of this project" is the query the procurement
-- card is made of, and it is project_id then status then the highest version.
create index devize_project_status_version_idx
  on public.devize (project_id, status, version desc);


-- ===========================================================================
-- 5. TRIGGERS
-- ===========================================================================

create trigger devize_set_updated_at
  before update on public.devize
  for each row execute function public.set_updated_at();

create trigger deviz_lines_set_updated_at
  before update on public.deviz_lines
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 5a. approved_at follows the status, and the database holds it
-- ---------------------------------------------------------------------------
--
-- Set when the status BECOMES accepted, cleared whenever it is anything else.
-- A rule the database does not hold is a rule the next screen forgets, and this
-- one has two screens writing the status already.

create or replace function public.devize_sync_approved_at()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'accepted' then
    new.approved_at := null;
    return new;
  end if;

  -- OLD IS READ ONLY UNDER AN EXPLICIT tg_op BRANCH, never inside a boolean
  -- expression that also mentions tg_op. plpgsql raises "record old is not
  -- assigned yet" the moment the field is read on an INSERT, and SQL does not
  -- promise to short-circuit an OR to stop it happening.
  if tg_op = 'INSERT' then
    new.approved_at := now();
  elsif old.status is distinct from 'accepted' then
    new.approved_at := now();
  end if;

  return new;
end;
$$;

comment on function public.devize_sync_approved_at() is
  'P3-13. approved_at is set when the status becomes accepted and null otherwise. Held here so it cannot depend on which screen wrote the status.';

create trigger devize_sync_approved_at
  before insert or update on public.devize
  for each row execute function public.devize_sync_approved_at();


-- ---------------------------------------------------------------------------
-- 5b. A DEVIZ PAST DRAFT IS SUPERSEDED, NEVER EDITED
-- ---------------------------------------------------------------------------
--
-- This is the no-edit rule, and it is enforced HERE rather than in the
-- interface. A client who received an estimate holds a copy of it, the prior
-- version is evidence in a renegotiation, and a rule that lives only in a form
-- handler is a rule the next form handler does not have.
--
-- WHAT STAYS EDITABLE PAST DRAFT, and it is a short list on purpose: status
-- itself, because a sent deviz has to be able to become accepted, rejected or
-- expired, and approved_at, because section 5a writes it. Everything a client
-- would have read on the page they were sent is frozen.
--
-- INSERT IS COVERED ON THE LINES, NOT ONLY UPDATE. Adding a line to a sent
-- deviz changes what was quoted exactly as much as editing one does, and a
-- trigger that caught only UPDATE would leave the larger half of the hole open.
--
-- DELETE IS DELIBERATELY NOT COVERED. Neither table has a delete policy, so no
-- authenticated role can reach a delete at all; a delete trigger here would fire
-- only on the cascade from a devize row that RLS already forbids, and would turn
-- that cascade into an error rather than a refusal.

create or replace function public.deviz_lines_require_draft()
returns trigger
language plpgsql
as $$
declare
  parent_status public.deviz_status;
begin
  -- BOTH SIDES ARE CHECKED ON AN UPDATE, because moving a line from one deviz
  -- to another edits two of them. OLD is read only under an explicit tg_op
  -- branch, for the reason written on devize_sync_approved_at.
  if tg_op = 'UPDATE' then
    select d.status into parent_status from public.devize d where d.id = old.deviz_id;
    if parent_status is distinct from 'draft' then
      raise exception
        'deviz % is % and no longer a draft: create a new version instead of editing this one',
        old.deviz_id, parent_status
        using errcode = 'restrict_violation';
    end if;
  end if;

  select d.status into parent_status from public.devize d where d.id = new.deviz_id;
  if parent_status is distinct from 'draft' then
    raise exception
      'deviz % is % and no longer a draft: create a new version instead of editing this one',
      new.deviz_id, parent_status
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

comment on function public.deviz_lines_require_draft() is
  'P3-13. Lines may be added or changed only while the parent deviz is draft. Past draft a deviz is superseded by a new version, never edited.';

create trigger deviz_lines_require_draft
  before insert or update on public.deviz_lines
  for each row execute function public.deviz_lines_require_draft();


create or replace function public.devize_require_draft_to_edit()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'draft' then
    return new;
  end if;

  if new.project_id     is distinct from old.project_id
     or new.name           is distinct from old.name
     or new.version        is distinct from old.version
     or new.currency       is distinct from old.currency
     or new.margin_percent is distinct from old.margin_percent
     or new.valid_until    is distinct from old.valid_until
     or new.notes          is distinct from old.notes
  then
    raise exception
      'deviz % is % and no longer a draft: only its status may change, create a new version to change what was quoted',
      old.id, old.status
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

comment on function public.devize_require_draft_to_edit() is
  'P3-13. Past draft only status and approved_at may change on a deviz. Everything a client would have read on the page they were sent is frozen.';

-- AFTER devize_sync_approved_at ALPHABETICALLY, AND THAT MATTERS. PostgreSQL
-- fires BEFORE row triggers in name order, so 'devize_require_draft_to_edit'
-- runs first and 'devize_sync_approved_at' second: the guard sees the row as
-- the caller submitted it, before approved_at has been rewritten under it.
-- approved_at is not in the frozen list anyway, so the pair is order-independent
-- today. The names are recorded here so a rename does not quietly change that.
create trigger devize_require_draft_to_edit
  before update on public.devize
  for each row execute function public.devize_require_draft_to_edit();


-- ===========================================================================
-- 6. GRANTS
-- ===========================================================================
--
-- The revoke is a no-op, as it is in 0013, 0014 and 0016: 0009 already revoked
-- the anon default privilege for every table created in this schema afterwards.
-- It is kept so these tables are closed by their own file, and this comment is
-- here so nobody deletes it believing it was load-bearing, or keeps it
-- believing it is.

revoke all on table public.devize from anon;
revoke all on table public.deviz_lines from anon;

grant select, insert, update, delete on table public.devize to authenticated;
grant select, insert, update, delete on table public.deviz_lines to authenticated;


-- ===========================================================================
-- 7. ROW LEVEL SECURITY
-- ===========================================================================
--
-- Copied from public.projects in 0016, not invented: select to authenticated
-- using (true), insert and update gated on public.is_owner(), and NO delete
-- policy for any role.

alter table public.devize enable row level security;

create policy devize_select on public.devize
  for select to authenticated using (true);

create policy devize_insert on public.devize
  for insert to authenticated with check (public.is_owner());

create policy devize_update on public.devize
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());


alter table public.deviz_lines enable row level security;

create policy deviz_lines_select on public.deviz_lines
  for select to authenticated using (true);

create policy deviz_lines_insert on public.deviz_lines
  for insert to authenticated with check (public.is_owner());

create policy deviz_lines_update on public.deviz_lines
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- No delete policy on either table. A deviz referenced by a comparison, a
-- procurement list or a renegotiation cannot disappear without making that
-- history unreadable. Deactivation is a status, deletion is not a feature.


commit;


-- ===========================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ===========================================================================
--
-- NO TOTALS ARE STORED. Subtotal, Adaos and Total are computed from the lines
-- and margin_percent at read time. A stored total is a second copy of a number
-- that has to be kept in step with the rows it came from, and P3-11 already
-- settled that one formula lives in one module.
--
-- NOTHING HERE CREATES A VERSION. Computing max(version) + 1, copying the prior
-- version's lines and freezing the price from the catalogue all belong to
-- P3-13b, which owns the line editor. This file makes a wrong answer impossible
-- to store; it does not compute the right one.
--
-- NOTHING HERE WRITES public.status_history WHEN A DEVIZ STATUS CHANGES. That
-- is the same seam 0016 documented for projects: the convention in this schema
-- is that a status change and its history row are written together inside a SQL
-- FUNCTION, and public.status_entity does not carry a 'deviz' value today.
-- Adding one is a migration of its own, in the card that needs the history.
--
-- NOTHING EXPIRES ON A DATE. See valid_until above.


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- These grids go into the apply journal for card P3-27, verbatim, per
-- CLAUDE.md 8.5. Every one of them is also asserted, so a failure fails the
-- pull request rather than waiting to be read off a grid:
-- scripts/poc-free/local-db/assertions/0025_deviz.sql.

select
  c.relname        as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.polname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname in ('devize', 'deviz_lines')
group by c.relname, c.relrowsecurity
order by c.relname;

select policyname, cmd, roles, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename in ('devize', 'deviz_lines')
order by tablename, policyname;

select e.enumlabel, e.enumsortorder
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public' and t.typname = 'deviz_status'
order by e.enumsortorder;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.devize'::regclass, 'public.deviz_lines'::regclass)
order by conrelid::regclass::text, conname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('devize', 'deviz_lines')
order by tablename, indexname;

select c.relname as table_name, t.tgname as trigger_name, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('devize', 'deviz_lines') and not t.tgisinternal
order by c.relname, t.tgname;
