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

  -- --- supplier_name IS STILL PRESENT --------------------------------------
  -- The card's own acceptance line, and the rule the wave demonstrates.
  select count(*) into n from pg_attribute a
  where a.attrelid = 'public.products'::regclass and a.attname = 'supplier_name'
    and a.attnum > 0 and not a.attisdropped;
  if n <> 1 then
    raise exception 'P3-05: products.supplier_name must still be present; the drop is P3-05b';
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
-- THE BACKFILL, AS BEHAVIOUR
-- ===========================================================================
--
-- The migration met an empty catalogue. This builds the one it will meet.

begin;

insert into public.categories (id, name) values ('c5000000-0000-0000-0000-000000000001', 'Test P3-05');

-- The fixture is the whole point, so each row says what it is for.
insert into public.products (sku, name, category_id, unit, unit_value_mdl, supplier_name) values
  -- Six spellings of ONE supplier. "Bricolaj SRL" is used three times and is
  -- the most common, so it must be the stored name even though "BRICOLAJ SRL"
  -- sorts first alphabetically.
  ('P305-1', 'Produs 1', 'c5000000-0000-0000-0000-000000000001', 'pcs', 1, 'Bricolaj SRL'),
  ('P305-2', 'Produs 2', 'c5000000-0000-0000-0000-000000000001', 'pcs', 1, 'Bricolaj SRL'),
  ('P305-3', 'Produs 3', 'c5000000-0000-0000-0000-000000000001', 'pcs', 1, 'Bricolaj SRL'),
  ('P305-4', 'Produs 4', 'c5000000-0000-0000-0000-000000000001', 'pcs', 1, 'BRICOLAJ SRL'),
  ('P305-5', 'Produs 5', 'c5000000-0000-0000-0000-000000000001', 'pcs', 1, '  bricolaj   srl '),
  ('P305-6', 'Produs 6', 'c5000000-0000-0000-0000-000000000001', 'pcs', 1, 'Bricolaj  SRL'),
  -- A second supplier, with a diacritic and its ASCII spelling.
  ('P305-7', 'Produs 7', 'c5000000-0000-0000-0000-000000000001', 'pcs', 1, 'Țiglă Mold SRL'),
  ('P305-8', 'Produs 8', 'c5000000-0000-0000-0000-000000000001', 'pcs', 1, 'Tigla Mold SRL'),
  -- No supplier at all. Creates nothing, links nothing, and is not a gap.
  ('P305-9',  'Produs 9',  'c5000000-0000-0000-0000-000000000001', 'pcs', 1, null),
  ('P305-10', 'Produs 10', 'c5000000-0000-0000-0000-000000000001', 'pcs', 1, ''),
  ('P305-11', 'Produs 11', 'c5000000-0000-0000-0000-000000000001', 'pcs', 1, '   ');

do $$
declare
  n       integer;
  txt     text;
  linked  integer;
  refused boolean;
