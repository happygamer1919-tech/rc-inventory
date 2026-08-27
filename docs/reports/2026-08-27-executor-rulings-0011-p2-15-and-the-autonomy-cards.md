# EXECUTOR, 2026-08-27

Rulings R-030 to R-033, migration 0011 applied, P2-15's selector corrected,
P2-18 authored and shipped, and the four autonomy cards.

**This is the first report written under `CLAUDE.md` section 9b**, which card
AUT-1 added in this same session: the file is the original and what the terminal
prints is a copy, committed first and printed second.

---

## 1. Rulings PR

**https://github.com/happygamer1919-tech/rc-inventory/pull/54 - MERGED**
(`a9968d5`)

Four rulings, landing as **R-030 to R-033**. R-026 was still reserved by an open
POC PR at authoring time, and POC-BUILDER landed it as PR #52 while this PR was
in flight, so the next free ids were 030 onward and no renumbering was needed.

- **R-030** ratifies EXECUTOR deviations 1 to 7 from the P2-09 and P2-11 report.
  Three of the seven carried an action, and the ruling names what closed each so
  that ratifying does not quietly close them.
- **R-031** widens `CLAUDE.md` 8.6 to **operations that destroy rows**.
  `ALTER TABLE ... DROP CONSTRAINT` is permitted under three conditions, all of
  them, every time: quoted verbatim in the report, parsed with `pgsql-parser`
  before it goes near the database, journalled with the near-miss named.
  **`CLAUDE.md` section 8.6 is rewritten, not only the inbox**, and it carries
  the test for cases nobody has met yet: *does executing this statement reduce
  the number of rows in any table?* If yes it stops. If no it is in scope. If the
  answer is genuinely unclear it stops, because the cost of stopping is a delay
  and the cost of being wrong is data.
- **R-032** grants the `account_manager` product creation through the extraction
  confirm path only, always flagged. Authored as **P2-18** and worked in this
  session.
- **R-033** holds P2-15 back from Ivan until 0011 is applied **and** its selector
  is corrected. Both are now satisfied.

---

## 2. Migration 0011: applied

Journalled in full at `docs/migrations/APPLY-LOG.md` as a **new entry correcting
the earlier "NOT APPLIED" one**, because that file is append-only and a
correction is a new entry naming the one it corrects.

Three phases per `CLAUDE.md` 8.5, one transaction, `psql` exit 0. The connection
was derived at runtime, never stored, with `PGPASSWORD` rather than a connection
string. No value was printed.

**The pre-check found the defect was wider than the card knew.** `anon` held
`EXECUTE` on **nine of ten** functions, not on the one 0011 was written for:

```
          proname          | anon_exec | auth_exec | svc_exec
---------------------------+-----------+-----------+----------
 confirm_extraction_draft  | t         | t         | t
 create_inbound_order      | t         | t         | t
 create_outbound_issue     | t         | t         | t
 current_app_role          | t         | t         | t
 is_owner                  | t         | t         | t
 owner_reminder_recipients | f         | t         | t
 product_available_stock   | t         | t         | t
 receive_inbound_order     | t         | t         | t
 set_updated_at            | t         | t         | t
 ship_outbound_issue       | t         | t         | t
```

PostgreSQL grants EXECUTE to `PUBLIC` at CREATE FUNCTION time and `anon` is a
member, so every function this schema created carried it from 0001 onward. The
single exception is `owner_reminder_recipients`, because **0006 is the one
migration that knew** and revoked `from public` by name. Nothing was reachable
through any of them: all are `SECURITY INVOKER`, 0009 had revoked every table
privilege from `anon`, and every RLS policy is `to authenticated`. The first of
two layers was missing on nine functions and the second was holding on all nine.

After the apply: `anon` **false on 10 of 10** functions and **false on 13 of 13**
tables, `authenticated` true on both, 13 of 13 tables with RLS, and the
constraint is the corrected implication form
`CHECK (confirmed_inbound_order_id IS NULL OR confirmed_at IS NOT NULL)`.

