-- assertions/0090_client_import_insert_guard.sql
-- Card P3-338. The client and lead imports write each new client through
-- public.import_insert_client, which takes a transaction advisory lock, looks for
-- a stored client the row would duplicate by the keys of the import plans (email;
-- name plus the last 8 digits of the phone for clients; the phone alone for
-- leads) and only then inserts. Two imports of an overlapping file therefore
-- create one client.
--
--   1. THE SHAPE. One function public.import_insert_client(jsonb, text, text,
--      text, text[]), SECURITY INVOKER, executable by authenticated and not by
--      anon, its comment naming P3-338, its body taking pg_advisory_xact_lock.
--   2. THE OWNER, with a real role switch and a JWT, against stored clients:
--        a_new          a row nobody has is inserted and its id comes back
--        a_defaults     the inserted row has the column defaults it had before
--                       (active true, a created_at, a stage), because only the
--                       columns the app sends are written
--        b_email        the same email, however it is cased or padded in the
--                       stored row, is a duplicate by email and writes nothing
--        c_name_phone   a row without an email matches a stored client by name
--                       and phone (case, spaces and phone format do not matter)
--        d_mail_vs_none a row WITH an email matches a stored client WITHOUT one
--                       by name and phone
--        e_two_mails    a row with an email does NOT match a stored client that
--                       has a different email, even with the same name and phone
--        f_inactive     a switched-off client is still a duplicate, and says so
--        g_no_keys      a row with no email and no phone has no key and is inserted
--        j_other_phone  the same name with another phone is another person
--        k_lead_phone   a lead's phone alone is a duplicate, whatever format the
--                       stored phone has (+373 69 123 456, 069 765 432)
--        l_lead_other_phone  a lead with a number nobody has is inserted, even
--                       with the name of a stored client
--        h_idno         the unique fiscal code still refuses (23505)
--        i_empty        an empty row is refused (22023)
--   3. AN ACCOUNT MANAGER is refused (42501) and nothing is inserted.
--   4. THE VERDICT, as the superuser: the clients that carry this card's tag are
--      exactly the fixtures plus the rows the accepted cases inserted.
--
-- The two-sessions race itself (two imports at the same moment create one
-- client) cannot be written in one psql session; it is proved by the end to end
-- spec tests/e2e/p3-338-import-concurrent.spec.ts, which calls the function from
-- parallel requests and runs two imports of the same file at once.
--
-- Everything runs inside a transaction that is rolled back.

begin;


-- ===========================================================================
-- 1. THE SHAPE
-- ===========================================================================

do $$
declare
  v_n   integer;
  v_txt text;
begin
  select count(*) into v_n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'import_insert_client'
    and pg_get_function_identity_arguments(p.oid) = 'p_row jsonb, p_email_key text, p_name_key text, p_phone_key text, p_phone_forms text[]'
    and not p.prosecdef;
  if v_n <> 1 then
    raise exception 'P3-338: expected one SECURITY INVOKER public.import_insert_client(jsonb, text, text, text, text[]), found %', v_n;
  end if;

  if not has_function_privilege('authenticated', 'public.import_insert_client(jsonb, text, text, text, text[])', 'execute') then
    raise exception 'P3-338: authenticated cannot execute import_insert_client, so no import can write a client';
  end if;
  if has_function_privilege('anon', 'public.import_insert_client(jsonb, text, text, text, text[])', 'execute') then
    raise exception 'P3-338: anon can execute import_insert_client';
  end if;

  select p.prosrc into v_txt
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'import_insert_client';
  if position('pg_advisory_xact_lock' in v_txt) = 0 then
    raise exception 'P3-338: import_insert_client does not take the advisory lock, so two imports can both insert';
  end if;
  if position('P3-338' in obj_description('public.import_insert_client(jsonb, text, text, text, text[])'::regprocedure, 'pg_proc')) = 0 then
    raise exception 'P3-338: the comment on import_insert_client does not name the card';
  end if;
end
$$;


-- ===========================================================================
-- 2. FIXTURE, AS THE SUPERUSER
-- ===========================================================================

insert into auth.users (id, email) values
  ('e3380000-0000-4000-8000-000000000001', 'p3-338-owner@rc-inventory.local'),
  ('e3380000-0000-4000-8000-000000000002', 'p3-338-manager@rc-inventory.local');

insert into public.profiles (id, email, role, full_name, active) values
  ('e3380000-0000-4000-8000-000000000001', 'p3-338-owner@rc-inventory.local', 'owner', 'Test Owner 338', true),
  ('e3380000-0000-4000-8000-000000000002', 'p3-338-manager@rc-inventory.local', 'account_manager', 'Test Manager 338', true);

