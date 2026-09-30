-- 0065_invoice_chisinau_day_and_paid_date.sql
-- RC Inventory phase 3, card P3-115, goal G70. The database half of three findings
-- from docs/reports/2026-09-29-critic-bug-sweep-2.md: G2 (line 113), G3 (145) and
-- G14 (401). That report names the exact lines of 0063 and of the application and it
-- is this file's specification.
--
-- WHAT IT REPLACES AND ADDS, AND IT REMOVES NOTHING
--
--   function public.invoice_series_for(date)         REPLACED. Its fallback day is
--                                                    the CHISINAU day, not current_date.
--   function public.issue_invoice(uuid, date, date)  REPLACED. One line: v_issue.
--                                                    The lock and the allocation are
--                                                    byte identical to 0063.
--   function public.invoices_validate_paid_date()    NEW. A payment day is never
--                                                    before the issue day and never
--                                                    in the future.
--   trigger  invoices_validate_paid_date             NEW, on public.invoices.
--
-- NO TABLE, COLUMN, CONSTRAINT, POLICY, INDEX OR GRANT IS REMOVED. There is no
-- DROP TABLE, no TRUNCATE, no DELETE, no DROP COLUMN and no UPDATE of an existing
-- row anywhere in this file. The one `drop trigger if exists` line carries the new
-- trigger's own name, is a no-op on a first run, is the re-runnable shape 0063 and
-- 0064 both use, and is followed immediately by the create.
--
-- IT RUNS AS ONE TRANSACTION and IS safe to run twice: every function is `create or
-- replace`, the trigger is dropped by its own name and recreated, and section 4
-- checks the result on every run.
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through the
-- Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. THERE ARE REAL INVOICES IN
-- THAT DATABASE SINCE 2026-09-28. NOTHING HERE CAN FAIL TO APPLY BECAUSE OF AN
-- EXISTING ROW: a replaced function body reads no row at apply time, and a trigger
-- is not validated against rows that already exist. That last sentence is the whole
-- reason section 3 is a trigger and not a CHECK constraint, and section 3's own
-- header gives the second reason, which is that PostgreSQL would refuse the CHECK.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
--   IT DOES NOT TOUCH A SINGLE INVOICE ROW, for any reason, including to make the
--   new rule hold on rows written before it. The goal line says so in terms. If a
--   real invoice in production carries a paid_at before its issue_date, this file
--   leaves it exactly as it is; the trigger governs writes from the moment it lands
--   and the report for this card says so in one plain sentence for the owner.
--
--   IT DOES NOT CHANGE HOW A NUMBER IS HANDED OUT. public.invoice_number_series is
--   untouched, its grants are untouched, and the lock in public.issue_invoice, the
--   single `update ... returning` statement, is copied across character for
--   character. These findings change which DAY the allocator is asked about, never
--   the allocation. P3-111's concurrency proof must pass unchanged and section 4
--   re-checks that the function is still SECURITY DEFINER and that nobody may write
--   the counter.
--
--   IT DOES NOT UNFREEZE ANYTHING. The fifteen guarded columns and the six stamps
--   from 0064 stay exactly as that file left them. G14's rule is about a value being
--   written for the FIRST time, and 0064's guard already refuses a change to a
--   paid_at that is not null, so the two rules meet rather than overlap.
--
--   NO PDF, NO PRINTING AND NO e-FACTURA. state_system_number and
--   state_system_status stay nullable and empty, exactly as 0063 left them.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres and then runs
-- scripts/poc-free/local-db/assertions/0065_invoice_chisinau_day_and_paid_date.sql,
-- and against a real local Supabase stack by tests/e2e/facturare-chisinau-day.spec.ts.

begin;


