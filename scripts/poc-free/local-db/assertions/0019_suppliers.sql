-- scripts/poc-free/local-db/assertions/0019_suppliers.sql
-- Card P3-05. Assertions for public.suppliers, products.supplier_id and the
-- backfill that creates rows. Ruling R-062.
--
-- THE BACKFILL IS EXERCISED THROUGH public.backfill_product_suppliers(), the
-- function the migration itself calls, and never through a copy of it. P3-04
-- learned that the hard way: three mutations of a copied statement came back
-- green because the test was proving its own copy.

do $$
declare
  n integer;
  txt text;
begin
  -- --- the table ----------------------------------------------------------
  select count(*) into n
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'suppliers' and c.relkind = 'r';
  if n <> 1 then
    raise exception 'P3-05: expected public.suppliers to exist as a table, found %', n;
  end if;

  select c.relrowsecurity into txt
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'suppliers';
  if txt is distinct from 'true' then
    raise exception 'P3-05: expected rowsecurity true on public.suppliers, found %', txt;
  end if;

  select string_agg(cmd, ',' order by cmd) into txt from pg_policies
  where schemaname = 'public' and tablename = 'suppliers';
  if txt is distinct from 'INSERT,SELECT,UPDATE' then
    raise exception 'P3-05: expected policies for exactly INSERT, SELECT and UPDATE on public.suppliers, found %', coalesce(txt, 'none');
  end if;

  select count(*) into n from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'suppliers' and grantee = 'anon';
  if n <> 0 then
    raise exception 'P3-05: anon must hold no privilege on public.suppliers, found % grants', n;
  end if;

  -- --- THE SHARED ENUM, NOT A SECOND IDENTICAL ONE -------------------------
  -- P3-05 says suppliers reuse public.client_type. A second enum with the same
  -- values would work and would then need every screen written twice, which is
  -- the thing this card is avoiding.
  select t.typname into txt
  from pg_attribute a join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.suppliers'::regclass and a.attname = 'type';
  if txt is distinct from 'client_type' then
    raise exception 'P3-05: suppliers.type must reuse public.client_type, found %', coalesce(txt, 'missing');
  end if;

  -- --- products.supplier_id, and that it is NULLABLE ----------------------
  select case when a.attnotnull then 'not null' else 'nullable' end into txt
  from pg_attribute a
  where a.attrelid = 'public.products'::regclass and a.attname = 'supplier_id';
  if txt is null then
    raise exception 'P3-05: expected public.products.supplier_id to exist, found none';
  end if;
  if txt <> 'nullable' then
    raise exception 'P3-05: supplier_id must stay NULLABLE in this card, found %', txt;
  end if;

  -- --- supplier_name IS GONE, AND THAT IS P3-05b ---------------------------
  -- This asserted the OPPOSITE until 2026-09-01, in these words: "supplier_name
  -- must still be present; the drop is P3-05b". P3-05b happened. Files in this
  -- directory run against the schema after ALL migrations, so they describe the
  -- END state and nothing else, and the end state is that migration 0027 dropped
  -- the column. The card that this assertion was pointing at is the card that
  -- made it false.
  --
  -- ONLY public.products.supplier_name IS GONE. The same column name still
  -- exists on public.inbound_orders and on public.extraction_drafts, neither of
  -- which P3-05b touches, and both are checked below so that a drop aimed at the
  -- wrong table cannot pass here.
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products' and column_name = 'supplier_name';
  if n <> 0 then
    raise exception 'P3-05b: products.supplier_name should have been dropped by 0027, found it';
  end if;

  select count(*) into n
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('inbound_orders', 'extraction_drafts')
    and column_name = 'supplier_name';
  if n <> 2 then
    raise exception 'P3-05b: inbound_orders.supplier_name and extraction_drafts.supplier_name must BOTH survive, found % of 2', n;
  end if;

  -- --- the backfill function is gone ---------------------------------------
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'backfill_product_suppliers';
  if n <> 0 then
    raise exception 'P3-05b: backfill_product_suppliers should have been dropped by 0027, found %', n;
  end if;

  -- --- the foreign key, and that it RESTRICTS ------------------------------
  select pg_get_constraintdef(oid) into txt
  from pg_constraint
  where conrelid = 'public.products'::regclass and contype = 'f'
    and conkey = array[(select attnum from pg_attribute
                        where attrelid = 'public.products'::regclass and attname = 'supplier_id')];
  if txt is null then
    raise exception 'P3-05: expected a foreign key on products.supplier_id, found none';
  end if;
  if txt not like '%REFERENCES suppliers(id)%' or txt not like '%ON DELETE RESTRICT%' then
    raise exception 'P3-05: expected supplier_id to reference suppliers(id) ON DELETE RESTRICT, found %', txt;
  end if;

  select count(*) into n from pg_indexes
  where schemaname = 'public' and tablename = 'products' and indexname = 'products_supplier_id_idx';
  if n <> 1 then
    raise exception 'P3-05: expected index products_supplier_id_idx, found %', n;
  end if;

  -- --- the partial unique index on the IDNO, as on clients -----------------
  select indexdef into txt from pg_indexes
  where schemaname = 'public' and tablename = 'suppliers'
    and indexname = 'suppliers_fiscal_code_unique';
  if txt is null or txt not like 'CREATE UNIQUE INDEX%' or txt not like '%WHERE (fiscal_code IS NOT NULL)%' then
    raise exception 'P3-05: suppliers_fiscal_code_unique must be UNIQUE and PARTIAL, found %', coalesce(txt, 'missing');
  end if;

  select count(*) into n from pg_trigger
  where tgrelid = 'public.suppliers'::regclass and tgname = 'suppliers_set_updated_at'
    and not tgisinternal;
  if n <> 1 then
    raise exception 'P3-05: expected trigger suppliers_set_updated_at, found %', n;
  end if;

  -- --- the lookup the write path depends on --------------------------------
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'find_supplier_by_folded_name';
  if n <> 1 then
    raise exception 'P3-05: expected public.find_supplier_by_folded_name, found %', n;
  end if;
end
$$;


-- ===========================================================================
-- THE BACKFILL FIXTURE WAS DELETED BY P3-05b, AND THIS IS THE RECORD OF IT
-- ===========================================================================
--
-- Everything below this line used to insert six spellings of one supplier into
-- products.supplier_name, run public.backfill_product_suppliers(), and assert
-- that the folding picked the most common spelling, respected the cap, and was
-- idempotent. It was the strongest test in this directory.
--
-- IT CANNOT RUN AND CANNOT BE REPAIRED. Migration 0027 drops
-- products.supplier_name and drops backfill_product_suppliers(integer). The
-- fixture has nowhere to write and the function it drove does not exist. Files
-- in this directory run against the schema after ALL migrations, so they can
-- only ever describe the END state, and in the end state neither object is
-- there.
--
-- WHAT WAS LOST IS REAL AND IS NAMED HERE RATHER THAN QUIETLY DROPPED: there is
-- no longer any automated proof that the supplier backfill folded spellings
-- correctly. That proof existed, it passed, and it is preserved in git history
-- and in the 0019 apply entry in docs/migrations/APPLY-LOG.md. It stops being
-- reachable the moment the thing it tested stops existing, which is the ordinary
-- fate of a migration-time behaviour once its migration is spent.
--
-- The structural checks above survive and still run on every push: the suppliers
-- table, the shared enum, products.supplier_id and that it stays NULLABLE, the
-- RESTRICT foreign key, the partial unique index on the IDNO, the lookup
-- function the write path depends on, and now the absence of the dropped column
-- and function.
