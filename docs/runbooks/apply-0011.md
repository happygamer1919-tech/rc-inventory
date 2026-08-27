# Runbook: the two migration ledger rows for 0010 and 0011

**Status: NOT VALIDATED BY THIS TERMINAL.** The statements below were authored
and never executed, because the command that runs them was refused twice by the
sandbox this session ran under. Everything else about 0011 is done: the
migration is applied and journalled in full at `docs/migrations/APPLY-LOG.md`.

## What is missing, and what it is not

`supabase_migrations.schema_migrations` is Supabase's own record of which
migrations have been applied. It is **bookkeeping, not schema.** The database is
correct: 0010 and 0011 have both run, every column, constraint, function and
grant they describe is in place, and the phase 3 post-check in the apply log
proves it.

What is wrong is that the ledger's newest row is `0009`. **The 0010 apply ran
its SQL and never wrote its journal row**, and 0011's did not either. So
anything that reads that ledger to decide what is pending - `supabase db push`,
a future CLI-driven apply, a human answering "what is applied?" - would conclude
that 0010 and 0011 are still to come and try to run them again. Re-running 0010
fails on `column already exists`, which is noisy rather than dangerous, but the
disagreement is exactly the class of thing ruling R-013 created the apply log to
end.

## The connection

Derived at runtime per CLAUDE.md 8.4, never stored:

- project ref: extracted from `NEXT_PUBLIC_SUPABASE_URL`
- host: `aws-1-eu-west-1.pooler.supabase.com` (the session pooler; `aws-0`
  resolves and rejects the tenant, which is recorded in the 0001 journal and in
  `docs/LEARNINGS.md`)
- port: `5432`, the session pooler. `6543` is the transaction pooler and cannot
  hold a multi-statement transaction
- user: `postgres.<ref>`
- password: `SUPABASE_DB_PASSWORD`, passed as `PGPASSWORD` and never inside a
  connection string, because a connection string appears in error messages and a
  `PG*` variable does not

## The statements

Both are `on conflict (version) do nothing`, so running this twice is not an
error, and running it after somebody else has already done it is not an error
either.

```sql
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0010', 'confirm_extraction_draft',
        array[$mig$<the full text of supabase/migrations/0010_confirm_extraction_draft.sql>$mig$])
on conflict (version) do nothing
returning version;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0011', 'extraction_confirm_corrections',
        array[$mig$<the full text of supabase/migrations/0011_extraction_confirm_corrections.sql>$mig$])
on conflict (version) do nothing
returning version;
```

The `statements` column is a `text[]`. The Supabase CLI splits a migration into
one array element per statement; a single element holding the whole file is
honest about what ran and is what the 0007 apply did. Dollar quoting with
`$mig$` is used because the files contain single quotes and dollar-quoted
function bodies of their own, and neither file contains the token `$mig$`.

## Verification

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

Expect eleven rows, `0001` through `0011`, with `0010` and `0011` present.

## What NOT to do

Do not re-run `0010` or `0011` themselves. They are applied. This runbook writes
two rows into a bookkeeping table and touches nothing else.
