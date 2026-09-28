-- 0063_invoices.sql
-- RC Inventory phase 3, card P3-108, goal G65 part 1. The database and settings
-- behind Facturare: an invoice can be stored, numbered without gaps and never
-- deleted. NOTHING on screen beyond the Setari entries; the list, the create
-- flow and the document are parts 2 and 3 and are separate cards.
--
-- THE DESIGN THIS FILE IMPLEMENTS is docs/reports/2026-09-24-author-facturare-design.md,
-- section 4. Where that report and the card disagreed, the report's REASONS won,
-- and the report for this card says which and why.
--
-- WHAT IT ADDS, AND IT REMOVES NOTHING
--
--   type     public.invoice_status                 draft, issued, paid, cancelled
--   table    public.invoice_settings               one row, the issuer and the two numbers
--   table    public.invoice_number_series          the per series counter
--   table    public.invoices                       one row is one invoice
--   table    public.invoice_lines                  its lines, price frozen on the line
--   function public.invoice_series_for(date)       the series a date falls in
--   function public.issue_invoice(uuid, date, date) allocates the number and issues
--   function public.invoices_require_draft_to_edit(), public.invoice_lines_require_draft()
--   function public.invoices_stamp_status(), public.invoice_lines_compute_totals()
--   function public.invoice_lines_sync_invoice_totals()
--
-- NO EXISTING TABLE LOSES OR CHANGES A COLUMN. There is no DROP TABLE, no
-- TRUNCATE, no DELETE, no DROP COLUMN and no UPDATE of an existing row anywhere
-- in this file. The single INSERT it performs adds the one settings row and is
-- written `on conflict do nothing`, so a second run adds nothing either.
--
-- IT RUNS AS ONE TRANSACTION and IS safe to run twice: every create is guarded,
-- the insert is idempotent, and section 9 checks the result on every run.
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. The application code
-- that reads the settings ships in the same merge and asks first whether the
-- table exists (hasFacturareSettings in lib/data/schema-capability.ts): in the
-- minutes between the code landing and this file landing, the Setari screen shows
-- the Facturare block saying in Romanian that it is not active yet, and nothing
-- else on any screen changes.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres and then runs
-- scripts/poc-free/local-db/assertions/0063_invoices.sql, and against a real
-- local Supabase stack by tests/e2e/facturare-data.spec.ts and
-- tests/e2e/facturare-settings.spec.ts.

begin;


-- ===========================================================================
-- 1. THE STATUS ENUM
-- ===========================================================================
--
-- FOUR VALUES, IN THIS ORDER, AND THE ORDER IS THE PIPELINE.
--
-- THE STORED VALUES ARE ENGLISH AND THE ROMANIAN IS ON SCREEN. The owner's goal
-- line writes "ciorna | emisa | platita | anulata" because that is what the
-- operator reads. public.deviz_status in 0025 and public.project_status in 0016
-- already store English tokens for exactly the same reason, and P2-01 states the
-- convention in terms, quoted in lib/data/units.ts: "Interfata este romaneasca
-- ... o valoare de enum nu este text de interfata". The four Romanian words live
-- in INVOICE_STATUS_LABEL in lib/data/facturare-types.ts. NO DIACRITIC IS IN THIS
-- SCHEMA, deliberately.
--
--   draft      Ciorna     being prepared, freely editable, NOT numbered
--   issued     Emisa      issued to the client, numbered, frozen
--   paid       Platita    paid, still numbered, still frozen
--   cancelled  Anulata    cancelled with a reason, KEEPS its number, still readable

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'invoice_status') then
    create type public.invoice_status as enum ('draft', 'issued', 'paid', 'cancelled');
  end if;
end
$$;


-- ===========================================================================
-- 2. public.invoice_settings
-- ===========================================================================
--
-- A TABLE WITH ONE ROW, AND NOT "a settings row" IN AN EXISTING TABLE, because
-- there is no settings table in this schema to put a row in. The design report
-- offers both shapes; the choice is made here and the reason is that the
-- alternative is not cheaper. A generic key and value store would be a new table
-- too, and a weaker one: typed columns can carry the constraints below, and a
-- jsonb blob cannot refuse a blank prefix or a VAT rate of minus five. This
-- repository's own standard, written all over 0025 and 0047, is to make wrong
-- data impossible rather than unlikely.
--
-- THE SINGLE ROW IS ENFORCED BY THE PRIMARY KEY, not by a convention. `id` is a
-- boolean that a CHECK pins to true, so the primary key admits exactly one value
-- and a second row cannot exist. A reader who has not met the trick before reads
-- the constraint name and knows what it is for.

create table if not exists public.invoice_settings (
  id                  boolean primary key default true,

  -- THE SERIES PREFIX. Default 'RC-', the owner's own default. The series of an
  -- invoice issued in 2026 is 'RC-2026' when the year is included, computed by
  -- public.invoice_series_for below and nowhere else.
  series_prefix       text not null default 'RC-',

  -- THE YEAR GOES IN THE NUMBER, which is what the goal line asks for. It is a
  -- column rather than a hardcoded rule because an accountant may ask for a
  -- series that never restarts, and the design report's question 5 says to ask
  -- rather than choose.
  number_includes_year boolean not null default true,

  -- THE DEFAULT VAT RATE, 20 per cent, AND IT IS NOT CONFIRMED. The screen shows
  -- it beside the words "de confirmat cu contabilul", because nobody on the build
  -- side has an accountant's answer about construction materials in Moldova. The
  -- design report's question 3 is the one that gets it confirmed. A number the
  -- screen presented as settled would be a guess wearing a fact's clothes.
  default_vat_rate    numeric(5,2) not null default 20,

  -- RAPID CONSTRUCT'S OWN DETAILS, the issuer half of an invoice. Every one of
  -- them is NULLABLE and empty, because this file invents no company data: the
  -- owner types them in Setari. A blank half of a document is visible; an invented
  -- IDNO is not.
  issuer_name         text null,
  issuer_fiscal_code  text null,
  issuer_address      text null,
  issuer_bank         text null,
  issuer_iban         text null,

  updated_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint invoice_settings_single_row check (id),

  -- A BLANK PREFIX WOULD PRODUCE A SERIES OF '2026' OR OF NOTHING AT ALL, so it
  -- is refused here rather than caught by whichever screen happens to save.
  constraint invoice_settings_series_prefix_not_blank check (btrim(series_prefix) <> ''),

  -- 0 to 100. A negative rate is arithmetic nobody meant; above 100 is a typed
  -- 2000 that would have quadrupled an invoice.
  constraint invoice_settings_default_vat_rate_range
    check (default_vat_rate >= 0 and default_vat_rate <= 100)
);

