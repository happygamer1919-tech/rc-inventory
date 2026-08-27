# Migration apply log

**Required by P2-11, added by ruling R-013.**

Every migration applied to the RC Supabase project gets one entry here, carrying
the version, **the actor who applied it**, a UTC timestamp, and the pre-check
and post-check output in full.

## Why this file exists

On 2026-08-26 migration `0006_reminder_recipients.sql` was found already applied
to the production project, and **nobody could say by whom or when**.
`supabase_migrations.schema_migrations` carries `version`, `statements` and
`name`. It has no actor column and no timestamp column, so the question is not
answerable from the database at all. All that could be established was that it
was not this terminal.

A migration path nobody can audit is a hardening defect, which is why R-013
folded this into P2-11 rather than raising a separate card.

## Rules

- **One entry per apply**, in the order they were applied, newest at the bottom.
- **Append only.** An entry is never edited after it is written. A correction is
  a new entry naming the one it corrects.
- **The actor is named.** `EXECUTOR`, `IVAN`, `CRITIC`, whoever ran it. "someone"
  is not an actor.
- **Both check outputs go in whole**, not summarised. The point is that a
  stranger can re-read what actually happened without database access.
- **No credential values.** Variable names only, as everywhere.

## Entries before this file existed

`0001` through `0006` were applied before this log was required. Their journals
live on their cards, and this section carries what is knowable about each.

**EXPANDED FROM A TABLE INTO ENTRIES BY P2-11, 2026-08-27. Not one fact was
changed, added or removed:** every row of the original table became the entry of
the same version below, word for word in its "journal" line. The table was the
only part of this file that did not carry one heading per migration, so an
audit could not ask "does every migration have an entry" without a human reading
prose. `tests/e2e/headers.spec.ts` now asks exactly that, per file, and it needs
the headings to be able to.

## 0001_phase2_schema.sql

- **Version:** 0001
- **Actor:** IVAN, in the Supabase SQL editor
- **Applied at:** before 2026-08-25, exact time not recorded
- **Journal:** P2-01 evidence, verified rather than re-applied by EXECUTOR under
  R-001

## 0002_rc_docs_bucket.sql

- **Version:** 0002
- **Actor:** EXECUTOR under R-001
- **Applied at:** 2026-08-25, exact time not recorded
- **Journal:** P2-04 evidence

## 0003_inbound_functions.sql

- **Version:** 0003
- **Actor:** EXECUTOR under R-001
- **Applied at:** 2026-08-25, exact time not recorded
- **Journal:** P2-04 evidence

## 0004_outbound_functions.sql

- **Version:** 0004
- **Actor:** EXECUTOR under R-001
- **Applied at:** 2026-08-25, exact time not recorded
- **Journal:** P2-05 evidence

## 0005_service_role_grants.sql

- **Version:** 0005
- **Actor:** EXECUTOR under R-001
- **Applied at:** 2026-08-25, exact time not recorded
- **Journal:** P2-06 evidence

## 0006_reminder_recipients.sql

- **Version:** 0006
- **Actor:** **UNKNOWN.** Not this terminal.
- **Applied at:** **UNKNOWN.** Found already applied at the pre-check on
  2026-08-26 and verified read-only rather than re-applied.
- **Journal:** none. This unanswerable row is the reason this file exists:
  `supabase_migrations.schema_migrations` carries version, statements and name,
  and has no actor column and no timestamp column, so the question is not
  answerable from the database at all.

---

## 0007_seed_categories.sql

- **Version:** 0007
- **Name:** seed_categories
- **Actor:** EXECUTOR
- **Applied at:** 2026-08-26T21:05:00Z
- **Authority:** ruling R-012 (board-wide secrets read until P2-13), card P2-17
- **Card:** P2-17
- **Destructive statements:** none. INSERT only, `on conflict (name) do nothing`.
- **Connection:** derived at runtime per CLAUDE.md 8.4. eu-west-1 session pooler,
  port 5432, user `postgres.<ref>`, password from `SUPABASE_DB_PASSWORD`. No
  connection string stored and no value printed.
