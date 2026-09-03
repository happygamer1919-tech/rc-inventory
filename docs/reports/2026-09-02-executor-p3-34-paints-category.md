# EXECUTOR, 2026-09-02: P3-34, the nineteenth category

Card **P3-34** (Andre's EXT-05). Branch `card/p3-34`.
**Migration added:** `supabase/migrations/0029_category_paints.sql`, **authored and merged, NOT applied**, registered under this card in `docs/migrations/APPLY-LOG.md`.

---

## 1. What Andre is waiting on

`Vopsele, lacuri și solvenți`, `sort_order` 19. The owner's count: **five or six lines across three of the sample documents** claim this category.

**R-057's enum-ordering rule is satisfied in the direction it requires:** our side accepts the value **before** he emits it. The confirmation goes to him on landing.

## 2. Why it shipped before P3-33

The owner resequenced EXT-05 ahead of EXT-04 on 2026-09-02, and #160 made that a `depends_on` edge rather than a note, because ids sort lexically and `P3-33` sorts **before** `P3-34`. The board handed out P3-34 first, unaided. With this card shipped, `P3-33` is eligible again:

```
P3-33 now eligible? true
```

That is the resequence working as a mechanism rather than as something somebody had to remember.

## 3. The check learned that the vocabulary is seeded by more than one migration

`check-categories.mjs` compares `docs/contracts/categories.json` against the committed migration - **two files holding one fact**, which is the card's own default. It read `0007_seed_categories.sql` alone, so a nineteenth row in a new file read as *"the JSON was hand-edited"*:

```
CHECK 6: "Vopsele, lacuri și solvenți" is in categories.json and NOT in the migration.
```

It now reads an **explicit list** of the migrations that touch `public.categories`, in apply order. **Not a glob:** a migration that touches that table should be a line in this diff rather than a silent widening of what the check will accept.

**`EXPECTED_COUNT` stays an explicit number and was deliberately not derived from the JSON.** Derived, it would agree with itself whatever the JSON said - a check whose passing path is reachable without the condition being true. That is the class PROVE-01 named the same day, and this is exactly the shape that falls into it.

## 4. The assertion checks the ORDER, not only the count

`sort_order` 19 is the next one, never an insertion into the middle: reordering the existing eighteen would move every category on every screen in a card nobody asked to do that in.

`assertions/0029_category_paints.sql` asserts nineteen rows, the new one present with its diacritics, that it is **last**, that `1..19` is contiguous, and that **`sort_order` 1 and 18 still hold the names they held**. Two anchors rather than one: a shift of the whole block moves both, a middle insertion moves only the second.

The first draft anchored `sort_order` 1 to the wrong name and the assertion **failed on the shim**, which is the assertion doing its job on its first run.

## 5. Acceptance, run

```
$ npm run check:categories
  CHECK 1 categories.json parses: OK, 19 entries
  CHECK 2 count: OK, 19
  ...
  check-categories: 8 checks passed.

$ npm run check:migrations
  applied 0029_category_paints.sql
  asserted 0029_category_paints.sql
  13 assertion files passed        (29 migrations against a bare postgres:16)

$ npx tsc --noEmit                 exit 0
$ npm run check:removal-safety     OK, 2 pending, no reader remains on main
$ npm run check:pending-schema-reads  OK, 2 pending, 12 files exempt with a reason
```

## 6. Not in this pull request

**The apply.** Merging a migration file changes one text file in a git repository and changes nothing in any database. `0029` is registered pending under this card, alongside `0028`, and the apply is a separate act with its own three phases and its own journal.

**Until it is applied, the category is live on the validator and not in the database.** That distinction is what the pending register exists to hold, and it is the honest thing to tell Andre: our side accepts the value now, and the row lands on the day the batch is applied.
