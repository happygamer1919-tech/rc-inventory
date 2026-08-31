# EXECUTOR: P3-10, cross-linking. Nine directions, seven links, no migration, and two drop cards unblocked.

**Date:** 2026-08-30
**Role:** EXECUTOR
**Branch:** `card/p3-10-cross-links`, cut from `origin/main` at `0f26ea0`
**Card:** P3-10
**Migration files added:** **none.** This card adds no data and no schema, and it
did not need to.

---

## 0. Boot

Phase 3 board read at `0f26ea0`. **P3-10** is the lowest-id eligible card,
`depends_on [P3-08, P3-09, P3-05]`, all shipped. Claimed as `executor` through PR
#121 before the work began.

---

## 1. Nine directions collapse to seven links, and that is not a cut

The card names nine. Two of them are **the same link**:

> product to supplier; supplier to its products, filtered

There is no supplier detail route, this card adds no screen, and **"the products
of this supplier" is exactly what somebody pressing a supplier name wants to
see.** `/inventar?furnizor=<id>` satisfies both directions with one anchor.

The other seven are real and each is walked by the spec:

| from | to |
|---|---|
| issue | its project |
| issue | its client |
| issue line | the product |
| project | its client |
| project | its issues, filtered |
| client | its projects |
| client | its issues, filtered |

---

## 2. One component, because nine styles is the defect

`components/ui/RecordLink.tsx`. The card says nine differently-styled links is
the failure it exists to fix, and that failure appears exactly one way: each
screen writes its own anchor with its own classes, and three months later nobody
knows which text is pressable.

**A null destination is plain text with a Romanian explanation and
`data-linked="false"`, never a dead link.** An issue whose historical row P3-04
has not reconciled reads "Proiect neasociat". The spec **branches on that
attribute** rather than assuming every issue has a project, because on a fresh
database some do not, and a test that assumed otherwise would fail for a reason
that is not a defect.

---

## 3. The two new filters are the minimum the card allows

`/comenzi?proiect=<id>` and `/comenzi?client=<id>` did not exist and are added.
`/inventar?furnizor=<id>` and `/inventar?produs=<sku>` **move an existing control
and an existing selection into the URL**, which is what makes them linkable.

No new filtering mechanism, no screen redesigned. The card draws that line
explicitly and it is worth staying on the right side of it.

**The filter label comes off the record, not out of the URL.**
`/comenzi?proiect=<id>` reads the project and prints its name. A screen that
echoed the query string would print any id somebody typed, including one that
does not exist. An unknown id renders the unfiltered list rather than an error.

**Filtering is by id and never by name.** Historical issues with a null
`project_id` are excluded from every destination filter, which is correct:
nobody knows where they went, and matching them on the old free text would
resurrect exactly what P3-04 removed.

---

## 4. Every assertion checks the destination, not the navigation

The card asks for this in terms and it is the difference between a real test and
a green one: **each assertion checks the landing page shows the id or name it was
linked from.**

A test that only checked the URL changed would pass when the link goes to the
wrong record, which is the failure mode a cross-linking card actually has.

---

## 5. What shipping this unblocks

**P3-04b and P3-05b become eligible for the first time.** Both drop cards
`depends_on` P3-10, which is the never-a-backfill-and-a-drop-together rule
expressed as a dependency edge: **the drops wait until every screen that could
still be reading the old text columns has been built**, and can be seen not to be.

This card is where that becomes checkable. `outbound_issues.client_name` and
`project_name` are now read by nothing except the panel subtitle, which reads
them beside the linked ids, and `products.supplier_name` by nothing except the
same panel line.

---

## 6. Checks

| check | result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `node docs/board/validate-board.mjs` | PASS, 0 violations |
| `npm run check:conflict-residue` | 3 checks passed |
| APPLY-LOG pending register | unchanged at 23 files, 11 pending; this card adds no migration |
| em dash or en dash in any file touched | zero |
| secret staged | none |

---

## 7. Production writes

**None**, and this time for a stronger reason than usual: the card adds no
migration at all.

---

## 8. Learnings appended

**None.** This card hit no defect.

---

## 9. Next

Next eligible, and the two that matter: **P3-04b** and **P3-05b**, the drop
cards, now unblocked for the first time. **They are gated on the P3-04 and P3-05
reconciliations having been verified against real rows**, which is P3-27, so
whether they can actually be worked is a question about the apply and not about
the board. Also eligible: P3-11 and the wave 4 density cards.
