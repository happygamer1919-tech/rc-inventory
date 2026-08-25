-- 0001_phase2_schema.sql
-- RC Inventory phase 2, card P2-01. The whole phase 2 schema in one file.
--
-- APPLIED BY IVAN ONLY, by hand, in the Supabase SQL editor on the eu-west-1
-- project. No terminal in this repository ever connects to a database
-- (CLAUDE.md section 8). Paste this file whole and run it once.
--
-- It runs as ONE transaction: either every object below exists afterwards or
-- none of them do. It is NOT safe to run twice; a second run fails on the first
-- CREATE TYPE and rolls the whole thing back, which is the intended behaviour.
--
-- After COMMIT the file runs a verification query that prints every table with
-- its RLS state and its policy count, so the apply can be confirmed by reading
-- one result grid rather than by trusting this comment.
--
-- Conventions (P2-01 defaults): snake_case everywhere, tables plural, columns
-- singular, foreign keys <referenced_table_singular>_id, uuid primary keys from
-- gen_random_uuid(), created_at and updated_at on every table, money
-- numeric(14,2), quantities numeric(14,3) because m2 and m3 are fractional.

begin;

-- ===========================================================================
-- 1. EXTENSIONS
-- ===========================================================================
--
-- None needed, and that is deliberate. gen_random_uuid() has been a core
-- function since PostgreSQL 13 and every Supabase project runs 15 or later, so
-- the pgcrypto CREATE EXTENSION line that usually appears here would add a
-- failure mode (a missing extensions schema, an insufficient privilege) in
-- exchange for nothing.


-- ===========================================================================
-- 2. ENUM TYPES
-- ===========================================================================
--
-- Stored enum values are English tokens. The Romanian labels the UI shows stay
-- in the presentation layer as a lookup (P2-01 defaults: "stored enum values
-- are not UI copy"). The same rule is applied to the status enums below, whose
-- phase 1 display strings are "In asteptare", "Receptionata", "In asteptare
-- expediere" and "Expediata".

-- Exactly two roles, per the card. Adding a third is a new migration and a
-- product decision, not a convenience.
create type public.app_role as enum ('owner', 'account_manager');

-- The seven phase 1 units and nothing else. Romanian display labels, held in
-- the app: m2, lm, buc, sac, kg, rola, m3.
create type public.unit_code as enum ('m2', 'lm', 'pcs', 'bag', 'kg', 'roll', 'm3');

-- No FX rates and no runtime conversion: a stored total in a stored currency,
-- exactly as phase 1 did it.
create type public.currency_code as enum ('EUR', 'RON', 'MDL');

-- Whole-order statuses only. Partial arrivals and partial shipments are out of
-- scope for phase 2 (P2-04 and P2-05 defaults).
create type public.inbound_status as enum ('pending_arrival', 'arrived');
create type public.outbound_status as enum ('awaiting_shipment', 'shipped');

-- status_history is polymorphic across the two order directions.
create type public.status_entity as enum ('inbound_order', 'outbound_issue');


-- ===========================================================================
-- 3. SHARED TRIGGER FUNCTION
-- ===========================================================================
--
-- An updated_at column that never updates is a lie the whole system then reads.
-- One function, one trigger per table, at the bottom of this file.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ===========================================================================
-- 4. TABLES
-- ===========================================================================

-- --- profiles --------------------------------------------------------------
-- One row per Supabase Auth user, carrying the role the whole system gates on.
-- Rows are created by Ivan in the dashboard alongside the auth user; there is
-- no signup page (P2-02 defaults), so nothing inserts here automatically.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  role        public.app_role not null default 'account_manager',
  active      boolean         not null default true,
  created_at  timestamptz     not null default now(),
  updated_at  timestamptz     not null default now()
);

comment on table public.profiles is
  'Role carrier for Supabase Auth users. Default role is the least privileged one, so a profile row created without an explicit role cannot accidentally grant owner.';

-- --- categories ------------------------------------------------------------
-- Phase 1 had seven fixed categories in a type union. Phase 2 makes them rows
-- the client owns. Deliberately NOT seeded: phase 2 starts with an empty
-- database and no migration from any old system, and the phase 1 seven were
-- mock data invented to make a demo look real.
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  sort_order  integer     not null default 0,
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint categories_name_unique unique (name)
);

