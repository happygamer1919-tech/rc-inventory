-- scripts/poc-free/local-db/assertions/0022_client_detail.sql
-- Card P3-08. Assertions for the client consumption summary and the
-- unassigned-issue count. Ruling R-062.

do $$
declare
  n integer;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in ('client_material_summary', 'unassigned_issue_count');
  if n <> 2 then
    raise exception 'P3-08: expected both functions, found %', n;
  end if;
end
$$;

begin;

insert into public.clients (id, name, fiscal_code) values
  ('e8000000-0000-0000-0000-000000000001', 'Consum Unu SRL', '1001600000301'),
  ('e8000000-0000-0000-0000-000000000002', 'Consum Doi SRL', '1001600000302');

insert into public.projects (id, client_id, name) values
  ('e8100000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000001', 'Santier A'),
  ('e8100000-0000-0000-0000-000000000002', 'e8000000-0000-0000-0000-000000000001', 'Santier B'),
  ('e8100000-0000-0000-0000-000000000003', 'e8000000-0000-0000-0000-000000000002', 'Santier Strain');

insert into public.categories (id, name) values ('e8200000-0000-0000-0000-000000000001', 'Test P3-08');

-- Seven products, so the top-five cut has something to cut.
insert into public.products (id, sku, name, category_id, unit, unit_value_mdl)
select
  ('e8300000-0000-0000-0000-00000000000' || i)::uuid,
  'P308-' || i,
  'Produs ' || i,
  'e8200000-0000-0000-0000-000000000001',
  'pcs',
  10
from generate_series(1, 7) as i;

-- The stock chain, so create-free direct inserts into outbound_lines are
-- legitimate: these rows are the ledger, not a screen action.
insert into public.inbound_orders (id, reference, status, arrived_at)
values ('e8400000-0000-0000-0000-000000000001', 'CMD-P308', 'arrived', now());
insert into public.order_lines (id, inbound_order_id, product_id, quantity)
select ('e8500000-0000-0000-0000-00000000000' || i)::uuid,
       'e8400000-0000-0000-0000-000000000001',
       ('e8300000-0000-0000-0000-00000000000' || i)::uuid,
       1000
from generate_series(1, 7) as i;
insert into public.batches (product_id, inbound_order_id, order_line_id, quantity)
select ('e8300000-0000-0000-0000-00000000000' || i)::uuid,
       'e8400000-0000-0000-0000-000000000001',
       ('e8500000-0000-0000-0000-00000000000' || i)::uuid,
       1000
from generate_series(1, 7) as i;

insert into public.outbound_issues (id, reference, project_id, status) values
  -- TWO PROJECTS OF THE SAME CLIENT. The tab aggregates ACROSS their projects,
  -- which is what makes it a client view rather than a project view.
  ('e8600000-0000-0000-0000-000000000001', 'IES-P308-1', 'e8100000-0000-0000-0000-000000000001', 'awaiting_shipment'),
  ('e8600000-0000-0000-0000-000000000002', 'IES-P308-2', 'e8100000-0000-0000-0000-000000000002', 'awaiting_shipment'),
  -- Another client's project. Must never appear in the first client's totals.
  ('e8600000-0000-0000-0000-000000000003', 'IES-P308-3', 'e8100000-0000-0000-0000-000000000003', 'awaiting_shipment');
  -- THE FOURTH ISSUE, WITH NO PROJECT, WAS REMOVED BY P3-04b AND ITS ABSENCE IS
  -- THE POINT. It existed to prove that an issue attributable to nobody is
  -- COUNTED rather than dropped. outbound_issues.project_id is NOT NULL as of
  -- migration 0026, so that row can no longer be inserted and that state can no
  -- longer occur. The half of the leak assertion below that it fed is gone with
  -- it; the other-client half, which is the one that proves the join goes
  -- through projects.client_id, is untouched and still fails if the join breaks.

-- Client one takes all seven products across two projects, in descending
-- quantity so the ranking is unambiguous, and product 1 twice so the
-- aggregation across projects is exercised.
insert into public.outbound_lines (outbound_issue_id, product_id, quantity)
select 'e8600000-0000-0000-0000-000000000001',
       ('e8300000-0000-0000-0000-00000000000' || i)::uuid,
       (8 - i) * 10
from generate_series(1, 7) as i;
insert into public.outbound_lines (outbound_issue_id, product_id, quantity)
values ('e8600000-0000-0000-0000-000000000002', 'e8300000-0000-0000-0000-000000000001', 30);

-- The other client, and the unassigned issue, both take product 7 heavily. If
-- either leaked into client one's summary it would top the ranking.
insert into public.outbound_lines (outbound_issue_id, product_id, quantity) values
  ('e8600000-0000-0000-0000-000000000003', 'e8300000-0000-0000-0000-000000000007', 5000);

