# EXECUTOR: RST-01, the reset asserts its own outcome, and the CRITIC-RACE leftovers

**Date:** 2026-08-28 (UTC)
**Role:** EXECUTOR
**Card:** RST-01, authored in this PR
**Base:** `origin/main` at `c97e48e`

---

## 0. Boot

Cards by status: 27 shipped, 6 todo, 3 blocked, 1 in_flight. Launch gate 6 of 9.
Next eligible card by lexical id: AUT-10, then AUT-8, AUT-9. This card was
dispatched rather than taken off the queue.

---

## 1. What was asked, and what happened

| Step | Outcome |
|---|---|
| 1. Extend the selectors to cover machine-generated prefixes, enumerated from test sources | DONE, with a finding: the test sources yield exactly one prefix family |
| 2. Convert the reset to self-asserting, five assertion classes minimum | DONE, 20 assertions, each one proven able to fail |
| 3. Keep `parse-reset-sql.mjs` green, extend rather than weaken CHECK 4 | DONE, and CHECK 4 needed no change at all. CHECK 9 added |
| 4. Run it against the phase 2 database | **NOT DONE. Blocked on Ivan.** Section 7 |
| 5. Commit this report with the grids | DONE |

---

## 2. Two premises in the dispatch that the repository does not support

Stated first because one of them is the reason step 4 did not run.

**"P2-15 ran and committed 2026-08-28. Nine POST rows clean, MIXED 0 before and
after, 1,221 rows deleted. Grids and full context in the P2-15 evidence on the
board."**

P2-15 on `main` at `c97e48e` is `status: blocked`, `blocked_on: ivan`,
`evidence: null`, `last_checkpoint: 2026-08-27`. There is no P2-15 evidence on
the board to read. No report in `docs/reports/` describes such a run, no open or
merged PR carries one, and the string `1,221` appears nowhere in the repository.
If that run happened, it happened in the Supabase SQL editor and nothing about
it was committed.

**"under the ledger execution ruling ratified 2026-08-28"**

`decisions/inbox.md` ends at R-046. The 2026-08-28 rulings are R-039 to R-046
and none of them grants a terminal a database connection or authorises
executing this file. R-044, on the same date, points the other way: it records
that P2-13 permanently removes any terminal's ability to open a database
connection. The closest ledger item, P2-19, is `blocked_on: ivan`.

Neither premise changes steps 1, 2, 3 or 5, which are complete. Both bear
directly on step 4.

---

## 3. Step 1: the prefixes, enumerated

**The instruction was to enumerate from the test sources and not guess. The
honest result of doing that is that the test sources yield one family.**

Every SKU the committed suite writes is `TEST-<tag>-<run>`:
`products.spec.ts`, `inbound.spec.ts` (`TEST-IN-`), `outbound.spec.ts`
(`TEST-OUT-`), `dashboard.spec.ts` (`TEST-DASH-`), `extraction.spec.ts`
(`TEST-EXT-`). The category is the literal `TEST-Categorie`. Uploads are
`TEST-<tag>-<run>.pdf`. There is no `CRITIC-RACE` anywhere in `tests/`, and
`git grep` over every commit in this repository's history finds it only in
`decisions/inbox.md` and `docs/reports/forensics-20260826-product-count.md`,
never in a test file.

**That is the finding, not a gap in the search.** Those rows were created by the
CRITIC's live concurrency testing at the wave 1 boundary on 2026-08-25 and
2026-08-26, described in `docs/reports/critic-wave1.md` under "Concurrency,
tested live rather than reasoned about": two simultaneous issues of an entire
stock, fired by hand from two sessions. It needed a product, so it made one,
from a session and not from a spec.

**The committed suite is not the only thing that writes to the database, so a
selector derived only from the suite is incomplete by construction.** That is
the second time this selector has gone stale the same way. R-033 fixed the
first, when the extraction lane shipped and `TEST-%` stopped being every test
product.

