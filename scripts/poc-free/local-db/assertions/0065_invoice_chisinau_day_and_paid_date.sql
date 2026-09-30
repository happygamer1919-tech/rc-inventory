-- assertions/0065_invoice_chisinau_day_and_paid_date.sql
-- Card P3-115, goal G70, findings G2 (line 113), G3 (145) and G14 (401) of
-- docs/reports/2026-09-29-critic-bug-sweep-2.md. What 0065 must have left behind.
--
-- FIVE GROUPS:
--
--   1. THE SHAPE. Both replaced functions carry 'Europe/Chisinau' and neither still
--      reads current_date, issue_invoice keeps the one locking statement and is
--      still SECURITY DEFINER, and the paid-date trigger is a BEFORE INSERT OR
--      UPDATE row trigger whose name sorts after invoices_stamp_status.
--   2. THE DAY AND THE SERIES, findings G2 and G3. The failure the sweep names is
--      stated in SQL: at 22:30 UTC on 31 December the Chisinau day is already
--      1 January, the two days fall in different YEARS, and the two years are two
--      different series. Then the fallback is proved to follow Chisinau IN A
--      SESSION WHOSE OWN current_date IS A DIFFERENT CALENDAR DAY, which is the
--      only way a single session can tell the two clocks apart.
--   3. THE PAID DAY, finding G14. A day before the issue date is refused, a day in
--      the future is refused, a day between them is accepted and KEPT, and a null
--      paid_at is untouched. The accepted case is the witness: it proves the
--      trigger is not simply a wall.
--   4. THE NUMBERING IS UNTOUCHED, which is the thing this card was forbidden to
--      move.
--   5. 0064 IS UNTOUCHED: the freeze, the pipeline and the one-live-invoice index.
--
-- WHAT IS DELIBERATELY NOT ASSERTED HERE, AND WHERE IT IS PROVED INSTEAD.
--
--   THE APPLICATION SIDE OF G2 AND G3. Whether lib/data/facturare-actions.ts sends
--   the Chisinau day rather than an empty string is TypeScript, and there is no SQL
--   to assert. It is case 1 and case 2 of tests/e2e/facturare-chisinau-day.spec.ts.
--   What this file proves is the other half of the promise: that the day the
--   database falls back to, when nobody sends one, is the same day, computed from
--   the same time zone name.
--
--   THE ROMANIAN SENTENCES BESIDE THE Data platii BOX. They are in the action, not
--   in the trigger, because a schema carries no interface text: 0063's own header
--   says so and the refusals here are written without diacritics for that reason.
--   The sentences are case 4 of the same spec.
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
  -- --- THE TWO REPLACED FUNCTIONS -------------------------------------------
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'invoice_series_for';
  if d is null then
    raise exception 'P3-115: public.invoice_series_for(date) does not exist';
  end if;
  if d not like '%Europe/Chisinau%' then
    raise exception 'P3-115: invoice_series_for does not fall back to the Chisinau day';
  end if;
  if d like '%current_date%' then
    raise exception 'P3-115: invoice_series_for still reads current_date';
  end if;

  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'issue_invoice';
  if d is null then
    raise exception 'P3-115: public.issue_invoice does not exist';
  end if;
  if d not like '%Europe/Chisinau%' then
    raise exception 'P3-115: issue_invoice does not fall back to the Chisinau day';
  end if;
  if d like '%current_date%' then
    raise exception 'P3-115: issue_invoice still reads current_date';
  end if;

  -- THE LOCK IS STILL ONE STATEMENT. The whole counter-instead-of-sequence decision
  -- in 0063 section 8 rests on this, and this card was forbidden to touch it.
  if d not like '%set next_number = next_number + 1%' then
    raise exception 'P3-115: issue_invoice no longer allocates with one locking update statement';
  end if;
  if d not like '%and status = %draft%' then
    raise exception 'P3-115: issue_invoice no longer claims the draft in the same statement it writes it';
  end if;

  -- --- AND BOTH ARE STILL SECURITY DEFINER ----------------------------------
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname in ('issue_invoice', 'invoice_series_for')
    and p.prosecdef;
  if n <> 2 then
    raise exception 'P3-115: expected issue_invoice and invoice_series_for to be SECURITY DEFINER, found % of 2', n;
  end if;

  -- invoice_series_for must stay STABLE and not become VOLATILE, or every screen
  -- that asks it twice in one request could get two answers.
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'invoice_series_for' and p.provolatile = 's';
  if n <> 1 then
    raise exception 'P3-115: invoice_series_for is no longer STABLE';
  end if;

  -- --- THE PAID-DATE TRIGGER ------------------------------------------------
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'invoices_validate_paid_date';
  if d is null then
    raise exception 'P3-115: public.invoices_validate_paid_date() does not exist';
  end if;
  if d not like '%inainte de ziua emiterii%' then
    raise exception 'P3-115: the paid-date trigger does not refuse a day before the issue date';
  end if;
  if d not like '%este in viitor%' then
    raise exception 'P3-115: the paid-date trigger does not refuse a day in the future';
  end if;
  if d not like '%Europe/Chisinau%' then
    raise exception 'P3-115: the paid-date trigger does not read the day in Chisinau';
  end if;

  -- BEFORE, INSERT and UPDATE. tgtype bit 1 is BEFORE, bit 4 is INSERT, bit 16 is UPDATE.
  select count(*) into n from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'invoices' and not t.tgisinternal
    and t.tgname = 'invoices_validate_paid_date'
    and (t.tgtype & 1) > 0 and (t.tgtype & 4) > 0 and (t.tgtype & 16) > 0;
  if n <> 1 then
    raise exception 'P3-115: invoices_validate_paid_date is not a BEFORE INSERT OR UPDATE row trigger';
  end if;

  -- IT MUST JUDGE THE FINAL VALUE, so it has to fire after the stamper fills one.
  -- PostgreSQL fires BEFORE row triggers in NAME order, so this is the rule.
  if 'invoices_validate_paid_date' <= 'invoices_stamp_status' then
    raise exception 'P3-115: the paid-date trigger no longer sorts after invoices_stamp_status';
  end if;
  -- And after the freeze, so a rewrite of a stamped paid_at is still refused by
  -- 0064's guard with ITS message and not by this one with a different errcode.
  if 'invoices_validate_paid_date' <= 'invoices_require_draft_to_edit' then
    raise exception 'P3-115: the paid-date trigger no longer sorts after the 0064 freeze';
  end if;
