# EXECUTOR: RST-01 step 4, the corrected reset executed against the phase 2 database

**Date:** 2026-08-28 (UTC)
**Role:** EXECUTOR
**Card:** RST-01, step 4
**Authority:** R-047 (execution) and R-012 (the credential read), both on `main` at `07b44db`
**Target:** the Rapid Construct production project, ref `bwhzatwwjqmyfesfnisa`
**Result:** **psql exit 0. ALL 20 ASSERTIONS PASSED. COMMIT. 20 rows deleted.**

---

## 0. Boot

39 cards: 29 shipped, 6 todo, 3 blocked, 1 in_flight. Launch gate 6 of 9. Next
eligible by lexical id: AUT-10. This card was dispatched.

---

## 1. What was checked before anything was executed

This is the first time a terminal has executed a destructive statement set
against the client's database, so the preconditions are listed rather than
assumed.

**Authority, both halves.** R-047 permits the execution and is on `main`. R-012
grants the `phase2.env` read "for any card on this board", explicitly "not per
task", until P2-13. Neither grant was inferred from the dispatch; both were read
out of `decisions/inbox.md` on `main`.

**The file has the property R-047 attaches the permission to.** Checked against
the file itself, not against memory:

```
one begin;          1        one commit;               1
rc_reset_assertions built     1
gate raises via ::int::text   1        "RESET ABORTED" message present
DO $$ blocks in code          0   (the only occurrence is a comment saying why not)
```

**The file is byte-identical to the version proven against a real PostgreSQL.**
`sha256 542e7bc72a6edc4123e6cd15b519401cf7d91f39d24fd954ab9bdf94eeb42d7f`,
matching `f8e9078`. Nothing was edited to make this run possible, and nothing was
edited after it.

**`npm run check:reset-sql`: 9 checks green**, including CHECK 9, which is the
one that asserts the file still decides its own outcome.

**Connectivity proven before any work, per CLAUDE.md 8.4.** `select 1` returned
`1`. Connection derived at runtime: session pooler `aws-1-eu-west-1`, port 5432,
user `postgres.<ref>`, password from `SUPABASE_DB_PASSWORD` through `PGPASSWORD`
so it never enters a connection string. No value printed, logged or stored.

**A host correction found in this repository rather than guessed.** The
derivation first used `aws-0-eu-west-1.pooler.supabase.com`.
`docs/migrations/APPLY-LOG.md` records that host resolving, accepting TCP and
then rejecting the tenant with `FATAL: (ENOTFOUND)`, and names
`aws-1-eu-west-1.pooler.supabase.com` as the one that answers. Read back out of
the log, not discovered by trying.

---

## 2. The sandbox refused first, and that is part of the record

The command that sources `/Users/ivan/rc-secrets/phase2.env` and opens a
session-pooler connection was **denied by this session's harness** on the first
attempt. That is the identical refusal `docs/migrations/APPLY-LOG.md` already
records for migration 0011: "the terminal was refused by its own sandbox, not by
any rule in this repository... and a denial is not retried around."

**It was not retried around.** The run was stopped, the block was reported to the
owner with the exact command and the three ways forward, and he granted the
permission. Only then was it executed. The distinction matters: the project's
rules permitted this before the harness did, and the gap between those two facts
is a thing to report, never a thing to route around.

---

## 3. The run, verbatim

### 3.1 PRE, twelve rows

```
 PRE products                 3
 PRE inbound_orders           2
 PRE outbound_issues          2
 PRE order_lines              2
 PRE outbound_lines           2
 PRE batches                  2
 PRE reminders                0
 PRE status_history           6
 PRE extraction_drafts        0
 PRE extraction_draft_lines   0
 PRE categories               1
 PRE MIXED left alone         0
```

### 3.2 PRE, the product set by registry prefix

```
 PRE products by prefix CRITIC-RACE-       2
 PRE products by prefix CRITIC-RACE2-      1
 PRE products by prefix TEST-              0
 PRE products EXT- from a test document    0
```

### 3.3 The rows the registry named, printed by the script

```
 CRITIC-RACE-1787699224857   | Critic cursa 1787699224857
 CRITIC-RACE-1787702980667   | Critic cursa 1787702980667
 CRITIC-RACE2-1787699278920  | Critic cursa 1787699278920
```

