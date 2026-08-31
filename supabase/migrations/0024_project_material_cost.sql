-- 0024_project_material_cost.sql
-- RC Inventory phase 3, card P3-11. Costul materialului pe proiect.
--
-- THE FORMULA IS THE CARD: sum over outbound_lines of quantity times
-- products.unit_value_mdl, grouped by outbound_issues.project_id. NOT
-- sale_price_mdl. sale_price_mdl answers what was CHARGED. This answers what it
-- COST, and Rapid Construct issues material to its own jobs without pricing it,
-- so that column is frequently blank and would silently understate every total.
--
-- ONE FUNCTION, THREE SHAPES, so that the total and its two breakdowns cannot
-- disagree. They are computed from one common table expression and returned as
-- one set discriminated by row_kind. Two queries for one number is how two
-- panels on the same screen come to show different money.
--
-- MONTHS ARE BUCKETED IN Europe/Chisinau, NOT IN UTC. An issue at 01:30 local on
-- the first of a month belongs to that month; UTC bucketing puts it in the
-- previous one, which is a real off-by-one on real Moldovan working hours.
--
-- ALL ISSUES COUNT BY DEFAULT, awaiting_shipment AND shipped. The material left
-- the building when it was issued. Shipping is a logistics state, not a cost
-- event. p_shipped_only narrows it, and the screen defaults to all.
--
-- FULL NUMERIC PRECISION HERE, ROUNDING ONLY AT DISPLAY. Rounding per line and
-- then summing is how a total stops matching its own breakdown.
--
-- SECURITY INVOKER, so RLS applies unchanged.
--
-- NOT APPLIED TO PRODUCTION BY THIS PULL REQUEST. The apply is card P3-27.

begin;

create or replace function public.project_material_cost(
  p_project_id   uuid,
  p_shipped_only boolean default false,
  p_limit        integer default 5
)
returns table (
  row_kind     text,
  label        text,
  product_id   uuid,
  sku          text,
  unit         public.unit_code,
  month_start  date,
  quantity     numeric,
  value_mdl    numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with lines as (
    select
      ol.product_id,
      pr.sku,
      pr.name                                          as product_name,
      pr.unit,
      ol.quantity                                      as quantity,
      ol.quantity * coalesce(pr.unit_value_mdl, 0)     as value_mdl,
      (date_trunc('month', oi.issued_at at time zone 'Europe/Chisinau'))::date as month_start
    from public.outbound_issues oi
    join public.outbound_lines ol on ol.outbound_issue_id = oi.id
    join public.products pr on pr.id = ol.product_id
    where oi.project_id = p_project_id
      and (not coalesce(p_shipped_only, false) or oi.status = 'shipped')
  ),
  by_product as (
    select
      l.product_id,
      l.sku,
      l.product_name,
      l.unit,
      sum(l.quantity)  as quantity,
      sum(l.value_mdl) as value_mdl
    from lines l
    group by l.product_id, l.sku, l.product_name, l.unit
  ),
  by_month as (
    select
      l.month_start,
      sum(l.quantity)  as quantity,
      sum(l.value_mdl) as value_mdl
    from lines l
    group by l.month_start
  )
  -- ORDINEA SE PUNE PE INVELIS, NU PE RAMURI. Un ORDER BY pe o operatie de
  -- multimi nu poate vedea un alias declarat inauntrul unei ramuri, iar fara el
  -- ordinea randurilor dupa UNION ALL nu este garantata deloc. Aceeasi capcana
  -- si acelasi remediu ca in 0022 si 0023.
  select u.row_kind, u.label, u.product_id, u.sku, u.unit,
         u.month_start, u.quantity, u.value_mdl
  from (
  -- TOTALUL. Un singur rand, si el exista si cand nu este nicio linie: zero este
  -- un raspuns, absenta randului ar fi o pagina goala.
  select
    'total'::text                as row_kind,
    null::text                   as label,
    null::uuid                   as product_id,
    null::text                   as sku,
    null::public.unit_code       as unit,
    null::date                   as month_start,
    coalesce((select sum(l.quantity) from lines l), 0)  as quantity,
    coalesce((select sum(l.value_mdl) from lines l), 0) as value_mdl
  union all
  -- DEFALCAREA PE PRODUS, cele mai scumpe primele, cel mult p_limit randuri.
  select
    'product'::text, p.product_name, p.product_id, p.sku, p.unit,
    null::date, p.quantity, p.value_mdl
  from (
    select b.*, row_number() over (order by b.value_mdl desc, b.sku asc) as rn
    from by_product b
  ) p
  where p.rn <= greatest(p_limit, 1)
  union all
  -- DEFALCAREA PE LUNA, cele mai noi primele, cel mult p_limit randuri.
  select
    'month'::text, null::text, null::uuid, null::text, null::public.unit_code,
    m.month_start, m.quantity, m.value_mdl
  from (
    select b.*, row_number() over (order by b.month_start desc) as rn
    from by_month b
  ) m
  where m.rn <= greatest(p_limit, 1)
  ) u
  order by u.row_kind, u.value_mdl desc nulls last, u.month_start desc nulls last
$$;

comment on function public.project_material_cost(uuid, boolean, integer) is
  'P3-11: costul materialului consumat de un proiect, cantitate ori valoarea curenta din catalog, cu defalcare pe produs si pe luna. O singura interogare pentru total si defalcari, ca ele sa nu poata sa nu se potriveasca. Lunile sunt grupate in Europe/Chisinau. Valoarea este pretul CURENT din catalog, nu unul inregistrat la momentul iesirii.';

grant execute on function public.project_material_cost(uuid, boolean, integer) to authenticated;

-- IESIRILE FARA PROIECT SE NUMARA, NU SE ASCUND. Un total partial care nu spune
-- ca este partial este mai rau decat lipsa lui. Ecranul de cost afiseaza acest
-- numar in fiecare stare, inclusiv zero.
create or replace function public.unassigned_outbound_count()
returns bigint
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*)::bigint
  from public.outbound_issues oi
  where oi.project_id is null
$$;

comment on function public.unassigned_outbound_count() is
  'P3-11: cate iesiri nu au inca un proiect. Ele sunt excluse din orice total pe proiect si raportate separat, niciodata varsate intr-un proiect "altele".';

grant execute on function public.unassigned_outbound_count() to authenticated;

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('project_material_cost', 'unassigned_outbound_count')
order by p.proname;