end
$$;


-- ===========================================================================
-- 2. THE FIXTURES
-- ===========================================================================
--
-- Built by hand, inside this transaction, and rolled back with it. The same shape
-- assertions/0063_invoices.sql and assertions/0064 use, with this card's own uuid
-- prefix so a grid is readable and the files cannot collide.

insert into auth.users (id, email) values
  ('e3200000-0000-4000-8000-000000000001', 'p3-115-owner@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3200000-0000-4000-8000-000000000001', 'p3-115-owner@rc-inventory.local', 'owner', true);

insert into public.clients (id, name) values
  ('e3201000-0000-4000-8000-000000000001', 'P3-115 Client');

insert into public.categories (id, name) values
  ('e3203000-0000-4000-8000-000000000001', 'P3-115 Categorie');

insert into public.products (id, sku, name, category_id, unit, unit_value_mdl) values
  ('e3204000-0000-4000-8000-000000000001', 'TEST-P3-115-01', 'P3-115 Produs',
   'e3203000-0000-4000-8000-000000000001', 'pcs', 100);

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3200000-0000-4000-8000-000000000001","role":"authenticated"}';


-- ===========================================================================
-- 3. THE DAY AND THE SERIES, FINDINGS G2 AND G3
-- ===========================================================================
--
-- FIRST, THE FAILURE ITSELF, WRITTEN DOWN. The sweep's concrete case is a draft
-- cancelled at 00:30 Chisinau on 1 January 2027. Cancelling a draft issues it
-- first, with no issue date, so the day came from the fallback. This block does not
-- need any clock to be moved to state that case: it picks the instant and asks the
-- server what day it is in each zone.

do $$
declare
  boundary constant timestamptz := timestamptz '2026-12-31 22:30:00+00';
  summer   constant timestamptz := timestamptz '2027-06-30 21:30:00+00';
  utc_day  date;
  chi_day  date;