So the prefixes are no longer spelled into predicates. They are rows in
`rc_reset_sku_prefixes`, each carrying the provenance that justifies it, and
every predicate reads that one table:

| prefix | authority |
|---|---|
| `TEST-` | the committed e2e suite, enumerated above |
| `CRITIC-RACE-` | `docs/reports/critic-wave1.md`; newest row `CRITIC-RACE-1787702980667` at `2026-08-26 00:09:40+00` per the forensics report. Not from any test source |
| `CRITIC-RACE2-` | same session pair, same date range. Not from any test source |

Category names get their own registry, seeded with `TEST-`.

**`EXT-` is deliberately NOT a registry prefix and must never become one.**
`EXT-<slug>-<hex>` is what P2-09 writes for a flagged product, which is also
what real use writes after launch. Those products are in scope only through the
chain of evidence R-033 built: they sit on an order that a seed draft became.
Adding `EXT-` to the registry would delete the client's catalogue. The run below
proves both directions.

---

## 4. Step 2: what the file now asserts

Twenty assertions, evaluated in SQL inside the transaction, after the deletes
and before the COMMIT. All-pass commits. Any failure raises, rolls back, and
exits non-zero.

- 1 to 11, the consumption rule: every in-scope PRE count is fully consumed by
  its DELETE.
- 12 to 16, orphans: batches, order_lines, outbound_lines,
  extraction_draft_lines, status_history all 0.
- 17, the registry sweep: no surviving product carries a registered prefix.
  Broader than "in scope", which only counts what the selector selected.
- 18, no prefixed category with zero referencing products remains.
- 19, no prefixed category is held up by a product that was itself in the
  delete set.
- 20, every MIXED entity survived.

**The card's last bullet could not be implemented as written, and the deviation
is recorded on the card.** It asked that a leftover TEST category be permitted
"when every referencing row is itself in-scope test data". `products.category_id`
is the only reference to `categories` in the schema, and it is `RESTRICT` and
`NOT NULL`, so referencing rows are products and nothing else. If every
referencing product is in scope, they are all deleted, the category is then
unreferenced, and the same bullet's assertion forbids exactly that. The coherent
rule was applied and both halves asserted: 18 catches the unreferenced leftover,
19 catches the leftover held by a row that should have gone. The surviving
categories and the rows holding them are printed either way, with a verdict
column.

**Assertion 20 is the one worth pointing at.** The old file printed
`PRE MIXED left alone` and `POST MIXED left alone` and read both from the same
frozen temporary table, so the two agreed whatever the run did, including a run
that deleted every mixed order. The new one counts survivors in the live tables,
and section 6 shows a mutated copy failing it.

**The gate is a plain SELECT and has to stay one.** It casts a message to
integer on the failing path, which raises. The obvious alternative,
`DO $$ ... RAISE EXCEPTION ... $$`, was rejected: `DoStmt` carries its body as an
opaque string literal, so `parse-reset-sql.mjs`, the only thing standing between
this file and the client's data, could no longer see an INSERT or a DROP written
inside it. A prettier error message is not worth a hole in the inspection. The
cast target is a subquery rather than a literal because PostgreSQL constant-folds
a literal cast at planning time and would raise on the passing path; verified on
16.15.

---

## 5. Step 3: the parser, extended and not weakened

**CHECK 4 needed no change, and neither did CHECK 3.** The assertion block is
built from `CreateTableAsStmt` and `SelectStmt`, kinds the file already allowed,
so `ALLOWED_KINDS` and `FORBIDDEN_KINDS` are byte-identical to what was on
`main`. No halt was required because no assertion needed a forbidden kind.

**CHECK 9 was added.** Without it, deleting the gate leaves a file that runs all
eleven deletes and commits whatever it found, and checks 1 through 8 all still
pass. It asserts the assertions table is built, that the last statement before
COMMIT is the gate, and that the gate can actually raise.