### 3.4 DELETE counts, in the order the file runs them

```
 status_history           6
 extraction_draft_lines   0
 extraction_drafts        0
 batches                  2
 outbound_lines           2
 order_lines              2
 outbound_issues          2
 inbound_orders           2
 reminders                0
 products                 3
 categories               1
                     total 20
```

### 3.5 POST, twenty-one rows

```
 POST in-scope products remaining                       0
 POST in-scope inbound_orders remaining                 0
 POST in-scope outbound_issues remaining                0
 POST in-scope order_lines remaining                    0
 POST in-scope outbound_lines remaining                 0
 POST in-scope batches remaining                        0
 POST in-scope reminders remaining                      0
 POST in-scope status_history remaining                 0
 POST in-scope extraction_drafts remaining              0
 POST in-scope extraction_draft_lines remaining         0
 POST in-scope categories remaining                     0
 POST orphan batches                                    0
 POST orphan order_lines                                0
 POST orphan outbound_lines                             0
 POST orphan extraction_draft_lines                     0
 POST orphan status_history                             0
 POST products remaining with a registered prefix       0
 POST unreferenced prefixed categories remaining        0
 POST prefixed categories held by an in-scope product   0
 POST MIXED entities surviving                          0
 POST products remaining in total                       0
```

Mixed-orders list: `(0 rows)`. Surviving prefixed categories: `(0 rows)`.

### 3.6 The assertion grid, all twenty

```
  1 | in-scope products fully consumed by its DELETE (PRE 3, remaining 0)               | PASS
  2 | in-scope inbound_orders fully consumed by its DELETE (PRE 2, remaining 0)         | PASS
  3 | in-scope outbound_issues fully consumed by its DELETE (PRE 2, remaining 0)        | PASS
  4 | in-scope order_lines fully consumed by its DELETE (PRE 2, remaining 0)            | PASS
  5 | in-scope outbound_lines fully consumed by its DELETE (PRE 2, remaining 0)         | PASS
  6 | in-scope batches fully consumed by its DELETE (PRE 2, remaining 0)                | PASS
  7 | in-scope reminders fully consumed by its DELETE (PRE 0, remaining 0)              | PASS
  8 | in-scope status_history fully consumed by its DELETE (PRE 6, remaining 0)         | PASS
  9 | in-scope extraction_drafts fully consumed by its DELETE (PRE 0, remaining 0)      | PASS
 10 | in-scope extraction_draft_lines fully consumed by its DELETE (PRE 0, remaining 0) | PASS
 11 | in-scope categories fully consumed by its DELETE (PRE 1, remaining 0)             | PASS
 12 | orphan batches is 0 (found 0)                                                     | PASS
 13 | orphan order_lines is 0 (found 0)                                                 | PASS
 14 | orphan outbound_lines is 0 (found 0)                                              | PASS
 15 | orphan extraction_draft_lines is 0 (found 0)                                      | PASS
 16 | orphan status_history is 0 (found 0)                                              | PASS
 17 | no product with a registered SKU prefix remains (found 0)                         | PASS
 18 | no prefixed category with zero referencing products remains (found 0)             | PASS
 19 | no prefixed category is held by an in-scope product (found 0)                     | PASS
 20 | every MIXED entity survived (PRE 0, surviving 0)                                  | PASS

 ALL 20 ASSERTIONS PASSED, COMMITTING
 COMMIT
```

**psql exit 0.**

---

## 4. The halt condition, checked mechanically rather than by eye

The card names one halt condition: the script committing despite an assertion
failing. That is a claim about the output, so it was checked as one.

```
assertion rows: PASS=20  FAIL=0
"COMMIT" lines=1   "RESET ABORTED"=0   psql exit=0
RESULT: no halt condition. 20 of 20 passed and the commit followed an all-pass gate.
```

The assertion harness and the transaction agree. There is nothing here to
escalate.

---

## 5. The outcome differed from the expectation, and the script is why that was safe

**The dispatch expected "3 CRITIC-RACE products and 1 TEST- category removed,
everything else already 0". Twenty rows went, not four.**

| | expected | actual |
|---|---|---|
| products | 3 | 3 |
| categories | 1 | 1 |
| inbound_orders | 0 | **2** |
| outbound_issues | 0 | **2** |
| order_lines | 0 | **2** |
| outbound_lines | 0 | **2** |
| batches | 0 | **2** |
| status_history | 0 | **6** |

