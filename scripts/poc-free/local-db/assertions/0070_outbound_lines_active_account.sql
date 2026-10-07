-- assertions/0070_outbound_lines_active_account.sql
-- Card P3-138. What 0070 must have left behind, and what it must NOT have changed.
--
--   1. public.outbound_lines has exactly four policies: select, insert and update
--      on public.current_app_role() is not null, and delete still on
--      public.is_owner(). None of the three may be `true` any more.
--   2. public.outbound_issues keeps 0067's three policies and still has NO delete
--      policy: this card does not touch the header.
--   3. public.outbound_issue_take_stock(uuid, jsonb) still refuses a deactivated
--      caller: either it is SECURITY INVOKER (its lines insert runs under the
--      caller's own insert policy, the shape 0070 left), or it is SECURITY
--      DEFINER with its own current_app_role() refusal (the shape 0075 left).
--   Since 0075 the insert and update predicates also carry is_owner(); they
--   still test current_app_role() is not null, which is what this file checks.
--
-- A BARE POSTGRES RUNS AS SUPERUSER AND BYPASSES ROW LEVEL SECURITY, so this file
-- proves the policies EXIST with the right predicate and cannot prove what they
-- let through. That is tests/e2e/outbound-lines-deactivated.spec.ts, with real
-- tokens through PostgREST.
--
-- Refusals are written without diacritics, the convention 0063 to 0068 follow.
-- Everything runs inside a transaction that is rolled back.

begin;

do $$
declare
  n   integer;
  txt text;
  cmds text[] := array['SELECT', 'INSERT', 'UPDATE'];
  pol  text;
  i    integer;
begin
  -- --- 1. outbound_lines ---------------------------------------------------
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'outbound_lines';
  if n <> 4 then
    raise exception 'P3-138: expected exactly 4 policies on public.outbound_lines, found %', n;
  end if;

  for i in 1 .. array_length(cmds, 1) loop
    pol := 'outbound_lines_' || lower(cmds[i]);
    select coalesce(qual, '') || ' | ' || coalesce(with_check, '') into txt
    from pg_policies
    where schemaname = 'public' and tablename = 'outbound_lines'
      and policyname = pol and cmd = cmds[i];
    if txt is null then
      raise exception 'P3-138: policy % for % is missing on public.outbound_lines', pol, cmds[i];
    end if;
    if txt not ilike '%current_app_role()%is not null%' then
      raise exception 'P3-138: policy % must test current_app_role() is not null, found %', pol, txt;
    end if;
    if txt ~* '(^|[ (|])true($|[ )|])' then
      raise exception 'P3-138: policy % still carries a bare true, found %', pol, txt;
    end if;
  end loop;

  -- update must check both sides, or a deactivated account could move a line
  -- it can no longer see.
  select qual, with_check into pol, txt
  from pg_policies
  where schemaname = 'public' and tablename = 'outbound_lines' and policyname = 'outbound_lines_update';
  if pol is null or txt is null then
    raise exception 'P3-138: outbound_lines_update must have both using and with check';
  end if;

  select qual into txt
  from pg_policies
  where schemaname = 'public' and tablename = 'outbound_lines'
    and policyname = 'outbound_lines_delete' and cmd = 'DELETE';
  if txt is null or txt not ilike '%is_owner()%' then
    raise exception 'P3-138: outbound_lines_delete must stay on is_owner(), found %', coalesce(txt, 'nothing');
  end if;

  -- --- 2. outbound_issues untouched ----------------------------------------
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'outbound_issues';
  if n <> 3 then
    raise exception 'P3-138: public.outbound_issues must keep the three policies of 0067, found %', n;
  end if;

  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'outbound_issues' and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-138: public.outbound_issues gained a delete policy, which 0067 removed';
  end if;

  -- --- 3. take_stock still refuses a deactivated caller --------------------
  -- 0075 (card P3-195) made the routine SECURITY DEFINER so that direct line
  -- writes could be owner only. A definer version skips the lines insert policy,
  -- so it must carry its own current_app_role() refusal; assertions/0075 checks
  -- that refusal in detail. Either shape is accepted here, never a definer
  -- version without the refusal.
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'outbound_issue_take_stock'
    and pg_get_function_identity_arguments(p.oid) = 'p_issue_id uuid, p_lines jsonb'
    and (not p.prosecdef or p.prosrc like '%current_app_role() is null%');
  if n <> 1 then
    raise exception 'P3-138: expected one public.outbound_issue_take_stock(uuid, jsonb) that is SECURITY INVOKER or refuses a caller whose current_app_role() is null, found %. A definer version without that refusal would let a deactivated account take stock.', n;
  end if;
end $$;

rollback;
