-- 0075_save_invoice_draft_refuses_walkin.sql
-- RC Inventory phase 3, card P3-171. A draft invoice can no longer be tied to a
-- walk-in sale, whatever sends the request.
--
-- WHAT FOUND IT. The 2026-10-04 bug check. The rule "a walk-in sale is never
-- invoiced" (card P3-118, ruling R-215) lived only in the read
-- getIssueInvoiceability in lib/data/facturare-create.ts, which hides the invoice
-- button on a walk-in issue. The write did not know it: saveInvoiceDraft only
-- checked that the issue id was a uuid, and public.save_invoice_draft from 0064
-- wrote whatever p_outbound_issue_id it was given. A hand-made request from any
-- signed-in user therefore created a draft invoice tied to a walk-in sale.
--
-- WHAT IT CHANGES
--
--   function public.save_invoice_draft(uuid, jsonb, uuid, uuid, uuid, date, text)
--            REPLACED IN PLACE, same signature, same grants. The body is 0064's,
--            word for word, plus ONE check: when p_outbound_issue_id names an
--            issue whose issue_mode is 'direct_client', it raises and writes
--            nothing.
--
-- THE FLAG IS 0067's AND NO NEW ONE IS INVENTED. A walk-in sale is an outbound
-- issue with issue_mode = 'direct_client', exactly the test getIssueInvoiceability
-- makes. A null project_id would say the same thing today, by
-- outbound_issues_direct_client_mode_shape, and is not used because it is the
-- consequence of the mode and not the mode.
--
-- THE ERROR, AND HOW THE SCREEN READS IT. errcode P0001 (raise_exception) with
-- `direct_client` in the text. refusal() in lib/data/facturare-actions.ts reads
-- that pair and shows DIRECT_CLIENT_NOT_INVOICEABLE, the same Romanian sentence the
-- issue screen already shows. No diacritics here, the convention of 0063 and 0064:
-- a schema carries no interface text.
--
-- WHAT IT DOES NOT CHANGE. A project issue, an invoice with no issue, and an edit
-- of an existing draft behave exactly as under 0064. The edit branch never writes
-- outbound_issue_id, so it needs no check and gets none.
--
-- WHAT IT REMOVES: nothing. There is NO DROP TABLE, NO TRUNCATE, NO DELETE, NO
-- DROP FUNCTION and NO UPDATE or INSERT of an existing row anywhere in this file.
-- Invoices that already exist are not read, changed or cancelled.
--
-- MERGE IS APPLY. Merging this file applies it to the PRODUCTION database within
-- about two minutes, through the Supabase GitHub app (CLAUDE.md 8.0, ruling
-- R-124). The signature does not change, so the build deployed while it applies
-- keeps calling the same function and nothing breaks in that window.
--
-- IT RUNS AS ONE TRANSACTION and is safe to run twice: it is a `create or
-- replace` followed by grants, and section 2 checks the result on every run.
--
-- PROVEN BEFORE MERGE by `npm run check:migrations`, which applies it unmodified
-- to a throwaway postgres and runs
-- scripts/poc-free/local-db/assertions/0075_save_invoice_draft_refuses_walkin.sql,
-- and on the local Supabase stack by tests/e2e/facturare-walkin-refused.spec.ts.

begin;


-- ===========================================================================
-- 1. SAVING A DRAFT, NOW REFUSING A WALK-IN SALE
-- ===========================================================================
--
-- SECURITY INVOKER, unchanged from 0064, so the caller's own policies apply to
-- every statement inside it, the new read of outbound_issues included. That read
-- runs after the active-profile check, and outbound_issues_select (0067) lets
-- every active profile see every issue, so a walk-in issue cannot hide from it.

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

  -- P3-171. A WALK-IN SALE IS NEVER INVOICED, ruling R-215, and this is where
  -- that stops being a screen habit and becomes a rule. Read the header.
  if p_outbound_issue_id is not null and exists (
    select 1
    from public.outbound_issues oi
    where oi.id = p_outbound_issue_id
      and oi.issue_mode = 'direct_client'
  ) then
    raise exception
      'iesirea % este o vanzare directa (direct_client) si nu se factureaza: banii se incaseaza in afara sistemului',
      p_outbound_issue_id
      using errcode = 'P0001';
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
  'P3-111. Writes a draft invoice and its lines in ONE transaction, so a refusal part way through leaves no invoice row behind. Creates when p_invoice_id is null, rewrites a draft when it is not. Refuses a caller with no active profile, an invoice past draft, an empty line list, and any attempt to leave a stored line out. Never writes a total: the triggers from 0063 own those. CARD P3-171 (0075) ADDED ONE REFUSAL: a p_outbound_issue_id whose issue_mode is direct_client, a walk-in sale, raises P0001 with direct_client in the text and writes nothing, because a walk-in sale is never invoiced (ruling R-215).';

-- Same three lines as 0064. A `create or replace` keeps the existing grants, and
-- they are repeated so this file states them rather than relies on them.
revoke all on function public.save_invoice_draft(uuid, jsonb, uuid, uuid, uuid, date, text) from public;
revoke all on function public.save_invoice_draft(uuid, jsonb, uuid, uuid, uuid, date, text) from anon;
grant execute on function public.save_invoice_draft(uuid, jsonb, uuid, uuid, uuid, date, text) to authenticated;


-- ===========================================================================
-- 2. THE RESULT, CHECKED
-- ===========================================================================

do $$
declare
  n integer;
  d text;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'save_invoice_draft'
    and p.prorettype = 'uuid'::regtype
    and not p.prosecdef;
  if n <> 1 then
    raise exception 'P3-171: public.save_invoice_draft is missing, does not return uuid, is SECURITY DEFINER, or exists twice';
  end if;

  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'save_invoice_draft';
  if d not like '%issue_mode = ''direct_client''%' then
    raise exception 'P3-171: public.save_invoice_draft does not refuse a walk-in sale';
  end if;

  if not has_function_privilege('authenticated',
       'public.save_invoice_draft(uuid, jsonb, uuid, uuid, uuid, date, text)', 'EXECUTE') then
    raise exception 'P3-171: authenticated may not execute public.save_invoice_draft';
  end if;
  if has_function_privilege('anon',
       'public.save_invoice_draft(uuid, jsonb, uuid, uuid, uuid, date, text)', 'EXECUTE') then
    raise exception 'P3-171: anon may execute public.save_invoice_draft';
  end if;
end
$$;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect one save_invoice_draft with seven arguments, SECURITY INVOKER, and
-- EXECUTE for authenticated only.

select p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'save_invoice_draft';

select grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name = 'save_invoice_draft'
order by grantee, privilege_type;
