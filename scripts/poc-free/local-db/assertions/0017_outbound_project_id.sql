-- scripts/poc-free/local-db/assertions/0017_outbound_project_id.sql
-- Card P3-04. Assertions for 0017 (the column and the backfill) and 0018 (the
-- write path). Ruling R-062.
--
-- THE BACKFILL IS THE RISKY PART OF THIS CARD AND IT IS THE PART THAT HAS NO
-- ROWS TO PROVE ITSELF ON. The client's project has hundreds of typed
-- destinations; a fresh container has none, so the backfill in 0017 updates
-- zero rows and proves nothing by running. The behavioural block below builds
-- the fixture the migration cannot: every branch of the matching rule, each one
-- as a row a human could have typed.

do $$
declare
  n integer;
  txt text;
begin
  -- --- the column, and that it is NULLABLE ---------------------------------
  select case when a.attnotnull then 'not null' else 'nullable' end into txt
  from pg_attribute a
  where a.attrelid = 'public.outbound_issues'::regclass and a.attname = 'project_id';
  if txt is null then
    raise exception 'P3-04: expected public.outbound_issues.project_id to exist, found none';
  end if;
  if txt <> 'nullable' then
    raise exception 'P3-04: project_id must stay NULLABLE in this card, found %', txt;
  end if;

  -- --- THE TEXT COLUMNS ARE STILL PRESENT ----------------------------------
  -- This is the card's own acceptance line, and it is the rule the card exists
  -- to demonstrate: never a backfill and a drop in one migration. P3-04b drops
  -- them, and only after the backfill is verified against real rows.
  select string_agg(a.attname, ',' order by a.attname) into txt
  from pg_attribute a
  where a.attrelid = 'public.outbound_issues'::regclass
    and a.attname in ('client_name', 'project_name') and a.attnum > 0 and not a.attisdropped;
  if txt is distinct from 'client_name,project_name' then
    raise exception 'P3-04: client_name and project_name must BOTH still be present, found %', coalesce(txt, 'neither');
  end if;

  -- --- the foreign key, and that it RESTRICTS ------------------------------
  select pg_get_constraintdef(oid) into txt
  from pg_constraint
  where conrelid = 'public.outbound_issues'::regclass and contype = 'f'
    and conkey = array[(select attnum from pg_attribute
                        where attrelid = 'public.outbound_issues'::regclass and attname = 'project_id')];
  if txt is null then
    raise exception 'P3-04: expected a foreign key on outbound_issues.project_id, found none';
  end if;
  if txt not like '%REFERENCES projects(id)%' or txt not like '%ON DELETE RESTRICT%' then
    raise exception 'P3-04: expected project_id to reference projects(id) ON DELETE RESTRICT, found %', txt;
  end if;

  -- --- the index -----------------------------------------------------------
  select count(*) into n from pg_indexes
  where schemaname = 'public' and tablename = 'outbound_issues'
    and indexname = 'outbound_issues_project_id_idx';
  if n <> 1 then
    raise exception 'P3-04: expected index outbound_issues_project_id_idx, found %', n;
  end if;

  -- --- 0018: EXACTLY ONE create_outbound_issue -----------------------------
  -- Two rows here means the drop did not happen and every call is about to fail
  -- as "function is not unique". That failure would appear at the first
  -- outbound issue somebody tried to create, which is the worst place to find it.
  select count(*), string_agg(pg_get_function_identity_arguments(p.oid), ' | ')
    into n, txt
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'create_outbound_issue';
  if n <> 1 then
    raise exception 'P3-04: expected exactly ONE create_outbound_issue, found % (%)', n, txt;
  end if;
  if txt not like '%uuid%' then
    raise exception 'P3-04: create_outbound_issue does not take a project id, arguments are %', txt;
  end if;

  -- --- the fold function is IMMUTABLE --------------------------------------
  -- Not decoration: a fold that is only STABLE cannot be used in an index, and
  -- an index on it is the obvious next thing anybody adds.
  select p.provolatile into txt
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'fold_text';
  if txt is distinct from 'i' then
    raise exception 'P3-04: public.fold_text must be IMMUTABLE, found volatility %', coalesce(txt, 'missing');
  end if;
end
$$;


-- ===========================================================================
-- THE FOLD, AS BEHAVIOUR
-- ===========================================================================

