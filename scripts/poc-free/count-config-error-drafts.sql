-- count-config-error-drafts.sql
-- RC Inventory phase 3, card P3-87. Ivan's finding F21, part 2. The totals only,
-- for the same rows list-config-error-drafts.sql lists one by one.
--
-- READ ONLY. ONE SELECT. It changes nothing, adds nothing and removes nothing.
--
-- WHO RUNS IT: Max, the platform owner, by hand, in the Supabase SQL editor of
-- project RC_inventory. NO TERMINAL RUNS THIS FILE, ever. What each number means:
-- docs/reports/2026-09-21-author-config-error-drafts.md, section (d).
--
-- Same rows as the list: failed because MAKE_WEBHOOK_URL was missing, no date
-- filter. Never reads the extracted content or the extracted lines.

select
  count(*)                                                                        as total,
  count(*) filter (where o.id is null)                                            as review_lane,
  count(*) filter (where o.id is not null)                                        as order_lane,
  count(*) filter (where d.confirmed_at is not null)                              as confirmed,
  count(*) filter (where d.cancelled_at is not null)                              as dismissed,
  count(*) filter (where o.id is null and d.confirmed_at is null and d.cancelled_at is null)
                                                                                  as review_lane_still_open,
  count(*) filter (where o.id is not null and d.confirmed_at is null and d.cancelled_at is null)
                                                                                  as order_lane_still_open,
  min(coalesce(d.fired_at, d.created_at))                                         as first_uploaded_at,
  max(coalesce(d.fired_at, d.created_at))                                         as last_uploaded_at
from public.extraction_drafts d
left join public.inbound_orders o on o.id = d.order_id
where d.status = 'failed'
  and (
    d.error_code = 'config_error'
    or (d.error_code = 'download_failed' and d.reason like 'Variabila de mediu MAKE_WEBHOOK_URL%')
  )
