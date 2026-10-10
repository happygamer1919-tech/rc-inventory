-- assertions/0078_invoices_refuse_walkin_issue.sql
-- Card P3-212. public.invoices refuses a row tied to a walk-in sale, on a direct
-- insert and on a direct update, and nothing else.
--
-- SIX CASES, each with a witness so a trigger that refuses everything, or
-- nothing, fails one of them:
--   1. a direct insert naming a walk-in issue is refused with P0001 and
--      direct_client in the text, and no row is left
--   2. a direct update of a draft's outbound_issue_id to a walk-in issue is
--      refused and the draft keeps its old issue
--   3. a direct insert naming a project issue still writes its draft
--   4. a direct insert with no issue still writes its draft
--   5. an existing row already tied to a walk-in issue (written before the
--      trigger, here with the trigger switched off as the superuser) stays
--      editable in its other columns
--   6. save_invoice_draft still refuses a walk-in sale with the same error
--
-- Everything runs inside a transaction that is rolled back.

begin;

insert into auth.users (id, email) values
  ('e3780000-0000-4000-8000-000000000001', 'p3-212-owner@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3780000-0000-4000-8000-000000000001', 'p3-212-owner@rc-inventory.local', 'owner', true);

insert into public.clients (id, name) values
  ('e3781000-0000-4000-8000-000000000001', 'P3-212 Client ghiseu'),
  ('e3781000-0000-4000-8000-000000000002', 'P3-212 Client proiect');

insert into public.projects (id, client_id, name) values
  ('e3782000-0000-4000-8000-000000000001', 'e3781000-0000-4000-8000-000000000002', 'P3-212 Santier');

insert into public.outbound_issues (id, reference, issue_mode, client_id, pickup_date) values
  ('e3783000-0000-4000-8000-000000000001', 'IES-TEST-P3-212-W', 'direct_client',
   'e3781000-0000-4000-8000-000000000001', date '2026-10-10');
insert into public.outbound_issues (id, reference, project_id) values
  ('e3783000-0000-4000-8000-000000000002', 'IES-TEST-P3-212-P', 'e3782000-0000-4000-8000-000000000001');
insert into public.outbound_issues (id, reference, project_id) values
  ('e3783000-0000-4000-8000-000000000003', 'IES-TEST-P3-212-P2', 'e3782000-0000-4000-8000-000000000001');

-- CASE 5's OLD ROW: an invoice tied to a walk-in sale from before this trigger,
-- written with the trigger off, which only the superuser running this file can do.
alter table public.invoices disable trigger invoices_refuse_walkin_issue;
insert into public.invoices (id, client_id, outbound_issue_id, notes) values
  ('e3784000-0000-4000-8000-000000000005', 'e3781000-0000-4000-8000-000000000001',
   'e3783000-0000-4000-8000-000000000001', 'P3-212 rand vechi');
alter table public.invoices enable trigger invoices_refuse_walkin_issue;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3780000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  walkin_client  constant uuid := 'e3781000-0000-4000-8000-000000000001';
  project_client constant uuid := 'e3781000-0000-4000-8000-000000000002';
  p1             constant uuid := 'e3782000-0000-4000-8000-000000000001';
  walkin         constant uuid := 'e3783000-0000-4000-8000-000000000001';
  project_issue  constant uuid := 'e3783000-0000-4000-8000-000000000002';
  project_issue2 constant uuid := 'e3783000-0000-4000-8000-000000000003';
  old_row        constant uuid := 'e3784000-0000-4000-8000-000000000005';
  inv     uuid;
  n       integer;
  refused boolean;
  state   text;
  msg     text;
begin
  -- 1. A DIRECT INSERT NAMING A WALK-IN SALE IS REFUSED.
  refused := false;
  begin
    insert into public.invoices (client_id, outbound_issue_id)
    values (walkin_client, walkin);
  exception when others then
    refused := true;
    get stacked diagnostics state = returned_sqlstate, msg = message_text;
  end;
  if not refused then
    raise exception 'P3-212: a direct insert tied an invoice to a walk-in sale';
  end if;
  if state <> 'P0001' or msg not like '%direct_client%' then
    raise exception 'P3-212: the insert refusal is % "%", expected P0001 naming direct_client', state, msg;
  end if;
  select count(*) into n from public.invoices where outbound_issue_id = walkin and id <> old_row;
  if n <> 0 then
    raise exception 'P3-212: % new invoices exist for the walk-in sale, expected 0', n;
  end if;

  -- 3. THE WITNESS: A DIRECT INSERT NAMING A PROJECT ISSUE STILL WRITES.
  insert into public.invoices (client_id, project_id, outbound_issue_id)
  values (project_client, p1, project_issue)
  returning id into inv;
  if inv is null then
    raise exception 'P3-212: a direct insert for a project issue was not written';
  end if;

  -- 2. A DIRECT UPDATE OF THAT DRAFT TO THE WALK-IN SALE IS REFUSED.
  refused := false;
  begin
    update public.invoices set outbound_issue_id = walkin where id = inv;
  exception when others then
    refused := true;
    get stacked diagnostics state = returned_sqlstate, msg = message_text;
  end;
  if not refused then
    raise exception 'P3-212: a direct update tied a draft invoice to a walk-in sale';
  end if;
  if state <> 'P0001' or msg not like '%direct_client%' then
    raise exception 'P3-212: the update refusal is % "%", expected P0001 naming direct_client', state, msg;
  end if;
  if (select outbound_issue_id from public.invoices where id = inv) is distinct from project_issue then
    raise exception 'P3-212: the draft lost its project issue';
  end if;

  -- AND THE WITNESS: moving that draft to another project issue still writes.
  update public.invoices set outbound_issue_id = project_issue2 where id = inv;
  if (select outbound_issue_id from public.invoices where id = inv) is distinct from project_issue2 then
    raise exception 'P3-212: a draft could not move to another project issue';
  end if;

  -- 4. A DIRECT INSERT WITH NO ISSUE STILL WRITES.
  insert into public.invoices (client_id) values (project_client) returning id into inv;
  if inv is null then
    raise exception 'P3-212: a direct insert with no issue was not written';
  end if;

  -- 5. THE OLD ROW STAYS EDITABLE, the whole row sent back included.
  update public.invoices
     set notes = 'P3-212 rand vechi modificat', outbound_issue_id = walkin
   where id = old_row;
  if (select notes from public.invoices where id = old_row) is distinct from 'P3-212 rand vechi modificat' then
    raise exception 'P3-212: an existing invoice tied to a walk-in sale is no longer editable';
  end if;

  -- 6. save_invoice_draft STILL REFUSES WITH THE SAME ERROR.
  refused := false;
  begin
    perform public.save_invoice_draft(
      p_client_id => walkin_client,
      p_lines => jsonb_build_array(
        jsonb_build_object('id', '', 'product_id', null, 'description', 'P3-212 linie',
                           'unit', 'pcs', 'quantity', 1, 'unit_price_mdl', 10, 'vat_rate', 20)),
      p_outbound_issue_id => walkin
    );
  exception when others then
    refused := true;
    get stacked diagnostics state = returned_sqlstate, msg = message_text;
  end;
  if not refused or state <> 'P0001' or msg not like '%direct_client%' then
    raise exception 'P3-212: save_invoice_draft no longer refuses a walk-in sale with P0001';
  end if;
end
$$;

reset role;

rollback;
