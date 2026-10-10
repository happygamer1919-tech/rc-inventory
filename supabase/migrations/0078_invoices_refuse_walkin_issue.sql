-- 0078_invoices_refuse_walkin_issue.sql
-- RC Inventory phase 3, card P3-212. An invoice can never be tied to a walk-in
-- sale, whatever writes the row: the table itself refuses it, not only
-- public.save_invoice_draft.
--
-- WHAT FOUND IT. The 2026-10-10 bug check, and P3-171's own notes, which left it
-- open in so many words: 0074 put the walk-in refusal inside save_invoice_draft
-- only. The table policies invoices_insert and invoices_update (0063) allow any
-- active account, and the draft guard invoices_require_draft_to_edit (0064) lets
-- outbound_issue_id change while the invoice is a draft. So a POST to
-- /rest/v1/invoices naming a walk-in issue, or a PATCH of a draft's
-- outbound_issue_id, wrote what the function refuses.
--
-- WHAT IT ADDS, AND IT REMOVES NOTHING
--
--   function public.invoices_refuse_walkin_issue()   NEW, a trigger function
--   trigger  invoices_refuse_walkin_issue            NEW, BEFORE INSERT OR UPDATE
--                                                    OF outbound_issue_id
--
-- THE RULE IS 0074's, WORD FOR WORD. A walk-in sale is an outbound issue whose
-- issue_mode is 'direct_client' (0067). The error is the same errcode P0001 and
-- the same text with `direct_client` in it, so refusal() in
-- lib/data/facturare-actions.ts shows the same Romanian sentence.
--
-- EXISTING ROWS ARE NOT READ, CHANGED OR CANCELLED. The trigger acts on an INSERT,
-- and on an UPDATE only when outbound_issue_id actually changes to a new value. An
-- invoice that already names a walk-in issue, if one exists, stays editable in
-- every other column exactly as before.
--
-- SECURITY DEFINER, ON PURPOSE. The read of outbound_issues must not depend on
-- what the caller may see: under SECURITY INVOKER a future narrowing of
-- outbound_issues_select would let a walk-in issue hide from the check and pass.
-- The function reads one column of one row and writes nothing. Nobody calls it
-- directly; execute is revoked from public, anon and authenticated, which does
-- not stop the trigger, because PostgreSQL checks EXECUTE on a trigger function
-- only when the trigger is created.
--
-- WHAT IT DOES NOT CHANGE. public.save_invoice_draft, every policy on invoices,
-- invoices_require_draft_to_edit, the numbering and the one-live-invoice index.
-- A project issue and an invoice with no issue save exactly as before.
--
-- WHAT IT REMOVES: nothing. There is NO DROP TABLE, NO TRUNCATE, NO DELETE and NO
-- UPDATE or INSERT of an existing row anywhere in this file. The one
-- `drop trigger if exists` is the re-runnable shape 0063 and 0064 use, followed
-- immediately by the create.
--
-- MERGE IS APPLY. Merging this file applies it to the PRODUCTION database within
-- about two minutes, through the Supabase GitHub app (CLAUDE.md 8.0, ruling
-- R-124). Nothing the deployed build sends changes shape, so nothing breaks in
-- that window.
--
-- IT RUNS AS ONE TRANSACTION and is safe to run twice. Section 3 checks the
-- result on every run.
--
-- PROVEN BEFORE MERGE by `npm run check:migrations`, which applies it unmodified
-- to a throwaway postgres and runs
-- scripts/poc-free/local-db/assertions/0078_invoices_refuse_walkin_issue.sql,
-- and on the local Supabase stack by tests/e2e/facturare-walkin-refused.spec.ts.

begin;


-- ===========================================================================
-- 1. THE CHECK
-- ===========================================================================

create or replace function public.invoices_refuse_walkin_issue()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.outbound_issue_id is null then
    return new;
  end if;

  -- AN UPDATE THAT KEEPS THE SAME ISSUE IS NOT A NEW TIE, so an existing row
  -- stays editable. Read the header.
  if tg_op = 'UPDATE' and new.outbound_issue_id is not distinct from old.outbound_issue_id then
    return new;
  end if;

  if exists (
    select 1
    from public.outbound_issues oi
    where oi.id = new.outbound_issue_id
      and oi.issue_mode = 'direct_client'
  ) then
    raise exception
      'iesirea % este o vanzare directa (direct_client) si nu se factureaza: banii se incaseaza in afara sistemului',
      new.outbound_issue_id
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.invoices_refuse_walkin_issue() is
  'P3-212. BEFORE INSERT OR UPDATE OF outbound_issue_id on public.invoices: refuses, with P0001 and direct_client in the text, a row that newly ties an invoice to an outbound issue whose issue_mode is direct_client, a walk-in sale, which is never invoiced (ruling R-215). The same refusal as public.save_invoice_draft (0074), now also for a direct insert or update of the table. An update that keeps the same issue is not checked, so existing rows stay editable.';

revoke all on function public.invoices_refuse_walkin_issue() from public;
revoke all on function public.invoices_refuse_walkin_issue() from anon;
revoke all on function public.invoices_refuse_walkin_issue() from authenticated;


-- ===========================================================================
-- 2. THE TRIGGER
-- ===========================================================================
--
-- `update of outbound_issue_id` fires whenever the column is in the SET list,
-- changed or not; the function's second branch lets an unchanged value through.

drop trigger if exists invoices_refuse_walkin_issue on public.invoices;
create trigger invoices_refuse_walkin_issue
  before insert or update of outbound_issue_id on public.invoices
  for each row execute function public.invoices_refuse_walkin_issue();


-- ===========================================================================
-- 3. THE RESULT, CHECKED
-- ===========================================================================

do $$
declare
  n integer;
begin
  select count(*) into n
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relname = 'invoices'
    and t.tgname = 'invoices_refuse_walkin_issue'
    and not t.tgisinternal
    and t.tgenabled = 'O';
  if n <> 1 then
    raise exception 'P3-212: trigger invoices_refuse_walkin_issue is missing or disabled on public.invoices';
  end if;

  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'invoices_refuse_walkin_issue'
    and p.prosecdef
    and pg_get_functiondef(p.oid) like '%issue_mode = ''direct_client''%';
  if n <> 1 then
    raise exception 'P3-212: public.invoices_refuse_walkin_issue is missing, not SECURITY DEFINER, or does not check direct_client';
  end if;

  if has_function_privilege('authenticated', 'public.invoices_refuse_walkin_issue()', 'EXECUTE')
     or has_function_privilege('anon', 'public.invoices_refuse_walkin_issue()', 'EXECUTE') then
    raise exception 'P3-212: public.invoices_refuse_walkin_issue may be executed directly by a client role';
  end if;
end
$$;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect one row: the trigger, BEFORE INSERT OR UPDATE OF outbound_issue_id.

select t.tgname as trigger_name, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace ns on ns.oid = c.relnamespace
where ns.nspname = 'public'
  and c.relname = 'invoices'
  and t.tgname = 'invoices_refuse_walkin_issue';
