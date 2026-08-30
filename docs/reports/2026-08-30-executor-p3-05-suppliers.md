# EXECUTOR: P3-05, suppliers become records. Twelve mutations caught on the first run, and one tie the card did not decide.

**Date:** 2026-08-30
**Role:** EXECUTOR
**Branch:** `card/p3-05-suppliers`, cut from `origin/main` at `f43f538`
**Card:** P3-05
**Migration files added:** `supabase/migrations/0019_suppliers.sql`

---

## 0. Boot

Phase 3 board read at `f43f538`. P3-01 through P3-04 `shipped`, so **P3-05** is
the lowest-id eligible card, `depends_on []`. Claimed as `executor` through PR
#111 before the work began.

---

## 1. What shipped

`public.suppliers`, deliberately the same shape as `public.clients` down to the
shared `client_type` enum, plus `products.supplier_id`, its index, and a backfill
that **creates rows**. `products.supplier_name` is untouched; the drop is
P3-05b.

**This backfill is the one that creates.** P3-04's matched typed text against
records that already existed; here `products.supplier_name` is the **only**
record of a supplier anywhere in the system, so there is no table to match
against and nothing to reconcile to. One supplier per distinct folded name.

---

## 2. The tie the card did not decide

P3-05 says the stored name is "the most common original spelling" and says
nothing about a tie. The first version broke ties alphabetically, and its own
fixture caught it:

```
ERROR:  P3-05: expected the most common spelling of each supplier,
        found Bricolaj SRL|Tigla Mold SRL
```

`Tigla Mold SRL` and `Țiglă Mold SRL` are used once each, and **T sorts before
Ț**, so the alphabetical rule stores the ASCII spelling. That is the one
somebody typed in a hurry, not the company's name.

The order is now **most used, then most diacritics, then alphabetical**, so two
runs on the same data always agree and the stored name is the one a human will
recognise. Mutation 5 removes the diacritic term and is caught.

---

## 3. The twenty-supplier limit is enforced, not remembered

P3-05 says that above 20 distinct names the card blocks on Ivan with the list
rather than creating twenty records nobody has reviewed.

**That is a raise inside the transaction**, with the count and the list in the
message, so the whole apply rolls back and nothing half-decided survives. The
alternative was an instruction somebody has to remember at 2am while running a
three-phase apply.

**The premise the card asked to be checked cannot be checked at this end.** The
catalogue on a fresh container is empty, so "the catalogue is close to empty" is
neither true nor false here. Enforcing it moves the halt to the apply, with the
list in the message, which is where the real catalogue is.

**The limit is a parameter**, which is what makes the refusal testable: five new
suppliers under a limit of three raises and **writes nothing**, and the same call
under a limit of five succeeds. A fixture of twenty-one products to prove one
branch would have been twenty rows of noise.

---

## 4. The write path had to learn the same fold, or the card undoes itself

The product form leaves the supplier list **open**: a new supplier is typed into
the same combobox, because entering a product must not become a two-screen task.
So the write path has to answer "is this name already a supplier?" before
creating one.

**Somebody typing "bricolaj srl" the day after the backfill created "Bricolaj
SRL" would otherwise make a second supplier and undo exactly what this card did.**

`public.find_supplier_by_folded_name` is a SQL function using the **same**
`public.fold_text` the backfill uses. Doing it in TypeScript would be two
implementations of one rule, drifting. The spec proves it end to end: creating a
second product with the same supplier name in a different case and with different
spacing leaves the filter listing that supplier **exactly once**.

**The stored `supplier_name` comes from the supplier row, never from what was
typed** — the same rule 0018 applies to the outbound destination, for the same
reason: while both representations exist they must not say different things.

---

## 5. The inventory filter was quietly wrong before this card

It compared `p.supplierName` to a string picked from a list of **distinct typed
names**. Two spellings of one supplier were two options, and choosing either
found half that supplier's products. It compares `supplier_id` now.

That is not a defect this card introduced, and it is not a defect anybody would
have reported: the filter always returned rows, just not all of them.

---

## 6. Twelve mutations, all caught on the first run

The first card in this wave where nothing had to be fixed in the assertions.

| # | mutation | error |
|---|---|---|
| 1 | `suppliers.type` is `text`, not the shared enum | `must reuse public.client_type, found text` |
| 2 | `supplier_id` added NOT NULL | `null value in column "supplier_id" ... violates not-null` |
| 3 | the foreign key CASCADES | `expected ... ON DELETE RESTRICT, found ... CASCADE` |
| 4 | the least common spelling wins | `found   bricolaj   srl \|Țiglă Mold SRL` |
| 5 | the diacritic tie-break removed | `found Bricolaj SRL\|Tigla Mold SRL` |
| 6 | grouping on the raw name, not the fold | `expected 2 suppliers created from 6 spellings, found 6` |
| 7 | a blank `supplier_name` creates a row | `expected 2 ... found 3` |
| 8 | the twenty-supplier refusal never fires | `5 new suppliers were created under a limit of 3` |
| 9 | the linking idempotency guard removed | `a second run linked 8 products, so the backfill is not idempotent` |
| 10 | the lookup compares raw names | `the folded lookup did not find the existing supplier, got nothing` |
| 11 | a delete policy added | `found DELETE,INSERT,SELECT,UPDATE` |
| 12 | RLS never enabled | `expected rowsecurity true on public.suppliers, found false` |

**Mutations 4 and 5 are the ones worth keeping.** Both produce a supplier list
that looks entirely plausible and is subtly wrong, and neither is visible in a
diff.

**Mutation 9 is the one that protects reconciliation.** During the apply somebody
will merge two suppliers by hand, and the backfill must not undo it. The fixture
repoints a product at a different supplier, re-runs the backfill, and requires
the correction to survive.

---

## 7. Checks

| check | result |
|---|---|
| `ls supabase/migrations/0019_suppliers.sql` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run check:migrations` | exit 0, 19 files, 5 assertion files passed |
| twelve mutations | all twelve caught, first run |
| `node docs/board/validate-board.mjs` | PASS, 0 violations |
| `npm run check:conflict-residue` | 3 checks passed |
| APPLY-LOG pending register | 19 files, 7 pending, each in exactly one place |
| em dash or en dash in any file touched | zero |
| secret staged | none |

---

## 8. Production writes

**None.** One new pending line, no apply entry, no row in
`docs/PRODUCTION-WRITES.md`.

---

## 9. Learnings appended

**None.** This card hit no defect that was not caught by its own fixture on the
first run, and the tie-break correction is recorded on the card and in the
migration rather than as a general lesson: it is a decision about Romanian
spelling, not a rule about building software. `CLAUDE.md` section 9 says a card
that hit no defects appends nothing and says so.

---

## 10. Where wave 1 stands

Five cards shipped: clients, contacts, projects, the issue destination, and
suppliers. **Seven migration files pending, none applied**, none containing a
`DROP TABLE`, `TRUNCATE` or `DELETE`.

**Wave 1's remaining two cards are both blocked by design.** P3-04b and P3-05b
drop the old text columns, and each `depends_on` P3-10, the cross-linking card
in wave 2, which has not been built. That is the never-both-at-once rule working
as authored.

Next eligible: **P3-06**, Clienti, the first screen card, `depends_on [P3-01]`.
Next free migration number: **0020**.