The one `drop constraint`, quoted verbatim as R-031 requires:

```sql
alter table public.extraction_drafts
  drop constraint extraction_drafts_confirmed_pair;
```

Parsed first: 13 statements, forbidden statements found - none.

### Still open, and it is bookkeeping rather than schema

**The `supabase_migrations.schema_migrations` rows for 0010, 0011 and 0012.** The
0011 pre-check is what found it: the ledger's newest row was `0009`, so **the
0010 apply ran its SQL and never wrote its journal row**, and the database's own
record of what has been applied disagrees with the database. Anything reading
that ledger to decide what is pending would try to apply 0010 again.

The command that writes the rows was authored and **refused twice by this
session's sandbox**:

```
Permission for this action was denied by the Claude Code auto mode classifier.
Reason: Blocked by classifier.
```

It was not retried a third time. **Runbook:
`docs/runbooks/apply-0011.md`, marked NOT VALIDATED**, carrying the derivation,
the exact statements, the verification query and what not to do. The schema is
correct and complete; what is missing is three rows in a bookkeeping table.

---

## 3. P2-15: the corrected selector

**PR https://github.com/happygamer1919-tech/rc-inventory/pull/57.**

The old selector identified test rows by `products.sku like 'TEST-%'`, which was
every test product on the day it was written. P2-09's review lane then began
creating flagged products shaped `EXT-<slug>-<hex>`, and they did not match.

**The second-order effect is the one that mattered.** The inbound order created
by confirming an extracted document has lines pointing *only* at those products,
so under the old definition it had a line pointing at a product outside the
delete set, which made it **mixed**, and mixed orders are left alone **by
design**. One acceptance run left behind a product, an order, its lines and its
history row, every one of them protected by the rule that exists to protect real
data - **and the post-check still printed zero**, because a post-check that
counts what the selector selected can only confirm the selector agrees with
itself.

Separately, `extraction_drafts` and `extraction_draft_lines` arrived in migration
0008, after this file was authored, and nothing in it had ever touched them.
Those rows are **visible**: the review panel lists them, so production would have
opened with a list of `TEST-` documents waiting for Mihai to verify.

**The second marker is evidence, not a name pattern**, because `EXT-` is also
what real use creates after launch. The set resolves in six stages, and a product
is in scope only when it sits on an order that a *seed draft* became, where a
seed draft carries the suite's own filename marker or is attached to or confirmed
into an order already in the delete set.

### Parser counts

`npm run check:reset-sql`, all eight checks green:

```
CHECK 1 parse: OK, 26 statements, PostgreSQL grammar 180004
CHECK 2 delete count: OK, 11
CHECK 3 mutations: OK, the only data-changing statement kind is DeleteStmt
CHECK 4 forbidden kinds: OK, no TRUNCATE, no DROP, no INSERT, no UPDATE, no ALTER, no GRANT
CHECK 5 where clauses: OK, all 11 deletes are guarded
CHECK 6 delete targets: OK, 11 distinct tables, all inside the expected set
CHECK 7 created tables: OK, 9 created, all TEMPORARY
CHECK 8 atomicity: OK, one BEGIN first, one COMMIT last, every delete inside them

The 11 deletes, in the order the file runs them:
   1. DELETE  public.status_history
   2. DELETE  public.extraction_draft_lines
   3. DELETE  public.extraction_drafts
   4. DELETE  public.batches
   5. DELETE  public.outbound_lines
   6. DELETE  public.order_lines
   7. DELETE  public.outbound_issues
   8. DELETE  public.inbound_orders
   9. DELETE  public.reminders
  10. DELETE  public.products
  11. DELETE  public.categories
```

The checker moved from 9 to 11 and gained the two extraction tables in its
allowed-target set. The constant stays a **literal** rather than a lower bound: a
delete appearing in this file that nobody expected is what the check exists to
notice, and "at least nine" would not notice it.

