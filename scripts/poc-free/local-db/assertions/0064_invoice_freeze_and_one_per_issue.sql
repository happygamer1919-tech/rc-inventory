-- assertions/0064_invoice_freeze_and_one_per_issue.sql
-- Card P3-111, goal G67, findings G1, G4, G5, G6 and G16 of
-- docs/reports/2026-09-29-critic-bug-sweep-2.md. What 0064 must have left behind.
--
-- SIX GROUPS:
--
--   1. THE SHAPE. The replaced guard carries both new branches, the partial
--      unique index exists and is partial on the cancelled status, and
--      public.save_invoice_draft exists, returns uuid, is SECURITY INVOKER, is
--      executable by authenticated and is NOT executable by anon.
--   2. THE PIPELINE. draft to issued, issued to paid and issued to cancelled are
--      the only legal moves. Every move back to draft is refused, from issued,
--      from paid and from cancelled, which is finding G1. paid to cancelled,
--      cancelled to paid, cancelled to issued, draft to paid and draft to
--      cancelled are refused too.
--   3. THE SIX STAMP COLUMNS, finding G16: writable while null, refused once set,
--      and the witness half proves the first half so the branch is not a wall.
--   4. ONE LIVE INVOICE PER IESIRE, finding G5: a second live invoice on one
--      Iesire is refused, a manual invoice with no Iesire is not affected, and a
--      CANCELLED invoice does not block a new one.
--   5. THE RPC, finding G6: it writes the header and the lines, the triggers still
--      own every figure, it rewrites a draft, and it refuses an invoice past
--      draft, an empty line list, a stored line left out, and a line id that
--      belongs to another invoice.
--   6. NOTHING ABOUT DELETING MOVED.
--
-- WHAT IS DELIBERATELY NOT ASSERTED HERE, AND WHERE IT IS PROVED INSTEAD.
--
--   THE ATOMICITY OF THE RPC. A psql session is ONE transaction, so a plpgsql
--   EXCEPTION block around a failing call rolls back a two-statement
--   implementation exactly as it rolls back a one-statement one, and an assertion
--   written here would pass for the code this card is replacing. Two PostgREST
--   requests are TWO transactions and one RPC call is one, so only a spec over
--   the real stack can tell them apart: it is case 9 of
--   tests/e2e/facturare-data.spec.ts, which counts the invoices of a fresh client,
--   makes a save fail on its line, and finds the count unchanged.
--
--   THE PREVIEW ARITHMETIC, finding G4. It is TypeScript in
--   lib/data/facturare-money.ts and there is no SQL to assert. What this file can
--   and does assert is the other side of the promise: that the trigger rounds the
--   four measured cases the way the sweep measured them, so the figure the screen
--   is now required to match is written down here in SQL as well.
--
-- Everything runs inside a transaction that is rolled back.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n integer;
  d text;