-- ===========================================================================
-- 1. WHAT DAY IS IT. THE ANSWER IS CHISINAU, AND IT IS ONE PLACE
-- ===========================================================================
--
-- FINDINGS G2 AND G3, WHICH ARE ONE CLOCK REACHED BY TWO ROUTES.
--
-- 0063:812 read, and 0063:757 read the same way:
--
--   v_issue date := coalesce(p_issue_date, current_date);
--
-- `current_date` is the date on the DATABASE SERVER, which is UTC. Chisinau is
-- UTC+2 or UTC+3, so for the first two or three hours of every Chisinau day the
-- server's day is YESTERDAY. v_issue then decides two things: the issue_date written
-- on the document, and, through public.invoice_series_for, WHICH SERIES IT IS
-- NUMBERED IN.
--
-- THE CONCRETE FAILURE THE SWEEP NAMES: a draft cancelled at 00:30 Chisinau on
-- 1 January 2027 was stamped issue_date 2026-12-31 and took the next number in
-- series RC-2026, not RC-2027. It then appeared on the December list, in the closed
-- year's series, under a number nobody expected to be issued.
--
-- ROUTE ONE, G2. Cancelling a draft has to issue it first, because
-- invoices_numbered_past_draft (0063:317) forbids any status past draft without a
-- number, and lib/data/facturare-actions.ts did that with an EMPTY issue date, which
-- the action turned into null, which arrived here as p_issue_date null.
--
-- ROUTE TWO, G3. Clearing the Data emiterii box on /facturare/nou and pressing Emite
-- sent an empty string that became the same null, because the editor's `problems`
-- list never required the field.
--
-- WHY THIS IS A DEFECT AND NOT A DESIGN CHOICE: every other path in this feature is
-- careful about exactly this clock. markInvoicePaid writes noon UTC rather than
-- midnight and its comment explains why in four lines. lib/data/format.ts carries
-- chisinauDateOf and chisinauToday, written by card P3-90 for this, and
-- facturare-list-types.ts refuses `new Date(string)` for the same reason. Migrations
-- 0040, 0057 and 0058 already write the expression used below, character for
-- character. The fallback in 0063 is the one place the rule was not applied.
--
-- THE FIX IS ON BOTH SIDES AND THE TIME ZONE NAME IS WRITTEN IDENTICALLY IN BOTH.
-- The application now passes the Chisinau day explicitly, from chisinauToday(), so
-- in normal operation the fallback below is never reached. It is still corrected,
-- because a fallback that is wrong is a trap for the next caller, and because two
-- places that decide a day and disagree are worse than one place that is wrong.
-- 'Europe/Chisinau' is the same string lib/data/format.ts uses.
--
-- (now() at time zone 'Europe/Chisinau')::date IS NOT IMMUTABLE, which is why this
-- expression can live in a STABLE function and in a plpgsql body and cannot live in
-- a CHECK constraint. Section 3 is built on that fact.

create or replace function public.invoice_series_for(p_on date)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when s.number_includes_year
             then s.series_prefix
                  || to_char(coalesce(p_on, (now() at time zone 'Europe/Chisinau')::date), 'YYYY')
           else s.series_prefix
         end
  from public.invoice_settings s
  where s.id
$$;

comment on function public.invoice_series_for(date) is
  'P3-115, replacing P3-108. The invoice series a date falls in, from public.invoice_settings: the prefix, plus the year when number_includes_year is true. A null date falls back to the CHISINAU day, not to the servers UTC day, because Chisinau is UTC+2 or UTC+3 and at a year boundary the difference puts a document in the wrong legal series. SECURITY DEFINER so the answer does not depend on whether the caller may read the settings row.';


-- ---------------------------------------------------------------------------
-- 1b. ISSUING AN INVOICE. THE ALLOCATION IS COPIED, NOT REWRITTEN
-- ---------------------------------------------------------------------------
--
-- EVERY COMMENT 0063 SECTION 8 WROTE ABOUT THIS FUNCTION STILL HOLDS AND IS NOT
-- REPEATED HERE: the SECURITY DEFINER decision that makes the series tamper proof,
-- the authorization taken on the first line with the same predicate the write
-- policies use, the row lock that makes two simultaneous Emite presses two
-- consecutive numbers, the counter row rather than a sequence so that a failed
-- transaction does not burn a number out of a legal series, and a cancelled invoice
-- keeping its number. Read 0063:768-796 for all of it.
--
-- EXACTLY ONE LINE OF THE BODY DIFFERS FROM 0063, and it is the declaration of
-- v_issue. The insert, the `update ... returning` that allocates under the lock, the
-- two raises around it and the final update are character for character 0063's. That
-- is deliberate and it is the point: P3-111's concurrency proof, case 2 of
-- tests/e2e/facturare-data.spec.ts, fires five real HTTP requests at this function
-- and asserts five distinct consecutive numbers and a counter that advanced exactly
-- five times. It must keep passing, unmodified, and it does.

