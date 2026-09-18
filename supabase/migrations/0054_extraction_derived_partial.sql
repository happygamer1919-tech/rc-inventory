-- 0054_extraction_derived_partial.sql
-- RC Inventory phase 3, card P3-80, Ivan's finding F6:
--
--   "F6 `line_total_source` = derived routes the document to partial by itself,
--    in our reconciliation."
--
-- WHAT CHANGES. From card P3-80 the callback route stores a payload the sender
-- marked `extracted`, with no error_code, as `partial` when at least one line
-- declares line_total_source = 'derived': a total the reader worked out rather
-- than read off the page. The rule is derivedLineRoute in
-- lib/data/reconciliation.ts. The counterparty's own extractor already fails
-- such a document on his side (decisions/inbox.md, the R-185 amendment, part g).
--
-- WHY A COLUMN. Ruling R-190: our verdict is recorded, never silently
-- substituted. The sender said `extracted` and we store `partial`; without a
-- record of the move nobody could later tell our partial from his. This column
-- is that record.
--
-- NOT platform_arm. 0037 constrains platform_arm to the six arms of the EXT-23
-- split and says a seventh arm is a decision about what classifyScan can
-- conclude. This rule is not a classifyScan arm: it runs after classification,
-- separately, the same way P3-75's per-line check does, and like P3-75 it gets
-- its own column with the platform_ prefix EXT-26 gave our own verdict.
--
-- THREE VALUES, AND NULL IS ONE OF THEM ON PURPOSE:
--   true    the rule moved the status from extracted to partial
--   false   the rule ran and did not move it
--   NULL    the rule did not run: every row written before this migration
--
-- NULLABLE, NO DEFAULT. A default would rewrite every existing row into a claim
-- nobody made, exactly the reason 0037 and 0052 carry none.
--
-- ADDITIVE ONLY. One add column if not exists and one comment. No existing row
-- is updated, nothing is dropped, nothing is deleted.

begin;

alter table public.extraction_drafts
  add column if not exists platform_derived_partial boolean;

comment on column public.extraction_drafts.platform_derived_partial is
  'P3-80. true when OUR rule moved a sender extracted payload with no error_code to partial because at least one line declared line_total_source derived; false when the rule ran and moved nothing; NULL when it did not run. Recorded, never silently substituted, ruling R-190.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect one nullable boolean column with no default.

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'extraction_drafts'
  and column_name = 'platform_derived_partial';
