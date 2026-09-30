-- assertions/0066_invoice_settings_company_contact.sql
-- Card P3-116, goal G69 part 4. What 0066 must have left behind, and what it must
-- NOT have changed.
--
-- FIVE GROUPS:
--
--   1. THE SHAPE. The three new columns exist, are plain text, are nullable and
--      carry no default; the five company columns 0063 wrote are still there,
--      still nullable text; the single-row primary key trick is untouched.
--   2. NOTHING WAS WRITTEN. The one existing row reads null in all three new
--      columns, and 0066 performed no insert, no update and no delete: the row
--      count is still exactly one and the five old values are still null.
--   3. THE ROUND TRIP, AND THE THREE NUMBERS STAY THREE. All three new columns
--      accept a value and give it back; writing the VAT CODE leaves the VAT RATE
--      and the IDNO alone, and writing the RATE leaves the CODE alone. This is the
--      SQL half of the card's acceptance line about the rate and the code being
--      separate; the screen half is tests/e2e/setari-date-firma.spec.ts.
--   4. NO NEW PERMISSION. The policy set on invoice_settings is still exactly the
--      two 0063 created, nobody gained a delete privilege, an ACCOUNT MANAGER
--      cannot change any of the three new columns, the OWNER can, and anon reads
--      nothing. The owner case is the witness: without it this group would pass on
--      a table nobody at all may write.
--   5. 0063 AND 0064 ARE UNTOUCHED. The series prefix constraint, the VAT rate
--      range, the single-row check and invoice_series_for still behave, so a
--      migration that only meant to add three columns is proved not to have moved
--      the numbering.
--
-- WHAT IS DELIBERATELY NOT ASSERTED HERE, SAID SO NOBODY READS IT AS PROVEN.
-- Everything on the screen: that Date firma shows all eight fields, that it reuses
-- the five Romanian labels the Facturare block already shows, that an empty field
-- shows as empty rather than as a dash, that the phone layout holds at 390x844,
-- and that the invoice still prints the issuer from this same row. A schema
-- carries no interface text (0063's own header says so, and the refusals here are
-- written without diacritics for that reason). Those are the four cases of
-- tests/e2e/setari-date-firma.spec.ts, against a real local Supabase stack.
--
-- Everything runs inside a transaction that is rolled back.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  n    integer;
  want text;
begin
  -- --- THE THREE NEW COLUMNS, ONE BY ONE SO THE ERROR NAMES THE CULPRIT -----
  foreach want in array array['issuer_vat_code', 'issuer_phone', 'issuer_email']
  loop
    select count(*) into n
    from information_schema.columns
    where table_schema = 'public' and table_name = 'invoice_settings'
      and column_name = want
      and data_type = 'text' and is_nullable = 'YES' and column_default is null;
    if n <> 1 then
      raise exception 'P3-116: invoice_settings.% is not a nullable text column with no default', want;
    end if;
  end loop;

  -- --- THE FIVE 0063 WROTE ARE STILL EXACTLY WHAT THEY WERE -----------------
  -- A migration that added three columns and quietly retyped or tightened one of
  -- these would be the failure nobody notices until an invoice prints.
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'invoice_settings'
    and column_name in ('issuer_name', 'issuer_fiscal_code', 'issuer_address', 'issuer_bank', 'issuer_iban')
    and data_type = 'text' and is_nullable = 'YES' and column_default is null;
  if n <> 5 then
    raise exception 'P3-116: % of 0063 five company columns are still nullable text with no default', n;
  end if;

  -- --- THE SINGLE ROW IS STILL ENFORCED BY THE DATABASE ---------------------
  select count(*) into n from pg_constraint
  where conrelid = 'public.invoice_settings'::regclass
    and conname = 'invoice_settings_single_row' and contype = 'c';
  if n <> 1 then
    raise exception 'P3-116: the single-row check on invoice_settings is gone';
  end if;

  select count(*) into n from pg_class
  where oid = 'public.invoice_settings'::regclass and relrowsecurity;
  if n <> 1 then
    raise exception 'P3-116: row level security is not enabled on invoice_settings';
  end if;
end
$$;