- **Parsed before applying:** yes, with `pgsql-parser`. 3 statements,
  `TransactionStmt InsertStmt TransactionStmt`, 18 rows in the VALUES list,
  on-conflict action `ONCONFLICT_NOTHING`.

### Connectivity

```
select 1
1
```

### Phase 1, pre-check

```
migration files on disk: 7
journal rows before:
  0001|phase2_schema
  0002|rc_docs_bucket
  0003|inbound_functions
  0004|outbound_functions
  0005|service_role_grants
  0006|reminder_recipients
pending (on disk, not in journal): 0007
0007 claims to create: 18 category rows, INSERT only, on conflict do nothing
categories rows before: 1
names before: TEST-Categorie
```

### Phase 2, apply

One transaction, `psql -v ON_ERROR_STOP=1 -f`. The file carries its own `begin`
and `commit`. No output, no error, clean exit. The journal row was then written:

```
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('0007','seed_categories', array[...]) on conflict (version) do nothing
  returning version
0007
```

### Phase 3, post-check

```
categories rows after: 19        (18 seeded + TEST-Categorie untouched)

the 18 seeded, sort_order | name | active:
 1 | Cimenturi și mortare        | t
 2 | Zidărie și cărămidă         | t
 3 | Betoane și agregate         | t
 4 | Armături și oțel            | t
 5 | Lemn și plăci               | t
 6 | Izolații termice            | t
 7 | Hidroizolații               | t
 8 | Gips-carton și profile      | t
 9 | Finisaje pereți             | t
10 | Placări ceramice și adezivi | t
11 | Instalații sanitare         | t
12 | Instalații electrice        | t
13 | Acoperișuri și tablă        | t
14 | Feronerie și fixări         | t
15 | Scule și consumabile        | t
16 | Uși și ferestre             | t
17 | Amenajări exterioare        | t
18 | Altele                      | t

TEST-Categorie untouched?  name | active | sort_order | product count:
TEST-Categorie | t | 0 | 305

tables | with RLS | policies in public:  11 | 11 | 41
enums: 6

journal after:
  0001|phase2_schema
  0002|rc_docs_bucket
  0003|inbound_functions
  0004|outbound_functions
  0005|service_role_grants
  0006|reminder_recipients
  0007|seed_categories
```

### Idempotency, proven rather than claimed

The same file was applied a **second time** in the same session:

```
SECOND_APPLY_EXIT= (clean)
categories rows after second apply: 19        (unchanged)
duplicate names: none duplicated
```

### What was deliberately not touched

`TEST-Categorie` was not renamed, deactivated, deleted or merged. It is CRIT-11
e2e residue carrying all 305 products, and it belongs to **P2-15** and to the
owner decision recorded there. A seed migration that quietly tidied it would be
taking that decision on Ivan's behalf, which is exactly what P2-15 exists to
prevent.

---

## 0008_extraction_drafts.sql

- **Version:** 0008
- **Name:** extraction_drafts
- **Actor:** EXECUTOR
- **Applied at:** 2026-08-27T08:40:00Z
- **Authority:** ruling R-012, card P2-08a
- **Destructive statements:** none. The only `delete` tokens are `on delete set
  null` and `on delete cascade` in foreign keys, and `for delete` in policies.
- **Parsed before applying:** yes, `pgsql-parser`. 21 statements:
  2 `CreateEnumStmt`, 2 `CreateStmt`, 2 `CommentStmt`, 2 `IndexStmt`,
  1 `CreateTrigStmt`, 2 `AlterTableStmt`, 8 `CreatePolicyStmt`, wrapped in
  `TransactionStmt`. Zero destructive statement kinds.

### Phase 1, pre-check

```
files on disk: 8
journal before: 0001..0007
pending: 0008
0008 claims to create: 2 enums, 2 tables, 2 comments, 2 indexes, 1 trigger,
                       8 policies, RLS on both tables
tables in public before: 11
enums before: 6
```

### Phase 2, apply