```
CHECK 1 parse: OK, 36 statements, PostgreSQL grammar 180004
CHECK 2 delete count: OK, 11
CHECK 3 mutations: OK, the only data-changing statement kind is DeleteStmt
CHECK 4 forbidden kinds: OK, no TRUNCATE, no DROP, no INSERT, no UPDATE, no ALTER, no GRANT
CHECK 5 where clauses: OK, all 11 deletes are guarded
CHECK 6 delete targets: OK, 11 distinct tables, all inside the expected set
CHECK 7 created tables: OK, 15 created, all TEMPORARY
CHECK 8 atomicity: OK, one BEGIN first, one COMMIT last, every delete inside them
CHECK 9 self-asserting: OK, rc_reset_assertions is built and the gate is the last statement before COMMIT
parse-reset-sql: 9 checks passed, scripts/reset-test-data.sql is safe to hand to the owner.
```

CHECK 9 proven able to fail, on two mutated copies:

```
gate removed:  CHECK 9 self-asserting: the gate before COMMIT cannot raise, no
               integer cast found, so a failed assertion would commit anyway
               parser exit 1
cast removed:  same failure, parser exit 1
restored:      9 checks passed
```

---

## 6. The proof: a real PostgreSQL, which this file had never seen

P2-15 shipped its SQL with the card admitting "there is no PostgreSQL binary and
no running Docker on this machine, so no parser has seen this SQL". Docker is on
this machine now, and the owner confirmed it during this session.

**All twelve migrations 0001 to 0012 apply UNMODIFIED onto stock `postgres:16`**
after a shim for the objects Supabase provides: roles `anon`, `authenticated`,
`service_role`; schemas `auth` and `storage`; `auth.users`; `auth.uid()`;
`auth.role()`; `storage.buckets`; `storage.objects`. That is the requirement
worth recording: with those nine objects, this repository's schema is
reproducible locally by anyone, with no credentials and no Supabase project.
`docker cp` kills Docker Desktop on this machine, so the repo is bind mounted
read only and psql is fed on stdin.

The fixture reproduces real products, `TEST-` residue, the three CRITIC-RACE
leftovers on category `e88b3bfa-5e15-455f-b78f-b4801da19506`, both directions of
the EXT- evidence chain, a genuinely MIXED order, and a `TEST-` category held by
a REAL product.

### 6.1 The pass path, exit 0

```
 PRE products               |         7
 PRE inbound_orders         |         2
 PRE outbound_issues        |         1
 PRE order_lines            |         3
 PRE outbound_lines         |         1
 PRE batches                |         1
 PRE reminders              |         1
 PRE status_history         |         3
 PRE extraction_drafts      |         1
 PRE extraction_draft_lines |         1
 PRE categories             |         1
 PRE MIXED left alone       |         1
(12 rows)

 PRE products by prefix CRITIC-RACE-    |         2
 PRE products by prefix CRITIC-RACE2-   |         1
 PRE products by prefix TEST-           |         3
 PRE products EXT- from a test document |         1
(4 rows)

            sku             |      name      
----------------------------+----------------
 CRITIC-RACE-1787702980667  | Race product 1
 CRITIC-RACE-1787702980999  | Race product 2
 CRITIC-RACE2-1787703111222 | Race product 3
 TEST-DASH-mt8ztoqf         | TEST dashboard
 TEST-IN-persist-ab12       | TEST inbound
 TEST-OUT-lower-cd34        | TEST outbound
(6 rows)
```

