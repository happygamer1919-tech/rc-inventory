# EXECUTOR: P3-08, the client detail tabs. Where P3-04 pays off, and a UNION that would not sort.

**Date:** 2026-08-30
**Role:** EXECUTOR
**Branch:** `card/p3-08-client-tabs`, cut from `origin/main` at `111a6a3`
**Card:** P3-08
**Migration files added:** `supabase/migrations/0022_client_detail.sql`

---

## 0. Boot

Phase 3 board read at `111a6a3`. **P3-08** is the lowest-id eligible card,
`depends_on [P3-06, P3-02, P3-04]`, all shipped. Claimed as `executor` through
PR #117 before the work began.

---

## 1. The tab strip is complete, and two tabs are deliberately empty

All five tabs, in the card's order: Contacte, Proiecte, Consum materiale,
Documente, Note. **Documente and Note render Romanian empty states** until their
own cards fill them.

The card gives the reason and it is worth repeating: authoring three tabs now and
adding two later means the layout, the URL scheme and the tab component all
change twice, and **the second change lands in a card that is supposed to be
about documents.**

**The active tab is a URL query parameter**, so a tab can be linked to and the
back button works. An unknown tab falls back to the first one rather than
erroring, the same rule the two list screens apply to their filters. The spec
walks all five tabs, reloads on the last one, presses back, and asks for
`?fila=inexistenta`.

---

## 2. This is where P3-04 pays off

The consumption join goes **`outbound_issues.project_id` to
`projects.client_id`**, never through the old free text.

Using `client_name` here would have worked today and would have **kept that
column alive after P3-04b is supposed to remove it**. This tab would then have
been the reason the drop card could never run, which is exactly how a
never-both-at-once rule gets defeated three cards later by something that looks
unrelated.

**The leak assertion is the one that matters.** The fixture gives another client
and an unassigned issue **5000 units** of the same product this client took
**10** of. If either leaked into the join it would top the ranking and be
impossible to miss. That is the check that proves the join is what it claims.

---

## 3. Two totals that tell the truth

**The total covers everything, not only the five rows shown.** A screen that
listed five products and totalled those five would answer a question nobody
asked. The fixture asserts **310** across seven products and not **280** across
five.

**And the total says when it is partial.** P3-04 left `project_id` nullable while
history is reconciled, so some issues have no project and therefore no client.
They cannot be attributed and must not be invented. `unassigned_issue_count()`
returns them and the screen prints a Romanian line saying how many exist.

**It is a global count and not a per-client one**, which is not laziness: an
issue with no project has no client either, so it cannot be counted against one.
The line disappears when the count reaches zero, and **P3-04b is gated on that
same zero**.

A total that quietly omits rows is worse than one that admits it is partial,
because the first is believed.

---

## 4. The one thing that did not compile, and why it is a learning

```
ERROR:  column "row_kind" does not exist
LINE 49:   order by row_kind desc, quantity desc nulls last
```

**A `UNION`'s `ORDER BY` is evaluated against the union's output**, whose columns
are named by the first branch's positional list, and an alias declared inside a
branch is not visible to it. The same query orders fine without the `UNION`,
which is what makes it surprising.

The union is now wrapped in a subquery and ordered outside it. Ordering by output
position would also work and is worse: the day somebody adds a column, a
positional order silently sorts by something else.

---

## 5. Checks

| check | result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run check:migrations` | exit 0, 22 files, 8 assertion files passed |
| `node docs/board/validate-board.mjs` | PASS, 0 violations |
| `npm run check:conflict-residue` | 3 checks passed |
| APPLY-LOG pending register | 22 files, 10 pending, each in exactly one place |
| em dash or en dash in any file touched | zero |
| secret staged | none |

---

## 6. Production writes

**None.** One new pending line, no apply entry, no row in
`docs/PRODUCTION-WRITES.md`.

---

## 7. Learnings appended

One entry: **a `UNION` cannot be ordered by an alias introduced inside one of its
branches.** Section 4.

---

## 8. Next

Next eligible: **P3-09**, the project detail tabs, `depends_on [P3-07, P3-04]`,
both shipped. It is this card's sibling and will reuse the same tab component
shape. Next free migration number: **0023**.
