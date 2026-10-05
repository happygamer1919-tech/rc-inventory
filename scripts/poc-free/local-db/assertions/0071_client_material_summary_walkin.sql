-- scripts/poc-free/local-db/assertions/0071_client_material_summary_walkin.sql
-- Card P3-159. A walk-in sale counts for its buyer in client_material_summary.
--
-- Three cases, each with a witness so a function that always answers zero or
-- always answers everything fails one of them:
--   1. a client with ONE walk-in sale of 50 units and no project shows 50
--   2. a client with a project issue (30) and a walk-in sale (50) shows 80, each
--      line counted once
--   3. another client's walk-in sale (5000) does not leak into either
--
-- Everything runs inside a transaction that is rolled back. Refusals carry no
-- diacritics, the convention of 0063, 0066 and 0067.

begin;

insert into public.clients (id, name) values
  ('e9000000-0000-0000-0000-000000000001', 'TEST P3-159 doar ghiseu'),
  ('e9000000-0000-0000-0000-000000000002', 'TEST P3-159 proiect si ghiseu'),
  ('e9000000-0000-0000-0000-000000000003', 'TEST P3-159 alt client');

insert into public.projects (id, client_id, name)
values ('e9100000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000002', 'TEST P3-159 santier');

insert into public.categories (id, name) values ('e9200000-0000-0000-0000-000000000001', 'Test P3-159');
insert into public.products (id, sku, name, category_id, unit, unit_value_mdl)
values ('e9300000-0000-0000-0000-000000000001', 'P3159-1', 'Produs P3-159', 'e9200000-0000-0000-0000-000000000001', 'pcs', 10);

-- The stock chain, so the direct inserts into outbound_lines are legitimate.
insert into public.inbound_orders (id, reference, status, arrived_at)
values ('e9400000-0000-0000-0000-000000000001', 'CMD-P3159', 'arrived', now());
insert into public.order_lines (id, inbound_order_id, product_id, quantity)
values ('e9500000-0000-0000-0000-000000000001', 'e9400000-0000-0000-0000-000000000001', 'e9300000-0000-0000-0000-000000000001', 10000);
insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
values ('e9300000-0000-0000-0000-000000000001', 'e9400000-0000-0000-0000-000000000001', 'e9500000-0000-0000-0000-000000000001', 10000);

insert into public.outbound_issues (id, reference, issue_mode, client_id, pickup_date) values
  ('e9600000-0000-0000-0000-000000000001', 'IES-P3159-W1', 'direct_client', 'e9000000-0000-0000-0000-000000000001', date '2026-10-04'),
  ('e9600000-0000-0000-0000-000000000002', 'IES-P3159-W2', 'direct_client', 'e9000000-0000-0000-0000-000000000002', date '2026-10-04'),
  ('e9600000-0000-0000-0000-000000000003', 'IES-P3159-W3', 'direct_client', 'e9000000-0000-0000-0000-000000000003', date '2026-10-04');
insert into public.outbound_issues (id, reference, project_id)
values ('e9600000-0000-0000-0000-000000000004', 'IES-P3159-P1', 'e9100000-0000-0000-0000-000000000001');

insert into public.outbound_lines (outbound_issue_id, product_id, quantity) values
  ('e9600000-0000-0000-0000-000000000001', 'e9300000-0000-0000-0000-000000000001', 50),
  ('e9600000-0000-0000-0000-000000000002', 'e9300000-0000-0000-0000-000000000001', 50),
  ('e9600000-0000-0000-0000-000000000003', 'e9300000-0000-0000-0000-000000000001', 5000),
  ('e9600000-0000-0000-0000-000000000004', 'e9300000-0000-0000-0000-000000000001', 30);

do $$
declare
  q numeric;
  n integer;
begin
  -- 1. WALK-IN ONLY: one row, 50.
  select quantity into q from public.client_material_summary('e9000000-0000-0000-0000-000000000001', 5)
  where product_sku = 'P3159-1';
  if q is distinct from 50 then
    raise exception 'P3-159: a walk-in sale of 50 shows % for its buyer, expected 50', q;
  end if;

  select quantity into q from public.client_material_summary('e9000000-0000-0000-0000-000000000001', 5)
  where row_kind = 'total';
  if q is distinct from 50 then
    raise exception 'P3-159: the walk-in client total is %, expected 50', q;
  end if;

  -- 2. PROJECT PLUS WALK-IN: 30 + 50, one row, each line once.
  select count(*) into n from public.client_material_summary('e9000000-0000-0000-0000-000000000002', 5)
  where row_kind = 'row';
  if n <> 1 then
    raise exception 'P3-159: expected one product row for project plus walk-in, found %', n;
  end if;
  select quantity into q from public.client_material_summary('e9000000-0000-0000-0000-000000000002', 5)
  where row_kind = 'total';
  if q is distinct from 80 then
    raise exception 'P3-159: project 30 plus walk-in 50 came to %, expected 80', q;
  end if;

  -- 3. THE OTHER CLIENT'S 5000 DOES NOT LEAK INTO EITHER.
  select quantity into q from public.client_material_summary('e9000000-0000-0000-0000-000000000003', 5)
  where row_kind = 'total';
  if q is distinct from 5000 then
    raise exception 'P3-159: the other client total is %, expected 5000', q;
  end if;

  -- THE SIGNATURE AND THE GRANT ARE WHAT lib/data/client-detail.ts RELIES ON.
  if not has_function_privilege('authenticated', 'public.client_material_summary(uuid, integer)', 'execute') then
    raise exception 'P3-159: authenticated lost execute on client_material_summary';
  end if;
end $$;

rollback;
