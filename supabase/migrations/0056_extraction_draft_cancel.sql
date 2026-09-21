-- 0056_extraction_draft_cancel.sql
-- RC Inventory phase 3, card P3-84, Ivan's finding F20:
--
--   "an extraction draft can be dismissed from the review screen."
--
-- WHAT CHANGES. From card P3-84 the owner can dismiss a test or junk document
-- from the review screen at /incarca-comanda. The server action
-- cancelExtractionDraft in lib/data/extraction-actions.ts writes these three
-- columns, and nothing else, in one guarded write. A draft is cancelled when
-- cancelled_at is not null. The review queue leaves it out; a collapsed section
-- under the queue still shows it, marked "Renunțat".
--
-- WHY. Until now a junk draft stayed in the queue until somebody removed its
-- row in production, and that is blocked on the owner. The convention this
-- repository keeps for real business records, cancelled and never removed
-- (P2-07, P2-13, ruling R-009), is the shape used here: the row, its lines and
-- the stored file are all KEPT.
--
-- COLUMNS AND NOT A NEW ENUM VALUE, deliberately. public.extraction_status is
-- (extracted, partial, failed) and is tied to the check
-- extraction_drafts_error_code_matches_status (0008, replaced by 0041). A new
-- value would also need that check replaced, and ALTER TYPE ... ADD VALUE cannot
-- be used inside the transaction that adds it. The shape is the one confirmed_at
-- already has (0010, 0011): a time, a person, and here a reason.
--
-- NULLABLE, NO DEFAULT. A default would rewrite every existing row into a claim
-- nobody made. NULL on every existing row means "not cancelled", which is true.
--
-- NO POLICY CHANGES. The write policy on extraction_drafts is unchanged; who
-- may cancel (the owner, active) is enforced inside the server action.
--
-- ADDITIVE ONLY. Three add column if not exists and three comments. No existing
-- row is touched, nothing is dropped, nothing is removed. No enum, check or
-- policy is changed.

begin;

alter table public.extraction_drafts
  add column if not exists cancelled_at timestamptz;

alter table public.extraction_drafts
  add column if not exists cancelled_by uuid references auth.users (id) on delete set null;

alter table public.extraction_drafts
  add column if not exists cancel_reason text;

comment on column public.extraction_drafts.cancelled_at is
  'P3-84, Ivan F20. When this draft was dismissed from the review screen. A draft is cancelled exactly when this is not null. The row, its lines and its stored file are kept; the review queue leaves it out and a separate section still shows it. Only the server action cancelExtractionDraft writes it, and never on a confirmed draft.';

comment on column public.extraction_drafts.cancelled_by is
  'P3-84, Ivan F20. Who dismissed this draft, the same shape as confirmed_by. NULL on a draft that was never cancelled.';

comment on column public.extraction_drafts.cancel_reason is
  'P3-84, Ivan F20. The optional one-line reason typed when the draft was dismissed, trimmed and at most 200 characters. NULL when none was given or the draft was never cancelled.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect three nullable columns with no default: timestamptz, uuid, text.

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'extraction_drafts'
  and column_name in ('cancelled_at', 'cancelled_by', 'cancel_reason')
order by column_name;