begin
  -- WINTER, +2. 22:30 UTC on 31 December is 00:30 on 1 January in Chisinau.
  utc_day := (boundary at time zone 'UTC')::date;
  chi_day := (boundary at time zone 'Europe/Chisinau')::date;
  if utc_day <> date '2026-12-31' then
    raise exception 'P3-115: the UTC day of the boundary instant reads %, expected 2026-12-31', utc_day;
  end if;
  if chi_day <> date '2027-01-01' then
    raise exception 'P3-115: the Chisinau day of the boundary instant reads %, expected 2027-01-01', chi_day;
  end if;

  -- SUMMER, +3, so the rule is not an accident of one offset. 21:30 UTC on 30 June
  -- is 00:30 on 1 July in Chisinau.
  if (summer at time zone 'Europe/Chisinau')::date <> date '2027-07-01' then
    raise exception 'P3-115: the Chisinau day of the summer instant reads %, expected 2027-07-01',
      (summer at time zone 'Europe/Chisinau')::date;
  end if;
  if (summer at time zone 'UTC')::date <> date '2027-06-30' then
    raise exception 'P3-115: the UTC day of the summer instant is not 2027-06-30';
  end if;

  -- AND THE TWO DAYS ARE TWO DIFFERENT SERIES, which is the whole consequence: the
  -- document does not merely carry the wrong date, it takes a number out of the
  -- closed year's legal series.
  if public.invoice_series_for(chi_day) = public.invoice_series_for(utc_day) then
    raise exception
      'P3-115: 2027-01-01 and 2026-12-31 give the same series (%), so the year is not in the series and this assertion proves nothing',
      public.invoice_series_for(chi_day);
  end if;
  if public.invoice_series_for(date '2027-01-01') not like '%2027' then
    raise exception 'P3-115: the series for 1 January 2027 is %, which does not end in 2027',
      public.invoice_series_for(date '2027-01-01');
  end if;
  if public.invoice_series_for(date '2026-12-31') not like '%2026' then
    raise exception 'P3-115: the series for 31 December 2026 is %, which does not end in 2026',
      public.invoice_series_for(date '2026-12-31');
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- 3b. AND THE FALLBACK FOLLOWS CHISINAU, PROVED IN A SESSION WHOSE OWN DAY DIFFERS
-- ---------------------------------------------------------------------------
--
-- HOW ONE SESSION TELLS TWO CLOCKS APART, WITHOUT MOVING ANY CLOCK. `current_date`
-- reads the SESSION's TimeZone setting; `(now() at time zone 'Europe/Chisinau')::date`
-- ignores it. So the session is moved to a zone far enough from Chisinau that the two
-- are provably a different calendar day, and then the fallback is asked what day it
-- is. Before the fix it would have answered the session's day; it must now answer
-- Chisinau's.
--
-- WHY TWO ZONES AND NOT ONE. Chisinau is UTC+2 or UTC+3, so at Chisinau local hour h:
--
--   Etc/GMT+12 is UTC-12, which is 14 or 15 hours behind, so its date is the day
--   BEFORE for every h below 14.
--   Etc/GMT-14 is UTC+14, which is 11 or 12 hours ahead, so its date is the day
--   AFTER for every h from 13 up.
--
-- 0 to 13 and 13 to 23 cover the whole clock, so one of the two ALWAYS differs and
-- the block below asserts that the fixture worked before it asserts anything else. A
-- single fixed zone would have made this case decisive for part of the day and vacuous
-- for the rest, which is the kind of test that passes for years and proves nothing.

do $$
declare
  c1      constant uuid := 'e3201000-0000-4000-8000-000000000001';
  prod1   constant uuid := 'e3204000-0000-4000-8000-000000000001';
  chi_now date := (now() at time zone 'Europe/Chisinau')::date;
  hour_ro integer := extract(hour from (now() at time zone 'Europe/Chisinau'))::integer;
  far_tz  text;
  inv     uuid;
  got     date;
  -- NOT NAMED `series`. plpgsql resolves an unqualified name against the query's
  -- columns first, and public.invoices HAS a column called series, so a variable of
  -- that name makes `select ... into` ambiguous and the block fails to run at all.
  got_series text;
