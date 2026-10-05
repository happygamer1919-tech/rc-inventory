-- 0071_client_material_summary_walkin.sql
-- RC Inventory phase 3, card P3-159.
-- A walk-in sale shows on the buyer's own client page, in the 'Consum materiale' tab.
--
-- THE BUG. public.client_material_summary (0022) reached issue lines only through
-- a project: outbound_issues.project_id to projects.client_id. A walk-in sale
-- (0067, ruling R-215) has no project BY DESIGN and names its buyer in
-- outbound_issues.client_id instead, so a client who bought 50 bags at the counter
-- had a tab that said nothing was consumed.
--
-- THE FIX. An issue counts for a client when it belongs to that client through a
-- project OR directly through outbound_issues.client_id. The project join is now a
-- left join. Each issue has exactly one of the two links (the shape constraints of
-- 0067 give a project issue a project and no client, a walk-in a client and no
-- project), and the filter below is one where clause over one row per line, so a
-- line can never be counted twice even if both links were ever set to the same
-- client.
--
-- STATUS. The function never filtered on issue status and still does not: there is
-- no cancelled state on an outbound issue (the enum is awaiting_shipment and
-- shipped, and 0067 builds no cancel path), so there is nothing to leave out.
--
-- WHAT IT CHANGES: one function body, replaced in place. Same signature, same
-- return type, same grant. NO DROP, NO TRUNCATE, NO DELETE, NO UPDATE, NO INSERT.

begin;

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
    left join public.projects p on p.id = oi.project_id
    where p.client_id = p_client_id
       or oi.client_id = p_client_id
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
  'The P3-08 Consum materiale tab: the top products issued to a client, joined THROUGH PROJECTS (outbound_issues.project_id to projects.client_id) or DIRECTLY for a walk-in sale (outbound_issues.client_id, card P3-159), and never through the old free text, plus one total row covering everything and not only the rows shown. Value uses the LIVE catalogue price, the same rule the cost report follows; only a deviz freezes a price.';

grant execute on function public.client_material_summary(uuid, integer) to authenticated;

commit;
