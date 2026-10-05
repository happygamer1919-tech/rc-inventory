-- 0069_unassigned_issue_count_walkin.sql
-- RC Inventory phase 3, card P3-152. Found by the bug check of 2026-10-04.
--
-- THE DEFECT. 0022 defined public.unassigned_issue_count() as the number of
-- outbound issues with no project. Until 0067 that was the right question: every
-- issue was meant to carry a project, and one that did not was an unreconciled
-- historical row. 0067 (card P3-118, ruling R-215) added the second mode,
-- direct_client, whose rows have no project BY DESIGN. It narrowed the twin
-- counter public.unassigned_outbound_count() to issue_mode = 'project' and missed
-- this one, so after the first walk-in sale every client page shows the warning
-- that an issue is not yet in any client total, and the warning is false.
--
-- THE FIX. The same condition 0067 wrote into unassigned_outbound_count(), word
-- for word: issue_mode = 'project' and project_id is null.
--
-- SAME SIGNATURE, so this is a create or replace and not a drop, and the caller
-- (lib/data/client-detail.ts, rpc "unassigned_issue_count") does not change.
--
-- WHAT IT REMOVES: nothing. No table, no row, no column, no function. There is no
-- DROP, no TRUNCATE, no DELETE, no UPDATE and no INSERT in this file. It changes
-- the body and the comment of one function and states its grant again.

begin;

create or replace function public.unassigned_issue_count()
returns bigint
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*)
  from public.outbound_issues oi
  where oi.issue_mode = 'project'
    and oi.project_id is null
$$;

comment on function public.unassigned_issue_count() is
  'How many project issues still carry no project, and therefore cannot be attributed to any client. P3-08 shows this beside every client consumption total, because a total that quietly omits rows is worse than one that admits it is partial. CARD P3-152 NARROWED IT TO issue_mode = project, the same condition 0067 gave unassigned_outbound_count(): a direct_client issue has no project BY DESIGN (ruling R-215), so counting it made every client page warn about a problem that did not exist.';

grant execute on function public.unassigned_issue_count() to authenticated;

commit;
