-- assertions/0067_outbound_direct_client.sql
-- Card P3-118, goal G73, Item 2 of Ivan's four items. What 0067 must have left
-- behind, and what it must NOT have changed. Ruling R-215 is the authority.
--
-- SIX GROUPS, AND THE FIRST FIVE ARE THE CARD'S ACCEPTANCE LINE (a) VERBATIM:
--
--   1. THE MODE COLUMN exists, carries exactly the two tokens, is NOT NULL and
--      defaults to 'project'.
--   2. THE PICKUP DATE COLUMN exists, is a date and is nullable. The client
--      column exists, is nullable and RESTRICTS on delete.
--   3. THE PROJECT CONSTRAINT refuses a 'project' row with a null project and
--      refuses one carrying a pickup date.
--   4. THE DIRECT CLIENT CONSTRAINT refuses a 'direct_client' row with a null
--      client, refuses one with a null pickup date, and refuses one carrying a
--      project.
--   5. THE POLICIES are select, insert and update, and there is NO DELETE POLICY
--      AT ALL, which is what public.invoices has carried since 0063.
--   6. THE WRITE PATH: exactly one public.create_outbound_issue, with the six
--      argument signature 0067 declares, which writes a valid row in EITHER mode
--      and refuses a half filled one in Romanian. And the load bearing one:
--      PUBLIC.BATCHES IS BYTE IDENTICAL AFTER BOTH MODES, because neither mode
--      touches it and stock is a sum.
--
-- GROUP 6 CARRIES WHAT assertions/0026_drop_outbound_free_text.sql USED TO PIN
-- AND CAN NO LONGER PIN. That file asserted project_id NOT NULL and the literal
-- five argument signature. Card P3-118 makes both false about the end state, for
-- the reasons 0067's own header gives, and this directory can only ever describe
-- the END state: every file here runs after ALL migrations have applied. The two
-- sentences are corrected in place there under CLAUDE.md section 9c rather than
-- deleted, and the STRONGER replacements live here. Nothing 0026 proved is lost:
--   NOT NULL said "every row has a project". Group 3 says "every PROJECT row has
--   one", and group 4 adds "and no direct client row has one", which the column
--   level rule could not say at all.
--   The signature pin said "five arguments, forever". Group 6 says "exactly one
--   function, with the signature 0067 declares", which is the same defect caught
--   (two surviving versions make every call ambiguous) without the part that card
--   APPLY-01 removed from the applier for being unconditional.
--
-- WHAT IS DELIBERATELY NOT ASSERTED HERE, said so nobody reads it as proven:
-- everything that needs a real stack or a browser. The three isolation cases of
-- deviation D4, the identical batch rows measured through PostgREST, the nine
-- units and the invoiceability refusal are the named cases of
-- tests/e2e/outbound-direct-client.spec.ts. A bare postgres runs as superuser and
-- bypasses RLS, so a policy assertion here can prove a policy EXISTS and cannot
-- prove what it lets through.
--
-- REFUSALS ARE WRITTEN WITHOUT DIACRITICS, the same convention 0063 and 0066
-- follow: a schema carries no interface text.
--
-- Everything runs inside a transaction that is rolled back.

begin;


-- ===========================================================================
-- 1. THE MODE COLUMN
-- ===========================================================================

do $$
declare
  n    integer;
  txt  text;