create or replace function public.issue_invoice(
  p_invoice_id uuid,
  p_issue_date date default null,
  p_due_date   date default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_series text;
  v_number integer;
  v_status public.invoice_status;
  -- THE ONE CHANGED LINE. 0063 fell back to the server's own calendar day here.
  --
  -- THE OLD EXPRESSION IS NOT QUOTED, AND THAT IS DELIBERATE. Section 4 below reads this
  -- function back with pg_get_functiondef and REFUSES a body that still mentions the server
  -- day, which is the assertion that would catch somebody putting the UTC clock back. A
  -- comment quoting the old call sits inside the body that assertion reads, so it would make
  -- the check fail on a correct function. It is named in prose in section 1's header instead,
  -- outside every function, where the check cannot see it. The same trap, in TypeScript, is
  -- recorded in docs/LEARNINGS.md under a comment that quotes the code a grep looks for.
  v_issue  date := coalesce(p_issue_date, (now() at time zone 'Europe/Chisinau')::date);
  v_row    public.invoices;
begin
  if public.current_app_role() is null then
    raise exception 'doar un cont activ poate emite o factura'
      using errcode = 'insufficient_privilege';
  end if;

  select i.status into v_status from public.invoices i where i.id = p_invoice_id;
  if v_status is null then
    raise exception 'factura % nu exista', p_invoice_id
      using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'factura % este deja % si nu se mai emite', p_invoice_id, v_status
      using errcode = 'restrict_violation';
  end if;

  v_series := public.invoice_series_for(v_issue);
  if v_series is null or btrim(v_series) = '' then
    raise exception 'seria facturilor nu este configurata in Setari'
      using errcode = 'restrict_violation';
  end if;

  -- The counter row for this series, created on first use. A second transaction
  -- doing the same thing at the same moment does nothing and then blocks below.
  insert into public.invoice_number_series (series) values (v_series)
  on conflict (series) do nothing;

  -- THE LOCK AND THE ALLOCATION, ONE STATEMENT.
  update public.invoice_number_series
     set next_number = next_number + 1
   where series = v_series
  returning next_number - 1 into v_number;

  if v_number is null then
    raise exception 'contorul seriei % nu a putut fi citit', v_series
      using errcode = 'restrict_violation';
  end if;

  update public.invoices
     set series     = v_series,
         number     = v_number,
         status     = 'issued',
         issue_date = v_issue,
         due_date   = coalesce(p_due_date, due_date)
   where id = p_invoice_id
     and status = 'draft'
  returning * into v_row;

  if v_row.id is null then
    -- Somebody else issued it between the read above and this write. The whole
    -- transaction rolls back, counter included, so no number is lost.
    raise exception 'factura % a fost emisa de altcineva intre timp', p_invoice_id
      using errcode = 'restrict_violation';
  end if;

  return v_row;
end;
$$;

comment on function public.issue_invoice(uuid, date, date) is
  'P3-115, replacing P3-108. Issues a draft invoice: allocates the next number in its series from public.invoice_number_series under a row lock, inside this transaction, and moves the invoice to issued. THE ONLY WAY A NUMBER IS HANDED OUT. No gaps, because a rolled back transaction rolls the counter back too; no duplicates, because the allocation is one locking statement and invoices_number_unique_per_series would refuse a second claim anyway. Refuses any caller without an active profile. A null issue date falls back to the CHISINAU day and not to the servers UTC day, which is the only line P3-115 changed.';


-- ===========================================================================
-- 2. NOTHING ABOUT THE NUMBERING MOVED, AND THAT IS ASSERTED BELOW
-- ===========================================================================
--
-- Section 1b replaced a function body and changed one declaration inside it. It
-- granted nothing, revoked nothing and created no second way to reach the counter.
-- The grants 0063 section 9 wrote are still the only ones, and section 4 re-checks
-- that neither `authenticated` nor `anon` may insert into or update
-- public.invoice_number_series, exactly as 0064 section 5 does, so this file cannot
-- quietly become the one that opened that door.


-- ===========================================================================
-- 3. A PAYMENT DAY IS NEVER BEFORE THE ISSUE DAY AND NEVER IN THE FUTURE
-- ===========================================================================
--
-- FINDING G14. lib/data/facturare-actions.ts parsed the Data platii box with a
-- function that checked only the SHAPE `YYYY-MM-DD`. Nothing compared the day to
-- issue_date, to today, or to anything else, and the database had no constraint on
-- paid_at either, so an invoice issued today could be recorded as paid in 2019 or in
-- 2031. The screen now refuses both, each with its own Romanian sentence beside the
-- field. This section is the guarantee behind that courtesy, which is 0063's own
-- doctrine about every other rule on these tables.
--
-- WHY A TRIGGER AND NOT A CHECK CONSTRAINT, AND THIS IS NOT A PREFERENCE.
-- PostgreSQL refuses a non-IMMUTABLE function in a CHECK constraint, and EVERY way
-- of reading a calendar day out of a `timestamptz` is STABLE and not immutable,
-- because it depends on a time zone: `paid_at at time zone 'Europe/Chisinau'`,
-- `paid_at::date` and `issue_date::timestamptz` are all STABLE. `now()` is STABLE
-- too, so the future half could never have been a constraint under any spelling. A
-- CHECK comparing paid_at to issue_date is therefore not something this file chose
-- against; it is something the server would have rejected. A BEFORE trigger may read
-- both, and 0064 already holds the freeze and the pipeline in exactly this
-- instrument on exactly this table.
--
-- AND A TRIGGER TOUCHES NO EXISTING ROW, which is the second reason and the one that
-- matters to the owner. A validated CHECK reads every row in the table at apply
-- time, so one real invoice carrying a paid_at before its issue_date would fail the
-- whole migration, and this file would then be choosing between breaking a deploy
-- and correcting a row the goal line forbids anyone to touch. A trigger governs
-- writes from the moment it lands and asks nothing of the past.
--
-- THE NAME SORTS AFTER 'invoices_stamp_status' ON PURPOSE. PostgreSQL fires BEFORE
-- row triggers in name order, and the four on this table now run:
--
--   invoices_require_draft_to_edit   the freeze and the pipeline (0064)
--   invoices_set_updated_at          the clock
--   invoices_stamp_status            fills paid_at with now() when it is null (0063)
--   invoices_validate_paid_date      this one, LAST, so it judges the FINAL value
--
-- so a paid_at the stamper filled is checked as well as one a caller sent. The
-- stamper's own value is now(), which is neither in the future nor before any issue
-- date the document can legally carry, so nothing that worked before is refused.
--
-- IT FIRES ON INSERT AS WELL AS ON UPDATE, and the reason is the same one 0064 gives
-- for its own insert coverage: a row created with a paid_at is exactly as wrong as a
-- row updated to one, and a trigger catching only UPDATE would leave the shorter
-- path open.
--
-- A NULL paid_at RETURNS IMMEDIATELY, so a draft, an issued invoice and a cancelled
-- one are untouched by this section. So is an invoice with no issue_date, which can
-- only be a draft, because invoices_numbered_past_draft forbids the rest.
--
-- THE COMPARISON IS ON CALENDAR DAYS IN CHISINAU, not on instants, and the reason is
-- written in lib/data/format.ts: paid_at is a `timestamptz` written at noon UTC by
-- markInvoicePaid, which falls on the same Chisinau day whether the offset is +2 or
-- +3, while midnight UTC would be 02:00 or 03:00 of the NEXT day there and would
-- move the day for every payment. Reading the day back the same way is the other
-- half of that decision.

create or replace function public.invoices_validate_paid_date()
returns trigger
language plpgsql
as $$
declare
  v_paid  date;
  v_today date;
begin
  if new.paid_at is null then
    return new;
  end if;

  v_paid  := (new.paid_at at time zone 'Europe/Chisinau')::date;
  v_today := (now() at time zone 'Europe/Chisinau')::date;

  if new.issue_date is not null and v_paid < new.issue_date then
    raise exception
      'factura %: ziua platii % este inainte de ziua emiterii %, deci nu poate fi ziua in care a fost platita',
      new.id, v_paid, new.issue_date
      using errcode = 'check_violation';
  end if;

  if v_paid > v_today then
    raise exception
      'factura %: ziua platii % este in viitor, iar o plata se inregistreaza dupa ce a fost facuta',
      new.id, v_paid
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.invoices_validate_paid_date() is
  'P3-115, finding G14. A paid_at is never a day before the invoices issue_date and never a day in the future, read as CALENDAR DAYS IN CHISINAU because that is how markInvoicePaid writes it. A null paid_at returns immediately. A trigger and not a CHECK constraint because every way of reading a day out of a timestamptz is STABLE and PostgreSQL refuses a non-immutable function in a CHECK, and because a trigger asks nothing of the rows that already exist. The screen is a courtesy; this is the guarantee.';

drop trigger if exists invoices_validate_paid_date on public.invoices;
create trigger invoices_validate_paid_date
  before insert or update on public.invoices
  for each row execute function public.invoices_validate_paid_date();


-- ===========================================================================
-- 4. THE RESULT, CHECKED
-- ===========================================================================
--
-- A check, not a change. It holds on every run, which is what makes this file
-- re-runnable rather than merely idempotent looking.

do $$
declare
  n integer;
  d text;
begin
  -- --- THE CHISINAU DAY IS IN BOTH FUNCTIONS, AND current_date IS IN NEITHER ---
  -- Read off the function bodies, so an edit that puts the UTC clock back fails here
  -- rather than at a year boundary somebody is asleep for.
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
  -- AND THE LOCK IS STILL THE ONE STATEMENT IT HAS TO BE. This is the sentence the
  -- whole counter-instead-of-sequence decision rests on.
  if d not like '%set next_number = next_number + 1%' then
    raise exception 'P3-115: issue_invoice no longer allocates with one locking update statement';
  end if;

  -- --- AND IT IS STILL SECURITY DEFINER, WHICH IS WHAT MAKES THE SERIES SAFE ---
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'issue_invoice' and p.prosecdef;
  if n <> 1 then
    raise exception 'P3-115: public.issue_invoice is gone or is no longer SECURITY DEFINER';
  end if;
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'invoice_series_for' and p.prosecdef;
  if n <> 1 then
    raise exception 'P3-115: public.invoice_series_for is no longer SECURITY DEFINER';
  end if;

  -- --- THE PAID-DATE TRIGGER EXISTS, CARRIES BOTH HALVES, AND FIRES LAST -----
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

  -- INSERT and UPDATE, both. tgtype bit 4 is INSERT, bit 16 is UPDATE, bit 1 is BEFORE.
  select count(*) into n from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'invoices' and not t.tgisinternal
    and t.tgname = 'invoices_validate_paid_date'
    and (t.tgtype & 1) > 0 and (t.tgtype & 4) > 0 and (t.tgtype & 16) > 0;
  if n <> 1 then
    raise exception 'P3-115: the invoices_validate_paid_date trigger is not a BEFORE INSERT OR UPDATE row trigger';
  end if;

  -- It must judge the FINAL paid_at, so it has to fire after the stamper fills one.
  if 'invoices_validate_paid_date' <= 'invoices_stamp_status' then
    raise exception 'P3-115: the paid-date trigger no longer sorts after invoices_stamp_status, so it would judge an unstamped row';
  end if;

  -- --- 0064 IS UNTOUCHED ----------------------------------------------------
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'invoices_require_draft_to_edit';
  if d is null or d not like '%new.status is distinct from old.status%'
     or d not like '%old.cancelled_by is not null%' then
    raise exception 'P3-115: 0064 guard is missing one of its branches, so this file weakened the freeze';
  end if;
  select count(*) into n from pg_indexes
  where schemaname = 'public' and tablename = 'invoices'
    and indexname = 'invoices_one_live_per_outbound_issue';
  if n <> 1 then
    raise exception 'P3-115: invoices_one_live_per_outbound_issue is gone';
  end if;

  -- --- AND NOTHING ABOUT DELETING OR ABOUT THE COUNTER MOVED ----------------
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

  if has_table_privilege('authenticated', 'public.invoice_number_series', 'INSERT')
     or has_table_privilege('authenticated', 'public.invoice_number_series', 'UPDATE') then
    raise exception 'P3-115: authenticated may write the invoice number counter';
  end if;

  if not has_function_privilege('authenticated', 'public.issue_invoice(uuid, date, date)', 'EXECUTE') then
    raise exception 'P3-115: authenticated may not execute public.issue_invoice';
  end if;
  if has_function_privilege('anon', 'public.issue_invoice(uuid, date, date)', 'EXECUTE') then
    raise exception 'P3-115: anon may execute public.issue_invoice';
  end if;
end
$$;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- These grids go into the pull request body, verbatim. Every one of them is also
-- asserted, so a failure fails the pull request rather than waiting to be read off
-- a grid:
-- scripts/poc-free/local-db/assertions/0065_invoice_chisinau_day_and_paid_date.sql.

select p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       p.provolatile as volatility
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('invoice_series_for', 'issue_invoice', 'invoices_validate_paid_date',
                    'invoices_require_draft_to_edit', 'invoices_stamp_status')
order by p.proname;

select c.relname as table_name, t.tgname as trigger_name, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'invoices'
  and not t.tgisinternal
order by t.tgname;

select public.invoice_series_for(null) as series_for_a_null_day,
       (now() at time zone 'Europe/Chisinau')::date as chisinau_day,
       current_date as server_day;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.invoices'::regclass
order by conname;