-- S1 has an email; S2 has none and an untidy name; S3 is switched off; S4 holds an IDNO.
insert into public.clients (name, email, phone) values
  ('TEST P3-338 Ana Pop', 'Ana.P3338@Example.test ', '+373 69 123 456');
insert into public.clients (name, phone) values
  ('TEST P3-338  Ion   Rus', '069 765 432');
insert into public.clients (name, email, active) values
  ('TEST P3-338 Vechi', 'vechi.p3338@example.test', false);
insert into public.clients (name, fiscal_code) values
  ('TEST P3-338 Cu IDNO', '1003600338338');


-- ===========================================================================
-- 3. THE OWNER
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3380000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  v_out jsonb;
  v_n   integer;
  v_row public.clients%rowtype;
  v_s1  uuid;
  v_s2  uuid;
  v_s3  uuid;
begin
  select id into v_s1 from public.clients where name = 'TEST P3-338 Ana Pop';
  select id into v_s2 from public.clients where name = 'TEST P3-338  Ion   Rus';
  select id into v_s3 from public.clients where name = 'TEST P3-338 Vechi';

  -- a_new, a_defaults
  v_out := public.import_insert_client(
    jsonb_build_object('name', 'TEST P3-338 Nou', 'email', 'nou.p3338@example.test', 'phone', '068 111 222'),
    'nou.p3338@example.test', 'test p3-338 nou', '68111222');
  if v_out ? 'duplicate' or not (v_out ? 'id') then
    raise exception 'P3-338 a_new: a row nobody has was not inserted: %', v_out;
  end if;
  select * into v_row from public.clients where id = (v_out ->> 'id')::uuid;
  if v_row.id is null or v_row.name <> 'TEST P3-338 Nou' then
    raise exception 'P3-338 a_new: the returned id is not the inserted row';
  end if;
  if v_row.active is not true or v_row.created_at is null or v_row.stage is null then
    raise exception 'P3-338 a_defaults: the inserted row lost its column defaults (active %, created_at %, stage %)',
      v_row.active, v_row.created_at, v_row.stage;
  end if;

  -- b_email: stored 'Ana.P3338@Example.test ' (cased and padded), key is lower and trimmed
  v_out := public.import_insert_client(
    jsonb_build_object('name', 'TEST P3-338 Alta Ana', 'email', 'ana.p3338@example.test'),
    'ana.p3338@example.test', 'test p3-338 alta ana', null);
  if (v_out -> 'duplicate' ->> 'id')::uuid is distinct from v_s1 or v_out -> 'duplicate' ->> 'by' <> 'email' then
    raise exception 'P3-338 b_email: expected a duplicate of S1 by email, got %', v_out;
  end if;
  select count(*) into v_n from public.clients where name = 'TEST P3-338 Alta Ana';
  if v_n <> 0 then
    raise exception 'P3-338 b_email: the duplicate was written anyway';
  end if;

  -- c_name_phone: stored name has double spaces and other case, phone another format
  v_out := public.import_insert_client(
    jsonb_build_object('name', 'test p3-338 ion rus', 'phone', '69765432'),
    null, 'test p3-338 ion rus', '69765432');
  if (v_out -> 'duplicate' ->> 'id')::uuid is distinct from v_s2 or v_out -> 'duplicate' ->> 'by' <> 'namePhone' then
    raise exception 'P3-338 c_name_phone: expected a duplicate of S2 by name and phone, got %', v_out;
  end if;

  -- d_mail_vs_none: a row with an email against S2, which has none
  v_out := public.import_insert_client(
    jsonb_build_object('name', 'TEST P3-338 Ion Rus', 'phone', '069765432', 'email', 'ion.nou.p3338@example.test'),
    'ion.nou.p3338@example.test', 'test p3-338 ion rus', '69765432');
  if (v_out -> 'duplicate' ->> 'id')::uuid is distinct from v_s2 then
    raise exception 'P3-338 d_mail_vs_none: expected a duplicate of S2, got %', v_out;
  end if;

  -- e_two_mails: same name and phone as S1, but another email: a different client
  v_out := public.import_insert_client(
    jsonb_build_object('name', 'TEST P3-338 Ana Pop', 'phone', '069123456', 'email', 'ana.alta.p3338@example.test'),
    'ana.alta.p3338@example.test', 'test p3-338 ana pop', '69123456');
  if v_out ? 'duplicate' or not (v_out ? 'id') then
    raise exception 'P3-338 e_two_mails: two different emails were treated as one client: %', v_out;
  end if;

  -- f_inactive
  v_out := public.import_insert_client(
    jsonb_build_object('name', 'TEST P3-338 Altul', 'email', 'vechi.p3338@example.test'),
    'vechi.p3338@example.test', 'test p3-338 altul', null);
  if (v_out -> 'duplicate' ->> 'id')::uuid is distinct from v_s3
     or (v_out -> 'duplicate' ->> 'active')::boolean is not false then
    raise exception 'P3-338 f_inactive: expected a switched-off duplicate of S3, got %', v_out;
  end if;

  -- g_no_keys
  v_out := public.import_insert_client(
    jsonb_build_object('name', 'TEST P3-338 Fara cheie'), null, 'test p3-338 fara cheie', null);
  if v_out ? 'duplicate' or not (v_out ? 'id') then
    raise exception 'P3-338 g_no_keys: a row with no key was not inserted: %', v_out;
  end if;

  -- j_other_phone: the name of S2 with another phone is another person
  v_out := public.import_insert_client(
    jsonb_build_object('name', 'TEST P3-338 Ion Rus', 'phone', '069 000 111'),
    null, 'test p3-338 ion rus', '69000111');
  if v_out ? 'duplicate' or not (v_out ? 'id') then
    raise exception 'P3-338 j_other_phone: the same name with another phone was treated as a duplicate: %', v_out;
  end if;

  -- k_lead_phone: the lead import's key is the phone alone, in any stored format. S1 is stored
  -- as '+373 69 123 456' and S2 as '069 765 432'; the forms of +37369123456 and +37369765432.
  v_out := public.import_insert_client(
    jsonb_build_object('name', 'TEST P3-338 Alt nume', 'phone', '+37369123456'),
    null, null, null, array['37369123456', '069123456', '69123456']);
  -- (the client e_two_mails inserted has the same phone, so either of the two answers)
  if coalesce((v_out -> 'duplicate' ->> 'id')::uuid in (select id from public.clients where name = 'TEST P3-338 Ana Pop'), false) is not true
     or v_out -> 'duplicate' ->> 'by' is distinct from 'phone' then
    raise exception 'P3-338 k_lead_phone: expected a duplicate of S1 by phone, got %', v_out;
  end if;
  v_out := public.import_insert_client(
    jsonb_build_object('name', 'TEST P3-338 Alt nume', 'phone', '+37369765432'),
    null, null, null, array['37369765432', '069765432', '69765432']);
  if (v_out -> 'duplicate' ->> 'id')::uuid is distinct from v_s2 or v_out -> 'duplicate' ->> 'by' <> 'phone' then
    raise exception 'P3-338 k_lead_phone: expected a duplicate of S2 by phone, got %', v_out;
  end if;

  -- l_lead_other_phone: a number nobody has is inserted; the name alone never matches for a lead
  v_out := public.import_insert_client(
    jsonb_build_object('name', 'TEST P3-338 Ana Pop', 'phone', '+37369999888'),
    null, null, null, array['37369999888', '069999888', '69999888']);
  if v_out ? 'duplicate' or not (v_out ? 'id') then
    raise exception 'P3-338 l_lead_other_phone: a lead with a new number was refused: %', v_out;
  end if;

  -- h_idno: the unique fiscal code still refuses, with the code the app translates
  begin
    perform public.import_insert_client(
      jsonb_build_object('name', 'TEST P3-338 Alt IDNO', 'fiscal_code', '1003600338338'),
      null, 'test p3-338 alt idno', null);
    raise exception 'P3-338 h_idno: a second client with the same IDNO was accepted';
  exception when unique_violation then
    null;
  end;

  -- i_empty
  begin
    perform public.import_insert_client('{}'::jsonb, null, null, null);
    raise exception 'P3-338 i_empty: an empty row was accepted';
  exception when sqlstate '22023' then
    null;
  end;
