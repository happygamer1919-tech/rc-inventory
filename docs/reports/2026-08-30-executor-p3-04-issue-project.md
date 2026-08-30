# EXECUTOR: P3-04, the destination stops being typed text. Three assertions that did not bite, all found by mutation.

**Date:** 2026-08-30
**Role:** EXECUTOR
**Branch:** `card/p3-04-issue-project`, cut from `origin/main` at `afe4f88`
**Card:** P3-04
**Migration files added:** `supabase/migrations/0017_outbound_project_id.sql`,
`supabase/migrations/0018_outbound_issue_project_write.sql`

---

## 0. Boot

Phase 3 board read at `afe4f88`. P3-01, P3-02 and P3-03 `shipped`, so **P3-04**
is the lowest-id eligible card. Claimed as `executor` through PR #109 before the
work began.

---

## 1. What shipped, and why it is two migrations

`outbound_issues.project_id`, nullable, backfilled from the free-text
destination, with `client_name` and `project_name` **untouched**. Plus the
screen, which is the half that makes the fix hold.

**0017 backfills the history. 0018 stops the null set growing again.** Without
0018 the gap shrinks once and the very next issue reopens it, because nothing in
0017 changes what a NEW issue records. That is the whole reason the card also
carries a screen.

**The rule this card exists to demonstrate is in its acceptance line:**
`client_name` and `project_name` are still present, asserted by name. A backfill
and a drop in one file mean an incorrect match is unrecoverable the moment it is
applied, because the evidence it was matched against is gone in the same
statement. The drop is P3-04b, gated behind this backfill being verified against
real rows.

---

## 2. The shim caught a real migration defect before a human ran the file

```
FAILED: supabase/migrations/0017_outbound_project_id.sql
ERROR:  function min(uuid) does not exist
LINE 6:     min(p.id) as project_id,
```

**PostgreSQL has no `min(uuid)`.** The backfill would have failed on the owner's
production apply, in the middle of a three-phase run, on a statement that reads
correctly in every editor. It is `(array_agg(p.id))[1]` now, and the
`having count(*) = 1` guarantee makes any picker the same one.

**This is the first migration defect in this repository caught by a machine
before a human ran the file**, and it is exactly what AUT-14 was built for, one
day after it was built.

---

## 3. The matching rule, and the case the card did not name

Fixed by P3-04 and not widened: folded, trimmed, whitespace-collapsed
`client_name` equals a client's folded name, **and** folded `project_name` equals
the folded name of a project **belonging to that client**. Nothing fuzzier. No
trigram similarity, no edit distance, no closest match, because **a wrong
automatic match on a cost row is worse than a null: a null is visible and a wrong
match is not.**

**The fold is a database function**, `public.fold_text`, not an inline
expression, so the backfill and the write path cannot drift apart. **No
extension:** `unaccent` is a `CREATE EXTENSION`, which 0001 deliberately avoided;
`translate` covers Romanian exactly, including the legacy cedilla forms older
documents carry, and it is IMMUTABLE so it can be indexed.

**THE HARD CASE IS NOT IN THE CARD TEXT.** `clients.name` is deliberately **not**
unique: P3-01 allows two legally distinct companies to share a trading name,
because the IDNO is what separates them. So a folded client name can match two
clients, and the pair can match two projects. The backfill must **refuse to
choose**, which is the `having count(*) = 1` guard, and the fixture carries that
exact row. Recorded here because it is a case a reader would assume was
impossible.

---

## 4. Three assertions that did not bite, and one design change

This is the useful part of the card. Twelve mutations were written; the first
run caught seven, and every one of the five misses was a defect in the test
rather than a weak spec.

### 4.1 The test was proving its own copy of the backfill

The backfill is one UPDATE inside a migration, and it meets zero rows on a fresh
container. So the assertion file built a fixture of ten typed destinations and
ran **its own copy of the UPDATE**, character for character, against them.

**Three mutations of the matching rule came back green**: matching on the project
name alone, removing the ambiguity guard, and removing the idempotency guard.
None of them touched the assertion file, so none of them changed a single
character of what the test executed.

