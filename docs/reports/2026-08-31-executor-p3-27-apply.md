# EXECUTOR, 2026-08-31: P3-27, the thirteen migrations applied to production

Card **P3-27**. Branch `card/p3-27`. **Applied and committed. Exit 0.**

Authority: **R-082**, landed by P3-27a and merged as `f420d02`, which amended
`CLAUDE.md` 8.6. Full captured stdout: `docs/reports/p3-27-apply-stdout.txt`.

---

## 1. Connectivity, proven before anything else

```
select 1 as connectivity, current_database(), version();
 connectivity |    db    |              server
--------------+----------+-----------------------------------
            1 | postgres | PostgreSQL 17.6 on x86_64-pc-linux-gnu
```

Host `aws-1-eu-west-1.pooler.supabase.com`, port 5432, session pooler, user
`postgres.<ref>`, password via `PGPASSWORD` and never in a connection string.

## 2. The precondition for the whole grant, checked and intact

`CLAUDE.md` 8.2 grants this only **while the project contains zero real client
data**. Verified before the run, not assumed:

| table | rows |
|---|---|
| products, inbound_orders, outbound_issues, batches | 0 |
| order_lines, outbound_lines, status_history, reminders | 0 |
| extraction_drafts, extraction_draft_lines | 0 |
| categories (seeded by 0007) | 18 |
| units (seeded by 0001) | 7 |
| profiles (the three test accounts) | 3 |

**This also retires the one operational risk the P3-27a report raised.** That
report warned that `hasPhase3Schema()` is memoised for 60 seconds, so a warm
server could call the four-argument function for up to a minute after the drop.
With zero `outbound_issues` and no operator creating one, the window was
theoretical. It is recorded because it will not be theoretical at the next apply,
once real data exists.

## 3. The statement, quoted verbatim

```sql
drop function if exists public.create_outbound_issue(text, text, text, jsonb);
```

`0018 gate: dependent objects on the four-argument function = 0`, asserted
**before** the drop executed. After the commit, exactly one function remains:

```
        proname        |             args
-----------------------+-------------------------------
 create_outbound_issue | text, text, text, jsonb, uuid
```

`no DELETE, TRUNCATE or DROP TABLE in any pending file.`

## 4. Phase 1, pre-check

Ledger before the batch, **10 rows**: `0001` to `0009`, plus `0015` written by the
enum pre-phase moments earlier.

**The ledger was at `0009` while the schema was at `0012`**, exactly as the
strategy record said. `0010`, `0011` and `0012` had never been journalled. The
applier wrote all three inside the batch and asserted the result.

The enum pre-phase, the one bounded deviation from a single transaction, carried
exactly one statement:

```
0015_status_entity_project.sql:  alter type public.status_entity add value if not exists 'project';   (idempotent, IF NOT EXISTS)
```

## 5. Phase 2, apply

**13 migrations, 202 statements, one transaction, 11 assertions, committed on
all-pass.** Started `23:27:11Z`, finished `23:27:25Z`.

```
batch sha256    a5e9e87f46b04839ab83529f2d492f01b123c48f3ee496fd2b64c86324e14667
script sha256   315448e15f4e02e83d55bb1003fb9c28ff1152b45acd5a4020c54ff4a0b0b9a6
```

## 6. Phase 3, post-check

**Ledger after: 25 rows, `0001` to `0025`, no gaps.**

**Row counts identical on every pre-existing table**, which is the `zero-rows-deleted`
assertion stated as a grid rather than as a claim:

```
 batches 0->0   categories 18->18   extraction_draft_lines 0->0
 extraction_drafts 0->0   inbound_orders 0->0   order_lines 0->0
 outbound_issues 0->0   outbound_lines 0->0   products 0->0
 profiles 3->3   reminders 0->0   status_history 0->0   units 7->7
```

RLS enabled with 3 policies on every new table:

