-- assertions/0063_invoices.sql
-- Card P3-108, goal G65 part 1. The invoice tables, the numbering that cannot
-- skip or repeat a number, the draft-only rule the DATABASE holds, the frozen
-- unit price, and who may read, write and never delete.
--
-- WHAT THIS FILE CANNOT PROVE, SAID HERE SO NOBODY READS IT AS PROVEN. It runs
-- inside ONE psql session, so it cannot show two operators pressing Emite at the
-- same moment. That half is tests/e2e/facturare-data.spec.ts case 2, which fires
-- five real PostgREST calls in parallel against a local Supabase stack, which is
-- five separate database sessions. Everything a single session CAN prove about the
-- allocator is proved here: the lock statement is in the function, the counter is
-- writable by nobody, a cancelled invoice keeps its number, and the next issue
-- does not reuse it.
--
-- THE EXPECTED FIGURES BELOW ARE WRITTEN BY HAND, not read from the thing under
-- test: an assertion that takes its expectation from the table it is checking
-- passes on wrong data too.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n        integer;
  declared text;
begin
  -- --- four values, in the pipeline order, ENGLISH, no diacritic -------------
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into declared
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public' and t.typname = 'invoice_status';
  if declared is distinct from 'draft,issued,paid,cancelled' then
    raise exception 'P3-108: invoice_status is %, expected draft,issued,paid,cancelled', coalesce(declared, 'nothing');
  end if;

  -- --- the four tables exist with row level security on ----------------------
  select count(*) into n
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relname in ('invoice_settings', 'invoice_number_series', 'invoices', 'invoice_lines')
    and c.relkind = 'r' and c.relrowsecurity;
  if n <> 4 then
    raise exception 'P3-108: % of the four invoice tables exist with RLS on, expected 4', n;
  end if;

  -- --- NO DELETE POLICY ANYWHERE, which is the rule of the whole card --------
  select count(*) into n from pg_policies
  where schemaname = 'public'
    and tablename in ('invoice_settings', 'invoice_number_series', 'invoices', 'invoice_lines')
    and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-108: % delete policies exist on the invoice tables, expected none', n;
  end if;

  -- --- NO DELETE PRIVILEGE ANYWHERE EITHER, because a policy alone is a rule
  --     with a door, and a privilege alone is a door with no rule.
  if has_table_privilege('authenticated', 'public.invoices', 'DELETE')
     or has_table_privilege('authenticated', 'public.invoice_lines', 'DELETE')
     or has_table_privilege('authenticated', 'public.invoice_settings', 'DELETE')
     or has_table_privilege('authenticated', 'public.invoice_number_series', 'DELETE') then
    raise exception 'P3-108: authenticated holds DELETE on an invoice table';
  end if;

  -- --- THE COUNTER IS READ ONLY TO EVERY ROLE -------------------------------
  if has_table_privilege('authenticated', 'public.invoice_number_series', 'INSERT')
     or has_table_privilege('authenticated', 'public.invoice_number_series', 'UPDATE') then
    raise exception 'P3-108: authenticated may write public.invoice_number_series, so a screen could open a hole in a series';
  end if;
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'invoice_number_series' and cmd <> 'SELECT';
  if n <> 0 then
    raise exception 'P3-108: % write policies exist on the counter, expected none', n;
  end if;

  -- --- anon holds nothing ---------------------------------------------------
  if has_table_privilege('anon', 'public.invoices', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('anon', 'public.invoice_lines', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('anon', 'public.invoice_settings', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('anon', 'public.invoice_number_series', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'P3-108: anon holds a privilege on an invoice table';
  end if;

  -- --- the settings are OWNER ONLY to write, active profile to read ----------
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'invoice_settings'
    and policyname = 'invoice_settings_owner_update' and cmd = 'UPDATE'
    and roles = '{authenticated}'::name[]
    and coalesce(qual, '') like '%is_owner()%'
    and coalesce(with_check, '') like '%is_owner()%';
  if n <> 1 then
    raise exception 'P3-108: invoice_settings_owner_update is not an owner-only update for authenticated';
  end if;
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'invoice_settings'
    and policyname = 'invoice_settings_select' and cmd = 'SELECT'
    and coalesce(qual, '') like '%current_app_role()%';
  if n <> 1 then
    raise exception 'P3-108: invoice_settings_select does not read on an active profile';
  end if;
  if has_table_privilege('authenticated', 'public.invoice_settings', 'INSERT') then
    raise exception 'P3-108: authenticated may INSERT a second invoice_settings row';
  end if;

  -- --- invoices and lines: select, insert and update on an ACTIVE PROFILE ----
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename in ('invoices', 'invoice_lines')
    and cmd in ('SELECT', 'INSERT', 'UPDATE')
    and roles = '{authenticated}'::name[]
    and coalesce(qual, with_check) like '%current_app_role()%';
  if n <> 6 then
    raise exception 'P3-108: % of the six invoice and line policies read or write on an active profile, expected 6', n;
  end if;

  -- --- the constraints the card names, by name, so a rename is a red run -----
  select count(*) into n from pg_constraint
  where conrelid = 'public.invoices'::regclass
    and conname in ('invoices_number_unique_per_series', 'invoices_number_with_series',
                    'invoices_numbered_past_draft', 'invoices_currency_mdl',
                    'invoices_subtotal_non_negative', 'invoices_vat_total_non_negative',
                    'invoices_total_non_negative', 'invoices_cancel_reason_only_when_cancelled');
  if n <> 8 then
    raise exception 'P3-108: % of the eight named invoices constraints exist, expected 8', n;
  end if;

  select count(*) into n from pg_constraint
  where conrelid = 'public.invoice_lines'::regclass
    and conname in ('invoice_lines_quantity_positive', 'invoice_lines_unit_price_non_negative',
                    'invoice_lines_vat_rate_range', 'invoice_lines_line_subtotal_non_negative',
                    'invoice_lines_line_vat_non_negative', 'invoice_lines_line_total_non_negative',
                    'invoice_lines_product_or_description');
  if n <> 7 then
    raise exception 'P3-108: % of the seven named invoice_lines constraints exist, expected 7', n;
  end if;

  -- --- the unique constraint is on (series, number) and nothing else ---------
  select count(*) into n
  from pg_constraint c
  join lateral unnest(c.conkey) k(attnum) on true
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
  where c.conname = 'invoices_number_unique_per_series' and c.contype = 'u'
    and a.attname in ('series', 'number');
  if n <> 2 then
    raise exception 'P3-108: invoices_number_unique_per_series is not exactly (series, number)';
  end if;

  -- --- ON DELETE RESTRICT on client, project and the Iesire; CASCADE on lines -
  select count(*) into n from pg_constraint
  where conrelid = 'public.invoices'::regclass and contype = 'f' and confdeltype = 'r';
  if n <> 3 then
    raise exception 'P3-108: % of the three invoice references are ON DELETE RESTRICT, expected 3 (client, project, outbound issue)', n;
  end if;
  select count(*) into n from pg_constraint
  where conrelid = 'public.invoice_lines'::regclass and contype = 'f' and confdeltype = 'c';
  if n <> 1 then
    raise exception 'P3-108: invoice_lines.invoice_id is not ON DELETE CASCADE';
  end if;

  -- --- THE LOCK IS IN THE ALLOCATOR AND THERE IS NO read-the-max ANYWHERE.
  --     The design report forbids the Iesire shape in terms, so the shape is
  --     asserted and not only the outcome: the allocator must increment the
  --     counter row in ONE statement, and must not read max(number) at all.
  select pg_get_functiondef(p.oid) into declared
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'issue_invoice';
  if declared is null then
    raise exception 'P3-108: public.issue_invoice does not exist';
  end if;
  if declared not like '%update public.invoice_number_series%'
     or declared not like '%next_number = next_number + 1%'
     or declared not like '%returning next_number - 1%' then
    raise exception 'P3-108: issue_invoice does not allocate by incrementing the counter row in one returning statement';
  end if;
  if declared like '%max(number)%' or declared like '%max(i.number)%' then
    raise exception 'P3-108: issue_invoice reads the highest number, which is the Iesire shape the design report forbids';
  end if;
  if declared not like '%SECURITY DEFINER%' then
    raise exception 'P3-108: issue_invoice is not SECURITY DEFINER, so the counter cannot be closed to every writer but it';
  end if;
  if declared not like '%current_app_role() is null%' then
    raise exception 'P3-108: issue_invoice does not refuse a caller without an active profile, which a definer function must do itself';
  end if;

  -- --- the two draft guards and the two triggers that carry them -------------
  select count(*) into n from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and not t.tgisinternal
    and t.tgname in ('invoices_require_draft_to_edit', 'invoice_lines_require_draft');
  if n <> 2 then
    raise exception 'P3-108: % of the two draft-only triggers exist, expected 2', n;
  end if;

  -- The line guard covers INSERT as well as UPDATE. tgtype bit 2 is INSERT and
  -- bit 16 is UPDATE, so both bits must be set.
  select count(*) into n from pg_trigger
  where tgname = 'invoice_lines_require_draft' and (tgtype & 4) > 0 and (tgtype & 16) > 0;
  if n <> 1 then
    raise exception 'P3-108: invoice_lines_require_draft does not fire on both INSERT and UPDATE';
  end if;
end
$$;


-- ===========================================================================
-- 2. THE FIXTURES
-- ===========================================================================
--
-- Built by hand, inside this transaction, and rolled back with it. An owner, an
-- active operator, a DEACTIVATED operator, a client, a project, a category and two
-- products. Every name carries the card id so a grid is readable.

insert into auth.users (id, email) values
  ('e3180000-0000-4000-8000-000000000001', 'p3-108-owner@rc-inventory.local'),
  ('e3180000-0000-4000-8000-000000000002', 'p3-108-operator@rc-inventory.local'),
  ('e3180000-0000-4000-8000-000000000003', 'p3-108-inactiv@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3180000-0000-4000-8000-000000000001', 'p3-108-owner@rc-inventory.local', 'owner', true),
  ('e3180000-0000-4000-8000-000000000002', 'p3-108-operator@rc-inventory.local', 'account_manager', true),
  ('e3180000-0000-4000-8000-000000000003', 'p3-108-inactiv@rc-inventory.local', 'account_manager', false);

insert into public.clients (id, name) values
  ('e3181000-0000-4000-8000-000000000001', 'P3-108 Client');

insert into public.projects (id, client_id, name) values
  ('e3182000-0000-4000-8000-000000000001', 'e3181000-0000-4000-8000-000000000001', 'P3-108 Santier');

insert into public.categories (id, name) values
  ('e3183000-0000-4000-8000-000000000001', 'P3-108 Categorie');

insert into public.products (id, sku, name, category_id, unit, unit_value_mdl) values
  ('e3184000-0000-4000-8000-000000000001', 'TEST-P3-108-01', 'P3-108 Produs', 'e3183000-0000-4000-8000-000000000001', 'pcs', 100),
  ('e3184000-0000-4000-8000-000000000002', 'TEST-P3-108-02', 'P3-108 Produs doi', 'e3183000-0000-4000-8000-000000000001', 'm2', 50);


-- ===========================================================================
-- 3. WHAT A ROW MAY BE, AND WHAT THE ARITHMETIC IS
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3180000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  c1      constant uuid := 'e3181000-0000-4000-8000-000000000001';
  p1      constant uuid := 'e3182000-0000-4000-8000-000000000001';
  prod1   constant uuid := 'e3184000-0000-4000-8000-000000000001';
  owner   constant uuid := 'e3180000-0000-4000-8000-000000000001';
  inv     constant uuid := 'e3185000-0000-4000-8000-000000000001';
  who     uuid;
  got     numeric;
  refused boolean;
begin
  -- --- a draft invoice: no number, no series, status draft -------------------
  insert into public.invoices (id, client_id, project_id) values (inv, c1, p1);

  select created_by into who from public.invoices where id = inv;
  if who is distinct from owner then
    raise exception 'P3-108: created_by defaulted to %, expected the signed-in user %', who, owner;
  end if;

  if (select status from public.invoices where id = inv) <> 'draft' then
    raise exception 'P3-108: a new invoice is not a draft';
  end if;
  if (select number from public.invoices where id = inv) is not null then
    raise exception 'P3-108: a draft invoice carries a number, and a number is allocated only on Emite';
  end if;

  -- --- THE LINE ARITHMETIC IS COMPUTED AND NEVER ACCEPTED -------------------
  -- 3 x 125,50 = 376,50 subtotal; 20 per cent is 75,30; total 451,80. Every one
  -- of those three is written by hand here, and the line below supplies DELIBERATE
  -- NONSENSE for all three so a trigger that merely defaulted them would pass and
  -- this one cannot.
  insert into public.invoice_lines
    (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate,
     line_subtotal_mdl, line_vat_mdl, line_total_mdl)
  values (inv, prod1, 3, 'pcs', 125.50, 20, 1, 1, 1);

  select line_subtotal_mdl into got from public.invoice_lines where invoice_id = inv;
  if got <> 376.50 then
    raise exception 'P3-108: the line subtotal is %, expected 376.50', got;
  end if;
  select line_vat_mdl into got from public.invoice_lines where invoice_id = inv;
  if got <> 75.30 then
    raise exception 'P3-108: the line VAT is %, expected 75.30', got;
  end if;
  select line_total_mdl into got from public.invoice_lines where invoice_id = inv;
  if got <> 451.80 then
    raise exception 'P3-108: the line total is %, expected 451.80', got;
  end if;

  -- --- AND THE FOOT OF THE INVOICE FOLLOWS THE LINES ------------------------
  select total_mdl into got from public.invoices where id = inv;
  if got <> 451.80 then
    raise exception 'P3-108: the invoice total is %, expected 451.80', got;
  end if;

  -- A second line, and the foot moves with it. 2 x 50 = 100, VAT 0, so 551,80.
  insert into public.invoice_lines (invoice_id, description, quantity, unit, unit_price_mdl, vat_rate,
                                    line_subtotal_mdl, line_vat_mdl, line_total_mdl)
  values (inv, 'Transport', 2, 'pcs', 50, 0, 0, 0, 0);
  select total_mdl into got from public.invoices where id = inv;
  if got <> 551.80 then
    raise exception 'P3-108: after a second line the invoice total is %, expected 551.80', got;
  end if;
  select subtotal_mdl into got from public.invoices where id = inv;
  if got <> 476.50 then
    raise exception 'P3-108: the invoice subtotal is %, expected 476.50', got;
  end if;
  select vat_total_mdl into got from public.invoices where id = inv;
  if got <> 75.30 then
    raise exception 'P3-108: the invoice VAT total is %, expected 75.30', got;
  end if;

  -- --- WHAT THE TABLES REFUSE ----------------------------------------------
  refused := false;
  begin
    insert into public.invoices (client_id, currency) values (c1, 'EUR');
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'P3-108: a currency other than MDL was ACCEPTED'; end if;

  refused := false;
  begin
    insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl)
    values (inv, prod1, 0, 'pcs', 10);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'P3-108: a quantity of zero was ACCEPTED'; end if;

  refused := false;
  begin
    insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl)
    values (inv, prod1, 1, 'pcs', -1);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'P3-108: a negative unit price was ACCEPTED'; end if;

  refused := false;
  begin
    insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
    values (inv, prod1, 1, 'pcs', 10, -5);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'P3-108: a negative VAT rate was ACCEPTED'; end if;

  refused := false;
  begin
    insert into public.invoice_lines (invoice_id, quantity, unit, unit_price_mdl)
    values (inv, 1, 'pcs', 10);
  exception when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-108: a line with neither a product nor a description was ACCEPTED';
  end if;

  refused := false;
  begin
    insert into public.invoices (client_id, series, number) values (c1, 'RC-2026', null);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'P3-108: a series with no number was ACCEPTED'; end if;

  refused := false;
  begin
    insert into public.invoices (client_id, status, cancel_reason) values (c1, 'draft', 'de ce');
  exception when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-108: a cancellation reason on a draft was ACCEPTED';
  end if;

  -- A draft cannot be pushed past draft without a number, which is the other half
  -- of "the number is allocated only on Emite". The guard in 7a lets a draft
  -- change freely, so the constraint is what refuses this.
  refused := false;
  begin
    update public.invoices set status = 'issued' where id = inv;
  exception when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-108: a draft was moved to issued with NO NUMBER';
  end if;
end
$$;


-- ===========================================================================
-- 4. THE NUMBERING
-- ===========================================================================
--
-- The series comes from the settings, the counter hands out consecutive numbers,
-- a cancelled invoice KEEPS its number, and the next issue does not reuse it.

do $$
declare
  c1        constant uuid := 'e3181000-0000-4000-8000-000000000001';
  prod1     constant uuid := 'e3184000-0000-4000-8000-000000000001';
  issue_on  constant date := date '2026-03-15';
  want_ser  constant text := 'RC-2026';
  a         uuid;
  b         uuid;
  c         uuid;
  got_ser   text;
  n1        integer;
  n2        integer;
  n3        integer;
  refused   boolean;
begin
  if public.invoice_series_for(issue_on) <> want_ser then
    raise exception 'P3-108: the series of % is %, expected % from the default prefix RC- with the year',
      issue_on, public.invoice_series_for(issue_on), want_ser;
  end if;

  insert into public.invoices (client_id) values (c1) returning id into a;
  insert into public.invoices (client_id) values (c1) returning id into b;
  insert into public.invoices (client_id) values (c1) returning id into c;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (a, prod1, 1, 'pcs', 10, 20), (b, prod1, 1, 'pcs', 10, 20), (c, prod1, 1, 'pcs', 10, 20);

  -- --- TWO INVOICES IN ONE SERIES GET CONSECUTIVE NUMBERS -------------------
  perform public.issue_invoice(a, issue_on, issue_on + 30);
  perform public.issue_invoice(b, issue_on, issue_on + 30);

  select series, number into got_ser, n1 from public.invoices where id = a;
  if got_ser <> want_ser then
    raise exception 'P3-108: the first invoice landed in series %, expected %', got_ser, want_ser;
  end if;
  select number into n2 from public.invoices where id = b;
  if n2 <> n1 + 1 then
    raise exception 'P3-108: two invoices issued in one series got % and %, expected consecutive numbers', n1, n2;
  end if;
  if n1 <> 1 then
    raise exception 'P3-108: the first invoice of a fresh series is number %, expected 1', n1;
  end if;

  -- --- BOTH ARE issued, DATED, AND STAMPED WITH WHO AND WHEN ----------------
  if (select status from public.invoices where id = a) <> 'issued' then
    raise exception 'P3-108: an issued invoice is not issued';
  end if;
  if (select issue_date from public.invoices where id = a) <> issue_on then
    raise exception 'P3-108: the issue date was not written';
  end if;
  if (select due_date from public.invoices where id = a) <> issue_on + 30 then
    raise exception 'P3-108: the due date was not written';
  end if;
  if (select issued_at from public.invoices where id = a) is null
     or (select issued_by from public.invoices where id = a) is null then
    raise exception 'P3-108: issued_at and issued_by were not stamped';
  end if;

  -- --- ISSUING TWICE NEVER REPEATS A NUMBER, AND THE SECOND CALL IS REFUSED --
  refused := false;
  begin
    perform public.issue_invoice(a, issue_on, null);
  exception when restrict_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-108: an invoice already issued was issued a SECOND time';
  end if;
  if (select number from public.invoices where id = a) <> n1 then
    raise exception 'P3-108: a refused second issue changed the number';
  end if;

  -- --- A CANCELLED INVOICE KEEPS ITS NUMBER --------------------------------
  update public.invoices
     set status = 'cancelled', cancel_reason = 'Emisa pe clientul greșit'
   where id = b;
  if (select number from public.invoices where id = b) <> n2 then
    raise exception 'P3-108: cancelling changed the number from % to %', n2, (select number from public.invoices where id = b);
  end if;
  if (select cancelled_at from public.invoices where id = b) is null
     or (select cancelled_by from public.invoices where id = b) is null then
    raise exception 'P3-108: cancelled_at and cancelled_by were not stamped';
  end if;
  if (select issued_at from public.invoices where id = b) is null then
    raise exception 'P3-108: cancelling cleared issued_at; an invoice cancelled today was still issued when it was';
  end if;

  -- --- AND THE NEXT ISSUE DOES NOT REUSE IT --------------------------------
  perform public.issue_invoice(c, issue_on, null);
  select number into n3 from public.invoices where id = c;
  if n3 <> n2 + 1 then
    raise exception 'P3-108: after cancelling number % the next invoice got %, expected %', n2, n3, n2 + 1;
  end if;

  -- --- THE COUNTER SAYS WHAT IT HANDED OUT ---------------------------------
  if (select next_number from public.invoice_number_series where series = want_ser) <> n3 + 1 then
    raise exception 'P3-108: the counter of % stands at %, expected %', want_ser,
      (select next_number from public.invoice_number_series where series = want_ser), n3 + 1;
  end if;

  -- --- AND NO SCREEN CAN MOVE IT -------------------------------------------
  -- The counter has no write policy and no write grant, so the UPDATE below is
  -- refused by the privilege before a policy is even consulted.
  refused := false;
  begin
    update public.invoice_number_series set next_number = 900 where series = want_ser;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then
    raise exception 'P3-108: a signed-in account MOVED the series counter';
  end if;

  -- --- A DIFFERENT YEAR IS A DIFFERENT SERIES, STARTING AT 1 ---------------
  declare
    d uuid;
  begin
    insert into public.invoices (client_id) values (c1) returning id into d;
    perform public.issue_invoice(d, date '2027-01-04', null);
    if (select series from public.invoices where id = d) <> 'RC-2027' then
      raise exception 'P3-108: an invoice issued in 2027 landed in series %', (select series from public.invoices where id = d);
    end if;
    if (select number from public.invoices where id = d) <> 1 then
      raise exception 'P3-108: the first invoice of RC-2027 is number %, expected 1', (select number from public.invoices where id = d);
    end if;
  end;
end
$$;


-- ===========================================================================
-- 5. ONLY A DRAFT MAY CHANGE, AND THE DATABASE SAYS SO
-- ===========================================================================
--
-- No screen is involved anywhere in this block. Every refusal below comes from
-- the two triggers of section 7a and 7d of the migration.

do $$
declare
  c1      constant uuid := 'e3181000-0000-4000-8000-000000000001';
  p1      constant uuid := 'e3182000-0000-4000-8000-000000000001';
  prod1   constant uuid := 'e3184000-0000-4000-8000-000000000001';
  prod2   constant uuid := 'e3184000-0000-4000-8000-000000000002';
  st      public.invoice_status;
  inv     uuid;
  line    uuid;
  refused boolean;
begin
  foreach st in array array['issued', 'paid', 'cancelled']::public.invoice_status[]
  loop
    insert into public.invoices (client_id, project_id) values (c1, p1) returning id into inv;
    insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
    values (inv, prod1, 2, 'pcs', 40, 20) returning id into line;

    -- While it IS a draft, everything changes freely. That is the control: a
    -- trigger that refused everything would pass every refusal below and be wrong.
    update public.invoices set notes = 'o nota pe ciornă' where id = inv;
    update public.invoice_lines set quantity = 3 where id = line;

    perform public.issue_invoice(inv, current_date, null);
    if st <> 'issued' then
      update public.invoices set status = st,
             cancel_reason = case when st = 'cancelled' then 'motiv' else null end
       where id = inv;
    end if;
    if (select status from public.invoices where id = inv) <> st then
      raise exception 'P3-108: could not move the invoice to %', st;
    end if;

    -- --- THE NOTES ARE FROZEN -------------------------------------------
    refused := false;
    begin
      update public.invoices set notes = 'altă notă' where id = inv;
    exception when restrict_violation then refused := true;
    end;
    if not refused then
      raise exception 'P3-108: the notes of a % invoice were CHANGED', st;
    end if;

    -- --- SO IS WHO IT IS TO --------------------------------------------
    refused := false;
    begin
      update public.invoices set project_id = null where id = inv;
    exception when restrict_violation then refused := true;
    end;
    if not refused then
      raise exception 'P3-108: the project of a % invoice was CHANGED', st;
    end if;

    -- --- AND THE NUMBER -----------------------------------------------
    refused := false;
    begin
      update public.invoices set number = 9999 where id = inv;
    exception when restrict_violation then refused := true;
    end;
    if not refused then
      raise exception 'P3-108: the number of a % invoice was CHANGED', st;
    end if;

    -- --- AND THE TOTALS -----------------------------------------------
    refused := false;
    begin
      update public.invoices set total_mdl = 1 where id = inv;
    exception when restrict_violation then refused := true;
    end;
    if not refused then
      raise exception 'P3-108: the total of a % invoice was CHANGED', st;
    end if;

    -- --- A LINE CANNOT BE EDITED --------------------------------------
    refused := false;
    begin
      update public.invoice_lines set quantity = 99 where id = line;
    exception when restrict_violation then refused := true;
    end;
    if not refused then
      raise exception 'P3-108: a line of a % invoice was EDITED', st;
    end if;

    refused := false;
    begin
      update public.invoice_lines set unit_price_mdl = 1 where id = line;
    exception when restrict_violation then refused := true;
    end;
    if not refused then
      raise exception 'P3-108: the price on a line of a % invoice was CHANGED', st;
    end if;

    -- --- AND A LINE CANNOT BE ADDED, WHICH IS THE LARGER HALF ----------
    refused := false;
    begin
      insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl)
      values (inv, prod2, 1, 'm2', 10);
    exception when restrict_violation then refused := true;
    end;
    if not refused then
      raise exception 'P3-108: a line was ADDED to a % invoice', st;
    end if;

    -- --- WHAT STAYS POSSIBLE PAST DRAFT, so the guard is not a wall ----
    if st = 'issued' then
      update public.invoices set status = 'paid' where id = inv;
      if (select paid_at from public.invoices where id = inv) is null then
        raise exception 'P3-108: an issued invoice could not be marked paid';
      end if;
    end if;
    if st = 'cancelled' then
      update public.invoices set cancel_reason = 'motiv corectat' where id = inv;
    end if;
  end loop;
end
$$;


-- ===========================================================================
-- 6. THE UNIT PRICE IS A SNAPSHOT
-- ===========================================================================
--
-- THE CASE THE DESIGN REPORT NAMES: an invoice issued in March still shows the
-- March price after the catalogue has moved. Nothing joins an invoice line to the
-- live catalogue price, and this block is what would notice if somebody ever did.

do $$
declare
  c1      constant uuid := 'e3181000-0000-4000-8000-000000000001';
  prod1   constant uuid := 'e3184000-0000-4000-8000-000000000001';
  inv     uuid;
  got     numeric;
begin
  insert into public.invoices (client_id) values (c1) returning id into inv;
  -- The catalogue says 100 today, and the line is written with 100.
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (inv, prod1, 4, 'pcs', 100, 20);
  perform public.issue_invoice(inv, date '2026-03-01', null);

  select total_mdl into got from public.invoices where id = inv;
  if got <> 480 then
    raise exception 'P3-108: the invoice total is %, expected 480 (4 x 100 plus 20 per cent)', got;
  end if;
end
$$;

reset role;

-- THE CATALOGUE MOVES. As the table owner, because the product write policies are
-- owner-only and this is not what is under test.
update public.products set unit_value_mdl = 130
where id = 'e3184000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3180000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  got numeric;
begin
  if (select unit_value_mdl from public.products where id = 'e3184000-0000-4000-8000-000000000001') <> 130 then
    raise exception 'P3-108: the catalogue price did not move, so this block proves nothing';
  end if;

  select l.unit_price_mdl into got
  from public.invoice_lines l
  join public.invoices i on i.id = l.invoice_id
  where i.issue_date = date '2026-03-01' and l.product_id = 'e3184000-0000-4000-8000-000000000001';
  if got <> 100 then
    raise exception 'P3-108: the price on the March line is now %, expected the frozen 100', got;
  end if;

  select i.total_mdl into got from public.invoices i where i.issue_date = date '2026-03-01';
  if got <> 480 then
    raise exception 'P3-108: the March invoice total is now %, expected the frozen 480', got;
  end if;
end
$$;


-- ===========================================================================
-- 7. WHO MAY WRITE, WHO MAY NOT, AND NOBODY MAY DELETE
-- ===========================================================================

-- --- AN ACTIVE OPERATOR MAY WRITE AN INVOICE AND ITS LINES -------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"e3180000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  c1    constant uuid := 'e3181000-0000-4000-8000-000000000001';
  prod1 constant uuid := 'e3184000-0000-4000-8000-000000000001';
  inv   uuid;
  n     integer;
begin
  insert into public.invoices (client_id) values (c1) returning id into inv;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (inv, prod1, 1, 'pcs', 10, 20);
  update public.invoices set notes = 'scrisă de operator' where id = inv;
  perform public.issue_invoice(inv, current_date, null);
  if (select number from public.invoices where id = inv) is null then
    raise exception 'P3-108: an ACTIVE OPERATOR could not issue an invoice';
  end if;

  select count(*) into n from public.invoices;
  if n = 0 then
    raise exception 'P3-108: an active operator reads no invoice at all';
  end if;

  -- AND MAY NOT WRITE THE SETTINGS. The owner-only policy lets no row through, so
  -- an update touches nothing and raises nothing: the proof is the value after.
  update public.invoice_settings set series_prefix = 'OP-' where id;
end
$$;

reset role;

do $$
begin
  if (select series_prefix from public.invoice_settings where id) <> 'RC-' then
    raise exception 'P3-108: an OPERATOR changed the invoice series prefix';
  end if;
end
$$;

-- --- A DEACTIVATED ACCOUNT MAY NEITHER READ NOR WRITE ------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"e3180000-0000-4000-8000-000000000003","role":"authenticated"}';