**The fix is to move the code, not to copy it.** The backfill is now
`public.backfill_outbound_project_ids()`, created and called once by the
migration, and the assertion calls that function. All three mutations are caught.

It is a better migration for a reason unrelated to testing: **the reconciliation
pass will want to re-run the backfill** after a human adds the missing clients
and projects, and a statement buried inside an applied migration cannot be
re-run.

### 4.2 A mutation that did not apply looked identical to a weak assertion

A regex that silently matches nothing produces an unchanged file, a passing run,
and a "NOT CAUGHT" line indistinguishable from a real miss. It happened four
times across P3-01 and P3-04, and one cost a real investigation into an
assertion that turned out to be fine.

The runner now snapshots the file before editing and **refuses to score the
result if the bytes are unchanged.** It found two stale patterns on its first
run, both left behind by the refactor in 4.1.

### 4.3 Two PL/pgSQL traps, both of which read correctly

**`<>` against a nullable column is not an inequality test.** The check that the
issue recorded its project was `if got.project_id <> 'd000...' then raise`.
Mutating 0018 to write `null` **passed**: `NULL <> 'x'` is NULL, the `IF` does
not fire, and a write path that recorded nothing satisfied the check written to
catch exactly that. It is `is distinct from` now.

**A failure raised inside the block that catches failures is caught by it.** The
stock-refusal check wrote `raise exception 'this should have failed'` inside a
block whose handler was `when sqlstate 'P0001'`. Bare `raise exception` defaults
to errcode P0001, which is the same code `create_outbound_issue` uses for its own
refusals, **so the alarm was swallowed by the handler it was written next to.**
Both such blocks now set a boolean inside the handler and assert after the block.

### 4.4 A third redundant guard, and this one is redundant in an interesting way

Mutation 5 removed `and oi.project_id is null` from the backfill's outer WHERE
and passed. Removing only the inner `where i.project_id is null` also passed.
**Each is redundant while the other is present**: the inner clause decides which
rows are CONSIDERED and the outer decides which are WRITTEN, so removing one
leaves the other doing the job. That is defence in depth working as intended.

Both stay, with a comment saying so, and the mutation was changed to remove both
at once, which is caught. That is the third redundant line this wave has found by
deleting it, after P3-01's `revoke ... from anon` and P3-03's CHECK null guards,
and all three were kept for the same reason: they say what the rule is.

---

## 5. Twelve mutations, all caught

| # | mutation | error |
|---|---|---|
| 1 | `project_id` added NOT NULL | `project_id must stay NULLABLE in this card` |
| 2 | the foreign key CASCADES | `expected ... ON DELETE RESTRICT, found ... CASCADE` |
| 3 | the backfill matches project name alone | `IES-T-001 was not matched by the backfill` |
| 4 | the ambiguity guard removed | `IES-T-009 was matched and must not have been` |
| 5 | **both** idempotency guards removed | `the backfill overwrote a hand-reconciled row` |
| 6 | the fold drops the legacy cedilla letters | `did not fold the legacy cedilla diacritics` |
| 7 | the fold stops collapsing whitespace | `did not trim and collapse whitespace, got [bloc   a]` |
| 8 | the fold declared STABLE | `fold_text must be IMMUTABLE, found volatility s` |
| 9 | 0018 does not drop the old function | `expected exactly ONE create_outbound_issue, found 2` |
| 10 | 0018 takes names from the caller | `null value in column "client_name" ... violates not-null` |
| 11 | 0018 loses the 0004 stock check | `an issue overdrawing stock was accepted` |
| 12 | 0018 never writes `project_id` | `the write path did not record the project, got null` |

**Mutation 11 is the one worth keeping.** This card rewrote the body of
`create_outbound_issue`, and the one thing that must not have been lost while
that file was open is the under-lock refusal that protects the warehouse.

---

## 6. The DROP FUNCTION, declared rather than discovered

0018 contains:

```sql
drop function if exists public.create_outbound_issue(text, text, text, jsonb);
```

The function gains a fifth parameter, which changes its signature, so
`create or replace` would leave the four-argument version in place and every
existing call would then be **ambiguous**: PostgreSQL raises "function is not
unique" rather than choosing, and that failure would surface at the first
outbound issue somebody tried to create.