begin
  select a.atttypid::regtype::text into txt
  from pg_attribute a
  where a.attrelid = 'public.outbound_issues'::regclass and a.attname = 'mode' and a.attnum > 0;

  if txt is null then
    raise exception 'P3-118: expected public.outbound_issues.mode to exist, found none';
  end if;
  if txt <> 'outbound_mode' then
    raise exception 'P3-118: outbound_issues.mode must be the outbound_mode enum, found %', txt;
  end if;

  -- EXACTLY TWO LABELS, AND THE TWO THE RULING NAMES. A third token added later
  -- without a card is a third meaning nobody decided.
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into txt
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'outbound_mode';

  if txt is distinct from 'project,direct_client' then
    raise exception 'P3-118: outbound_mode labels are (%), expected (project,direct_client)', txt;
  end if;

  select count(*) into n
  from pg_attribute a
  where a.attrelid = 'public.outbound_issues'::regclass and a.attname = 'mode' and a.attnotnull;

  if n <> 1 then
    raise exception 'P3-118: outbound_issues.mode must be NOT NULL';
  end if;

  -- THE DEFAULT IS THE WHOLE REASON EVERY HISTORICAL ROW STILL MEANS WHAT IT
  -- MEANT. A nullable mode column would make every row written before this
  -- migration ambiguous, and the card's defaults say so in terms.
  select pg_get_expr(d.adbin, d.adrelid) into txt
  from pg_attrdef d
  join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  where d.adrelid = 'public.outbound_issues'::regclass and a.attname = 'mode';

  if txt is null or txt not like '%project%' then
    raise exception 'P3-118: outbound_issues.mode must default to project, found %', coalesce(txt, 'no default');
  end if;
end $$;


-- ===========================================================================
-- 2. THE PICKUP DATE AND THE CLIENT
-- ===========================================================================

do $$
declare
  n   integer;
  txt text;
begin
  select a.atttypid::regtype::text into txt
  from pg_attribute a
  where a.attrelid = 'public.outbound_issues'::regclass and a.attname = 'pickup_date' and a.attnum > 0;

  if txt is null then
    raise exception 'P3-118: expected public.outbound_issues.pickup_date to exist, found none';
  end if;
  if txt <> 'date' then
    raise exception 'P3-118: pickup_date must be a date and not a timestamp, found %', txt;
  end if;

  select count(*) into n
  from pg_attribute a
  where a.attrelid = 'public.outbound_issues'::regclass and a.attname = 'pickup_date' and a.attnotnull;

  if n <> 0 then
    raise exception 'P3-118: pickup_date must be NULLABLE: a project issue has none';
  end if;

  select a.atttypid::regtype::text into txt
  from pg_attribute a
  where a.attrelid = 'public.outbound_issues'::regclass and a.attname = 'client_id' and a.attnum > 0;

  if txt is null then
    raise exception 'P3-118: expected public.outbound_issues.client_id to exist, found none';
  end if;

  select count(*) into n
  from pg_attribute a
  where a.attrelid = 'public.outbound_issues'::regclass and a.attname = 'client_id' and a.attnotnull;

  if n <> 0 then
    raise exception 'P3-118: client_id must be NULLABLE: a project issue has none';
  end if;

  -- ON DELETE RESTRICT, for the same reason the project key restricts: a client
  -- with material issued to them must not be deletable out from under the record
  -- of where the material went.
  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.outbound_issues'::regclass
    and c.contype = 'f'
    and c.confrelid = 'public.clients'::regclass
    and c.confdeltype = 'r';

  if n <> 1 then
    raise exception 'P3-118: expected exactly one RESTRICT foreign key to clients, found %', n;
  end if;

  -- The index on the new foreign key, 0001's stated rule.
  select count(*) into n
  from pg_indexes
  where schemaname = 'public' and tablename = 'outbound_issues' and indexdef like '%client_id%';

  if n < 1 then
    raise exception 'P3-118: expected an index covering outbound_issues.client_id, found none';
  end if;
end $$;


-- ===========================================================================
-- FIXTURES for groups 3, 4 and 6
-- ===========================================================================
--
-- Built by hand, prefixed TEST, inside the transaction this file rolls back.
-- Nothing is ever deleted and nothing here reaches any real row.

create temporary table rc_p3_118_fixture (client_id uuid, project_id uuid, product_id uuid);

-- THE PRODUCT IS ONE MIGRATION 0049 ALREADY LOADED, and the count is checked
-- rather than assumed: a fixture that silently finds no product would make every
-- group below pass on nothing.
do $$
begin
  if (select count(*) from public.products) = 0 then
    raise exception 'P3-118: no product exists, so nothing here can be proved. Migration 0049 loads eighty.';
  end if;
end $$;

with c as (
  insert into public.clients (name) values ('TEST P3-118 client') returning id
), p as (
  insert into public.projects (client_id, name)
  select c.id, 'TEST P3-118 proiect' from c
  returning id, client_id
)
insert into rc_p3_118_fixture (client_id, project_id, product_id)
select p.client_id, p.id, (select id from public.products order by sku limit 1) from p;


