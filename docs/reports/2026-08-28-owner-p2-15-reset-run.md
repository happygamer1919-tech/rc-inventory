# OWNER: the P2-15 production test-data reset, executed 2026-08-28

**Date:** 2026-08-28 (UTC)
**Executed by:** Ivan, the owner, personally.
**Card:** P2-15
**Script:** `scripts/reset-test-data.sql`, at the revision on `main` before
RST-01 (`f8e9078`) corrected it.
**Outcome:** COMMITTED. 1,221 rows deleted. One acceptance line returned 1
against an expected 0, ratified as R-048.

---

## 0. What this file is, and what it is not

**This is a record written after the fact, and it says so on its face.** The run
happened on 2026-08-28. Ivan executed it himself, read both grids and committed.
The outcome was ratified in the strategy chat and never committed to this
repository, so for most of that day the only evidence that it had happened was a
conversation. Two later dispatches assumed the record existed; it did not.
Card REC-01 exists to close that gap, and this file is its main artefact.

**Nothing here was re-run to produce it.** No terminal opened a database
connection at any point while writing this. The grids below are the owner's,
transcribed verbatim. What a terminal did contribute is section 4: an arithmetic
check of the grids against each other and against the script on `main`, which is
the part a reader can verify without trusting anyone's memory.

**Why it is filed under `owner` and not `executor`.** CLAUDE.md 9b names the
roles a report can carry. This run had no terminal in it. The person who ran it
is named at the top because a record of a destructive run against a client's
database that does not say who ran it is not a record.

---

## 1. The session

Ivan connected with `psql` and ran the file inside an **explicit transaction**.
He read the pre-check grids, let the deletes run, read the post-check grid and
the mixed-orders list, and issued the commit himself. That shape matters and is
the reason R-047 could be written at all: the transaction was open across the
whole file, so a rollback was available at every point up to the last statement,
and nothing was committed that he had not seen.

It also names the weakness R-047 then removed. **The decision to commit was his,
taken from a grid, at the end of a long transaction, having been told in advance
what the numbers should be.** One of the numbers was not what he had been told to
expect, and the run committed anyway. It committed correctly, and section 3
explains why, but "the operator judged it correctly this time" is not a control.
RST-01 replaced the judgement with assertions the script evaluates itself.

---

## 2. The grids, verbatim

### 2.1 PRE, twelve rows

```
 PRE products                 302
 PRE inbound_orders           179
 PRE outbound_issues           36
 PRE order_lines              179
 PRE outbound_lines            36
 PRE batches                  131
 PRE reminders                  0
 PRE status_history           358
 PRE extraction_drafts          0
 PRE extraction_draft_lines     0
 PRE categories TEST            1
 PRE MIXED left alone           0
```

### 2.2 PRE, the product set split in two

```
 PRE products TEST- sku       302
 PRE products EXT-              0
```

### 2.3 The DELETE counts, in the order the file runs them

```
 status_history           358
 extraction_draft_lines     0
 extraction_drafts          0
 batches                  131
 outbound_lines            36
 order_lines              179
 outbound_issues           36
 inbound_orders           179
 reminders                  0
 products                 302
 categories                 0
```

### 2.4 POST, eleven rows

```
 POST products TEST-                  0
 POST products EXT- in scope          0
 POST extraction_drafts in scope      0
 POST orphan extraction_draft_lines   0
 POST categories TEST-                1
 POST orphan batches                  0
 POST orphan order_lines              0
 POST orphan outbound_lines           0
 POST orphan status_history           0
 POST products remaining              3
 POST MIXED left alone                0
```

### 2.5 The mixed-orders list

```
(0 rows)
```

**COMMIT confirmed by the owner.**

---

## 3. The one deviation, and why it is not a defect

`POST categories TEST-` returned **1** against an acceptance line of **0**.

**The cause is the schema doing its job.** `products.category_id` is `NOT NULL`
and `ON DELETE RESTRICT`, and it is the only reference to `categories` anywhere
in the schema. The category delete carries, deliberately:

