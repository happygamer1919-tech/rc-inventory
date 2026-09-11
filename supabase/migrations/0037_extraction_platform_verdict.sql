-- 0037_extraction_platform_verdict.sql
-- RC Inventory phase 3, card EXT-26, under ruling R-190.
--
-- WHAT THIS IS FOR, IN THE OWNER'S WORDS: "when the payload carries an
-- error_code, it is authoritative. Our classification runs anyway and is
-- recorded, never substituted."
--
-- THE SENDER SEES THINGS WE DO NOT. He tests line_count before the sums
-- comparison and he sees the page count. We see neither: line_count is not in
-- contract section 4.1, and the page count arrives only inside _meta, which card
-- EXT-24 measured as absent from the header-only failed shape. Two readers with
-- different evidence will disagree, and the one with more evidence is not ours.
--
-- SO WHY STORE OURS AT ALL. Because a platform that stops recording what it
-- concluded can never afterwards show that it was right, and the disagreements
-- are the only dataset anybody will ever have about which reader is better. The
-- owner's sentence: the disagreement is DATA, not an error.
--
-- TWO COLUMNS AND NOT ONE. The CODE says what we would have written; the ARM
-- says WHY. Five of the six arms carry the same code, so a code alone cannot
-- tell a header that contradicts itself from a document with no lines at all,
-- and those are different documents with different remedies.
--
-- BOTH NULLABLE, NO DEFAULT. Null means our classifier did not run: the payload
-- was digital, or it carried no lines to judge. Rows written before this
-- migration genuinely do not know, and a default would rewrite them into a claim
-- nobody made.
--
-- THE ARM IS CONSTRAINED TO THE SIX NAMES, WHICH IS A SECOND DOOR. The first is
-- the `ScanArm` union in lib/data/reconciliation.ts and the exhaustiveness guard
-- typescript enforces on it. This constraint is for a writer that is not that
-- route. A seventh arm therefore costs a migration, deliberately: adding one is
-- a decision about what the platform can conclude, and it should be visible in a
-- diff rather than appearing in a text column.
--
-- NOT A NEW ERROR CODE, AND NOT A NEW EMITTER. platform_error_code reuses the
-- existing enum and is never sent to anybody: it is a column we read. Ruling
-- R-189 requires an emitter change to be announced first, and this is not one.

begin;

alter table public.extraction_drafts
  add column if not exists platform_error_code public.extraction_error_code;

alter table public.extraction_drafts
  add column if not exists platform_arm text;

alter table public.extraction_drafts
  drop constraint if exists extraction_drafts_platform_arm_known;

alter table public.extraction_drafts
  add constraint extraction_drafts_platform_arm_known check (
    platform_arm is null
    or platform_arm in (
      'header_inconsistent',
      'no_lines',
      'line_total_missing',
      'target_missing',
      'anchor_unknown',
      'line_sum_missed'
    )
  );

comment on column public.extraction_drafts.platform_error_code is
  'EXT-26. The error_code OUR validator would have written, recorded even when the sender supplied one. NEVER substituted for error_code: the sender is authoritative, ruling R-190. NULL means our classifier did not run on this payload.';

comment on column public.extraction_drafts.platform_arm is
  'EXT-26. WHICH arm of the EXT-23 split produced platform_error_code. Five of the six arms carry unreadable_document, so the code alone cannot say why. NULL means our classifier did not run.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect two nullable columns with no default, and one check constraint naming
-- exactly the six arms.

select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'extraction_drafts'
  and column_name in ('platform_error_code', 'platform_arm')
order by column_name;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.extraction_drafts'::regclass
  and conname = 'extraction_drafts_platform_arm_known';
