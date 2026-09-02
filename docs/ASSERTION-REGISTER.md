# The assertion register

**Created 2026-09-02 by card PROVE-01.**

Every assertion and every refusal in the four guards that stand between a bad
batch and the production database, and **the case that proves each one can
fail**.

## Why it exists

An assertion nobody has watched fail is an assertion nobody has tested. Three
defects of one class were found in these files on a single day:

1. Three assertions in `prove-applier.mjs` read a `psql` boolean with
   `includes("t")` against a column named **`untouched`**. They matched the
   column NAME. They had reported passing since they were written.
2. `outbound-destination-backfill` and `supplier-backfill` sat in the applier's
   assertion list with a body whose only statement is `raise notice`. They have
   no `raise exception` on any path, so **they could not fail**, and they were
   counted in "N assertions passed" and in the row written to
   `docs/PRODUCTION-WRITES.md`.
3. `one-create-outbound-issue-five-args` pinned a signature unconditionally, so
   it could only ever fail for the wrong reason.

**The general rule, now the fourth entry in `docs/LEARNINGS.md`: any check whose
passing path is reachable without the condition being true is not a check.**

## The rule this file enforces

**An assertion with no failing case is deleted or fixed, never left.**
`npm run check:assertion-register` fails when an assertion exists in the source
and has no row here, when a row here names an assertion that no longer exists, or
when any row's failing case is `NONE`.

## The register

`prove` columns name the command that watches the assertion fail.

### `scripts/apply-pending-migrations.mjs` - the SQL assertions

Bodies are read from the applier itself through `RC_APPLY_PRINT_ASSERTIONS=yes`,
so what is proved is the shipped text and not a copy. Each has a **control** (it
holds on a correct database) and a **perturbation** (it raises when the thing it
is about is broken).

| assertion | failing case |
|---|---|
| `every-pending-applied` | `prove:assertions` - a version row deleted from the ledger |
| `ledger-no-gaps-ends-at-highest` | `prove:assertions` - a middle ledger row deleted |
| `ledger-0010-0011-0012-present` | `prove:assertions` - row `0011` deleted |
| `promised-tables-exist` | `prove:assertions` - a promised table dropped |
| `promised-columns-exist` | `prove:assertions` - a promised column dropped |
| `promised-functions-exist` | `prove:assertions` - a promised function dropped |
| `declared-function-drops-happened` | `prove:assertions` - a dropped function brought back |
| `declared-column-drops-only` | `prove:assertions` - an undeclared column dropped |
| `zero-rows-deleted` | `prove:assertions` - a row deleted from a table |
| `declared-function-signatures-exist` | `prove:assertions` - a declared signature removed |
| `declared-function-versions-only` | `prove:assertions` - a second overload created |

**Not assertions, and no longer counted as any.** These two report a number and
carry no `raise exception` on any path. They are kept because they are useful;
`prove:assertions` asserts that they remain notices.

| notice | what holds it honest |
|---|---|
| `outbound-destination-backfill` | `prove:assertions` - asserted to carry no `raise exception` |
| `supplier-backfill` | `prove:assertions` - asserted to carry no `raise exception` |

### `scripts/poc-free/check-removal-safety.mjs` - refusals

| refusal | failing case |
|---|---|
| `removal-safety-no-source` | `prove:schema-direction` - pointed at a directory that does not exist |
| `removal-safety-reader-remains` | `prove:schema-direction` - INC-06 reconstructed; plus a TABLE drop and a FUNCTION drop |
| `removal-safety-deployed-half` | `prove:schema-direction` - the applier refuses when production cannot be asked |

### `scripts/poc-free/check-pending-schema-reads.mjs` - refusals

| refusal | failing case |
|---|---|
| `pending-schema-reads-unapplied-read` | `prove:schema-direction` - INC-05 reconstructed |
| `pending-schema-reads-stale-exemption` | `prove:schema-direction` - an exemption naming a deleted file |

### `scripts/poc-free/local-db/prove-applier.mjs` - what proves the applier

This file is itself a proof, so its "failing case" is the mutation it drives.
Its boolean reads go through `booleanFrom()`, which parses the value from the
line before the `(N rows)` marker and returns `null` for a shape it cannot parse.
**That parser exists because the substring version matched the column header.**

| assertion | failing case |
|---|---|
| `clean pass commits, exit 0` | any mutation below; a batch that rolls back fails it |
| `ledger holds N rows after commit` | `prove:assertions` perturbs the ledger directly |
| `a table from the batch exists after commit` | the mutations, which all roll the batch back |
| `...and the database is untouched` | the `apply-01-signature-change` mutation, which COMMITS and would fail it |
| `...and the database CARRIES the batch` | every refusing mutation, which rolls back and would fail it |
| `an unmatched historical row rolls the batch back` | its own fixture: a matched row lets the batch commit |
| `...and client_name and project_name survived` | the same fixture with the drop allowed to run |
| `empty register: exit 0, nothing executed` | any non-empty register |

### `scripts/poc-free/prove-schema-direction.mjs` - what proves the two checks

Every one of its assertions **is** a failing case for something else, and each is
paired with a control on the same fixture shape, so a fixture that fails to build
cannot satisfy a refusal by dying.
