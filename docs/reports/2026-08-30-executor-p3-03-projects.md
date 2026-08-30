# EXECUTOR: P3-03, public.projects. Two files, twelve mutations, and a second no-op found by deleting a line.

**Date:** 2026-08-30
**Role:** EXECUTOR
**Branch:** `card/p3-03-projects`, cut from `origin/main` at `b8910e5`
**Card:** P3-03
**Migration files added:** `supabase/migrations/0015_status_entity_project.sql`,
`supabase/migrations/0016_projects.sql`

---

## 0. Boot

Phase 3 board read at `b8910e5`. P3-01 and P3-02 `shipped`, so **P3-03** is the
lowest-id eligible card. Claimed as `executor` through PR #107 before the work
began.

---

## 1. Two files, and the card predicted why

`ALTER TYPE ... ADD VALUE` is the one DDL statement in this migration set with a
transaction restriction: before PostgreSQL 12 it could not run in a transaction
block at all, and even on 12 and later **the new value cannot be USED in the
transaction that adds it**. Every other migration here opens with `begin`.

So `0015_status_entity_project.sql` is one statement with **no `begin` and no
`commit`**, adding `project` to `public.status_entity`, and
`0016_projects.sql` is the table. P3-03's `defaults` called this out in advance,
which is why it is written down here rather than discovered in the middle of an
apply the owner is running.

**P3-27's notes now carry the apply order and the reason**, so whoever runs it
does not wrap 0015 in a transaction out of habit.

---

## 2. What shipped

`public.projects` with the six-state pipeline. Columns, labels, nullability and
the RESTRICT-not-cascade decision are exactly what P3-03's `defaults` fixed.

**The pipeline is not a state machine, and that is in the schema as a comment
rather than as a constraint.** Real construction work goes backwards: a contract
stalls into suspended, a closed job reopens, an offer becomes a lead again when
the client goes quiet. The assertion file walks contract to suspended to closed
to active to lead and requires every step to succeed, so a later card that
"tidies" this into a forward-only machine fails here.

---

## 3. The enum ORDER is asserted, not just its membership

```sql
create type public.project_status as enum (
  'lead', 'offer', 'contract', 'active', 'suspended', 'closed'
);
```

P3-03 says the declaration order **is** the pipeline order, and that the wave 3
pipeline view reads it rather than hardcoding a second list. So a reordering
here silently reorders the columns on that board, and **no membership check
would notice**. Mutation 1 swaps `contract` and `active` and is caught.

---

## 4. The proof

### 4.1 The migrations apply, and three assertion files now run

```
$ npm run check:migrations
...
applied 0013_clients.sql
applied 0014_contacts.sql
applied 0015_status_entity_project.sql
applied 0016_projects.sql

16 migration files applied, unmodified, on postgres:16
asserted 0013_clients.sql
asserted 0014_contacts.sql
asserted 0016_projects.sql
3 assertion files passed
EXIT=0
```

One assertion file covers both migrations, because 0015 is a single statement
whose only purpose is to make this table's history recordable, and a separate
file for one enum value would be filing rather than checking.

### 4.2 Twelve mutations, each proved to fail, plus one control

| # | mutation | error |
|---|---|---|
| 1 | the pipeline enum is reordered | `expected project_status to be (...) IN THAT ORDER, found lead,offer,active,contract,...` |
| 2 | a seventh status is added | same assertion, `...,closed,archived` |
| 3 | 0015 never adds the enum value | `expected status_entity to be (inbound_order, outbound_issue, project), found inbound_order,outbound_issue` |
| 4 | uniqueness is on `name` alone | `duplicate key value violates unique constraint projects_name_unique_per_client` |
| 5 | the unique constraint is dropped | `one client was allowed two projects with the same name` |
| 6 | the date-order check is dropped | `a planned end date before the start date was accepted` |
| 7 | the date-order check is INVERTED | same assertion |
| 7b | **control**: the null guards are deleted | **passes, correctly.** See section 5 |
| 8 | the foreign key CASCADES | `expected client_id to reference clients(id) ON DELETE RESTRICT, found ... ON DELETE CASCADE` |
| 9 | the dates become `timestamptz` | `start_date and planned_end_date must both be date, found date,timestamptz` |
| 10 | a delete policy is added | `expected policies for exactly INSERT, SELECT and UPDATE, found DELETE,...` |
| 11 | anon is granted SELECT | `anon must hold no privilege on public.projects, found 1 grants` |
| 12 | RLS is never enabled | `expected rowsecurity true on public.projects, found false` |