do $$
begin
  -- Case.
  if public.fold_text('BLOC A') <> public.fold_text('bloc a') then
    raise exception 'P3-04: fold_text is case sensitive';
  end if;

  -- Diacritics, both the modern comma forms and the legacy cedilla forms that
  -- older documents carry.
  if public.fold_text('Șantier Țiglă') <> 'santier tigla' then
    raise exception 'P3-04: fold_text did not fold the comma diacritics, got %', public.fold_text('Șantier Țiglă');
  end if;
  if public.fold_text('Şantier Ţiglă') <> 'santier tigla' then
    raise exception 'P3-04: fold_text did not fold the legacy cedilla diacritics, got %', public.fold_text('Şantier Ţiglă');
  end if;
  if public.fold_text('Casă Împărat Ândrei') <> 'casa imparat andrei' then
    raise exception 'P3-04: fold_text missed a-breve, i-circumflex or a-circumflex, got %', public.fold_text('Casă Împărat Ândrei');
  end if;

  -- Whitespace, trimmed and collapsed. "Bloc  A " and "Bloc A" are the same
  -- site and the difference is invisible on screen.
  if public.fold_text('  Bloc   A  ') <> 'bloc a' then
    raise exception 'P3-04: fold_text did not trim and collapse whitespace, got [%]', public.fold_text('  Bloc   A  ');
  end if;

  -- NOTHING FUZZIER. Two names a human would call different must stay
  -- different, because a wrong automatic match is worse than a null.
  if public.fold_text('Bloc A') = public.fold_text('Bloc B') then
    raise exception 'P3-04: fold_text collapsed two different names';
  end if;
  if public.fold_text('Bloc A') = public.fold_text('Bloc A2') then
    raise exception 'P3-04: fold_text matched a near miss, which this card forbids';
  end if;
end
$$;


-- ===========================================================================
-- THE BACKFILL, AS BEHAVIOUR
-- ===========================================================================
--
-- The migration ran against an empty table. This builds the rows it would have
-- met and re-runs the identical statement, which is the only way to know the
-- rule works before it meets the client's data.

begin;

insert into public.clients (id, name, fiscal_code) values
  ('a0000000-0000-0000-0000-000000000001', 'Șantier Prim SRL', '1001600000001'),
  ('a0000000-0000-0000-0000-000000000002', 'Alt Beneficiar SRL', '1001600000002'),
  -- Two DIFFERENT companies sharing a trading name. P3-01 allows this on
  -- purpose: the IDNO is what separates them. It is the case that makes an
  -- automatic match ambiguous.
  ('a0000000-0000-0000-0000-000000000003', 'Nume Comun SRL', '1001600000003'),
  ('a0000000-0000-0000-0000-000000000004', 'Nume Comun SRL', '1001600000004');

insert into public.projects (id, client_id, name) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Bloc A'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Casă Împărat'),
  -- The SAME project name under a different client. If the rule matched on
  -- project name alone, this is what it would confuse.
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Bloc A'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'Proiect Comun'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000004', 'Proiect Comun');

insert into public.outbound_issues (reference, client_name, project_name, status) values
  -- 1. Exact.
  ('IES-T-001', 'Șantier Prim SRL', 'Bloc A', 'awaiting_shipment'),
  -- 2. Typed without diacritics and in the wrong case, which is how the
  --    operator actually types.
  ('IES-T-002', 'santier prim srl', 'BLOC A', 'awaiting_shipment'),
  -- 3. Extra and doubled whitespace.
  ('IES-T-003', '  Șantier   Prim SRL ', ' Bloc  A ', 'awaiting_shipment'),
  -- 4. Legacy cedilla spelling.
  ('IES-T-004', 'Şantier Prim SRL', 'Casă Împărat', 'awaiting_shipment'),
  -- 5. The right project name under the OTHER client. Must match that other
  --    client's project, not the first one.
  ('IES-T-005', 'Alt Beneficiar SRL', 'Bloc A', 'awaiting_shipment'),
  -- 6. A client nobody has a record for. Stays null.
  ('IES-T-006', 'Firma Necunoscuta SRL', 'Bloc A', 'awaiting_shipment'),
  -- 7. A known client, a project they do not have. Stays null.
  ('IES-T-007', 'Șantier Prim SRL', 'Bloc Z', 'awaiting_shipment'),
  -- 8. A near miss. NOTHING FUZZIER than exact-after-fold, so this stays null.
  ('IES-T-008', 'Șantier Prim SRL', 'Bloc A2', 'awaiting_shipment'),
  -- 9. AMBIGUOUS: two clients share the trading name and each has a project of
  --    this name. The backfill must refuse to choose.
  ('IES-T-009', 'Nume Comun SRL', 'Proiect Comun', 'awaiting_shipment'),
  -- 10. Already reconciled by hand. The backfill must not touch it, even though
  --     its text would match a DIFFERENT project.
  ('IES-T-010', 'Șantier Prim SRL', 'Bloc A', 'awaiting_shipment');

update public.outbound_issues
set project_id = 'b0000000-0000-0000-0000-000000000002'
where reference = 'IES-T-010';

