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

`0001` through `0006` were applied before this log was required, and their
journals live on their cards rather than here. They are listed for completeness
and their actor is recorded as far as it is knowable.

| version | applied by | when | journal |
|---|---|---|---|
| 0001 | IVAN, in the Supabase SQL editor | before 2026-08-25, exact time not recorded | P2-01 evidence, verified rather than re-applied by EXECUTOR under R-001 |
| 0002 | EXECUTOR under R-001 | 2026-08-25, exact time not recorded | P2-04 evidence |
| 0003 | EXECUTOR under R-001 | 2026-08-25, exact time not recorded | P2-04 evidence |
| 0004 | EXECUTOR under R-001 | 2026-08-25, exact time not recorded | P2-05 evidence |
| 0005 | EXECUTOR under R-001 | 2026-08-25, exact time not recorded | P2-06 evidence |
| 0006 | **UNKNOWN** | **UNKNOWN** | Not this terminal. Found already applied at the pre-check on 2026-08-26 and verified read-only rather than re-applied. This unanswerable row is the reason this file exists. |

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
