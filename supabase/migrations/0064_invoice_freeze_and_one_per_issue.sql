-- 0064_invoice_freeze_and_one_per_issue.sql
-- RC Inventory phase 3, card P3-111, goal G67. The four holes in Facturare that
-- could produce a wrong or an undeletable invoice, closed where 0063 said the
-- guarantee lives: in the database.
--
-- WHAT FOUND THEM. docs/reports/2026-09-29-critic-bug-sweep-2.md, findings G1
-- (line 75), G4 (163), G5 (206), G6 (232) and G16 (434). That report names the
-- exact lines of 0063 and of the application and it is this file's specification.
--
-- WHAT IT ADDS, AND IT REMOVES NOTHING
--
--   function public.invoices_require_draft_to_edit()   REPLACED, two new branches:
--                                                      the legal status moves, and
--                                                      the six stamp columns
--   index    invoices_one_live_per_outbound_issue      partial unique, one live
--                                                      invoice per Iesire
--   function public.save_invoice_draft(...)            the header and its lines in
--                                                      ONE transaction
--
-- NO TABLE, COLUMN, CONSTRAINT, POLICY OR GRANT IS REMOVED. There is no
-- DROP TABLE, no TRUNCATE, no DELETE, no DROP COLUMN and no UPDATE of an existing
-- row anywhere in this file. The three `drop trigger if exists` lines that carry
-- the replaced guard are the re-runnable shape 0063 itself uses and they are
-- followed immediately by the create; nothing loses a row.
--
-- IT RUNS AS ONE TRANSACTION and IS safe to run twice: every create is guarded,
-- the index is `if not exists`, and section 5 checks the result on every run.
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. THERE ARE REAL
-- INVOICES IN THAT DATABASE SINCE 2026-09-28, so read section 2's own header
-- before merging: it is the only part of this file that can FAIL to apply, and it
-- fails loudly, with the offending Iesire named, rather than touching a row.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
--   IT DOES NOT CANCEL OR DELETE ANY INVOICE, for any reason, including to make
--   the new index apply. The goal line says so in terms and section 2 raises a
--   readable exception instead.
--
--   IT DOES NOT TOUCH THE NUMBERING. public.issue_invoice, public.invoice_series_for
--   and public.invoice_number_series are unchanged. The sweep says the allocator is
--   the one piece of this feature that was built right.
--
--   IT DOES NOT FREEZE issue_date DIFFERENTLY. That column is already properly
--   frozen by the fifteen-column list this file keeps.
--
--   NO PDF, NO PRINTING AND NO e-FACTURA. state_system_number and
--   state_system_status stay nullable and empty, exactly as 0063 left them.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres and then runs
-- scripts/poc-free/local-db/assertions/0064_invoice_freeze_and_one_per_issue.sql,
-- and against a real local Supabase stack by tests/e2e/facturare-data.spec.ts and
-- tests/e2e/facturare-create.spec.ts.

begin;


