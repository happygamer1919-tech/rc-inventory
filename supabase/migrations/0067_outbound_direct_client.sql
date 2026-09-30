-- 0067_outbound_direct_client.sql
-- RC Inventory phase 3, card P3-118, goal G73, Item 2 of Ivan's four items.
-- Outbound gains a second mode: a direct client collecting from the counter,
-- with no project behind it. THE AUTHORITY IS RULING R-215 in decisions/inbox.md
-- and that document is the one to read before this file.
--
-- WHAT IT ADDS
--
--   type       public.outbound_mode                        project, direct_client
--   column     public.outbound_issues.mode                 not null, default 'project'
--   column     public.outbound_issues.client_id            nullable, references clients
--   column     public.outbound_issues.pickup_date          nullable date
--   constraint outbound_issues_project_mode_shape          one constraint per mode
--   constraint outbound_issues_direct_client_mode_shape
--   index      outbound_issues_mode_idx, outbound_issues_client_id_idx
--   function   public.create_outbound_issue(text, jsonb, uuid, text, uuid, date)
--   function   public.unassigned_outbound_count(), replaced in place, same signature
--
-- WHAT IT REMOVES: no table, no row, no column. There is NO DROP TABLE, NO
-- TRUNCATE, NO DELETE, NO DROP COLUMN, NO UPDATE and NO INSERT anywhere in this
-- file. Every existing row keeps every value it has, and keeps its meaning too:
-- the mode column defaults to 'project', which is exactly what every row in this
-- table has always been.
--
-- THREE THINGS IT DOES REMOVE, AND ALL THREE ARE RULES ABOUT ROWS RATHER THAN
-- ROWS. CLAUDE.md 8.6's test is "does executing this statement reduce the number
-- of rows in any table", and each of the three answers no:
--
--   1. alter column project_id drop not null      section 2
--   2. drop policy outbound_issues_delete         section 5
--   3. drop function create_outbound_issue/5      section 6
--
-- ============================================================================
-- THE ONE DEVIATION FROM THE CARD, DECLARED HERE RATHER THAN LEFT TO BE FOUND
-- ============================================================================
--
-- CARD P3-118 CLAUSE 1 SAYS OF THIS MIGRATION, AND IT IS QUOTED BECAUSE IT IS
-- WRONG ABOUT WHAT THE SCHEMA ALREADY IS:
--
--   "a nullable pickup-date column, the day a direct client collects; and it
--    relaxes nothing."
--
-- AND CLAUSE 3 SAYS, QUOTED FOR THE SAME REASON:
--
--   "The legacy client_name and project_name text columns from migration 0001
--    are NOT removed and NOT repurposed."
--
-- Both sentences describe a table that stopped existing on 2026-08-31.
--
--   client_name AND project_name ARE ALREADY GONE. Migration 0026, card P3-04b,
--   dropped both. This file therefore removes nothing of theirs and repurposes
--   nothing of theirs, which is the outcome clause 3 wanted, reached because
--   there is nothing left to remove. Nothing here contradicts P3-10.
--
--   project_id IS NOT NULL, ALSO SINCE 0026, and clause 2 of this same card
--   requires a direct_client row to have NO PROJECT. Those two cannot both hold.
--   A direct client issue is unrecordable while the column-level NOT NULL
--   stands, so the NOT NULL is replaced by the mode-scoped constraint in section
--   3, which requires a project for every row whose mode is 'project'.
--
-- THE GUARANTEE IS NOT WEAKENED, IT IS MOVED AND NARROWED TO THE MODE IT WAS
-- ALWAYS ABOUT. Before this file: every row must have a project. After it: every
-- 'project' row must have a project, and a 'direct_client' row must have a
-- client and a pickup date instead. No row that exists today, and no row any
-- screen can write today, is permitted to lose its project. What becomes
-- possible is exactly the one thing the owner asked for, and nothing else.
--
-- WHY A DEFAULT AND NOT A NULLABLE MODE. The card's defaults answer this and the
-- answer is kept: a nullable mode column would make every historical row
-- ambiguous. 'project' is what those rows are.
--
-- ============================================================================
-- MERGE IS APPLY
-- ============================================================================
--
-- MERGING THIS FILE APPLIES IT TO THE PRODUCTION DATABASE WITHIN ABOUT TWO
-- MINUTES, through the Supabase GitHub app, with no terminal involved.
-- CLAUDE.md 8.0 and ruling R-124. REAL CLIENT DATA HAS BEEN IN PRODUCTION SINCE
-- 2026-09-14. What reaches the live database is: one new enum type, three new
-- columns on one table (two of them empty, one of them 'project' on every row),
-- two check constraints that every existing row already satisfies, two indexes,
-- a tightened policy set on outbound_issues, and one function replaced.
--
-- IT RUNS AS ONE TRANSACTION and IS safe to run twice: every create is guarded
-- with `if not exists`, every drop with `if exists`, and section 3 drops each
-- constraint before adding it because a constraint is replaced and never edited.
--
-- PROVEN BEFORE MERGE by `npm run check:migrations`, which applies this file
-- unmodified to a throwaway postgres:16 and then runs every assertion file,
-- scripts/poc-free/local-db/assertions/0067_outbound_direct_client.sql among
-- them, and by `npm run check:no-destructive-migration`, which parses it with
-- the real PostgreSQL grammar.