begin
  far_tz := case when hour_ro < 14 then 'Etc/GMT+12' else 'Etc/GMT-14' end;
  execute format('set local time zone %L', far_tz);

  -- THE FIXTURE ITSELF IS ASSERTED FIRST. If these two ever stop differing, the rest
  -- of this block would pass while testing nothing, and that is the failure this line
  -- exists to make loud.
  if current_date = chi_now then
    raise exception
      'P3-115: the session moved to % and its date still equals the Chisinau day %, so this case cannot tell the two clocks apart (Chisinau hour %)',
      far_tz, chi_now, hour_ro;
  end if;

  -- A DRAFT, ISSUED WITH NO DAY AT ALL, WHICH IS THE CANCEL PATH OF FINDING G2.
  insert into public.invoices (client_id) values (c1) returning id into inv;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (inv, prod1, 1, 'pcs', 10, 20);
  perform public.issue_invoice(inv, null::date, null::date);

  select issue_date, series into got, got_series from public.invoices where id = inv;
  if got <> chi_now then
    raise exception
      'P3-115: an invoice issued with no day was stamped %, the Chisinau day is % and the session day is %',
      got, chi_now, current_date;
  end if;
  if got = current_date then
    raise exception 'P3-115: the issue date followed the session clock and not Chisinau';
  end if;

  -- AND THE SERIES CAME FROM THAT SAME DAY, which is the half that decides which
  -- legal series the document belongs to.
  if got_series <> public.invoice_series_for(chi_now) then
    raise exception
      'P3-115: the invoice landed in series % while the Chisinau day % belongs to series %',
      got_series, chi_now, public.invoice_series_for(chi_now);
  end if;

  -- THE SAME QUESTION ASKED OF invoice_series_for DIRECTLY, with no invoice in the
  -- way, because the cancel path is not the only caller of the fallback.
  if public.invoice_series_for(null) <> public.invoice_series_for(chi_now) then
    raise exception
      'P3-115: invoice_series_for(null) is % and the Chisinau day gives %',
      public.invoice_series_for(null), public.invoice_series_for(chi_now);
  end if;

  -- AND A DAY THAT IS SENT IS STILL HONOURED, so the fallback did not become a
  -- rule that overrides the operator.
  insert into public.invoices (client_id) values (c1) returning id into inv;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (inv, prod1, 1, 'pcs', 10, 20);
  perform public.issue_invoice(inv, date '2026-03-04', null::date);
  select issue_date into got from public.invoices where id = inv;
  if got <> date '2026-03-04' then
    raise exception 'P3-115: an invoice issued ON 2026-03-04 was stamped %', got;
  end if;

  set local time zone 'UTC';
end
$$;

-- Back to the default for every block below, whatever the one above set last.
set local time zone 'UTC';


-- ===========================================================================
-- 4. THE PAID DAY, FINDING G14
-- ===========================================================================
--
-- THE ACCEPTED CASE COMES FIRST AND IT IS THE WITNESS. A trigger that refuses
-- everything would pass both refusal assertions below, so the thing that must be
-- proved first is that an ordinary payment still saves and still keeps the day the
-- operator chose. That is the shape assertions/0064 uses for its own stamp branch and
-- the reason is the same.
--
-- THE DAYS ARE WRITTEN AT NOON UTC, which is how markInvoicePaid writes them and why:
-- noon UTC falls on the same Chisinau day whether the offset is +2 or +3, while
-- midnight UTC is 02:00 or 03:00 of the NEXT day there.

do $$
declare
  c1       constant uuid := 'e3201000-0000-4000-8000-000000000001';
  prod1    constant uuid := 'e3204000-0000-4000-8000-000000000001';
  issued_on constant date := date '2026-03-10';
  inv      uuid;
  refused  boolean;
  kept     timestamptz;