comment on table public.invoice_settings is
  'One row. The invoice series prefix, whether the year goes in the number, the default VAT rate, and Rapid Construct own issuer details. Owner editable from Setari. The single row is enforced by a boolean primary key pinned to true. Card P3-108.';

comment on column public.invoice_settings.default_vat_rate is
  'Per cent. Default 20, NOT CONFIRMED BY AN ACCOUNTANT, and the screen says so beside it. The rate that applies to construction materials in Moldova is question 3 of docs/reports/2026-09-24-author-facturare-design.md.';

comment on column public.invoice_settings.series_prefix is
  'Default RC-. With number_includes_year true the series of an invoice issued in 2026 is RC-2026. Read only by public.invoice_series_for, so there is one place that decides what a series is called.';

-- THE ONE ROW. `on conflict do nothing` makes a second run a no-op, and no
-- existing row anywhere is touched: this table is created by this file.
insert into public.invoice_settings (id) values (true)
on conflict (id) do nothing;


-- ===========================================================================
-- 3. public.invoice_number_series, THE COUNTER
-- ===========================================================================
--
-- ONE ROW PER SERIES, holding the number the NEXT invoice in that series will
-- get. It is written by public.issue_invoice and by nothing else: section 8
-- grants authenticated only SELECT on it and gives it no write policy at all, so
-- no screen and no token can move a counter and open a hole in a series.
--
-- WHY A COUNTER ROW AND NOT A SEQUENCE, and this is the load bearing decision of
-- the whole card. A sequence does not roll back. nextval() outside the
-- transaction's control means a transaction that takes a number and then fails
-- has CONSUMED it, and the series has a hole where that attempt was. An accountant
-- reading a series with a document missing from the middle has a problem; a
-- counter row incremented inside the same transaction as the invoice is rolled
-- back with it, so a failed attempt takes nothing.
--
-- WHY NOT THE WAY AN IESIRE REFERENCE IS ALLOCATED TODAY. The design report is
-- explicit and it is quoted here because it is the sentence this table exists for:
--
--   "The way an Iesire reference is allocated today, by reading the highest one
--   and adding one in application code, must NOT be copied here: it can hand the
--   same number to two people, and its current answer to that is a Romanian
--   message asking the operator to try again, which on an invoice series produces
--   a gap."
--
-- Reading max(number) and adding one is a read and then a write with a gap
-- between them. Two operators pressing Emite in the same second both read the
-- same maximum, and one of them loses. Here the read and the write are ONE
-- STATEMENT, `update ... returning`, which takes a row lock: the second
-- transaction BLOCKS on that row until the first commits or rolls back, then
-- re-reads it under READ COMMITTED and continues from the value the first left.
-- Two operators get two consecutive numbers. Never the same one, and never a hole.

create table if not exists public.invoice_number_series (
  series      text primary key,

  -- The number the NEXT invoice gets, so a fresh series starts at 1.
  next_number integer not null default 1,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint invoice_number_series_series_not_blank check (btrim(series) <> ''),
  constraint invoice_number_series_next_number_positive check (next_number >= 1)
);

comment on table public.invoice_number_series is
  'The per series invoice counter. Holds the number the NEXT invoice in that series will get. Written ONLY by public.issue_invoice, under a row lock, inside the transaction that issues the invoice: no gaps, no duplicates. Not a sequence, because a sequence does not roll back and a rolled back allocation would leave a hole. Card P3-108.';


-- ===========================================================================
-- 4. public.invoices
-- ===========================================================================

create table if not exists public.invoices (
  id                uuid primary key default gen_random_uuid(),

  -- SERIES AND NUMBER ARE NULL ON A DRAFT AND SET TOGETHER WHEN IT IS ISSUED.
  -- The goal line says the number is assigned only on Emite, so a draft has none:
  -- a draft is not a document and must not be able to hold a number it might
  -- never use. The pair is kept consistent by invoices_number_with_series below.
  series            text null,
  number            integer null,

  -- ON DELETE RESTRICT, matching public.projects.client_id in 0016 and
  -- public.devize.project_id in 0025. An invoice is the record of a debt and
  -- cannot be orphaned by the client or project row going away. There is no
  -- delete policy on any of these tables anyway; this is the constraint graph
  -- agreeing with that rather than relying on it.
  client_id         uuid not null references public.clients (id) on delete restrict,

  -- NULLABLE. Not everything invoiced belongs to a building site.
  project_id        uuid null references public.projects (id) on delete restrict,

  -- THE IESIRE IT CAME FROM, NULLABLE, because a manual invoice has none. It is
  -- a real reference and not a copied number, so it cannot point at nothing.
  outbound_issue_id uuid null references public.outbound_issues (id) on delete restrict,

  issue_date        date null,
  due_date          date null,

  status            public.invoice_status not null default 'draft',

  -- PINNED TO MDL FOR THIS PHASE, exactly as devize_currency_mdl does in 0025 and
  -- for the same reason: every computation in this system sums MDL, and storing a
  -- currency the arithmetic ignores is a wrong number waiting to happen. The
  -- constraint is what a later card relaxes, since CLAUDE.md 8.6 permits
  -- ALTER TABLE DROP CONSTRAINT: a constraint is replaced, never edited.
  currency          public.currency_code not null default 'MDL',

  notes             text null,

  -- THE TOTALS, COMPUTED FROM THE LINES BY A TRIGGER AND NEVER ACCEPTED FROM A
  -- CALLER. See section 7c. They are STORED, which is what the goal line asks
  -- for and is the opposite of the choice 0025 made for the deviz: an issued
  -- invoice's total is part of the document the client holds, and a figure
  -- recomputed next year by whatever the formula has become is not the figure that
  -- was sent. Storing it is only safe because the trigger makes it impossible for
  -- the stored number to disagree with the lines it came from.
  subtotal_mdl      numeric(14,2) not null default 0,
  vat_total_mdl     numeric(14,2) not null default 0,
  total_mdl         numeric(14,2) not null default 0,

  -- THE STATE SYSTEM'S OWN NUMBER AND STATUS. NULLABLE AND EMPTY, AND THEY STAY
  -- EMPTY. Moldova's invoice of record goes through e-Factura, the State Tax
  -- Service system, and the design report's section 2 lays out three options for
  -- reaching it. MAX HAS NOT CHOSEN ONE. Nothing in this card writes, reads or
  -- assumes either column, and nothing may until he does. They exist because
  -- adding them later would mean deciding what value the invoices already issued
  -- had, and the answer to that is not recoverable.
  state_system_number text null,
  state_system_status text null,

  -- WHO AND WHEN, for each of the three things that can happen to an invoice.
  -- Written by the trigger in section 7b, not by whichever screen moved the
  -- status, so the record cannot depend on which form was used.
  -- DEFAULTS TO THE SIGNED-IN USER, as documents.uploaded_by does in 0044, so a
  -- writing path cannot forget to record who created the invoice.
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  issued_by         uuid references auth.users (id) on delete set null,
  issued_at         timestamptz null,

  paid_by           uuid references auth.users (id) on delete set null,
  paid_at           timestamptz null,

  cancelled_by      uuid references auth.users (id) on delete set null,
  cancelled_at      timestamptz null,

  -- ASKED FOR AND KEPT. An invoice marked cancelled with nobody knowing why is a
  -- question somebody has to answer from memory six months later.
  cancel_reason     text null,

  -- ONE NUMBER PER SERIES. This is the "no duplicates" half of the numbering, and
  -- it is the thing that turns a wrong allocator into a loud failure instead of
  -- two invoices that both claim to be number 7. PostgreSQL treats NULLs as
  -- distinct, so any number of unnumbered drafts coexist under it.
  constraint invoices_number_unique_per_series unique (series, number),

  -- THE PAIR IS ALL OR NOTHING. A number with no series belongs to no series, and
  -- a series with no number is half an allocation.
  constraint invoices_number_with_series check ((series is null) = (number is null)),

  -- PAST DRAFT AN INVOICE IS NUMBERED. This is the other half of "assigned only
  -- on Emite": nothing can leave draft without a number.
  constraint invoices_numbered_past_draft check (status = 'draft' or number is not null),

  constraint invoices_currency_mdl check (currency = 'MDL'),

  constraint invoices_subtotal_non_negative check (subtotal_mdl >= 0),
  constraint invoices_vat_total_non_negative check (vat_total_mdl >= 0),
  constraint invoices_total_non_negative check (total_mdl >= 0),

  -- A REASON BELONGS TO A CANCELLATION. It cannot sit on an invoice that is still
  -- live, where a reader would take it for a note.
  constraint invoices_cancel_reason_only_when_cancelled
    check (status = 'cancelled' or cancel_reason is null)
);