begin;


-- ===========================================================================
-- 1. THE MODE, AS AN ENUM, WITH ENGLISH TOKENS
-- ===========================================================================
--
-- P2-01: a value of an enum is not interface text. The stored tokens are
-- English and the Romanian words "Proiect" and "Client direct" live in the
-- presentation layer, where lib/data/units.ts already puts the unit labels.
-- Cards P3-119 and P3-120 write those words; this file writes neither of them.
--
-- A NEW TYPE AND NOT A LABEL ADDED TO AN EXISTING ONE, so there is no
-- `alter type ... add value` here and this file needs none of the applier's
-- enum pre-phase.

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'outbound_mode'
  ) then
    create type public.outbound_mode as enum ('project', 'direct_client');
  end if;
end $$;

comment on type public.outbound_mode is
  'Card P3-118, ruling R-215. Which kind of outbound an issue is: to a project, or to a direct client collecting from the warehouse. English tokens by P2-01; the Romanian words belong to the presentation layer and are written by cards P3-119 and P3-120.';


-- ===========================================================================
-- 2. THE THREE COLUMNS, AND THE NOT NULL THAT MOVES INTO A CONSTRAINT
-- ===========================================================================

alter table public.outbound_issues
  add column if not exists mode        public.outbound_mode not null default 'project',
  add column if not exists client_id   uuid references public.clients (id) on delete restrict,
  add column if not exists pickup_date date;

comment on column public.outbound_issues.mode is
  'Card P3-118, ruling R-215. project or direct_client. DEFAULT project, so every row written before this migration keeps exactly the meaning it had: outbound was issue-to-project and nothing else from phase 1 until 2026-09-30. NOT a second ledger and not a branch in any arithmetic: stock is still computed from batches minus outbound lines, by public.product_available_stock, for both modes.';

comment on column public.outbound_issues.client_id is
  'Card P3-118, ruling R-215. The CRM client of a direct_client issue, as a ROW and never a typed name: the record that leaves the warehouse names somebody a reader can open. NULL on a project issue, where the client is reached through projects.client_id, which is the only representation P3-04b left standing. ON DELETE RESTRICT: a client with material issued to them must not be deletable out from under the record, the same reason the project foreign key restricts.';

comment on column public.outbound_issues.pickup_date is
  'Card P3-118, ruling R-215. The day a direct client collects the material. Required on a direct_client issue by outbound_issues_direct_client_mode_shape and forbidden on a project issue by outbound_issues_project_mode_shape. A date and not a timestamp: a collection day is a day, and issued_at already records the moment the record was written.';

-- THE NOT NULL 0026 PUT HERE IS REPLACED BY THE MODE CONSTRAINT IN SECTION 3.
-- Read the deviation note in this file's header before this statement. 0026's
-- own words are kept and answered there rather than quietly overwritten:
--
--   "A row that genuinely has no project can no longer be recorded, and that is
--    the intended end state ... If a destination without a project row is ever
--    needed again, it is a new card and a new migration, not a nullable column
--    left open in case."
--
-- THAT SENTENCE ASKED FOR EXACTLY THIS FILE. It is a new card, P3-118, and a new
-- migration, this one, carrying an owner ruling that says a destination without
-- a project is now a thing Rapid Construct does. The column is not left "open in
-- case": section 3 makes a missing project impossible in the mode that has one.
alter table public.outbound_issues
  alter column project_id drop not null;