-- --- units -----------------------------------------------------------------
-- The enum constrains what a unit CAN be; this table carries which units are in
-- play and in what order they list. Seeded with all seven, because the set is
-- fixed by the enum and a units table that starts empty would leave the product
-- form with nothing to choose. No label column: Romanian labels live in the app.
create table public.units (
  code        public.unit_code primary key,
  sort_order  integer     not null default 0,
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into public.units (code, sort_order) values
  ('m2',   1),
  ('lm',   2),
  ('pcs',  3),
  ('bag',  4),
  ('kg',   5),
  ('roll', 6),
  ('m3',   7);

-- --- products --------------------------------------------------------------
-- THERE IS NO stock COLUMN, ON PURPOSE. Current stock is the sum of a product's
-- batches minus what outbound has issued, computed at read time (P2-04
-- defaults). A denormalised counter and a computed sum disagree eventually, and
-- when they do the warehouse trusts the wrong one. The computing view belongs
-- to P2-04, which owns the stock rules; this card creates tables only.
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  sku            text             not null,
  name           text             not null,
  category_id    uuid             not null references public.categories (id) on delete restrict,
  unit           public.unit_code not null references public.units (code) on delete restrict,
  threshold      numeric(14,3)    not null default 0,
  unit_value_mdl numeric(14,2)    not null default 0,
  -- Supplier is a name on the row, not a table: the card's table list is
  -- explicit and carries no suppliers table, and every phase 1 screen that
  -- touches a supplier reads its name to display or to filter by. Promoting it
  -- to a table later is a straightforward migration if the client needs
  -- supplier records of their own.
  supplier_name  text,
  -- Set by P2-09 when an extraction names a product the catalog does not have.
  -- Unmatched names create a flagged product; they never silently merge onto a
  -- similar SKU.
  needs_review   boolean          not null default false,
  active         boolean          not null default true,
  created_at     timestamptz      not null default now(),
  updated_at     timestamptz      not null default now(),
  constraint products_sku_unique unique (sku),
  constraint products_threshold_non_negative check (threshold >= 0),
  constraint products_unit_value_non_negative check (unit_value_mdl >= 0)
);

comment on column public.products.unit is
  'Fixed per product. Changing it after any batch or line references the product would silently reinterpret every stored quantity, so P2-03 locks it once referenced.';

-- --- inbound_orders --------------------------------------------------------
create table public.inbound_orders (
  id                   uuid primary key default gen_random_uuid(),
  reference            text                  not null,
  supplier_name        text,
  currency             public.currency_code  not null default 'EUR',
  total_mdl            numeric(14,2)         not null default 0,
  ordered_at           date,
  expected_at          date,
  arrived_at           timestamptz,
  status               public.inbound_status not null default 'pending_arrival',
  -- Object path inside the PRIVATE rc-docs bucket. Never a public URL: the file
  -- is reached through a short-lived signed URL generated server side (P2-04).
  document_path        text,
  document_uploaded_at timestamptz,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz           not null default now(),
  updated_at           timestamptz           not null default now(),
  constraint inbound_orders_reference_unique unique (reference),
  constraint inbound_orders_total_non_negative check (total_mdl >= 0),
  -- An order cannot be arrived without an arrival timestamp, and cannot carry
  -- one while still pending. The status and the date can never disagree.
  constraint inbound_orders_arrived_at_matches_status check (
    (status = 'arrived' and arrived_at is not null)
    or (status = 'pending_arrival' and arrived_at is null)
  )
);

create table public.order_lines (
  id               uuid primary key default gen_random_uuid(),
  inbound_order_id uuid          not null references public.inbound_orders (id) on delete cascade,
  product_id       uuid          not null references public.products (id) on delete restrict,
  quantity         numeric(14,3) not null,
  unit_price       numeric(14,2),
  created_at       timestamptz   not null default now(),
  constraint order_lines_quantity_positive check (quantity > 0),
  constraint order_lines_unit_price_non_negative check (unit_price is null or unit_price >= 0)
);

-- --- batches ---------------------------------------------------------------
-- One batch per arrived order line. THE UNIQUE CONSTRAINT ON order_line_id IS
-- WHAT MAKES ARRIVAL IDEMPOTENT: a second "mark arrived" cannot create a second
-- batch, and the guarantee lives in the database rather than in whichever code
-- path happens to run. Stock is the sum of these rows.
create table public.batches (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid          not null references public.products (id) on delete restrict,
  inbound_order_id uuid          not null references public.inbound_orders (id) on delete restrict,
  order_line_id    uuid          not null references public.order_lines (id) on delete restrict,
  quantity         numeric(14,3) not null,
  arrived_at       timestamptz   not null default now(),
  created_at       timestamptz   not null default now(),
  constraint batches_order_line_unique unique (order_line_id),
  constraint batches_quantity_positive check (quantity > 0)
);