-- ===========================================================================
-- 3. THE PROJECT CONSTRAINT REFUSES A HALF FILLED PROJECT ROW
-- ===========================================================================

do $$
declare
  v_project_id uuid;
begin
  select project_id into v_project_id from rc_p3_118_fixture;

  -- A valid project row is accepted. WITHOUT THIS WITNESS the two refusals below
  -- would pass on a constraint that refuses everything.
  insert into public.outbound_issues (reference, mode, project_id)
  values ('TEST-P3118-OK-PROJ', 'project', v_project_id);

  begin
    insert into public.outbound_issues (reference, mode, project_id)
    values ('TEST-P3118-NOPROJ', 'project', null);
    raise exception 'P3-118: a project row with a null project was accepted, and must not be';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.outbound_issues (reference, mode, project_id, pickup_date)
    values ('TEST-P3118-PROJ-PICKUP', 'project', v_project_id, date '2026-10-01');
    raise exception 'P3-118: a project row carrying a pickup date was accepted, and must not be';
  exception
    when check_violation then null;
  end;
end $$;


-- ===========================================================================
-- 4. THE DIRECT CLIENT CONSTRAINT REFUSES A HALF FILLED DIRECT CLIENT ROW
-- ===========================================================================

do $$
declare
  v_client_id  uuid;
  v_project_id uuid;
begin
  select client_id, project_id into v_client_id, v_project_id from rc_p3_118_fixture;

  -- The witness again: a complete direct client row IS accepted.
  insert into public.outbound_issues (reference, mode, client_id, pickup_date)
  values ('TEST-P3118-OK-DIRECT', 'direct_client', v_client_id, date '2026-10-01');

  begin
    insert into public.outbound_issues (reference, mode, client_id, pickup_date)
    values ('TEST-P3118-NOCLIENT', 'direct_client', null, date '2026-10-01');
    raise exception 'P3-118: a direct client row with a null client was accepted, and must not be';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.outbound_issues (reference, mode, client_id, pickup_date)
    values ('TEST-P3118-NOPICKUP', 'direct_client', v_client_id, null);
    raise exception 'P3-118: a direct client row with no pickup date was accepted, and must not be';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.outbound_issues (reference, mode, client_id, pickup_date, project_id)
    values ('TEST-P3118-DIRECT-PROJ', 'direct_client', v_client_id, date '2026-10-01', v_project_id);
    raise exception 'P3-118: a direct client row carrying a project was accepted, and must not be';
  exception
    when check_violation then null;
  end;
end $$;


-- ===========================================================================
-- 5. SELECT, INSERT AND UPDATE, AND NO DELETE POLICY AT ALL
-- ===========================================================================

do $$
declare
  n   integer;
  txt text;
begin
  select string_agg(distinct cmd, ',' order by cmd) into txt
  from pg_policies where schemaname = 'public' and tablename = 'outbound_issues';

  if txt is distinct from 'INSERT,SELECT,UPDATE' then
    raise exception 'P3-118: outbound_issues policy commands are (%), expected (INSERT,SELECT,UPDATE)', txt;
  end if;

  -- SAID TWICE ON PURPOSE. The line above would also pass if a delete policy
  -- existed alongside a fourth command nobody expected; this one asks the
  -- question the card asks, in the card's words.
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'outbound_issues' and cmd = 'DELETE';

  if n <> 0 then
    raise exception 'P3-118: outbound_issues must carry NO delete policy, found %', n;
  end if;

  -- THE PREDICATES ARE THE ONES THIS REPOSITORY HAS, D4, AND NO ORGANISATION IS
  -- INVENTED. current_app_role() is security definer and filters on p.active, so
  -- an unauthenticated caller and a deactivated profile both read null from it.
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'outbound_issues'
    and coalesce(qual, '') || coalesce(with_check, '') like '%current_app_role%';

  if n <> 3 then
    raise exception 'P3-118: expected all 3 outbound_issues policies to use current_app_role(), found %', n;
  end if;

  -- RLS is still on, which a policy set says nothing about by itself.
  select count(*) into n from pg_class
  where oid = 'public.outbound_issues'::regclass and relrowsecurity;

  if n <> 1 then
    raise exception 'P3-118: row level security must still be enabled on outbound_issues';
  end if;

  -- public.invoices is the shape the card names, so it is read rather than
  -- described: if 0063's table ever gains a delete policy, the sentence this
  -- card copied has stopped being true and somebody must look.
  select count(*) into n
  from pg_policies where schemaname = 'public' and tablename = 'invoices' and cmd = 'DELETE';

  if n <> 0 then
    raise exception 'P3-118: public.invoices was the model for no-delete and now has % delete policies', n;
  end if;
