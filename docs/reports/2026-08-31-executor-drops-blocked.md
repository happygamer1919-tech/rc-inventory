# EXECUTOR: the two drop cards, blocked the moment they became eligible.

**Date:** 2026-08-31
**Role:** EXECUTOR
**Branch:** `card/p3-drops-blocked`, cut from `origin/main` at `1eab1d4`
**Cards:** P3-04b, P3-05b, both set to `blocked_on: ivan`
**Migration files added:** none.

---

## What happened

Shipping P3-10 satisfied the last dependency edge on **P3-04b** (drop
`outbound_issues.client_name` and `project_name`) and **P3-05b** (drop
`products.supplier_name`). Both became eligible for the first time.

**Both are blocked immediately, and that is not a contradiction.** Eligibility
and workability are different things: the dependency edge is satisfied, and the
**premise is not.**

---

## Why they cannot be worked

Each drop card's acceptance requires its backfill to have been **verified against
real rows**, and P3-04b requires **zero unmatched rows**.

**No migration on this board has been applied.** Eleven files sit in the pending
register in `docs/migrations/APPLY-LOG.md`, including `0017_outbound_project_id.sql`
and `0019_suppliers.sql`, which are the backfills in question.

So there are no real rows to verify against, and there is no reconciliation to
finish. Working either card now would **drop a column whose backfill has never
met real data**, which is precisely the failure the never-a-backfill-and-a-drop-
together rule exists to prevent. The rule would have been defeated not by
somebody ignoring it, but by the dependency graph saying "go" while the thing the
rule protects had not happened.

**P3-05b carries one extra wrinkle.** The P3-05 backfill CREATES supplier rows and
**refuses above twenty distinct names**, so its production run can legitimately
end in a refusal that needs Mihai to read a list. Dropping `supplier_name` before
that conversation has happened would delete the only evidence the list was built
from.

---

## What unblocks them

**P3-27**, the apply card, and nothing else. Its own `question` already carries
the reconciliation deliverable: the three numbers and the unmatched list in full,
which is the output of P3-04, plus the supplier list P3-05 creates.

Read that output, reconcile what it names with Mihai, and then these two cards
become real work.

---

## Impact if unanswered

**Nothing else is blocked.** The old text columns stay alongside the new foreign
keys, which costs one column each and no correctness: since P3-10 every screen
reads the record and not the text. These two cards simply wait, which is what
they are for.

---

## Checks

| check | result |
|---|---|
| `node docs/board/validate-board.mjs` | PASS, 0 violations |
| both cards carry the structured decision-needed text with a recommendation | yes, per `CLAUDE.md` section 4 |
| `blocked_on` names a person | `ivan`, on both |
| em dash or en dash | zero |
