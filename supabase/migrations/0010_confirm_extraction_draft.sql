-- 0010_confirm_extraction_draft.sql
-- RC Inventory phase 2, card P2-09. Confirming a reviewed extraction draft.
--
-- Runs as one transaction. Contains no DROP, no TRUNCATE and no DELETE.
--
-- THE AMBIGUITY MIGRATION 0008 DEFERRED IS SETTLED HERE, DELIBERATELY.
--
-- 0008's header recorded it in full: extraction_drafts.order_id carries no
-- foreign key because P2-08a's upload lane attaches a document to an inbound
-- order that already exists, so the value happens to be an inbound_orders.id,
-- while P2-09's acceptance says confirm CREATES the real inbound order, which
-- reads the other way. 0008 refused to settle it by accident. This file settles
-- it on purpose:
--
--   order_id IS THE EXTRACTION IDEMPOTENCY KEY AND NOTHING ELSE.
--
-- It is minted when a document enters the extraction lane and it names an
-- extraction, never an order. A draft becomes an order at confirm, and the
-- order it became is recorded on the draft in confirmed_inbound_order_id.
--
-- A draft whose order_id already names an existing inbound_orders row came from
-- the OTHER lane: the operator typed the order first and attached the document
-- to it. That order exists, so there is nothing to confirm, and the review list
-- excludes those rows rather than offering to create a duplicate.
--
-- "CONSUMED" IS MARKED, NOT DELETED, AND THAT IS THE STRONGER READING.
--
-- The card says the draft is consumed rather than left behind. Deleting it
-- would satisfy the sentence and destroy the evidence: _meta exists so that a
-- wrong extraction can be explained rather than argued about, and an extraction
-- deleted at the moment it turned into stock is exactly the one anybody would
-- later want to read. A consumed draft leaves the review list, points at the
-- order it became, and cannot be confirmed a second time. Nothing is left
-- behind and nothing is thrown away.
--
-- It also keeps this file free of a DELETE statement, which CLAUDE.md 8.6 would
-- otherwise make un-appliable without an owner sitting in front of it.

begin;

-- ===========================================================================
-- 1. WHAT A CONSUMED DRAFT CARRIES
-- ===========================================================================

alter table public.extraction_drafts
  add column confirmed_inbound_order_id uuid
    references public.inbound_orders (id) on delete set null,
  add column confirmed_at timestamptz,
  add column confirmed_by uuid references auth.users (id) on delete set null;

-- Every foreign key gets an index on the referencing side, same rule as 0001.
create index extraction_drafts_confirmed_order_idx
  on public.extraction_drafts (confirmed_inbound_order_id);

-- The two fields move together or the row is lying about its own history.
alter table public.extraction_drafts
  add constraint extraction_drafts_confirmed_pair check (
    (confirmed_inbound_order_id is null and confirmed_at is null)
    or (confirmed_inbound_order_id is not null and confirmed_at is not null)
  );

comment on column public.extraction_drafts.confirmed_inbound_order_id is
  'The inbound order this draft became, set at confirm. Null means the draft is still awaiting review. This column is what makes order_id purely an extraction key: the draft names the order it produced, the order never borrows the draft key.';


-- ===========================================================================
-- 2. CONFIRM, IN ONE TRANSACTION
-- ===========================================================================
--
-- Over PostgREST, creating the order, writing its lines, writing its first
-- history row and marking the draft consumed would be four calls and four
-- transactions. A failure between any two of them leaves a state the
-- application believes impossible: an order with no lines, or a draft that
-- produced an order nobody can find. Same reasoning as 0003.
--
-- SECURITY INVOKER, so RLS still decides who may write.

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
  -- The second waits, then sees confirmed_inbound_order_id set and refuses.
  select * into v_draft
  from public.extraction_drafts
  where order_id = p_order_id
  for update;

  if not found then
    raise exception 'Ciorna nu mai există.' using errcode = 'P0002';
  end if;

  if v_draft.confirmed_inbound_order_id is not null then
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

  -- Same rule as 0003: the first status change writes history too, and the note
  -- says where the order came from, because an order created from a document is
  -- a different provenance from one typed by hand.
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
  'Turns a reviewed extraction draft into a real inbound order: the order, its lines, its first status_history row and the draft being marked consumed, all in one transaction. SECURITY INVOKER: RLS still applies. Refuses a draft already confirmed and a draft with nothing extracted.';

commit;