-- ===========================================================================
-- 2. NOTHING WAS WRITTEN
-- ===========================================================================

do $$
declare
  n integer;
  r record;
begin
  select count(*) into n from public.invoice_settings;
  if n <> 1 then
    raise exception 'P3-116: invoice_settings holds % rows, expected exactly 1', n;
  end if;

  select * into r from public.invoice_settings where id;
  if r.issuer_vat_code is not null then
    raise exception 'P3-116: 0066 WROTE issuer_vat_code, expected null. Got: %', r.issuer_vat_code;
  end if;
  if r.issuer_phone is not null then
    raise exception 'P3-116: 0066 WROTE issuer_phone, expected null. Got: %', r.issuer_phone;
  end if;
  if r.issuer_email is not null then
    raise exception 'P3-116: 0066 WROTE issuer_email, expected null. Got: %', r.issuer_email;
  end if;

  -- AND IT DID NOT TOUCH THE OTHER HALF EITHER. On a freshly applied database the
  -- five company fields are null and the three settings are 0063's defaults,
  -- which is what "nothing that works today changes" means in numbers.
  if r.issuer_name is not null or r.issuer_fiscal_code is not null
     or r.issuer_address is not null or r.issuer_bank is not null or r.issuer_iban is not null then
    raise exception 'P3-116: 0066 wrote one of 0063 five company fields';
  end if;
  if r.series_prefix <> 'RC-' or not r.number_includes_year or r.default_vat_rate <> 20 then
    raise exception 'P3-116: 0066 changed the numbering or the rate: % / % / %',
      r.series_prefix, r.number_includes_year, r.default_vat_rate;
  end if;
end
$$;


-- ===========================================================================
-- 3. THE ROUND TRIP, AND THE THREE NUMBERS STAY THREE
-- ===========================================================================
--
-- THE IDNO, THE VAT CODE AND THE VAT RATE ARE THREE DIFFERENT THINGS. The first
-- two are identifiers of a company and the third is a per cent applied to a line.
-- A tidy-up that blurred any pair of them would print a wrong document, so the
-- independence is stated in SQL rather than trusted to the naming.

do $$
declare
  r record;
begin
  update public.invoice_settings set
    issuer_fiscal_code = '1002600000001',
    issuer_vat_code    = '0800001',
    issuer_phone       = '+373 22 000 000',
    issuer_email       = 'p3-116@rc-inventory.local'
  where id;

  select * into r from public.invoice_settings where id;
  if r.issuer_vat_code <> '0800001' then
    raise exception 'P3-116: issuer_vat_code read back as %, expected 0800001', r.issuer_vat_code;
  end if;
  if r.issuer_phone <> '+373 22 000 000' then
    raise exception 'P3-116: issuer_phone read back as %', r.issuer_phone;
  end if;
  if r.issuer_email <> 'p3-116@rc-inventory.local' then
    raise exception 'P3-116: issuer_email read back as %', r.issuer_email;
  end if;

  -- THE IDNO IS ITS OWN NUMBER: writing the VAT code did not become the IDNO.
  if r.issuer_fiscal_code <> '1002600000001' then
    raise exception 'P3-116: the IDNO is now %, expected 1002600000001', r.issuer_fiscal_code;
  end if;
  if r.issuer_fiscal_code = r.issuer_vat_code then
    raise exception 'P3-116: the IDNO and the VAT code hold ONE value, they are two numbers';
  end if;

  -- --- CHANGING THE CODE DOES NOT CHANGE THE RATE ---------------------------
  if r.default_vat_rate <> 20 then
    raise exception 'P3-116: writing the VAT code moved the VAT rate to %', r.default_vat_rate;
  end if;

  -- --- AND CHANGING THE RATE DOES NOT CHANGE THE CODE -----------------------
  update public.invoice_settings set default_vat_rate = 8 where id;
  select * into r from public.invoice_settings where id;
  if r.default_vat_rate <> 8 then
    raise exception 'P3-116: the rate did not move, so this block proves nothing';
  end if;
  if r.issuer_vat_code <> '0800001' then
    raise exception 'P3-116: writing the VAT rate changed the VAT code to %', r.issuer_vat_code;
  end if;

  -- --- AN EMPTIED FIELD GOES BACK TO NULL AND NOT TO A SPACE ---------------
  -- The application sends null for a blank box (orNull in facturare-actions.ts),
  -- and null is what the screen draws as empty. Nothing here forbids a blank
  -- string, so the property asserted is that null survives a write.
  update public.invoice_settings set issuer_phone = null, default_vat_rate = 20 where id;
  select * into r from public.invoice_settings where id;
  if r.issuer_phone is not null then
    raise exception 'P3-116: issuer_phone would not go back to null';
  end if;
  if r.issuer_email <> 'p3-116@rc-inventory.local' then
    raise exception 'P3-116: clearing the phone cleared the email as well';
  end if;
