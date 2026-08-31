-- scripts/poc-free/local-db/assertions/0023_project_material_summary.sql
-- Card P3-09. Ruling R-062.

do $$
declare n integer;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'project_material_summary';
  if n <> 1 then
    raise exception 'P3-09: expected public.project_material_summary, found %', n;
  end if;
end
$$;

begin;

insert into public.clients (id, name) values ('e9000000-0000-0000-0000-000000000001', 'Client P3-09');
insert into public.projects (id, client_id, name) values
  ('e9100000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001', 'Santier P3-09'),
  ('e9100000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000001', 'Alt Santier');

insert into public.categories (id, name) values ('e9200000-0000-0000-0000-000000000001', 'Test P3-09');
insert into public.products (id, sku, name, category_id, unit, unit_value_mdl)
values ('e9300000-0000-0000-0000-000000000001', 'P309-1', 'Produs P3-09',
        'e9200000-0000-0000-0000-000000000001', 'pcs', 10);
insert into public.inbound_orders (id, reference, status, arrived_at)
values ('e9400000-0000-0000-0000-000000000001', 'CMD-P309', 'arrived', now());
insert into public.order_lines (id, inbound_order_id, product_id, quantity)
values ('e9500000-0000-0000-0000-000000000001', 'e9400000-0000-0000-0000-000000000001',
        'e9300000-0000-0000-0000-000000000001', 10000);
insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
values ('e9300000-0000-0000-0000-000000000001', 'e9400000-0000-0000-0000-000000000001',
        'e9500000-0000-0000-0000-000000000001', 10000);

-- Seven issues on this project with DISTINCT timestamps, so "newest first" has
-- an unambiguous answer, plus one on another project that must never appear.
insert into public.outbound_issues (id, reference, client_name, project_name, project_id, status, issued_at)
select
  ('e9600000-0000-0000-0000-00000000000' || i)::uuid,
  'IES-P309-' || i,
  'x', 'y',
  'e9100000-0000-0000-0000-000000000001',
  'awaiting_shipment',
  timestamptz '2026-01-01 00:00:00+00' + (i || ' days')::interval
from generate_series(1, 7) as i;

insert into public.outbound_issues (id, reference, client_name, project_name, project_id, status, issued_at)
values ('e9600000-0000-0000-0000-0000000000ff', 'IES-P309-STRAIN', 'x', 'y',
        'e9100000-0000-0000-0000-000000000002', 'awaiting_shipment', timestamptz '2026-12-31 00:00:00+00');

insert into public.outbound_lines (outbound_issue_id, product_id, quantity)
select ('e9600000-0000-0000-0000-00000000000' || i)::uuid,
       'e9300000-0000-0000-0000-000000000001',
       i * 10
from generate_series(1, 7) as i;

-- The other project takes a lot, so a leak would be obvious in the total.
insert into public.outbound_lines (outbound_issue_id, product_id, quantity)
values ('e9600000-0000-0000-0000-0000000000ff', 'e9300000-0000-0000-0000-000000000001', 9000);

do $$
declare
  n     integer;
  q     numeric;
  first text;
begin
  -- FIVE ROWS FROM SEVEN ISSUES, PLUS ONE TOTAL.
  select count(*) into n from public.project_material_summary('e9100000-0000-0000-0000-000000000001', 5)
  where row_kind = 'row';
  if n <> 5 then
    raise exception 'P3-09: expected 5 issue rows from 7 issues, found %', n;
  end if;

  -- NEWEST FIRST, which is the shape P3-09 asks for and the shape that differs
  -- from the client tab. Issue 7 is the latest.
  select reference into first from public.project_material_summary('e9100000-0000-0000-0000-000000000001', 5)
  where row_kind = 'row' limit 1;
  if first <> 'IES-P309-7' then
    raise exception 'P3-09: the list leads with %, expected the newest IES-P309-7', first;
  end if;

  -- ANOTHER PROJECT DOES NOT LEAK. Its single issue is 9000 units and dated
  -- later than every one of these, so it would lead the list AND dominate the
  -- total if the filter were wrong.
  select count(*) into n from public.project_material_summary('e9100000-0000-0000-0000-000000000001', 25)
  where reference = 'IES-P309-STRAIN';
  if n <> 0 then
    raise exception 'P3-09: another project issue appeared in this project list';
  end if;

  -- THE TOTAL COVERS ALL SEVEN, NOT THE FIVE SHOWN.
  -- 10+20+30+40+50+60+70 = 280. The top five by date are issues 3..7 = 250.
  select quantity into q from public.project_material_summary('e9100000-0000-0000-0000-000000000001', 5)
  where row_kind = 'total';
  if q is distinct from 280 then
    raise exception 'P3-09: the total is %, expected 280 covering all seven issues and not only the five shown', q;
  end if;

  -- A PROJECT WITH NO ISSUES GETS A ZERO TOTAL AND NO ROWS, not an empty result
  -- and not an error: the screen needs something to render.
  select count(*) into n from public.project_material_summary('e9100000-0000-0000-0000-000000000002', 5)
  where row_kind = 'row';
  if n <> 1 then
    raise exception 'P3-09: the other project has one issue and returned % rows', n;
  end if;

  insert into public.projects (id, client_id, name)
  values ('e9100000-0000-0000-0000-000000000009', 'e9000000-0000-0000-0000-000000000001', 'Santier Gol');
  select count(*) into n from public.project_material_summary('e9100000-0000-0000-0000-000000000009', 5)
  where row_kind = 'row';
  if n <> 0 then
    raise exception 'P3-09: an empty project returned % rows', n;
  end if;
  select quantity into q from public.project_material_summary('e9100000-0000-0000-0000-000000000009', 5)
  where row_kind = 'total';
  if q is distinct from 0 then
    raise exception 'P3-09: an empty project has a total of %, expected 0', q;
  end if;

  -- AN ISSUE WITH NO LINES IS STILL AN ISSUE. It happens: a bon created and not
  -- yet filled. It must appear with a zero quantity rather than vanish, because
  -- vanishing would make the count on the tab disagree with the orders screen.
  insert into public.outbound_issues (id, reference, client_name, project_name, project_id, status, issued_at)
  values ('e9600000-0000-0000-0000-0000000000ee', 'IES-P309-GOL', 'x', 'y',
          'e9100000-0000-0000-0000-000000000009', 'awaiting_shipment', now());
  select count(*) into n from public.project_material_summary('e9100000-0000-0000-0000-000000000009', 5)
  where row_kind = 'row';
  if n <> 1 then
    raise exception 'P3-09: an issue with no lines vanished from the list';
  end if;
  select quantity into q from public.project_material_summary('e9100000-0000-0000-0000-000000000009', 5)
  where reference = 'IES-P309-GOL';
  if q is distinct from 0 then
    raise exception 'P3-09: an issue with no lines reported a quantity of %', q;
  end if;
end
$$;

rollback;