end $$;


-- ===========================================================================
-- 6. THE WRITE PATH, AND THE BATCHES THAT NEITHER MODE TOUCHES
-- ===========================================================================

do $$
declare
  n            integer;
  txt          text;
  v_batches_0  text;
  v_batches_1  text;
  v_batches_2  text;
  v_avail_0    numeric;
  v_order      uuid;
  v_line       uuid;
  v_client     uuid;
  v_project    uuid;
  v_product    uuid;
  v_project_id uuid;
  v_direct_id  uuid;
begin
  select client_id, project_id, product_id into v_client, v_project, v_product
  from rc_p3_118_fixture;

  -- --- EXACTLY ONE FUNCTION, WITH THE SIGNATURE 0067 DECLARES -------------
  -- Two surviving versions mean a drop did not happen and every call to the name
  -- is ambiguous. That is the defect assertions/0026 was written for and it is
  -- not loosened by one inch; only the "five arguments forever" half is gone,
  -- and card APPLY-01 removed that from the applier for the same reason.
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'create_outbound_issue';

  if n <> 1 then
    raise exception 'P3-118: expected exactly one create_outbound_issue, found %. Two means a drop did not happen and every call is ambiguous.', n;
  end if;

  select array_to_string(array(select format_type(t, null) from unnest(p.proargtypes) as t), ', ')
    into txt
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'create_outbound_issue';

  if txt <> 'text, jsonb, uuid, text, uuid, date' then
    raise exception 'P3-118: create_outbound_issue signature is (%), expected (text, jsonb, uuid, text, uuid, date)', txt;
  end if;

  -- --- STOCK TO ISSUE ------------------------------------------------------
  -- One inbound order, one line, one batch. Stock is batches in minus outbound
  -- lines out, so this is the only way to have any.
  insert into public.inbound_orders (reference, supplier_name)
  values ('TEST-P3118-IN', 'TEST furnizor')
  returning id into v_order;

  insert into public.order_lines (inbound_order_id, product_id, quantity, unit_price)
  values (v_order, v_product, 100, 10)
  returning id into v_line;

  insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
  values (v_product, v_order, v_line, 100);

  select md5(coalesce(string_agg(b.id::text || '|' || b.product_id::text || '|' || b.quantity::text, ',' order by b.id), ''))
    into v_batches_0 from public.batches b;
  v_avail_0 := public.product_available_stock(v_product);

  -- --- A PROJECT ISSUE, THROUGH THE FUNCTION -------------------------------
  select public.create_outbound_issue(
    'TEST-P3118-FN-PROJ',
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 7)),
    v_project, 'project', null, null
  ) into v_project_id;

  select md5(coalesce(string_agg(b.id::text || '|' || b.product_id::text || '|' || b.quantity::text, ',' order by b.id), ''))
    into v_batches_1 from public.batches b;

  -- --- A DIRECT CLIENT ISSUE, SAME PRODUCT, SAME QUANTITY ------------------
  select public.create_outbound_issue(
    'TEST-P3118-FN-DIRECT',
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 7)),
    null, 'direct_client', v_client, date '2026-10-01'
  ) into v_direct_id;

  select md5(coalesce(string_agg(b.id::text || '|' || b.product_id::text || '|' || b.quantity::text, ',' order by b.id), ''))
    into v_batches_2 from public.batches b;

  -- THE LOAD BEARING ASSERTION OF THIS WHOLE CARD. Neither mode touches
  -- public.batches, so the batch rows are identical after both, and the two
  -- modes cannot drift because there is nothing for a second routine to be.
  if v_batches_0 is distinct from v_batches_1 or v_batches_1 is distinct from v_batches_2 then
    raise exception 'P3-118: the batch rows changed. before=% after project=% after direct client=%',
      v_batches_0, v_batches_1, v_batches_2;
  end if;

  -- AND THE STOCK FELL THE SAME AMOUNT BOTH TIMES, which is the other half: rows
  -- identical would also be true if neither issue had been recorded at all. The
  -- baseline is measured rather than assumed to be a hundred, so the case does
  -- not depend on what any earlier migration happens to have loaded.
  if v_avail_0 - public.product_available_stock(v_product) <> 14 then
    raise exception 'P3-118: expected the two issues of 7 to take 14 off the stock, took %',
      v_avail_0 - public.product_available_stock(v_product);
  end if;

  select count(*) into n from public.outbound_lines
  where outbound_issue_id in (v_project_id, v_direct_id);
  if n <> 2 then
    raise exception 'P3-118: expected one line per issue, found %', n;
  end if;

  -- The rows the function wrote carry the mode, and only the columns their mode
  -- allows.
  select mode::text into txt from public.outbound_issues where id = v_direct_id;
  if txt <> 'direct_client' then
    raise exception 'P3-118: the direct client issue stored mode %, expected direct_client', txt;
  end if;

  select count(*) into n from public.outbound_issues
  where id = v_direct_id and project_id is null and client_id = v_client and pickup_date = date '2026-10-01';
  if n <> 1 then
    raise exception 'P3-118: the direct client issue did not store client and pickup date without a project';
  end if;

  select count(*) into n from public.outbound_issues
  where id = v_project_id and mode = 'project' and project_id = v_project
    and client_id is null and pickup_date is null;
  if n <> 1 then
    raise exception 'P3-118: the project issue did not store its project alone';
  end if;

  -- --- THE ROMANIAN REFUSALS, WHICH ARE THE FUNCTION'S HALF ---------------
  -- 0026 asserted the first of these and its reason is kept: the operator must
  -- read a sentence rather than a constraint name. P0001 is the code that
  -- carries one.
  -- THE LINE ARRAY IS REAL HERE ON PURPOSE. assertions/0026 wrote this same case
  -- with an EMPTY array, and the function checks the lines before the project, so
  -- that version passed on the wrong refusal: it proved a card about the project
  -- by triggering the message about the positions. A real line makes the project
  -- the only thing missing.
  begin
    perform public.create_outbound_issue(
      'TEST-P3118-R1',
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1)),
      null, 'project', null, null);
    raise exception 'P3-118: create_outbound_issue accepted a null project in project mode, and must not';
  exception
    when sqlstate 'P0001' then null;
  end;

  begin
    perform public.create_outbound_issue(
      'TEST-P3118-R2',
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1)),
      null, 'direct_client', null, date '2026-10-01');
    raise exception 'P3-118: create_outbound_issue accepted a direct client issue with no client';
  exception
    when sqlstate 'P0001' then null;
  end;

  begin
    perform public.create_outbound_issue(
      'TEST-P3118-R3',
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1)),
      null, 'direct_client', v_client, null);
    raise exception 'P3-118: create_outbound_issue accepted a direct client issue with no pickup date';
  exception
    when sqlstate 'P0001' then null;
  end;

  begin
    perform public.create_outbound_issue(
      'TEST-P3118-R4',
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1)),
      null, 'retail', null, null);
    raise exception 'P3-118: create_outbound_issue accepted an unknown mode token';
  exception
    when sqlstate 'P0001' then null;
  end;

  -- THE OVERDRAW CHECK IS THE SAME CHECK IN THE SECOND MODE. If the direct
  -- client path had its own arithmetic, this is where it would show.
  begin
    perform public.create_outbound_issue(
      'TEST-P3118-R5',
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1000)),
      null, 'direct_client', v_client, date '2026-10-01');
    raise exception 'P3-118: a direct client issue overdrew the stock and was accepted';
  exception
    when sqlstate 'P0001' then null;
  end;
end $$;

rollback;
