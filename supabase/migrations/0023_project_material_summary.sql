-- 0023_project_material_summary.sql
-- RC Inventory phase 3, card P3-09. What the Consum tab on a project needs.
--
-- THE SIBLING OF public.client_material_summary IN 0022, ONE LEVEL DOWN. The
-- client version aggregates across a client's projects; this one is a single
-- project, so it does not aggregate across anything and can therefore return
-- the ISSUES rather than the products.
--
-- P3-09 ASKS FOR "NEWEST FIRST", WHICH IS A DIFFERENT SHAPE FROM P3-08.
-- The client tab answers "what does this customer use", so it ranks products by
-- quantity. The project tab answers "what went to this site and when", so it
-- lists issues in time order. Two questions, two shapes, and giving them the
-- same one would answer neither well.
--
-- SECURITY INVOKER, so RLS applies unchanged.
--
-- NOT APPLIED TO PRODUCTION BY THIS PULL REQUEST. The apply is card P3-27.

begin;

create or replace function public.project_material_summary(
  p_project_id uuid,
  p_limit      integer default 5
)
returns table (
  issue_id     uuid,
  reference    text,
  issued_at    timestamptz,
  status       public.outbound_status,
  line_count   bigint,
  quantity     numeric,
  value_mdl    numeric,
  row_kind     text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with per_issue as (
    select
      oi.id,
      oi.reference,
      oi.issued_at,
      oi.status,
      count(ol.id)                                             as line_count,
      coalesce(sum(ol.quantity), 0)                            as quantity,
      coalesce(sum(ol.quantity * coalesce(pr.unit_value_mdl, 0)), 0) as value_mdl
    from public.outbound_issues oi
    left join public.outbound_lines ol on ol.outbound_issue_id = oi.id
    left join public.products pr on pr.id = ol.product_id
    where oi.project_id = p_project_id
    group by oi.id, oi.reference, oi.issued_at, oi.status
  ),
  ranked as (
    select p.*, row_number() over (order by p.issued_at desc, p.reference desc) as rn
    from per_issue p
  )
  select u.issue_id, u.reference, u.issued_at, u.status,
         u.line_count, u.quantity, u.value_mdl, u.row_kind
  from (
    select r.id as issue_id, r.reference, r.issued_at, r.status,
           r.line_count, r.quantity, r.value_mdl, 'row'::text as row_kind
    from ranked r
    where r.rn <= greatest(p_limit, 1)
    union all
    -- ONE TOTAL COVERING EVERY ISSUE, not only the ones shown. Same rule as
    -- 0022, and the union is wrapped for the same reason: an ORDER BY on a set
    -- operation cannot see an alias declared inside a branch.
    select null::uuid, null::text, null::timestamptz, null::public.outbound_status,
           coalesce(sum(r.line_count), 0), coalesce(sum(r.quantity), 0),
           coalesce(sum(r.value_mdl), 0), 'total'::text
    from ranked r
  ) u
  order by u.row_kind, u.issued_at desc nulls last
$$;

comment on function public.project_material_summary(uuid, integer) is
  'The P3-09 Consum tab: the most recent outbound issues to one project, NEWEST FIRST, plus one total row covering every issue and not only the ones shown. Deliberately a different shape from client_material_summary, which ranks PRODUCTS by quantity: the client tab answers "what does this customer use" and the project tab answers "what went to this site and when". Value uses the LIVE catalogue price, the same rule the cost report follows.';

grant execute on function public.project_material_summary(uuid, integer) to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'project_material_summary';