end
$$;


-- ===========================================================================
-- 4. NO NEW PERMISSION
-- ===========================================================================

do $$
declare
  n integer;
begin
  -- EXACTLY THE TWO POLICIES 0063 CREATED, AND NO THIRD.
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'invoice_settings';
  if n <> 2 then
    raise exception 'P3-116: invoice_settings carries % policies, expected the two 0063 created', n;
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'invoice_settings'
    and policyname = 'invoice_settings_select' and cmd = 'SELECT';
  if n <> 1 then
    raise exception 'P3-116: invoice_settings_select is gone or is no longer a select policy';
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'invoice_settings'
    and policyname = 'invoice_settings_owner_update' and cmd = 'UPDATE'
    and coalesce(qual, '') like '%is_owner()%'
    and coalesce(with_check, '') like '%is_owner()%';
  if n <> 1 then
    raise exception 'P3-116: invoice_settings_owner_update is no longer an owner-only update';
  end if;

  -- NOBODY GAINED A DELETE OR AN INSERT. There is one row and it is never removed.
  if has_table_privilege('authenticated', 'public.invoice_settings', 'DELETE')
     or has_table_privilege('authenticated', 'public.invoice_settings', 'INSERT') then
    raise exception 'P3-116: authenticated may now delete or insert invoice_settings';
  end if;
  if has_table_privilege('anon', 'public.invoice_settings', 'SELECT') then
    raise exception 'P3-116: anon may now read invoice_settings';
  end if;
end
$$;

-- THE FIXTURES: an owner and an active account manager, built here and rolled back.
insert into auth.users (id, email) values
  ('e3660000-0000-4000-8000-000000000001', 'p3-116-owner@rc-inventory.local'),
  ('e3660000-0000-4000-8000-000000000002', 'p3-116-operator@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3660000-0000-4000-8000-000000000001', 'p3-116-owner@rc-inventory.local', 'owner', true),
  ('e3660000-0000-4000-8000-000000000002', 'p3-116-operator@rc-inventory.local', 'account_manager', true);

-- A known starting value, written as the table owner, so the refusal below has
-- something to fail to change.
update public.invoice_settings set
  issuer_vat_code = 'BEFORE-CODE',
  issuer_phone    = 'BEFORE-PHONE',
  issuer_email    = 'BEFORE-EMAIL'
where id;

-- --- AN ACCOUNT MANAGER READS THE ROW AND CHANGES NONE OF THE THREE ---------
set local role authenticated;
set local request.jwt.claims = '{"sub":"e3660000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  n integer;
begin
  -- Reading is open to any signed in account, which 0063 decided and this file
  -- does not change: the company details appear on a document the operator sends.
  select count(*) into n from public.invoice_settings;
  if n <> 1 then
    raise exception 'P3-116: a signed-in account manager reads % settings rows, expected 1', n;
  end if;

  -- The owner-only policy lets no row through, so an update touches nothing and
  -- raises nothing. The proof is the value read back after `reset role`.
  update public.invoice_settings set
    issuer_vat_code = 'OP-CODE', issuer_phone = 'OP-PHONE', issuer_email = 'OP-EMAIL'
  where id;
end
$$;

reset role;

do $$
declare
  r record;
