-- 0032_extraction_document_source.sql
-- RC Inventory phase 3, card EXT-15. Where the extraction got its text from.
--
-- WHY THE PLATFORM NEEDS THIS AT ALL.
--
-- On 2026-09-02 the scan path returned FOUR WRONG LINES IN SEVEN, every one
-- arithmetically self-consistent, with status `extracted` and confidence 1.0.
-- The rules the owner set in response all turn on one distinction: a document
-- the model READ as text is treated differently from one it LOOKED AT as an
-- image. A scan-sourced reconciliation failure loses its lines; a digital one
-- keeps them.
--
-- NOTHING IN THE SYSTEM COULD TELL THEM APART BEFORE THIS COLUMN.
--
--   mime_type does not answer it. One of the four sample documents is a PDF with
--   no text layer, so `application/pdf` covers both cases.
--   _meta.characters_extracted was the only proxy and card EXT-09 removes it,
--   because with the file handed straight to the model that number could only
--   ever be null.
--
-- Only the extractor knows, so the extractor declares it.
--
-- A TEXT COLUMN WITH A CHECK, NOT AN ENUM, AND THE REASON IS MEASURED RATHER
-- THAN STYLISTIC. Card P3-33 added two labels to public.unit_code the day before
-- this file was written, and a newly added enum label cannot be used in the
-- transaction that added it: the migration had to be SPLIT IN TWO because
-- `supabase db reset` wraps each file in its own transaction. A third value here
-- would cost the same split. A check constraint is widened by one migration with
-- no transaction hazard on any of the three runners this repository applies
-- migrations with.
--
-- NULLABLE, AND NULL MEANS `scan`, WHICH IS DECIDED IN THE APPLICATION AND NOT
-- HERE. A default of 'scan' in the column would rewrite history: every draft
-- stored before this migration would silently become a scan. The rows that
-- predate it are genuinely unknown and stay null, and only NEW payloads are read
-- through the default. The application's rule is that an absent source is
-- treated as `scan`, because guessing `digital` costs invented stock and
-- guessing `scan` costs a manual entry.

begin;

alter table public.extraction_drafts
  add column if not exists document_source text;

alter table public.extraction_drafts
  drop constraint if exists extraction_drafts_document_source_known;

alter table public.extraction_drafts
  add constraint extraction_drafts_document_source_known
  check (document_source is null or document_source in ('scan', 'digital'));

comment on column public.extraction_drafts.document_source is
  'EXT-15. Declared by the extractor: `scan` when it read an image, `digital` when it read a text layer. NULL means it did not say, and the application reads that as `scan`. Only the extractor knows: mime_type cannot tell a scanned PDF from a digital one.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect the column, nullable, with the constraint present and accepting
-- exactly the two values plus null.

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'extraction_drafts'
  and column_name = 'document_source';

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.extraction_drafts'::regclass
  and conname = 'extraction_drafts_document_source_known';