One transaction, `psql -v ON_ERROR_STOP=1 -f`. Clean. Journal row written.

### Phase 3, post-check

```
tables | with RLS | policies:   13 | 13 | 49
extraction_drafts        rls=t  policies=4
extraction_draft_lines   rls=t  policies=4
enums: 8
  extraction_status      extracted,partial,failed
  extraction_error_code  download_failed,url_expired,unsupported_format,
                         unreadable_document,extraction_failed,invalid_output,timeout

NULLABILITY, every contract field nullable:
extraction_drafts       order_id=NO document_path=NO document_filename=NO
                        mime_type=NO size_bytes=NO created_at=NO updated_at=NO
                        ALL 17 OTHERS = YES
extraction_draft_lines  id=NO order_id=NO line_no=NO product_name=NO
                        created_at=NO
                        ALL 10 OTHERS = YES

COLUMN DEFAULTS that are 0 or empty string: none
journal after: 0001..0008
```

### The post-check found a defect, which is what it is for

`anon` held `SELECT` on both new tables. Every other table in this schema grants
`anon` nothing, verified by the CRITIC at the wave 1 boundary and re-verified
read-only the same morning during the G2 gate audit: zero of eleven.

Nothing leaked. RLS is on and every policy is `to authenticated`, so an
anonymous request matched no policy and returned zero rows. PostgreSQL checks
the GRANT first and RLS second, and the second check was holding. But the point
of revoking `anon` is that it is the FIRST of the two, and a table with one
layer where every sibling has two is protected less.

Corrected by **0009**, below. 0008 is not edited: it is applied, and CLAUDE.md
8.1 says a correction is a new numbered file.

---

## 0009_revoke_anon_on_extraction_drafts.sql

- **Version:** 0009
- **Name:** revoke_anon_on_extraction_drafts
- **Actor:** EXECUTOR
- **Applied at:** 2026-08-27T08:50:00Z
- **Authority:** ruling R-012, card P2-08a
- **Destructive statements:** none. `REVOKE` only.
- **Parsed before applying:** yes. 11 statements: 5 `GrantStmt` (revokes),
  3 `AlterDefaultPrivilegesStmt`, 1 verification `SelectStmt`, wrapped in
  `TransactionStmt`.

### Why 0008 needed correcting

Supabase grants table privileges to `anon` and `authenticated` **at CREATE TABLE
time**, from project-level default privileges that predate every migration here.
Migration 0001 knew that and revoked `anon` explicitly. That statement ran once,
against the tables that existed then. It is not a policy and it does not reach
tables created later. 0008 created two and did not repeat it.

The durable fix is the default privilege, not the revoke: the revoke fixes the
two tables that exist, and `alter default privileges ... revoke all on tables
from anon` stops the next `CREATE TABLE` reintroducing it. Same reasoning 0005
used for `service_role` and `authenticated`.

### Phase 1, pre-check

```
tables where anon can SELECT: 2   (extraction_drafts, extraction_draft_lines)
```

### Phase 2, apply

One transaction, clean. The file's own verification query printed all 13 tables
with `anon_can_read = f` and `authenticated_can_read = t`.

### Phase 3, post-check

```
tables where anon can SELECT:           0   of 13
tables where authenticated can SELECT:  13  of 13
tables where service_role can SELECT:   13  of 13
journal after: 0001..0009
```

---

## 0010_confirm_extraction_draft

- **Version:** 0010
- **Name:** confirm_extraction_draft
- **Actor:** EXECUTOR (unattended run 20260827-041238)
- **Applied at:** 2026-08-27T09:56:00Z
- **Authority:** ruling R-012 (board-wide secrets read until P2-13), card P2-09
- **Card:** P2-09
- **Destructive statements:** none. 0 `DROP TABLE`, 0 `TRUNCATE`, 0 `DELETE`.
  Near-misses correctly excluded: two `on delete set null` foreign key clauses,
  which are referential actions and delete no row.
- **Connection:** derived at runtime per CLAUDE.md 8.4. Session pooler
  eu-west-1, port 5432, user `postgres.<ref>`, password from
  `SUPABASE_DB_PASSWORD` via `PGPASSWORD` so it never enters a connection
  string. No value printed and no connection string stored.

