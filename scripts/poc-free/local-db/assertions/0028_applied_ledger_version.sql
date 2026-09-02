-- assertions/0028_applied_ledger_version.sql
-- Card P3-11e. The ledger-version function, asserted against the finished schema.
--
-- WHAT IS WORTH ASSERTING HERE, AND WHAT IS NOT. The function's RETURN VALUE
-- cannot be checked on this shim: it has no supabase_migrations schema, which is
-- the whole reason the function guards with to_regclass. What CAN be checked, and
-- is the part that would actually hurt if it were wrong, is the ACL.
--
-- A SECURITY DEFINER FUNCTION REACHABLE BY anon IS A PERMANENT OPEN QUESTION.
-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default, so a bare
-- CREATE plus a GRANT to service_role leaves anon able to call it anyway. The
-- REVOKE in the migration is what makes the grant mean what it says, and a later
-- CREATE OR REPLACE that forgets the revoke would silently re-open it. This file
-- is what makes that fail.
--
-- THE GRANT IS ASSERTED, THE CALL IS NOT. Ruling: on postgres 17.6.1.106, anon
-- calling a function it lacks EXECUTE on crashes the backend, so a negative test
-- that CALLS as anon takes the database down instead of failing. The ACL is read
-- out of pg_proc.

do $$
declare
  n   integer;
  txt text;
begin
  -- --- the function exists, and is SECURITY DEFINER -------------------------
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'applied_ledger_version';
  if n <> 1 then
    raise exception 'expected exactly 1 public.applied_ledger_version, found %', n;
  end if;

  select case when p.prosecdef then 'definer' else 'invoker' end into txt
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'applied_ledger_version';
  if txt <> 'definer' then
    raise exception 'applied_ledger_version is SECURITY %, expected definer', txt;
  end if;

  -- --- it returns text, and takes no argument -------------------------------
  select pg_catalog.pg_get_function_identity_arguments(p.oid) into txt
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'applied_ledger_version';
  if coalesce(txt, '') <> '' then
    raise exception 'applied_ledger_version takes arguments (%), expected none', txt;
  end if;

  -- --- search_path is pinned ------------------------------------------------
  -- A SECURITY DEFINER function with no pinned search_path is the classic
  -- privilege escalation: the caller chooses which schema the body resolves in.
  select coalesce(array_to_string(p.proconfig, ','), '') into txt
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'applied_ledger_version';
  if position('search_path=' in txt) = 0 then
    raise exception 'applied_ledger_version has no pinned search_path, proconfig is %', txt;
  end if;

  -- --- THE ACL. service_role yes, anon and authenticated NO -----------------
  select coalesce(array_to_string(p.proacl, E'\n'), '(default, meaning PUBLIC can execute)')
    into txt
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'applied_ledger_version';

  if txt like '%(default%' then
    raise exception 'applied_ledger_version has the DEFAULT acl, so PUBLIC can execute it';
  end if;
  if position('service_role=X' in txt) = 0 then
    raise exception 'service_role cannot execute applied_ledger_version. acl: %', txt;
  end if;
  if position('anon=X' in txt) > 0 then
    raise exception 'anon CAN execute applied_ledger_version, which the migration revokes. acl: %', txt;
  end if;
  if position('authenticated=X' in txt) > 0 then
    raise exception 'authenticated CAN execute applied_ledger_version. acl: %', txt;
  end if;
  if position('=X/' in txt) > 0 and position(E'\n=X/' in E'\n' || txt) > 0 then
    raise exception 'PUBLIC has an explicit EXECUTE grant on applied_ledger_version. acl: %', txt;
  end if;

  -- --- it answers rather than throwing when the ledger is absent ------------
  -- This shim has no supabase_migrations schema, which is exactly the state the
  -- to_regclass guard exists for. A `language sql` body would not even have been
  -- creatable here.
  if public.applied_ledger_version() is distinct from null then
    raise exception 'applied_ledger_version returned a value on a shim with no ledger';
  end if;
end $$;