**This is not an assertion failure and not a defect. The expectation was simply
wrong about the blast radius.** The CRITIC's concurrency testing did not only
create three products. It issued stock from them, twice, which is the whole point
of a concurrency test: two simultaneous issues of an entire stock, fired from two
sessions. Those issues, the orders behind them, their lines, their batches and
their history rows all descend from the three products and nothing else.

**Nothing real was touched, and the script proved it rather than assuming it.**
Every one of those rows entered the delete set through the `not exists` clause,
which admits an order only when it has **no** line pointing outside the set.
`PRE MIXED left alone 0` and assertion 20 confirm there was no order carrying a
real line alongside a test one. The five orphan checks confirm nothing was left
pointing at a row that had gone.

**This is exactly the case R-047 was written for.** A terminal reading a grid
would have had to decide, on the spot, whether sixteen rows it had been told
would not exist were safe to delete. It did not have to, and under R-047 it is
not permitted to: the script had already resolved those rows into the delete set
by evidence, asserted the result, and committed on its own verdict. The
expectation being wrong changed nothing about the outcome's safety.

---

## 6. Independently verified after the commit

Confirmed in a separate connection, after the transaction closed, so it reads
committed state rather than the transaction's own view:

```
 batches                         |     0
 categories TEST-                |     0
 categories total                |    18
 extraction_drafts               |     0
 inbound_orders                  |     0
 order_lines                     |     0
 outbound_issues                 |     0
 outbound_lines                  |     0
 products                        |     0
 products carrying a test prefix |     0
 reminders                       |     0
 status_history                  |     0
```

`products carrying a test prefix` counts `TEST-%`, `CRITIC-RACE%` and `EXT-%`
together and returns 0.

**`categories total 18` is the intended state, not a leftover.** Those are the
real category vocabulary seeded by migration `0007_seed_categories.sql`, which
`npm run check:categories` verifies on every push and which explicitly excludes
`TEST-Categorie`.

**The client's project now holds no test residue of any kind.** It also holds no
products at all, which is correct: Mihai has not entered any, and P2-14 and G9
are still open.

---

## 7. Two things this run corroborated on its way past

**P2-15's record is confirmed by an independent measurement.**
`PRE products by prefix TEST- 0`. If the owner's 2026-08-28 run had not deleted
all 302 `TEST-` products, this run would have found them and said so. It found
none. REC-01 committed that record on the strength of arithmetic; this is the
first observation of the database that agrees with it.

**The RST-01 selector fix was load-bearing, not theoretical.** Under the
pre-RST-01 selector these three products matched nothing, and their category was
skipped by `RESTRICT`, which is the deviation R-048 ratified. Under the registry
they were found by prefix, split correctly across `CRITIC-RACE-` (2) and
`CRITIC-RACE2-` (1), and their whole descendant tree came with them.

---

## 8. One loose end, named and deliberately not built

**R-047 created a class of production write that has no journal.**
`docs/migrations/APPLY-LOG.md` is the record of what has been applied to the
production database, and by its own framing it is a **migrations** log. This run
was not a migration, so it is not journalled there, and the record of it lives in
this report and in RST-01's `evidence.ref`.

That is defensible for one run and it does not scale. Now that a terminal may
execute assertion-bearing scripts, there is a second path that writes to
production and a reader has to know to look in two places. Whether the log widens
to "everything applied to production" or a sibling log is added is a decision,
not an executor's call, and inventing either here would be scope this card does
not carry. Flagged for the owner.

---

## 9. What a reader should carry forward

**RST-01 is shipped and the reset is finished.** Between the owner's run and this
one, 1,241 rows have been removed from the client's project: 1,221 on 2026-08-28
by hand, 20 by this terminal.

**`/inventar` is now empty rather than full of test data.** That is the screen G9
asks Mihai to complete a full cycle on. The gate does not move on this: it needs
Mihai, and no terminal can close it.

**The expectation in a dispatch is not the acceptance.** The acceptance was the
assertion gate, and it is the reason a run whose blast radius was four times what
anyone predicted is still a clean run. The lesson generalises past this card: the
thing to build is the check, not the forecast.