### The host, and why the first attempt failed

`aws-0-eu-west-1.pooler.supabase.com` resolved, accepted TCP and rejected the
tenant: `FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found`. That is the
same failure 0001 hit and recorded, so the correct host was not guessed at, it
was read back out of this repository: the 0001 journal on the board and
`docs/LEARNINGS.md` both name `aws-1-eu-west-1.pooler.supabase.com` as the one
that answers. Retried there and `select 1` returned `1`.

### Connectivity

```
select 1
1
```

### Phase 1, pre-check

```
pending files: 1 -> 0010_confirm_extraction_draft.sql
file claims: 2 alter table, 1 create function
db state before: extraction_drafts columns=24, confirm_extraction_draft exists=0
```

### Phase 2, apply

One transaction, `psql -v ON_ERROR_STOP=1 -f`. The file carries its own
`begin`/`commit`.

```
BEGIN
ALTER TABLE
CREATE INDEX
ALTER TABLE
COMMENT
CREATE FUNCTION
COMMENT
COMMIT
apply exit: 0
```

### Phase 3, post-check

```
extraction_drafts new columns: confirmed_at, confirmed_by, confirmed_inbound_order_id
confirm_extraction_draft security_definer=false
extraction_draft_lines rls=true policies=4
extraction_drafts      rls=true policies=4
products=305 inbound_orders=181 extraction_drafts=0
```

`security_definer=false` is the intended value and not an oversight: the
function writes the order, its lines and its history row AS THE OPERATOR, so
every RLS policy on those tables still applies to the write. A definer function
here would have been a hole that let any signed-in session write rows the
policies refuse.

`products=305` and `inbound_orders=181` are test rows, not client data: they are
what P2-15's reset script exists to remove before first real data. The R-001
grant's condition, zero REAL client data, still holds.

## 0011_extraction_confirm_corrections

- **Version:** 0011
- **Name:** extraction_confirm_corrections
- **Actor:** EXECUTOR
- **Applied at:** NOT APPLIED. See "Why this entry exists unapplied" below.
- **Authority:** ruling R-012 (board-wide secrets read until P2-13), card P2-09
- **Card:** P2-09
- **Destructive statements:** none of the three named by CLAUDE.md 8.6. 0
  `DROP TABLE`, 0 `TRUNCATE`, 0 `DELETE`. **One near-miss, named rather than
  buried:** the file contains `alter table ... drop constraint`, which removes a
  CHECK expression and no row, and which is the only way a constraint can be
  relaxed. Flagged here and in the PR so the owner can rule otherwise if he
  reads the rule wider than it is written.
- **Parsed before applying:** yes, with `pgsql-parser`, the real PostgreSQL
  grammar. **13 statements:** 2 `TransactionStmt`, 2 `AlterTableStmt`
  (`AT_DropConstraint` then `AT_AddConstraint`, both on
  `public.extraction_drafts`), 2 `CommentStmt`, 1 `CreateFunctionStmt`,
  3 `GrantStmt`, 1 `AlterDefaultPrivilegesStmt`, 2 verification `SelectStmt`.
  Forbidden statements found: none.

### Why this entry exists unapplied

The apply was attempted and **the terminal was refused by its own sandbox**, not
by any rule in this repository. R-012 grants the secrets read and CLAUDE.md 8.3
describes exactly how to perform it; the command that sources
`/Users/ivan/rc-secrets/phase2.env` and opens a session-pooler connection was
denied by the harness running this session, twice, and a denial is not retried
around. Nothing was read, nothing was connected to, and no value was seen.

**The card ships anyway, and this is not a shortcut.** P2-09's acceptance is
`tests/e2e/review.spec.ts` against the CI stack, and CI replays every migration
from empty with `supabase db reset`, so 0011 is executed on every push and its
statements are proven to run against a real PostgreSQL. What is outstanding is
only the production database, which is a different question from whether the
file is correct.

