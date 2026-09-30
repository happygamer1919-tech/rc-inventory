-- 0066_invoice_settings_company_contact.sql
-- RC Inventory phase 3, card P3-116, goal G69 part 4, the last part of that goal.
-- Date firma: Rapid Construct's own details in one place in Setari. Three of the
-- nine fields the owner asked for do not exist anywhere yet, and this file is the
-- only thing standing between them and the screen.
--
-- THE SPECIFICATION IS docs/reports/2026-09-30-author-setari-design.md, the
-- Date firma subsection of section 3 and Part 2 of section 4. Max answered its
-- question about these three fields with one word, recorded in the factory as
-- mailbox/answers/q100-poc-date-firma-yes.md: "yes to the VAT registration code,
-- phone and email on Date firma. Additive migration only."
--
-- WHAT IT ADDS, AND IT CHANGES AND REMOVES NOTHING
--
--   column  public.invoice_settings.issuer_vat_code  text, nullable, no default
--   column  public.invoice_settings.issuer_phone     text, nullable, no default
--   column  public.invoice_settings.issuer_email     text, nullable, no default
--
-- THERE IS NO SECOND TABLE AND NO COPY. The five company fields that already
-- exist (issuer_name, issuer_fiscal_code, issuer_address, issuer_bank,
-- issuer_iban) are 0063's and are not touched, not duplicated and not moved. The
-- design note gives the reason in one sentence worth keeping: two places holding
-- one company's IDNO is exactly how they come to disagree, and the one that is
-- wrong is always the one that got printed. Date firma reads and writes this same
-- single row.
--
-- NO DROP TABLE, NO TRUNCATE, NO DELETE, NO DROP COLUMN, NO UPDATE AND NO INSERT
-- RUN IN THIS FILE. Nothing that works today changes: the one existing row reads
-- null in all three new columns until the owner types something into them, and
-- null is exactly what the screen already shows as empty. No grant, no policy, no
-- constraint, no trigger and no function is added or altered, so who may read
-- this row and who may change it are the same two answers as before
-- (invoice_settings_select for any signed in account, invoice_settings_owner_update
-- for the owner alone, both from 0063).
--
-- THE VAT CODE IS NOT THE IDNO, AND IT IS NOT THE VAT RATE EITHER. Three numbers
-- that a tidy-up could blur into each other, so each is named here:
--   issuer_fiscal_code  the IDNO, the company's state registration number (0063)
--   issuer_vat_code     the VAT registration code, given when a company registers
--                       as a VAT payer, a DIFFERENT number from the IDNO
--   default_vat_rate    a PER CENT applied to an invoice line (0063), not an
--                       identifier of anybody
-- The earlier invoice design note already drew the first distinction on the
-- CLIENT's side, so drawing the same one on Rapid Construct's own side is
-- consistent rather than new.
--
-- NO LOGO IN THIS FILE and none anywhere else in this card. The design note
-- recommends it waits until there is a document to print it on, and the invoice
-- PDF is not built. A logo would follow the product-photograph mechanism, a
-- private object plus a short lived signed link, and none of that is started.
--
-- WHY NOT NOT NULL WITH A DEFAULT OF THE EMPTY STRING. Because the five columns
-- beside them are nullable and empty, for 0063's own stated reason: this schema
-- invents no company data, the owner types it in Setari, and a blank half of a
-- document must be visible. A sixth shape for the same kind of value would be a
-- second rule to remember.
--
-- WHY NO CHECK ON THE EMAIL OR THE PHONE. Nothing in RC constrains the shape of
-- either: public.clients.email and public.clients.phone are plain nullable text,
-- and a Moldovan landline, a mobile and an international number are three shapes
-- a regular expression gets wrong before it gets right. The screen is where a
-- typo is caught, by the person who typed it.
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. Three added nullable
-- columns is the whole of what reaches the live database, and no existing row
-- loses or changes a value.
--
-- IT RUNS AS ONE TRANSACTION and IS safe to run twice: `add column if not exists`
-- and `comment on column` are both repeatable.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs every assertion file,
-- scripts/poc-free/local-db/assertions/0066_invoice_settings_company_contact.sql
-- among them.

begin;


-- ===========================================================================
-- 1. THE THREE COLUMNS
-- ===========================================================================

alter table public.invoice_settings
  add column if not exists issuer_vat_code text,
  add column if not exists issuer_phone    text,
  add column if not exists issuer_email    text;

comment on column public.invoice_settings.issuer_vat_code is
  'Card P3-116. Rapid Construct own VAT registration code, the number given when a company registers as a VAT payer. A DIFFERENT NUMBER FROM issuer_fiscal_code, which is the IDNO, and not the same thing as default_vat_rate, which is a per cent applied to a line. Nullable and empty until the owner types it in Setari, Date firma.';

comment on column public.invoice_settings.issuer_phone is
  'Card P3-116. Rapid Construct own telephone number, as the owner types it. No shape is enforced here, for the same reason public.clients.phone enforces none: a landline, a mobile and an international number are three shapes a pattern gets wrong before it gets right. Nullable.';

comment on column public.invoice_settings.issuer_email is
  'Card P3-116. Rapid Construct own email address, as the owner types it. No shape is enforced here, exactly as public.clients.email enforces none. Nullable.';


-- ===========================================================================
-- 2. THE TABLE COMMENT NOW NAMES EIGHT COMPANY FIELDS AND NOT FIVE
-- ===========================================================================
--
-- 0063's sentence is kept word for word and extended, not rewritten: a reader
-- arriving from 0063 must still recognise what they read there.

comment on table public.invoice_settings is
  'One row. The invoice series prefix, whether the year goes in the number, the default VAT rate, and Rapid Construct own issuer details. Owner editable from Setari. The single row is enforced by a boolean primary key pinned to true. Card P3-108. CARD P3-116 ADDED THREE MORE COMPANY FIELDS: issuer_vat_code, issuer_phone and issuer_email, so the eight company fields are the whole of Date firma and there is no second place holding any of them.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: the three new columns, all text, all nullable, no default; the five
-- from 0063 unchanged beside them; and still exactly one row.

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'invoice_settings'
  and column_name in (
    'issuer_name', 'issuer_fiscal_code', 'issuer_address', 'issuer_bank', 'issuer_iban',
    'issuer_vat_code', 'issuer_phone', 'issuer_email'
  )
order by column_name;

select count(*) as rows_in_invoice_settings from public.invoice_settings;