begin
  select * into r from public.invoice_settings where id;
  if r.issuer_vat_code <> 'BEFORE-CODE' then
    raise exception 'P3-116: an ACCOUNT MANAGER changed the VAT code to %', r.issuer_vat_code;
  end if;
  if r.issuer_phone <> 'BEFORE-PHONE' then
    raise exception 'P3-116: an ACCOUNT MANAGER changed the phone to %', r.issuer_phone;
  end if;
  if r.issuer_email <> 'BEFORE-EMAIL' then
    raise exception 'P3-116: an ACCOUNT MANAGER changed the email to %', r.issuer_email;
  end if;
end
$$;

-- --- THE OWNER CAN, AND THIS IS THE WITNESS ---------------------------------
-- Without it group 4 would pass just as happily on a table nobody may write at
-- all, which is a wall and not a permission.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e3660000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
begin
  update public.invoice_settings set
    issuer_vat_code = 'OWNER-CODE', issuer_phone = 'OWNER-PHONE', issuer_email = 'OWNER-EMAIL'
  where id;
end
$$;

reset role;

do $$
declare
  r record;
begin
  select * into r from public.invoice_settings where id;
  if r.issuer_vat_code <> 'OWNER-CODE' or r.issuer_phone <> 'OWNER-PHONE'
     or r.issuer_email <> 'OWNER-EMAIL' then
    raise exception 'P3-116: the OWNER could not change the three new fields: % / % / %',
      r.issuer_vat_code, r.issuer_phone, r.issuer_email;
  end if;
end
$$;

-- --- NOBODY SIGNED IN REACHES THE ROW --------------------------------------
set local role anon;

do $$
declare
  refused boolean := false;
begin
  begin
    perform 1 from public.invoice_settings limit 1;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then
    raise exception 'P3-116: anon READ public.invoice_settings';
  end if;
end
$$;

reset role;


-- ===========================================================================
-- 5. 0063 AND 0064 ARE UNTOUCHED
-- ===========================================================================
--
-- THE NUMBERING IS THE THING THIS CARD WAS FORBIDDEN TO MOVE. Three added columns
-- should not be able to reach it, and that is exactly why it is measured.

do $$
declare
  refused boolean;
  got     text;
begin
  -- A BLANK PREFIX IS STILL REFUSED (0063's check).
  refused := false;
  begin
    update public.invoice_settings set series_prefix = '   ' where id;
  exception when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-116: a blank series prefix was ACCEPTED';
  end if;

  -- A RATE ABOVE 100 IS STILL REFUSED (0063's range check).
  --
  -- 200 AND NOT 2000, AND THE DIFFERENCE IS WHICH GUARD IS UNDER TEST. The column is
  -- numeric(5,2), so 2000 does not fit the TYPE and postgres raises 22003
  -- numeric_value_out_of_range before any constraint is evaluated: this block caught
  -- check_violation, so it fell over instead of passing, and the guard it claimed to
  -- measure had not been reached at all. 200 fits the type (999.99 is the ceiling)
  -- and breaks invoice_settings_default_vat_rate_range, which IS 0063's check and IS
  -- what this line is for. A typed 2000 is refused too, one layer earlier, and that
  -- is the type rather than this file's business.
  refused := false;
  begin
    update public.invoice_settings set default_vat_rate = 200 where id;
  exception when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-116: a VAT rate of 200 per cent was ACCEPTED';
  end if;

  -- A SECOND ROW IS STILL IMPOSSIBLE (the boolean primary key pinned to true).
  refused := false;
  begin
    insert into public.invoice_settings (id) values (false);
  exception when check_violation then refused := true;
       when unique_violation then refused := true;
  end;
  if not refused then
    raise exception 'P3-116: a SECOND invoice_settings row was ACCEPTED';
  end if;

  -- AND THE SERIES A DAY FALLS IN IS STILL COMPUTED BY THE SAME FUNCTION, from
  -- the same row, with the prefix 0063 put there.
  update public.invoice_settings set series_prefix = 'RC-', number_includes_year = true where id;
  got := public.invoice_series_for(date '2026-06-15');
  if got <> 'RC-2026' then
    raise exception 'P3-116: invoice_series_for returned %, expected RC-2026', got;
  end if;
end
$$;

rollback;