### What production looks like until it is applied

Coherent, and no screen behaves differently. 0010 is applied, so every column
the application reads exists. The two things production does not yet have:

1. **The corrected CHECK.** `extraction_drafts_confirmed_pair` is still the
   equivalence form, so deleting an inbound order that a confirmed draft points
   at fails with `23514`. Nothing in the application deletes an inbound order.
   The one file that does is `scripts/reset-test-data.sql`, which belongs to
   **P2-15 and has not run**, so the correct ordering is simply: apply 0011
   before P2-15 is executed. Written onto the P2-15 card.
2. **The function grants.** `confirm_extraction_draft` is executable by
   `PUBLIC`, and `anon` is a member of `PUBLIC`. Nothing is reachable through
   it: the function is `SECURITY INVOKER`, 0009 revoked every table privilege
   from `anon`, and every RLS policy is `to authenticated`, so an anonymous
   caller is refused twice over. It is the same shape as 0008's table grant,
   with the same conclusion: the missing layer is the first of two and the
   second is holding.

### The apply command, for whoever runs it

Three phases per CLAUDE.md 8.5, connection derived per 8.4 (session pooler
`aws-1-eu-west-1`, port 5432, user `postgres.<ref>`, `PGPASSWORD` from
`SUPABASE_DB_PASSWORD`, never a connection string). The file carries its own
`begin`/`commit`, so `psql -v ON_ERROR_STOP=1 -f
supabase/migrations/0011_extraction_confirm_corrections.sql` is the whole apply,
and the two `select` statements after `commit` are the post-check.

**The post-check to read is the reachability one, not the counting one**, per
the learning added on 2026-08-27: expect `anon_can_execute = false` on every row
of the function listing, `authenticated_can_execute = true` on every function
the application calls, and `set_updated_at` false, which is correct because a
trigger function is only ever reached through its trigger.

## 0011_extraction_confirm_corrections - APPLIED

**This entry corrects the one above it,** which was written when the apply had
been refused and read "NOT APPLIED". Per the rules at the top of this file an
entry is never edited after it is written, so the correction is a new entry
naming the one it corrects. Everything the earlier entry says about what the
file does, why it exists and what production looked like without it still
stands; only its status is superseded.

