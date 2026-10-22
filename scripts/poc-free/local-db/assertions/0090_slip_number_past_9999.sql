-- assertions/0090_slip_number_past_9999.sql
-- Card P3-334. The next slip number is the highest NUMERIC value of this year's
-- series plus one, so the series keeps counting past 9999 (10000, 10001, ...)
-- instead of every save failing from slip 10000 on.
--
--   1. THE SHAPE. public.outbound_next_reference() is still one SECURITY DEFINER
--      function with no arguments, executable by authenticated and not by anon,
--      and its body names P3-334. The guard outbound_issues_guard still names
--      P3-331 and calls it.
--   2. THE NUMBERING, as the superuser (no identity, so the guard lets the
--      fixture rows through as slips saved earlier), each case inside a block
--      that is undone:
--        empty      no slip of this year                      -> 0001
--        small      0009 and 0010                             -> 0011 (text
--                   order agrees here; the value rule must too)
--        past_9999  9999 and 10000                            -> 10001 (the
--                   defect: text order read 9999 and gave 10000 again)
--        far        9999, 10000 and 10099                     -> 10100
--        tail       0041 and 0041-X, then 9999 and 9999-X     -> 0042, 10000
--                   (a tail that is not all digits is ignored, it neither wins
--                   nor restarts the series)
--        prev_year  last year's 20000 and IES-TEST-...        -> not counted
--   3. AN ACTIVE ACCOUNT MANAGER, with a real role switch and a JWT, with 9999
--      and 10000 already saved:
--        w_next     a direct insert carrying outbound_next_reference() is
--                   accepted and saved as 10001 (before 0090 it died on
--                   outbound_issues_reference_unique)
--        w_empty    a direct insert with no number: the server sets 10002
--        m_reuse    a direct insert carrying 10000 again is refused by the
--                   guard (P0001), not by the unique index
--   4. THE VERDICT, as the superuser.
--
-- Refusals are written without diacritics, the convention 0063 to 0089 follow.
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
  where ns.nspname = 'public' and p.proname = 'outbound_next_reference'
    and pg_get_function_identity_arguments(p.oid) = '' and p.prosecdef;
  if v_n <> 1 then
    raise exception 'P3-334: expected one SECURITY DEFINER public.outbound_next_reference(), found %', v_n;
  end if;
  if not has_function_privilege('authenticated', 'public.outbound_next_reference()', 'execute') then
    raise exception 'P3-334: authenticated cannot execute outbound_next_reference, so the screen and the guard both fail';
  end if;
  if has_function_privilege('anon', 'public.outbound_next_reference()', 'execute') then
    raise exception 'P3-334: anon can execute outbound_next_reference';
  end if;

  select p.prosrc into v_txt
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'outbound_next_reference';
  if v_txt is null or position('P3-334' in v_txt) = 0 then
    raise exception 'P3-334: outbound_next_reference does not carry the numeric rule';
  end if;

  select p.prosrc into v_txt
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'outbound_issues_guard';
  if v_txt is null or position('P3-331' in v_txt) = 0 or position('outbound_next_reference' in v_txt) = 0 then
    raise exception 'P3-334: outbound_issues_guard no longer carries the P3-331 numbering check';
  end if;
end
$$;


-- ===========================================================================
-- 2. THE NUMBERING, AS THE SUPERUSER
-- ===========================================================================

insert into auth.users (id, email) values
  ('e3334000-0000-4000-8000-000000000002', 'p3-334-manager@rc-inventory.local');

insert into public.profiles (id, email, role, full_name, active) values
  ('e3334000-0000-4000-8000-000000000002', 'p3-334-manager@rc-inventory.local', 'account_manager', 'Test Manager 334', true);

do $$
declare
  v_year   text := to_char(now() at time zone 'Europe/Chisinau', 'YYYY');
  v_prev   text := (to_char(now() at time zone 'Europe/Chisinau', 'YYYY')::int - 1)::text;
  v_client uuid;
  v_got    text;
