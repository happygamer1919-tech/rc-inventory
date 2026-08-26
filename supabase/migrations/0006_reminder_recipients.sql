-- 0006_reminder_recipients.sql
-- RC Inventory phase 2, card P2-10. Who a stock reminder is addressed to.
--
-- Applied by EXECUTOR under ruling R-001. Runs as one transaction.
-- Contains no DROP, no TRUNCATE and no DELETE.
--
-- THE PROBLEM THIS SOLVES. P2-10's defaults say the recipient of a threshold
-- reminder is "the owner account email". The reminder is sent from the same
-- server path that writes the stock mutation, and that path runs as whoever is
-- signed in. An account_manager issuing material is a stock mutation like any
-- other, and it must be able to address the email to the owner.
--
-- It cannot read the owner's row. profiles_select from migration 0001 is
-- (id = auth.uid()) OR is_owner(), so an account_manager sees exactly one row
-- in profiles, its own. The CRITIC verified that with a real session at the
-- wave 1 boundary and it is the correct posture: it is not weakened here.
--
-- THE THREE ALTERNATIVES, AND WHY THIS ONE. Widening profiles_select would let
-- every operator read every profile row, which trades a real privacy boundary
-- for one column. Putting the recipient in an environment variable duplicates a
-- fact that already lives in the database and goes stale the moment P2-13
-- creates the real client accounts. Handing the application a service_role key
-- would put an RLS-bypassing credential into the request path of a screen, to
-- read one email address.
--
-- So: one SECURITY DEFINER function with the narrowest possible result. It
-- returns nothing but the email addresses of ACTIVE OWNERS. No id, no name, no
-- role, no row for anyone else. An account_manager calling it learns who to
-- write to and nothing more, which is exactly the disclosure the feature needs
-- and no more than that.
--
-- search_path is pinned. A SECURITY DEFINER function without a pinned
-- search_path can be pointed at an attacker's schema by whoever calls it, which
-- is the standard way this feature class is abused.

begin;

create or replace function public.owner_reminder_recipients()
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.email
  from public.profiles p
  where p.role = 'owner'
    and p.active
    and p.email is not null
    and length(btrim(p.email)) > 0
  order by p.email
$$;

comment on function public.owner_reminder_recipients is
  'The email addresses of active owners, and nothing else. SECURITY DEFINER because an account_manager cannot read the owner profile row under profiles_select, but the reminder it triggers has to be addressed to the owner. Narrowest possible result: no id, no name, no role, no row for any non-owner.';

-- Default execute on a new function is granted to PUBLIC, which on Supabase
-- includes anon. Revoked and re-granted explicitly so an unauthenticated
-- request cannot enumerate owner addresses.
revoke all on function public.owner_reminder_recipients() from public;
revoke all on function public.owner_reminder_recipients() from anon;
grant execute on function public.owner_reminder_recipients() to authenticated;
grant execute on function public.owner_reminder_recipients() to service_role;

commit;
