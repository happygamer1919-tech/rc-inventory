-- 0017_outbound_project_id.sql
-- RC Inventory phase 3, card P3-04. outbound_issues gains project_id, and the
-- free-text destination is backfilled into it.
--
-- THE RULE ON THIS CARD IS THE CARD: NEVER A BACKFILL AND A DROP IN ONE
-- MIGRATION. public.outbound_issues.client_name and project_name survive this
-- file untouched. The drop is P3-04b, its own card and its own migration, and
-- it is gated behind this backfill being verified against real rows. A backfill
-- and a drop together mean an incorrect match is unrecoverable the moment it is
-- applied, because the evidence it was matched against is gone in the same
-- statement.
--
-- THE COLUMN IS NULLABLE AND STAYS NULLABLE IN THIS CARD. A NOT NULL added in
-- the same migration as the backfill fails the apply on the first unmatched
-- row, and that row is exactly the one a human needs to look at.
--
-- IT RUNS AS ONE TRANSACTION.
--
-- PROVEN BEFORE IT WAS MERGED by `npm run check:migrations`, which applies it
-- unmodified to a throwaway postgres:16 and then runs
-- scripts/poc-free/local-db/assertions/0017_outbound_project_id.sql, whose
-- fixture exercises every branch of the matching rule below.
--
-- NOT APPLIED TO PRODUCTION BY THIS PULL REQUEST. The apply is card P3-27, and
-- the reconciliation count P3-04 asks for is part of that card, because it is a
-- statement about real rows and there are none here.

begin;


-- ===========================================================================
-- 1. THE FOLD, AS A FUNCTION
-- ===========================================================================
--
-- The matching rule needs the same normalisation the interface already uses for
-- search: `lib/data/format.ts` exports `normalizeText`, which NFD-decomposes and
-- strips combining marks so that "tigla" finds "Țiglă". A backfill that matched
-- differently from the search box would pair rows a human never would.
--
-- IT IS A FUNCTION AND NOT AN INLINE EXPRESSION, so the write path in 0018 and
-- any later card use the identical rule rather than a second copy of it that
-- drifts.
--
-- NO EXTENSION. `unaccent` would be the obvious tool and it is a CREATE
-- EXTENSION, which 0001 deliberately avoided: it adds a failure mode (a missing
-- extensions schema, an insufficient privilege) in exchange for a fold this
-- product only needs over five letter pairs. `translate` covers Romanian
-- exactly, including the legacy cedilla forms that older documents carry, and it
-- is IMMUTABLE so it can be indexed.
--
-- WHITESPACE IS COLLAPSED AND TRIMMED, because a destination typed as
-- "Bloc  A " and one typed as "Bloc A" are the same site, and the difference is
-- invisible on screen.

