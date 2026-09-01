-- 0026_drop_outbound_free_text.sql
-- RC Inventory phase 3, card P3-04b. The destination stops having two
-- representations.
--
-- WHAT 0017 AND 0018 LEFT BEHIND ON PURPOSE. 0017 added
-- outbound_issues.project_id as NULLABLE and backfilled what it could match,
-- leaving client_name and project_name in place; 0018 made the write path fill
-- the project id and derive the two text columns from the chosen project. Both
-- files say in their own headers that the drop is P3-04b and happens only after
-- the backfill is verified. This is that file.
--
-- THE VERIFICATION IT RESTS ON IS A VACUOUS ZERO, AND THE CARD SAYS SO IN PLAIN
-- WORDS RATHER THAN LETTING ITS EVIDENCE READ AS A PROVEN BACKFILL.
-- On 2026-08-31, immediately after the wave 1 apply, production held:
--
--     select count(*) from public.outbound_issues where project_id is null;  -> 0
--     select count(*) from public.outbound_issues;                           -> 0
--
-- The first zero is true because the second is. NO ROW WAS MATCHED, BECAUSE NO
-- ROW EXISTED. The owner ratified the drop on exactly that basis on 2026-09-01:
-- being wrong today costs nothing because there is nothing to lose, and the
-- alternative is a second production apply against tables that by then hold real
-- client data, which is the more dangerous moment to do this. Anyone reading this
-- later must not mistake it for a backfill that was verified against real rows.
--
-- CONTAINS NO DROP TABLE, NO TRUNCATE AND NO DELETE.
--
-- IT CONTAINS TWO `DROP` STATEMENTS AND ONE `DROP COLUMN`, ALL DECLARED HERE.
--   drop function if exists public.backfill_outbound_project_ids();
--   alter table public.outbound_issues drop column client_name, drop column project_name;
-- Neither reduces the number of rows in any table, which is the test CLAUDE.md
-- 8.6 applies. A column drop removes a field, not a row; the function drop
-- removes a rule about rows. Both are applied through the R-082 applier, whose
-- zero-rows-deleted assertion compares every table's count before and after.
--
-- THE RPC SIGNATURE DOES NOT CHANGE, AND THAT IS DELIBERATE. p_client_name and
-- p_project_name become ignored rather than removed. Reshaping the function to
-- three arguments would mean a second DROP FUNCTION and would trip the applier's
-- own `one-create-outbound-issue-five-args` assertion, and adjusting an assertion
-- so that one's own migration can pass is the one thing the apply discipline
-- forbids. The application already passes empty strings for both, so nothing on
-- the calling side changes either.

begin;


-- ===========================================================================
-- 1. THE DESTINATION IS NOW REQUIRED
-- ===========================================================================
--
-- 0017 made the column nullable "while the historical rows are reconciled". They
-- are reconciled: there are none. Every future row gets its project from the
-- picker, which the interface has required since P3-04.
--
-- A row that genuinely has no project can no longer be recorded, and that is the
-- intended end state: the whole point of the column is that the destination is a
-- record. If a destination without a project row is ever needed again, it is a
-- new card and a new migration, not a nullable column left open in case.

alter table public.outbound_issues
  alter column project_id set not null;

comment on column public.outbound_issues.project_id is
  'The destination, as a record. NOT NULL since P3-04b: the free-text client_name and project_name columns are gone and this is the only representation of where materials went. Set by the picker on every write path.';


-- ===========================================================================
-- 2. THE WRITE PATH STOPS FILLING COLUMNS THAT ARE ABOUT TO NOT EXIST
-- ===========================================================================
--
-- Replaced whole, same five-argument signature, so no DROP FUNCTION and no
-- ambiguity. Everything except the insert column list and the now-required
-- project is byte-for-byte what 0018 shipped: the deterministic advisory-lock
-- ordering, the under-lock stock check, the INSUFFICIENT_STOCK error contract
-- that lib/data/outbound-actions.ts parses, the lines insert and the first
-- status_history row.
--
-- p_project_id IS NOW REQUIRED IN THE BODY, because the column is NOT NULL.
-- 0018 documented why it was nullable then: the column was nullable while
-- history was reconciled. That reason is spent.
--
-- p_client_name AND p_project_name ARE ACCEPTED AND IGNORED. See the header.

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
  v_issue_id  uuid;
  v_row       record;
  v_available numeric;
  v_unit      public.unit_code;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Ieșirea trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  -- NEW IN 0026. The destination is required, and the refusal is a Romanian
  -- sentence rather than a not-null constraint name reaching the operator.
  if p_project_id is null then
    raise exception 'Alege proiectul către care pleacă materialele.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Proiectul ales nu mai există. Reîncarcă pagina și alege din nou.'
      using errcode = 'P0002';
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

  -- NEW IN 0026: client_name and project_name are gone from the column list.
  insert into public.outbound_issues
    (reference, project_id, status, created_by)
  values
    (p_reference, p_project_id, 'awaiting_shipment', auth.uid())
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
  'Creates an outbound issue with its lines and first history row, refusing any line that would overdraw stock. The check is held under an advisory lock for the life of the transaction, so two simultaneous issues cannot both pass it. Since P3-04b the destination is a project id and nothing else: p_client_name and p_project_name are accepted for signature stability and ignored, because the text columns they used to fill no longer exist.';


-- ===========================================================================
-- 3. THE BACKFILL FUNCTION, WHOSE JOB IS DONE
-- ===========================================================================
--
-- public.backfill_outbound_project_ids() reads i.client_name and i.project_name
-- to match a historical row to a project. Both columns are dropped four lines
-- below, so the function could never run again. It has no caller in the
-- application: nothing under lib/, app/ or components/ names it, and 0017 called
-- it once, itself, at apply time.
--
-- It removes a rule about rows and no row.

drop function if exists public.backfill_outbound_project_ids();


-- ===========================================================================
-- 4. THE COLUMNS
-- ===========================================================================
--
-- Both are NOT NULL today, so nothing that reads them can be getting a null and
-- silently coping. Every reader was changed in the same pull request to take the
-- client and the project from the joined records instead.

alter table public.outbound_issues
  drop column client_name,
  drop column project_name;


commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: no client_name, no project_name, and project_id present and NOT NULL.

select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'outbound_issues'
  and column_name in ('client_name', 'project_name', 'project_id')
order by column_name;
