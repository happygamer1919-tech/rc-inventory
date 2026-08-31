# EXECUTOR, 2026-08-31: P3-27a, the assertion-bearing migration applier

Card **P3-27a**. Branch `card/p3-27a`. **No production connection was made.**

---

## 1. THE STATEMENT TO QUOTE TO THE OWNER BEFORE THE P3-27 RUN

This is the only `DROP FUNCTION` in the batch, printed verbatim by the applier on
every run whatever the outcome, from `0018_outbound_issue_project_write.sql`:

```sql
drop function if exists public.create_outbound_issue(text, text, text, jsonb);
```

It removes a rule about rows and no row. The applier asserts, **before the drop
executes**, that the target has zero dependent objects; on the shim it reported
`0018 gate: dependent objects on the four-argument function = 0`.

## 2. THE BLOCKING FINDING FOR P3-27, AND IT IS WHY THIS CARD EXISTED

**The thirteen migrations cannot be applied as one transaction. PostgreSQL
refuses.** This was found on the shim, on the first clean run, which is exactly
what the shim is for. Against production the batch would have rolled back at
0021 and P3-27 would have failed.

```
ERROR:  unsafe use of new value "project" of enum type status_entity
LINE 15:   where h.entity_type = 'project' and h.entity_id = p_projec...
HINT:  New enum values must be committed before they can be used.
```

The mechanism, precisely:

- `0015_status_entity_project.sql:39` runs
  `alter type public.status_entity add value if not exists 'project';`
- `0021_projects_search_and_status.sql:185` creates `project_status_history`,
  which is **`language sql`**, and whose body at line 199 names `'project'`.
- A `language sql` body is **parsed and validated at CREATE time**, so the label
  is *used* in the transaction that added it. The server refuses.

The `set_project_status` function in the same file also names `'project'`, at
line 166, and does **not** trip this, because it is `language plpgsql` and its
body is not validated that deeply at creation. That difference is the whole bug
and it is invisible by reading.

**The fix, and it is deliberately the smallest one available.** Enum additions
commit in a pre-phase of their own, and the applier refuses to put anything else
in it. Four checks bound it, all made before anything runs:

1. a file joins the pre-phase **only** if it contains an enum addition;
2. such a file may contain **nothing but** `AlterEnumStmt` and `SelectStmt`, so it
   cannot leave a table, column, function or policy half-created;
3. every addition must carry `IF NOT EXISTS`, so a re-run after a rolled-back main
   batch is a no-op;
4. everything else stays in the one transaction it was always going to be in.

In this batch the pre-phase is exactly one file, `0015`, which contains exactly
two statements: the enum addition and a verification `select`. **What can survive
a rollback of the main batch is therefore one unused enum label**, which
references nothing, is read by nothing, and is re-added as a no-op. That is not
the partial apply 8.5 forbids, and R-082 says so in those words.

## 3. AN OPERATIONAL RISK THE OWNER HAS TO SEE BEFORE P3-27 RUNS

**`hasPhase3Schema()` is memoised for 60 seconds** (`lib/data/schema-capability.ts:37`).
`lib/data/outbound-actions.ts` calls the **four-argument** `create_outbound_issue`
in its fallback branch, taken when that probe returns false.

So for up to **60 seconds after the commit**, a warm server instance still holding
a cached `false` will call the four-argument function that 0018 has just dropped.
That call fails.

This is bounded, it is not data loss, and it affects one action (creating an
outbound issue) for at most a minute. It is stated here rather than discovered
live. The cheapest mitigations, in order: run the apply outside working hours;
or redeploy immediately after the commit, which discards every cached probe.

**The applier does not treat this as a blocker**, and the reason is written into
the gate: it refuses only if a four-argument call site exists **outside** the
phase 3 probe. Every one is inside it. A gate that refused on the guarded
fallback would make P3-27 impossible forever, since that branch is the only thing
that keeps the app working *before* the apply.

