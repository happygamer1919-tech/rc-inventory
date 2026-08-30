-- 0019_suppliers.sql
-- RC Inventory phase 3, card P3-05. public.suppliers, and products gain a
-- supplier foreign key.
--
-- WHY NOW AND NOT LATER. Free text on a supplier is a data-quality bomb and the
-- fix is cheapest while the catalogue is close to empty. 0001 predicted this
-- card in a comment on the column it replaces: "Promoting it to a table later
-- is a straightforward migration if the client needs supplier records of their
-- own." This is that migration, taken while the claim is still true.
--
-- THE SAME RULE AS P3-04: NEVER A BACKFILL AND A DROP IN ONE MIGRATION.
-- products.supplier_name survives this file untouched. The drop is P3-05b, gated
-- behind this backfill being verified.
--
-- ONE DIFFERENCE FROM THE OUTBOUND BACKFILL, AND IT IS THE INTERESTING ONE:
-- THIS BACKFILL CREATES ROWS. products.supplier_name is the ONLY record of a
-- supplier anywhere in the system, so there is no table to match against and
-- nothing to reconcile to. One supplier row per distinct folded name, taking the
-- MOST COMMON original spelling as the stored name.
--
-- AND IT REFUSES TO CREATE MORE THAN TWENTY. P3-05 says that if the catalogue
-- holds more than 20 distinct supplier names the card blocks on Ivan with the
-- list, rather than creating twenty records nobody has reviewed. That is
-- enforced HERE, as a raise inside the transaction, rather than left as an
-- instruction somebody has to remember at 2am: the whole apply rolls back and
-- the message carries the count.
--
-- IT RUNS AS ONE TRANSACTION.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs
-- scripts/poc-free/local-db/assertions/0019_suppliers.sql, whose fixture
-- exercises the folding, the most-common-spelling rule, the empty-name case and
-- the twenty-supplier refusal.
--
-- NOT APPLIED TO PRODUCTION BY THIS PULL REQUEST. The apply is card P3-27, and
-- the reconciliation count P3-05 asks for is part of that card, because it is a
-- statement about real rows and there are none here.

begin;


-- ===========================================================================
-- 1. THE TABLE
-- ===========================================================================
--
-- SAME SHAPE AS public.clients, DELIBERATELY, INCLUDING THE ENUM. A supplier
-- and a client are the same kind of object in this business, and giving them
-- two different shapes would mean writing every list, filter and detail screen
-- twice. The supplier list and detail screens ride on the client screens in
-- wave 2 for the same reason.
--
-- public.client_type IS REUSED AND NOT REDECLARED. P3-05 says the migration
-- must create the type only if it is absent, so that this card and P3-01 can be
-- worked in either order. P3-01 has shipped, so it exists; the guard stays
-- because a guard whose condition is currently false is still the reason the
-- ordering constraint does not exist.

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'client_type'
  ) then
    create type public.client_type as enum ('company', 'individual');
  end if;
end
$$;

create table public.suppliers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         public.client_type not null default 'company',
  fiscal_code  text null,
  address      text null,
  phone        text null,
  email        text null,
  notes        text null,
  active       boolean not null default true,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.suppliers is
  'Counterparties Rapid Construct buys from. Deliberately the same shape as public.clients, down to the shared client_type enum: a supplier and a client are the same kind of object here, and two shapes would mean two of every screen. Rows are deactivated, never deleted.';

-- The same partial unique index as clients, for the same reason: at most one
-- record per IDNO, and any number with none.
create unique index suppliers_fiscal_code_unique
  on public.suppliers (fiscal_code)
  where fiscal_code is not null;

create index suppliers_name_lower_idx on public.suppliers (lower(name));
create index suppliers_active_name_idx on public.suppliers (active, lower(name));

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

-- A no-op since 0009, kept for the same reason it is kept on clients, contacts
-- and projects: this table is closed by its own file and not only by a rule set
-- ten migrations earlier.
revoke all on table public.suppliers from anon;
grant select, insert, update, delete on table public.suppliers to authenticated;

alter table public.suppliers enable row level security;

create policy suppliers_select on public.suppliers
  for select to authenticated using (true);

create policy suppliers_insert on public.suppliers
  for insert to authenticated with check (public.is_owner());

create policy suppliers_update on public.suppliers
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- No delete policy. A supplier referenced by a product or by the history of an
-- inbound order cannot disappear without making that history unreadable.


-- ===========================================================================
-- 2. THE COLUMN
-- ===========================================================================

alter table public.products
  add column supplier_id uuid null references public.suppliers (id) on delete restrict;

