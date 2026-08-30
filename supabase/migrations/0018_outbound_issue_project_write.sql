-- 0018_outbound_issue_project_write.sql
-- RC Inventory phase 3, card P3-04. The write path stops producing new nulls.
--
-- WHY THIS IS A SECOND FILE. 0017 adds the column and backfills the history.
-- Nothing in it changes what a NEW issue records, so on the day 0017 is applied
-- the null set stops shrinking and immediately starts growing again. This file
-- is the half that closes it: `create_outbound_issue` takes the project by id
-- and writes it in the same transaction as the issue, its lines and its history
-- row.
--
-- IT CONTAINS A `DROP FUNCTION`, DECLARED HERE RATHER THAN FOUND DURING AN
-- APPLY. `create_outbound_issue` gains a fifth parameter, which changes its
-- signature, so `create or replace` would leave the four-argument version in
-- place and every existing call would then be ambiguous: PostgreSQL raises
-- "function is not unique" rather than choosing. The old one has to go.
--
-- THAT IS NOT A ROW-DESTROYING STATEMENT AND CLAUDE.md 8.6 SAYS SO IN TERMS.
-- The test that section names is: does executing this statement reduce the
-- number of rows in any table? It does not. It removes a rule about rows, which
-- is the same class as DROP INDEX, DROP POLICY and DROP TRIGGER, all of which
-- that section lists as permitted under three conditions: the statement is
-- quoted verbatim in the report, the file is parsed with pgsql-parser before it
-- goes near a database, and the apply is journalled. **All three belong to card
-- P3-27**, which is where this file is applied, and its notes carry them.
--
-- THE STATEMENT, QUOTED, so it is in the file that contains it as well as in
-- the report:
--
--   drop function if exists public.create_outbound_issue(text, text, text, jsonb);
--
-- IT RUNS AS ONE TRANSACTION, so a failure leaves the old function in place
-- rather than leaving the system with no way to create an issue at all.
--
-- NOT APPLIED TO PRODUCTION BY THIS PULL REQUEST. Card P3-27.

begin;


-- ===========================================================================
-- 1. OUT WITH THE FOUR-ARGUMENT VERSION
-- ===========================================================================
--
-- `if exists` so that a re-run, or an apply onto a project where a previous
-- attempt got this far, does not fail on the drop rather than on something
-- worth failing on.

drop function if exists public.create_outbound_issue(text, text, text, jsonb);


-- ===========================================================================
-- 2. IN WITH THE FIVE-ARGUMENT VERSION
-- ===========================================================================
--
-- Everything except the project is byte-for-byte what 0004 shipped: the
-- deterministic advisory-lock ordering, the under-lock stock check, the
-- INSUFFICIENT_STOCK error contract that lib/data/outbound-actions.ts parses,
-- the lines insert and the first status_history row. **Only the two project
-- lines are new**, and they are marked, so a reader diffing this against 0004
-- can see that the concurrency guarantee was not quietly rewritten while the
-- file was open.
--
-- p_project_id IS VALIDATED, NOT TRUSTED. The interface picks from a list, and
-- an interface is not a permission: a caller can pass any uuid. If the project
-- does not exist the foreign key refuses it, and this raises the Romanian
-- sentence instead of letting a constraint name reach the operator.
--
-- THE NAMES ARE DERIVED FROM THE PROJECT AND ARE NOT TAKEN FROM THE CALLER.
-- client_name and project_name are still NOT NULL on the table and are dropped
-- by P3-04b. Filling them from the chosen project's own rows means the two
-- representations cannot disagree for as long as both exist, which is exactly
-- the window in which they could.
--
-- p_project_id IS NULLABLE IN THE SIGNATURE AND THE INTERFACE REQUIRES IT.
-- The column is nullable while history is reconciled, and a NOT NULL parameter
-- here would make this function unable to record the one case it must still be
-- able to record: an issue whose destination genuinely has no project row yet.
-- When p_project_id is null the caller's names are used, as before.

create or replace function public.create_outbound_issue(
  p_reference    text,
  p_client_name  text,
  p_project_name text,
  p_lines        jsonb,
  p_project_id   uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_issue_id     uuid;
  v_row          record;
  v_available    numeric;
  v_unit         public.unit_code;
  v_client_name  text := p_client_name;
  v_project_name text := p_project_name;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Ieșirea trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  -- NEW IN 0018. Resolve the names from the project itself, so the text columns
  -- and the foreign key cannot describe two different destinations.
  if p_project_id is not null then
    select p.name, c.name
      into v_project_name, v_client_name
    from public.projects p
    join public.clients c on c.id = p.client_id
    where p.id = p_project_id;

    if not found then
      raise exception 'Proiectul ales nu mai există. Reîncarcă pagina și alege din nou.'
        using errcode = 'P0002';
    end if;
  end if;

  -- Lock every product involved, in a deterministic order. Sorting by id means
  -- two transactions touching the same two products take the locks in the same
  -- sequence, so they queue instead of deadlocking.
  for v_row in
    select distinct (line ->> 'product_id')::uuid as product_id
    from jsonb_array_elements(p_lines) as line
    order by 1
  loop
    perform pg_advisory_xact_lock(hashtext(v_row.product_id::text));
  end loop;

  -- Now check, with the locks held. Quantities are summed per product first.
  for v_row in
    select
      (line ->> 'product_id')::uuid as product_id,
      sum((line ->> 'quantity')::numeric) as wanted
    from jsonb_array_elements(p_lines) as line
    group by 1
  loop
    v_available := public.product_available_stock(v_row.product_id);
    if v_row.wanted > v_available then
      select unit into v_unit from public.products where id = v_row.product_id;
      raise exception 'INSUFFICIENT_STOCK|%|%|%',
        v_row.product_id, v_available, coalesce(v_unit::text, 'pcs')
        using errcode = 'P0001';
    end if;
  end loop;

  -- NEW IN 0018: project_id in the column list and in the values.
  insert into public.outbound_issues
    (reference, client_name, project_name, project_id, status, created_by)
  values
    (p_reference, v_client_name, v_project_name, p_project_id, 'awaiting_shipment', auth.uid())
  returning id into v_issue_id;

  insert into public.outbound_lines (outbound_issue_id, product_id, quantity, sale_price_mdl)
  select
    v_issue_id,
    (line ->> 'product_id')::uuid,
    (line ->> 'quantity')::numeric,
    nullif(line ->> 'sale_price_mdl', '')::numeric
  from jsonb_array_elements(p_lines) as line;

  insert into public.status_history
    (entity_type, entity_id, from_status, to_status, note, changed_by)
  values
    ('outbound_issue', v_issue_id, null, 'awaiting_shipment',
     'Ieșire creată de operator. Stocul a fost scăzut.', auth.uid());

  return v_issue_id;
end;
$$;

comment on function public.create_outbound_issue(text, text, text, jsonb, uuid) is
  'Creates an outbound issue with its lines and first history row, refusing any line that would overdraw stock. The check is held under an advisory lock for the life of the transaction, so two simultaneous issues cannot both pass it. Since P3-04 it also records the destination as a project id, and derives client_name and project_name from that project rather than from the caller, so the two representations cannot disagree while both exist.';

grant execute on function public.create_outbound_issue(text, text, text, jsonb, uuid) to authenticated;


commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect exactly ONE function named create_outbound_issue, with five
-- arguments. Two rows here means the drop did not happen and every call is
-- about to fail as ambiguous.

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_outbound_issue'
order by arguments;