comment on table public.invoices is
  'Invoices. A draft is freely editable and carries no number. Issuing allocates the next number in its series under a lock and freezes the document. AN INVOICE IS NEVER DELETED: it is cancelled with a reason and KEEPS its number, which is not returned to the pool and not reused. There is no delete policy for any role, owner included. Card P3-108.';

comment on column public.invoices.number is
  'Null until the invoice is issued. Allocated by public.issue_invoice from public.invoice_number_series, under a row lock, inside the issuing transaction. A cancelled invoice keeps the number it was given.';

comment on column public.invoices.state_system_number is
  'The number Moldova e-Factura allocated, if RC ever issues through it. NULLABLE, EMPTY, and nothing in this card or any later one writes it until Max has chosen between the three options in section 2 of docs/reports/2026-09-24-author-facturare-design.md.';

comment on column public.invoices.total_mdl is
  'Computed from the lines by invoice_lines_sync_invoice_totals and never accepted from a caller. Stored rather than derived at read time because an issued invoice total is part of the document the client already holds.';


-- ===========================================================================
-- 5. public.invoice_lines
-- ===========================================================================

create table if not exists public.invoice_lines (
  id                uuid primary key default gen_random_uuid(),

  -- ON DELETE CASCADE. A line has no meaning apart from its invoice. This is the
  -- one cascade in the set and it is deliberate, for the reason 0025 gives about
  -- deviz_lines: nothing can delete an invoice through RLS anyway, so the cascade
  -- describes the ownership rather than opening a path.
  invoice_id        uuid not null references public.invoices (id) on delete cascade,

  -- NULLABLE. A delivery charge is a line and is not a catalogue product. When it
  -- is set, ON DELETE RESTRICT: an invoiced product cannot vanish out from under
  -- the invoice that sold it. Products are deactivated, not deleted.
  product_id        uuid null references public.products (id) on delete restrict,

  -- FREE TEXT FOR A LINE THAT IS NOT A CATALOGUE PRODUCT, and it may also carry a
  -- fuller wording beside a product. One of the two must be there, below.
  description       text null,

  quantity          numeric(14,3) not null,

  -- THE UNIT IS ON THE LINE HERE, WHICH IS THE OPPOSITE OF 0025, AND THAT IS
  -- DELIBERATE. deviz_lines has no unit column because every line of an estimate
  -- is a catalogue product and the unit is read from it. An invoice line need not
  -- have a product at all, so it must be able to say what its quantity is counted
  -- in. When there is a product, the writing side copies the product's unit; the
  -- goal line asks for the column and this is why it is right here and was right
  -- to omit there.
  unit              public.unit_code not null,

  -- THE UNIT PRICE IS A SNAPSHOT AND THIS LINE IS WHERE THAT BECOMES TRUE.
  -- Written once when the line is written, and NEVER refreshed from the catalogue.
  -- No view, function or query in this card or any later one joins an invoice line
  -- to the live product price to produce the invoiced figure. The design report
  -- says why, and the reason is not a nicety:
  --
  --   "the quoted price is a snapshot written once, and nothing refreshes it from
  --   the catalogue. On an invoice that is not a nicety, it is the difference
  --   between a document and a guess."
  --
  -- A default-and-override would look identical on the day it was written and
  -- diverge silently three months later.
  unit_price_mdl    numeric(14,2) not null,

  -- VAT PER LINE IN THE DATABASE, ONE RATE ON SCREEN. The design report's
  -- question 4, recommended default, taken: storing it per line costs nothing now
  -- and cannot be added cheaply later, because retro-fitting a per line rate onto
  -- invoices already issued means deciding what rate the existing ones had.
  vat_rate          numeric(5,2) not null default 0,

  -- COMPUTED BY invoice_lines_compute_totals AND NEVER ACCEPTED FROM A CALLER, so
  -- a line whose total disagrees with its own quantity and price cannot be stored.
  -- No default: the trigger fills them, and BEFORE row triggers run before the
  -- NOT NULL check, so an insert that omits them succeeds and an insert that
  -- supplies a wrong one is corrected rather than believed.
  line_subtotal_mdl numeric(14,2) not null,
  line_vat_mdl      numeric(14,2) not null,
  line_total_mdl    numeric(14,2) not null,

  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint invoice_lines_quantity_positive check (quantity > 0),
  constraint invoice_lines_unit_price_non_negative check (unit_price_mdl >= 0),
  constraint invoice_lines_vat_rate_range check (vat_rate >= 0 and vat_rate <= 100),
  constraint invoice_lines_line_subtotal_non_negative check (line_subtotal_mdl >= 0),
  constraint invoice_lines_line_vat_non_negative check (line_vat_mdl >= 0),
  constraint invoice_lines_line_total_non_negative check (line_total_mdl >= 0),

  -- A LINE SAYS WHAT IT IS FOR. Either it names a catalogue product or it carries
  -- a description somebody can read on the document. A line that is neither is a
  -- charge nobody can explain.
  constraint invoice_lines_product_or_description
    check (product_id is not null or btrim(coalesce(description, '')) <> '')
);

