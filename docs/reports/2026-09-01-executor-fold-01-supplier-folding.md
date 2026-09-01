# EXECUTOR, 2026-09-01: FOLD-01, supplier spelling folding re-tested

Card **FOLD-01**, authored by this PR. Branch `card/fold-01`.
**No migration, no production connection, no application code.**

---

## 1. Why this card exists

P3-05b deleted coverage and said so. The backfill fixture in
`assertions/0019_suppliers.sql` inserted six spellings of one supplier, ran
`backfill_product_suppliers()`, and proved the fold picked the most common
spelling, respected its cap, and was idempotent. It was the strongest test in
that directory.

It could not be repaired. Migration 0027 dropped **both**
`products.supplier_name` and `backfill_product_suppliers(integer)`, so the
fixture had nowhere to write and no function to drive.

`public.find_supplier_by_folded_name(text)` **survives 0027** and is what the
product write path calls before creating a supplier, so it is where the folding
behaviour still lives.

## 2. One of the three behaviours could not be rebuilt, and I said so first

| behaviour the deleted fixture proved | status |
|---|---|
| folding equivalence | **covered** |
| most-common-variant selection | **covered by its surviving analogue**, the tie-break |
| the cap | **untestable, not untested** |

**Most-common-variant selection** was the backfill choosing the most *frequent*
spelling as the stored name. Frequency is no longer counted anywhere. What
decides today is the lookup's own `order by s.active desc, s.created_at limit 1`,
which is the rule that determines **which record a spelling resolves to**. That
is the surviving form of the same question and it is asserted in both directions.

**The cap** (`p_max_new integer default 20`) bounded how many suppliers one
backfill run could create. That function is gone and nothing else has a cap,
because the write path resolves one name per save by construction. An assertion
would pass vacuously and read, to anyone counting coverage, as though the
protection were still there. The assertion file carries that reasoning in place
of a test, and points whoever builds a bulk import at the git history of 0019.

## 3. What is asserted

```
npm run check:migrations
  27 migrations applied unmodified to postgres:16
  11 assertion files passed, including fold-01_supplier_folding.sql
EXIT=0
```

1. **Folding equivalence.** `Bricolaj SRL`, `bricolaj srl`, `BRICOLAJ SRL` and
   `  Bricolaj SRL  ` all resolve to one record. An unaccented `DEPOZIT TIGLA`
   finds `Depozit Țiglă`, which is the half a Romanian catalogue needs.
2. **The tie-break, both halves.** An **active** supplier beats an older
   **deactivated** one that folds to the same name, which is the opposite of
   what `created_at` alone would say. Among equally active rows the **oldest**
   wins.
3. **Idempotency.** The lookup writes nothing (supplier count unchanged across
   three calls) and returns the same row on repeated identical calls.
4. **An unknown name returns no row**, because the write path reads "no row" as
   permission to create, so a lookup that invented a match would attach products
   to the wrong supplier.

## 4. A defect in my own fixture, found by running it

The first version assumed `fold_text` normalised punctuation, and expected
`Bricolaj SRL` and `BRICOLAJ S.R.L.` to fold together. **They do not.**

```sql
lower(regexp_replace(btrim(translate(value, 'ăâîșțĂÂÎȘȚşţŞŢ', 'aaistAAISTstST')), '\s+', ' ', 'g'))
```

It folds case, diacritics and whitespace runs, and touches nothing else. `SRL`
and `S.R.L.` are two different suppliers, and the write path will create a second
record for the second spelling.

That is now **asserted explicitly** as a documented boundary rather than left
implicit, because the obvious assumption is the wrong one and the word "folding"
invites it. If punctuation should fold, that is a change to `fold_text` with its
own card, and it would need a backfill for records already split by it.

## 5. Naming

The file is `fold-01_supplier_folding.sql`, not a migration number. Everything
else in that directory is named after the migration whose objects it asserts;
this one belongs to a **card**, because it defends a behaviour spanning 0017's
`fold_text` and 0019's lookup after the migration that carried its proof was
spent. `apply.mjs` runs every `.sql` there in filename order and assumes nothing
about the names.