**Mutations 4 and 5 are the pair worth reading together.** Making the name
unique globally and dropping uniqueness altogether are opposite errors, and only
one of them is caught by a catalogue read. The behavioural block inserts a
project called "Bloc A" for **two different clients** and requires both to
survive, then requires the same client to be refused a second one. Two different
clients each having a "Bloc A" is normal on a Moldovan construction site, and a
schema that forbade it would be discovered by a user, not by a test.

---

## 5. The second no-op this wave, found the same way as the first

**Mutation 7 was originally "delete the null guards from the date check". It
passed.** The constraint as written is:

```sql
check (
  start_date is null
  or planned_end_date is null
  or planned_end_date >= start_date
)
```

The guards exist so that a lead with a start date and no estimated end can still
save. **They are redundant.** In SQL a CHECK constraint is violated only when it
evaluates to FALSE; **NULL is accepted**. `planned_end_date >= start_date` with
either side NULL evaluates to NULL, so the bare comparison already admits every
row the guards were written to admit. This is the opposite of a `WHERE` clause,
which discards NULL, and it is why the same expression means different things in
the two places.

**The guards stay**, with a comment in the migration saying they are redundant
and why they are kept: three-valued logic is the thing a reader is most likely
to get wrong about this constraint, and a rule that reads the way it behaves is
worth two clauses the planner discards. **The mutation was corrected to
inverting the comparison**, which is caught, and the deletion is kept as a
labelled control.

**This is the second no-op found by mutation testing in this wave**, after the
redundant `revoke ... from anon` on P3-01, and both were found by the same move:
**delete the line and require the check to fail.** A defensive line whose
absence nothing notices is either redundant or unproven, and those need
different responses. Both are now LEARNINGS entries.

---

## 6. What this card deliberately did not build, and where it went instead

**Nothing here writes `public.status_history` when a project status changes**,
and that is worth stating because 0015 exists precisely so those rows can be
written.

The convention in this schema is that a status change and its history row are
written together inside a **SQL function**: `public.set_inbound_status` in 0003
and `public.set_outbound_status` in 0004 both do exactly that, and no trigger
enforces it. 0001's own comment on `status_history` says "a status that changes
without a row here is a defect (P2-04 and P2-05 acceptance both check for it)",
**which is an admission that the rule is tested rather than enforced.**

A trigger on `projects` would close that hole and would be a new convention,
invented in a card whose acceptance does not mention it. P3-03 is a schema card.
**So the requirement was written onto P3-07**, the Proiecte screen card, with
the function to copy, the SECURITY INVOKER note, the instruction to assert it in
the spec rather than assume the function is the only path, and the warning that
if a later card adds a trigger the function must stop inserting or every change
is recorded twice.

`CLAUDE.md` section 3 says a defect noticed in passing becomes a new card or a
LEARNINGS entry, not a quiet extra commit. This is the card-note version of that.

---

## 7. Checks

| check | result |
|---|---|
| `ls supabase/migrations/0015_*.sql supabase/migrations/0016_projects.sql` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run check:migrations` | exit 0, 16 files, 3 assertion files passed |
| twelve mutations | all twelve caught, plus one labelled control that correctly passes |
| `node docs/board/validate-board.mjs` | PASS, 0 violations |
| `npm run check:conflict-residue` | 3 checks passed |
| APPLY-LOG pending register | 16 files, 4 pending, each file in exactly one place |
| em dash or en dash in any file touched | zero |
| secret staged | none |

---

## 8. Production writes

**None.** No apply entry in `docs/migrations/APPLY-LOG.md`, two new pending
lines, and no row in `docs/PRODUCTION-WRITES.md`.

---

## 9. Learnings appended

One entry: **a CHECK constraint that evaluates to NULL is satisfied, so a null
guard inside one does nothing.** It carries the general rule and the move that
found it.

---

## 10. Next

Next eligible: **P3-04** (`outbound_issues` gains `project_id`, `depends_on
[P3-03]`) and **P3-05** (suppliers, `depends_on []`). P3-04 is the lower id and
is taken next. Next free migration number: **0017**.