comment on table public.invoice_lines is
  'The lines of one invoice. The unit price is frozen at the moment the line is written and nothing refreshes it from the catalogue. Line totals are computed by a trigger, never accepted from a caller. Lines may be added or changed only while the invoice is a draft, and the database enforces that. Card P3-108.';

comment on column public.invoice_lines.unit_price_mdl is
  'A SNAPSHOT, written once when the line is written and never refreshed from the catalogue. Nothing joins this row to the live product price to produce the invoiced figure. On an invoice that is the difference between a document and a guess.';

comment on column public.invoice_lines.vat_rate is
  'Per cent, PER LINE. One rate is shown for the whole invoice on screen while RC sells one kind of thing; the data already supports a mixed rate invoice and only the screen would change. Retro-fitting a per line rate onto issued invoices is not possible, which is why it is here from the first day.';


-- ===========================================================================
-- 6. INDEXES
-- ===========================================================================
--
-- Every foreign key is indexed on the REFERENCING side, because PostgreSQL
-- indexes only the referenced side and every screen filters on the other one.
--
-- invoice_lines.invoice_id gets its own index: unlike deviz_lines it is NOT the
-- leading column of a unique constraint here, because one product may legitimately
-- appear on two lines of an invoice (two deliveries at two prices), so there is no
-- (invoice_id, product_id) unique constraint to ride on. Said here rather than
-- left to be rediscovered as an omission.

create index if not exists invoices_client_id_idx on public.invoices (client_id);
create index if not exists invoices_project_id_idx on public.invoices (project_id);
create index if not exists invoices_outbound_issue_id_idx on public.invoices (outbound_issue_id);

-- "The invoices of this period in this state, newest first" is the query the list
-- screen of part 2 is made of.
create index if not exists invoices_status_issue_date_idx
  on public.invoices (status, issue_date desc);

create index if not exists invoice_lines_invoice_id_idx on public.invoice_lines (invoice_id);
create index if not exists invoice_lines_product_id_idx on public.invoice_lines (product_id);


-- ===========================================================================
-- 7. TRIGGERS
-- ===========================================================================

drop trigger if exists invoice_settings_set_updated_at on public.invoice_settings;
create trigger invoice_settings_set_updated_at
  before update on public.invoice_settings
  for each row execute function public.set_updated_at();

drop trigger if exists invoice_number_series_set_updated_at on public.invoice_number_series;
create trigger invoice_number_series_set_updated_at
  before update on public.invoice_number_series
  for each row execute function public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

drop trigger if exists invoice_lines_set_updated_at on public.invoice_lines;
create trigger invoice_lines_set_updated_at
  before update on public.invoice_lines
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 7a. AN INVOICE PAST DRAFT IS CANCELLED, NEVER EDITED
-- ---------------------------------------------------------------------------
--
-- This is the no-edit rule, and it is enforced HERE rather than in the interface,
-- in the same shape devize_require_draft_to_edit uses in 0025. The design report's
-- own words: "The screen disables the buttons, but the screen is a courtesy and
-- the database is the guarantee."
--
-- WHAT STAYS CHANGEABLE PAST DRAFT, and it is a short list on purpose:
--
--   status         because an issued invoice has to be able to become paid or
--                  cancelled. That is what the pipeline IS.
--   cancel_reason  because the statement that cancels an invoice writes the reason
--                  in the same UPDATE, and a reason someone worded badly should be
--                  correctable without cancelling a second time.
--   the six stamp columns  issued_by, issued_at, paid_by, paid_at, cancelled_by,
--                  cancelled_at. They are written by invoices_stamp_status below,
--                  which fires AFTER this guard by name order, so the guard always
--                  sees the row exactly as the caller submitted it.
--   updated_at     written by invoices_set_updated_at, same reason.
--
-- Everything a client would read on the document they were sent is frozen: the
-- number, the series, who it is to, which project, which Iesire, the dates, the
-- currency, the notes, the totals and the two e-Factura columns.
--
-- A CORRECTION TO AN ISSUED INVOICE IS THEREFORE NOT AN EDIT. It is a cancellation
-- plus a new invoice, or a credit note, and a credit note is a decision the design
-- report deliberately left out of scope rather than inventing.
--
-- DELETE IS DELIBERATELY NOT COVERED, for the reason 0025 gives: no table here has
-- a delete policy, so no authenticated role can reach a delete at all, and a
-- delete trigger would fire only on a cascade that RLS already forbids and would
-- turn a refusal into an error.

create or replace function public.invoices_require_draft_to_edit()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'draft' then
    return new;
  end if;

  if new.series              is distinct from old.series
     or new.number              is distinct from old.number
     or new.client_id           is distinct from old.client_id
     or new.project_id          is distinct from old.project_id
     or new.outbound_issue_id   is distinct from old.outbound_issue_id
     or new.issue_date          is distinct from old.issue_date
     or new.due_date            is distinct from old.due_date
     or new.currency            is distinct from old.currency
     or new.notes               is distinct from old.notes
     or new.subtotal_mdl        is distinct from old.subtotal_mdl
     or new.vat_total_mdl       is distinct from old.vat_total_mdl
     or new.total_mdl           is distinct from old.total_mdl
     or new.state_system_number is distinct from old.state_system_number
     or new.state_system_status is distinct from old.state_system_status
     or new.created_by          is distinct from old.created_by
  then
    raise exception
      'factura % este % si nu mai este ciorna: doar starea si motivul anularii mai pot fi schimbate, iar o corectie se face prin anulare si o factura noua',
      old.id, old.status
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