comment on column public.products.supplier_id is
  'The supplier as a record rather than as typed text. NULLABLE: a product may genuinely have no supplier, and the backfill creates nothing for an empty supplier_name. products.supplier_name is still here and is dropped by P3-05b, only after this backfill is verified.';

create index products_supplier_id_idx on public.products (supplier_id);


-- ===========================================================================
-- 3. THE BACKFILL, AS A FUNCTION
-- ===========================================================================
--
-- IT IS A FUNCTION AND NOT A BARE STATEMENT, for the reason P3-04 learned the
-- hard way: a statement buried in an applied migration cannot be re-run during
-- reconciliation, and a test cannot exercise it, so the test ends up proving a
-- copy of it that drifts.
--
-- THE MOST COMMON ORIGINAL SPELLING WINS. "Bricolaj SRL" typed forty times and
-- "BRICOLAJ srl" typed once are one supplier, and the name stored is the one
-- forty products carry, because that is the one a human will recognise.
--
-- TIES BREAK ON DIACRITICS FIRST AND THEN ALPHABETICALLY, so the result never
-- depends on physical row order and two runs on the same data give the same
-- name. The diacritic term is not decoration: see the comment in the window
-- function below, which was written after the fixture caught it.
--
-- AN EMPTY OR NULL supplier_name CREATES NOTHING and leaves supplier_id null.
-- A product genuinely without a supplier is a normal product, not a gap.
--
-- IT IS IDEMPOTENT: it only ever writes where supplier_id is null, and it only
-- creates a supplier whose folded name does not already exist. Re-running it
-- after somebody merges two suppliers by hand cannot undo that merge.

create or replace function public.backfill_product_suppliers(p_max_new integer default 20)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_new     integer;
  v_linked  integer;
  v_names   text;
begin
  -- The distinct list, and the count, BEFORE anything is written.
  with folded as (
    select
      public.fold_text(p.supplier_name) as folded_name,
      p.supplier_name                   as spelling
    from public.products p
    where p.supplier_id is null
      and p.supplier_name is not null
      and btrim(p.supplier_name) <> ''
  ),
  ranked as (
    select
      folded_name,
      spelling,
      count(*) as uses,
      row_number() over (
        partition by folded_name
        order by
          count(*) desc,
          -- THE DIACRITIC TIE-BREAK, and it earns its line. On a tie between
          -- "Tigla Mold SRL" and "Țiglă Mold SRL" a plain alphabetical order
          -- picks the ASCII one, because T sorts before Ț. That is the spelling
          -- somebody typed in a hurry, not the company's name. Counting
          -- diacritics and preferring more of them stores the name a human will
          -- recognise, which is what this rule is for. Found by fixture: the
          -- first version of this file failed its own assertion on exactly
          -- this pair.
          length(spelling) - length(translate(spelling, 'ăâîșțĂÂÎȘȚşţŞŢ', '')) desc,
          spelling asc
      ) as rn
    from folded
    group by folded_name, spelling
  ),
  winners as (
    select folded_name, spelling from ranked where rn = 1
  )
  select count(*), string_agg(spelling, ', ' order by spelling)
    into v_new, v_names
  from winners w
  where not exists (
    select 1 from public.suppliers s
    where public.fold_text(s.name) = w.folded_name
  );

  v_new := coalesce(v_new, 0);

  -- THE LIST IS ANNOUNCED BEFORE IT IS INSERTED, so the apply journal carries
  -- what was about to be created even if the next line refuses it.
  raise notice 'P3-05 backfill: % new supplier(s) to create: %', v_new, coalesce(v_names, '(none)');

  -- AND MORE THAN TWENTY IS A REFUSAL, NOT A JUDGEMENT CALL. The card asserts
  -- the catalogue is close to empty. If that premise is false, this is the halt
  -- rule enforced by the file rather than remembered by whoever is running it.
  if v_new > p_max_new then
    raise exception
      'P3-05: % distinct supplier names would be created, over the limit of %. The catalogue is not as empty as the card assumed. Review the list above with Mihai and re-run with an explicit higher limit, or clean the names first. Nothing has been written.',
      v_new, p_max_new
      using errcode = 'P0002';
  end if;

  with folded as (
    select
      public.fold_text(p.supplier_name) as folded_name,
      p.supplier_name                   as spelling
    from public.products p
    where p.supplier_id is null
      and p.supplier_name is not null
      and btrim(p.supplier_name) <> ''
  ),
  ranked as (
    select
      folded_name,
      spelling,
      count(*) as uses,
      row_number() over (
        partition by folded_name
        order by
          count(*) desc,
          -- THE DIACRITIC TIE-BREAK, and it earns its line. On a tie between
          -- "Tigla Mold SRL" and "Țiglă Mold SRL" a plain alphabetical order
          -- picks the ASCII one, because T sorts before Ț. That is the spelling
          -- somebody typed in a hurry, not the company's name. Counting
          -- diacritics and preferring more of them stores the name a human will
          -- recognise, which is what this rule is for. Found by fixture: the
          -- first version of this file failed its own assertion on exactly
          -- this pair.
          length(spelling) - length(translate(spelling, 'ăâîșțĂÂÎȘȚşţŞŢ', '')) desc,
          spelling asc
      ) as rn
    from folded
    group by folded_name, spelling
  )
  insert into public.suppliers (name)
  select r.spelling
  from ranked r
  where r.rn = 1
    and not exists (
      select 1 from public.suppliers s
      where public.fold_text(s.name) = r.folded_name
    );

  -- Then link every product whose folded name now has a record. This is a
  -- separate statement on purpose: it also picks up products whose supplier
  -- already existed as a row, which is what makes the function re-runnable
  -- during reconciliation.
  update public.products p
  set supplier_id = s.id
  from public.suppliers s
  where p.supplier_id is null
    and p.supplier_name is not null
    and btrim(p.supplier_name) <> ''
    and public.fold_text(s.name) = public.fold_text(p.supplier_name);

  get diagnostics v_linked = row_count;
  raise notice 'P3-05 backfill: % product(s) linked', v_linked;
  return v_linked;
