-- 0051_error_code_config_error.sql
-- RC Inventory phase 3, card P3-71. Ivan's finding F3. The tenth extraction
-- error code, and the FIRST one that is never spoken on the wire.
--
-- Contains no DROP, no TRUNCATE and no DELETE.
--
-- THIS FILE CONTAINS THE ENUM ADDITION AND NOTHING ELSE, AND THAT IS FORCED BY
-- POSTGRESQL RATHER THAN CHOSEN, exactly as in 0034 and 0042. A newly added enum
-- label cannot be USED in the transaction that added it, and `supabase db reset`
-- wraps each FILE in one transaction, so the only boundary every runner in this
-- repository agrees on is a FILE boundary. Nothing here uses the label. Nothing
-- may be added to this file that does.
--
-- MERGING THIS FILE APPLIES IT. A Supabase GitHub app applies merged migrations
-- to production on every push to main (CLAUDE.md 8.0, ruling R-124). An
-- `ALTER TYPE ... ADD VALUE` removes no row and is safe under that reading.
--
-- IF NOT EXISTS IS NOT DECORATION. It makes the file re-runnable against the bare
-- postgres:16 shim that `npm run check:migrations` uses, and the applier's enum
-- pre-phase requires it of any file it commits ahead of a batch.
--
-- WHY THE CODE EXISTS. Until this card, a missing `MAKE_WEBHOOK_URL` made an
-- upload fail in SILENCE. `fireExtraction` refused to send and returned before it
-- had written any `extraction_drafts` row at all, so the callers' own
-- "mark it failed" update matched zero rows, the operator saw a successful
-- upload, and the document never went to extraction with nothing anywhere saying
-- why. The nine existing codes all describe a document or an extractor: a
-- download that failed, a format that could not be read, a model that returned
-- nothing, arithmetic that did not reconcile, a file with too many pages. NONE of
-- them describes OUR OWN CONFIGURATION being broken, and the constraint
-- `extraction_drafts_error_code_matches_status` requires a non-null `error_code`
-- whenever `status = 'failed'`, so the refusal could not be written down without
-- a label for it.
--
-- THE NAME IS DELIBERATELY WIDER THAN THE ONE VARIABLE. `config_error` is "a
-- setting of ours is missing or wrong, and no document was sent because of it".
-- `webhook_not_configured` would have been exact for today and would have needed
-- a tenth, an eleventh and a twelfth label the first time a sibling variable was
-- given the same treatment. The operator's sentence and the row's `reason` carry
-- the specific detail; the label carries the class.
--
-- THIS LABEL IS NOT ADDED TO THE WIRE SET, AND THAT IS THE WHOLE DIFFERENCE FROM
-- 0034 AND 0042. `EXTRACTION_ERROR_CODES` in lib/data/extraction-types.ts is the
-- closed set of contract section 5.2 and it is what
-- app/api/extraction/callback/route.ts tests a payload against. That route is
-- FROZEN by ruling R-202: nothing may change what it accepts, refuses or returns
-- while the Andre connection is open. Putting `config_error` in that array would
-- have turned a callback carrying it from a 400 into an accepted payload, which
-- is exactly the change R-202 forbids. It stays out. The counterparty can never
-- send this code and we never send it to him: it is written by OUR upload path
-- onto OUR OWN draft row, for a document that was never sent anywhere. Ruling
-- R-098's condition, that the counterparty must know before we emit a code, is
-- not engaged for the same reason: nothing emits it.

alter type public.extraction_error_code add value if not exists 'config_error';

-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs outside the addition, per the note above. Expect ten labels.

select enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'extraction_error_code'
order by e.enumsortorder;