-- ===========================================================================
-- 1. THE PIPELINE IS A PIPELINE, AND THE AUDIT STAMPS ARE WRITTEN ONCE
-- ===========================================================================
--
-- 0063 SECTION 7a LEFT TWO DOORS IN THE FREEZE, AND ITS OWN HEADER EXPLAINS WHY
-- EACH ONE LOOKED CLOSED. Both are quoted here rather than paraphrased, because a
-- reader arriving at the replaced function needs to know what it used to allow.
--
-- DOOR ONE, finding G1. 0063:484-487 reads:
--
--   "WHAT STAYS CHANGEABLE PAST DRAFT, and it is a short list on purpose:
--      status         because an issued invoice has to be able to become paid or
--                     cancelled. That is what the pipeline IS."
--
-- True about WHY status is not in the frozen list, and silent about WHICH moves
-- it permits. So `{"status":"draft"}` on an issued invoice changed nothing else
-- and was allowed, and once the row was a draft the guard returned early at
-- 0063:516 and the number, the series, the client, the project, the dates, the
-- notes and all three stored totals became writable again, lines included,
-- because invoice_lines_require_draft reads the parent's CURRENT status.
--
-- NEITHER EXISTING CONSTRAINT COULD CATCH IT, and this is worth writing down
-- because both look as if they might:
--
--   invoices_numbered_past_draft            check (status = 'draft' or number is not null)
--     satisfied by its FIRST half the moment the status is 'draft'.
--   invoices_cancel_reason_only_when_cancelled  check (status = 'cancelled' or cancel_reason is null)
--     satisfied because an issued invoice has no cancel reason to begin with.
--
-- DOOR TWO, finding G16. 0063:491-494 reads:
--
--   "the six stamp columns  issued_by, issued_at, paid_by, paid_at, cancelled_by,
--                   cancelled_at. They are written by invoices_stamp_status below,
--                   which fires AFTER this guard by name order, so the guard always
--                   sees the row exactly as the caller submitted it."
--
-- Also true, and also not the whole rule: invoices_stamp_status fills a stamp only
-- WHEN IT IS NULL (0063:579-587), so it never corrects one. An already stamped
-- issued_at could be rewritten to any timestamp by a plain UPDATE, and the Istoric
-- on the invoice screen is built entirely from those six columns.
--
-- WHICH MOVES ARE LEGAL IS A DESIGN QUESTION AND IT WAS ANSWERED BY READING, NOT
-- BY CHOOSING. Two things were already written down:
--
--   docs/reports/2026-09-24-author-facturare-design.md, screen 3, of a Platita
--   invoice: "download the PDF, email it. Nothing else." So paid is TERMINAL.
--
--   Part 3 shipped exactly that. lib/data/facturare-detail-types.ts:144-149 is the
--   one source both the screen and its specification read, and it says
--   `paid: []` and `cancelled: []`. lib/data/facturare-actions.ts:627-635 refuses
--   cancelling a paid invoice in so many words.
--
-- So the legal moves are these three and nothing else:
--
--   draft  -> issued      public.issue_invoice, the only way a number is handed out
--   issued -> paid        markInvoicePaid
--   issued -> cancelled   cancelInvoice
--
-- EVERY OTHER MOVE IS REFUSED, INCLUDING paid -> cancelled AND EVERY MOVE BACK TO
-- draft. An accountant who needs a paid invoice cancelled later is a new decision
-- for the owner, not a branch added quietly here; a refund is not a cancellation.
--
-- AND THE STATUS BRANCH SITS BEFORE THE EARLY RETURN FOR A DRAFT, deliberately.
-- The rule is about the MOVE and not about where the row started, so a draft
-- jumping straight to paid or to cancelled is refused too: cancelling a draft is
-- issue-then-cancel, which is what lib/data/facturare-actions.ts:638-642 already
-- does, precisely because invoices_numbered_past_draft forbids a numberless row
-- past draft.

create or replace function public.invoices_require_draft_to_edit()
returns trigger
language plpgsql
as $$
begin
  -- --- THE MOVE, CHECKED ON EVERY UPDATE, WHATEVER THE OLD STATUS WAS --------
  if new.status is distinct from old.status then
    if not (
         (old.status = 'draft'  and new.status = 'issued')
      or (old.status = 'issued' and new.status = 'paid')
      or (old.status = 'issued' and new.status = 'cancelled')
    ) then
      raise exception
        'factura % nu poate trece de la % la %: o factura merge ciorna, emisa, platita, sau emisa, anulata, si nu se mai intoarce niciodata la ciorna',
        old.id, old.status, new.status
        using errcode = 'restrict_violation';
    end if;
  end if;

  -- --- WHO DID IT AND WHEN: WRITABLE ONLY WHILE STILL NULL -------------------
  -- invoices_stamp_status fills each stamp the first time and never clears it, so
  -- an old value that is not null is the record itself. A write that CHANGES one
  -- is refused; a write that repeats the value it already holds is not a change
  -- and passes, which is what every UPDATE that sends the whole row does.
  if (new.issued_at    is distinct from old.issued_at    and old.issued_at    is not null)
     or (new.issued_by    is distinct from old.issued_by    and old.issued_by    is not null)
     or (new.paid_at      is distinct from old.paid_at      and old.paid_at      is not null)
     or (new.paid_by      is distinct from old.paid_by      and old.paid_by      is not null)
     or (new.cancelled_at is distinct from old.cancelled_at and old.cancelled_at is not null)
     or (new.cancelled_by is distinct from old.cancelled_by and old.cancelled_by is not null)
  then
    raise exception
      'factura %: cine a emis, a platit sau a anulat factura si in ce clipa se scriu o singura data si nu se mai rescriu',
      old.id
      using errcode = 'restrict_violation';
  end if;

  -- --- AND FROM HERE DOWN THIS IS 0063 SECTION 7a, UNCHANGED -----------------
  if old.status = 'draft' then
    return new;
  end if;

  if new.series              is distinct from old.series
     or new.number              is distinct from old.number
     or new.client_id           is distinct from old.client_id
     or new.project_id          is distinct from old.project_id
     or new.outbound_issue_id   is distinct from old.outbound_issue_id
     or new.issue_date          is distinct from old.issue_date
     or new.due_date            is distinct from old.due_date
     or new.currency            is distinct from old.currency
     or new.notes               is distinct from old.notes
     or new.subtotal_mdl        is distinct from old.subtotal_mdl
     or new.vat_total_mdl       is distinct from old.vat_total_mdl
     or new.total_mdl           is distinct from old.total_mdl
     or new.state_system_number is distinct from old.state_system_number
     or new.state_system_status is distinct from old.state_system_status
     or new.created_by          is distinct from old.created_by
  then
    raise exception
      'factura % este % si nu mai este ciorna: doar starea si motivul anularii mai pot fi schimbate, iar o corectie se face prin anulare si o factura noua',
      old.id, old.status
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

