-- list-config-error-drafts.sql
-- RC Inventory phase 3, card P3-87. Ivan's finding F21, part 2, as changed by
-- his addendum of 2026-09-21: these documents are NOT sent for reading again.
--
-- READ ONLY. ONE SELECT. It changes nothing, adds nothing and removes nothing.
--
-- WHO RUNS IT: Max, the platform owner, by hand, in the Supabase SQL editor of
-- project RC_inventory. NO TERMINAL RUNS THIS FILE, ever: no terminal holds a
-- production credential. Step by step, and what every column means:
-- docs/reports/2026-09-21-author-config-error-drafts.md, section (d).
--
-- WHAT IT LISTS. Every extraction draft that failed because the setting
-- MAKE_WEBHOOK_URL was missing, so the document was stored and never read:
--   * error_code config_error, written from card P3-71 (migration 0051) onward;
--   * error_code download_failed with the same missing-setting reason, which is
--     what a "Retrimite" press wrote before P3-71, and what any refusal wrote in
--     the two minutes between the P3-71 merge and 0051 reaching the database.
-- An upload made BEFORE P3-71 through the upload screen or the order screen left
-- NO draft row at all, so no query can find it here. See the report, section (f).
--
-- NO DATE FILTER, on purpose: read the dates in the uploaded_at column. A date
-- filter could hide a row.
--
-- Never selects the extracted content (meta) or the extracted lines.

select
  d.order_id                                   as draft_id,
  d.document_filename                          as file_name,
  coalesce(d.fired_at, d.created_at)           as uploaded_at,
  d.created_by                                 as uploaded_by,
  d.document_path                              as stored_at_path,
  d.status                                     as status,
  d.error_code                                 as error_code,
  d.reason                                     as reason,
  case
    when o.id is not null then 'ORDER LANE: attached to an existing order, not on the review screen'
    else 'REVIEW LANE: uploaded on Incarca comanda, on the review screen'
  end                                          as lane,
  o.reference                                  as attached_to_order,
  (d.confirmed_at is not null)                 as was_confirmed,
  d.confirmed_at                               as confirmed_at,
  d.confirmed_inbound_order_id                 as confirmed_into_order_id,
  c.reference                                  as confirmed_into_order,
  (d.cancelled_at is not null)                 as is_dismissed,
  d.cancelled_at                               as dismissed_at,
  d.cancel_reason                              as dismiss_reason
from public.extraction_drafts d
left join public.inbound_orders o on o.id = d.order_id
left join public.inbound_orders c on c.id = d.confirmed_inbound_order_id
where d.status = 'failed'
  and (
    d.error_code = 'config_error'
    or (d.error_code = 'download_failed' and d.reason like 'Variabila de mediu MAKE_WEBHOOK_URL%')
  )
order by coalesce(d.fired_at, d.created_at) asc, d.order_id asc