begin
  -- --- A DAY AFTER THE ISSUE DAY AND NOT IN THE FUTURE: ACCEPTED AND KEPT ----
  insert into public.invoices (client_id) values (c1) returning id into inv;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (inv, prod1, 1, 'pcs', 10, 20);
  perform public.issue_invoice(inv, issued_on, null);

  update public.invoices
     set status = 'paid', paid_at = timestamptz '2026-03-12 12:00:00+00'
   where id = inv;
  select paid_at into kept from public.invoices where id = inv;
  if kept is distinct from timestamptz '2026-03-12 12:00:00+00' then
    raise exception 'P3-115: the day the operator chose was not kept, paid_at reads %', kept;
  end if;

  -- --- AND THE ISSUE DAY ITSELF IS ACCEPTED, because an invoice paid on the day it
  -- was issued is an ordinary cash sale and the rule is "not BEFORE", not "after".
  insert into public.invoices (client_id) values (c1) returning id into inv;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (inv, prod1, 1, 'pcs', 10, 20);
  perform public.issue_invoice(inv, issued_on, null);
  update public.invoices
     set status = 'paid', paid_at = timestamptz '2026-03-10 12:00:00+00'
   where id = inv;
  if (select status from public.invoices where id = inv) <> 'paid' then
    raise exception 'P3-115: an invoice paid ON its issue day was refused';
  end if;

  -- --- ONE DAY BEFORE THE ISSUE DAY: REFUSED --------------------------------
  insert into public.invoices (client_id) values (c1) returning id into inv;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (inv, prod1, 1, 'pcs', 10, 20);
  perform public.issue_invoice(inv, issued_on, null);

  refused := false;
  begin
    update public.invoices
       set status = 'paid', paid_at = timestamptz '2026-03-09 12:00:00+00'
     where id = inv;
  exception when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-115: a payment day ONE DAY BEFORE the issue day was accepted';
  end if;
  if (select status from public.invoices where id = inv) <> 'issued' then
    raise exception 'P3-115: the invoice moved after the refused payment';
  end if;
  if (select paid_at from public.invoices where id = inv) is not null then
    raise exception 'P3-115: paid_at was written by a refused payment';
  end if;

  -- The sweep's own example, years before the invoice existed.
  refused := false;
  begin
    update public.invoices
       set status = 'paid', paid_at = timestamptz '2019-01-01 12:00:00+00'
     where id = inv;
  exception when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-115: a payment day in 2019 was accepted on an invoice issued in 2026';
  end if;

  -- --- A DAY IN THE FUTURE: REFUSED -----------------------------------------
  -- TWO DAYS AND NOT ONE, deliberately. One day ahead of `now()` is one day ahead in
  -- every zone on earth only if the comparison zone is known; two days is past every
  -- possible offset, so this case cannot become vacuous at some hour of the night.
  refused := false;
  begin
    update public.invoices
       set status = 'paid', paid_at = now() + interval '2 days'
     where id = inv;
  exception when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-115: a payment day two days from now was accepted';
  end if;

  refused := false;
  begin
    update public.invoices
       set status = 'paid', paid_at = timestamptz '2031-01-01 12:00:00+00'
     where id = inv;
  exception when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-115: a payment day in 2031 was accepted';
  end if;

  -- --- TODAY IS NOT THE FUTURE, which is the boundary the operator meets every
  -- day: the Data platii box opens on today.
  insert into public.invoices (client_id) values (c1) returning id into inv;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (inv, prod1, 1, 'pcs', 10, 20);
  perform public.issue_invoice(inv, (now() at time zone 'Europe/Chisinau')::date, null);
  update public.invoices set status = 'paid', paid_at = now() where id = inv;
  if (select status from public.invoices where id = inv) <> 'paid' then
    raise exception 'P3-115: an invoice paid TODAY was refused';
  end if;

  -- --- AND THE STAMPER'S OWN FILL PASSES, which is the path a plain move to paid
  -- takes when the caller sends no day at all.
  insert into public.invoices (client_id) values (c1) returning id into inv;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (inv, prod1, 1, 'pcs', 10, 20);
  perform public.issue_invoice(inv, issued_on, null);
  update public.invoices set status = 'paid' where id = inv;
  if (select paid_at from public.invoices where id = inv) is null then
    raise exception 'P3-115: invoices_stamp_status no longer fills paid_at on the move to paid';
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- 4b. A NULL paid_at IS UNTOUCHED, ON EVERY STATE THAT CARRIES ONE
-- ---------------------------------------------------------------------------
--
-- The trigger returns on the first line when paid_at is null, so a draft, an issued
-- invoice and a cancelled one are outside it entirely. This block is what would
-- notice if that early return were ever removed: a draft has no issue_date at all,
-- so a rule applied to it would compare against null and behave unpredictably.

do $$
declare
  c1      constant uuid := 'e3201000-0000-4000-8000-000000000001';
  prod1   constant uuid := 'e3204000-0000-4000-8000-000000000001';
  inv     uuid;
begin
  -- A DRAFT: no number, no issue date, and it edits freely.
  insert into public.invoices (client_id) values (c1) returning id into inv;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (inv, prod1, 1, 'pcs', 10, 20);
  if (select issue_date from public.invoices where id = inv) is not null then
    raise exception 'P3-115: a fresh draft already carries an issue date';
  end if;
  update public.invoices set notes = 'o nota P3-115' where id = inv;
  if (select notes from public.invoices where id = inv) <> 'o nota P3-115' then
    raise exception 'P3-115: a draft with a null paid_at could not be edited';
  end if;

  -- ISSUED, THEN CANCELLED: both pass through this trigger with a null paid_at.
  perform public.issue_invoice(inv, date '2026-03-20', null);
  update public.invoices set status = 'cancelled', cancel_reason = 'motiv P3-115' where id = inv;
  if (select status from public.invoices where id = inv) <> 'cancelled' then
    raise exception 'P3-115: cancelling an invoice with a null paid_at was refused';
  end if;