create or replace function public.fold_text(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
  select lower(
    regexp_replace(
      btrim(
        translate(
          value,
          -- a-breve, a-circumflex, i-circumflex, s-comma, t-comma, and the
          -- legacy s-cedilla and t-cedilla, in both cases.
          'ăâîșțĂÂÎȘȚşţŞŢ',
          'aaistAAISTstST'
        )
      ),
      '\s+', ' ', 'g'
    )
  )
$$;

comment on function public.fold_text(text) is
  'Case and diacritic insensitive fold with whitespace collapsed, matching lib/data/format.ts normalizeText. Used by the P3-04 backfill and by the outbound write path, so a destination matched by the interface and one matched by a migration cannot disagree. IMMUTABLE, so it can be indexed.';

grant execute on function public.fold_text(text) to authenticated, service_role;


-- ===========================================================================
-- 2. THE COLUMN
-- ===========================================================================
--
-- ON DELETE RESTRICT. An issued material line is money that left the warehouse
-- and a project deleted out from under it would orphan it. Projects are
-- deactivated, not deleted, and there is no delete policy on them anyway.

alter table public.outbound_issues
  add column project_id uuid null references public.projects (id) on delete restrict;

comment on column public.outbound_issues.project_id is
  'The destination as a record rather than as typed text. NULLABLE while the historical rows are reconciled: P3-04 backfills what it can match and leaves the rest null and listed, because a null is visible and a wrong automatic match is not. client_name and project_name are still here and are dropped by P3-04b, only after the backfill is verified against zero unmatched rows.';

-- Every foreign key gets an index on the referencing side. Every cost, deviz
-- and procurement query in wave 3 is "the issues of this project".
create index outbound_issues_project_id_idx on public.outbound_issues (project_id);


-- ===========================================================================
-- 3. THE BACKFILL
-- ===========================================================================
--
-- MATCHING RULE, FIXED BY P3-04 AND NOT WIDENED HERE: the folded, trimmed,
-- whitespace-collapsed client_name must equal a client's folded name, AND the
-- folded project_name must equal the folded name of a project BELONGING TO THAT
-- CLIENT.
--
-- NOTHING FUZZIER THAN THAT. No trigram similarity, no edit distance, no
-- "closest match". A wrong automatic match on a cost row is worse than a null,
-- because a null is visible and a wrong match is not.
--
-- IT ONLY EVER WRITES WHERE project_id IS NULL, which makes it idempotent: a
-- re-run cannot overwrite a correction somebody made by hand afterwards. That
-- matters because this file may be applied to a project where a previous
-- reconciliation pass already fixed rows.
--
-- AN AMBIGUOUS MATCH IS LEFT NULL, NOT PICKED. clients.name is deliberately not
-- unique (P3-01: two legally distinct companies can share a trading name and
-- the IDNO is what separates them), so a folded client name CAN match two
-- clients. The `= 1` guard below is what stops the backfill choosing one. Those
-- rows land in the unmatched list, where a human reads them, which is the whole
-- design of this card.
--
-- IT CREATES NOTHING. No client row, no project row. Reconciling the leftovers
-- is Ivan and Mihai reading a list, not a terminal deciding.
--
-- IT IS A FUNCTION AND NOT A BARE STATEMENT, FOR TWO REASONS AND THE SECOND
-- ONE IS THE IMPORTANT ONE. First, the reconciliation pass on P3-27 will want
-- to re-run it after a human adds the missing clients and projects, and a
-- statement buried in an applied migration cannot be re-run. Second, a TEST
-- CAN NOW EXERCISE THE STATEMENT ITSELF. The assertion file first held a copy
-- of this UPDATE, and mutating the migration then changed nothing the test
-- could see: three mutations of the matching rule came back green, because the
-- test was proving its own copy.

create or replace function public.backfill_outbound_project_ids()
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_matched integer;
begin
  update public.outbound_issues oi
  set project_id = m.project_id
  from (
    select
      i.id as issue_id,
      -- (array_agg(...))[1] and not min(...): PostgreSQL has no min(uuid).
      -- The HAVING below guarantees exactly one row, so any picker is the same
      -- one, and the array subscript is the one that compiles.
      (array_agg(p.id))[1] as project_id,
      count(*) as match_count
    from public.outbound_issues i
    join public.clients  c on public.fold_text(c.name) = public.fold_text(i.client_name)
    join public.projects p on p.client_id = c.id
                          and public.fold_text(p.name) = public.fold_text(i.project_name)
    where i.project_id is null
    group by i.id
    having count(*) = 1
  ) m
  where oi.id = m.issue_id
    -- THIS SECOND GUARD IS REDUNDANT AND IT STAYS. The subquery already has
    -- `where i.project_id is null`, so a row somebody reconciled by hand never
    -- reaches m in the first place. Deleting this line was run as a mutation
    -- and passed, which is the answer that says the line does nothing today.
    -- It is kept because the two clauses guard different things: the inner one
    -- decides which rows are CONSIDERED, and this one decides which rows are
    -- WRITTEN. An edit to the subquery that widened the first would silently
    -- widen the second, and this line is what stops that from reaching a
    -- reconciled row.
    and oi.project_id is null;

  get diagnostics v_matched = row_count;
  return v_matched;
end;
$fn$;

comment on function public.backfill_outbound_project_ids() is
  'The P3-04 backfill, as a callable function rather than a one-time statement. Returns the number of rows it matched. IDEMPOTENT: it only ever writes where project_id is null, so re-running it during reconciliation cannot overwrite a correction made by hand. It is a function for two reasons: the reconciliation pass will want to re-run it after clients and projects are added by hand, and a test can then exercise THE STATEMENT ITSELF rather than a copy of it that drifts.';

grant execute on function public.backfill_outbound_project_ids() to authenticated, service_role;

-- Run it once, here, which is what the migration is for.
select public.backfill_outbound_project_ids();


commit;


-- ===========================================================================
-- VERIFICATION AND RECONCILIATION
-- ===========================================================================
-- Runs after COMMIT. THE THREE NUMBERS AND THE UNMATCHED LIST ARE THE
-- DELIVERABLE of card P3-04 and they go into the P3-27 apply journal verbatim.
-- There are no rows to reconcile here; there are on the client's project, and
-- that is the whole reason the reconciliation belongs to the apply.

-- 1. The column, its nullability, its foreign key, its index, and the two text
--    columns STILL BEING PRESENT.
select
  a.attname,
  format_type(a.atttypid, a.atttypmod) as type,
  a.attnotnull as not_null
from pg_attribute a
where a.attrelid = 'public.outbound_issues'::regclass
  and a.attname in ('project_id', 'client_name', 'project_name')
  and a.attnum > 0
order by a.attname;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.outbound_issues'::regclass and contype = 'f'
order by conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'outbound_issues'
  and indexname = 'outbound_issues_project_id_idx';

-- 2. THE THREE NUMBERS.
select
  count(*)                                    as total_issues,
  count(*) filter (where project_id is not null) as with_project,
  count(*) filter (where project_id is null)     as still_null
from public.outbound_issues;

-- 3. THE UNMATCHED LIST, IN FULL. Every row a human has to read, with what was
--    typed, so the reconciliation is a list somebody works through rather than
--    a number somebody worries about.
select
  reference,
  client_name,
  project_name,
  issued_at
from public.outbound_issues
where project_id is null
order by issued_at, reference;
