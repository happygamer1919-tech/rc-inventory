-- assertions/fold-01_supplier_folding.sql
-- Card FOLD-01. Spelling folding, re-tested through the function that survived.
--
-- WHY THIS FILE EXISTS. P3-05b dropped products.supplier_name and
-- public.backfill_product_suppliers(integer), and the fixture in
-- assertions/0019_suppliers.sql died with them. That fixture was the strongest
-- test in this directory: it inserted six spellings of one supplier and proved
-- the backfill folded them into one record, picked the most common spelling as
-- the stored name, respected its cap, and was idempotent.
--
-- public.find_supplier_by_folded_name(text) SURVIVES 0027 and is what the product
-- write path actually calls before creating a supplier, so it is where the
-- folding behaviour still lives and can still be defended.
--
-- THE NAME OF THIS FILE IS NOT A MIGRATION NUMBER, ON PURPOSE. Everything else in
-- this directory is named after the migration whose objects it asserts. This one
-- belongs to a CARD rather than to a migration: it defends a behaviour that
-- spans 0017's fold_text and 0019's lookup, after the migration that used to
-- carry its proof was spent. apply.mjs runs every .sql here in filename order and
-- makes no assumption about the names.
--
-- ONE OF THE THREE DELETED BEHAVIOURS CANNOT BE RETESTED HERE, AND THAT IS
-- RECORDED RATHER THAN QUIETLY DROPPED. See the closing comment.

begin;

-- Two suppliers that FOLD TO THE SAME NAME, which is the situation the whole
-- mechanism exists for. Different case, different diacritics, different spacing.
insert into public.suppliers (id, name, active, created_at) values
  ('f01d0000-0000-4000-8000-000000000001', 'Bricolaj SRL', true,  timestamptz '2026-01-01 00:00:00+00'),
  ('f01d0000-0000-4000-8000-000000000002', 'BRICOLAJ  SRL', true, timestamptz '2026-02-01 00:00:00+00');

-- A THIRD SPELLING THAT DOES *NOT* FOLD WITH THEM, and it is here deliberately.
-- fold_text collapses whitespace and folds case and diacritics. It does NOT
-- touch punctuation, so 'S.R.L.' is a different supplier from 'SRL'. That is a
-- real boundary of the mechanism and it is asserted below rather than assumed,
-- because the obvious assumption is the other one.
insert into public.suppliers (id, name, active, created_at) values
  ('f01d0000-0000-4000-8000-000000000003', 'Bricolaj S.R.L.', true, timestamptz '2026-04-01 00:00:00+00');

-- A deactivated supplier that folds to a THIRD name, used for the tie-break.
insert into public.suppliers (id, name, active, created_at) values
  ('f01d0000-0000-4000-8000-000000000010', 'Depozit Țiglă', false, timestamptz '2026-01-01 00:00:00+00'),
  ('f01d0000-0000-4000-8000-000000000011', 'depozit tigla',  true,  timestamptz '2026-03-01 00:00:00+00');

do $$
declare
  got_id   uuid;
  got_name text;
  n        integer;
