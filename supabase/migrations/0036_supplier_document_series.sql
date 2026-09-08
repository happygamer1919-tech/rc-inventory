-- 0036_supplier_document_series.sql
-- RC Inventory phase 3, card EXT-11. The supplier's own document reference,
-- kept as TWO facts: the series and the number.
--
-- THE OWNER'S WORDS, RELAYING ANDRE: "TG 0009312, not 0009312. The series is
-- part of the identifier in Moldovan invoicing; two suppliers can both issue
-- number 0009312."
--
-- WHY THIS FILE CREATES order_ref AS WELL AS THE SERIES, WHICH THE CARD DID NOT
-- ASK FOR IN THOSE WORDS.
--
-- The card's acceptance says "wherever order_ref is stored, on orders and on
-- extraction drafts". The answer, checked before this file was written, is
-- NOWHERE. `grep -rn order_ref supabase/migrations/` finds nothing.
-- extraction_drafts has no such column, inbound_orders.reference is OUR
-- reference under its own unique constraint, and section 4.1a of
-- docs/contracts/extraction-v2.md says in terms that `order_ref` arrives from
-- Andre, is accepted and is IGNORED. P3-31 assumes the column exists too and
-- has not shipped. Two cards each built on a field the other was assumed to
-- have landed.
--
-- A series with nothing to qualify is not an identifier, so the pair lands
-- together. client_ref is NOT touched: this card's defaults say so in the
-- owner's words, and it stays P3-31's.
--
-- TWO COLUMNS AND NOT ONE CONCATENATED STRING. `TG 0009312` written into one
-- column is two facts glued at write time, and nothing can pull them apart
-- afterwards: a screen that wants them together can join two columns, and a
-- lookup by number cannot unglue what was concatenated. The e2e case asserts
-- the number does not contain the series for exactly this reason.
--
-- BOTH NULLABLE, NO DEFAULT, AND THE ABSENCE OF EITHER IS NOT AN ERROR. Not
-- every document carries a series, and a document without one is not a
-- malformed document. Rows that predate this migration genuinely do not know
-- their supplier reference, and a default would rewrite them into a claim
-- nobody made.
--
-- NO UNIQUE CONSTRAINT, DELIBERATELY. The pair is what the supplier printed,
-- read by a model, corrected by an operator. A uniqueness rule on it would turn
-- a misread series into a refusal to record a real delivery, and the collision
-- this card exists to make VISIBLE would become an outage instead. Making the
-- identifier complete is this card; deciding what to do when two are equal is
-- not, and is not decided here by a constraint nobody wrote down.

begin;

alter table public.extraction_drafts
  add column if not exists order_ref text;

alter table public.extraction_drafts
  add column if not exists order_ref_series text;

alter table public.inbound_orders
  add column if not exists order_ref text;

alter table public.inbound_orders
  add column if not exists order_ref_series text;

comment on column public.extraction_drafts.order_ref is
  'EXT-11. The NUMBER of the supplier''s own document, verbatim as printed. Ours is inbound_orders.reference and is a different thing. NULL means the extractor did not report one.';

comment on column public.extraction_drafts.order_ref_series is
  'EXT-11. The SERIES of the supplier''s own document: the letter code printed before the number. In Moldovan invoicing it is part of the identifier, because two suppliers can both issue 0009312. NULL is legal: not every document carries one.';

comment on column public.inbound_orders.order_ref is
  'EXT-11. The NUMBER of the supplier''s own document, carried across at confirmation. inbound_orders.reference stays OUR reference and keeps its own unique constraint.';

comment on column public.inbound_orders.order_ref_series is
  'EXT-11. The SERIES of the supplier''s own document, carried across at confirmation. NULL is legal.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect four columns, all nullable, none carrying a default, and
-- inbound_orders.reference untouched with its unique constraint still in place.

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('extraction_drafts', 'inbound_orders')
  and column_name in ('order_ref', 'order_ref_series')
order by table_name, column_name;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.inbound_orders'::regclass
  and contype = 'u';