```
 table_name  | rls_enabled | policies
-------------+-------------+----------
 clients     | t           |        3
 contacts    | t           |        3
 deviz_lines | t           |        3
 devize      | t           |        3
 projects    | t           |        3
 suppliers   | t           |        3
```

Reconciliation, both empty because both source tables are empty:

```
P3-04 reconciliation: outbound_issues with no project_id = 0
P3-05 reconciliation: products with a supplier_name and no supplier_id = 0
```

**The backfills therefore proved nothing about real rows, and that matters for
what comes next.** P3-04b and P3-05b drop the free-text columns only after their
backfills are verified against real rows. There are none. Those two cards cannot
be closed on this run's evidence and stay blocked.

## 7. Verified from a fresh connection, after the commit

| check | result |
|---|---|
| `clients`, `contacts`, `projects`, `suppliers`, `devize`, `deviz_lines` | all present |
| `outbound_issues.project_id`, `products.supplier_id` | present |
| `outbound_issues.client_name`, `outbound_issues.project_name`, `products.supplier_name` | **still present**, untouched |
| pre-existing row counts | unchanged |
| `create_outbound_issue` | exactly one, five arguments |
| ledger | 25 rows, `0001` to `0025` |

## 8. The register, and the check that switched itself off

```
$ npm run check:pending-schema-reads
check-pending-schema-reads: nicio migratie in asteptare, nimic de verificat
EXIT=0
```

The applier cleared all 13 lines from the pending register, and the guard built by
INC-05 switched itself off by its own design, without being edited. That was the
property it was written to have and this is the first time it has been exercised.

`docs/PRODUCTION-WRITES.md` carries the row, per R-055, written before this PR is
merged.

## 9. The one thing that was blocked, and was not worked around

The applier run was **refused by the Claude Code auto-mode classifier** on the
first attempt, exactly as `docs/migrations/APPLY-LOG.md` records happening twice
on 2026-08-27 and once on RST-01. The repo's rules permit the command; the harness
did not. It was not routed around: the run stopped, the exact command and the
three options were put to the owner, he granted the permission, and the run went
through. Same resolution as RST-01.

## 9b. The deployed surface: what was proven, and what was not

**Proven.** PostgREST has reloaded its schema cache and serves the new tables,
which is a real post-migration failure mode and not something the database check
covers. Asked for `projects`, `clients`, `suppliers` and `devize` with the anon
key, every one answered **`42501` insufficient_privilege**, not `PGRST205`
"table not found in schema cache". That single result carries two facts: the API
layer knows the tables exist, and **anon holds no privilege on any of them**,
which is the security property every one of those migrations asserts.

**NOT proven, and not claimed.** The dispatch asks for the four CRM routes
returning 200 "with real content rather than the pending screen". All four return
200, and that result is **vacuous**: they are auth-gated, and unauthenticated they
redirect to `/autentificare`, which is what actually returned the 200.

```
/clienti /proiecte /inventar /comenzi   -> 200
curl -L /clienti                        -> https://www.rapidconstructmd.com/autentificare
                                           <title>Autentificare - Rapid Construct</title>
```

Verifying the signed-in screens needs a production session, and
`/Users/ivan/rc-secrets/phase2.env` carries no `TEST_OWNER_EMAIL` or
`TEST_OWNER_PASSWORD` for this project: those exist only for the local stack. So
this clause is **outstanding and belongs to the owner**, who can log in. It is
recorded as outstanding rather than reported as passed on a 200 that only proves
the login page renders.

## 10. What this does NOT close

- **The phase 3 launch gate is still 0/9.** Every condition says "on production"
  and the schema is now there, but each one names its own proof and none of those
  proofs is a schema check. They are a separate pass.
- **P3-04b and P3-05b stay blocked**, per section 6 above.
- **The signed-in screens are unverified**, per section 9b. The API layer is
  proven; the rendered pages are not, and no credential in reach can prove them.
