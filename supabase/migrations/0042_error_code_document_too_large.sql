-- 0042_error_code_document_too_large.sql
-- RC Inventory phase 3, card EXT-28 (clause one of EXT-27, for this one label).
-- The ninth extraction error code.
--
-- Contains no DROP, no TRUNCATE and no DELETE.
--
-- THIS FILE CONTAINS THE ENUM ADDITION AND NOTHING ELSE, AND THAT IS FORCED BY
-- POSTGRESQL RATHER THAN CHOSEN, exactly as in 0034. A newly added enum label
-- cannot be USED in the transaction that added it, and `supabase db reset` wraps
-- each FILE in one transaction, so the only boundary every runner in this
-- repository agrees on is a FILE boundary. Nothing here uses the label. Nothing
-- may be added to this file that does.
--
-- WHY IT IS AUTHORED BY EXT-28 AND NOT BY EXT-27. EXT-28 depends on EXT-27 for
-- one reason only, and the card says so in its notes: its upload refusal stores
-- `document_too_large`, and until the label exists the database refuses the
-- write. The owner's dispatch of 2026-09-14 put EXT-28 first because it blocks
-- the counterparty. This file is EXT-27's clause one for this single label, in
-- the shape EXT-27 specifies. EXT-27's copy work and its sentence check are
-- untouched and still owed.
--
-- MERGING THIS FILE APPLIES IT. A Supabase GitHub app applies merged migrations
-- to production on every push to main (CLAUDE.md 8.0, ruling R-124). An
-- `ALTER TYPE ... ADD VALUE` removes no row and is safe under that reading.
--
-- IF NOT EXISTS IS NOT DECORATION. It makes the file re-runnable against the bare
-- postgres:16 shim that `npm run check:migrations` uses, and the applier's enum
-- pre-phase requires it of any file it commits ahead of a batch.
--
-- WHY THE CODE EXISTS. An upload whose page count WE measure at 100 or more is
-- refused before it is sent to the extractor. That refusal is OURS: nothing was
-- downloaded and no model ran. It joins the third surface contract section 5.2a
-- declares under ruling R-098, beside `reconciliation_failed`.
--
-- THE COUNTERPARTY HAS TO KNOW BEFORE WE EMIT IT, per R-098. Here the code never
-- travels to him: it is written by our upload path onto our own draft row, and
-- the document it describes is never sent. What reaches him is the page count
-- in the webhook body, and that is a contract change the owner delivers.

alter type public.extraction_error_code add value if not exists 'document_too_large';

-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs outside the addition, per the note above. Expect nine labels.

select enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'extraction_error_code'
order by e.enumsortorder;