**`CLAUDE.md` 8.6 permits this and says so in terms.** The test that section
names is: does executing this statement reduce the number of rows in any table?
It does not. It removes a rule about rows, the same class as `DROP INDEX` and
`DROP POLICY`, under three conditions: the statement quoted verbatim in the
report, the file parsed with `pgsql-parser` before it goes near a database, and
the apply journalled with the near-miss named. **All three belong to P3-27**,
where the file is applied, and its `question` now carries them.

---

## 7. The screen: one picker, not two

The destination was two creatable free-text comboboxes writing two strings
nothing linked to a record. It is now **one required project picker**, and the
client is **read off the project** rather than chosen.

**Two questions with one answer is a way to get it wrong.** A project belongs to
a client and cannot belong to another. The client row stays on screen, because
who the material is going to is the question the operator asks before pressing,
but it is not an input.

**The picker filters out closed and inactive projects and keeps suspended ones.**
A stopped site still takes a delivery sometimes, and hiding it would push the
operator back to free text, which is what this card removes.

**The names are derived server-side, not sent from the browser.** 0018 reads
`client_name` and `project_name` off the chosen project and ignores what the
caller passed, so the text columns and the foreign key cannot describe two
different destinations for as long as both exist. The action passes empty strings
deliberately, and mutation 10 proves the function ignores them.

`lib/data/outbound.ts`'s `listClientsAndProjects` is **deleted**, with a comment
saying where its replacement is. It read distinct destination strings off
`outbound_issues` and would otherwise be the last code treating the destination
as text.

---

## 8. The suite needed data, so it gained a seed script

A required picker cannot be filled in an empty database, and `supabase db reset`
starts from empty. `scripts/seed-test-crm.mjs` writes **one client and one
project with fixed ids**, wired into the quality job after the accounts seed.

**Fixed ids, not generated ones**, because the combobox helper requires EXACTLY
one match and a per-run row would accumulate one per CI run until the helper
started choosing between them. **No DELETE anywhere in it**, per the P2-07
test-data convention: a DELETE written for a test database is a DELETE that one
day runs on a real one.

`outbound.spec.ts` gains a case proving the card: without a project the form
refuses with "Alege proiectul."; the client is not chosen but read off the
project; and the confirmation shows the same pair. Both specs' now-dead
`comboType` helper is removed.

---

## 9. What the owner has to read before applying, and it is on P3-27

**From 0018 onward an outbound issue requires a project, and no screen creates
projects until P3-07 ships.** Between the apply and P3-07, at least one project
row has to exist or the Ieșiri form cannot be submitted.

That is not a defect of this card, it is the order the board is in. Applying 0013
to 0016 without 0017 and 0018 avoids it entirely and is a legitimate way to split
the apply. It is written into P3-27's `question`, with the DROP FUNCTION
conditions and the reconciliation deliverable, so he reads all three before he
runs anything.

---

## 10. Checks

| check | result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run check:migrations` | exit 0, 18 files, 4 assertion files passed |
| twelve mutations | all twelve caught, after three test defects were fixed |
| `node docs/board/validate-board.mjs` | PASS, 0 violations |
| `npm run check:conflict-residue` | 3 checks passed |
| APPLY-LOG pending register | 18 files, 6 pending, each in exactly one place |
| em dash or en dash in any file touched | zero |
| secret staged | none |

---

## 11. Production writes

**None.** Two new pending lines, no apply entry, no row in
`docs/PRODUCTION-WRITES.md`.

---

## 12. Learnings appended

Three entries, all from section 4:

1. **A test that re-implements the thing it tests proves the reimplementation.**
   When a test cannot reach the code under test, move the code; do not copy it.
2. **A mutation that did not apply is indistinguishable from an assertion that
   does not bite.** A negative test needs a positive precondition.
3. **`<>` against a possibly-NULL column is not an inequality test**, and a
   failure raised inside the block that catches failures is caught by it. Both
   read correctly and both pass on the exact input they were written to reject.

---

## 13. Next

Next eligible: **P3-05** (suppliers, `depends_on []`). P3-04b is not eligible: it
depends on P3-04 and P3-10, and P3-10 has not been built. Next free migration
number: **0019**.