do $$
declare
  c1      constant uuid := 'e3181000-0000-4000-8000-000000000001';
  n       integer;
  refused boolean;
begin
  -- A refused READ is an empty result and not an error: row level security filters
  -- rows on select, which is the distinction 0055 records.
  select count(*) into n from public.invoices;
  if n <> 0 then
    raise exception 'P3-108: a DEACTIVATED account read % invoices, expected none', n;
  end if;
  select count(*) into n from public.invoice_settings;
  if n <> 0 then
    raise exception 'P3-108: a DEACTIVATED account read the invoice settings';
  end if;

  refused := false;
  begin
    insert into public.invoices (client_id) values (c1);
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then
    raise exception 'P3-108: a DEACTIVATED account WROTE an invoice';
  end if;

  -- AND CANNOT ISSUE, because the definer function asks the same question itself.
  refused := false;
  begin
    perform public.issue_invoice('e3185000-0000-4000-8000-000000000001', current_date, null);
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then
    raise exception 'P3-108: a DEACTIVATED account reached issue_invoice';
  end if;
end
$$;

-- --- NOBODY SIGNED IN REACHES ANYTHING --------------------------------------
reset role;
set local role anon;

do $$
declare
  refused boolean;
begin
  refused := false;
  begin
    perform 1 from public.invoices limit 1;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'P3-108: anon READ public.invoices'; end if;

  refused := false;
  begin
    perform 1 from public.invoice_settings limit 1;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'P3-108: anon READ public.invoice_settings'; end if;

  refused := false;
  begin
    perform public.issue_invoice('e3185000-0000-4000-8000-000000000001', current_date, null);
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'P3-108: anon reached issue_invoice'; end if;
end
$$;