-- THE BACKFILL ITSELF, NOT A COPY OF IT. This calls the function 0017 creates,
-- so a change to the matching rule in the migration changes what this proves.
--
-- IT WAS A COPY UNTIL IT WAS MUTATION-TESTED. Three mutations of the matching
-- rule came back green: matching on the project name alone, removing the
-- ambiguity guard, and removing the idempotency guard. None of them touched
-- this file, so none of them changed what ran here. A test that re-implements
-- the thing it tests proves the reimplementation.
select public.backfill_outbound_project_ids();

do $$
declare
  n integer;
  got uuid;
begin
  -- The four that must match, and WHICH project each landed on.
  for n in 1..4 loop
    select project_id into got from public.outbound_issues
    where reference = 'IES-T-00' || n;
    if got is null then
      raise exception 'P3-04: IES-T-00% was not matched by the backfill', n;
    end if;
  end loop;

  select project_id into got from public.outbound_issues where reference = 'IES-T-001';
  if got <> 'b0000000-0000-0000-0000-000000000001' then
    raise exception 'P3-04: IES-T-001 matched the wrong project, %', got;
  end if;
  select project_id into got from public.outbound_issues where reference = 'IES-T-004';
  if got <> 'b0000000-0000-0000-0000-000000000002' then
    raise exception 'P3-04: the legacy cedilla row matched the wrong project, %', got;
  end if;

  -- THE ONE THAT PROVES THE PAIR IS MATCHED AND NOT THE PROJECT NAME ALONE.
  select project_id into got from public.outbound_issues where reference = 'IES-T-005';
  if got <> 'b0000000-0000-0000-0000-000000000003' then
    raise exception 'P3-04: a Bloc A for a different client matched the first client project, %', got;
  end if;

  -- The four that must stay null: unknown client, unknown project, a near miss,
  -- and the ambiguous pair.
  for n in 6..9 loop
    select project_id into got from public.outbound_issues
    where reference = 'IES-T-00' || n;
    if got is not null then
      raise exception 'P3-04: IES-T-00% was matched and must not have been, got %', n, got;
    end if;
  end loop;

  -- IDEMPOTENT: the hand correction survives. A re-run must never overwrite a
  -- decision a human made, which is the whole reason the statement is guarded
  -- on project_id is null.
  select project_id into got from public.outbound_issues where reference = 'IES-T-010';
  if got <> 'b0000000-0000-0000-0000-000000000002' then
    raise exception 'P3-04: the backfill overwrote a hand-reconciled row, now %', got;
  end if;

  -- THE THREE NUMBERS, in the shape the apply journal wants them.
  select count(*) filter (where project_id is not null) into n
  from public.outbound_issues where reference like 'IES-T-%';
  if n <> 6 then
    raise exception 'P3-04: expected 6 of 10 fixture rows to carry a project, found %', n;
  end if;

  -- THE BACKFILL CREATED NOTHING. Reconciling the leftovers is a human reading
  -- a list, and a migration that invented a client to make its numbers look
  -- better would be the worst possible outcome of this card.
  select count(*) into n from public.clients;
  if n <> 4 then
    raise exception 'P3-04: the backfill created or removed client rows, found %', n;
  end if;
  select count(*) into n from public.projects;
  if n <> 5 then
    raise exception 'P3-04: the backfill created or removed project rows, found %', n;
  end if;
end
$$;

rollback;


-- ===========================================================================
-- THE WRITE PATH, AS BEHAVIOUR
-- ===========================================================================
--
-- 0018 is the half that stops the null set growing again. Without it, the
-- backfill shrinks the gap once and the next issue reopens it.

begin;

insert into public.clients (id, name, fiscal_code)
values ('c0000000-0000-0000-0000-000000000001', 'Scriere SRL', '1001600000009');
insert into public.projects (id, client_id, name)
values ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Șantier Nou');

insert into public.categories (id, name) values ('e0000000-0000-0000-0000-000000000001', 'Test P3-04');
insert into public.products (id, sku, name, category_id, unit, unit_value_mdl)
values ('f0000000-0000-0000-0000-000000000001', 'P304-1', 'Produs P3-04',
        'e0000000-0000-0000-0000-000000000001', 'pcs', 10);

-- STOCK IS NOT A COLUMN, IT IS A SUM. products has no stock column on purpose
-- (P2-04: a denormalised counter and a computed sum disagree eventually, and
-- when they do the warehouse trusts the wrong one). So putting 100 units on the
-- shelf means walking the real chain: an arrived inbound order, its line, and
-- the batch that line produced. batches.order_line_id is UNIQUE, so there is
-- exactly one batch per line and no shortcut.
insert into public.inbound_orders (id, reference, supplier_name, status, arrived_at)
values ('e1000000-0000-0000-0000-000000000001', 'CMD-P304-1', 'Furnizor P3-04',
        'arrived', now());