comment on function public.invoices_require_draft_to_edit() is
  'P3-108. Past draft only the status, the cancellation reason and the stamp columns may change on an invoice. Everything a client would read on the document they were sent is frozen. The screen is a courtesy; this is the guarantee.';

-- BEFORE invoices_stamp_status ALPHABETICALLY, AND THAT MATTERS. PostgreSQL fires
-- BEFORE row triggers in name order, so 'invoices_require_draft_to_edit' runs
-- before 'invoices_set_updated_at' and 'invoices_stamp_status': the guard sees the
-- row as the caller submitted it, before either has rewritten anything under it.
-- The names are recorded here so a rename does not quietly change that.
drop trigger if exists invoices_require_draft_to_edit on public.invoices;
create trigger invoices_require_draft_to_edit
  before update on public.invoices
  for each row execute function public.invoices_require_draft_to_edit();


-- ---------------------------------------------------------------------------
-- 7b. WHO DID IT AND WHEN, HELD BY THE DATABASE
-- ---------------------------------------------------------------------------
--
-- Set when the status BECOMES issued, paid or cancelled, and never cleared. A
-- rule the database does not hold is a rule the next screen forgets, and this one
-- will have three screens writing a status before parts 2 and 3 are finished.
--
-- NOTHING IS CLEARED WHEN THE STATUS MOVES ON, which is the opposite of
-- devize_sync_approved_at in 0025, and the difference is the subject. There,
-- approved_at answers "is this the accepted version", so it must go away when the
-- version stops being accepted. Here the six columns answer "when was this issued,
-- when was it paid, when was it cancelled", and a cancelled invoice that was
-- issued on the 3rd was still issued on the 3rd.

create or replace function public.invoices_stamp_status()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'issued' and new.issued_at is null then
    new.issued_at := now();
    new.issued_by := coalesce(new.issued_by, auth.uid());
  elsif new.status = 'paid' and new.paid_at is null then
    new.paid_at := now();
    new.paid_by := coalesce(new.paid_by, auth.uid());
  elsif new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
    new.cancelled_by := coalesce(new.cancelled_by, auth.uid());
  end if;

  -- OLD IS NOT READ ANYWHERE ABOVE, deliberately, so this one function serves
  -- INSERT and UPDATE. plpgsql raises "record old is not assigned yet" the moment
  -- a field of OLD is read on an INSERT, and SQL does not promise to short circuit
  -- an OR to stop it happening: 0025 records the same trap on
  -- devize_sync_approved_at.
  return new;
end;
$$;

comment on function public.invoices_stamp_status() is
  'P3-108. Fills issued_at and issued_by, paid_at and paid_by, cancelled_at and cancelled_by the first time the status becomes that value, and never clears them. Held here so the record cannot depend on which screen moved the status.';

drop trigger if exists invoices_stamp_status on public.invoices;
create trigger invoices_stamp_status
  before insert or update on public.invoices
  for each row execute function public.invoices_stamp_status();


-- ---------------------------------------------------------------------------
-- 7c. THE ARITHMETIC IS COMPUTED, NEVER ACCEPTED
-- ---------------------------------------------------------------------------
--
-- Two triggers. The first computes a line's three figures from its own quantity,
-- price and rate. The second adds the lines up onto the invoice. Neither reads a
-- figure a caller supplied, so a stored total that disagrees with the rows it came
-- from cannot exist.
--
-- ROUNDED TO THE BAN ONCE PER FIGURE, at each step, because a column that does
-- not add up is a document nobody signs. The line subtotal is rounded, the VAT is
-- computed from the ROUNDED subtotal and rounded in its turn, and the invoice
-- foot is the sum of figures that are already rounded. That is the order that
-- makes the printed column add up; rounding only at the end does not.

create or replace function public.invoice_lines_compute_totals()
returns trigger
language plpgsql
as $$
begin
  new.line_subtotal_mdl := round(new.quantity * new.unit_price_mdl, 2);
  new.line_vat_mdl      := round(new.line_subtotal_mdl * new.vat_rate / 100, 2);
  new.line_total_mdl    := new.line_subtotal_mdl + new.line_vat_mdl;
  return new;
end;
$$;

comment on function public.invoice_lines_compute_totals() is
  'P3-108. A line subtotal, VAT and total are computed from its quantity, frozen unit price and rate, and are never accepted from a caller. Rounded to the ban once per figure so the printed column adds up.';

drop trigger if exists invoice_lines_compute_totals on public.invoice_lines;
create trigger invoice_lines_compute_totals
  before insert or update on public.invoice_lines
  for each row execute function public.invoice_lines_compute_totals();


create or replace function public.invoice_lines_sync_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update public.invoices i
     set subtotal_mdl  = coalesce(t.subtotal, 0),
         vat_total_mdl = coalesce(t.vat, 0),
         total_mdl     = coalesce(t.total, 0)
    from (
      select sum(l.line_subtotal_mdl) as subtotal,
             sum(l.line_vat_mdl)      as vat,
             sum(l.line_total_mdl)    as total
      from public.invoice_lines l
      where l.invoice_id = v_invoice
    ) t
   where i.id = v_invoice;

  return null;
end;
$$;

-- SECURITY DEFINER, AND THE REASON IS NOT CONVENIENCE. The trigger writes three
-- columns of public.invoices while the caller is inserting into
-- public.invoice_lines. As SECURITY INVOKER that write would be filtered by the
-- invoices UPDATE policy, so the totals would silently stop being maintained for
-- any caller the policy does not cover, and a silently stale total is exactly the
-- failure the storing decision in section 4 accepted a trigger in order to avoid.
-- It can only ever be reached by a caller whose line insert or update the lines
-- policies already allowed, and it writes nothing but the three computed figures
-- of that line's own invoice.
comment on function public.invoice_lines_sync_invoice_totals() is
  'P3-108. Adds the lines of one invoice up onto its subtotal, VAT and total, after every line insert or update. SECURITY DEFINER so the figures cannot silently stop being maintained; it writes only the three computed columns of the invoice whose line the caller just wrote.';