begin
  perform set_config('p3_334.year', v_year, true);

  if exists (select 1 from public.outbound_issues where reference like 'IES-' || v_year || '-%') then
    raise exception 'P3-334: the fixture expects no slip of % before it runs', v_year;
  end if;

  insert into public.clients (name) values ('TEST P3-334 client') returning id into v_client;
  perform set_config('p3_334.client', v_client::text, true);

  -- --- empty
  v_got := public.outbound_next_reference();
  if v_got <> 'IES-' || v_year || '-0001' then
    raise exception 'P3-334 empty: an empty year should start at IES-%-0001, got %', v_year, v_got;
  end if;

  -- --- prev_year, kept for every case below: another year and another prefix
  insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date) values
    ('IES-' || v_prev || '-20000', 'direct_client', v_client, date '2026-10-22'),
    ('IES-TEST-P3334-ALTUL', 'direct_client', v_client, date '2026-10-22');
  v_got := public.outbound_next_reference();
  if v_got <> 'IES-' || v_year || '-0001' then
    raise exception 'P3-334 prev_year: last year''s slips or another prefix were counted, got %', v_got;
  end if;

  -- --- small
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date) values
      ('IES-' || v_year || '-0009', 'direct_client', v_client, date '2026-10-22'),
      ('IES-' || v_year || '-0010', 'direct_client', v_client, date '2026-10-22');
    v_got := public.outbound_next_reference();
    if v_got <> 'IES-' || v_year || '-0011' then
      raise exception 'P3-334 small: after 0009 and 0010 the next should be IES-%-0011, got %', v_year, v_got;
    end if;
    raise exception using errcode = 'P0334', message = 'undo';
  exception when sqlstate 'P0334' then
    null;
  end;

  -- --- past_9999, the defect itself
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date) values
      ('IES-' || v_year || '-9999', 'direct_client', v_client, date '2026-10-22'),
      ('IES-' || v_year || '-10000', 'direct_client', v_client, date '2026-10-22');
    v_got := public.outbound_next_reference();
    if v_got <> 'IES-' || v_year || '-10001' then
      raise exception 'P3-334 past_9999: after 9999 and 10000 the next should be IES-%-10001, got %', v_year, v_got;
    end if;

    -- --- far
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date) values
      ('IES-' || v_year || '-10099', 'direct_client', v_client, date '2026-10-22');
    v_got := public.outbound_next_reference();
    if v_got <> 'IES-' || v_year || '-10100' then
      raise exception 'P3-334 far: after 10099 the next should be IES-%-10100, got %', v_year, v_got;
    end if;
    raise exception using errcode = 'P0334', message = 'undo';
  exception when sqlstate 'P0334' then
    null;
  end;

  -- --- tail
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date) values
      ('IES-' || v_year || '-0041', 'direct_client', v_client, date '2026-10-22'),
      ('IES-' || v_year || '-0041-X', 'direct_client', v_client, date '2026-10-22');
    v_got := public.outbound_next_reference();
    if v_got <> 'IES-' || v_year || '-0042' then
      raise exception 'P3-334 tail: a tail that is not all digits should be ignored, next after 0041 is IES-%-0042, got %', v_year, v_got;
    end if;

    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date) values
      ('IES-' || v_year || '-9999', 'direct_client', v_client, date '2026-10-22'),
      ('IES-' || v_year || '-9999-X', 'direct_client', v_client, date '2026-10-22');
    v_got := public.outbound_next_reference();
    if v_got <> 'IES-' || v_year || '-10000' then
      raise exception 'P3-334 tail: after 9999 and 9999-X the next should be IES-%-10000, got %', v_year, v_got;
    end if;
    raise exception using errcode = 'P0334', message = 'undo';
  exception when sqlstate 'P0334' then
    null;
  end;

  -- Every case was undone.
  v_got := public.outbound_next_reference();
  if v_got <> 'IES-' || v_year || '-0001' then
    raise exception 'P3-334: the case rows were not undone, the next number reads %', v_got;
  end if;

  -- The fixture for section 3: 9999 and 10000 saved earlier this year.
  insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date) values
    ('IES-' || v_year || '-9999', 'direct_client', v_client, date '2026-10-22'),
    ('IES-' || v_year || '-10000', 'direct_client', v_client, date '2026-10-22');