```sql
and not exists (select 1 from public.products p where p.category_id = c.id)
```

so that a category still in use is **skipped rather than raising an error that
rolls the entire file back**. Three products were still pointing at it. It was
skipped, exactly as written.

**The three products are the ones the selector could not see.** SKU prefixes
`CRITIC-RACE-` and `CRITIC-RACE2-`, `active=f`, created by hand from two live
CRITIC sessions at the wave 1 boundary on 2026-08-25 and 2026-08-26. They are in
no committed test source at any commit in this repository's history, because a
session that types into a screen leaves nothing in `tests/`. `POST products
remaining 3` is those three and nothing else.

**The real finding is a reporting defect, not a data defect.** The pre-check
counted `categories where name like 'TEST-%'`; the delete counted that **minus
the ones still referenced**. Two different sets. So a skip could never appear as
a discrepancy the pre-check had predicted, and the operator learned about it only
in the POST grid, after the deletes had run. Nothing wrong was deleted and
nothing wrong survived. The file simply could not warn him in advance.

Ratified as **R-048**. The correction is RST-01, merged as `f8e9078`.

---

## 4. The grids check out against each other, and against the file

This is the part that does not rest on anyone's memory. Three independent
consistency checks, all of which pass.

**4.1 The DELETE counts sum to 1,221.**

`358 + 0 + 0 + 131 + 36 + 179 + 36 + 179 + 0 + 302 + 0 = 1221`

That figure was quoted separately, in a different dispatch, before this record
was written. It was not derived from the grids above; it agrees with them.

**4.2 Ten of the eleven deletes consumed their PRE count exactly, and the
eleventh is the deviation.**

| table | PRE | DELETED | verdict |
|---|---|---|---|
| `status_history` | 358 | 358 | consumed exactly |
| `extraction_draft_lines` | 0 | 0 | consumed exactly |
| `extraction_drafts` | 0 | 0 | consumed exactly |
| `batches` | 131 | 131 | consumed exactly |
| `outbound_lines` | 36 | 36 | consumed exactly |
| `order_lines` | 179 | 179 | consumed exactly |
| `outbound_issues` | 36 | 36 | consumed exactly |
| `inbound_orders` | 179 | 179 | consumed exactly |
| `reminders` | 0 | 0 | consumed exactly |
| `products` | 302 | 302 | consumed exactly |
| `categories` | 1 | 0 | **1 left, and it is the deviation in section 3** |

The single row that fails the consumption rule is the single row R-048 ratifies.
There is no second anomaly hiding in the grids.

**4.3 The product arithmetic closes.** `PRE products` 302, all of it
`PRE products TEST- sku` with `PRE products EXT- 0`. 302 deleted.
`POST products remaining` 3, and `POST products TEST- 0` confirms none of the
survivors carries the `TEST-` marker. The three survivors are the CRITIC-RACE
rows, which the pre-RST-01 selector never matched and therefore never counted.

**4.4 What the grids also prove was not touched.** `PRE MIXED left alone 0` and
`POST MIXED left alone 0`, with an empty mixed-orders list: there were no
genuinely mixed orders in the project, so the one class of data this file
promises never to delete was not exercised. Every orphan check returned 0, so
nothing was left pointing at a row that had gone.

---

## 5. What this changed, and what is still outstanding

**Changed.** The client's project no longer carries 302 test products, 179
inbound orders, 36 outbound issues and their lines, batches and history. Gate G9
asks Mihai to complete a full cycle on `/inventar`, and that screen no longer
opens on a catalogue of `TEST-DASH-` rows.

**Still outstanding, and it is not this card.** Three `CRITIC-RACE` products and
one `TEST-` category remain. Removing them is RST-01's run, which is
`blocked_on: ivan`. Under R-047 a terminal may now perform it, because the
corrected file asserts its own outcome and commits only on all-pass.
