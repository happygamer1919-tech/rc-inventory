-- 0041_extraction_partial_error_code_optional.sql
-- RC Inventory phase 3, card P3-29a.
--
-- WHAT THIS IS FOR. A `partial` is a success-shaped response: the document was
-- read, something in it did not reconcile, and the extractor describes the delta
-- in `reason`. That is a result with a caveat, not an error with a code. Migration
-- 0008 made error_code mandatory on `partial` as well as on `failed`, so every
-- partial the extractor sends without inventing a code was refused.
--
-- THE RULE AFTER THIS FILE:
--
--   status      error_code
--   failed      required     unchanged from 0008
--   partial     optional     THE ONLY CHANGE
--   extracted   forbidden    unchanged from 0008
--   null        anything     unchanged from 0008: fired, not yet answered
--
-- FAILED KEEPS ITS CODE. 0008's comment still holds for it: a failure that omits
-- the reason for its own failure is refused by the database.
--
-- THE ROUTE MOVES IN THE SAME PULL REQUEST, AND IT HAS TO.
-- app/api/extraction/callback/route.ts checks the same rule so that it can answer
-- 400 before the database answers with a violation. Changing only the route would
-- turn a 400 into a 500, which Make retries. Changing only this file would leave
-- every partial a 400.
--
-- A CONSTRAINT IS REPLACED, NEVER EDITED. DROP CONSTRAINT removes a rule about
-- rows and no row (CLAUDE.md 8.6, "What is NOT in the forbidden set"). The new
-- rule is strictly WIDER than the one it replaces, so every row that satisfied
-- 0008 satisfies this one and validating it against existing rows cannot fail.
-- No UPDATE, no DELETE, and no row is touched.
--
-- ONE TRANSACTION, so there is no moment in which the table carries no rule.

begin;

alter table public.extraction_drafts
  drop constraint if exists extraction_drafts_error_code_matches_status;

alter table public.extraction_drafts
  add constraint extraction_drafts_error_code_matches_status check (
    (status = 'failed' and error_code is not null)
    or status = 'partial'
    or (status = 'extracted' and error_code is null)
    or status is null
  );

comment on constraint extraction_drafts_error_code_matches_status
  on public.extraction_drafts is
  'Card P3-29a, migration 0041: error_code is required on failed, optional on partial, forbidden on extracted. Until 0041 it was required on partial as well (0008).';

commit;
