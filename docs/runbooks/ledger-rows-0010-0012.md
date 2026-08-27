# Runbook: the three schema_migrations ledger rows, 0010, 0011 and 0012

**Status: NOT VALIDATED BY ANY TERMINAL.** Nothing below has been executed. The
statements were generated from the migration files and parsed with the real
PostgreSQL grammar, and no terminal has run them against a database, because
every attempt to open a connection is refused by the sandbox this repo's
sessions run under. The refusal is quoted verbatim at the end of this file.

Card: **P2-19**. Supersedes `docs/runbooks/apply-0011.md`, which covered 0010
and 0011 only and predates migration 0012.

## What is missing, and what it is not

`supabase_migrations.schema_migrations` is Supabase's own record of which
migrations have been applied. It is **bookkeeping, not schema.**

**The database is correct.** 0010, 0011 and 0012 have all run. Every column,
constraint, function, policy and grant they describe is in place, and each one
carries a three-phase journal in `docs/migrations/APPLY-LOG.md` with its own
post-check output.

**The ledger is wrong.** Its newest row is `0009`. Three applies ran their SQL
and none of them wrote its journal row.

**What that costs.** Anything that reads the ledger to decide what is pending
concludes that 0010, 0011 and 0012 are still to come and tries to run them
again: `supabase db push`, a future CLI-driven apply, or a person answering the
question "what is applied?". Re-running 0010 fails on `column already exists`,
which is noisy rather than dangerous. The danger is the disagreement itself: a
session that cannot read what is applied has to guess, and ruling R-013 created
the apply log precisely to end guessing.

## The file to run

**`scripts/ledger-rows-0010-0012.sql`**, generated, committed, and checked on
every push.

It is generated rather than hand-written because the `statements` column holds
each migration's own text, and three files pasted into a SQL document by hand is
how a ledger row ends up describing something other than what ran. The generator
is `scripts/poc-free/build-ledger-rows.mjs`; `npm run check:ledger-rows`
regenerates it in memory, diffs it against the committed file, and parses the
committed file. CI fails if they ever disagree.

## What the file contains, proved rather than asserted

```
$ npm run check:ledger-rows

CHECK 1 generated: OK, scripts/ledger-rows-0010-0012.sql matches the three migration files it is generated from.
CHECK 2 parse: OK, 8 statements, PostgreSQL grammar 180004
CHECK 3 statement kinds: OK, only TransactionStmt, SelectStmt, InsertStmt
CHECK 4 insert count: OK, 3
CHECK 5 insert targets: OK, all 3 into supabase_migrations.schema_migrations
CHECK 6 transaction: OK, one BEGIN and no COMMIT, so the owner decides
PASS  scripts/ledger-rows-0010-0012.sql
exit 0
```

**Check 3 is the one that matters here.** The file embeds three migrations as
string literals, and those migrations contain the words `DROP`, `DELETE` and
`ALTER` inside their own text. Grepping the file for `DELETE` finds hits. The
grammar is the only thing that can tell the difference between a statement and
the seven letters sitting inside a quoted string, and it reports that the entire
file is one transaction opener, four selects and three inserts. **No statement in
it removes a row from anything**, so CLAUDE.md 8.6 does not stop it.

**Checks 3 and 6 were each proved to fail on a mutated copy** before this
runbook was written: appending a real `delete from public.products` and a
`commit;` to the generated file makes check 3 report `DeleteStmt` outside the
allowed set and check 6 report `["TRANS_STMT_BEGIN","TRANS_STMT_COMMIT"]`, exit
1. A check that has never failed is a check nobody has tested.

## The three phases, and where they are

All three are inside the one file, in order:

1. **Pre-check.** `select version, name from supabase_migrations.schema_migrations
   order by version`, plus a count. This is what tells you the ledger is at 0009
   before anything is written. If 0010, 0011 and 0012 are already listed,
   somebody has run this: send `ROLLBACK;` and stop.
2. **Apply.** Three inserts, inside the transaction the file opens, each
   `on conflict (version) do nothing ... returning version, name`. Running it
   twice is not an error, and running it after somebody else has is not an
   error either.
3. **Post-check.** The same select and count, still inside the open
   transaction, so the result is visible before the decision to keep it.

**The file opens the transaction and never closes it.** Read the post-check,
then send `COMMIT;` or `ROLLBACK;` yourself. A file that commits on your behalf
is a file you cannot change your mind about.

