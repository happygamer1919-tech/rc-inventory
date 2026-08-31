-- 0022_client_detail.sql
-- RC Inventory phase 3, card P3-08. What the client detail tabs need.
--
-- TWO FUNCTIONS AND A PROBLEM WORTH READING.
--
-- THE CONSUMPTION JOIN GOES THROUGH PROJECTS, NOT THROUGH THE OLD FREE TEXT:
-- outbound_issues.project_id to projects.client_id. That is the whole point of
-- P3-04, and using outbound_issues.client_name here instead would keep the
-- column alive after P3-04b is supposed to remove it.
--
-- AND ISSUES WITH NO PROJECT ARE NOT SILENTLY DROPPED. P3-04 left the column
-- nullable while history is reconciled, so some issues have no project and
-- therefore no client. They cannot be attributed and must not be invented. The
-- summary function returns them as a COUNT alongside the totals, and the screen
-- says how many are unassigned. A total that quietly omits rows is worse than
-- one that admits it is partial: the first is believed.
--
-- SET-RETURNING AND SECURITY INVOKER, so RLS applies unchanged. Neither
-- function widens anything; they are shapes, not permissions.
--
-- NOT APPLIED TO PRODUCTION BY THIS PULL REQUEST. The apply is card P3-27.

begin;


-- ===========================================================================
-- 1. WHAT A CLIENT HAS CONSUMED
-- ===========================================================================
--
-- AT MOST p_limit PRODUCT ROWS, BY QUANTITY, and the caller asks for five. The
-- full ledger belongs to the reporting card; dumping it on a detail page is the
-- density failure the owner called out by name.
--
-- THE VALUE USES THE LIVE CATALOGUE PRICE, deliberately, and this is the same
-- rule P3-11 and P3-13c follow: a consumption report measures reality and reads
-- the current value. Only a deviz freezes a price, because a deviz records a
-- promise made on a day.

create or replace function public.client_material_summary(
  p_client_id uuid,
  p_limit     integer default 5
)
returns table (
  product_id   uuid,
  product_sku  text,
  product_name text,
  unit         public.unit_code,
  quantity     numeric,
  value_mdl    numeric,
  row_kind     text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with lines as (
    select ol.product_id, sum(ol.quantity) as quantity
    from public.outbound_lines ol
    join public.outbound_issues oi on oi.id = ol.outbound_issue_id
    join public.projects p on p.id = oi.project_id
    where p.client_id = p_client_id
    group by ol.product_id
  ),
  ranked as (
    select
      l.product_id,
      pr.sku,
      pr.name,
      pr.unit,
      l.quantity,
      l.quantity * coalesce(pr.unit_value_mdl, 0) as value_mdl,
      row_number() over (order by l.quantity desc, pr.name) as rn
    from lines l
    join public.products pr on pr.id = l.product_id
  )
  -- The top rows, then ONE total row covering everything including what the
  -- top rows left out. A screen that showed five rows and a total of those five
  -- would answer a question nobody asked.
  select u.product_id, u.product_sku, u.product_name, u.unit, u.quantity, u.value_mdl, u.row_kind
  from (
    select r.product_id, r.sku as product_sku, r.name as product_name, r.unit,
           r.quantity, r.value_mdl, 'row'::text as row_kind
    from ranked r
    where r.rn <= greatest(p_limit, 1)
    union all
    select null::uuid, null::text, null::text, null::public.unit_code,
           coalesce(sum(r.quantity), 0), coalesce(sum(r.value_mdl), 0), 'total'::text
    from ranked r
  ) u
  -- The total sorts LAST, which is why row_kind ascends: 'row' < 'total'.
  order by u.row_kind, u.quantity desc nulls last
$$;

comment on function public.client_material_summary(uuid, integer) is
  'The P3-08 Consum materiale tab: the top products issued to a client, joined THROUGH PROJECTS (outbound_issues.project_id to projects.client_id) and never through the old free text, plus one total row covering everything and not only the rows shown. Value uses the LIVE catalogue price, the same rule the cost report follows; only a deviz freezes a price.';

grant execute on function public.client_material_summary(uuid, integer) to authenticated;


-- ===========================================================================
-- 2. HOW MANY ISSUES CANNOT BE ATTRIBUTED
-- ===========================================================================
--
-- P3-04 left outbound_issues.project_id nullable while the historical rows are
-- reconciled. Those issues belong to nobody as far as this join is concerned,
-- and the screen has to SAY SO rather than let a total look complete.
--
-- IT IS A GLOBAL COUNT AND NOT A PER-CLIENT ONE, and that is not laziness: an
-- issue with no project has no client either, so it cannot be counted against
-- one. The Romanian line on the screen says how many issues in the system are
-- not yet assigned, which is the honest statement.

create or replace function public.unassigned_issue_count()
returns bigint
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*) from public.outbound_issues where project_id is null
$$;

comment on function public.unassigned_issue_count() is
  'How many outbound issues still carry no project, and therefore cannot be attributed to any client. P3-08 shows this beside every client consumption total, because a total that quietly omits rows is worse than one that admits it is partial. Reaches zero when the P3-04 reconciliation is finished, and P3-04b is gated on that.';

grant execute on function public.unassigned_issue_count() to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('client_material_summary', 'unassigned_issue_count')
order by p.proname;