comment on function public.invoices_require_draft_to_edit() is
  'P3-111, replacing P3-108. A status moves only draft to issued, issued to paid, or issued to cancelled: never back to draft and never paid to cancelled. The six stamp columns are writable only while they are null. Past draft, only the status and the cancellation reason may change. The screen is a courtesy; this is the guarantee.';

-- THE TRIGGER IS RECREATED AND ITS NAME IS UNCHANGED, which is load bearing and
-- is why the name is repeated here. PostgreSQL fires BEFORE row triggers in name
-- order, so 'invoices_require_draft_to_edit' runs before 'invoices_set_updated_at'
-- and 'invoices_stamp_status': the guard sees the row as the CALLER submitted it,
-- which is the only reason the stamp branch above can tell a caller's rewrite
-- apart from the stamper's own fill.
drop trigger if exists invoices_require_draft_to_edit on public.invoices;
create trigger invoices_require_draft_to_edit
  before update on public.invoices
  for each row execute function public.invoices_require_draft_to_edit();


-- ===========================================================================
-- 2. ONE LIVE INVOICE PER IESIRE, DECIDED BY THE DATABASE
-- ===========================================================================
--
-- Finding G5. "Exista deja o factura pentru aceasta iesire" was decided by a
-- SELECT in getIssueInvoiceability (lib/data/facturare-create.ts:154-182) and the
-- write path inserted without re-asking. invoices.outbound_issue_id is an ordinary
-- nullable foreign key with an index and no unique constraint (0063:236, :459), and
-- the only unique constraint on the table is on (series, number).
--
-- So two tabs on /facturare/nou?iesire=X both succeeded, and NEITHER invoice could
-- be deleted: the only way out is to cancel one, which consumes a second number in
-- the series. 0063's own header, section 3, says why a read followed by a write is
-- not a guard, and this is the same class of problem the counter was built to avoid.
--
-- CANCELLED INVOICES ARE OUTSIDE THE INDEX, on purpose. An Iesire whose invoice was
-- cancelled must be invoiceable again, which is the whole point of cancelling one.
-- A null outbound_issue_id is outside it too: a manual invoice has no Iesire and
-- PostgreSQL would treat every null as distinct anyway, so the predicate says it
-- rather than relying on it.
--
-- THIS IS THE ONLY PART OF THIS FILE THAT CAN FAIL TO APPLY, and the block below
-- exists so that when it does, the failure is a sentence naming the Iesire rather
-- than `duplicate key value violates unique constraint`. NOTHING IS DELETED AND
-- NOTHING IS CANCELLED TO MAKE THE INDEX PASS: that is the goal line's own
-- instruction and it is absolute. If this raises, the whole migration rolls back,
-- the database stays exactly as it was, and the decision about which of the two
-- invoices is the real one belongs to the owner and an accountant.

do $$
declare
  offending text;
