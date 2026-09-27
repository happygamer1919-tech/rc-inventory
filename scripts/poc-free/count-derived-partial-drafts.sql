-- count-derived-partial-drafts.sql
-- RC Inventory phase 3, card P3-106. Goal G63, Ivan's finding F27. The answer to
-- ONE question: has the platform ever marked a document partial by itself,
-- because a reader calculated the total of at least one line?
--
-- READ ONLY. ONE SELECT. It changes nothing, adds nothing and removes nothing.
--
-- WHO RUNS IT: Max, the platform owner, by hand, in the Supabase SQL editor of
-- project RC_inventory. NO TERMINAL RUNS THIS FILE, ever. This machine has no
-- production credentials and may not fetch any. What each number means:
-- docs/reports/2026-09-27-executor-g63-derived-partial-proof.md, the section for
-- Ivan.
--
-- WHAT IT READS: the stored column extraction_drafts.platform_derived_partial,
-- which migration 0054 added and which is true on exactly the documents the
-- sender called `extracted` and the platform stored `partial`. It never reads the
-- extracted content, the extracted lines, or any client record.
--
-- HOW TO READ THE ANSWER. `total` is zero today and is expected to stay zero
-- until Andre sends such a document. `from_test_fixtures` counts the rows our own
-- end-to-end suite writes, whose supplier name is prefixed TEST. A number in
-- `from_real_documents` is the production proof F27 asks for, and it is the row
-- worth opening on the review screen: it carries the Romanian sentence
-- "Marcat parțial de platformă: ...".

select
  count(*)                                                                        as total,
  count(*) filter (where d.supplier_name like 'TEST %')                           as from_test_fixtures,
  count(*) filter (where d.supplier_name is null or d.supplier_name not like 'TEST %')
                                                                                  as from_real_documents,
  count(*) filter (where d.status = 'partial')                                    as still_partial,
  count(*) filter (where d.confirmed_at is not null)                              as confirmed_since,
  count(*) filter (where d.cancelled_at is not null)                              as dismissed_since,
  min(coalesce(d.callback_at, d.created_at))                                      as first_seen_at,
  max(coalesce(d.callback_at, d.created_at))                                      as last_seen_at
from public.extraction_drafts d
where d.platform_derived_partial is true