begin
  -- --- THE GUARD CARRIES BOTH NEW BRANCHES ----------------------------------
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'invoices_require_draft_to_edit';
  if d is null then
    raise exception 'P3-111: public.invoices_require_draft_to_edit() does not exist';
  end if;
  if d not like '%new.status is distinct from old.status%' then
    raise exception 'P3-111: the guard does not look at the status move at all';
  end if;
  -- ALL SIX STAMP COLUMNS, each by name, because five of six protected is the
  -- shape of the hole this card is closing.
  if d not like '%old.issued_at%is not null%' then
    raise exception 'P3-111: the guard does not protect issued_at';
  end if;
  if d not like '%old.issued_by%is not null%' then
    raise exception 'P3-111: the guard does not protect issued_by';
  end if;
  if d not like '%old.paid_at%is not null%' then
    raise exception 'P3-111: the guard does not protect paid_at';
  end if;
  if d not like '%old.paid_by%is not null%' then
    raise exception 'P3-111: the guard does not protect paid_by';
  end if;
  if d not like '%old.cancelled_at%is not null%' then
    raise exception 'P3-111: the guard does not protect cancelled_at';
  end if;
  if d not like '%old.cancelled_by%is not null%' then
    raise exception 'P3-111: the guard does not protect cancelled_by';
  end if;
  -- And the fifteen frozen columns are still there, so this card widened the
  -- guard and did not replace what it already held.
  if d not like '%new.total_mdl%is distinct from old.total_mdl%' then
    raise exception 'P3-111: the guard no longer freezes total_mdl, which 0063 froze';
  end if;
  if d not like '%new.issue_date%is distinct from old.issue_date%' then
    raise exception 'P3-111: the guard no longer freezes issue_date, which 0063 froze';
  end if;

  -- --- THE TRIGGER STILL FIRES, AND STILL BEFORE THE STAMPER ----------------
  -- The stamp branch can only tell a caller's rewrite from the stamper's own fill
  -- because this trigger name sorts before 'invoices_stamp_status'.
  select count(*) into n from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'invoices' and not t.tgisinternal
    and t.tgname = 'invoices_require_draft_to_edit'
    and (t.tgtype & 16) > 0;
  if n <> 1 then
    raise exception 'P3-111: the invoices_require_draft_to_edit trigger does not fire on UPDATE';
  end if;
  if 'invoices_require_draft_to_edit' >= 'invoices_stamp_status' then
    raise exception 'P3-111: the guard no longer sorts before invoices_stamp_status, so it would see a stamped row';
  end if;

  -- --- THE PARTIAL UNIQUE INDEX ---------------------------------------------
  select count(*) into n from pg_indexes
  where schemaname = 'public' and tablename = 'invoices'
    and indexname = 'invoices_one_live_per_outbound_issue'
    and indexdef like 'CREATE UNIQUE INDEX%'
    and indexdef like '%(outbound_issue_id)%'
    and indexdef like '%cancelled%';
  if n <> 1 then
    raise exception 'P3-111: invoices_one_live_per_outbound_issue is not a partial unique index on outbound_issue_id';
  end if;

  -- --- THE RPC, ITS RETURN TYPE, ITS SECURITY AND ITS GRANTS ----------------
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'save_invoice_draft'
    and p.prorettype = 'uuid'::regtype
    and not p.prosecdef;
  if n <> 1 then
    raise exception 'P3-111: public.save_invoice_draft is missing, does not return uuid, or is SECURITY DEFINER';
  end if;

  if not has_function_privilege('authenticated',
       'public.save_invoice_draft(uuid, jsonb, uuid, uuid, uuid, date, text)', 'EXECUTE') then
    raise exception 'P3-111: authenticated may not execute public.save_invoice_draft';
  end if;
  if has_function_privilege('anon',
       'public.save_invoice_draft(uuid, jsonb, uuid, uuid, uuid, date, text)', 'EXECUTE') then
    raise exception 'P3-111: anon may execute public.save_invoice_draft';
  end if;

  -- AND THE NUMBERING IS UNTOUCHED. This card must not have moved it.
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'issue_invoice' and p.prosecdef;
  if n <> 1 then
    raise exception 'P3-111: public.issue_invoice is gone or is no longer SECURITY DEFINER';
  end if;
end
$$;


-- ===========================================================================
-- 2. THE FIXTURES
-- ===========================================================================
--
-- Built by hand, inside this transaction, and rolled back with it. The same shape
-- assertions/0063_invoices.sql uses, with this card's own uuid prefix so a grid is
-- readable and the two files cannot collide.

insert into auth.users (id, email) values
  ('e3190000-0000-4000-8000-000000000001', 'p3-111-owner@rc-inventory.local'),
  ('e3190000-0000-4000-8000-000000000002', 'p3-111-operator@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3190000-0000-4000-8000-000000000001', 'p3-111-owner@rc-inventory.local', 'owner', true),
  ('e3190000-0000-4000-8000-000000000002', 'p3-111-operator@rc-inventory.local', 'account_manager', true);

insert into public.clients (id, name) values
  ('e3191000-0000-4000-8000-000000000001', 'P3-111 Client');

insert into public.projects (id, client_id, name) values
  ('e3192000-0000-4000-8000-000000000001', 'e3191000-0000-4000-8000-000000000001', 'P3-111 Santier');

insert into public.categories (id, name) values
  ('e3193000-0000-4000-8000-000000000001', 'P3-111 Categorie');

insert into public.products (id, sku, name, category_id, unit, unit_value_mdl) values
  ('e3194000-0000-4000-8000-000000000001', 'TEST-P3-111-01', 'P3-111 Produs',
   'e3193000-0000-4000-8000-000000000001', 'pcs', 100);

