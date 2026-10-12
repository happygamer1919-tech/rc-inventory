-- 0080_task_assignee_must_be_active.sql
-- RC Inventory phase 3, card P3-259. Found by the bug check of 2026-10-10.
--
-- THE DOOR 0068 LEFT OPEN.
--
-- The policies tasks_insert and tasks_update (0068) ask only that the CALLER is an
-- active profile, and the foreign key tasks.assignee_id only that the assignee
-- profile EXISTS. A deactivated colleague still exists (a profile is retired by
-- setting active false, never deleted), so a stale form or a direct PostgREST call
-- could assign a task to someone who no longer works here. The task then shows the
-- assignee as (inactiv) and nobody picks it up.
--
-- WHAT IT CHANGES
--
--   function  public.tasks_assignee_must_be_active()   NEW. Trigger function,
--             SECURITY DEFINER with a fixed search_path, because an account manager
--             reads only their own row through profiles_select (0001) and the check
--             must see the colleague's active flag. It raises when new.assignee_id is
--             not null, points to a profile whose active is false, and (on update)
--             differs from old.assignee_id.
--   trigger   tasks_assignee_must_be_active   NEW. BEFORE INSERT OR UPDATE OF
--             assignee_id on public.tasks, for each row.
--
-- THE EXCEPTION, AND WHY. An update that leaves assignee_id UNCHANGED on a task
-- already assigned to a colleague deactivated later still saves: editing the title
-- of an old task must not fail. Only a NEW assignment to an inactive profile is
-- refused. Clearing the assignee (null) is always allowed.
--
-- WHAT IT DOES NOT CHANGE. Who may write a task: any active profile, any field,
-- exactly the 0068 policies, which this file does not touch. The foreign key, the
-- updated_at trigger, the grants. A profile id that does not exist still falls to
-- the foreign key (23503), as before.
--
-- WHAT IT REMOVES: no table, no row, no column, no function, no policy. There is NO
-- DROP, NO TRUNCATE, NO DELETE, NO UPDATE and NO INSERT statement in this file.
--
-- MERGE IS APPLY: merging this file changes the production database within about
-- two minutes. Existing rows are not read or rewritten; a task already assigned to
-- an inactive colleague keeps its assignee and stays editable. The deployed build
-- offers only active colleagues in the Responsabil picker, so no screen path is
-- refused that was not already wrong.

begin;

create or replace function public.tasks_assignee_must_be_active()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.assignee_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then
    return new;
  end if;

  if exists (select 1 from public.profiles p where p.id = new.assignee_id and p.active = false) then
    raise exception 'Colegul ales nu mai este activ. Alegeți alt responsabil.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.tasks_assignee_must_be_active() is
  'Card P3-259 (0080): refuses a task insert, or an update that CHANGES assignee_id, when the new assignee is a profile with active false. An unchanged assignee on an old task stays editable; null is always allowed; a missing profile is left to the foreign key.';

revoke all on function public.tasks_assignee_must_be_active() from public;
revoke all on function public.tasks_assignee_must_be_active() from anon;
revoke all on function public.tasks_assignee_must_be_active() from authenticated;

create or replace trigger tasks_assignee_must_be_active
  before insert or update of assignee_id on public.tasks
  for each row execute function public.tasks_assignee_must_be_active();

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: one row, the trigger on public.tasks, enabled.

select c.relname as table_name, t.tgname as trigger_name, t.tgenabled as enabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'tasks' and t.tgname = 'tasks_assignee_must_be_active';