begin
  -- --- 1. FOLDING EQUIVALENCE ----------------------------------------------
  -- The behaviour the deleted fixture existed to prove, stated directly: case,
  -- diacritics and surrounding whitespace do not make a second supplier.
  -- Every spelling below must resolve to the SAME row.
  for got_name in
    select unnest(array['Bricolaj SRL', 'bricolaj srl', 'BRICOLAJ SRL', '  Bricolaj SRL  '])
  loop
    select id into got_id from public.find_supplier_by_folded_name(got_name);
    if got_id is null then
      raise exception 'FOLD-01: "%" resolved to nothing, expected the Bricolaj record', got_name;
    end if;
    if got_id <> 'f01d0000-0000-4000-8000-000000000001' then
      raise exception 'FOLD-01: "%" resolved to %, expected the oldest active Bricolaj record', got_name, got_id;
    end if;
  end loop;

  -- Diacritics fold too, which is the half a Romanian catalogue actually needs.
  select id into got_id from public.find_supplier_by_folded_name('DEPOZIT TIGLA');
  if got_id is null then
    raise exception 'FOLD-01: an unaccented spelling found no supplier, so diacritics are not folding';
  end if;

  -- --- 2. THE TIE-BREAK, WHICH IS WHAT SURVIVES OF "MOST COMMON VARIANT" ----
  -- The backfill chose the most FREQUENT spelling as the stored name. That
  -- function is gone and frequency is no longer counted anywhere. What decides
  -- today is the lookup's own order: an ACTIVE row wins over a deactivated one,
  -- and among equals the OLDEST wins. Both halves are asserted, because a
  -- lookup that returns an arbitrary row of several is how two records for one
  -- supplier start being used interchangeably.
  --
  -- 'Depozit Țiglă' is older but INACTIVE. 'depozit tigla' is newer and ACTIVE.
  -- Active must win, which is the opposite of what created_at alone would say.
  select id into got_id from public.find_supplier_by_folded_name('Depozit Tigla');
  if got_id <> 'f01d0000-0000-4000-8000-000000000011' then
    raise exception 'FOLD-01: expected the ACTIVE supplier to win the tie, got %', got_id;
  end if;

  -- Among two ACTIVE rows that fold together, the oldest wins. 'Bricolaj SRL'
  -- (January) and 'BRICOLAJ  SRL' (February) both fold to 'bricolaj srl', the
  -- double space collapsing, so the January one must be returned.
  select id into got_id from public.find_supplier_by_folded_name('BRICOLAJ  SRL');
  if got_id <> 'f01d0000-0000-4000-8000-000000000001' then
    raise exception 'FOLD-01: expected the OLDEST active supplier to win, got %', got_id;
  end if;

  -- --- 2b. PUNCTUATION IS NOT FOLDED, AND THAT IS A DOCUMENTED BOUNDARY -----
  -- 'Bricolaj S.R.L.' is a SEPARATE supplier from 'Bricolaj SRL' under this
  -- fold, because fold_text normalises case, diacritics and whitespace runs and
  -- nothing else. Asserted so the limit is visible: someone reading only the
  -- word "folding" would reasonably expect the opposite, and the write path
  -- creates a second record here rather than reusing the first.
  select id into got_id from public.find_supplier_by_folded_name('bricolaj s.r.l.');
  if got_id <> 'f01d0000-0000-4000-8000-000000000003' then
    raise exception 'FOLD-01: punctuation folding changed. "bricolaj s.r.l." resolved to %, and this fold is defined NOT to strip punctuation', got_id;
  end if;

  -- --- 3. IDEMPOTENCY -------------------------------------------------------
  -- The deleted fixture proved the BACKFILL could be run twice without creating
  -- a second record. The backfill is gone; the property that matters now is that
  -- the LOOKUP is repeatable and writes nothing, which is what makes the write
  -- path safe to call on every save.
  select count(*) into n from public.suppliers;

  perform public.find_supplier_by_folded_name('Bricolaj SRL');
  perform public.find_supplier_by_folded_name('bricolaj srl');
  perform public.find_supplier_by_folded_name('BRICOLAJ  S.R.L.');

  if (select count(*) from public.suppliers) <> n then
    raise exception 'FOLD-01: the lookup changed the supplier count, and it must only read';
  end if;

  -- Repeatable: the same argument twice gives the same row.
  select id into got_id from public.find_supplier_by_folded_name('bricolaj srl');
  select id into got_name from public.find_supplier_by_folded_name('bricolaj srl');
  if got_id::text <> got_name then
    raise exception 'FOLD-01: two identical lookups returned different rows, % and %', got_id, got_name;
  end if;

  -- --- 4. A NAME THAT FOLDS TO NOTHING RETURNS NOTHING ---------------------
  -- The write path reads "no row" as "create one", so a lookup that invented a
  -- match would silently attach products to the wrong supplier.
  select count(*) into n from public.find_supplier_by_folded_name('Furnizor Care Nu Exista');
  if n <> 0 then
    raise exception 'FOLD-01: an unknown name matched % row(s), expected none', n;
  end if;
end $$;

rollback;

-- ===========================================================================
-- THE CAP CANNOT BE RETESTED, AND HERE IS WHY
-- ===========================================================================
--
-- The deleted fixture proved three behaviours. Two are above. The third was the
-- CAP: backfill_product_suppliers(p_max_new integer default 20) refused to create
-- more than p_max_new suppliers in one run, so a catalogue full of typos could
-- not silently mint hundreds of records.
--
-- THAT BEHAVIOUR NO LONGER EXISTS ANYWHERE. It was a property of the backfill
-- function, migration 0027 dropped that function, and nothing else in the schema
-- has a cap: the product write path creates at most one supplier per save, by
-- construction, because it resolves one name at a time.
--
-- So the cap is not untested here. It is UNTESTABLE, because there is nothing
-- left to test. Writing an assertion that passed vacuously would be worse than
-- this comment: it would read, to anyone counting coverage, as though the
-- protection were still in place.
--
-- IF A BULK SUPPLIER IMPORT IS EVER BUILT, IT NEEDS ITS OWN CAP AND ITS OWN
-- PROOF, and whoever builds it should read backfill_product_suppliers in the git
-- history of 0019 first, because that function had already solved this problem
-- once.
