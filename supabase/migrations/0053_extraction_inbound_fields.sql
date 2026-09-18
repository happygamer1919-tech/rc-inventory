-- 0053_extraction_inbound_fields.sql
-- RC Inventory phase 3, card EXT-34, Ivan's finding F4, approved by the
-- platform owner on 2026-09-18 ("F4 approved").
--
-- WHAT WAS MISSING. The reading service already sends five fields the callback
-- route accepts and throws away:
--
--   on the document   document_type, client_ref
--   on each line      supplier_code, description, line_total_source
--
-- lib/data/callback-keys.mjs has listed them as "known, read by nothing" since
-- P3-76, so they raise no warning and land nowhere. This file gives each one a
-- column; the route writes them behind hasExtractionInboundFields.
--
-- STORED, NOT INTERPRETED. The card's defaults say it in terms: no set for
-- document_type, no matching of client_ref to a client, no use of supplier_code
-- for product matching. Each would be a separate card. So every column is plain
-- text with NO CHECK CONSTRAINT.
--
-- line_total_source IS STORED AS SENT, NOT ENFORCED HERE. The counterparty sends
-- `printed` or `derived` on every line. A check constraint on those two values
-- would turn a third value into a 23514 on insert, a 500 from the route and a
-- Make retry loop: INC-05 in a new shape. Using the field in our own
-- reconciliation is G28's F6 and a separate card.
--
-- ALL NULLABLE, NO DEFAULT. NULL means the sender did not say. Every row
-- written before this migration genuinely does not know, and a default would
-- rewrite it into a claim nobody made. An empty string never reaches a column:
-- the route reads each field through str(), which makes it NULL.
--
-- client_ref IS NOT order_ref. 0036 added the SUPPLIER's own document number and
-- series and said in its header that client_ref was left alone. This is that
-- column: the reference the CLIENT's side printed on the document, verbatim.
--
-- ADDITIVE ONLY. Five add column if not exists. No existing row is updated,
-- nothing is dropped, nothing is deleted.

begin;

alter table public.extraction_drafts
  add column if not exists document_type text;

alter table public.extraction_drafts
  add column if not exists client_ref text;

alter table public.extraction_draft_lines
  add column if not exists supplier_code text;

alter table public.extraction_draft_lines
  add column if not exists description text;

alter table public.extraction_draft_lines
  add column if not exists line_total_source text;

comment on column public.extraction_drafts.document_type is
  'EXT-34. The kind of document as the reading service reported it, verbatim, for example invoice. Stored, not interpreted: no set of allowed values. NULL means the sender did not say.';

comment on column public.extraction_drafts.client_ref is
  'EXT-34. The client''s own reference as printed on the document, verbatim. Not matched to any client. Different from order_ref, which is the supplier''s document number. NULL means the sender did not say.';

comment on column public.extraction_draft_lines.supplier_code is
  'EXT-34. The supplier''s own product code for this line, verbatim. Not used for product matching. NULL means the sender did not say.';

comment on column public.extraction_draft_lines.description is
  'EXT-34. The line''s description as the reading service reported it, verbatim, beside product_name. NULL means the sender did not say.';

comment on column public.extraction_draft_lines.line_total_source is
  'EXT-34. Whether the sender read this line''s total from the page (printed) or worked it out (derived), stored as sent with no check. Not read by any reconciliation rule. NULL means the sender did not say.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect five text columns, all nullable, none carrying a default.

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'extraction_drafts' and column_name in ('document_type', 'client_ref'))
    or (table_name = 'extraction_draft_lines' and column_name in ('supplier_code', 'description', 'line_total_source'))
  )
order by table_name, column_name;
