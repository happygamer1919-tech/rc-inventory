-- 0043_extraction_upload_page_count.sql
-- RC Inventory phase 3, card EXT-28. The page count WE take at upload gets a
-- column of its own, beside the one the model reports.
--
-- Contains no DROP, no TRUNCATE and no DELETE. One transaction.
--
-- TWO FACTS, TWO COLUMNS. `page_count`, added by 0032, holds the count AS THE
-- MODEL REPORTS IT, and its column comment says so in terms. This column holds
-- the count as WE read it from the uploaded bytes, before anything is sent.
-- Writing ours into `page_count` would destroy the only pair of numbers the
-- partial-read signal is made of, and silently: afterwards the two readings would
-- be indistinguishable.
--
-- IT IS STORED, NOT RECOMPUTED, because `refireExtraction` in
-- lib/data/extraction-actions.ts reads only the draft row and never holds the
-- file bytes. A count that lived only in the upload request would be missing on
-- every re-fire, which is exactly when the 100-page refusal has to hold again.
--
-- NULLABLE, AND NULL IS NOT AN ERROR. It means we could not count with certainty:
-- an encrypted object stream, a damaged file, a structure the counter does not
-- read. A wrong count is worse than none, so the counter answers null rather than
-- guessing, and an unknown page count is not a large document.
--
-- NO DEFAULT, for the reason 0032 gives: a default would write a claim nobody
-- made onto every existing row. Every row that exists today gets null, which is
-- the truth about them: nobody counted.
--
-- THE CHECK REFUSES ZERO AND NEGATIVE. A document has at least one page. The
-- counter never answers below one; the constraint is the second door, for a
-- writer that is not the counter.
--
-- THE CONSTRAINT IS DECLARED WITH THE COLUMN, so this file needs no DROP
-- CONSTRAINT: a column that does not exist yet cannot already carry it.
--
-- MERGING THIS FILE APPLIES IT (CLAUDE.md 8.0, ruling R-124). The application
-- code ships in the same merge and reaches production on its own clock. Until
-- the column exists, every read and write of it sits behind
-- `hasExtractionUploadPageCount` in lib/data/schema-capability.ts, and the
-- behaviour in that window is today's: no count stored, no count shown.

begin;

alter table public.extraction_drafts
  add column if not exists upload_page_count integer
    constraint extraction_drafts_upload_page_count_positive
    check (upload_page_count is null or upload_page_count >= 1);

comment on column public.extraction_drafts.upload_page_count is
  'EXT-28. Pages in the uploaded file AS COUNTED BY US at upload, from the bytes, before the document is sent anywhere. Not the model''s report, which is page_count. Null means we could not count with certainty, which is not an error and never refuses a document. Stored because a re-fire never holds the bytes. A count of 100 or more is refused before the webhook fires, with error_code document_too_large.';

-- 0032 wrote that comparing the model's count against ours "needs a page counter
-- on our side that does not exist yet". That became false with this file, so the
-- comment is corrected here rather than left to describe a gap that has closed.
-- The comparison itself is still not built, and the comment says that too.
comment on column public.extraction_drafts.page_count is
  'EXT-09. Pages in the source document AS THE MODEL REPORTS THEM, not as counted by us. Null means no page count was reported, which is not an error. A value below the real page count of the stored file is the signature of a model that read part of the document and returned a self-consistent result. Our own count is upload_page_count, added by 0043 (EXT-28); comparing the two is separate work and is not built.';

commit;

-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect one row: integer, nullable, no default.

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'extraction_drafts'
  and column_name = 'upload_page_count';

select conname, pg_catalog.pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.extraction_drafts'::regclass
  and conname = 'extraction_drafts_upload_page_count_positive';
