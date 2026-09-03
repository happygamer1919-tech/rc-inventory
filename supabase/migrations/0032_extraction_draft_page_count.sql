-- 0032_extraction_draft_page_count.sql
-- RC Inventory phase 3, card EXT-09. The model-reported page count becomes a
-- column, and the contract's _meta stops promising a character count.
--
-- Contains no DROP, no TRUNCATE and no DELETE. One transaction.
--
-- THIS FILE WAS NUMBERED 0033 FIRST, AND THE APPLIER REFUSED IT.
--
-- The reasoning for the gap was written out and was WRONG, so it is recorded
-- here rather than quietly replaced. It said: 0032 is held by open pull request
-- #177, two unmerged migrations wearing one number is worse than a gap, and
-- CLAUDE.md 8.1 asks for monotonically increasing rather than contiguous.
--
-- The first two sentences are true. The third is true ABOUT CLAUDE.md AND FALSE
-- ABOUT THE THING THAT RUNS. `scripts/apply-pending-migrations.mjs` asserts
-- `ledger-no-gaps-ends-at-highest`, in SQL, inside the transaction:
--
--     -- No gaps: every integer from 1 to the highest is present exactly once.
--
-- With 0001 to 0031 plus 0033 the ledger holds 32 rows and the assertion wants
-- 33, so the whole batch rolls back and nothing applies. A NUMBERING GAP IS NOT
-- A COSMETIC CHOICE HERE, IT IS A BATCH THAT CANNOT BE APPLIED AT ALL.
--
-- SO 0032 IS TAKEN, AND THE COLLISION WITH #177 IS REAL AND IS SAID OUT LOUD.
-- That branch carries `0032_extraction_document_source.sql`. The two file NAMES
-- differ, so **git will not report a conflict**: both files would simply land,
-- both numbered 0032, and the duplicate is exactly the silent kind CLAUDE.md 8b
-- was written about. Whichever of the two merges second renumbers to 0033, and
-- `npm run check:migrations` and `npm run prove:applier` both fail loudly on it
-- until that is done, so it cannot ship unnoticed.
--
-- WHY THE PAGE COUNT IS A COLUMN AND NOT A KEY IN meta.
--
-- It was already a key in _meta and _meta is stored verbatim, so nothing here
-- had to be built for the value to arrive. That is exactly the problem the card
-- names: _meta is documented as stored and never shown, it is unvalidated jsonb,
-- and nothing in the platform can ask a question of it.
--
-- The signal this field exists for is that a model reporting one page on a
-- three-page document has silently read a third of the document and returned a
-- result that is internally consistent. NOTHING ELSE IN THE CHAIN CATCHES THAT.
-- A totals check does not: the totals of page one reconcile against the lines of
-- page one. A signal that no query can reach is not a signal, and the follow-up
-- work that compares this against the real page count of the stored file needs
-- something it can select.
--
-- NULLABLE, AND THE ABSENCE IS NOT AN ERROR. Card defaults, verbatim: it is a
-- safety signal, not a required field, and a missing signal must not reject a
-- document that was read correctly. Every extraction_drafts row that exists
-- today gets null, which is the truth about them: nobody reported a page count.
--
-- NO DEFAULT, AND THE ASSERTION FILE CHECKS FOR ITS ABSENCE. A default of 1
-- would write a claim no model made onto every pre-existing row and onto every
-- future callback that omits the field, and it would be indistinguishable
-- afterwards from a model that really did report one page. That is the shape of
-- the defect this column exists to catch, installed by the column itself.
--
-- THE CHECK CONSTRAINT REFUSES ZERO AND NEGATIVE, NOT MERELY NON-INTEGERS.
-- A document has at least one page. Zero is not a smaller page count, it is a
-- broken report, and it must not be storable as though it were a reading. The
-- application maps a broken report to null before it ever gets here; the
-- constraint is the second door, for a writer that is not the callback route.

begin;

alter table public.extraction_drafts
  add column if not exists page_count integer;

-- A named constraint rather than an inline one, so a later card can replace it
-- with `drop constraint` plus `add constraint`, which CLAUDE.md 8.6 permits and
-- which is the only way a constraint is ever corrected.
alter table public.extraction_drafts
  drop constraint if exists extraction_drafts_page_count_positive;

alter table public.extraction_drafts
  add constraint extraction_drafts_page_count_positive check (
    page_count is null or page_count >= 1
  );

comment on column public.extraction_drafts.page_count is
  'EXT-09. Pages in the source document AS THE MODEL REPORTS THEM, not as counted by us. Null means no page count was reported, which is not an error. A value below the real page count of the stored file is the signature of a model that read part of the document and returned a self-consistent result; comparing the two is separate work and needs a page counter on our side that does not exist yet.';

-- 0008 wrote this comment when characters_extracted was in the contract. The
-- field is out of the contract as of this card, so the comment that promises it
-- is corrected here rather than left to describe a payload nobody sends.
comment on column public.extraction_drafts.meta is
  'Contract _meta: model, prompt_version, page_count, duration_ms. Stored verbatim and never shown to the operator. Exists so a wrong extraction can be explained rather than argued about. characters_extracted was removed from the contract by EXT-09: we hand the file to the model and no character count exists anywhere in the chain, so it could only ever have been null. A callback that still carries it is accepted and the field is ignored. THE PAGE COUNT IS NO LONGER READ FROM HERE: it has its own column, because a key in an unvalidated blob is not something a query can ask about.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect one row: integer, nullable, no default.

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'extraction_drafts'
  and column_name = 'page_count';

select conname, pg_catalog.pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.extraction_drafts'::regclass
  and conname = 'extraction_drafts_page_count_positive';