end;
$fn$;

comment on function public.backfill_product_suppliers(integer) is
  'The P3-05 backfill. Creates one supplier per distinct folded supplier_name, taking the most common original spelling (ties broken alphabetically so two runs agree), then links products to it. REFUSES and rolls back if it would create more than p_max_new suppliers, because P3-05 says twenty unreviewed records is a decision for Mihai and not for a migration. Idempotent: it writes only where supplier_id is null and creates only a supplier whose folded name has no row yet.';

grant execute on function public.backfill_product_suppliers(integer) to authenticated, service_role;

select public.backfill_product_suppliers();


-- ===========================================================================
-- 4. FINDING A SUPPLIER BY THE NAME SOMEBODY TYPED
-- ===========================================================================
--
-- The product form leaves the supplier list OPEN: a new supplier is typed into
-- the same combobox, so that entering a product does not become a two-screen
-- task. The write path therefore has to answer "is this name already a
-- supplier?" before it creates one.
--
-- IT IS A FUNCTION AND NOT A CLIENT-SIDE COMPARISON, and that is the whole
-- point. The fold has to be the SAME fold the backfill used, or somebody typing
-- "bricolaj srl" the day after the backfill created "Bricolaj SRL" makes a
-- second supplier and undoes exactly what this card just did. Doing it in
-- TypeScript would mean two implementations of one rule, drifting.
--
-- STABLE and SECURITY INVOKER: it reads, RLS still applies, and it can be
-- called from PostgREST.

create or replace function public.find_supplier_by_folded_name(p_name text)
returns table (id uuid, name text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select s.id, s.name
  from public.suppliers s
  where public.fold_text(s.name) = public.fold_text(p_name)
  order by s.active desc, s.created_at
  limit 1
$$;

comment on function public.find_supplier_by_folded_name(text) is
  'Finds an existing supplier whose folded name equals the folded argument, using the SAME fold as the P3-05 backfill. Called by the product write path before it creates a supplier, so that typing an existing name in a different case or without diacritics reuses the record instead of making a second one. An active row wins over a deactivated one, then the oldest.';

grant execute on function public.find_supplier_by_folded_name(text) to authenticated;


commit;


-- ===========================================================================
-- VERIFICATION AND RECONCILIATION
-- ===========================================================================
-- The three numbers and the list are the deliverable of P3-05 and go into the
-- P3-27 apply journal verbatim.

select
  c.relname        as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.polname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'suppliers'
group by c.relname, c.relrowsecurity;

select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'suppliers'
order by policyname;

-- supplier_name STILL PRESENT is part of the acceptance, so it is selected
-- rather than assumed.
select a.attname, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as not_null
from pg_attribute a
where a.attrelid = 'public.products'::regclass
  and a.attname in ('supplier_id', 'supplier_name')
  and a.attnum > 0 and not a.attisdropped
order by a.attname;

-- THE SUPPLIERS CREATED, in full, so a human can read every name that now
-- exists as a record.
select name, created_at from public.suppliers order by lower(name);

-- THE THREE NUMBERS.
select
  count(*)                                       as total_products,
  count(*) filter (where supplier_id is not null) as with_supplier,
  count(*) filter (where supplier_id is null)     as still_null
from public.products;

-- THE UNLINKED LIST, IN FULL.
select sku, name, supplier_name
from public.products
where supplier_id is null
order by sku;