end
$$;


-- ===========================================================================
-- 4. AN ACCOUNT MANAGER
-- ===========================================================================

set local request.jwt.claims = '{"sub":"e3380000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
begin
  begin
    perform public.import_insert_client(
      jsonb_build_object('name', 'TEST P3-338 De la manager', 'email', 'manager.p3338@example.test'),
      'manager.p3338@example.test', 'test p3-338 de la manager', null);
    raise exception 'P3-338 manager: an account manager imported a client';
  exception when sqlstate '42501' then
    null;
  end;
end
$$;


-- ===========================================================================
-- 5. THE VERDICT, AS THE SUPERUSER
-- ===========================================================================

reset role;

do $$
declare
  v_n integer;
begin
  -- 4 fixtures + a_new + e_two_mails + g_no_keys + j_other_phone + l_lead_other_phone;
  -- nothing else was written
  select count(*) into v_n from public.clients where name like 'TEST P3-338%';
  if v_n <> 9 then
    raise exception 'P3-338 verdict: expected 9 clients carrying the tag, found %', v_n;
  end if;
  select count(*) into v_n from public.clients where lower(btrim(email)) = 'ana.p3338@example.test';
  if v_n <> 1 then
    raise exception 'P3-338 verdict: the email of S1 is on % clients', v_n;
  end if;
end
$$;

rollback;
