# EXECUTOR: INC-05. Production down on every screen. Merged is not applied.

**Date:** 2026-08-31
**Role:** EXECUTOR
**Branch:** `incident/inc-05-unapplied-schema-reads`, cut from `origin/main` at `e6fdceb`
**Severity:** total outage. `rapidconstructmd.com` returned 500 on every route,
including the dashboard.
**Cause:** mine.

---

## 1. What the owner saw

The client domain, 500, Romanian error screen, digest `540124282`.

---

## 2. What it was not

Checked first, because three of this repository's last incidents were bad
conflict resolutions and the temptation was to assume a fourth:

| hypothesis | result |
|---|---|
| conflict residue from the two TRIAGE merges | `npm run check:conflict-residue`, 3 checks passed |
| a broken build or type error on `main` | `tsc --noEmit` and `npm run build` both exit 0 |
| a bad migration | every migration applies cleanly to a bare postgres |

None of it. `main` is healthy. **The code and the database disagree.**

---

## 3. What it was

**Thirteen phase 3 migrations are written, proven and merged. None has been
applied.** The application code merged alongside them reads the new schema
unconditionally.

Reproduced exactly, by applying the shim and **only 0001 to 0012** to a container,
which is what production has, and running the two SELECTs the deployed code
sends:

```
=== the SELECT the deployed dashboard sends, via listProducts ===
ERROR:  column "supplier_id" does not exist

=== the SELECT the deployed orders screen sends, via listOutboundIssues ===
ERROR:  column "project_id" does not exist

=== the tables and functions the new screens call ===
 clients          | (null)
 projects         | (null)
 suppliers        | (null)
 contacts         | (null)
 search_clients() | 0
```

`supplier_id` is added by `0019`. `project_id` is added by `0017`. Both are in
the pending register. PostgREST answers 42703, both readers `throw`, and **the
dashboard is the first page that calls them**, so the very first screen dies and
every other one with it.

---

## 4. The sentence I wrote ten times, which was wrong

Every card report since P3-01 says some version of:

> exists in the code and not on the live site

**That is exactly backwards.** The MIGRATION is not on the live site. The CODE
is, because `main` deploys. I wrote that line as reassurance and it was the
defect, stated in advance, ten times, without me hearing it.

---

## 5. Why nothing caught it, which is the part worth keeping

Every card was green: `tsc`, `build`, all migrations on a bare postgres, and the
full Playwright suite.

**Every one of those runs against a database with ALL migrations applied.** The
AUT-14 shim applies every file. `supabase db reset` applies every file. **CI
cannot see the difference between the merged schema and the applied schema**, by
construction. A green pipeline was not evidence about production and never could
have been.

---

## 6. The fix, in three parts

### 6.1 A probe

`lib/data/schema-capability.ts`. One PostgREST read of `public.projects`, cached
sixty seconds, answering "is the phase 3 schema here?".

**It probes through PostgREST and not through a SQL function**, because a
function would itself live in an unapplied migration and could not answer the
question exactly when the question matters. It distinguishes a missing table
(error) from RLS returning nothing (empty set, no error), which is why it checks
the error and not the row count. **Sixty seconds and not forever**, so the day
P3-27 applies, running instances notice without a redeploy.

### 6.2 Readers that read only what exists

- `listProducts` and `listOutboundIssues` build their column list from the probe.
- The four phase 3 routes render `SchemaPending`, a Romanian screen saying the
  section is not active on this database yet, instead of throwing.

**Two writes were broken as well and are fixed here**, because a loading site
that cannot record anything is not a fixed site:

- **Product save.** Every create and update wrote `supplier_id`, even when null,
  so **saving any product failed on production**. It now writes the supplier as
  text, exactly as before P3-05, until the schema lands.
- **Outbound issue creation.** P3-04 made the project picker required and pointed
  the write at the five-argument `create_outbound_issue` from `0018`. On
  production there are no projects to pick and no such function, so **the
  warehouse could not issue material at all.** The destination falls back to the
  two free-text fields and the four-argument function until the schema lands.
  `listClientsAndProjects`, deleted by P3-04, is restored for that path only and
  says so.

### 6.3 A check that reads the register

`npm run check:pending-schema-reads`, wired into `quality`.

It reads the pending register in `docs/migrations/APPLY-LOG.md`, extracts every
table, column and function those files add, and **fails any file under `lib/`,
`app/` or `components/` that names one without going past the probe.**

**It stops asking about a migration the moment the register stops listing it**,
so P3-27 turns it off without anybody editing it.

The rule is deliberately coarse and produces false positives. Nine files are
exempt, **each with its reason written next to it**: all are reachable only from
the four gated routes. The check refuses an exemption for a file that no longer
exists, so the list cannot rot.

**Proved to catch the actual outage**, both halves, by restoring the code that
shipped:

```
lib/data/products.ts       numeste coloana supplier_id
lib/data/outbound.ts       numeste coloana project_id
```

The first attempt at that proof was itself unfaithful: it removed the import but
left a helper that still named the guard, so the file still counted as guarded.
The mutation now asserts the guard is gone before it scores anything, which is a
lesson this repository has already written down twice.

---

## 7. What is still broken until P3-27 runs

Stated plainly rather than left to be discovered:

- **Clienți and Proiecte show "not active on this database yet."** They are built
  and tested; they have nothing to read.
- **Outbound issues record a typed destination, not a project.** Every one
  created before the apply lands in the same unreconciled set P3-04 exists to
  clear, and the P3-04 reconciliation will list them.
- **Products save a supplier as text, not as a record.** Same reconciliation.

None of this is new breakage. It is the phase 2 behaviour, restored, until the
schema catches up with the code.

---

## 8. Checks

| check | result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run check:pending-schema-reads` | OK, 13 pending, 9 exempt with reasons |
| both halves of the outage, as mutations | caught by name |
| `npm run check:conflict-residue` | 3 checks passed |
| `node docs/board/validate-board.mjs`, all three boards | PASS, 0 violations |
| em dash or en dash | zero |

---

## 9. Production writes

**None.** No migration is added, and none is applied. This changes only which
columns the deployed code asks for.

---

## 10. The one thing to do next

**Run P3-27.** It was already the blocking item; this incident is what happens
while it waits. Its `question` carries the three things to read first: the
`DROP FUNCTION` in `0018` and its 8.6 conditions, the reconciliation output, and
the ordering note about the outbound form.