```
 POST in-scope products remaining                     |         0
 POST in-scope inbound_orders remaining               |         0
 POST in-scope outbound_issues remaining              |         0
 POST in-scope order_lines remaining                  |         0
 POST in-scope outbound_lines remaining               |         0
 POST in-scope batches remaining                      |         0
 POST in-scope reminders remaining                    |         0
 POST in-scope status_history remaining               |         0
 POST in-scope extraction_drafts remaining            |         0
 POST in-scope extraction_draft_lines remaining       |         0
 POST in-scope categories remaining                   |         0
 POST orphan batches                                  |         0
 POST orphan order_lines                              |         0
 POST orphan outbound_lines                           |         0
 POST orphan extraction_draft_lines                   |         0
 POST orphan status_history                           |         0
 POST products remaining with a registered prefix     |         0
 POST unreferenced prefixed categories remaining      |         0
 POST prefixed categories held by an in-scope product |         0
 POST MIXED entities surviving                        |         1
 POST products remaining in total                     |         4
(21 rows)

     kind      |   reference   
---------------+---------------
 inbound_order | INT-2026-0003
(1 row)

     surviving_category      |     held_by_sku     |         held_by_name          |             verdict             
-----------------------------+---------------------+-------------------------------+---------------------------------
 TEST-Categorie-held-by-real | RC-REAL-IN-TEST-CAT | Produs real in categorie test | out of scope, legitimately kept
(1 row)
```

```
 ord |                                       name                                        | expected | actual | result 
-----+-----------------------------------------------------------------------------------+----------+--------+--------
   1 | in-scope products fully consumed by its DELETE (PRE 7, remaining 0)               |        0 |      0 | PASS
   2 | in-scope inbound_orders fully consumed by its DELETE (PRE 2, remaining 0)         |        0 |      0 | PASS
   3 | in-scope outbound_issues fully consumed by its DELETE (PRE 1, remaining 0)        |        0 |      0 | PASS
   4 | in-scope order_lines fully consumed by its DELETE (PRE 3, remaining 0)            |        0 |      0 | PASS
   5 | in-scope outbound_lines fully consumed by its DELETE (PRE 1, remaining 0)         |        0 |      0 | PASS
   6 | in-scope batches fully consumed by its DELETE (PRE 1, remaining 0)                |        0 |      0 | PASS
   7 | in-scope reminders fully consumed by its DELETE (PRE 1, remaining 0)              |        0 |      0 | PASS
   8 | in-scope status_history fully consumed by its DELETE (PRE 3, remaining 0)         |        0 |      0 | PASS
   9 | in-scope extraction_drafts fully consumed by its DELETE (PRE 1, remaining 0)      |        0 |      0 | PASS
  10 | in-scope extraction_draft_lines fully consumed by its DELETE (PRE 1, remaining 0) |        0 |      0 | PASS
  11 | in-scope categories fully consumed by its DELETE (PRE 1, remaining 0)             |        0 |      0 | PASS
  12 | orphan batches is 0 (found 0)                                                     |        0 |      0 | PASS
  13 | orphan order_lines is 0 (found 0)                                                 |        0 |      0 | PASS
  14 | orphan outbound_lines is 0 (found 0)                                              |        0 |      0 | PASS
  15 | orphan extraction_draft_lines is 0 (found 0)                                      |        0 |      0 | PASS
  16 | orphan status_history is 0 (found 0)                                              |        0 |      0 | PASS
  17 | no product with a registered SKU prefix remains (found 0)                         |        0 |      0 | PASS
  18 | no prefixed category with zero referencing products remains (found 0)             |        0 |      0 | PASS
  19 | no prefixed category is held by an in-scope product (found 0)                     |        0 |      0 | PASS
  20 | every MIXED entity survived (PRE 1, surviving 1)                                  |        1 |      1 | PASS
(20 rows)

            assertion_gate            
--------------------------------------
 ALL 20 ASSERTIONS PASSED, COMMITTING
(1 row)
```

**The survivors, and every one of them is the right answer:**

| survived | why it had to |
|---|---|
| `RC-TIGLA-01`, `RC-SURUB-01` | real products |
| `RC-REAL-IN-TEST-CAT` | a real product filed under a `TEST-` category |
| `EXT-real-abc123` | a real flagged product. **The evidence chain correctly did not catch it** |
| category `TEST-Categorie-held-by-real` | held by a real product, printed with verdict `out of scope, legitimately kept` |
| order `INT-2026-0003` | MIXED. Survived, kept its real line, lost its test one |
| the real supplier draft | not a `TEST-` filename and not attached to an in-scope order |