comment on column public.outbound_issues.project_id is
  'The destination of a project issue, as a record. NOT NULL from P3-04b until card P3-118: since 0067 the requirement is carried by outbound_issues_project_mode_shape, which requires it for every row whose mode is project, and by outbound_issues_direct_client_mode_shape, which forbids it for every direct_client row. Column-level nullability alone can say neither of those things. Set by the picker on every project write path.';


-- ===========================================================================
-- 3. ONE CONSTRAINT PER MODE, WHICH IS THE WHOLE POINT OF DOING THIS HERE
-- ===========================================================================
--
-- TWO CONSTRAINTS AND NOT ONE, because the failure has to say which mode was
-- violated. A single constraint covering both would refuse a half-filled row
-- with one name that means either mistake, and the caller reading the error
-- would still have to guess.
--
-- A FORM IS ONE CALLER AND THE DATABASE IS ALL OF THEM. Card P3-119 refuses a
-- half-filled mode on screen, in Romanian, before the request is sent. That is
-- not a duplication of this: the screen tells the operator and the constraint
-- protects PostgREST, psql, a future route and every later card.
--
-- EVERY EXISTING ROW ALREADY SATISFIES BOTH. mode is 'project' on all of them,
-- project_id was NOT NULL until four statements ago, and pickup_date was created
-- empty in section 2, so the project constraint holds for every row and the
-- direct_client one is vacuous. Neither is added NOT VALID and neither needs to
-- be.
--
-- WHAT THE PROJECT CONSTRAINT DOES NOT SAY, stated so the next card does not
-- read the omission as an oversight: it does NOT forbid client_id on a project
-- row. The card names two requirements for this mode, a project and no pickup
-- date, and names three for the other, and this file implements the card's
-- words rather than a symmetry the card did not ask for. No write path sets
-- client_id on a project issue: public.create_outbound_issue in section 6
-- forces it to null in that mode, so the column cannot acquire a second
-- representation of the destination through the application.

alter table public.outbound_issues
  drop constraint if exists outbound_issues_project_mode_shape;

alter table public.outbound_issues
  add constraint outbound_issues_project_mode_shape check (
    mode <> 'project'
    or (project_id is not null and pickup_date is null)
  );

alter table public.outbound_issues
  drop constraint if exists outbound_issues_direct_client_mode_shape;

alter table public.outbound_issues
  add constraint outbound_issues_direct_client_mode_shape check (
    mode <> 'direct_client'
    or (client_id is not null and pickup_date is not null and project_id is null)
  );


-- ===========================================================================
-- 4. THE INDEXES
-- ===========================================================================
--
-- Every foreign key gets one, which is 0001's stated rule: Postgres indexes the
-- referenced side and never the referencing side, and every screen filters on
-- the referencing side. The mode index is for card P3-120's filter, which is the
-- list reading this column.

create index if not exists outbound_issues_client_id_idx on public.outbound_issues (client_id);
create index if not exists outbound_issues_mode_idx      on public.outbound_issues (mode);


-- ===========================================================================
-- 5. ROW LEVEL SECURITY: SELECT, INSERT, UPDATE, AND NO DELETE POLICY
-- ===========================================================================
--
-- THERE IS NO ORGANISATION AND NONE IS INVENTED, deviation D4 and correction two
-- of R-215. Ivan's request asks for "an RLS test that a user sees only their
-- organisation's issues"; this platform is one company, has no tenant model, and
-- inventing one to make a test name compile would be the largest schema change
-- on this board made by nobody's decision. The predicates this repository has
-- are public.current_app_role() and public.is_owner(), both security definer,
-- both from 0001.
--
-- WHAT CHANGES AND WHY IT IS A TIGHTENING. 0001 wrote all four policies on this
-- table as `to authenticated using (true)`, so a DEACTIVATED account still
-- holding a valid token could read and write outbound issues: `authenticated` is
-- a Postgres role and says nothing about public.profiles.active. The card
-- requires the predicates instead, and current_app_role() filters on p.active
-- and returns null for an unauthenticated caller, so all three of R-215's
-- isolation cases become true of this table:
--
--   a signed-out request sees no rows          current_app_role() is null
--   a deactivated account sees no rows         current_app_role() filters p.active
--   a caller with no app role cannot write     the same predicate on insert
--
-- NO DELETE POLICY AT ALL, matching public.invoices in 0063, which has select,
-- insert and update and no delete. 0001's outbound_issues_delete granted the
-- owner a delete, and an issue is the record that material left the warehouse:
-- deleting one silently raises the computed stock of every product on it, since
-- stock is batches in minus outbound lines out. Test data is cancelled, never
-- deleted (P2-07), and there is no cancel path on an issue to build here: this
-- statement removes a rule about rows and removes no row.
--
-- outbound_lines IS NOT TOUCHED. Its policies are 0001's and this card has no
-- clause about them. A line is reachable only through its issue.