drop trigger if exists invoice_lines_sync_invoice_totals on public.invoice_lines;
create trigger invoice_lines_sync_invoice_totals
  after insert or update on public.invoice_lines
  for each row execute function public.invoice_lines_sync_invoice_totals();


-- ---------------------------------------------------------------------------
-- 7d. A LINE MAY BE ADDED OR CHANGED ONLY WHILE THE INVOICE IS A DRAFT
-- ---------------------------------------------------------------------------
--
-- The same shape as deviz_lines_require_draft in 0025, and INSERT is covered and
-- not only UPDATE: adding a line to an issued invoice changes what was invoiced
-- exactly as much as editing one does, and a trigger that caught only UPDATE
-- would leave the larger half of the hole open.

create or replace function public.invoice_lines_require_draft()
returns trigger
language plpgsql
as $$
declare
  parent_status public.invoice_status;
begin
  -- BOTH SIDES ARE CHECKED ON AN UPDATE, because moving a line from one invoice to
  -- another edits two of them. OLD is read only under an explicit tg_op branch,
  -- for the reason written on invoices_stamp_status.
  if tg_op = 'UPDATE' then
    select i.status into parent_status from public.invoices i where i.id = old.invoice_id;
    if parent_status is distinct from 'draft' then
      raise exception
        'factura % este % si nu mai este ciorna: liniile ei nu se mai schimba, iar o corectie se face prin anulare si o factura noua',
        old.invoice_id, parent_status
        using errcode = 'restrict_violation';
    end if;
  end if;

  select i.status into parent_status from public.invoices i where i.id = new.invoice_id;
  if parent_status is distinct from 'draft' then
    raise exception
      'factura % este % si nu mai este ciorna: liniile ei nu se mai schimba, iar o corectie se face prin anulare si o factura noua',
      new.invoice_id, parent_status
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

comment on function public.invoice_lines_require_draft() is
  'P3-108. Lines may be added or changed only while the parent invoice is a draft. Past draft an invoice is cancelled and replaced, never edited.';

-- AFTER invoice_lines_compute_totals ALPHABETICALLY, which is harmless: the
-- computer only rewrites fields of NEW and has no effect outside the row, so a
-- refusal here discards its work with everything else. Recorded so a rename does
-- not make somebody wonder.
drop trigger if exists invoice_lines_require_draft on public.invoice_lines;
create trigger invoice_lines_require_draft
  before insert or update on public.invoice_lines
  for each row execute function public.invoice_lines_require_draft();


-- ===========================================================================
-- 8. THE NUMBERING, AND THE ONE WAY TO GET A NUMBER
-- ===========================================================================

-- WHAT SERIES DOES A DATE FALL IN. One place decides, so the prefix setting and
-- the year rule cannot be applied two different ways by two screens.
create or replace function public.invoice_series_for(p_on date)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when s.number_includes_year
             then s.series_prefix || to_char(coalesce(p_on, current_date), 'YYYY')
           else s.series_prefix
         end
  from public.invoice_settings s
  where s.id
$$;

comment on function public.invoice_series_for(date) is
  'P3-108. The invoice series a date falls in, from public.invoice_settings: the prefix, plus the year when number_includes_year is true. SECURITY DEFINER so the answer does not depend on whether the caller may read the settings row.';


-- ISSUING AN INVOICE. THE ONLY WAY A NUMBER IS EVER HANDED OUT.
--
-- SECURITY DEFINER, AND THIS IS THE DECISION THAT MAKES THE SERIES TAMPER PROOF.
-- public.invoice_number_series has no write policy and no write grant at all
-- (section 10), so no screen and no token can move a counter, skip a number or
-- reset one. The only door is this function, and it takes the authorization
-- decision itself, on the FIRST line, with the same predicate the write policies
-- use: an ACTIVE profile of any role. A deactivated account, an account with no
-- profile row and nobody signed in are all refused here, exactly as they are by
-- the policies, so the function is not a way around them.
--
-- THE LOCK. `update ... returning` on one row of the counter is a single statement
-- that reads and writes under a row lock. A second transaction running the same
-- statement for the same series BLOCKS until this one ends, then re-reads the row
-- under READ COMMITTED and carries on from the value this one left. So:
--
--   two operators pressing Emite at the same moment  ->  two consecutive numbers
--   the same operator pressing twice                 ->  two consecutive numbers
--   a transaction that fails after allocating        ->  the increment rolls back
--                                                        with it and the number is
--                                                        not consumed
--
-- That last line is the reason this is a counter row and not a sequence. A
-- sequence's nextval is not transactional: a failed attempt would consume a
-- number and leave a hole in a legal series.
--
-- A CANCELLED INVOICE KEEPS ITS NUMBER. Nothing here reads a cancelled row, looks
-- for a free number, or decrements a counter. The next issue takes the next number
-- and the cancelled document stays on the list under the number it was given.