end
$$;


-- ===========================================================================
-- 3. AN ACTIVE ACCOUNT MANAGER
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3334000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare
  v_year   text := current_setting('p3_334.year');
  v_client uuid := current_setting('p3_334.client')::uuid;
  v_ref    text;
  v_id     uuid;
begin
  -- --- w_next, what the screen sends after this card
  v_ref := public.outbound_next_reference();
  perform set_config('p3_334.w_next_ref', v_ref, true);
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date)
    values (v_ref, 'direct_client', v_client, date '2026-10-22')
    returning id into v_id;
    perform set_config('p3_334.w_next', v_id::text, true);
  exception when others then
    perform set_config('p3_334.w_next', 'refused ' || sqlstate || ' ' || sqlerrm, true);
  end;

  -- --- w_empty, no number sent
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date)
    values (null, 'direct_client', v_client, date '2026-10-22')
    returning id into v_id;
    perform set_config('p3_334.w_empty', v_id::text, true);
  exception when others then
    perform set_config('p3_334.w_empty', 'refused ' || sqlstate || ' ' || sqlerrm, true);
  end;

  -- --- m_reuse, 10000 again
  begin
    insert into public.outbound_issues (reference, issue_mode, client_id, pickup_date)
    values ('IES-' || v_year || '-10000', 'direct_client', v_client, date '2026-10-22');
    perform set_config('p3_334.m_reuse', 'accepted', true);
  exception when others then
    perform set_config('p3_334.m_reuse', sqlstate || ' ' || sqlerrm, true);
  end;
end
$$;

reset role;


-- ===========================================================================
-- 4. THE VERDICT, READ AS THE SUPERUSER
-- ===========================================================================

do $$
declare
  v_year text := current_setting('p3_334.year');
  v_txt  text;
  v_n    integer;
begin
  if current_setting('p3_334.w_next') like 'refused %' then
    raise exception 'P3-334 w_next: the next number after 10000 was refused: %', current_setting('p3_334.w_next');
  end if;
  if current_setting('p3_334.w_next_ref') <> 'IES-' || v_year || '-10001' then
    raise exception 'P3-334 w_next: the signed-in caller read %, expected IES-%-10001', current_setting('p3_334.w_next_ref'), v_year;
  end if;
  select reference into v_txt from public.outbound_issues where id = current_setting('p3_334.w_next')::uuid;
  if v_txt is distinct from 'IES-' || v_year || '-10001' then
    raise exception 'P3-334 w_next: saved as %, expected IES-%-10001', coalesce(v_txt, 'nothing'), v_year;
  end if;

  if current_setting('p3_334.w_empty') like 'refused %' then
    raise exception 'P3-334 w_empty: a slip with no number was refused: %', current_setting('p3_334.w_empty');
  end if;
  select reference into v_txt from public.outbound_issues where id = current_setting('p3_334.w_empty')::uuid;
  if v_txt is distinct from 'IES-' || v_year || '-10002' then
    raise exception 'P3-334 w_empty: the server set %, expected IES-%-10002', coalesce(v_txt, 'nothing'), v_year;
  end if;

  if current_setting('p3_334.m_reuse') not like 'P0001 Num%rul ie%irii nu este urm%torul din serie%' then
    raise exception 'P3-334 m_reuse: 10000 again was not refused by the guard, got %', current_setting('p3_334.m_reuse');
  end if;

  select count(*) into v_n from public.outbound_issues where reference = 'IES-' || v_year || '-10000';
  if v_n <> 1 then
    raise exception 'P3-334: expected exactly one slip IES-%-10000, found %', v_year, v_n;
  end if;

  select count(*) into v_n from public.outbound_issues
  where created_by = 'e3334000-0000-4000-8000-000000000002';
  if v_n <> 2 then
    raise exception 'P3-334: expected exactly the 2 witness slips by the manager, found %', v_n;
  end if;
end
$$;

rollback;