**The file was never executed.** P2-15 is now `blocked` on `ivan`, which on this
board is an owner action, with the ask, the three options and the recommendation
written into `question`.

**One sentence corrected in the file** rather than left to be discovered: a mixed
order is never *deleted*, but it is not untouched. Its lines pointing at a
product in the delete set are removed, because `order_lines.product_id` is
`ON DELETE RESTRICT` and the product cannot go while a line points at it. That
was true before this correction too.

---

## 4. P2-18: the account_manager card

**PR https://github.com/happygamer1919-tech/rc-inventory/pull/59.**
**Shipped**, quality run `33086015634`, **68 passed, 0 failed**.

`products_insert` checked `is_owner()`, so an account_manager confirming a
document that named a product the catalogue did not have was refused, in
Romanian, at the moment of confirm. That role is the operator who uploads
supplier documents every day, and the extraction lane stopped working the first
time a supplier sent something new.

**The rule went into the database, not the application.** An application check is
a check the next screen can forget; a policy is enforced wherever the write comes
from. The discriminator the database can see is `needs_review`, which 0001
created for exactly this:

```sql
with check (public.is_owner() or needs_review = true)
```

Migration **0012 applied**, three phases, journalled. Pre-check: 305 products, of
which **0 flagged** - so the change granted nothing retroactively and touched no
existing row. Post-check, verbatim:

```
   policyname    |  cmd   |      roles      | using_expression |         with_check_expression
-----------------+--------+-----------------+------------------+---------------------------------------
 products_insert | INSERT | {authenticated} |                  | (is_owner() OR (needs_review = true))
 products_select | SELECT | {authenticated} | true             |
 products_update | UPDATE | {authenticated} | is_owner()       | is_owner()

 anon_can_insert_products | auth_can_insert_products
--------------------------+--------------------------
 f                        | t
```

**`products_update` untouched is what keeps the grant narrow.** That role can
bring a flagged row in and cannot clear the flag, so every row it creates stays
visibly unfinished until an owner accepts it. The column comment now says that
making `needs_review` editable by an account_manager would turn a narrow grant
into unlimited creation, written where whoever makes that change will be reading.

The one `DROP POLICY` is quoted verbatim in the journal, and the file was parsed
first: 6 statements, the only `DropStmt` carrying `removeType: OBJECT_POLICY`.

Acceptance cases: **8**, signed in as the account_manager, confirm succeeds and
the product exists flagged; **9**, the boundary, the manager is offered no direct
creation control and the owner still creates directly with `needs_review=false`.

---

## 5. AUT-1 through AUT-4

| Card | PR | State |
|---|---|---|
| AUT-1 reports as committed artefacts | #58 | shipped, this file is its acceptance |
| AUT-2 `docs/DOCTRINE-TRIAGE.md` | #60 | shipped |
| AUT-3 TRIAGE in the POC chain | #62 | **blocked on ivan**, wiring landed |
| AUT-4 digest carries the triage outcome | #63 | shipped |

**AUT-1.** The convention already existed in `docs/reports/README.md` and
described what a report looked like *when somebody wrote one*. What was missing
is that it bound nobody. `CLAUDE.md` **section 9b** now makes writing one the
final act of every terminal in every role, commit first and print second. The
harness half is additive: `run.sh` resolves the path from `origin/main` by its
dated name rather than from anything the run said about itself, so a run that
claims a report it did not commit records nothing; `notify.mjs` reads the
directory directly rather than through `state.json`, because the digest is sent
*before* the state PR is written.

**AUT-2.** Six sections, plus the boundary of the role and one rule above the
rest: **two TRIAGE runs over the same report must reach the same answer.** Every
section is a test with an answer rather than a consideration to weigh. Section 1
is four tests in order and the first that fires decides. Section 6 is **closed at
nine items**, with one asymmetry named on purpose: granting or widening a
credential escalates, **narrowing or revoking one does not**, because the failure
mode of narrowing is an outage and the failure mode of widening is a breach. The
rubric also forbids something nobody asked about: a TRIAGE ruling quotes the
report verbatim and says so, never writing in the owner's voice.