-- --- AND NO DELETE IS POSSIBLE FOR ANY ROLE ---------------------------------
-- The owner is the strongest role this application has, so if the owner cannot
-- delete, nobody in the application can. The privilege is absent, so the attempt
-- is refused before a policy is consulted.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"e3180000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  refused boolean;
  before  integer;
  after   integer;
begin
  select count(*) into before from public.invoices;
  if before = 0 then
    raise exception 'P3-108: there is no invoice to try to delete, so this block proves nothing';
  end if;

  refused := false;
  begin
    delete from public.invoices;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'P3-108: THE OWNER DELETED AN INVOICE'; end if;

  refused := false;
  begin
    delete from public.invoice_lines;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'P3-108: THE OWNER DELETED AN INVOICE LINE'; end if;

  refused := false;
  begin
    delete from public.invoice_settings;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'P3-108: THE OWNER DELETED THE INVOICE SETTINGS'; end if;

  refused := false;
  begin
    delete from public.invoice_number_series;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'P3-108: THE OWNER DELETED A SERIES COUNTER'; end if;

  select count(*) into after from public.invoices;
  if after <> before then
    raise exception 'P3-108: the invoice count went from % to % across four refused deletes', before, after;
  end if;
end
$$;


-- ===========================================================================
-- 8. THE OWNER MAY CHANGE THE SETTINGS, AND THE SERIES FOLLOWS
-- ===========================================================================