end
$$;


-- ===========================================================================
-- 5. THE NUMBERING IS UNTOUCHED, AND SO IS 0064
-- ===========================================================================
--
-- This card replaced one declaration inside public.issue_invoice. It must not have
-- moved anything else, and the two things most worth re-checking are the ones the
-- goal line names: the allocator and the freeze.

do $$
declare
  c1      constant uuid := 'e3201000-0000-4000-8000-000000000001';
  prod1   constant uuid := 'e3204000-0000-4000-8000-000000000001';
  a       uuid;
  b       uuid;
  n_a     integer;
  n_b     integer;
  d       text;
  n       integer;
  refused boolean;
begin
  -- --- CONSECUTIVE NUMBERS, NO GAP ------------------------------------------
  -- One session cannot prove SIMULTANEITY and this file does not pretend to: case 2
  -- of tests/e2e/facturare-data.spec.ts fires five real HTTP requests for that. What
  -- this proves is that the counter still advances by exactly one per issue, which is
  -- the part a changed declaration could plausibly have broken.
  insert into public.invoices (client_id) values (c1) returning id into a;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (a, prod1, 1, 'pcs', 10, 20);
  insert into public.invoices (client_id) values (c1) returning id into b;
  insert into public.invoice_lines (invoice_id, product_id, quantity, unit, unit_price_mdl, vat_rate)
  values (b, prod1, 1, 'pcs', 10, 20);

  perform public.issue_invoice(a, date '2026-05-01', null);
  perform public.issue_invoice(b, date '2026-05-01', null);
  select number into n_a from public.invoices where id = a;
  select number into n_b from public.invoices where id = b;
  if n_b <> n_a + 1 then
    raise exception 'P3-115: two invoices issued in one series took % and %, which is not consecutive', n_a, n_b;
  end if;

  -- A SECOND ISSUE OF THE SAME INVOICE IS STILL REFUSED.
  refused := false;
  begin
    perform public.issue_invoice(a, date '2026-05-01', null);
  exception when restrict_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-115: an already issued invoice was issued a second time';
  end if;

  -- AND NOBODY MAY WRITE THE COUNTER.
  if has_table_privilege('authenticated', 'public.invoice_number_series', 'INSERT')
     or has_table_privilege('authenticated', 'public.invoice_number_series', 'UPDATE') then
    raise exception 'P3-115: authenticated may write the invoice number counter';
  end if;

  -- --- 0064 IS UNTOUCHED: THE PIPELINE, THE STAMPS AND THE INDEX ------------
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'invoices_require_draft_to_edit';
  if d is null or d not like '%new.status is distinct from old.status%'
     or d not like '%old.cancelled_by is not null%' then
    raise exception 'P3-115: the 0064 guard lost a branch, so this card weakened the freeze';
  end if;

  -- The move back to draft is still refused, run and not read.
  refused := false;
  begin
    update public.invoices set status = 'draft' where id = a;
  exception when restrict_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-115: an issued invoice was pushed back to draft';
  end if;

  select count(*) into n from pg_indexes
  where schemaname = 'public' and tablename = 'invoices'
    and indexname = 'invoices_one_live_per_outbound_issue';
  if n <> 1 then
    raise exception 'P3-115: invoices_one_live_per_outbound_issue is gone';
  end if;

  -- --- AND NOTHING ABOUT DELETING MOVED ------------------------------------
  select count(*) into n from pg_policies
  where schemaname = 'public'
    and tablename in ('invoice_settings', 'invoice_number_series', 'invoices', 'invoice_lines')
    and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-115: % delete policies exist on the invoice tables, expected none', n;
  end if;
  if has_table_privilege('authenticated', 'public.invoices', 'DELETE')
     or has_table_privilege('authenticated', 'public.invoice_lines', 'DELETE') then
    raise exception 'P3-115: authenticated may delete from an invoice table';
  end if;
end
$$;


rollback;