begin
  linked := public.backfill_product_suppliers();

  -- TWO suppliers from eight products across six spellings.
  select count(*) into n from public.suppliers;
  if n <> 2 then
    raise exception 'P3-05: expected 2 suppliers created from 6 spellings, found %', n;
  end if;

  -- THE MOST COMMON SPELLING WINS, not the first one seen and not the
  -- alphabetically first. Three products say "Bricolaj SRL"; one says
  -- "BRICOLAJ SRL", which sorts earlier.
  --
  -- AND ON A TIE, THE ONE WITH DIACRITICS WINS. "Tigla Mold SRL" and "Țiglă
  -- Mold SRL" are used once each, and plain alphabetical order would store the
  -- ASCII spelling because T sorts before Ț. That is what somebody typed in a
  -- hurry, not the company's name.
  select string_agg(name, '|' order by name) into txt from public.suppliers;
  if txt is distinct from 'Bricolaj SRL|Țiglă Mold SRL' then
    raise exception 'P3-05: expected the most common spelling of each supplier, found %', txt;
  end if;

  -- Eight products linked, three left null.
  if linked <> 8 then
    raise exception 'P3-05: expected 8 products linked, the function reported %', linked;
  end if;
  select count(*) into n from public.products where supplier_id is null and sku like 'P305-%';
  if n <> 3 then
    raise exception 'P3-05: expected the 3 supplier-less products to stay null, found %', n;
  end if;

  -- All six spellings of Bricolaj point at ONE row.
  select count(distinct supplier_id) into n from public.products
  where sku in ('P305-1','P305-2','P305-3','P305-4','P305-5','P305-6');
  if n <> 1 then
    raise exception 'P3-05: six spellings of one supplier produced % rows', n;
  end if;

  -- And the diacritic pair too.
  select count(distinct supplier_id) into n from public.products where sku in ('P305-7','P305-8');
  if n <> 1 then
    raise exception 'P3-05: a diacritic and its ASCII spelling produced % suppliers', n;
  end if;

  -- IDEMPOTENT. A second run creates nothing and links nothing.
  linked := public.backfill_product_suppliers();
  if linked <> 0 then
    raise exception 'P3-05: a second run linked % products, so the backfill is not idempotent', linked;
  end if;
  select count(*) into n from public.suppliers;
  if n <> 2 then
    raise exception 'P3-05: a second run changed the supplier count to %', n;
  end if;

  -- A HAND MERGE SURVIVES A RE-RUN. This is what idempotency is actually for:
  -- during reconciliation somebody will repoint a product at a different
  -- supplier, and the backfill must not undo it.
  update public.products p
  set supplier_id = (select id from public.suppliers where name = 'Țiglă Mold SRL')
  where p.sku = 'P305-1';
  perform public.backfill_product_suppliers();
  select s.name into txt from public.products p
  join public.suppliers s on s.id = p.supplier_id where p.sku = 'P305-1';
  if txt <> 'Țiglă Mold SRL' then
    raise exception 'P3-05: the backfill undid a hand correction, product now points at %', txt;
  end if;

  -- THE LOOKUP THE WRITE PATH USES, exercised through the same fold. This is
  -- what stops somebody typing "bricolaj srl" the day after the backfill from
  -- creating a second supplier and undoing the whole card.
  select s.name into txt from public.find_supplier_by_folded_name('  BRICOLAJ   srl ') s;
  if txt is distinct from 'Bricolaj SRL' then
    raise exception 'P3-05: the folded lookup did not find the existing supplier, got %', coalesce(txt, 'nothing');
  end if;
  select s.name into txt from public.find_supplier_by_folded_name('tigla mold srl') s;
  if txt is distinct from 'Țiglă Mold SRL' then
    raise exception 'P3-05: the folded lookup missed a diacritic name, got %', coalesce(txt, 'nothing');
  end if;
  -- And it finds NOTHING for a supplier that does not exist, or the write path
  -- would link every new product to whatever row came back first.
  select s.name into txt from public.find_supplier_by_folded_name('Firma Care Nu Exista') s;
  if txt is not null then
    raise exception 'P3-05: the folded lookup invented a match, got %', txt;
  end if;

  -- A PRODUCT WITH NO SUPPLIER IS RESTRICTED FROM NOTHING, but a supplier with
  -- products cannot be deleted. The RESTRICT, exercised.
  refused := false;
  begin
    delete from public.suppliers where name = 'Bricolaj SRL';
  exception
    when foreign_key_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-05: a supplier with products was deleted, so the RESTRICT is not enforcing';
  end if;
end
$$;

rollback;


-- ===========================================================================
-- THE TWENTY-SUPPLIER REFUSAL
-- ===========================================================================
--
-- P3-05 says that if the catalogue holds more than 20 distinct supplier names,
-- the card blocks on Ivan with the list rather than creating twenty records
-- nobody has reviewed. The migration enforces that as a raise, so the whole
-- apply rolls back rather than leaving half a decision behind.
--
-- IT IS TESTED WITH THE LIMIT LOWERED, not with twenty-one fixture products.
-- The limit is a parameter precisely so this is testable, and a fixture that
-- needed twenty-one rows to prove one branch would be twenty rows of noise.

begin;

insert into public.categories (id, name) values ('c5000000-0000-0000-0000-000000000002', 'Test P3-05 limita');
insert into public.products (sku, name, category_id, unit, unit_value_mdl, supplier_name)
select
  'P305L-' || i,
  'Produs limita ' || i,
  'c5000000-0000-0000-0000-000000000002',
  'pcs', 1,
  'Furnizor ' || i
from generate_series(1, 5) as i;

do $$
declare
  n       integer;
  refused boolean;
begin
  refused := false;
  begin
    perform public.backfill_product_suppliers(3);
  exception
    when sqlstate 'P0002' then refused := true;
  end;
  if not refused then
    raise exception 'P3-05: 5 new suppliers were created under a limit of 3, so the refusal is not enforcing';
  end if;

  -- NOTHING WAS WRITTEN. The refusal has to leave the database as it found it,
  -- or "the card blocks with the list" would mean "half the records exist and
  -- nobody knows which half". The exception rolled back to the start of the
  -- inner block, so no supplier row survives.
  select count(*) into n from public.suppliers;
  if n <> 0 then
    raise exception 'P3-05: the refusal left % supplier row(s) behind', n;
  end if;
  select count(*) into n from public.products where supplier_id is not null;
  if n <> 0 then
    raise exception 'P3-05: the refusal left % product(s) linked', n;
  end if;

  -- And under a limit that fits, the same call succeeds. A refusal that fired
  -- on everything would pass the check above and be useless.
  perform public.backfill_product_suppliers(5);
  select count(*) into n from public.suppliers;
  if n <> 5 then
    raise exception 'P3-05: expected 5 suppliers under a limit of 5, found %', n;
  end if;
end
$$;

rollback;