-- --- outbound_issues -------------------------------------------------------
-- Issue-to-project, never a retail sale: a client, a project, and the materials
-- going to that site (phase 1 RC-07).
create table public.outbound_issues (
  id           uuid primary key default gen_random_uuid(),
  reference    text                   not null,
  client_name  text                   not null,
  project_name text                   not null,
  issued_at    timestamptz            not null default now(),
  shipped_at   timestamptz,
  status       public.outbound_status not null default 'awaiting_shipment',
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz            not null default now(),
  updated_at   timestamptz            not null default now(),
  constraint outbound_issues_reference_unique unique (reference),
  constraint outbound_issues_shipped_at_matches_status check (
    (status = 'shipped' and shipped_at is not null)
    or (status = 'awaiting_shipment' and shipped_at is null)
  )
);

create table public.outbound_lines (
  id                 uuid primary key default gen_random_uuid(),
  outbound_issue_id  uuid          not null references public.outbound_issues (id) on delete cascade,
  product_id         uuid          not null references public.products (id) on delete restrict,
  quantity           numeric(14,3) not null,
  -- Optional and visibly so: Rapid Construct often issues material to its own
  -- job without pricing it. Phase 1 renders a blank as "fara pret".
  sale_price_mdl     numeric(14,2),
  created_at         timestamptz   not null default now(),
  constraint outbound_lines_quantity_positive check (quantity > 0),
  constraint outbound_lines_sale_price_non_negative check (sale_price_mdl is null or sale_price_mdl >= 0)
);

-- --- status_history --------------------------------------------------------
-- Polymorphic across both order directions. INSERT ONLY: there is no update
-- policy and no delete policy anywhere below, for any role, because history
-- that can be edited is not history.
create table public.status_history (
  id          uuid primary key default gen_random_uuid(),
  entity_type public.status_entity not null,
  entity_id   uuid                 not null,
  from_status text,
  to_status   text                 not null,
  note        text,
  changed_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz          not null default now()
);

comment on table public.status_history is
  'Append only. A status that changes without a row here is a defect (P2-04 and P2-05 acceptance both check for it).';

-- --- reminders -------------------------------------------------------------
-- One row per product. is_armed carries the "one email per crossing" rule from
-- P2-10: firing disarms, and stock rising back above the threshold re-arms.
-- Without it, a product sitting under threshold sends one email per outbound
-- line and the operator filters the sender.
--
-- No SMS column: phase 2 has no Twilio and no SMS provider. Phase 1's SMS
-- toggle was UI only and is not carried forward.
create table public.reminders (
  id                      uuid primary key default gen_random_uuid(),
  product_id              uuid        not null references public.products (id) on delete cascade,
  email_enabled           boolean     not null default true,
  is_armed                boolean     not null default true,
  last_fired_at           timestamptz,
  last_stock_at_fire      numeric(14,3),
  last_threshold_at_fire  numeric(14,3),
  -- A failed send never blocks the stock mutation; the reason is recorded here
  -- and shown on the reminders screen (P2-10 defaults).
  last_send_error         text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint reminders_product_unique unique (product_id)
);


-- ===========================================================================
-- 5. INDEXES
-- ===========================================================================
-- Every foreign key gets one: Postgres indexes the referenced side, never the
-- referencing side, and every screen in this app filters on the referencing
-- side.

create index products_category_id_idx        on public.products (category_id);
create index products_unit_idx               on public.products (unit);
create index products_active_idx             on public.products (active);
create index order_lines_inbound_order_id_idx on public.order_lines (inbound_order_id);
create index order_lines_product_id_idx      on public.order_lines (product_id);
create index batches_product_id_idx          on public.batches (product_id);
create index batches_inbound_order_id_idx    on public.batches (inbound_order_id);
create index inbound_orders_status_idx       on public.inbound_orders (status);
create index outbound_lines_issue_id_idx     on public.outbound_lines (outbound_issue_id);
create index outbound_lines_product_id_idx   on public.outbound_lines (product_id);
create index outbound_issues_status_idx      on public.outbound_issues (status);
create index reminders_product_id_idx        on public.reminders (product_id);
-- The lifecycle board reads one entity's history newest first.
create index status_history_entity_idx       on public.status_history (entity_type, entity_id, created_at desc);


