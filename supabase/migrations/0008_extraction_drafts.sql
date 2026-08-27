-- 0008_extraction_drafts.sql
-- RC Inventory phase 2, card P2-08a. Storage for extraction drafts.
--
-- Applied by EXECUTOR under ruling R-012. Runs as one transaction.
-- Contains no DROP, no TRUNCATE and no DELETE.
--
-- THE SHAPE IS NOT A DESIGN CHOICE HERE. It is docs/contracts/extraction-v2.md,
-- frozen by ruling R-014, transcribed into columns. Every field the callback
-- carries has a column, with the same name and the same nullability, so that a
-- reader can hold the contract and this file side by side and check them off.
--
-- NULLABLE MEANS NULLABLE, AND THAT IS THE WHOLE POINT OF THIS FILE.
--
-- The contract's first global rule is that an absent field is null, never an
-- empty string and never zero. An empty string says the field was present and
-- blank; a zero in a quantity or a price is a real value, and a document with
-- no stated unit price must not arrive looking like a free item.
--
-- A column declared NOT NULL DEFAULT 0 would make the DATABASE the thing that
-- substitutes the lie, and it would do it silently, below every check the
-- application performs. So there is no NOT NULL DEFAULT 0 anywhere in this
-- file, and no empty-string default. The only NOT NULL columns are the ones
-- that are structurally required: the key, the file we would have to re-fire,
-- and the row's own bookkeeping.
--
-- order_id CARRIES NO FOREIGN KEY, DELIBERATELY.
--
-- It is the contract's idempotency key: ours, minted when the document is
-- uploaded, echoed back unchanged, and the thing a repeat callback upserts on.
-- Today the upload screen attaches a document to an inbound order that already
-- exists, so the value happens to be an inbound_orders.id. P2-09's acceptance
-- says confirm CREATES the real inbound order, which reads the other way.
--
-- That is a real ambiguity and it belongs to P2-09, not to this card. A foreign
-- key here would settle it by accident, in a migration, and settling it the
-- wrong way would cost a second migration and a data move. Without the key both
-- readings work and P2-09 decides deliberately. Recorded rather than left for
-- someone to discover as a constraint violation.
--
-- status IS NULLABLE, AND NULL MEANS "FIRED, NO CALLBACK YET".
--
-- The contract's status enum has exactly three values because it describes what
-- a CALLBACK carries. A draft exists from the moment the document is fired,
-- which is before any callback, and that state needs representing. Adding a
-- fourth value to an enum the contract freezes at three would put our storage
-- and the wire format out of step for the sake of one state. Null already means
-- "not present yet" everywhere else in this file, so it means it here too.

begin;

-- ===========================================================================
-- 1. ENUM TYPES, both frozen by the contract
-- ===========================================================================

-- Contract section 5.1. Three values, no more.
create type public.extraction_status as enum ('extracted', 'partial', 'failed');

-- Contract section 5.2. Anything outside this set is a rejected payload, 400,
-- and the enum is what makes that rejection happen at the database rather than
-- depending on the application remembering to check.
create type public.extraction_error_code as enum (
  'download_failed',
  'url_expired',
  'unsupported_format',
  'unreadable_document',
  'extraction_failed',
  'invalid_output',
  'timeout'
);


-- ===========================================================================
-- 2. DOCUMENT LEVEL
-- ===========================================================================

create table public.extraction_drafts (
  -- The idempotency key. Primary key, so a repeat callback for the same
  -- order_id upserts by definition and cannot append a second draft.
  order_id             uuid primary key,

  -- What we fired, kept so P2-09's re-fire control can send the same document
  -- again without reconstructing anything. NOT NULL because a draft we could
  -- not re-fire is a draft the operator cannot recover.
  document_path        text        not null,
  document_filename    text        not null,
  mime_type            text        not null,
  size_bytes           bigint      not null,

  -- NULL until a callback arrives. See the header.
  status               public.extraction_status,
  error_code           public.extraction_error_code,
  reason               text,

  -- Everything below is contract section 4.1, in its order, all nullable.
  supplier_name        text,
  order_date           date,
  subtotal             numeric(14,2),
  vat_amount           numeric(14,2),
  document_total       numeric(14,2),
  prices_include_vat   boolean,
  vat_rate             numeric(6,3),
  currency             public.currency_code,
  currency_raw         text,
  confidence           numeric(4,3),
  meta                 jsonb,

  fired_at             timestamptz,
  callback_at          timestamptz,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- The contract says error_code is non-null whenever status is failed or
  -- partial. Enforced here so a payload that satisfies every type and still
  -- omits the reason for its own failure is refused by the database.
  constraint extraction_drafts_error_code_matches_status check (
    (status in ('failed', 'partial') and error_code is not null)
    or (status = 'extracted' and error_code is null)
    or status is null
  ),
  constraint extraction_drafts_confidence_range check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  constraint extraction_drafts_size_positive check (size_bytes > 0)
);