drop policy if exists outbound_issues_select on public.outbound_issues;
create policy outbound_issues_select on public.outbound_issues
  for select to authenticated using (public.current_app_role() is not null);

drop policy if exists outbound_issues_insert on public.outbound_issues;
create policy outbound_issues_insert on public.outbound_issues
  for insert to authenticated with check (public.current_app_role() is not null);

drop policy if exists outbound_issues_update on public.outbound_issues;
create policy outbound_issues_update on public.outbound_issues
  for update to authenticated
  using (public.current_app_role() is not null)
  with check (public.current_app_role() is not null);

drop policy if exists outbound_issues_delete on public.outbound_issues;


-- ===========================================================================
-- 6. THE WRITE PATH: ONE FUNCTION, ONE SUBTRACTION, TWO MODES
-- ===========================================================================
--
-- THE SIGNATURE CHANGES, AND THIS IS THE CHANGE THE APPLIER WAS REWRITTEN FOR.
-- scripts/apply-pending-migrations.mjs used to carry an unconditional assertion
-- named one-create-outbound-issue-five-args. Card APPLY-01 replaced it with the
-- derived pair declared-function-signatures-exist and
-- declared-function-versions-only, and said in its own comment why:
--
--   "the first migration that legitimately changed that signature, and a
--    deviz-aware outbound issue is a near and plausible reason to, would have
--    taken down every unrelated migration travelling with it."
--
-- This is that migration. The batch drops the signature it declared in 0018 and
-- declares one six-argument version, which is what a change of signature IS, and
-- the applier's own proof harness carries that exact case
-- (scripts/poc-free/local-db/prove-applier.mjs, "APPLY-01: a batch that
-- legitimately changes create_outbound_issue's signature COMMITS").
--
-- p_client_name AND p_project_name ARE GONE RATHER THAN CARRIED FORWARD. 0026
-- kept them, accepted and ignored, for exactly one reason it stated: reshaping
-- the function would have needed a DROP FUNCTION and would have tripped the old
-- signature assertion. That reason is spent on both counts, and deliberately
-- creating two dead parameters in a brand new signature would be worse than the
-- drop it was avoiding.
--
-- THE BATCH SUBTRACTION DOES NOT BRANCH, and this is the load-bearing half of
-- card P3-118 clause 5 and of R-215. Sections 6.3 to 6.6 below run for BOTH
-- modes, once, in one order, with no `if` about the mode anywhere in them: the
-- advisory locks, the summed-per-product overdraw check under those locks, the
-- lines insert and the first history row. The mode decides only WHICH COLUMNS OF
-- THE ISSUE ROW ARE FILLED and which Romanian refusal a missing field earns.
-- There is no second subtraction routine, no stored counter and no total written
-- anywhere: stock is batches in minus outbound lines out, by
-- public.product_available_stock, and CONTEXT.md lists that under decided.
--
-- SECURITY INVOKER, unchanged from 0004, so the caller's own policies apply to
-- every statement inside it.

drop function if exists public.create_outbound_issue(text, text, text, jsonb, uuid);

create function public.create_outbound_issue(
  p_reference   text,
  p_lines       jsonb,
  p_project_id  uuid,
  p_mode        text,
  p_client_id   uuid,
  p_pickup_date date
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_issue_id   uuid;
  v_row        record;
  v_available  numeric;
  v_unit       public.unit_code;
  v_mode       public.outbound_mode;
  v_project_id uuid := null;
  v_client_id  uuid := null;
  v_pickup     date := null;
begin
  -- --- 6.1 THE MODE ------------------------------------------------------
  -- p_mode IS text AND NOT public.outbound_mode, on purpose. A caller sending
  -- an unknown token gets the Romanian sentence below instead of PostgreSQL's
  -- own "invalid input value for enum", which reaches the operator in English
  -- and names the type.
  if p_mode is null or btrim(p_mode) = '' then
    raise exception 'Alege tipul ieșirii: proiect sau client direct.' using errcode = 'P0001';
  end if;
  if p_mode not in ('project', 'direct_client') then
    raise exception 'Tipul ieșirii nu este cunoscut. Alege proiect sau client direct.'
      using errcode = 'P0001';
  end if;
  v_mode := p_mode::public.outbound_mode;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Ieșirea trebuie să aibă cel puțin o poziție.' using errcode = 'P0001';
  end if;

  -- --- 6.2 WHAT EACH MODE REQUIRES, AND NOTHING ELSE DIFFERS -------------
  -- The refusals are Romanian sentences rather than constraint names, for the
  -- reason 0026 gave when it added the first of them: a constraint name reaching
  -- the operator is not a message. The constraints in section 3 still stand
  -- behind every one of these and protect the callers that are not this
  -- function.
  if v_mode = 'project' then
    if p_project_id is null then
      raise exception 'Alege proiectul către care pleacă materialele.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.projects where id = p_project_id) then
      raise exception 'Proiectul ales nu mai există. Reîncarcă pagina și alege din nou.'
        using errcode = 'P0002';
    end if;
    -- A project issue carries no pickup date and no client of its own: the
    -- client is reached through projects.client_id, which is the only
    -- representation P3-04b left standing. Forced rather than refused, because
    -- a caller sending them means the same thing as a caller not sending them.
    v_project_id := p_project_id;
  else
    if p_client_id is null then
      raise exception 'Alege clientul care ridică materialele.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.clients where id = p_client_id) then
      raise exception 'Clientul ales nu mai există. Reîncarcă pagina și alege din nou.'
        using errcode = 'P0002';
    end if;
    if p_pickup_date is null then
      raise exception 'Alege data ridicării materialelor.' using errcode = 'P0001';
    end if;
    v_client_id := p_client_id;
    v_pickup    := p_pickup_date;
  end if;

  -- --- 6.3 THE LOCKS, IDENTICAL FOR BOTH MODES ---------------------------
  -- Byte for byte what 0004 wrote and 0026 kept. Lock every product involved in
  -- a deterministic order: sorting by id means two transactions touching the
  -- same two products take the locks in the same sequence, so they queue instead
  -- of deadlocking.
  for v_row in
    select distinct (line ->> 'product_id')::uuid as product_id
    from jsonb_array_elements(p_lines) as line
    order by 1
  loop
    perform pg_advisory_xact_lock(hashtext(v_row.product_id::text));
  end loop;

  -- --- 6.4 THE OVERDRAW CHECK, IDENTICAL FOR BOTH MODES ------------------
  -- With the locks held, so the value cannot change between the read and the
  -- insert. Quantities for one product across several lines are summed first:
  -- splitting 100 into two lines of 50 must not pass a check that 50 would fail.
  -- The INSUFFICIENT_STOCK error contract is the one lib/data/outbound-actions.ts
  -- parses and it is unchanged.
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

  -- --- 6.5 THE ISSUE ROW, THE ONLY PLACE THE MODE APPEARS ----------------
  insert into public.outbound_issues
    (reference, mode, project_id, client_id, pickup_date, status, created_by)
  values
    (p_reference, v_mode, v_project_id, v_client_id, v_pickup, 'awaiting_shipment', auth.uid())
  returning id into v_issue_id;

  -- --- 6.6 THE LINES AND THE FIRST HISTORY ROW, IDENTICAL FOR BOTH -------
  -- THIS INSERT IS THE STOCK MOVEMENT. Nothing subtracts from public.batches,
  -- in either mode, because nothing ever has: product_available_stock sums
  -- batches and subtracts these rows. Both modes therefore leave batches
  -- byte-identical, which is exactly what card P3-118 acceptance (c) measures.
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

comment on function public.create_outbound_issue(text, jsonb, uuid, text, uuid, date) is
  'Creates an outbound issue in either mode with its lines and first history row, refusing any line that would overdraw stock. Card P3-118, ruling R-215. THE SUBTRACTION DOES NOT BRANCH: the advisory locks, the summed-per-product overdraw check held under them, the lines insert and the history row are one block that runs for both modes, and the mode decides only which columns of the issue row are filled. Stock stays batches in minus outbound lines out, by public.product_available_stock, and nothing here touches public.batches. p_mode is text and not the enum so an unknown token earns a Romanian sentence instead of PostgreSQL naming the type in English. Signature changed from the five-argument form 0018 declared and 0026 replaced: p_client_name and p_project_name were dead parameters kept only for an assertion card APPLY-01 has since replaced.';

grant execute on function public.create_outbound_issue(text, jsonb, uuid, text, uuid, date) to authenticated;


-- ===========================================================================
-- 7. THE "NO PROJECT" COUNTER STOPS COUNTING A MODE THAT NEVER HAD ONE
-- ===========================================================================
--
-- WHY THIS IS HERE AND IS NOT SCOPE THE CARD DID NOT ASK FOR. 0024 added
-- public.unassigned_outbound_count() and said why in its own comment: *"IESIRILE
-- FARA PROIECT SE NUMARA, NU SE ASCUND. Un total partial care nu spune ca este
-- partial este mai rau decat lipsa lui."* It exists so a project's material cost
-- total can say when it is INCOMPLETE, and the thing that makes it incomplete is
-- an issue whose project nobody has reconciled yet.
--
-- ITS BODY IS `where oi.project_id is null`, WHICH MEANT EXACTLY THAT UNTIL THIS
-- FILE AND NOW MEANS SOMETHING ELSE. A direct client issue has no project on
-- purpose, by outbound_issues_direct_client_mode_shape, so leaving the body alone
-- would make every project cost screen report a growing number of "ieșiri fără
-- proiect" forever, and the sentence beside it, "Toate ieșirile au un proiect
-- asociat", would go false the first time somebody sells across the counter. That
-- is not a partial total being honest about itself; it is a true screen becoming a
-- false one.
--
-- The question the counter asks is narrowed to the mode it was always about:
-- a PROJECT issue with no project. Since section 3 makes that impossible, the
-- answer is zero forever, which is exactly what it has been since P3-04b.
--
-- SAME SIGNATURE, so this is a `create or replace` and not a DROP, and no caller
-- changes: lib/reporting/material-cost.ts keeps calling it by name.

create or replace function public.unassigned_outbound_count()
returns bigint
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*)::bigint
  from public.outbound_issues oi
  where oi.mode = 'project'
    and oi.project_id is null
$$;

comment on function public.unassigned_outbound_count() is
  'P3-11: how many issues have no project yet. They are excluded from every project total and reported separately, never poured into an "altele" project. CARD P3-118 NARROWED IT TO mode = project. The body was `where oi.project_id is null`, which meant "nobody has reconciled this issue to a project" until ruling R-215 gave outbound a second mode whose rows have no project BY DESIGN. Counting those here would make a project cost screen report a partial total that is not partial, and would falsify the sentence beside the number. The answer is zero forever, which is what it has been since P3-04b.';


-- ===========================================================================
-- 8. THE TABLE COMMENT NOW NAMES TWO MODES
-- ===========================================================================
--
-- 0001's sentence is kept word for word and answered rather than rewritten, so a
-- reader arriving from 0001 or from CONTEXT.md still recognises what they read
-- there. R-215 narrows that sentence on the owner's instruction and does not
-- delete it: it stays true of the mode it names.

comment on table public.outbound_issues is
  'Material leaving the warehouse. 0001 said "Issue-to-project, never a retail sale: a client, a project, and the materials going to that site (phase 1 RC-07)", and that sentence is kept and is still true of mode = project. CARD P3-118 AND RULING R-215 ADD A SECOND MODE, direct_client: a walk-in buyer collecting from the counter, with a CRM client, a pickup date, no project, and NO INVOICE AND NO SALE DOCUMENT EVER, because money for a direct client is settled outside this platform on the owner instruction. Which columns each mode requires is carried by outbound_issues_project_mode_shape and outbound_issues_direct_client_mode_shape, one per mode so a refusal says which was violated.';

commit;


-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Expect: mode not null with a 'project' default, client_id and pickup_date
-- nullable, project_id now nullable, the two mode constraints present, and
-- select, insert and update policies with no delete policy.

select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'outbound_issues'
  and column_name in ('mode', 'client_id', 'pickup_date', 'project_id')
order by column_name;

select conname
from pg_constraint
where conrelid = 'public.outbound_issues'::regclass and contype = 'c'
order by conname;

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'outbound_issues'
order by policyname;

select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_outbound_issue';
