-- 0062_extraction_draft_supersede.sql
-- RC Inventory phase 3, card P3-103, Ivan's finding F25:
--
--   "'Retrimite' leaves the old draft in the queue. Two TEST-R199 documents
--    resent on 2026-09-24 each minted a new order_id (Andre confirmed five
--    executions, five order_ids, three documents), and the original row stayed,
--    so a retried failed read shows twice."
--
-- WHICH PATH ACTUALLY MINTED THE ORDER_ID, ESTABLISHED BEFORE THIS FILE WAS
-- WRITTEN, BECAUSE THE FINDING'S TITLE NAMES THE WRONG ONE.
--
-- refireExtraction in lib/data/extraction-actions.ts re-fires the SAME order_id,
-- deliberately, and its doc comment carries the reason: the contract's
-- idempotency rule (section 2.2) makes the result REPLACE the previous
-- extraction instead of adding a second draft, and "un order_id nou ar produce
-- exact duplicatul pe care cheia de idempotenta exista sa il previna". The
-- button therefore cannot mint an order_id and cannot leave a second row.
--
-- Ivan's own numbers say which path did: FIVE executions and FIVE order_ids for
-- THREE documents. A refire adds an execution WITHOUT adding an order_id, so had
-- the button been pressed even once the executions would have outnumbered the
-- order_ids. They are equal, so every one of the five was a fresh UPLOAD through
-- startExtraction, which mints randomUUID() per upload. Three documents, two of
-- them uploaded twice, is 5 and 5.
--
-- WHAT CHANGES. From card P3-103 an upload of a document whose BYTES are already
-- on an unconfirmed, uncancelled, not-yet-superseded draft marks that older draft
-- superseded by the new one. The review queue leaves superseded drafts out, the
-- same way 0056 made it leave cancelled ones out, and a folded block inside the
-- newer draft's card still shows them, reading "Înlocuit de retrimiterea din
-- <data>". The row, its lines and the stored file are all KEPT.
--
-- WHY THE BYTES AND NOT THE FILENAME. Many suppliers send "factura.pdf". Matching
-- on a name would mark a DIFFERENT document superseded and hide it from the queue,
-- and the two errors are not symmetric: a missed match leaves exactly today's
-- behaviour, two rows, while a wrong match hides a real document somebody is
-- waiting on. A sha256 of the bytes has no false positives and is precisely the
-- observed case, the same file sent again. The hash is computed from the buffer
-- startExtraction already reads to count pages, so it costs no second read.
--
-- ROWS WRITTEN BEFORE THIS FILE CARRY NO HASH and can never be matched. That is
-- correct rather than a gap: nothing here claims about an old row something that
-- was never recorded for it.
--
-- superseded_by REFERENCES order_id AND NOT A SURROGATE, because order_id is this
-- table's own primary key (0008) and is what every code path addresses a draft by.
-- on delete set null, the same referential action confirmed_by and cancelled_by
-- already carry.
--
-- NO superseded_reason COLUMN, deliberately. Nobody types a reason here: the
-- supersede is automatic. A column no path ever writes is a field that lies about
-- being available. The "who and when" the goal asks for is superseded_by_user and
-- superseded_at, the shape cancelled_by and cancelled_at already have.
--
-- COLUMNS AND NOT A NEW ENUM VALUE, for the reason 0056 wrote out at length:
-- public.extraction_status is (extracted, partial, failed) and is tied to the
-- check extraction_drafts_error_code_matches_status.
--
-- NULLABLE, NO DEFAULT. A default would rewrite every existing row into a claim
-- nobody made. NULL on every existing row means "not superseded", which is true.
--
-- NO POLICY CHANGES. The write policy on extraction_drafts is unchanged; who may
-- supersede is decided inside the server action, which only ever does it as a
-- consequence of that same person uploading the document again.
--
-- ADDITIVE ONLY. Four add column if not exists, one index and four comments. No
-- existing row is touched, nothing is dropped, nothing is removed. No enum, check
-- or policy is changed.

begin;

alter table public.extraction_drafts
  add column if not exists document_sha256 text;

alter table public.extraction_drafts
  add column if not exists superseded_at timestamptz;

alter table public.extraction_drafts
  add column if not exists superseded_by uuid references public.extraction_drafts (order_id) on delete set null;

alter table public.extraction_drafts
  add column if not exists superseded_by_user uuid references auth.users (id) on delete set null;

-- Every foreign key gets an index on the referencing side, the rule 0001 sets and
-- 0008 keeps. The hash index is the one the supersede write actually filters on.
create index if not exists extraction_drafts_superseded_by_idx
  on public.extraction_drafts (superseded_by);

create index if not exists extraction_drafts_document_sha256_idx
  on public.extraction_drafts (document_sha256);

comment on column public.extraction_drafts.document_sha256 is
  'P3-103, Ivan F25. Lowercase hex sha256 of the uploaded document bytes, written by startExtraction from the buffer it already reads to count pages. It is how a second upload of the SAME document is recognised, and it is the bytes and not the filename because many suppliers send factura.pdf. NULL on every row written before this migration and on every draft that did not come in through the upload screen.';

comment on column public.extraction_drafts.superseded_at is
  'P3-103, Ivan F25. When this draft was replaced by a newer send of the same document. A draft is superseded exactly when this is not null. The row, its lines and its stored file are kept; the review queue leaves it out and a folded block inside the newer draft still shows it. Only startExtraction writes it, never on a confirmed draft, never on a cancelled one, and never twice: the first supersede is the fact.';

comment on column public.extraction_drafts.superseded_by is
  'P3-103, Ivan F25. The order_id of the NEWER draft that replaced this one, so the replaced row stays readable from the row that replaced it. References this table own primary key, on delete set null, the shape cancelled_by and confirmed_by already carry. NULL on a draft that was never superseded.';

comment on column public.extraction_drafts.superseded_by_user is
  'P3-103, Ivan F25. Who uploaded the newer document, which is who caused this row to be superseded. The same shape as cancelled_by. NULL on a draft that was never superseded.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect four nullable columns with no default: text, timestamptz, uuid, uuid.

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'extraction_drafts'
  and column_name in ('document_sha256', 'superseded_at', 'superseded_by', 'superseded_by_user')
order by column_name;