## Expected output

**Pre-check, expected:** nine rows, `0001` through `0009`, and
`ledger_rows_before = 9`.

If the count is already 12, stop and `ROLLBACK;`. If it is something other than
9 or 12, stop and `ROLLBACK;` as well, and say what it was: the ledger holding a
number nobody predicted is a different problem from the one this runbook fixes.

**Apply, expected:** three `returning` rows.

```
 version |             name
---------+-------------------------------
 0010    | confirm_extraction_draft
 0011    | extraction_confirm_corrections
 0012    | manager_flagged_products
```

Fewer than three rows returned means `on conflict do nothing` swallowed one,
which means that version was already present. That is safe, and it is still
worth reporting.

**Post-check, expected:** twelve rows, `0001` through `0012`, and
`ledger_rows_after = 12`.

**A mismatch anywhere is a `ROLLBACK;`,** not a judgement call. Nothing in the
schema depends on this file succeeding today.

## One assumption this runbook cannot check, stated rather than buried

**The `version` format.** The rows are written as `'0010'`, `'0011'` and
`'0012'`, matching the four-digit convention this repo names its migration files
with and matching what the earlier applies recorded. The Supabase CLI's own
default is a timestamp, `20260827120000`. If the pre-check comes back showing
timestamps rather than `0001` through `0009`, **stop and `ROLLBACK;`**: the rows
would be written in a format the CLI does not read, which produces a ledger that
looks repaired and is not.

This is checkable in one second by whoever runs it and is not checkable at all
from here, which is exactly why the pre-check prints the existing rows before
the first insert rather than after.

## How to run it

Either surface works, and neither is preferred:

- **Supabase SQL editor**, as the owner role. Paste the file, read the two
  grids, then send `COMMIT;` or `ROLLBACK;` in the same session.
- **psql on the session pooler**, port 5432. The transaction pooler on 6543
  cannot hold a multi-statement transaction and must not be used.

The connection, if psql is used, is derived at runtime per CLAUDE.md 8.4 and
never stored: project ref from `NEXT_PUBLIC_SUPABASE_URL`, host
`aws-1-eu-west-1.pooler.supabase.com` (`aws-0` resolves and rejects the tenant,
recorded in the 0001 journal and in `docs/LEARNINGS.md`), port `5432`, user
`postgres.<ref>`, password `SUPABASE_DB_PASSWORD` passed as `PGPASSWORD` and
never inside a connection string, because a connection string appears in error
messages and a `PG*` variable does not.

## What NOT to do

**Do not re-run 0010, 0011 or 0012 themselves.** They are applied. This file
writes three rows into a bookkeeping table and touches nothing else.

**Do not edit `scripts/ledger-rows-0010-0012.sql` by hand.** It is generated,
and CI compares it against the migration files on every push.

## Why no terminal ran this

Every attempt to open a database connection from a session in this repo is
refused before the command executes. The refusal, verbatim, on 2026-08-27 for a
`select 1` connectivity probe:

```
Permission for this action was denied by the Claude Code auto mode classifier.
Reason: Blocked by classifier. If you have other tasks that don't depend on this
action, continue working on those. IMPORTANT: You *may* attempt to accomplish
this action using other tools that might naturally be used to accomplish this
goal, e.g. using head instead of cat. But you *should not* attempt to work around
this denial in malicious ways, e.g. do not use your ability to run tests to
execute non-test actions. You should only try to work around this restriction in
reasonable ways that do not attempt to bypass the intent behind this denial. If
you believe this capability is essential to complete the user's request, STOP and
explain to the user what you were trying to do and why you need this permission.
Let the user decide how to proceed. To allow this type of action in the future,
the user can add a Bash permission rule to their settings.
```

A second, narrower attempt was refused with the same text: a probe that ran no
SQL at all and only asked which postgres client binaries exist on the machine.
That is what settles it as a blanket refusal rather than a rule about the
statement being run, and it is why this was not attempted a third time.

**This is a sandbox refusal, not a CLAUDE.md refusal.** Section 8.2 authorises
EXECUTOR to apply migrations while the project holds zero real client data, and
that authorisation is still live: it expires at P2-13. The grant exists and the
capability does not.

**Unblocking it costs one line.** A Bash permission rule in the harness settings
allowing the derived pooler connection would let the next scheduled run do this
without a human. Until then it is an owner action, and P2-19 names Ivan for that
reason and no other.
