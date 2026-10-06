-- assertions/0072_save_invoice_draft_refuses_walkin.sql
-- Card P3-170. public.save_invoice_draft refuses a walk-in sale and nothing else.
--
-- FOUR CASES, each with a witness so a function that refuses everything, or
-- nothing, fails one of them:
--   1. a walk-in issue (issue_mode direct_client) is refused with P0001 and
--      direct_client in the text, and no invoice row is left for its client
--   2. a project issue still gets its draft, tied to the issue
--   3. an invoice with no issue still gets its draft
--   4. editing an existing draft is unchanged
--
-- Everything runs inside a transaction that is rolled back. Refusals carry no
-- diacritics, the convention of 0063, 0064 and 0067.

begin;

insert into auth.users (id, email) values
  ('e3700000-0000-4000-8000-000000000001', 'p3-170-owner@rc-inventory.local');

insert into public.profiles (id, email, role, active) values
  ('e3700000-0000-4000-8000-000000000001', 'p3-170-owner@rc-inventory.local', 'owner', true);

insert into public.clients (id, name) values
  ('e3701000-0000-4000-8000-000000000001', 'P3-170 Client ghiseu'),
  ('e3701000-0000-4000-8000-000000000002', 'P3-170 Client proiect');

insert into public.projects (id, client_id, name) values
  ('e3702000-0000-4000-8000-000000000001', 'e3701000-0000-4000-8000-000000000002', 'P3-170 Santier');

-- TWO IESIRI, written directly: what is under test is the invoice side, and
-- save_invoice_draft never reads an issue's lines.
insert into public.outbound_issues (id, reference, issue_mode, client_id, pickup_date) values
  ('e3703000-0000-4000-8000-000000000001', 'IES-TEST-P3-170-W', 'direct_client',
   'e3701000-0000-4000-8000-000000000001', date '2026-10-05');
insert into public.outbound_issues (id, reference, project_id) values
  ('e3703000-0000-4000-8000-000000000002', 'IES-TEST-P3-170-P', 'e3702000-0000-4000-8000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"e3700000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  walkin_client  constant uuid := 'e3701000-0000-4000-8000-000000000001';
  project_client constant uuid := 'e3701000-0000-4000-8000-000000000002';
  p1             constant uuid := 'e3702000-0000-4000-8000-000000000001';
  walkin         constant uuid := 'e3703000-0000-4000-8000-000000000001';
  project_issue  constant uuid := 'e3703000-0000-4000-8000-000000000002';
  line           constant jsonb := jsonb_build_array(
    jsonb_build_object('id', '', 'product_id', null, 'description', 'P3-170 linie',
                       'unit', 'pcs', 'quantity', 1, 'unit_price_mdl', 10, 'vat_rate', 20));
  inv     uuid;
  lineid  uuid;
  n       integer;
  refused boolean;
  state   text;
  msg     text;
begin
  -- 1. A WALK-IN SALE IS REFUSED, AND NOTHING IS WRITTEN.
  refused := false;
  begin
    perform public.save_invoice_draft(
      p_client_id => walkin_client,
      p_lines => line,
      p_outbound_issue_id => walkin
    );
  exception when others then
    refused := true;
    get stacked diagnostics state = returned_sqlstate, msg = message_text;
  end;
  if not refused then
    raise exception 'P3-170: save_invoice_draft wrote a draft invoice for a walk-in sale';
  end if;
  if state <> 'P0001' or msg not like '%direct_client%' then
    raise exception 'P3-170: the walk-in refusal is % "%", expected P0001 naming direct_client', state, msg;
  end if;
  select count(*) into n from public.invoices where outbound_issue_id = walkin;
  if n <> 0 then
    raise exception 'P3-170: % invoices exist for the walk-in sale, expected 0', n;
  end if;
  select count(*) into n from public.invoices where client_id = walkin_client;
  if n <> 0 then
    raise exception 'P3-170: % invoices exist for the walk-in client, expected 0', n;
  end if;

  -- 2. THE WITNESS: A PROJECT ISSUE STILL GETS ITS DRAFT, TIED TO THE ISSUE.
  inv := public.save_invoice_draft(
    p_client_id => project_client,
    p_lines => line,
    p_project_id => p1,
    p_outbound_issue_id => project_issue
  );
  if inv is null then
    raise exception 'P3-170: save_invoice_draft returned no id for a project issue';
  end if;
  if (select outbound_issue_id from public.invoices where id = inv) is distinct from project_issue then
    raise exception 'P3-170: the project issue draft is not tied to its issue';
  end if;
  if (select status from public.invoices where id = inv) <> 'draft' then
    raise exception 'P3-170: the project issue draft is not a draft';
  end if;

  -- 4. EDITING THAT DRAFT IS UNCHANGED: the line comes back with its id and a
  -- new note is written.
  select id into lineid from public.invoice_lines where invoice_id = inv;
  perform public.save_invoice_draft(
    p_client_id => project_client,
    p_lines => jsonb_build_array(
      jsonb_build_object('id', lineid, 'product_id', null, 'description', 'P3-170 linie',
                         'unit', 'pcs', 'quantity', 2, 'unit_price_mdl', 10, 'vat_rate', 20)),
    p_invoice_id => inv,
    p_project_id => p1,
    p_notes => 'P3-170 modificata'
  );
  if (select notes from public.invoices where id = inv) is distinct from 'P3-170 modificata' then
    raise exception 'P3-170: editing a draft no longer writes it';
  end if;

  -- 3. AN INVOICE WITH NO ISSUE STILL GETS ITS DRAFT.
  inv := public.save_invoice_draft(
    p_client_id => project_client,
    p_lines => line
  );
  if inv is null or (select outbound_issue_id from public.invoices where id = inv) is not null then
    raise exception 'P3-170: a draft with no issue was not written as before';
  end if;
end
$$;

reset role;

rollback;