-- TWO IESIRI, written directly. create_outbound_issue would need stock and a batch
-- chain, and what is under test here is the index on the invoice side.
insert into public.outbound_issues (id, reference, project_id) values
  ('e3195000-0000-4000-8000-000000000001', 'IES-TEST-P3-111-A', 'e3192000-0000-4000-8000-000000000001'),
  ('e3195000-0000-4000-8000-000000000002', 'IES-TEST-P3-111-B', 'e3192000-0000-4000-8000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3190000-0000-4000-8000-000000000001","role":"authenticated"}';


-- ===========================================================================
-- 3. THE PIPELINE HAS EXACTLY THREE LEGAL MOVES, FINDING G1
-- ===========================================================================
--
-- The move a hand built request used to be allowed to make is the FIRST thing
-- tried on each of the three states past draft, because that is the one the fifteen
-- column list missed and the one that unlocked everything else.

do $$
declare
  c1      constant uuid := 'e3191000-0000-4000-8000-000000000001';
  prod1   constant uuid := 'e3194000-0000-4000-8000-000000000001';
  target  text;
  inv     uuid;
  got     public.invoice_status;
  refused boolean;
begin
  foreach target in array array['issued', 'paid', 'cancelled'] loop
    insert into public.invoices (client_id) values (c1) returning id into inv;
    insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
    values (inv, prod1, 1, 'pcs', 10, 20);

    -- draft to issued: LEGAL, and it is the only way a number is handed out.
    perform public.issue_invoice(inv, date '2026-04-01', null);
    select status into got from public.invoices where id = inv;
    if got <> 'issued' then
      raise exception 'P3-111: draft to issued was REFUSED, the guard is a wall';
    end if;

    if target = 'paid' then
      update public.invoices set status = 'paid' where id = inv;
      select status into got from public.invoices where id = inv;
      if got <> 'paid' then raise exception 'P3-111: issued to paid was REFUSED'; end if;
    elsif target = 'cancelled' then
      update public.invoices set status = 'cancelled', cancel_reason = 'motiv P3-111' where id = inv;
      select status into got from public.invoices where id = inv;
      if got <> 'cancelled' then raise exception 'P3-111: issued to cancelled was REFUSED'; end if;
    end if;

    -- --- AND BACK TO DRAFT IS REFUSED, WHICHEVER OF THE THREE IT IS ---------
    refused := false;
    begin
      update public.invoices set status = 'draft' where id = inv;
    exception when restrict_violation then refused := true;
    end;
    if not refused then
      raise exception 'P3-111: a % invoice was pushed back to draft', target;
    end if;
    select status into got from public.invoices where id = inv;
    if got::text <> target then
      raise exception 'P3-111: after the refused move a % invoice reads %', target, got;
    end if;
  end loop;
end
$$;

do $$
declare
  c1      constant uuid := 'e3191000-0000-4000-8000-000000000001';
  prod1   constant uuid := 'e3194000-0000-4000-8000-000000000001';
  paid    uuid;
  cancel  uuid;
  draft   uuid;
  refused boolean;
begin
  -- --- A PAID INVOICE IS TERMINAL -----------------------------------------
  -- The written basis is docs/reports/2026-09-24-author-facturare-design.md screen
  -- 3, "download the PDF, email it. Nothing else.", and part 3 shipped it:
  -- lib/data/facturare-detail-types.ts offers no action at all on a paid invoice
  -- and lib/data/facturare-actions.ts refuses cancelling one in so many words.
  insert into public.invoices (client_id) values (c1) returning id into paid;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (paid, prod1, 1, 'pcs', 10, 20);
  perform public.issue_invoice(paid, date '2026-04-02', null);
  update public.invoices set status = 'paid' where id = paid;

  refused := false;
  begin
    update public.invoices set status = 'cancelled', cancel_reason = 'restituire' where id = paid;
  exception when restrict_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-111: a PAID invoice was cancelled, which is a refund and an accountant decision';
  end if;

  -- --- A CANCELLED INVOICE GOES NOWHERE -----------------------------------
  insert into public.invoices (client_id) values (c1) returning id into cancel;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (cancel, prod1, 1, 'pcs', 10, 20);
  perform public.issue_invoice(cancel, date '2026-04-03', null);
  update public.invoices set status = 'cancelled', cancel_reason = 'motiv P3-111' where id = cancel;

  refused := false;
  begin
    update public.invoices set status = 'paid' where id = cancel;
  exception when restrict_violation then refused := true;
  end;
  if not refused then raise exception 'P3-111: a CANCELLED invoice was marked paid'; end if;

  refused := false;
  begin
    update public.invoices set status = 'issued' where id = cancel;
  exception when restrict_violation then refused := true;
  end;
  if not refused then raise exception 'P3-111: a CANCELLED invoice was moved back to issued'; end if;

  -- --- AND A DRAFT DOES NOT SKIP THE MIDDLE -------------------------------
  -- Cancelling a draft is issue-then-cancel, which is what
  -- lib/data/facturare-actions.ts already does, because invoices_numbered_past_draft
  -- forbids a numberless row past draft. The rule here is about the MOVE, so the
  -- refusal comes from the guard and not from that constraint.
  insert into public.invoices (client_id) values (c1) returning id into draft;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (draft, prod1, 1, 'pcs', 10, 20);

  refused := false;
  begin
    update public.invoices set status = 'paid' where id = draft;
  exception when restrict_violation then refused := true;
  end;
  if not refused then raise exception 'P3-111: a DRAFT was marked paid without ever being issued'; end if;

  refused := false;
  begin
    update public.invoices set status = 'cancelled', cancel_reason = 'motiv' where id = draft;
  exception when restrict_violation then refused := true;
  end;
  if not refused then raise exception 'P3-111: a DRAFT was cancelled without ever being issued'; end if;

  -- AND THE WITNESS: a draft is still freely editable, so the new branches have
  -- not turned the guard into a wall.
  update public.invoices set notes = 'o nota pe ciorna' where id = draft;
  if (select notes from public.invoices where id = draft) is distinct from 'o nota pe ciorna' then
    raise exception 'P3-111: a draft can no longer be edited freely';
  end if;
end
$$;


-- ===========================================================================
-- 4. THE SIX STAMP COLUMNS ARE WRITTEN ONCE, FINDING G16
-- ===========================================================================

do $$
declare
  c1      constant uuid := 'e3191000-0000-4000-8000-000000000001';
  prod1   constant uuid := 'e3194000-0000-4000-8000-000000000001';
  owner   constant uuid := 'e3190000-0000-4000-8000-000000000001';
  other   constant uuid := 'e3190000-0000-4000-8000-000000000002';
  inv     uuid;
  was     timestamptz;
  who     uuid;
  refused boolean;
begin
  insert into public.invoices (client_id) values (c1) returning id into inv;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (inv, prod1, 1, 'pcs', 10, 20);
  perform public.issue_invoice(inv, date '2026-04-04', null);

  -- WRITTEN WHILE NULL: the stamper filled both on the move to issued, which is
  -- the half of the rule that must stay possible.
  select issued_at, issued_by into was, who from public.invoices where id = inv;
  if was is null then raise exception 'P3-111: issued_at was not stamped on the move to issued'; end if;

  -- REFUSED ONCE SET.
  refused := false;
  begin
    update public.invoices set issued_at = timestamptz '2019-01-01 00:00:00+00' where id = inv;
  exception when restrict_violation then refused := true;
  end;
  if not refused then raise exception 'P3-111: a stamped issued_at was REWRITTEN'; end if;
  if (select issued_at from public.invoices where id = inv) is distinct from was then
    raise exception 'P3-111: issued_at moved after the refused write';
  end if;

  refused := false;
  begin
    update public.invoices set issued_by = other where id = inv;
  exception when restrict_violation then refused := true;
  end;
  if not refused then raise exception 'P3-111: a stamped issued_by was REWRITTEN'; end if;

  -- paid_at AND paid_by ARE STILL WRITABLE WHILE NULL, and this is the witness for
  -- markInvoicePaid, which writes the chosen day at midday UTC itself and relies on
  -- invoices_stamp_status leaving a non-null value alone.
  update public.invoices
     set status = 'paid',
         paid_at = timestamptz '2026-04-05 12:00:00+00',
         paid_by = owner
   where id = inv;
  if (select paid_at from public.invoices where id = inv)
       is distinct from timestamptz '2026-04-05 12:00:00+00' then
    raise exception 'P3-111: the day markInvoicePaid chose was not kept';
  end if;

  refused := false;
  begin
    update public.invoices set paid_at = timestamptz '2031-01-01 12:00:00+00' where id = inv;
  exception when restrict_violation then refused := true;
  end;
  if not refused then raise exception 'P3-111: a stamped paid_at was REWRITTEN'; end if;

  refused := false;
  begin
    update public.invoices set paid_by = other where id = inv;
  exception when restrict_violation then refused := true;
  end;
  if not refused then raise exception 'P3-111: a stamped paid_by was REWRITTEN'; end if;

  -- AND THE CANCELLATION PAIR, ON AN INVOICE THAT WAS CANCELLED RATHER THAN PAID.
  declare
    other_inv uuid;
  begin
    insert into public.invoices (client_id) values (c1) returning id into other_inv;
    insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
    values (other_inv, prod1, 1, 'pcs', 10, 20);
    perform public.issue_invoice(other_inv, date '2026-04-06', null);
    update public.invoices set status = 'cancelled', cancel_reason = 'motiv P3-111' where id = other_inv;

    if (select cancelled_at from public.invoices where id = other_inv) is null then
      raise exception 'P3-111: cancelled_at was not stamped on the move to cancelled';
    end if;

    refused := false;
    begin
      update public.invoices set cancelled_at = timestamptz '2019-01-01 00:00:00+00' where id = other_inv;
    exception when restrict_violation then refused := true;
    end;
    if not refused then raise exception 'P3-111: a stamped cancelled_at was REWRITTEN'; end if;

    refused := false;
    begin
      update public.invoices set cancelled_by = other where id = other_inv;
    exception when restrict_violation then refused := true;
    end;
    if not refused then raise exception 'P3-111: a stamped cancelled_by was REWRITTEN'; end if;

    -- AND THE REASON IS STILL CORRECTABLE, which 0063 permitted on purpose: a
    -- reason somebody worded badly must not need a second cancellation.
    update public.invoices set cancel_reason = 'motiv rescris' where id = other_inv;
    if (select cancel_reason from public.invoices where id = other_inv) <> 'motiv rescris' then
      raise exception 'P3-111: the cancellation reason is no longer correctable';
    end if;
  end;
end
$$;


-- ===========================================================================
-- 5. ONE LIVE INVOICE PER IESIRE, FINDING G5
-- ===========================================================================

do $$
declare
  c1      constant uuid := 'e3191000-0000-4000-8000-000000000001';
  prod1   constant uuid := 'e3194000-0000-4000-8000-000000000001';
  ies_a   constant uuid := 'e3195000-0000-4000-8000-000000000001';
  ies_b   constant uuid := 'e3195000-0000-4000-8000-000000000002';
  first_inv uuid;
  third   uuid;
  n       integer;
  refused boolean;
begin
  insert into public.invoices (client_id, outbound_issue_id) values (c1, ies_a)
  returning id into first_inv;

  -- --- A SECOND LIVE INVOICE ON THE SAME IESIRE IS REFUSED ----------------
  refused := false;
  begin
    insert into public.invoices (client_id, outbound_issue_id) values (c1, ies_a);
  exception when unique_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-111: a SECOND live invoice was written for one Iesire';
  end if;
  select count(*) into n from public.invoices where outbound_issue_id = ies_a;
  if n <> 1 then
    raise exception 'P3-111: Iesirea A carries % invoices, expected 1', n;
  end if;

  -- --- ANOTHER IESIRE IS NOT AFFECTED ------------------------------------
  insert into public.invoices (client_id, outbound_issue_id) values (c1, ies_b);

  -- --- AND TWO MANUAL INVOICES WITH NO IESIRE ARE FINE -------------------
  -- The predicate says `outbound_issue_id is not null` rather than relying on
  -- PostgreSQL treating nulls as distinct, and this is the case that reads it.
  insert into public.invoices (client_id) values (c1);
  insert into public.invoices (client_id) values (c1);

  -- --- A CANCELLED INVOICE DOES NOT BLOCK ITS IESIRE FOREVER -------------
  -- Cancelling means issuing first, because invoices_numbered_past_draft forbids a
  -- numberless row past draft. NOTHING IS DELETED: the cancelled invoice keeps its
  -- number and stays on the list.
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (first_inv, prod1, 1, 'pcs', 10, 20);
  perform public.issue_invoice(first_inv, date '2026-04-07', null);
  update public.invoices set status = 'cancelled', cancel_reason = 'motiv P3-111' where id = first_inv;

  insert into public.invoices (client_id, outbound_issue_id) values (c1, ies_a) returning id into third;
  if third is null then
    raise exception 'P3-111: an Iesire whose only invoice was cancelled could not be invoiced again';
  end if;
  select count(*) into n from public.invoices
  where outbound_issue_id = ies_a and status <> 'cancelled';
  if n <> 1 then
    raise exception 'P3-111: Iesirea A carries % live invoices after the cancellation, expected 1', n;
  end if;
  if (select number from public.invoices where id = first_inv) is null then
    raise exception 'P3-111: the cancelled invoice lost its number';
  end if;
end
$$;


-- ===========================================================================
-- 6. SAVING A DRAFT IS ONE FUNCTION, FINDING G6
-- ===========================================================================

do $$
declare
  c1      constant uuid := 'e3191000-0000-4000-8000-000000000001';
  p1      constant uuid := 'e3192000-0000-4000-8000-000000000001';
  prod1   constant uuid := 'e3194000-0000-4000-8000-000000000001';
  inv     uuid;
  other   uuid;
  lineid  uuid;
  got     numeric;
  n       integer;
  refused boolean;
begin
  -- --- IT CREATES THE HEADER AND THE LINES ------------------------------
  -- 3 x 125,50 = 376,50 subtotal, 20 per cent is 75,30, total 451,80. The figures
  -- are written by hand here and the call supplies none of them, so a function that
  -- accepted a total from a caller would fail this.
  inv := public.save_invoice_draft(
    p_client_id => c1,
    p_lines => jsonb_build_array(
      jsonb_build_object('id', '', 'product_id', prod1, 'description', null,
                         'unit', 'pcs', 'quantity', 3, 'unit_price_mdl', 125.50, 'vat_rate', 20),
      jsonb_build_object('id', '', 'product_id', null, 'description', 'Transport',
                         'unit', 'pcs', 'quantity', 2, 'unit_price_mdl', 50, 'vat_rate', 20)
    ),
    p_project_id => p1,
    p_notes => 'scrisa de save_invoice_draft'
  );

  if inv is null then raise exception 'P3-111: save_invoice_draft returned no id'; end if;
  if (select status from public.invoices where id = inv) <> 'draft' then
    raise exception 'P3-111: save_invoice_draft did not write a draft';
  end if;
  if (select number from public.invoices where id = inv) is not null then
    raise exception 'P3-111: save_invoice_draft gave a draft a number';
  end if;
  if (select issue_date from public.invoices where id = inv) is not null then
    raise exception 'P3-111: save_invoice_draft wrote an issue date on a draft';
  end if;
  select count(*) into n from public.invoice_lines where invoice_id = inv;
  if n <> 2 then raise exception 'P3-111: the invoice carries % lines, expected 2', n; end if;

  -- THE TRIGGERS STILL OWN EVERY FIGURE. 376,50 + 75,30 = 451,80 on the first
  -- line, 100,00 + 20,00 = 120,00 on the second, so 476,50 and 95,30 and 571,80.
  select subtotal_mdl into got from public.invoices where id = inv;
  if got <> 476.50 then raise exception 'P3-111: the invoice subtotal is %, expected 476.50', got; end if;
  select vat_total_mdl into got from public.invoices where id = inv;
  if got <> 95.30 then raise exception 'P3-111: the invoice VAT total is %, expected 95.30', got; end if;
  select total_mdl into got from public.invoices where id = inv;
  if got <> 571.80 then raise exception 'P3-111: the invoice total is %, expected 571.80', got; end if;

  -- AND THE LINES ARE IN THE ORDER THEY ARRIVED.
  select sort_order into n from public.invoice_lines
  where invoice_id = inv and description = 'Transport';
  if n <> 1 then raise exception 'P3-111: the second line has sort_order %, expected 1', n; end if;

  -- --- IT REWRITES A DRAFT, KEEPING THE STORED LINE --------------------
  select id into lineid from public.invoice_lines where invoice_id = inv and description is null;
  perform public.save_invoice_draft(
    p_client_id => c1,
    p_lines => jsonb_build_array(
      jsonb_build_object('id', lineid, 'product_id', prod1, 'description', null,
                         'unit', 'pcs', 'quantity', 4, 'unit_price_mdl', 125.50, 'vat_rate', 20),
      jsonb_build_object('id', (select id from public.invoice_lines
                                where invoice_id = inv and description = 'Transport'),
                         'product_id', null, 'description', 'Transport',
                         'unit', 'pcs', 'quantity', 2, 'unit_price_mdl', 50, 'vat_rate', 20)
    ),
    p_invoice_id => inv,
    p_notes => 'rescrisa'
  );
  select quantity into got from public.invoice_lines where id = lineid;
  if got <> 4 then raise exception 'P3-111: the rewritten quantity is %, expected 4', got; end if;
  if (select notes from public.invoices where id = inv) <> 'rescrisa' then
    raise exception 'P3-111: the rewritten note was not kept';
  end if;
  select count(*) into n from public.invoice_lines where invoice_id = inv;
  if n <> 2 then raise exception 'P3-111: a rewrite changed the line count to %', n; end if;

  -- --- A STORED LINE CANNOT BE LEFT OUT -------------------------------
  refused := false;
  begin
    perform public.save_invoice_draft(
      p_client_id => c1,
      p_lines => jsonb_build_array(
        jsonb_build_object('id', lineid, 'product_id', prod1, 'description', null,
                           'unit', 'pcs', 'quantity', 4, 'unit_price_mdl', 125.50, 'vat_rate', 20)
      ),
      p_invoice_id => inv
    );
  exception when restrict_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-111: a stored line was taken off the invoice by being left out';
  end if;
  select count(*) into n from public.invoice_lines where invoice_id = inv;
  if n <> 2 then raise exception 'P3-111: after the refused save the invoice has % lines', n; end if;

  -- --- AN EMPTY LINE LIST IS REFUSED ---------------------------------
  refused := false;
  begin
    perform public.save_invoice_draft(p_client_id => c1, p_lines => '[]'::jsonb);
  exception when restrict_violation then refused := true;
  end;
  if not refused then raise exception 'P3-111: an invoice with no position was ACCEPTED'; end if;

  -- --- A LINE ID THAT BELONGS TO ANOTHER INVOICE IS REFUSED ----------
  -- The call sends this invoice's OWN line as well, so it gets past the
  -- leave-nothing-out check above and reaches the branch under test rather than
  -- passing for the wrong reason.
  other := public.save_invoice_draft(
    p_client_id => c1,
    p_lines => jsonb_build_array(
      jsonb_build_object('id', '', 'product_id', prod1, 'description', 'Linia lui other',
                         'unit', 'pcs', 'quantity', 1, 'unit_price_mdl', 10, 'vat_rate', 20)
    )
  );
  refused := false;
  begin
    perform public.save_invoice_draft(
      p_client_id => c1,
      p_lines => jsonb_build_array(
        jsonb_build_object('id', (select id from public.invoice_lines where invoice_id = other),
                           'product_id', prod1, 'description', 'Linia lui other',
                           'unit', 'pcs', 'quantity', 1, 'unit_price_mdl', 10, 'vat_rate', 20),
        jsonb_build_object('id', lineid, 'product_id', prod1, 'description', null,
                           'unit', 'pcs', 'quantity', 1, 'unit_price_mdl', 10, 'vat_rate', 20)
      ),
      p_invoice_id => other
    );
  exception when restrict_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-111: a line belonging to another invoice was written onto this one';
  end if;
  -- And the foreign line did not get written onto it as a second row either.
  select count(*) into n from public.invoice_lines where invoice_id = other;
  if n <> 1 then
    raise exception 'P3-111: the other invoice now carries % lines, expected 1', n;
  end if;

  -- --- AND AN INVOICE PAST DRAFT IS REFUSED -------------------------
  perform public.issue_invoice(other, date '2026-04-08', null);
  refused := false;
  begin
    perform public.save_invoice_draft(
      p_client_id => c1,
      p_lines => jsonb_build_array(
        jsonb_build_object('id', '', 'product_id', prod1, 'description', null,
                           'unit', 'pcs', 'quantity', 1, 'unit_price_mdl', 10, 'vat_rate', 20)
      ),
      p_invoice_id => other
    );
  exception when restrict_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-111: save_invoice_draft rewrote an invoice that is no longer a draft';
  end if;

  -- --- AND AN INVOICE THAT DOES NOT EXIST -------------------------
  refused := false;
  begin
    perform public.save_invoice_draft(
      p_client_id => c1,
      p_lines => jsonb_build_array(
        jsonb_build_object('id', '', 'product_id', prod1, 'description', null,
                           'unit', 'pcs', 'quantity', 1, 'unit_price_mdl', 10, 'vat_rate', 20)
      ),
      p_invoice_id => 'e319ffff-0000-4000-8000-00000000ffff'
    );
  exception when no_data_found then refused := true;
  end;
  if not refused then
    raise exception 'P3-111: save_invoice_draft accepted an invoice id that does not exist';
  end if;
end
$$;


-- ===========================================================================
-- 7. THE FOUR MEASURED ROUNDING CASES, THE DATABASE SIDE OF FINDING G4
-- ===========================================================================
--
-- The sweep measured these four against the trigger's rule and the third one is the
-- defect: the editor showed 8,16 and the database stored 8,17. The arithmetic the
-- screen must now reproduce is written down here in SQL, so the figure the
-- TypeScript is required to match is not only in a report.
--
--   quantity   unit price   line subtotal
--   0,333      1000,00        333,00
--   1,005          1,00          1,01
--   8,165          1,00          8,17
--   1234,565       1,00       1234,57

do $$
declare
  c1    constant uuid := 'e3191000-0000-4000-8000-000000000001';
  prod1 constant uuid := 'e3194000-0000-4000-8000-000000000001';
  inv   uuid;
  q     numeric;
  p     numeric;
  want  numeric;
  got   numeric;
  cases constant numeric[][] := array[
    array[0.333, 1000.00, 333.00],
    array[1.005, 1.00, 1.01],
    array[8.165, 1.00, 8.17],
    array[1234.565, 1.00, 1234.57]
  ];
  i     integer;
begin
  insert into public.invoices (client_id) values (c1) returning id into inv;

  for i in 1 .. array_length(cases, 1) loop
    q := cases[i][1];
    p := cases[i][2];
    want := cases[i][3];
    insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
    values (inv, prod1, q, 'pcs', p, 20)
    returning line_subtotal_mdl into got;
    if got <> want then
      raise exception 'P3-111: % x % stored a line subtotal of %, expected %', q, p, got, want;
    end if;
  end loop;

  -- AND THE FOOT IS THE SUM OF FIGURES THAT ARE ALREADY ROUNDED, which is the
  -- ORDER the screen must keep: 333,00 + 1,01 + 8,17 + 1234,57 = 1576,75.
  select subtotal_mdl into got from public.invoices where id = inv;
  if got <> 1576.75 then
    raise exception 'P3-111: the four measured lines add up to %, expected 1576.75', got;
  end if;
  -- 66,60 + 0,20 + 1,63 + 246,91 = 315,34, each computed from the ROUNDED subtotal.
  select vat_total_mdl into got from public.invoices where id = inv;
  if got <> 315.34 then
    raise exception 'P3-111: the VAT of the four measured lines is %, expected 315.34', got;
  end if;
  select total_mdl into got from public.invoices where id = inv;
  if got <> 1892.09 then
    raise exception 'P3-111: the total of the four measured lines is %, expected 1892.09', got;
  end if;
end
$$;


-- ===========================================================================
-- 8. NOTHING ABOUT DELETING MOVED
-- ===========================================================================

reset role;

do $$
declare n integer;
begin
  select count(*) into n from pg_policies
  where schemaname = 'public'
    and tablename in ('invoice_settings', 'invoice_number_series', 'invoices', 'invoice_lines')
    and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-111: % delete policies exist on the invoice tables, expected none', n;
  end if;

  if has_table_privilege('authenticated', 'public.invoices', 'DELETE')
     or has_table_privilege('authenticated', 'public.invoice_lines', 'DELETE')
     or has_table_privilege('authenticated', 'public.invoice_settings', 'DELETE')
     or has_table_privilege('authenticated', 'public.invoice_number_series', 'DELETE') then
    raise exception 'P3-111: authenticated may delete from an invoice table';
  end if;

  if has_table_privilege('authenticated', 'public.invoice_number_series', 'INSERT')
     or has_table_privilege('authenticated', 'public.invoice_number_series', 'UPDATE') then
    raise exception 'P3-111: authenticated may write the invoice number counter';
  end if;
end
$$;

rollback;