**And what went:** the three CRITIC-RACE products, the three `TEST-` products,
`EXT-tigla-de01` (the flagged product created by confirming a `TEST-` document),
category `TEST-Categorie`, and every line, batch, reminder, history row and
draft descending from them.

### 6.2 The negative paths, each a mutated copy against a fresh fixture

Every one exits 3, names the failing assertions, and rolls back completely.

| mutation | assertions that failed | exit | after rollback |
|---|---|---|---|
| products and categories DELETEs neutered | 1, 11, 17, 19 | 3 | 11 products, fixture intact |
| status_history DELETE neutered | 8, 16 (orphan status_history, found 3) | 3 | 11 products, 4 history rows |
| inbound_orders DELETE widened to take MIXED orders | 20, `every MIXED entity survived (PRE 1, surviving 0)` | 3 | 11 products |
| categories DELETE neutered | 11, 18 | 3 | 11 products |

The third row is the point of the whole card: **the old file could not have
failed that check by construction.**

### 6.3 Idempotency

Run twice against the same database: the second run is a clean no-op, every PRE
count 0, all 20 assertions pass, survivors unchanged at 4 products and 2
categories.

---

## 7. Step 4 did not run, and this is why

**The run is eleven DELETE statements against the client's project.** Four
things point the same way:

1. **CLAUDE.md 8.6**: "A migration containing `DROP TABLE`, `TRUNCATE` or
   `DELETE` is never auto-applied. No exceptions, no judgement call, no 'it is
   obviously safe here'." CLAUDE.md 13 repeats it for unattended runs.
2. **The file's own header**, unchanged since P2-15 authored it: "WHO RUNS IT:
   Ivan, by hand, in the Supabase SQL editor."
3. **The authority the dispatch cited does not exist.** No ledger execution
   ruling is in `decisions/inbox.md`. Section 2.
4. **The dispatch's account of what had already happened does not match the
   repository.** Section 2.

Point 4 is the one that decides it. An irreversible delete against live client
data, authorised by a dispatch whose two factual premises both turn out not to
be in the record, is the exact case the rule exists for. No connection was
attempted.

**This is not a refusal to finish the card, it is the card's own last step being
an owner action.** Everything that made that step risky has been removed: the
script no longer asks the person running it to read a grid and decide. Run it
and it either commits or tells you which assertion stopped it.

```
psql "$RC_DB_URL" -v ON_ERROR_STOP=1 -f scripts/reset-test-data.sql
```

Or paste the file whole into the Supabase SQL editor; a failed assertion aborts
the transaction there too and nothing is committed.

**Expected outcome, from the dispatch:** 3 products and 1 category removed,
every other count already 0. If the CRITIC-RACE products are still active on
their `TEST-` category, assertion 18 will also want that category gone, which
matches. If any count disagrees, the file rolls itself back and names the
assertion, and that is a finding rather than an accident.

RST-01 is `blocked`, `blocked_on: ivan`, with the structured question on the
card. P2-15 is already the card for the owner's run and is already blocked on
him; folding step 4 into it is option (c) on the question.

---

## 8. What a reader should carry forward

**A selector goes stale every time anything invents a new way to create a row,
and twice now that thing was not the test suite.** The registry is the shape
that survives it: a prefix found by forensics is a row with its provenance, not
an edit in nine places.

**An assertion that reads a frozen snapshot on both sides cannot fail.** For
every assertion, ask what edit would make it fail. If the answer is "none", it
is decoration. Four mutated copies is what turns that question into an answer.

**The schema is now reproducible locally.** Nine shim objects and stock
`postgres:16` run all twelve migrations unmodified. That is what let a
destructive file aimed at production be proven before the owner ran it, and it
is the capability escalation E3 was asking about.

Four LEARNINGS entries were appended, including two traps that cost time: CASE
does not protect a literal cast from constant folding, and appending `and false`
to an `A or B` predicate only neuters `B`.