create or replace function public.issue_invoice(
  p_invoice_id uuid,
  p_issue_date date default null,
  p_due_date   date default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_series text;
  v_number integer;
  v_status public.invoice_status;
  v_issue  date := coalesce(p_issue_date, current_date);
  v_row    public.invoices;
begin
  if public.current_app_role() is null then
    raise exception 'doar un cont activ poate emite o factura'
      using errcode = 'insufficient_privilege';
  end if;

  select i.status into v_status from public.invoices i where i.id = p_invoice_id;
  if v_status is null then
    raise exception 'factura % nu exista', p_invoice_id
      using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'factura % este deja % si nu se mai emite', p_invoice_id, v_status
      using errcode = 'restrict_violation';
  end if;

  v_series := public.invoice_series_for(v_issue);
  if v_series is null or btrim(v_series) = '' then
    raise exception 'seria facturilor nu este configurata in Setari'
      using errcode = 'restrict_violation';
  end if;

  -- The counter row for this series, created on first use. A second transaction
  -- doing the same thing at the same moment does nothing and then blocks below.
  insert into public.invoice_number_series (series) values (v_series)
  on conflict (series) do nothing;

  -- THE LOCK AND THE ALLOCATION, ONE STATEMENT.
  update public.invoice_number_series
     set next_number = next_number + 1
   where series = v_series
  returning next_number - 1 into v_number;

  if v_number is null then
    raise exception 'contorul seriei % nu a putut fi citit', v_series
      using errcode = 'restrict_violation';
  end if;

  update public.invoices
     set series     = v_series,
         number     = v_number,
         status     = 'issued',
         issue_date = v_issue,
         due_date   = coalesce(p_due_date, due_date)
   where id = p_invoice_id
     and status = 'draft'
  returning * into v_row;

  if v_row.id is null then
    -- Somebody else issued it between the read above and this write. The whole
    -- transaction rolls back, counter included, so no number is lost.
    raise exception 'factura % a fost emisa de altcineva intre timp', p_invoice_id
      using errcode = 'restrict_violation';
  end if;

  return v_row;
end;
$$;

comment on function public.issue_invoice(uuid, date, date) is
  'P3-108. Issues a draft invoice: allocates the next number in its series from public.invoice_number_series under a row lock, inside this transaction, and moves the invoice to issued. THE ONLY WAY A NUMBER IS HANDED OUT. No gaps, because a rolled back transaction rolls the counter back too; no duplicates, because the allocation is one locking statement and invoices_number_unique_per_series would refuse a second claim anyway. Refuses any caller without an active profile.';


-- ===========================================================================
-- 9. GRANTS
-- ===========================================================================
--
-- REVOKE FROM authenticated FIRST, AND THAT LINE IS THE LOAD BEARING ONE HERE.
-- 0009's header records what this project actually does: "Supabase grants table
-- privileges to anon AND authenticated AT CREATE TABLE TIME, from project-level
-- default privileges". So a table created by this file arrives on the production
-- project with SELECT, INSERT, UPDATE and DELETE already granted to
-- authenticated, and a file that only ADDED grants would leave DELETE in place on
-- every invoice table while claiming in its own header that nothing can be
-- deleted. 0044, 0046 and 0059 all revoke from authenticated before granting for
-- exactly this reason, and this file follows them rather than 0025, which granted
-- delete anyway and so could not tell the difference.
--
-- The anon revoke on top of that is a no-op, as it is in 0013, 0014, 0016 and
-- 0025: 0009 also altered the default privileges so anon gets nothing on a table
-- created afterwards. It is kept so these tables are closed by their own file, and
-- this comment is here so nobody deletes it believing it was load bearing, or
-- keeps it believing it is.
--
-- NO DELETE IS GRANTED ON ANY OF THE FOUR TABLES, to any role. That is the
-- privilege half of "an invoice is never deleted"; section 10 is the policy half,
-- and both are needed, because either one alone would be a rule with a door.
--
-- THE COUNTER IS READ ONLY TO EVERY ROLE. authenticated may SELECT
-- public.invoice_number_series and may not insert, update or delete a row of it.
-- The only writer is public.issue_invoice, which is SECURITY DEFINER. A screen
-- that could move a counter could open a hole in a legal series, and the point of
-- this card is that nothing can.
--
-- THE SETTINGS TAKE NO INSERT EITHER: there is one row, this file wrote it, and a
-- screen that could add a second would make "the settings" ambiguous.

revoke all on table public.invoice_settings from anon;
revoke all on table public.invoice_settings from authenticated;
revoke all on table public.invoice_number_series from anon;
revoke all on table public.invoice_number_series from authenticated;
revoke all on table public.invoices from anon;
revoke all on table public.invoices from authenticated;
revoke all on table public.invoice_lines from anon;
revoke all on table public.invoice_lines from authenticated;

grant select, update on table public.invoice_settings to authenticated;
grant select on table public.invoice_number_series to authenticated;
grant select, insert, update on table public.invoices to authenticated;
grant select, insert, update on table public.invoice_lines to authenticated;

-- FUNCTIONS: REVOKE FROM public FIRST, not from anon. PostgreSQL grants EXECUTE on
-- a new function to PUBLIC by default, and revoking from anon leaves that grant
-- standing, so anon would keep reaching it THROUGH public. 0044 does the same on
-- record_document_deletion and for the same reason.
revoke all on function public.invoice_series_for(date) from public;
revoke all on function public.invoice_series_for(date) from anon;
revoke all on function public.issue_invoice(uuid, date, date) from public;
revoke all on function public.issue_invoice(uuid, date, date) from anon;
revoke all on function public.invoice_lines_sync_invoice_totals() from public;
revoke all on function public.invoice_lines_sync_invoice_totals() from anon;

grant execute on function public.invoice_series_for(date) to authenticated;
grant execute on function public.issue_invoice(uuid, date, date) to authenticated;


-- ===========================================================================
-- 10. ROW LEVEL SECURITY
-- ===========================================================================
--
-- THE PREDICATES ARE THE ONES THAT ALREADY EXIST AND NOTHING IS INVENTED HERE.
-- 0055 established both: an ACTIVE PROFILE OF ANY ROLE is
-- `public.current_app_role() is not null`, and THE OWNER is `public.is_owner()`.
-- 0001 section 6 explains why they are SECURITY DEFINER and why that does not
-- recurse through the profiles policies.
--
-- WHO MAY DO WHAT, and it is the goal line read literally:
--
--   read an invoice or a line     an active profile, any role
--   write an invoice or a line    an active profile, any role (owner or operator)
--   read the settings             an active profile, any role
--   write the settings            THE OWNER ONLY
--   read the counter              an active profile, any role
--   write the counter             NOBODY. Only public.issue_invoice.
--   DELETE ANYTHING               NOBODY, owner included. No policy exists.
--
-- THE SETTINGS ARE OWNER ONLY BECAUSE THE GOAL LINE SAYS SO: "all editable by the
-- owner in Setari". The prefix and the company details decide what every future
-- invoice is called and who it says it is from, which is not an operator's
-- decision. Every other write on these tables is open to an operator, which is
-- the "owner/operator to write" the same line asks for.
--
-- NO DELETE POLICY ON ANY OF THE FOUR TABLES. An invoice referenced by a series,
-- by an accountant or by a client who holds a copy cannot disappear without making
-- that record unreadable. The document store's one deliberate owner-only delete,
-- for a file uploaded to the wrong client, is NOT extended here. Cancellation is a
-- status; deletion is not a feature.

alter table public.invoice_settings enable row level security;
alter table public.invoice_number_series enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

-- CREATE POLICY has no IF NOT EXISTS, which is why this is a block. The shape is
-- 0048's, so the file is re-runnable.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'invoice_settings' and policyname = 'invoice_settings_select') then
    create policy invoice_settings_select on public.invoice_settings
      for select to authenticated using (public.current_app_role() is not null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'invoice_settings' and policyname = 'invoice_settings_owner_update') then
    create policy invoice_settings_owner_update on public.invoice_settings
      for update to authenticated using (public.is_owner()) with check (public.is_owner());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'invoice_number_series' and policyname = 'invoice_number_series_select') then
    create policy invoice_number_series_select on public.invoice_number_series
      for select to authenticated using (public.current_app_role() is not null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'invoices' and policyname = 'invoices_select') then
    create policy invoices_select on public.invoices
      for select to authenticated using (public.current_app_role() is not null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'invoices' and policyname = 'invoices_insert') then
    create policy invoices_insert on public.invoices
      for insert to authenticated with check (public.current_app_role() is not null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'invoices' and policyname = 'invoices_update') then
    create policy invoices_update on public.invoices
      for update to authenticated
      using (public.current_app_role() is not null)
      with check (public.current_app_role() is not null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'invoice_lines' and policyname = 'invoice_lines_select') then
    create policy invoice_lines_select on public.invoice_lines
      for select to authenticated using (public.current_app_role() is not null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'invoice_lines' and policyname = 'invoice_lines_insert') then
    create policy invoice_lines_insert on public.invoice_lines
      for insert to authenticated with check (public.current_app_role() is not null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'invoice_lines' and policyname = 'invoice_lines_update') then
    create policy invoice_lines_update on public.invoice_lines
      for update to authenticated
      using (public.current_app_role() is not null)
      with check (public.current_app_role() is not null);
  end if;
