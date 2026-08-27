-- 0011_extraction_confirm_corrections.sql
-- RC Inventory phase 2, card P2-09. Two corrections to 0010.
--
-- Applied by EXECUTOR under ruling R-012. Runs as one transaction.
-- Contains no DROP TABLE, no TRUNCATE and no DELETE.
--
-- ONE NEAR-MISS, NAMED RATHER THAN BURIED: this file contains a
-- `drop constraint`. CLAUDE.md 8.6 names three statements that are never
-- auto-applied, `DROP TABLE`, `TRUNCATE` and `DELETE`, and a constraint drop is
-- none of them: it removes a CHECK expression and no row. It is called out here
-- and in the PR so the owner can rule otherwise if he reads the rule wider than
-- it is written. Relaxing a CHECK cannot be done any other way; a constraint is
-- replaced, never edited.
--
-- ===========================================================================
-- CORRECTION 1: A REFERENTIAL ACTION COULD BREAK 0010's OWN CHECK CONSTRAINT
-- ===========================================================================
--
-- 0010 added three columns and this constraint:
--
--     check ((confirmed_inbound_order_id is null and confirmed_at is null)
--         or (confirmed_inbound_order_id is not null and confirmed_at is not null))
--
-- The intent was right: a row must not claim to have produced an order without
-- saying when. The expression is wrong, because the column it constrains can be
-- changed by something other than the application. `confirmed_inbound_order_id`
-- carries `on delete set null`, so deleting an inbound order NULLs the column
-- on every draft pointing at it while `confirmed_at` stays. That is a row the
-- constraint calls impossible, so the delete fails with 23514 and takes its
-- whole transaction with it.
--
-- THIS IS NOT HYPOTHETICAL. `scripts/reset-test-data.sql`, which P2-15 hands to
-- the owner to run against production before the first real data, deletes from
-- `public.inbound_orders`. Once any draft has been confirmed against an order
-- in that set, the reset would have rolled back on a check violation, in the
-- SQL editor, with the owner watching, and the file is parsed rather than
-- executed in CI so nothing would have caught it first.
--
-- The corrected expression keeps the whole of the intent and survives the
-- referential action: a row that names an order must carry a time, and a row
-- whose order was deleted keeps the time, which is honest. The draft WAS
-- confirmed. The order it became is gone.
--
-- ===========================================================================
-- CORRECTION 2: confirmed_at IS THE FACT, THE FOREIGN KEY IS ONLY A POINTER
-- ===========================================================================
--
-- For the same reason, "has this draft been confirmed" must not be asked of a
-- column a delete elsewhere can null. 0010's function guarded on
-- `confirmed_inbound_order_id is not null`, and the review list filtered on the
-- same column. After an order deletion the draft would have reappeared in the
-- review list and could have been confirmed a second time, minting a second
-- order from one document, which is exactly the duplicate the whole idempotency
-- design exists to prevent. Both now read `confirmed_at`, which nothing but a
-- confirm ever writes.
--
-- ===========================================================================
-- CORRECTION 3: THE FUNCTION WAS EXECUTABLE BY anon, THROUGH PUBLIC
-- ===========================================================================
--
-- Same class as the defect 0009 corrected on 0008's tables, arriving through a
-- different door. 0008 left `anon` holding SELECT because Supabase grants at
-- CREATE TABLE time. 0010 left `anon` holding EXECUTE because PostgreSQL grants
-- EXECUTE to `PUBLIC` at CREATE FUNCTION time, and `anon` is a member of
-- `PUBLIC`. 0009's `alter default privileges ... revoke all on functions from
-- anon` does not close it: revoking from a role by name does not touch what
-- that role holds through PUBLIC.
--
-- Nothing was reachable. The function is SECURITY INVOKER, so an anonymous
-- caller running it would be refused by both the table grants (0009 revoked
-- them) and by RLS (every policy is `to authenticated`). As with 0008, the
-- missing layer was the first of two and the second was holding.
--
-- The durable fix is the same shape 0009 used: fix what exists, then change the
-- default so the next CREATE FUNCTION cannot reintroduce it. Every function in
-- this schema that is called from the application already carries an explicit
-- `grant execute ... to authenticated` (0001, 0003, 0004, 0006), and
-- `confirm_extraction_draft` is granted below, so removing PUBLIC's blanket
-- takes nothing away from anybody who is supposed to have it.
--
-- set_updated_at is the one function with no explicit grant, and it needs none:
-- it is a trigger function, and PostgreSQL checks EXECUTE on a trigger function
-- when the trigger is CREATED, not when it fires.

begin;

-- ===========================================================================
-- 1. THE CHECK CONSTRAINT, REPLACED
-- ===========================================================================

alter table public.extraction_drafts
  drop constraint extraction_drafts_confirmed_pair;

alter table public.extraction_drafts
  add constraint extraction_drafts_confirmed_pair check (
    confirmed_inbound_order_id is null or confirmed_at is not null
  );

comment on column public.extraction_drafts.confirmed_at is
  'When this draft was consumed into an inbound order. THIS is the fact that a draft has been confirmed, and nothing but a confirm ever writes it. confirmed_inbound_order_id is a pointer to the order and carries on delete set null, so it can become null again while this column stays; every check for "already confirmed" reads this one.';


-- ===========================================================================
-- 2. THE FUNCTION, WITH ITS GUARD READING confirmed_at
-- ===========================================================================
--
-- Replaced whole rather than patched, because a function is replaced by
-- definition and a reader should see the body that runs without holding two
-- files side by side. Everything except the guard is 0010's body unchanged.

create or replace function public.confirm_extraction_draft(
  p_order_id      uuid,
  p_reference     text,
  p_supplier_name text,
  p_currency      public.currency_code,
  p_ordered_at    date,
  p_expected_at   date,
  p_total_mdl     numeric,
  p_lines         jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_draft      public.extraction_drafts%rowtype;
  v_order_id   uuid;
  v_line_count int;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Comanda trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  -- FOR UPDATE serialises two operators pressing confirm at the same moment.
  -- The second waits, then sees confirmed_at set and refuses.
  select * into v_draft
  from public.extraction_drafts
  where order_id = p_order_id
  for update;

  if not found then
    raise exception 'Ciorna nu mai există.' using errcode = 'P0002';
  end if;

  -- confirmed_at, not the foreign key. See the header, correction 2.
  if v_draft.confirmed_at is not null then
    raise exception 'Ciorna a fost deja confirmată.' using errcode = 'P0002';
  end if;

  if v_draft.status is null or v_draft.status = 'failed' then
    raise exception 'Documentul nu are date extrase de confirmat.' using errcode = 'P0001';
  end if;

  insert into public.inbound_orders
    (reference, supplier_name, currency, ordered_at, expected_at, total_mdl, status, created_by,
     document_path, document_uploaded_at)
  values
    (p_reference, p_supplier_name, p_currency, p_ordered_at, p_expected_at,
     coalesce(p_total_mdl, 0), 'pending_arrival', auth.uid(),
     v_draft.document_path, v_draft.callback_at)
  returning id into v_order_id;

  insert into public.order_lines (inbound_order_id, product_id, quantity, unit_price)
  select
    v_order_id,
    (line ->> 'product_id')::uuid,
    (line ->> 'quantity')::numeric,
    nullif(line ->> 'unit_price', '')::numeric
  from jsonb_array_elements(p_lines) as line;

  get diagnostics v_line_count = row_count;
  if v_line_count = 0 then
    raise exception 'Comanda trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by)
  values
    ('inbound_order', v_order_id, null, 'pending_arrival',
     'Comandă creată din document extras automat, verificat de operator.', auth.uid());

  update public.extraction_drafts
     set confirmed_inbound_order_id = v_order_id,
         confirmed_at               = now(),
         confirmed_by               = auth.uid()
   where order_id = p_order_id;

  return v_order_id;
end;
$$;

comment on function public.confirm_extraction_draft is
  'Turns a reviewed extraction draft into a real inbound order: the order, its lines, its first status_history row and the draft being marked consumed, all in one transaction. SECURITY INVOKER: RLS still applies. Refuses a draft whose confirmed_at is already set, and a draft with nothing extracted.';


-- ===========================================================================
-- 3. GRANTS, EXPLICIT AND WITHOUT PUBLIC
-- ===========================================================================

grant execute on function public.confirm_extraction_draft(
  uuid, text, text, public.currency_code, date, date, numeric, jsonb
) to authenticated;

grant execute on function public.confirm_extraction_draft(
  uuid, text, text, public.currency_code, date, date, numeric, jsonb
) to service_role;

-- What exists now.
revoke execute on all functions in schema public from public;

-- And what stops it recurring at 0012.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs after COMMIT.
--
-- Expect: anon_can_execute false on every row, authenticated_can_execute true
-- on every function the application calls, and set_updated_at false, which is
-- correct because it is only ever reached through a trigger.

select
  p.proname,
  has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role',  p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- And the corrected constraint, so its expression is in the journal.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.extraction_drafts'::regclass
  and conname = 'extraction_drafts_confirmed_pair';
