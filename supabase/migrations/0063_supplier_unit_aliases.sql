-- 0063_supplier_unit_aliases.sql
-- RC Inventory phase 3, card P3-102, Ivan's finding F23, goal G59.
-- What this supplier's word for a unit means, remembered after the operator has
-- answered it once.
--
-- WHY. The synonym map in lib/data/unit-synonyms.ts knows the words this project
-- has seen: set, litri, buc, mp, ml, kg and their spellings. It cannot know every
-- word every supplier prints. When a word does not map, the operator picks an
-- existing unit from the dropdown, and until this table that answer died with the
-- document: the next delivery note from the same supplier asked the same question
-- again. The word stays visible as "Pe document: <word>" either way, so nothing
-- the supplier wrote is lost.
--
-- WHAT IT ADDS, AND IT CHANGES AND REMOVES NOTHING
--
--   table   public.supplier_unit_aliases                new, append-only
--   index   supplier_unit_aliases_lookup_idx            (supplier_key, unit_raw_key, created_at desc)
--   check   supplier_unit_aliases_supplier_key_filled   the key has a character that is not white space
--   check   supplier_unit_aliases_unit_raw_key_filled   the same for the document's word
--   policy  supplier_unit_aliases_select                any ACTIVE profile, as clients_select today
--   policy  supplier_unit_aliases_insert                any ACTIVE profile, as itself
--
-- NO UPDATE, NO DELETE, NO DROP AND NO TRUNCATE RUN IN THIS FILE. No existing
-- table, column, function, policy, grant or row is touched.
--
-- APPEND ONLY, AND THE READER TAKES THE NEWEST. There is no unique key and no
-- update policy. An operator who answers the same word differently next month
-- writes a second row, the reader takes the newest, and what was chosen before
-- stays readable. An alias that can be overwritten in place is a record of the
-- present that claims to be a record of the past, which is the reason 0001 gives
-- for status_history and 0059 gives for client_notes.
--
-- NO CONVERSION LIVES HERE EITHER, and the shape makes it impossible: there is no
-- factor column. A row says "this supplier's word means this unit". It never says
-- how many of one make the other. 0030's capitals apply unchanged.
--
-- IT REMEMBERS A CHOICE, IT NEVER MAKES ONE. The remembered unit prefills the
-- dropdown on the next document from that supplier. It is a suggestion on a
-- screen the operator is already reading and can change, exactly like every other
-- extracted value: what is saved is what is on screen at confirmation.
--
-- THE KEYS ARE FOLDED IN THE APPLICATION, not by a database function, and both
-- are stored already folded. `supplier_key` is the supplier name of the document
-- lowercased without diacritics; `unit_raw_key` is the document's word trimmed,
-- lowercased, without diacritics and without full stops, so `set.`, `Set` and
-- `set` are one key. lib/data/unit-synonyms.ts owns both and is the only writer,
-- so the folding a row was written with and the folding a row is read with cannot
-- disagree.
--
-- ROW LEVEL SECURITY, LIKE THE CLIENTS TABLE AS IT IS TODAY:
--   select  `public.current_app_role() is not null`, as clients_select since 0055.
--           An active profile reads every alias, a deactivated one reads none.
--   insert  the same, plus the author must be the caller. NOT is_owner(): an
--           account manager confirms supplier documents, which is the one screen
--           that writes here, so an owner-only insert would mean the person doing
--           the work can never teach the system anything.
--   update  NO POLICY AND NO GRANT. See append only, above.
--   delete  NO POLICY AND NO GRANT.
-- anon is revoked explicitly, as 0013 and 0059 do, although 0009 already closed it.
--
-- MERGING THIS FILE APPLIES IT TO PRODUCTION, within about two minutes, through
-- the Supabase GitHub app. CLAUDE.md 8.0 and ruling R-124. The application reads
-- and writes the table only once the schema gate hasSupplierUnitAliases sees it;
-- until then the review screen behaves exactly as it does today, minus nothing:
-- the synonym map needs no database at all.
--
-- IT RUNS AS ONE TRANSACTION and IS safe to run twice: `create table if not
-- exists`, `create index if not exists`, and `drop policy if exists` before each
-- `create policy` (a DROP POLICY removes a rule about rows, never a row; there is
-- none to remove the first time).
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs every assertion file,
-- scripts/poc-free/local-db/assertions/0063_supplier_unit_aliases.sql among them.

begin;


-- ===========================================================================
-- 1. THE TABLE
-- ===========================================================================

create table if not exists public.supplier_unit_aliases (
  id            uuid              primary key default gen_random_uuid(),
  supplier_key  text              not null,
  unit_raw_key  text              not null,
  unit          public.unit_code  not null,
  created_by    uuid              default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz       not null default now(),
  constraint supplier_unit_aliases_supplier_key_filled check (supplier_key ~ '[^[:space:]]'),
  constraint supplier_unit_aliases_unit_raw_key_filled check (unit_raw_key ~ '[^[:space:]]')
);

comment on table public.supplier_unit_aliases is
  'Card P3-102, finding F23. What a supplier''s own word for a unit of measure means, remembered after the operator has answered it once on the extraction review screen. Append only: the reader takes the newest row for a (supplier_key, unit_raw_key) pair. Carries no conversion factor and never can: a row renames a unit, it never multiplies a quantity.';

comment on column public.supplier_unit_aliases.supplier_key is
  'The document supplier name, folded by the application: trimmed, lowercased, diacritics removed, runs of white space collapsed.';

comment on column public.supplier_unit_aliases.unit_raw_key is
  'The word printed on the document, folded the same way and with full stops removed, so set. and Set and set are one key.';

comment on column public.supplier_unit_aliases.created_by is
  'Who answered. Filled by auth.uid() by default, and the insert policy requires it to be the caller.';


-- ===========================================================================
-- 2. THE INDEX
-- ===========================================================================
-- The review screen reads one supplier's aliases and takes the newest per word.

create index if not exists supplier_unit_aliases_lookup_idx
  on public.supplier_unit_aliases (supplier_key, unit_raw_key, created_at desc);


-- ===========================================================================
-- 3. ROW LEVEL SECURITY
-- ===========================================================================

revoke all on table public.supplier_unit_aliases from anon;
revoke all on table public.supplier_unit_aliases from authenticated;

grant select, insert on table public.supplier_unit_aliases to authenticated;

alter table public.supplier_unit_aliases enable row level security;

drop policy if exists supplier_unit_aliases_select on public.supplier_unit_aliases;

create policy supplier_unit_aliases_select on public.supplier_unit_aliases
  for select to authenticated
  using (public.current_app_role() is not null);

drop policy if exists supplier_unit_aliases_insert on public.supplier_unit_aliases;

create policy supplier_unit_aliases_insert on public.supplier_unit_aliases
  for insert to authenticated
  with check (public.current_app_role() is not null and created_by = auth.uid());

-- No update policy and no delete policy, and neither privilege is granted:
-- an answer that was given is a fact about the day it was given.

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: public.supplier_unit_aliases with rowsecurity true and exactly two
-- policies, supplier_unit_aliases_select (SELECT) and supplier_unit_aliases_insert
-- (INSERT); authenticated holds SELECT and INSERT only; anon holds nothing.

select c.relname, c.relrowsecurity, count(p.polname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'supplier_unit_aliases'
group by c.relname, c.relrowsecurity;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'supplier_unit_aliases'
order by policyname;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'supplier_unit_aliases'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