end
$$;


-- ===========================================================================
-- 11. THE RESULT, CHECKED
-- ===========================================================================
--
-- A check, not a change. Four tables with row level security on, no delete policy
-- anywhere, no delete privilege for authenticated anywhere, the counter read only,
-- the settings row present and alone, and anon holding nothing. It holds on every
-- run, which is what makes this file re-runnable rather than merely idempotent
-- looking.

do $$
declare
  n integer;
begin
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relname in ('invoice_settings', 'invoice_number_series', 'invoices', 'invoice_lines')
    and c.relrowsecurity;
  if n <> 4 then
    raise exception 'P3-108: row level security is on % of the four invoice tables, expected 4', n;
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public'
    and tablename in ('invoice_settings', 'invoice_number_series', 'invoices', 'invoice_lines')
    and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-108: % delete policies exist on the invoice tables, expected none', n;
  end if;

  if has_table_privilege('authenticated', 'public.invoices', 'DELETE')
     or has_table_privilege('authenticated', 'public.invoice_lines', 'DELETE')
     or has_table_privilege('authenticated', 'public.invoice_settings', 'DELETE')
     or has_table_privilege('authenticated', 'public.invoice_number_series', 'DELETE') then
    raise exception 'P3-108: authenticated may delete from an invoice table';
  end if;

  if has_table_privilege('authenticated', 'public.invoice_number_series', 'INSERT')
     or has_table_privilege('authenticated', 'public.invoice_number_series', 'UPDATE') then
    raise exception 'P3-108: authenticated may write the invoice number counter';
  end if;

  select count(*) into n from public.invoice_settings;
  if n <> 1 then
    raise exception 'P3-108: invoice_settings holds % rows, expected exactly 1', n;
  end if;

  if has_table_privilege('anon', 'public.invoices', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('anon', 'public.invoice_lines', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('anon', 'public.invoice_settings', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('anon', 'public.invoice_number_series', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'P3-108: anon holds a privilege on an invoice table';
  end if;
end
$$;

commit;


-- ===========================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ===========================================================================
--
-- NO SCREEN BEYOND THE SETARI ENTRIES. There is no sidebar entry, no /facturare
-- route and no invoice page in this card. Those are parts 2 and 3 of goal G65 and
-- they are separate pull requests. The existing rule that nothing appears in the
-- menu that cannot be used yet is the reason the order is this way round.
--
-- NO PDF AND NO e-FACTURA. The design report's section 2 lays out three options
-- for Moldova's state system and Max has not chosen one. state_system_number and
-- state_system_status exist, nullable and empty, and stay empty until he does.
-- Nothing here produces a document, and this project still has no PDF capability.
--
-- NO COLUMN IS ADDED TO ANY EXISTING TABLE. The design report names the client's
-- VAT registration code as a possible addition and the goal line for part 1 does
-- not ask for it, so it is not added here rather than added on a terminal's
-- judgement. It is a one column additive migration on the day a card asks for it.
--
-- NOTHING WRITES public.status_history WHEN AN INVOICE STATUS CHANGES. That is the
-- same seam 0016 and 0025 both documented: public.status_entity does not carry an
-- 'invoice' value, and adding an enum label is a migration of its own, in the card
-- that needs the history. The six stamp columns carry who and when in the
-- meantime, which is what part 1 was asked for.
--
-- NOTHING CANCELS AN INVOICE FOR YOU. Cancelling is an UPDATE that sets the status
-- and the reason, which the guard in 7a permits and the trigger in 7b stamps. A
-- cancel FUNCTION with its own rules belongs to part 3, which owns the screen that
-- presses the button.


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- These grids go into the pull request body, verbatim. Every one of them is also
-- asserted, so a failure fails the pull request rather than waiting to be read off
-- a grid: scripts/poc-free/local-db/assertions/0063_invoices.sql.

select
  c.relname        as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.polname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname in ('invoice_settings', 'invoice_number_series', 'invoices', 'invoice_lines')
group by c.relname, c.relrowsecurity
order by c.relname;

select policyname, cmd, roles, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in ('invoice_settings', 'invoice_number_series', 'invoices', 'invoice_lines')
order by tablename, policyname;

select e.enumlabel, e.enumsortorder
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public' and t.typname = 'invoice_status'
order by e.enumsortorder;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.invoice_settings'::regclass,
  'public.invoice_number_series'::regclass,
  'public.invoices'::regclass,
  'public.invoice_lines'::regclass
)
order by conrelid::regclass::text, conname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('invoice_settings', 'invoice_number_series', 'invoices', 'invoice_lines')
order by tablename, indexname;

select c.relname as table_name, t.tgname as trigger_name, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('invoice_settings', 'invoice_number_series', 'invoices', 'invoice_lines')
  and not t.tgisinternal
order by c.relname, t.tgname;

select series, next_number from public.invoice_number_series order by series;

select series_prefix, number_includes_year, default_vat_rate from public.invoice_settings;
