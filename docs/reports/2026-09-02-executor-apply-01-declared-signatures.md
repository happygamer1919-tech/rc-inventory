# EXECUTOR, 2026-09-02: APPLY-01, the applier stops pinning one signature

Card **APPLY-01**, salvaged from the closed #143. Branch `card/apply-01`. No migration, no database write, no secret read.

---

## 1. What was there, and why it was a stop

`scripts/apply-pending-migrations.mjs` carried this, **unconditionally**:

```sql
if v_args <> 'text, text, text, jsonb, uuid' then
  raise exception 'ASSERTION FAILED [one-create-outbound-issue-five-args]: signature is (%), expected (text, text, text, jsonb, uuid)', v_args;
end if;
```

It demanded that `public.create_outbound_issue` exist exactly once with that literal argument list, on **every future run**, for **every batch**, whether or not the batch touched that function at all.

R-082 makes this script the only lawful route from a merged migration file to the production database, and a raised assertion **rolls the whole batch back**. So the first migration that legitimately changed that signature - and a deviz-aware outbound issue is a near and plausible reason to - would have taken down every unrelated migration travelling with it. The failure would have been invisible until the apply, and the apply is the last step.

## 2. What replaced it, and what was deliberately kept

**The assertion is not deleted.** Its real concern was 0018's shape - `DROP` then `CREATE`, where two survivors mean the drop did not happen and every call to the name is ambiguous. That half is not loosened by one inch. It is **generalised from one hardcoded name to every function a batch creates**.

Two assertions replace one:

| assertion | what it requires |
|---|---|
| `declared-function-signatures-exist` | every signature the batch declares resolves through `to_regprocedure` |
| `declared-function-versions-only` | each created name carries exactly as many versions as the batch declared |

**`to_regprocedure` does the type resolution, not a mapping table in here.** It is PostgreSQL's own parser, so `int`, `integer` and `int4` all resolve, and a type nobody thought of resolves too. A private translation table would be a second copy of something PostgreSQL already does, and wrong for the first type nobody anticipated.

**The declaration is parsed from the migration file and is never passed at the prompt.** R-082 and R-047 both rest on the script deciding rather than the terminal choosing, and anything a terminal can type is a choice.

## 3. Two design decisions that are load-bearing

### Keyed on what the batch CREATES, not on what it DROPS

The first draft keyed the count rule on "names the batch drops **and** re-creates". The proof harness's own mutation **removes 0018's drop** - so the rule stopped applying to exactly the accident it exists to catch. The mutation passed.

**A check that disappears together with the thing it was checking is worse than no check.** Keyed on creation, removing the drop leaves two versions against one declared, and it fails.

### Signature-level state, not name-level

`funcState` already answers "does this NAME survive the batch", which is the right question for the drop assertions and the wrong one here. A batch can legitimately drop one signature and create another in the same run - **that is what a change of signature is**. Keyed by name alone, such a batch appears to both drop and keep the function and its own declaration contradicts itself.

`sigState` records the last verb on each `name(args)`, walked in register and file order, the same way `funcState` does it for names. A `DROP FUNCTION` with no argument list kills every recorded signature of that name.

## 4. A defect found in an existing proof, which had never been capable of failing

Four assertions in `prove-applier.mjs` read a one-column boolean like this:

```js
record("  ...and the database is untouched", (after.stdout || "").includes("t"), ...)
```

`psql` prints the **column name** above the value, and every one of those columns is named `untouched` - which contains a `t`.

**The three "...and the database is untouched" assertions were true whatever the database said**, and had been reported as passing on every run since the proof was written.

It surfaced only because this card added the first case that expects **false**. `booleanFrom()` now takes the value from the line before the `(N rows)` marker and returns `null` for a shape it cannot parse, which the callers treat as a hard failure. `docs/LEARNINGS.md` carries it.

## 5. Acceptance, run

```
$ npm run prove:applier
  PASS  removing the 0018 drop leaves two functions and rolls the batch back
  PASS    ...and the database is untouched (declared-function-versions-only)
  PASS  APPLY-01: a batch that legitimately changes create_outbound_issue's signature COMMITS
  PASS    ...and the database CARRIES the batch (apply-01-signature-change)
  16 of 16 proofs passed

$ npm run check:migrations         28 applied to a bare postgres:16, 12 assertion files passed
$ npm run prove:schema-direction   7 of 7 passed
$ npx tsc --noEmit                 exit 0
```

The card names both halves and both are there: the fixture that **legitimately changes the signature** commits, where the old assertion rolled it back; and the fixture where **two versions exist at once** still refuses.

## 6. What this card deliberately did not touch

`ledger-0010-0011-0012-present` asserts a one-time repair forever. Those rows are permanently present and the assertion is permanently true, so removing it would be change with no benefit. The card's own defaults say so, and this is written down here so nobody spends a session tidying it.
