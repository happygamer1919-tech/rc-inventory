# EXECUTOR, 2026-09-01: P3-05b, products.supplier_name dropped

Card **P3-05b**. Branch `card/p3-05b`. **Applied and committed. Exit 0.**
Authority: **R-082**, plus the owner's ratification of 2026-09-01.

---

## 1. THE CARD SHIPPED ON A VACUOUS ZERO

**This card did not verify a backfill.**

```
select count(*) from public.products
 where supplier_id is null and supplier_name is not null
   and btrim(supplier_name) <> '';                       -> 0
select count(*) from public.products;                    -> 0
```

The first zero is true because the second is. 0019's backfill created **zero
suppliers and linked zero products**, because the catalogue was empty when it
ran. The folding logic has never matched a real row.

Ratified on exactly that basis: being wrong costs nothing today, and the
alternative is a second production apply against a catalogue holding real data.

## 2. One column name, three tables, one drop

`supplier_name` exists on **`products`**, **`inbound_orders`** and
**`extraction_drafts`**. Only the first has a record to replace it
(`products.supplier_id`, from 0019). The other two are unrelated columns with no
supplier record behind them, and the assertion checks **both survive**, so a drop
aimed at the wrong table cannot pass.

Verified after the commit:

```
products.supplier_name            -> ABSENT
inbound_orders.supplier_name      -> present, untouched
extraction_drafts.supplier_name   -> present, untouched
```

## 3. `supplier_id` stays NULLABLE, and that is the difference from P3-04b

P3-04b made `outbound_issues.project_id` NOT NULL. This card does **not** do the
equivalent, because the cases are not equivalent: **a product may genuinely have
no supplier**, and 0019's own header says the backfill creates nothing for an
empty name. An outbound issue must go somewhere; a catalogue entry need not come
from anywhere.

## 4. The apply

One file, one transaction, **12 of 12 assertions**, 13:58:29Z to 13:58:32Z.

### The first attempt rolled back, and it was the same defect class a third time

The reconciliation grid named `client_name`  -  a column **migration 0026 dropped
in the previous batch**. The grid keyed off the set of columns the *current*
batch declares it will drop, and a column dropped earlier is not in that set.

**A batch's declarations describe what it CHANGES, never what EXISTS.** Both the
grid and the supplier reconciliation now build themselves from
`information_schema` at run time, so they adapt to the live schema regardless of
which batch changed it. That is the correct fix, and the two earlier instances of
this confusion had been patched at the symptom.

### Declared destructive statements, per 8.6

```sql
drop function if exists public.backfill_product_suppliers(integer);
alter table public.products drop column supplier_name;
```

No `DROP TABLE`, `TRUNCATE` or `DELETE`, proven by parsing before anything ran.
Row counts identical before and after.

### Verified from a fresh connection

| check | result |
|---|---|
| `products.supplier_name` | **absent** |
| `inbound_orders` / `extraction_drafts` `supplier_name` | present, untouched |
| `products.supplier_id` | present, `is_nullable = YES` |
| `backfill_product_suppliers` | dropped |
| ledger | 27 rows, highest `0027` |
| row counts | unchanged: products 0, suppliers 0, categories 18, profiles 3 |

## 5. Coverage deleted here, rebuilt by FOLD-01

The backfill fixture in `assertions/0019_suppliers.sql` proved the fold picked the
most common spelling, respected its cap, and was idempotent. It could not be
repaired: 0027 drops both the column it wrote to and the function it drove.

**FOLD-01 rebuilds what survives**, through `find_supplier_by_folded_name`, which
0027 leaves standing and which the product write path actually calls. The **cap**
has no analogue anywhere and is recorded as *untestable*, not untested.

The loss is named inside `assertions/0019_suppliers.sql` itself rather than
deleted quietly, so anyone reading that file sees what stopped being proved and
why.

## 6. Code changes

`lib/data/products.ts` reads the name through `suppliers(name)` and lost its
pre-phase-3 column list. `lib/data/product-actions.ts` writes no name at all:
`resolveSupplier` returns a `supplier_id` and nothing else, and the pre-phase-3
branch went with the column it wrote to.

## 7. Two local artifacts removed from tracking

`supabase/.branches/_current_branch` and `supabase/.temp/cli-latest` were tracked
by a `git add -A` in P3-04b. They are Supabase CLI state written by
`supabase start` on each machine and describe nothing about the project. Removed
from the index and added to `.gitignore`.