insert into public.order_lines (id, inbound_order_id, product_id, quantity, unit_price)
values ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
        'f0000000-0000-0000-0000-000000000001', 100, 8);
insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
values ('f0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
        'e2000000-0000-0000-0000-000000000001', 100);

do $$
declare
  v_id    uuid;
  got     record;
  refused boolean;
begin
  -- The names passed in are DELIBERATELY WRONG. 0018 must ignore them and take
  -- both from the project, so that the text columns and the foreign key cannot
  -- describe two different destinations while both exist.
  v_id := public.create_outbound_issue(
    'IES-W-001',
    'Nume Gresit SRL',
    'Proiect Gresit',
    '[{"product_id":"f0000000-0000-0000-0000-000000000001","quantity":"2","sale_price_mdl":"12"}]'::jsonb,
    'd0000000-0000-0000-0000-000000000001'
  );

  select client_name, project_name, project_id into got
  from public.outbound_issues where id = v_id;

  -- IS DISTINCT FROM, NOT <>. A plain <> against a NULL evaluates to NULL, the
  -- IF does not fire, and a write path that recorded no project at all passes
  -- this check. Found by mutating 0018 to write null and watching this pass.
  if got.project_id is distinct from 'd0000000-0000-0000-0000-000000000001' then
    raise exception 'P3-04: the write path did not record the project, got %', coalesce(got.project_id::text, 'null');
  end if;
  if got.client_name <> 'Scriere SRL' then
    raise exception 'P3-04: client_name was taken from the caller instead of the project, got %', got.client_name;
  end if;
  if got.project_name <> 'Șantier Nou' then
    raise exception 'P3-04: project_name was taken from the caller instead of the project, got %', got.project_name;
  end if;

  -- A project id that does not exist is refused with the Romanian sentence,
  -- not with a constraint name.
  -- THE REFUSAL IS RECORDED IN A FLAG AND ASSERTED AFTERWARDS, never raised
  -- inside the block that catches it. `raise exception` defaults to errcode
  -- P0001, which is the SAME code create_outbound_issue uses for its own
  -- refusals, so a "this should have failed" raise written inside the handler's
  -- reach is swallowed by that handler and the check silently passes. Found by
  -- mutation, twice, in this file.
  refused := false;
  begin
    perform public.create_outbound_issue(
      'IES-W-002', 'Oricine', 'Oricare',
      '[{"product_id":"f0000000-0000-0000-0000-000000000001","quantity":"1","sale_price_mdl":null}]'::jsonb,
      '00000000-0000-0000-0000-0000000000ff'
    );
  exception
    when sqlstate 'P0002' then refused := true;
  end;
  if not refused then
    raise exception 'P3-04: an unknown project id was accepted by the write path';
  end if;

  -- A NULL project is still recordable, and the caller's names are used. The
  -- column is nullable while history is reconciled, and a write path that could
  -- not record this case would be unable to record the one case the card leaves
  -- open.
  v_id := public.create_outbound_issue(
    'IES-W-003', 'Fara Proiect SRL', 'Destinatie Netrecuta',
    '[{"product_id":"f0000000-0000-0000-0000-000000000001","quantity":"1","sale_price_mdl":null}]'::jsonb,
    null
  );
  select client_name, project_name, project_id into got
  from public.outbound_issues where id = v_id;
  if got.project_id is not null then
    raise exception 'P3-04: a null project became %', got.project_id;
  end if;
  -- And the row exists at all, which the two checks above would both pass on a
  -- SELECT that matched nothing.
  if got.client_name is null then
    raise exception 'P3-04: the null-project issue was not written at all';
  end if;
  if got.client_name <> 'Fara Proiect SRL' then
    raise exception 'P3-04: the caller names were dropped when no project was given, got %', got.client_name;
  end if;

  -- THE STOCK GUARANTEE FROM 0004 IS UNCHANGED. This card rewrote the function
  -- body, and the one thing that must not have been lost while the file was
  -- open is the refusal that protects the warehouse.
  refused := false;
  begin
    perform public.create_outbound_issue(
      'IES-W-004', 'x', 'y',
      '[{"product_id":"f0000000-0000-0000-0000-000000000001","quantity":"9999","sale_price_mdl":null}]'::jsonb,
      'd0000000-0000-0000-0000-000000000001'
    );
  exception
    when sqlstate 'P0001' then refused := true;
  end;
  if not refused then
    raise exception 'P3-04: an issue overdrawing stock was accepted, so 0018 lost the 0004 check';
  end if;
end
$$;

rollback;
