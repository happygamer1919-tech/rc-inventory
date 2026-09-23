-- assertions/0060_lead_next_action_cleared_with_follow_up.sql
-- Card P3-92, the bug sweep finding F3. Leaving De reluat with no new date clears
-- next_action_at as well as follow_up_date while next_action_at is still the
-- mirror of the date being left; a next step set independently at another stage
-- survives; the next-step TEXT is never cleared; and every arm 0057 asserted
-- still behaves the same way.
--
-- 0057's own assertion file is not weakened and not replaced: it runs again after
-- this migration, unchanged, which is what proves the follow-up rules still hold.
-- This file adds only what 0060 decides.

begin;


-- ===========================================================================
-- 1. THE SHAPE: NO NEW OVERLOAD, NO DEFAULT ADDED, NO COLUMN CHANGED
-- ===========================================================================

do $$
declare
  n integer;
  t text;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'set_client_stage';
  if n <> 2 then
    raise exception 'P3-92: expected the two forms of set_client_stage from 0039 and 0040, found %', n;
  end if;

  select p.pronargdefaults into n
  from pg_proc p
  where p.oid = to_regprocedure('public.set_client_stage(uuid, public.client_stage, date, boolean)');
  if n <> 0 then
    raise exception 'P3-92: the four-parameter set_client_stage carries % default(s), expected none', n;
  end if;

  select data_type into t
  from information_schema.columns
  where table_schema = 'public' and table_name = 'clients' and column_name = 'next_action_at';
  if t is distinct from 'date' then
    raise exception 'P3-92: clients.next_action_at is %, expected date', coalesce(t, 'absent');
  end if;
end
$$;


-- ===========================================================================
-- 2. THE PAIR
-- ===========================================================================

insert into auth.users (id, email)
values ('e9900000-0000-4000-8000-000000000001', 'p3-92@rc-inventory.local');

set local request.jwt.claims = '{"sub":"e9900000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.clients (id, name) values
  ('e9910000-0000-4000-8000-000000000001', 'P3-92 Oglinda'),
  ('e9910000-0000-4000-8000-000000000002', 'P3-92 Pas propriu'),
  ('e9910000-0000-4000-8000-000000000003', 'P3-92 Intre alte etape'),
  ('e9910000-0000-4000-8000-000000000004', 'P3-92 Data noua la plecare'),
  ('e9910000-0000-4000-8000-000000000005', 'P3-92 Aceeasi etapa'),
  ('e9910000-0000-4000-8000-000000000006', 'P3-92 Fara pas');

do $$
declare
  v_mirror   constant uuid := 'e9910000-0000-4000-8000-000000000001';
  v_own      constant uuid := 'e9910000-0000-4000-8000-000000000002';
  v_between  constant uuid := 'e9910000-0000-4000-8000-000000000003';
  v_newdate  constant uuid := 'e9910000-0000-4000-8000-000000000004';
  v_same     constant uuid := 'e9910000-0000-4000-8000-000000000005';
  v_nostep   constant uuid := 'e9910000-0000-4000-8000-000000000006';
  d          date;
  d2         date;
  s          text;
  txt        text;
