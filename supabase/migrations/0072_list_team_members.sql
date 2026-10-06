-- 0072_list_team_members.sql
-- RC Inventory phase 3, card P3-170. An active user can read the id, the display
-- name and the active flag of every colleague, and nothing else about them.
--
-- WHY IT EXISTS.
--
-- profiles_select (0001) lets a user read their own row and lets an owner read
-- every row. An account manager therefore reads exactly one profile: their own.
-- Every task read joins the assignee's profile, so for an account manager a task
-- assigned to a colleague came back with no name ("Nealocata" on the Sarcini tab,
-- on the lead, client and project panels and on Azi), the edit form showed the
-- assignee as inactive, and the Responsabil picker offered only the user.
--
-- THE PROFILES READ RULE IS NOT WIDENED. Widening it would hand every account
-- manager every colleague's email, role and phone. This function returns three
-- columns and no others.
--
-- SECURITY DEFINER with a pinned search_path, the pattern of current_app_role()
-- in 0001: it runs as its owner, so it reads profiles past profiles_select, and
-- the caller cannot redirect it with their own search_path.
--
-- A DEACTIVATED CALLER GETS NO ROWS. The where clause asks current_app_role(),
-- which is null for a profile with active = false and for an account with no
-- profile row, the same predicate 0050 and 0055 use. An account whose profile the
-- owner switched off keeps a valid token until it expires; it must not list the
-- team.
--
-- display_name IS THE FULL NAME. For an owner, who already reads every profile
-- including the email, it falls back to the email when the full name is empty,
-- which is what the screens showed before this card, so the owner's view does not
-- change. For anyone else it is the full name or null: the email is never put in
-- a column that an account manager reads.
--
-- GRANTED TO authenticated ONLY. PostgreSQL grants EXECUTE on a new function to
-- PUBLIC by default, so the revokes come first and make the grant mean what it
-- says (the reasoning of 0028).
--
-- ADDITIVE: one new function, no table touched, no row written or removed. Safe to
-- run twice (create or replace). Merging this file applies it to production within
-- about two minutes (CLAUDE.md 8.0). The application reads it through a tolerant
-- wrapper, so the few minutes in which the new build runs against the old schema
-- fall back to today's behaviour instead of a 500.

begin;

create or replace function public.list_team_members()
returns table (id uuid, display_name text, active boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    case
      when public.is_owner() then coalesce(nullif(btrim(p.full_name), ''), p.email)
      else nullif(btrim(p.full_name), '')
    end as display_name,
    p.active
  from public.profiles p
  where public.current_app_role() is not null
$$;

comment on function public.list_team_members() is
  'P3-170. id, display name and active flag of every profile, for an ACTIVE caller only; nothing else about a colleague. Lets an account manager see and pick the assignee of a task without widening profiles_select.';

revoke all on function public.list_team_members() from public;
revoke all on function public.list_team_members() from anon;
grant execute on function public.list_team_members() to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Runs after COMMIT. Expect one row: security definer true, three result
-- columns, an ACL that names authenticated and not anon.

select
  p.proname,
  p.prosecdef as security_definer,
  pg_catalog.pg_get_function_result(p.oid) as result,
  pg_catalog.array_to_string(p.proacl, E'\n') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'list_team_members';
