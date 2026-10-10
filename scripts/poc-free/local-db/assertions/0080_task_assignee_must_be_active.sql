-- assertions/0080_task_assignee_must_be_active.sql
-- Card P3-259. What 0080 must have left behind on public.tasks, and what it must
-- NOT have changed.
--
-- THREE GROUPS:
--
--   1. The trigger tasks_assignee_must_be_active exists on public.tasks, BEFORE,
--      FOR EACH ROW, on INSERT and on UPDATE OF assignee_id, and is enabled.
--   2. Its function is SECURITY DEFINER with a fixed search_path: an account
--      manager reads only their own profile row, so the check must run past
--      profiles_select to see a colleague's active flag.
--   3. The 0068 policies are untouched: still exactly three, select, insert and
--      update, and NO delete policy.
--
-- WHAT IS DELIBERATELY NOT ASSERTED HERE: the refusal itself needs a real
-- profile, which needs auth.users, which a bare postgres does not have. The
-- refusal with real tokens is tests/e2e/task-assignee-must-be-active.spec.ts.
--
-- IT RAISES RATHER THAN PRINTS, like every file in this directory. It reads the
-- catalog only and writes nothing.

do $$
declare
  n   integer;
  def text;
begin
  -- --- 1. the trigger ------------------------------------------------------
  select count(*), max(pg_get_triggerdef(t.oid)) into n, def
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relname = 'tasks'
    and t.tgname = 'tasks_assignee_must_be_active' and t.tgenabled <> 'D';
  if n <> 1 then
    raise exception 'P3-259: expected one enabled trigger tasks_assignee_must_be_active on public.tasks, found %', n;
  end if;
  if def not like '%BEFORE INSERT OR UPDATE OF assignee_id ON %tasks%'
     or def not like '%FOR EACH ROW%' then
    raise exception 'P3-259: trigger must be BEFORE INSERT OR UPDATE OF assignee_id, FOR EACH ROW, found %', def;
  end if;

  -- --- 2. the function -----------------------------------------------------
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname = 'tasks_assignee_must_be_active'
    and p.prosecdef and p.proconfig is not null
    and array_to_string(p.proconfig, ',') like '%search_path=%';
  if n <> 1 then
    raise exception 'P3-259: tasks_assignee_must_be_active must be SECURITY DEFINER with a fixed search_path, found %', n;
  end if;

  -- --- 3. the 0068 policies, unchanged -------------------------------------
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'tasks';
  if n <> 3 then
    raise exception 'P3-259: expected exactly 3 policies on public.tasks, found %', n;
  end if;
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and cmd = 'DELETE';
  if n <> 0 then
    raise exception 'P3-259: public.tasks must have NO delete policy, found %', n;
  end if;
end
$$;
