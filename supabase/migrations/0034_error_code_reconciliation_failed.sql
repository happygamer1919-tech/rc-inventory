-- 0034_error_code_reconciliation_failed.sql
-- RC Inventory phase 3, card EXT-16. The eighth extraction error code.
--
-- Contains no DROP, no TRUNCATE and no DELETE.
--
-- THIS FILE CONTAINS THE ENUM ADDITION AND NOTHING ELSE, AND THAT IS FORCED BY
-- POSTGRESQL RATHER THAN CHOSEN. A newly added enum label cannot be USED in the
-- transaction that added it. `supabase db reset` wraps each FILE in one
-- transaction, so the only boundary all three runners in this repository agree
-- on is a FILE boundary. P3-33 learned this by having to split 0030 from 0031
-- after the fact; this file is split before the fact.
--
-- Nothing here uses the label. Nothing may be added to this file that does.
--
-- MERGING THIS FILE APPLIES IT. That is not the doctrine CLAUDE.md 3.1 describes
-- and it is what this repository actually does: a Supabase GitHub app applies
-- merged migrations to production on every push to main, proven twice by
-- prediction with a control on 2026-09-03 and recorded in the APPLY-LOG
-- reconstruction and in card MIG-01. An `ALTER TYPE ... ADD VALUE` removes no
-- row and is safe under that reading, but the reading is why this header says so
-- rather than repeating that the file is merely authored.
--
-- IF NOT EXISTS IS NOT DECORATION. It makes the file re-runnable against the
-- bare postgres:16 shim that `npm run check:migrations` uses, and it is what the
-- applier's enum pre-phase requires of any file it is willing to commit ahead of
-- the batch.
--
-- WHY THE CODE EXISTS: EXT-16 refuses a scan-sourced payload whose line sum does
-- not reconcile against the total printed on the document. That refusal is
-- OURS, not the extractor's: the download succeeded and the model returned. It
-- is the first member of the third surface declared in contract section 5.2a
-- under ruling R-098.
--
-- ANDRE HAS TO KNOW BEFORE WE EMIT IT, and that is a condition of R-098 rather
-- than a courtesy. Section 5.2 makes any value outside the set a rejected
-- payload, 400, and Make does not retry a 4xx. Telling him is an owner action on
-- the R-057 escalation list; the card carries the obligation.

alter type public.extraction_error_code add value if not exists 'reconciliation_failed';


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs outside the addition, per the note above. Expect eight labels.

select enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'extraction_error_code'
order by e.enumsortorder;
