# EXECUTOR, 2026-09-02: PROVE-01, every guard assertion proved able to fail

Card **PROVE-01**, authored on the owner's dispatch and ranked ahead of wave 3 by him. Branch `card/prove-01`. No migration, no database write, no secret read.

> "Never-failing assertions in the guard that protects production is the worst place this class can live."

---

## 1. What the audit found

**Three defects, all of one class.**

### Three assertions that matched a column name

`prove-applier.mjs` read a one-column `psql` boolean with `(out.stdout || "").includes("t")`. `psql` prints the **column name** above the value, and every one of those columns is named **`untouched`**. The three `...and the database is untouched` assertions were true whatever the database said, and had reported passing since they were written. Found under APPLY-01 and fixed there.

### Two "assertions" that could not fail at all

`outbound-destination-backfill` and `supplier-backfill` sat in the applier's assertion list. Their entire body is `raise notice`. **No `raise exception` on any path.**

They were counted in `N assertions passed`, in the pre-flight header, and in the row this script writes to `docs/PRODUCTION-WRITES.md`. **The record said thirteen guards held when eleven did and two printed a number.**

They are useful and they are kept, unchanged. What changed is that they are declared through `N()` instead of `A()`, reported as `notice <name> (reports a number, cannot fail)`, counted separately, and `prove:assertions` asserts that they **remain** incapable of raising, so nobody moves them back by accident.

### Four refusal paths never watched fail

| refusal | why it matters |
|---|---|
| a **TABLE** drop with a reader still on it | only the COLUMN path had a fixture |
| a **FUNCTION** drop still called through `.rpc()` | never exercised |
| **no source directory to scan** | pointed at nothing, find nothing, report clean - the worst shape a check can have |
| a **stale exemption** naming a deleted file | the exemption list is how a false positive is silenced, so a rotting entry is how a real reader gets silenced |

## 2. Every applier assertion now holds and raises

`npm run prove:assertions` reads the **shipped** bodies from the applier through its `RC_APPLY_PRINT_ASSERTIONS` mode - not a copy, for the same reason `test-ask-digest.sh` lifts `responder.sh`'s offset program out from between fences. One container, brought to the state the applier leaves behind. Then per assertion:

- **CONTROL** - run the body on a correct database. It must **not** raise.
- **PERTURBATION** - break exactly the thing it is about. It **must** raise.

**Both halves are required.** A body that raises on everything passes the perturbation and fails the control. A body that raises on nothing passes the control and fails the perturbation. Only one that does both is doing its job.

```
  11 assertion(s) read from the applier, 2 notice(s)

  ok    every-pending-applied: holds on a correct database
  ok      ...and RAISES when the thing it is about is broken
  ok    ledger-no-gaps-ends-at-highest       ...and RAISES
  ok    ledger-0010-0011-0012-present        ...and RAISES
  ok    promised-tables-exist                ...and RAISES
  ok    promised-columns-exist               ...and RAISES
  ok    promised-functions-exist             ...and RAISES
  ok    declared-function-drops-happened     ...and RAISES
  ok    declared-column-drops-only           ...and RAISES
  ok    zero-rows-deleted                    ...and RAISES
  ok    declared-function-signatures-exist   ...and RAISES
  ok    declared-function-versions-only      ...and RAISES

  ok    outbound-destination-backfill is a notice: it carries no raise exception
  ok    supplier-backfill is a notice: it carries no raise exception
```

**One container, not eleven.** Eleven would put minutes into a proof that fits in one, and a proof nobody can afford to run is a proof that gets filtered out.

**Each perturbation is written by hand.** A generated one would be a second implementation of the same rule and would agree with it by construction.

### The trap this proof walked into first

Read against **today's** pending register, which holds one migration, almost every promised set is empty and almost every assertion is **vacuously true**. The first run watched eleven assertions hold and nine of them fail to bite. The register handed to the print mode is now the full wave-1 batch, which is what these assertions were written for. **A proof of a derived assertion has to be given the input the assertion was derived from.**

## 3. The register is the durable half

The proofs answer *"do these cases pass"*. They cannot answer *"is there a case for every assertion"* - an assertion nobody wrote a case for is **invisible** to them. Add one to the applier with no perturbation and the proof covers ten of eleven and still prints all-passed.

`docs/ASSERTION-REGISTER.md` names every assertion and refusal in the four guards with the case that proves each can fail. `npm run check:assertion-register` fails when an assertion has no row, when a row names an assertion that is gone, or when a case is `NONE`. Proved on a fixture:

```
$ (an unregistered assertion added to the applier)
  rc-prove-01-unregistered (scripts/apply-pending-migrations.mjs) has NO ROW in docs/ASSERTION-REGISTER.md.
        Add it with the case that proves it can fail, or delete the assertion.
```

**It is not path-filtered, deliberately.** It needs no container and no database, and filtering it would let exactly the gap it exists to catch through on a pull request that touched something else.

## 4. CLAUDE.md 3.1 was amended, not quietly extended

That section says in terms:

> A second path-filtered step is a change to this section, not an application of it.

`prove:assertions` is that second step. The section now carries a paragraph naming it, why it **shares the existing filter rather than adding one** (two filtered steps, still one filter), that a pull request touching those paths needs **both** to have run and passed, and that `check:assertion-register` must never be filtered. The filter's pattern gained the new proof's own file, because a proof whose own file is not in the filter cannot be changed and re-run by the change.

## 5. Acceptance, run

```
npm run prove:assertions          11 assertions, each holds and each raises; 2 notices asserted to be notices
npm run prove:schema-direction    12 of 12, four cases new
npm run check:assertion-register  OK over 18 assertions and refusals across 3 files
                                  and proved to REFUSE an unregistered assertion
npm run check:migrations          28 applied to a bare postgres:16, 12 assertion files
bash scripts/poc/test-ask-digest.sh   all assertions passed
npx tsc --noEmit                  exit 0
```

## 6. The fourth instance, in LEARNINGS

The matcher entry now names all four and states the general rule the owner gave:

> **Any check whose passing path is reachable without the condition being true is not a check.**

It covers shapes the count rule does not: a boolean parsed by substring out of formatted output, an assertion body with no failing branch, a mutant that dies on import, an `await` on a condition that was already true. **The test that finds them is to ask what would have to be true for this to fail, and if the answer is "nothing", it is decoration.**