do $$
declare
  got text;
begin
  update public.invoice_settings
     set series_prefix = 'FAC-', default_vat_rate = 8,
         issuer_name = 'Rapid Construct SRL', issuer_fiscal_code = '1234567890123',
         issuer_address = 'Chisinau', issuer_bank = 'Banca', issuer_iban = 'MD00AG000000000000000000'
   where id;

  if (select series_prefix from public.invoice_settings where id) <> 'FAC-' then
    raise exception 'P3-108: THE OWNER could not change the series prefix';
  end if;
  if (select default_vat_rate from public.invoice_settings where id) <> 8 then
    raise exception 'P3-108: THE OWNER could not change the default VAT rate';
  end if;

  -- THE PREFIX IS NOT DECORATION: the next series follows it.
  got := public.invoice_series_for(date '2026-06-01');
  if got <> 'FAC-2026' then
    raise exception 'P3-108: after the prefix changed the series of a June 2026 invoice is %, expected FAC-2026', got;
  end if;

  -- AND A BLANK PREFIX IS REFUSED, so a series can never be nameless.
  declare
    refused boolean := false;
  begin
    begin
      update public.invoice_settings set series_prefix = '   ' where id;
    exception when check_violation then refused := true;
    end;
    if not refused then raise exception 'P3-108: a blank series prefix was ACCEPTED'; end if;
  end;

  declare
    refused boolean := false;
  begin
    begin
      update public.invoice_settings set default_vat_rate = -1 where id;
    exception when check_violation then refused := true;
    end;
    if not refused then raise exception 'P3-108: a negative default VAT rate was ACCEPTED'; end if;
  end;

  -- AND A SECOND SETTINGS ROW CANNOT EXIST, whoever asks.
  declare
    refused boolean := false;
  begin
    begin
      insert into public.invoice_settings (id) values (false);
    exception when insufficient_privilege or check_violation or unique_violation then refused := true;
    end;
    if not refused then raise exception 'P3-108: a SECOND invoice_settings row was ACCEPTED'; end if;
  end;
end
$$;

reset role;

rollback;