begin
  -- --- THE MIRROR GOES WITH THE DATE IT MIRRORS -------------------------------
  -- The lead is at De reluat with one date in both columns, which is exactly what
  -- validateNextAction writes from the Lead nou form, and it carries a next-step
  -- sentence the operator typed.
  perform public.set_client_stage(v_mirror, 'follow_up', date '2026-09-01');
  update public.clients
     set next_action_at = date '2026-09-01', next_action = 'Sun eu luni.'
   where id = v_mirror;

  perform public.set_client_stage(v_mirror, 'nurture'::public.client_stage, null::date);

  select stage::text, follow_up_date, next_action_at, next_action
    into s, d, d2, txt
  from public.clients where id = v_mirror;
  if s is distinct from 'nurture' then
    raise exception 'P3-92: leaving De reluat gave stage %, expected nurture', s;
  end if;
  if d is not null or d2 is not null then
    raise exception 'P3-92: leaving De reluat left follow_up_date % and next_action_at %, expected both null', d, d2;
  end if;
  -- THE TEXT IS NOT A DATE AND IS NOT CLEARED.
  if txt is distinct from 'Sun eu luni.' then
    raise exception 'P3-92: the next-step text became %, expected it untouched', coalesce(txt, 'null');
  end if;

  -- --- A NEXT STEP SET INDEPENDENTLY AT DE RELUAT SURVIVES --------------------
  -- Same stage, same departure, but the two dates never agreed: somebody set the
  -- next step to another day, so it is not the mirror and it is not the
  -- departure's to erase.
  perform public.set_client_stage(v_own, 'follow_up', date '2026-09-01');
  update public.clients set next_action_at = date '2026-10-15' where id = v_own;

  perform public.set_client_stage(v_own, 'quoted'::public.client_stage, null::date);

  select follow_up_date, next_action_at into d, d2 from public.clients where id = v_own;
  if d is not null then
    raise exception 'P3-92: the follow-up date survived as %, expected null', d;
  end if;
  if d2 is distinct from date '2026-10-15' then
    raise exception 'P3-92: an independently set next step became %, expected 2026-10-15', coalesce(d2::text, 'null');
  end if;

  -- --- A MOVE BETWEEN TWO STAGES THAT ARE NOT DE RELUAT TOUCHES NOTHING -------
  perform public.set_client_stage(v_between, 'nurture'::public.client_stage, null::date, true);
  update public.clients set next_action_at = date '2026-11-20' where id = v_between;
  perform public.set_client_stage(v_between, 'quoted'::public.client_stage, null::date);
  select next_action_at into d2 from public.clients where id = v_between;
  if d2 is distinct from date '2026-11-20' then
    raise exception 'P3-92: nurture -> quoted changed the next step to %', coalesce(d2::text, 'null');
  end if;

  -- --- LEAVING WITH A NEW DATE PASSED CLEARS NOTHING --------------------------
  -- A date in the same call is still stored at any stage, 0057's rule, and the
  -- clearing arm is not entered at all, so the mirror stays.
  perform public.set_client_stage(v_newdate, 'follow_up', date '2026-09-05');
  update public.clients set next_action_at = date '2026-09-05' where id = v_newdate;
  perform public.set_client_stage(v_newdate, 'quoted'::public.client_stage, date '2026-12-01');
  select follow_up_date, next_action_at into d, d2 from public.clients where id = v_newdate;
  if d is distinct from date '2026-12-01' then
    raise exception 'P3-92: leaving with a new date gave follow_up_date %, expected 2026-12-01', coalesce(d::text, 'null');
  end if;
  if d2 is distinct from date '2026-09-05' then
    raise exception 'P3-92: leaving with a new date changed the next step to %', coalesce(d2::text, 'null');
  end if;

  -- --- THE SAME STAGE IS NOT A DEPARTURE --------------------------------------
  perform public.set_client_stage(v_same, 'follow_up', date '2026-09-07');
  update public.clients set next_action_at = date '2026-09-07' where id = v_same;
  perform public.set_client_stage(v_same, 'follow_up'::public.client_stage, null::date);
  select follow_up_date, next_action_at into d, d2 from public.clients where id = v_same;
  if d is distinct from date '2026-09-07' or d2 is distinct from date '2026-09-07' then
    raise exception 'P3-92: De reluat set again gave % and %, expected both kept', d, d2;
  end if;

  -- --- NO NEXT STEP AT ALL: THE DEPARTURE STILL WORKS, NULL STAYS NULL --------
  perform public.set_client_stage(v_nostep, 'follow_up', date '2026-09-09');
  perform public.set_client_stage(v_nostep, 'nurture'::public.client_stage, null::date);
  select follow_up_date, next_action_at into d, d2 from public.clients where id = v_nostep;
  if d is not null or d2 is not null then
    raise exception 'P3-92: a lead with no next step left De reluat as % and %', d, d2;
  end if;
end
$$;


-- ===========================================================================
-- 3. P_FIRST IS NOT A DEPARTURE EITHER
-- ===========================================================================
-- A first stage has no "from", so the clearing arm can never be reached through
-- it, whatever the stage recorded.

do $$
declare
  v_first constant uuid := 'e9910000-0000-4000-8000-000000000007';
  d2      date;
begin
  insert into public.clients (id, name, next_action_at)
  values (v_first, 'P3-92 Prima etapa', date '2026-09-01');
  perform public.set_client_stage(v_first, 'follow_up'::public.client_stage, date '2026-09-01', true);
  select next_action_at into d2 from public.clients where id = v_first;
  if d2 is distinct from date '2026-09-01' then
    raise exception 'P3-92: p_first changed the next step to %', coalesce(d2::text, 'null');
  end if;
end
$$;

rollback;