-- ===========================================================================
-- 6. ROLE HELPERS
-- ===========================================================================
--
-- SECURITY DEFINER ON PURPOSE, AND THIS IS THE LOAD-BEARING DETAIL OF THE WHOLE
-- POLICY SET. A policy on profiles that reads profiles to find the caller's
-- role recurses forever and Postgres aborts the query. Because this function is
-- SECURITY DEFINER it runs as its owner and bypasses RLS on profiles, so every
-- policy below can ask "is the caller an owner?" without re-entering the
-- policy it is currently evaluating.
--
-- search_path is pinned so the function cannot be redirected by a caller's
-- search_path. It reads exactly one row and returns exactly one value.

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.active
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_app_role() = 'owner', false)
$$;

comment on function public.is_owner() is
  'Returns false for an unauthenticated caller and for a deactivated profile, so a write policy written as is_owner() denies by default.';


-- ===========================================================================
-- 7. GRANTS
-- ===========================================================================
--
-- Deny by default, then grant. Supabase grants table privileges to anon and
-- authenticated at CREATE TABLE time; anon is revoked here explicitly rather
-- than left to RLS alone, so an accidentally permissive policy later cannot
-- open a table to the public internet.

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_owner() to authenticated;


-- ===========================================================================
-- 8. ROW LEVEL SECURITY
-- ===========================================================================
--
-- Enabled on all eleven tables. Count these against the table list in section 4.

alter table public.profiles        enable row level security;
alter table public.categories      enable row level security;
alter table public.units           enable row level security;
alter table public.products        enable row level security;
alter table public.inbound_orders  enable row level security;
alter table public.order_lines     enable row level security;
alter table public.batches         enable row level security;
alter table public.outbound_issues enable row level security;
alter table public.outbound_lines  enable row level security;
alter table public.status_history  enable row level security;
alter table public.reminders       enable row level security;

-- Eleven tables, eleven ENABLE lines. A table added later without one is
-- readable by every authenticated user of the project, which is why P2-03's
-- acceptance proves RLS rather than assuming it.


-- ===========================================================================
-- 9. POLICIES
-- ===========================================================================
--
-- READS are to authenticated only, everywhere. There is no anonymous read of
-- anything in this system.
--
-- WRITES split in two, and the split is the role gate the whole product rests
-- on:
--
--   CATALOG AND IDENTITY (profiles, categories, units, products) are owner
--   write. These define what the warehouse is, and an account manager changing
--   the catalog changes the meaning of every historical row that references it.
--   This is P2-03's stated rule, applied to the sibling catalog tables.
--
--   OPERATIONS (inbound_orders, order_lines, batches, outbound_issues,
--   outbound_lines, status_history, reminders) are writable by BOTH roles. The
--   account_manager role exists to run the daily cycle: enter orders, upload
--   documents, mark arrivals, issue material. A role that can only read cannot
--   do the job the system was bought for. DELETE on the operational tables
--   stays owner-only: creating and correcting is daily work, destroying is not.
--
-- The P2-01 default ("if a table's write rule is not obvious, owner writes and
-- account_manager reads") is applied to the catalog half. The operational half
-- is not a doubtful case: P2-04, P2-05 and P2-14 all describe an operator
-- running the cycle, and P2-02 names exactly one thing the account_manager is
-- refused, which is settings.

-- --- profiles --------------------------------------------------------------
-- A user always sees their own row: the middleware reads profiles.role on every
-- request (P2-02), and that read must work for an account_manager too.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_owner());

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (public.is_owner());

create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.is_owner());

-- --- categories ------------------------------------------------------------
create policy categories_select on public.categories
  for select to authenticated using (true);

create policy categories_insert on public.categories
  for insert to authenticated with check (public.is_owner());

create policy categories_update on public.categories
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy categories_delete on public.categories
  for delete to authenticated using (public.is_owner());

-- --- units -----------------------------------------------------------------
create policy units_select on public.units
  for select to authenticated using (true);

create policy units_insert on public.units
  for insert to authenticated with check (public.is_owner());

create policy units_update on public.units
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy units_delete on public.units
  for delete to authenticated using (public.is_owner());