- **Version:** 0011
- **Name:** extraction_confirm_corrections
- **Actor:** EXECUTOR
- **Applied at:** 2026-08-27T14:05:00Z
- **Authority:** ruling R-012 (board-wide secrets read until P2-13), card P2-09
- **Card:** P2-09 (correction to that card's own 0010)
- **Destructive statements:** none that destroy a row. 0 `DROP TABLE`,
  0 `TRUNCATE`, 0 `DELETE`. **One `ALTER TABLE ... DROP CONSTRAINT`, quoted
  verbatim as ruling R-031 requires:**

  ```sql
  alter table public.extraction_drafts
    drop constraint extraction_drafts_confirmed_pair;
  ```

  It removes a CHECK expression and no row, and it is the only way a constraint
  can be relaxed. R-031 widened CLAUDE.md 8.6 to the operations that destroy
  rows and permits this one under exactly these conditions.
- **Parsed before applying:** yes, with `pgsql-parser`, the real PostgreSQL
  grammar. 13 statements: 2 `TransactionStmt`, 2 `AlterTableStmt`
  (`AT_DropConstraint` then `AT_AddConstraint`, both on
  `public.extraction_drafts`), 2 `CommentStmt`, 1 `CreateFunctionStmt`,
  3 `GrantStmt`, 1 `AlterDefaultPrivilegesStmt`, 2 verification `SelectStmt`.
  Forbidden statements found: none.
- **Connection:** derived at runtime per CLAUDE.md 8.4. Session pooler
  `aws-1-eu-west-1`, port 5432, user `postgres.<ref>`, password from
  `SUPABASE_DB_PASSWORD` via `PGPASSWORD` so it never enters a connection
  string. No value printed, no connection string stored.

### Connectivity

```
select 1 as ok
 ok
----
  1
(1 row)
```

### Phase 1, pre-check

```
extraction_drafts columns: 27
constraint before:
 extraction_drafts_confirmed_pair | CHECK ((((confirmed_inbound_order_id IS NULL) AND (confirmed_at IS NULL))
                                    OR ((confirmed_inbound_order_id IS NOT NULL) AND (confirmed_at IS NOT NULL))))

function EXECUTE reachability before:
          proname          | anon_exec | auth_exec | svc_exec
---------------------------+-----------+-----------+----------
 confirm_extraction_draft  | t         | t         | t
 create_inbound_order      | t         | t         | t
 create_outbound_issue     | t         | t         | t
 current_app_role          | t         | t         | t
 is_owner                  | t         | t         | t
 owner_reminder_recipients | f         | t         | t
 product_available_stock   | t         | t         | t
 receive_inbound_order     | t         | t         | t
 set_updated_at            | t         | t         | t
 ship_outbound_issue       | t         | t         | t

extraction_drafts rows: 0        confirmed rows: 0
ledger (supabase_migrations.schema_migrations), newest three: 0009, 0008, 0007
```

**NINE OF TEN FUNCTIONS WERE REACHABLE BY `anon`, NOT ONE.** The 0011 header
predicted this and it is worth reading against the earlier entry: the defect was
never specific to `confirm_extraction_draft`. PostgreSQL grants EXECUTE to
`PUBLIC` at CREATE FUNCTION time and `anon` is a member, so every function this
schema ever created carried it, from 0001 onward. The single exception,
`owner_reminder_recipients`, is the one migration that knew: 0006 revoked
`from public` and `from anon` by name and re-granted explicitly. That is the
pattern 0011 now applies to the whole schema and to every function created
after it.

Nothing was reachable through any of them: they are all `SECURITY INVOKER`,
0009 had revoked every table privilege from `anon`, and every RLS policy is
`to authenticated`. The first of two layers was missing on nine functions and
the second was holding on all nine.

### Phase 2, apply

One transaction, `psql -v ON_ERROR_STOP=1`. The file carries its own `begin`
and `commit`.

```
BEGIN
ALTER TABLE
ALTER TABLE
COMMENT
CREATE FUNCTION
COMMENT
GRANT
GRANT
REVOKE
ALTER DEFAULT PRIVILEGES
COMMIT
apply exit: 0
```

### Phase 3, post-check

```
constraint after:
 extraction_drafts_confirmed_pair | CHECK (((confirmed_inbound_order_id IS NULL) OR (confirmed_at IS NOT NULL)))

function EXECUTE reachability after:  anon f on 10 of 10, authenticated t on 10 of 10,
                                      service_role t on 10 of 10
table SELECT reachability after:      anon f on 13 of 13, authenticated t on 13 of 13
tables with RLS:                      13 of 13
```

`set_updated_at` reads `authenticated = t` after the revoke, which is correct
and not a leftover: Supabase's project-level default privileges grant to
`authenticated` at CREATE FUNCTION the same way they grant to `anon`, and only
the `PUBLIC` grant and `anon`'s own were being removed. It is a trigger function
either way, reached through its trigger and never called directly.

### OUTSTANDING, AND IT IS BOOKKEEPING RATHER THAN SCHEMA

**The `supabase_migrations.schema_migrations` rows for 0010 and 0011 were not
written.** The pre-check above is what found it: the ledger's newest row is
`0009`, so **the 0010 apply ran its SQL and never wrote its journal row**, and
the database's own record of what has been applied disagrees with the database.
Anything that reads that ledger to decide what is pending would try to apply
0010 again.

The command that writes both rows was authored and **refused by this session's
sandbox, twice**, with the same refusal recorded for the first 0011 attempt:

```
Permission for this action was denied by the Claude Code auto mode classifier.
Reason: Blocked by classifier.
```

It was not retried a third time. The schema is correct and complete; what is
missing is two rows in a bookkeeping table. `docs/runbooks/apply-0011.md`
carries the exact statements for whoever runs them, and this is the only thing
about 0011 that is still open.