begin
  select string_agg(format('%s (%s facturi)', outbound_issue_id, n), ', ')
    into offending
  from (
    select outbound_issue_id, count(*) as n
    from public.invoices
    where outbound_issue_id is not null
      and status <> 'cancelled'
    group by outbound_issue_id
    having count(*) > 1
  ) d;

  if offending is not null then
    raise exception
      'P3-111: o iesire are deja mai mult de o factura neanulata, deci indexul unic nu se poate crea: %. Nimic nu a fost sters si nimic nu a fost anulat. Decizia despre care factura este cea reala este a proprietarului si a contabilului.',
      offending;
  end if;
end
$$;

create unique index if not exists invoices_one_live_per_outbound_issue
  on public.invoices (outbound_issue_id)
  where outbound_issue_id is not null and status <> 'cancelled';

comment on index public.invoices_one_live_per_outbound_issue is
  'P3-111. One live invoice per Iesire, enforced here and not by a read in application code. Cancelled invoices are outside the index, so an Iesire whose invoice was cancelled can be invoiced again.';


-- ===========================================================================
-- 3. SAVING A DRAFT IS ONE TRANSACTION
-- ===========================================================================
--
-- Finding G6. Saving a new invoice was TWO PostgREST requests and not one
-- transaction: the header first (lib/data/facturare-actions.ts:379-396), the lines
-- afterwards (:398-401). If the second failed, the function returned a refusal and
-- the header STAYED: numberless, lineless, showing on /facturare for the month
-- because a draft's list date is its creation day, and removable by nobody, because
-- public.invoices has no delete privilege and no delete policy for any role, owner
-- included (0063:911-923, :966-970). The only route out spends a real number on a
-- document that was never composed. The edit path had the same shape: the header
-- update and each line write were separate requests (:439-466).
--
-- ONE FUNCTION, SO A FAILURE LEAVES NOTHING BEHIND. This is the same reason issuing
-- is a function: the allocation and the write have to succeed or fail together.
--
-- SECURITY INVOKER, WHICH IS THE DEFAULT AND IS DELIBERATE HERE, and the contrast
-- with public.issue_invoice is the point. issue_invoice must be SECURITY DEFINER
-- because it writes public.invoice_number_series, which has no write policy and no
-- write grant at all. This function writes nothing a caller may not already write,
-- so running it as the caller keeps the invoices and invoice_lines policies in
-- force on every statement inside it. A SECURITY DEFINER version would have been a
-- second door into the same two tables for no gain.
--
-- IT STILL TAKES THE AUTHORIZATION DECISION ON ITS FIRST LINE, with the same
-- predicate the policies use, because a policy filters a row and returns a silent
-- zero-row answer, and a caller with no active profile deserves a sentence.
--
-- A LINE THAT HAS BEEN WRITTEN IS NEVER TAKEN OFF, and that rule is repeated here
-- rather than left to the screen. The application checks it too, for the Romanian
-- sentence with the field beside it; this is the guarantee, for the old page, the
-- double press and the hand-built request.
--
-- THE THREE FIGURES OF A LINE ARE NOT ACCEPTED HERE EITHER. Nothing below writes
-- line_subtotal_mdl, line_vat_mdl, line_total_mdl, subtotal_mdl, vat_total_mdl or
-- total_mdl: invoice_lines_compute_totals and invoice_lines_sync_invoice_totals own
-- them, exactly as they did before.
--
-- issue_date IS NOT WRITTEN HERE, for the reason facturare-actions.ts:385-388
-- already gives: a draft carries no issue date, public.issue_invoice gives it one,
-- and a draft holding one would be a row the list claims was issued that day.