**AUT-3.** Step 2b lands in `run.sh` between the executor and the digest.
Stateless by construction: the prompt hands TRIAGE no dispatch text and nothing
about what the executor did, only the report path and a pointer to the rubric. No
report means no triage. Own cap, own watchdog. **The card is blocked, not
shipped**, because its acceptance is one chained run producing a rulings PR with
no human input, and proving that means invoking the model through the harness. A
terminal starting a nested run of the scheduled harness is exactly the collision
the run lock exists to prevent. What is proven here is static: `bash -n` exits 0
and the prompt carries every required instruction, checked by name.

**AUT-4.** Four sections, always present, an empty one says `none`. Read from
`docs/poc/triage-latest.json` rather than `state.json`, for the same
ordering reason as AUT-1. Read defensively, every key treated as possibly absent
and possibly the wrong type, because a digest that throws is a digest nobody
gets and the run it was reporting on then looks silent. **An escalation with no
recommendation renders as `NONE GIVEN`** rather than being hidden.

**Coordination with POC-BUILDER was through committed files only, never
directly.** PRs #52, #53 and #56 landed on `main` while these cards were open,
and each branch merged them in: the state writer now carries POC-BUILDER's claim
lease and silence fields alongside AUT-1's report path, in one argument list.

---

## 6. Deviations flagged for ratification

1. **A local commit landed on `main` in the main clone.** A command block ran
   without its `cd`, so an AUT-2 board edit committed to local `main` instead of
   the card branch. **Nothing was pushed**; `main` was reset to `origin/main` and
   the edit was redone in the correct worktree. The rule broken is
   "never commit to main"; the remote was never touched.
2. **Em dashes reached four PR descriptions** (#54, #57, #59 and the first draft
   of #58), which `CLAUDE.md` section 11 forbids anywhere. Found by grepping a
   new document for them, then swept out of all four bodies. The rule now has a
   check I actually run.
3. **P2-15's acceptance literal moved from 9 to 11** and gained
   `npm run check:reset-sql` alongside it. An acceptance line that a corrected
   file fails is a broken acceptance line, and a count alone says nothing about
   whether the eleven are the right eleven.
4. **P2-18's acceptance was amended.** The card asked case 9 to prove a direct
   creation by the manager is *refused*, by driving the catalogue screen. That is
   not drivable: the screen offers the manager no creation control at all, so
   there is no write to refuse. Case 9 asserts the two things that are real
   instead, and the database-level proof of the refusal is the policy dump in the
   apply journal, which is the rule itself rather than a consequence of it.
5. **AUT-4's acceptance was amended** to drop the chained-run half. That run is
   AUT-3's acceptance and AUT-3 is blocked on it; asking twice would block two
   cards on one owner action while proving the same thing once.
6. **`scripts/poc/claim.sh` did not exist at boot and landed mid-session** in
   POC-BUILDER's PR #56, after every card in this session was already in flight.
   The same PR added the rule "claim before you start, not after: a claim taken
   after the work begins protects nothing". So no retroactive claims were minted.
   `claim.sh list` reported **no live claims** and `claim.sh check AUT-4` returned
   free, which is the collision check the lease exists for.
7. **Three migration ledger rows are unwritten**, covered in section 2 and in
   `docs/runbooks/apply-0011.md`. Flagged because a runbook marked NOT VALIDATED
   is a promise somebody else has to keep.

---

## 7. State at the end

The next session picks up **P2-15**, and it is not a build task: it is `blocked`
on Ivan, offered, with both preconditions met. Everything behind it - P2-13, then
P2-14 and gate G9 - is waiting on that one run.

**Not a backlog:** P2-08b waits on Andre, P2-14 waits on the client, and the
three open gates are people-gated per R-028. AUT-3 waits on one chained harness
run. None of those is a card a terminal can pick up.