## 4. What shipped

| file | what it is |
|---|---|
| `decisions/inbox.md` | ruling **R-082** |
| `CLAUDE.md` §8.6 | the amendment, as a second exception, with the absolute exclusion above it |
| `scripts/apply-pending-migrations.mjs` | the applier, 11 SQL assertions |
| `scripts/poc-free/local-db/prove-applier.mjs` | the three-way proof against the AUT-14 shim |
| `package.json` | `npm run prove:applier` |

**R-047 is a different grant and this does not ride on it.** R-047 covers
assertion-bearing *scripts* and says migrations are not in scope. R-049, R-056
and R-059 widened the *self-merge* grant and touched none of 8.6, because merging
a migration file is not applying it. The gap was real; R-082 closes it explicitly
rather than by inference.

## 5. The proof

```
node scripts/poc-free/local-db/prove-applier.mjs
  11 of 11 proofs passed
EXIT=0
```

Each proof builds its own `postgres:16` container from scratch, with no
credentials and no network, and destroys it afterwards. `docker cp` is never
used.

- **Clean pass** from an 0001-0012 baseline whose ledger holds only 0001-0009,
  seeded with real rows so the reconciliations and the row-count assertion have
  something to bite on. Committed 13 migrations, 11 assertions passed, ledger 9
  rows before and 25 after, `devize` present after commit.
- **Three mutations**, each tripping a **different** control and each leaving the
  database untouched:
  - a `DELETE` appended to the batch: **refused with nothing executed**, exit 2;
  - a `drop column products.supplier_name` appended to the last file:
    `ASSERTION FAILED [free-text-columns-untouched]`, exit 1;
  - the 0018 `drop function` removed:
    `ASSERTION FAILED [one-create-outbound-issue-five-args]`, exit 1.
- **Empty register**: `zero pending migrations`, nothing executed, exit 0.

Captured stdout for all five runs is committed beside this report as
`p3-27a-proof-*.txt`.

## 6. Three defects the mutations found in my own applier

None of these were found by reading. This is the argument for building the proof
harness before trusting the script.

1. **`pg_get_function_identity_arguments` returns parameter NAMES as well as
   types.** Both the 0018 gate and the signature assertion compared against
   `'text, text, text, jsonb'`, which never matches
   `'p_reference text, p_client_name text, ...'`. The assertion failed loudly on
   the clean run; **the gate failed silently**, reporting "the four-argument
   function is not present, nothing to drop" while it sat right there. A gate that
   skips is worse than a gate that fails. Both now compare `format_type` over
   `proargtypes`.
2. **The grammar's `stmt_location` points at the start of a statement INCLUDING
   its leading comments**, so slicing by it blanked a comment rather than the
   `commit` keyword and the stripper reported that transaction control had
   survived. The locator now scans dollar-quote-masked text and is held to the
   grammar's own count and order, so a heuristic locator is checked by the real
   parser rather than trusted.
3. **The harness's own 0018 mutation used a plain string replace**, which hit the
   copy of the DROP statement quoted in that file's *header comment* rather than
   the statement itself. The mutation changed nothing and the proof passed. A
   mutation test that mutates nothing reports the same green as a working control,
   which is the failure mode mutation testing exists to prevent, arriving inside
   the mutation test. Anchored to the start of a line now, and the harness refuses
   a mutation whose output equals its input.

## 7. Not done here, deliberately

- **`npm run prove:applier` is not wired into `quality.yml`.** It costs five
  containers and several minutes on every pull request. Docker is already
  available there (`check:migrations` uses it), so it is a one-step change, but it
  is a real runtime cost on every PR and that is the owner's call, not scope I
  should take. Recommendation: add it, since a check nobody runs rots.
- **P3-27 is not unblocked by this card.** The applier exists and is proven; the
  run against production is a separate act with its own card, its own journal and
  its own stop.