create or replace function public.save_invoice_draft(
  p_client_id         uuid,
  p_lines             jsonb,
  p_invoice_id        uuid default null,
  p_project_id        uuid default null,
  p_outbound_issue_id uuid default null,
  p_due_date          date default null,
  p_notes             text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_status public.invoice_status;
  v_stored integer;
  v_kept   integer;
  v_line   jsonb;
  v_order  integer;
  v_lineid uuid;
begin
  if public.current_app_role() is null then
    raise exception 'doar un cont activ poate scrie o factura'
      using errcode = 'insufficient_privilege';
  end if;

  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'o factura are nevoie de cel putin o pozitie'
      using errcode = 'restrict_violation';
  end if;

  if p_invoice_id is null then
    insert into public.invoices (client_id, project_id, outbound_issue_id, due_date, notes)
    values (p_client_id, p_project_id, p_outbound_issue_id, p_due_date, p_notes)
    returning id into v_id;

    -- A row the invoices_insert policy filtered would leave this null rather than
    -- raise, and a caller must not read that as a save.
    if v_id is null then
      raise exception 'factura nu a putut fi scrisa'
        using errcode = 'insufficient_privilege';
    end if;
  else
    select i.status into v_status from public.invoices i where i.id = p_invoice_id;
    if v_status is null then
      raise exception 'factura % nu exista', p_invoice_id
        using errcode = 'no_data_found';
    end if;
    if v_status <> 'draft' then
      raise exception
        'factura % este % si nu mai este ciorna: o corectie se face prin anulare si o factura noua',
        p_invoice_id, v_status
        using errcode = 'restrict_violation';
    end if;
    v_id := p_invoice_id;

    -- HOW MANY LINES THIS INVOICE HAS, AND HOW MANY OF THEM THE CALLER SENT BACK.
    -- Fewer means a stored line was left out, which is a removal by omission.
    select count(*) into v_stored
    from public.invoice_lines l
    where l.invoice_id = v_id;

    select count(*) into v_kept
    from jsonb_array_elements(p_lines) e
    where nullif(e ->> 'id', '') is not null
      and exists (
        select 1 from public.invoice_lines l
        where l.invoice_id = v_id
          and l.id = (e ->> 'id')::uuid
      );

    if v_kept < v_stored then
      raise exception
        'o pozitie deja scrisa pe factura % nu poate fi scoasa: nimic nu se sterge aici, iar o factura fara acea pozitie se face prin anularea ciornei cu un motiv si o factura noua',
        v_id
        using errcode = 'restrict_violation';
    end if;

    update public.invoices
       set client_id  = p_client_id,
           project_id = p_project_id,
           due_date   = p_due_date,
           notes      = p_notes
     where id = v_id;

    if not found then
      raise exception 'factura % nu a putut fi modificata', v_id
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- THE LINES, IN THE ORDER THEY ARRIVED, which is the order the screen showed and
  -- the order the document reads.
  for v_line, v_order in
    select e.value, e.ordinality - 1
    from jsonb_array_elements(p_lines) with ordinality as e(value, ordinality)
  loop
    v_lineid := nullif(v_line ->> 'id', '')::uuid;

    if v_lineid is null then
      insert into public.invoice_lines
        (invoice_id, product_id, description, unit, quantity, unit_price_mdl, vat_rate, sort_order)
      values (
        v_id,
        nullif(v_line ->> 'product_id', '')::uuid,
        nullif(v_line ->> 'description', ''),
        (v_line ->> 'unit')::public.unit_code,
        (v_line ->> 'quantity')::numeric,
        (v_line ->> 'unit_price_mdl')::numeric,
        (v_line ->> 'vat_rate')::numeric,
        v_order
      );
    else
      update public.invoice_lines
         set product_id     = nullif(v_line ->> 'product_id', '')::uuid,
             description    = nullif(v_line ->> 'description', ''),
             unit           = (v_line ->> 'unit')::public.unit_code,
             quantity       = (v_line ->> 'quantity')::numeric,
             unit_price_mdl = (v_line ->> 'unit_price_mdl')::numeric,
             vat_rate       = (v_line ->> 'vat_rate')::numeric,
             sort_order     = v_order
       where id = v_lineid
         and invoice_id = v_id;

      if not found then
        raise exception 'o pozitie trimisa nu apartine facturii %', v_id
          using errcode = 'restrict_violation';
      end if;
    end if;
  end loop;

  return v_id;
end;
$$;

comment on function public.save_invoice_draft(uuid, jsonb, uuid, uuid, uuid, date, text) is
  'P3-111. Writes a draft invoice and its lines in ONE transaction, so a refusal part way through leaves no invoice row behind. Creates when p_invoice_id is null, rewrites a draft when it is not. Refuses a caller with no active profile, an invoice past draft, an empty line list, and any attempt to leave a stored line out. Never writes a total: the triggers from 0063 own those.';

-- FUNCTIONS: REVOKE FROM public FIRST, not from anon. PostgreSQL grants EXECUTE on
-- a new function to PUBLIC by default, so revoking from anon alone leaves anon
-- reaching it THROUGH public. 0063 records the same trap on its two functions.
revoke all on function public.save_invoice_draft(uuid, jsonb, uuid, uuid, uuid, date, text) from public;
revoke all on function public.save_invoice_draft(uuid, jsonb, uuid, uuid, uuid, date, text) from anon;
grant execute on function public.save_invoice_draft(uuid, jsonb, uuid, uuid, uuid, date, text) to authenticated;


-- ===========================================================================
-- 4. NOTHING ABOUT DELETING CHANGED, AND THAT IS ASSERTED BELOW
-- ===========================================================================
--
-- The RPC in section 3 stops a row from being CREATED when its lines cannot be
-- written, which is not the same act as deleting one. No delete privilege is
-- granted, no delete policy is created, and section 5 re-checks both on every run,
-- exactly as 0063 section 11 does, so this file cannot quietly become the one that
-- opened that door.


-- ===========================================================================
-- 5. THE RESULT, CHECKED
-- ===========================================================================
--
-- A check, not a change. It holds on every run, which is what makes this file
-- re-runnable rather than merely idempotent looking.

do $$
declare
  n integer;
  d text;
begin
  -- The replaced guard carries both new branches. Read off the function body, so a
  -- future edit that drops one fails here rather than in a test six weeks later.
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'invoices_require_draft_to_edit';
  if d is null then
    raise exception 'P3-111: public.invoices_require_draft_to_edit() does not exist';
  end if;
  if d not like '%new.status is distinct from old.status%' then
    raise exception 'P3-111: the guard does not look at the status move';
  end if;
  if d not like '%old.cancelled_by is not null%' then
    raise exception 'P3-111: the guard does not protect the six stamp columns';
  end if;

  -- The partial unique index exists, is unique, and is partial on the cancelled
  -- status. A unique index without the predicate would make a cancelled invoice
  -- block its Iesire forever.
  select count(*) into n
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'invoices'
    and indexname = 'invoices_one_live_per_outbound_issue'
    and indexdef like 'CREATE UNIQUE INDEX%'
    and indexdef like '%outbound_issue_id%'
    and indexdef like '%cancelled%';
  if n <> 1 then
    raise exception 'P3-111: invoices_one_live_per_outbound_issue is not a partial unique index on outbound_issue_id';
  end if;

  -- The RPC exists, returns a uuid, and is SECURITY INVOKER.
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'save_invoice_draft'
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

  -- AND NOTHING ABOUT DELETING MOVED, re-checked from 0063 section 11.
  select count(*) into n from pg_policies
  where schemaname = 'public'
    and tablename in ('invoice_settings', 'invoice_number_series', 'invoices', 'invoice_lines')
    and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-111: % delete policies exist on the invoice tables, expected none', n;
  end if;

  if has_table_privilege('authenticated', 'public.invoices', 'DELETE')
     or has_table_privilege('authenticated', 'public.invoice_lines', 'DELETE') then
    raise exception 'P3-111: authenticated may delete from an invoice table';
  end if;

  -- And the counter is still nobody's to write, because this card must not have
  -- touched the numbering.
  if has_table_privilege('authenticated', 'public.invoice_number_series', 'INSERT')
     or has_table_privilege('authenticated', 'public.invoice_number_series', 'UPDATE') then
    raise exception 'P3-111: authenticated may write the invoice number counter';
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
-- scripts/poc-free/local-db/assertions/0064_invoice_freeze_and_one_per_issue.sql.

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'invoices'
order by indexname;

select c.relname as table_name, t.tgname as trigger_name, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('invoices', 'invoice_lines')
  and not t.tgisinternal
order by c.relname, t.tgname;

select p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('invoices_require_draft_to_edit', 'save_invoice_draft', 'issue_invoice')
order by p.proname;

select grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name = 'save_invoice_draft'
order by grantee, privilege_type;

select outbound_issue_id, count(*) as live_invoices
from public.invoices
where outbound_issue_id is not null and status <> 'cancelled'
group by outbound_issue_id
having count(*) > 1
order by outbound_issue_id;