comment on table public.extraction_drafts is
  'One row per fired document. order_id is the contract idempotency key and carries no foreign key on purpose: whether it names an existing inbound order is P2-09 decision, not this migration. status null means fired and not yet answered.';

comment on column public.extraction_drafts.meta is
  'Contract _meta: model, prompt_version, page_count, characters_extracted, duration_ms. Stored and never shown to the operator. Exists so a wrong extraction can be explained rather than argued about: a low character count against a high page count is the signature of a scan that never OCRed.';


-- ===========================================================================
-- 3. LINE LEVEL
-- ===========================================================================

create table public.extraction_draft_lines (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid    not null references public.extraction_drafts (order_id) on delete cascade,

  -- Document order, preserved. A review screen that reorders the lines of an
  -- invoice makes the operator check it against the paper line by line.
  line_no        integer not null,

  -- The only NOT NULL field in the contract's line object.
  product_name   text    not null,

  -- Contract section 4.2, in its order, all nullable. Mapped and raw sit side
  -- by side for unit, currency and category alike: the raw field carries what
  -- the document said, the mapped field is our best reading of it, and a mapped
  -- value that silently replaced the raw one would destroy the only evidence of
  -- what was actually extracted.
  quantity       numeric(14,3),
  unit           public.unit_code,
  unit_raw       text,
  unit_price     numeric(14,2),
  line_total     numeric(14,2),
  currency       public.currency_code,
  currency_raw   text,
  -- Text and not a foreign key to categories: the contract's wire format is a
  -- name, the vocabulary is rows the client may rename (P2-17), and P2-09
  -- resolves the name to a row at confirm time.
  category       text,
  category_raw   text,
  confidence     numeric(4,3),

  created_at     timestamptz not null default now(),

  constraint extraction_draft_lines_line_no_unique unique (order_id, line_no),
  constraint extraction_draft_lines_confidence_range check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  )
);

-- Every foreign key gets an index on the referencing side, same rule as 0001.
create index extraction_draft_lines_order_id_idx on public.extraction_draft_lines (order_id);
create index extraction_drafts_status_idx        on public.extraction_drafts (status);


-- ===========================================================================
-- 4. updated_at TRIGGER
-- ===========================================================================

create trigger extraction_drafts_set_updated_at
  before update on public.extraction_drafts
  for each row execute function public.set_updated_at();


-- ===========================================================================
-- 5. ROW LEVEL SECURITY
-- ===========================================================================
--
-- Same pattern as the transactional tables in 0001: both roles read and write,
-- because an account_manager uploads documents, and only the owner deletes.

alter table public.extraction_drafts      enable row level security;
alter table public.extraction_draft_lines enable row level security;

create policy extraction_drafts_select on public.extraction_drafts
  for select to authenticated using (true);

create policy extraction_drafts_insert on public.extraction_drafts
  for insert to authenticated with check (true);

create policy extraction_drafts_update on public.extraction_drafts
  for update to authenticated using (true) with check (true);

create policy extraction_drafts_delete on public.extraction_drafts
  for delete to authenticated using (public.is_owner());

create policy extraction_draft_lines_select on public.extraction_draft_lines
  for select to authenticated using (true);

create policy extraction_draft_lines_insert on public.extraction_draft_lines
  for insert to authenticated with check (true);

create policy extraction_draft_lines_update on public.extraction_draft_lines
  for update to authenticated using (true) with check (true);

create policy extraction_draft_lines_delete on public.extraction_draft_lines
  for delete to authenticated using (public.is_owner());

commit;
