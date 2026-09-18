-- 0052_extraction_line_math.sql
-- RC Inventory phase 3, card P3-75, Ivan's finding F7:
--
--   "a line whose line_total is right but quantity x unit price disagrees is
--    caught, on every shape."
--
-- WHAT WAS MISSING. The reconciliation compares the SUM of line_total against a
-- printed total. Nothing compared one line's own quantity * unit_price against
-- its own line_total, so two lines wrong in opposite directions by the same
-- amount passed every check the platform has.
--
-- WHAT THIS STORES, AND WHOSE IT IS. Our own per-line finding, computed by
-- lineMathConsistency in lib/data/reconciliation.ts. It follows ruling R-190's
-- shape exactly as 0037 did: RECORDED, NEVER SUBSTITUTED. Nothing here is read
-- back into status, error_code, which lines are kept, or what the callback
-- route answers. The platform_ prefix is the one 0037 gave our own verdict, so
-- a reader sees at once that the column is our finding and not the document's.
--
-- NOT A NEW error_code. error_code is one document-level field and R-190 makes
-- it the sender's. A per-line disagreement is a different granularity, and a
-- code would also be a value Andre has never been told about.
--
-- THREE COLUMNS:
--   extraction_draft_lines.platform_math_outcome   passed | failed | not_run
--   extraction_draft_lines.platform_math_diff      |round2(q * p) - round2(total)|
--   extraction_drafts.platform_line_math_failed    how many lines failed
--
-- The document-level count exists because a scan our reconciliation stores as
-- failed has its lines dropped under EXT-15; without it a disagreement on that
-- shape would be recorded nowhere.
--
-- ALL NULLABLE, NO DEFAULT. NULL means our check did not run: every row written
-- before this migration genuinely does not know, and a default would rewrite it
-- into a claim nobody made. `not_run` is different and deliberate: the check ran
-- and the line lacked quantity, unit_price or line_total. On the document, NULL
-- also covers "no line could be checked", because not_run is not passed.
--
-- ADDITIVE ONLY. Three add column if not exists, each with its own check. No
-- existing row is updated, nothing is dropped, nothing is deleted.

begin;

alter table public.extraction_draft_lines
  add column if not exists platform_math_outcome text
    constraint extraction_draft_lines_platform_math_outcome_known
    check (platform_math_outcome is null or platform_math_outcome in ('passed', 'failed', 'not_run'));

alter table public.extraction_draft_lines
  add column if not exists platform_math_diff numeric
    constraint extraction_draft_lines_platform_math_diff_nonnegative
    check (platform_math_diff is null or platform_math_diff >= 0);

alter table public.extraction_drafts
  add column if not exists platform_line_math_failed integer
    constraint extraction_drafts_platform_line_math_failed_nonnegative
    check (platform_line_math_failed is null or platform_line_math_failed >= 0);

comment on column public.extraction_draft_lines.platform_math_outcome is
  'P3-75. OUR check of quantity * unit_price against this line''s own line_total: passed, failed, or not_run when a figure was missing. Recorded, never substituted, ruling R-190. NULL means the check did not run on this row.';

comment on column public.extraction_draft_lines.platform_math_diff is
  'P3-75. abs(round2(quantity * unit_price) - round2(line_total)). NULL exactly when platform_math_outcome is not_run or NULL.';

comment on column public.extraction_drafts.platform_line_math_failed is
  'P3-75. How many lines of this payload failed OUR per-line arithmetic check, kept even when the lines are dropped. NULL means no line could be checked. Never substituted for status or error_code, ruling R-190.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect three nullable columns with no default, and three check constraints.

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'extraction_draft_lines' and column_name in ('platform_math_outcome', 'platform_math_diff'))
    or (table_name = 'extraction_drafts' and column_name = 'platform_line_math_failed')
  )
order by table_name, column_name;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname in (
  'extraction_draft_lines_platform_math_outcome_known',
  'extraction_draft_lines_platform_math_diff_nonnegative',
  'extraction_drafts_platform_line_math_failed_nonnegative'
)
order by conname;