do $$
declare
  n     integer;
  q     numeric;
  v     numeric;
  first text;
begin
  -- --- FIVE ROWS PLUS ONE TOTAL, never seven -------------------------------
  select count(*) into n from public.client_material_summary('e8000000-0000-0000-0000-000000000001', 5)
  where row_kind = 'row';
  if n <> 5 then
    raise exception 'P3-08: expected 5 product rows from 7 products, found %', n;
  end if;
  select count(*) into n from public.client_material_summary('e8000000-0000-0000-0000-000000000001', 5)
  where row_kind = 'total';
  if n <> 1 then
    raise exception 'P3-08: expected exactly one total row, found %', n;
  end if;

  -- --- AGGREGATED ACROSS THE CLIENT PROJECTS -------------------------------
  -- Product 1 is 70 on one project and 30 on the other. One row, 100.
  select quantity into q from public.client_material_summary('e8000000-0000-0000-0000-000000000001', 5)
  where product_sku = 'P308-1';
  if q is distinct from 100 then
    raise exception 'P3-08: product 1 across two projects came to %, expected 100', q;
  end if;

  -- And it is the biggest, so it leads the ranking.
  select product_sku into first from public.client_material_summary('e8000000-0000-0000-0000-000000000001', 5)
  where row_kind = 'row' limit 1;
  if first <> 'P308-1' then
    raise exception 'P3-08: the ranking leads with %, expected P308-1', first;
  end if;

  -- --- ANOTHER CLIENT DOES NOT LEAK ----------------------------------------
  -- Product 7 is 5000 on the OTHER CLIENT and only 10 here. If it leaked it
  -- would top the list, so this is the assertion that proves the join goes
  -- through projects.client_id. It used to carry a second 5000 on an issue with
  -- no project at all; P3-04b made that row impossible to insert, so that half
  -- is gone and this half is unchanged.
  select quantity into q from public.client_material_summary('e8000000-0000-0000-0000-000000000001', 7)
  where product_sku = 'P308-7';
  if q is distinct from 10 then
    raise exception 'P3-08: product 7 came to % for this client, expected 10; another client leaked in', q;
  end if;

  -- --- THE TOTAL COVERS EVERYTHING, NOT ONLY THE ROWS SHOWN ----------------
  -- 70+60+50+40+30+20+10 across the first issue, plus 30 on the second = 310.
  -- A total of only the top five would be 280.
  select quantity, value_mdl into q, v
  from public.client_material_summary('e8000000-0000-0000-0000-000000000001', 5)
  where row_kind = 'total';
  if q is distinct from 310 then
    raise exception 'P3-08: the total is %, expected 310 covering all seven products and not only the five shown', q;
  end if;
  -- Every product is valued at 10, so the value is quantity times ten.
  if v is distinct from 3100 then
    raise exception 'P3-08: the total value is %, expected 3100', v;
  end if;

  -- --- A CLIENT WITH NOTHING GETS A ZERO TOTAL AND NO ROWS -----------------
  -- Not an empty result and not an error: the screen needs something to render,
  -- and "no consumption" is a fact worth stating.
  insert into public.clients (id, name) values ('e8000000-0000-0000-0000-000000000009', 'Client Fara Nimic');
  select count(*) into n from public.client_material_summary('e8000000-0000-0000-0000-000000000009', 5)
  where row_kind = 'row';
  if n <> 0 then
    raise exception 'P3-08: a client with no issues returned % product rows', n;
  end if;
  select quantity into q from public.client_material_summary('e8000000-0000-0000-0000-000000000009', 5)
  where row_kind = 'total';
  if q is distinct from 0 then
    raise exception 'P3-08: a client with no issues has a total of %, expected 0', q;
  end if;

  -- --- THE UNASSIGNED COUNT, WHICH CAN NOW ONLY EVER BE ZERO ---------------
  -- P3-04b made outbound_issues.project_id NOT NULL, so an issue without a
  -- project cannot be inserted and this function counts a state that can no
  -- longer occur. The assertion is kept rather than deleted because it still
  -- proves the function EXISTS and RUNS; what it can no longer prove is that a
  -- non-zero count is reported correctly, and no fixture can make it non-zero.
  --
  -- The screen degrades correctly on its own: ClientTabs renders the notice only
  -- when the count is above zero, so the warning disappears exactly when the
  -- condition it warns about becomes impossible. The function is now a constant
  -- and retiring it is a later card, not this one.
  select public.unassigned_issue_count() into n;
  if n <> 0 then
    raise exception 'P3-08: expected 0 unassigned issues now that project_id is NOT NULL, found %', n;
  end if;
end
$$;

rollback;