-- --- products --------------------------------------------------------------
create policy products_select on public.products
  for select to authenticated using (true);

create policy products_insert on public.products
  for insert to authenticated with check (public.is_owner());

create policy products_update on public.products
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- No delete policy: products are deactivated, never removed (P2-03 defaults).
-- A product referenced by a historical batch or order line cannot disappear
-- without making that history unreadable, so DELETE is denied to every role,
-- owner included, and the on delete restrict foreign keys back it up.

-- --- inbound_orders --------------------------------------------------------
create policy inbound_orders_select on public.inbound_orders
  for select to authenticated using (true);

create policy inbound_orders_insert on public.inbound_orders
  for insert to authenticated with check (true);

create policy inbound_orders_update on public.inbound_orders
  for update to authenticated using (true) with check (true);

create policy inbound_orders_delete on public.inbound_orders
  for delete to authenticated using (public.is_owner());

-- --- order_lines -----------------------------------------------------------
create policy order_lines_select on public.order_lines
  for select to authenticated using (true);

create policy order_lines_insert on public.order_lines
  for insert to authenticated with check (true);

create policy order_lines_update on public.order_lines
  for update to authenticated using (true) with check (true);

create policy order_lines_delete on public.order_lines
  for delete to authenticated using (public.is_owner());

-- --- batches ---------------------------------------------------------------
-- Batches are created by arrival, not typed by hand, and their quantities ARE
-- the stock. Update and delete are owner-only because editing a batch silently
-- rewrites current stock for that product.
create policy batches_select on public.batches
  for select to authenticated using (true);

create policy batches_insert on public.batches
  for insert to authenticated with check (true);

create policy batches_update on public.batches
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy batches_delete on public.batches
  for delete to authenticated using (public.is_owner());

-- --- outbound_issues -------------------------------------------------------
create policy outbound_issues_select on public.outbound_issues
  for select to authenticated using (true);

create policy outbound_issues_insert on public.outbound_issues
  for insert to authenticated with check (true);

create policy outbound_issues_update on public.outbound_issues
  for update to authenticated using (true) with check (true);

create policy outbound_issues_delete on public.outbound_issues
  for delete to authenticated using (public.is_owner());

-- --- outbound_lines --------------------------------------------------------
create policy outbound_lines_select on public.outbound_lines
  for select to authenticated using (true);

create policy outbound_lines_insert on public.outbound_lines
  for insert to authenticated with check (true);

create policy outbound_lines_update on public.outbound_lines
  for update to authenticated using (true) with check (true);

create policy outbound_lines_delete on public.outbound_lines
  for delete to authenticated using (public.is_owner());

-- --- status_history --------------------------------------------------------
-- SELECT and INSERT only. There is deliberately NO update policy and NO delete
-- policy on this table, for any role including owner. RLS denies what no policy
-- allows, so the append-only guarantee is enforced by the database rather than
-- by everyone remembering.
create policy status_history_select on public.status_history
  for select to authenticated using (true);

create policy status_history_insert on public.status_history
  for insert to authenticated with check (true);

-- --- reminders -------------------------------------------------------------
-- Thresholds live on products (owner write); the reminder STATE is operational
-- and both roles touch it, because firing and re-arming happen inside the same
-- request that moves stock (P2-10).
create policy reminders_select on public.reminders
  for select to authenticated using (true);

create policy reminders_insert on public.reminders
  for insert to authenticated with check (true);

create policy reminders_update on public.reminders
  for update to authenticated using (true) with check (true);

create policy reminders_delete on public.reminders
  for delete to authenticated using (public.is_owner());


-- ===========================================================================
-- 10. updated_at TRIGGERS
-- ===========================================================================
-- Only on tables that carry updated_at. The line tables and status_history are
-- write-once by design and carry created_at alone.

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger units_set_updated_at
  before update on public.units
  for each row execute function public.set_updated_at();

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger inbound_orders_set_updated_at
  before update on public.inbound_orders
  for each row execute function public.set_updated_at();

create trigger outbound_issues_set_updated_at
  before update on public.outbound_issues
  for each row execute function public.set_updated_at();

create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

commit;


-- ===========================================================================
-- 11. VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Read the result grid: eleven rows, rls_enabled true on
-- every one, and a policy count that is never zero. Anything else means the
-- apply did not do what this file says it does.

select
  c.relname                                as table_name,
  c.relrowsecurity                         as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;
