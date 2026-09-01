# EXECUTOR, 2026-09-01: P3-04b, the outbound free-text columns dropped

Card **P3-04b**. Branch `card/p3-04b`. **Applied and committed. Exit 0.**
Authority: **R-082**, plus the owner's ratification of 2026-09-01.

---

## 1. THE CARD SHIPPED ON A VACUOUS ZERO, AND THAT IS THE HEADLINE

**This card did not verify a backfill.** The pre-check it names was taken on
production in the same session as the apply:

```
select count(*) from public.outbound_issues where project_id is null;  -> 0
select count(*) from public.outbound_issues;                           -> 0
```

**The first zero is true because the second is.** No row was matched because no
row existed. The P3-04 backfill has never run against a single real row and
nothing here says otherwise.

The owner ratified the drop on exactly that basis: being wrong today costs
nothing, because there is nothing to lose, and the alternative is a second
production apply against tables that by then hold real client data. That is a
judgement about cost, not a verification, and this report is the place it stays
visible.

## 2. What the shim proved that production could not

Production had no rows, so the apply proved nothing about reconciliation. The
Docker shim can hold rows, so a **new proof** was added for exactly the case
production could not exercise:

> **an unmatched historical row rolls the batch back**  -  an outbound issue whose
> `client_name`/`project_name` match no client and no project makes 0026's
> `SET NOT NULL` refuse, the whole batch rolls back, and **both columns survive**.

That is the safety property this card depends on. If production had held
unreconciled rows, the drop would have refused rather than destroying the only
record of where materials went.

```
node scripts/poc-free/local-db/prove-applier.mjs
  14 of 14 proofs passed
EXIT=0
```

## 3. The apply

One file, one transaction, **12 of 12 assertions**, committed on all-pass,
13:14:44Z to 13:14:47Z.

**The first attempt rolled back with nothing committed**, and that is recorded
rather than smoothed over. Every existence assertion built its SQL array from a
JavaScript set, and this batch creates no table, so it emitted `array[]` with no
type. PostgreSQL refused: `cannot determine type of empty array`. The applier did
what it exists to do. The defect was fixed, the shim proof re-run to 14 of 14,
and the apply repeated.

### Declared destructive statements, per 8.6

No `DROP TABLE`, `TRUNCATE` or `DELETE`, established by parsing before anything
ran. Quoted verbatim:

```sql
drop function if exists public.backfill_outbound_project_ids();
alter table public.outbound_issues drop column client_name, drop column project_name;
```

Neither reduces any table's row count, which is the test 8.6 applies, and the
`zero-rows-deleted` assertion compared every count before and after.

### Verified from a fresh connection

| check | result |
|---|---|
| `client_name`, `project_name` | **absent** |
| `project_id` | present, `is_nullable = NO` |
| `backfill_outbound_project_ids` | dropped |
| `create_outbound_issue` | exactly one, `(text, text, text, jsonb, uuid)` |
| ledger | 26 rows, highest `0026` |
| row counts | unchanged: products 0, outbound_issues 0, categories 18, units 7, profiles 3 |

## 4. Five defects this card found in the applier, none by reading

1. **The pending-register regex was `[A-Z0-9-]+`**, so the card id `P3-04b` did
   not match. The applier reported **zero pending files** while a line for it sat
   in the register, and a batch of nothing exits 0 saying "already current"  - 
   the worst possible way to be wrong about a migration. Fixed in all three
   copies of that pattern (`apply-pending-migrations.mjs`,
   `check-pending-schema-reads.mjs`, `headers.spec.ts`).
2. **`free-text-columns-untouched` hardcoded three column names** and would have
   **refused the migration it was built to apply**. It now derives intent from
   the batch by parsing `ALTER TABLE ... DROP COLUMN`.
3. **That derived version still only guarded three names**, so a mutation
   dropping `clients.notes` committed cleanly. It now snapshots every
   pre-existing column and requires each disappearance to have been declared.
4. **`promised-functions-exist` demanded a function the same batch drops.** A
   naive create-set-minus-drop-set cannot tell a REPLACE (0018 drops then
   creates) from a REMOVAL (0017 creates, 0026 drops); it is an ordered state
   walk now, because the last verb on a name is the only thing that decides.
5. **Untyped empty arrays**, which rolled back the first production attempt.

Every one was found by a mutation or by an actual run. That is the argument for
the proof harness existing at all.

## 5. `assertions/0017` deleted, `assertions/0026` added

Files in `scripts/poc-free/local-db/assertions/` run against the schema **after
all migrations**, so they can only describe the END state. 0017's assertion
described a transient one, in its own words: `project_id` NULLABLE "in this
card", the text columns "still present", and a fixture driving the backfill
function. All three are now false by design, and the objects it read are gone.

Everything it checked that still exists was carried into 0026's: the RESTRICT
foreign key, the index, and the exactly-one-`create_outbound_issue` check. What
is genuinely gone is the backfill fixture, because the function it drove is gone.

## 6. Code changes, and one thing deliberately left alone

The columns had readers. `lib/data/outbound.ts` lost its pre-phase-3 select list
and now takes both names from the joined project and client; `products.ts` joins
through `projects → clients` for the movement context;
`lib/data/outbound-actions.ts` and `components/outbound/OutboundScreen.tsx` lost
the free-text fallback branch entirely, and `listClientsAndProjects` was deleted,
which its own comment predicted the moment the migrations applied.

**`unassigned_issue_count()` was left in place.** It counts issues with no
project, which is now impossible, so it is a constant zero. The screen degrades
correctly on its own: `ClientTabs` renders the notice only when the count is
above zero, so the warning disappears exactly when the condition it warns about
becomes unreachable. Retiring the function is a later card, not this one.

**The RPC signature was not reshaped.** `p_client_name` and `p_project_name` are
accepted and ignored. Making it three arguments would mean a second
`DROP FUNCTION` and would trip the applier's own signature assertion, and
adjusting an assertion so one's own migration can pass is the single thing the
apply discipline forbids. The application already passed empty strings for both.
