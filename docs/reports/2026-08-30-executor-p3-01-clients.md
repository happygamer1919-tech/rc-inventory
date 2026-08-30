# EXECUTOR: P3-01, public.clients. The first migration in this repository a PostgreSQL read before it was merged.

**Date:** 2026-08-30
**Role:** EXECUTOR
**Branch:** `card/p3-01-clients`, cut from `origin/main` at `99d26f1`
**Card:** P3-01, plus ruling R-062 and card P3-27
**Migration files added:** `supabase/migrations/0013_clients.sql`

---

## 0. Boot

Phase 3 board read at `99d26f1`, 30 cards, gate 0 of 9. Next eligible card by
the lowest-id rule: **P3-01**, `depends_on []`, `blocked_on null`. Claimed as
`executor` through PR #103, merged as `952bce4`, before the work began.

**A note on that claim, so the next reader is not misled by it.** A phase 3
claim currently protects against nothing that exists: the harness reads
`docs/board/rc-board-phase2.json` by path in `run.sh`, `inbox.mjs` and
`notify.mjs`, and R-061 deliberately did not repoint it. The lease is real
bookkeeping against a second interactive terminal and nothing else. It was taken
because the dispatch says to and because it costs one command, not because it is
load-bearing today.

---

## 1. What shipped

`public.clients`, the root of the CRM. Every column, index, policy and label is
the one P3-01's `defaults` fixed, so there is nothing in this section worth
re-deciding: an enum `client_type` of exactly `company` and `individual`; a
nullable `fiscal_code` labelled IDNO with a PARTIAL unique index; a non-unique
`name` with a case-insensitive index for search; `active` meaning hidden from
pickers and present in history; RLS with select, insert and update policies and
**no delete policy**; anon revoked.

**No screen, no route, no component.** The card is schema-only on purpose, and
says why: a schema card that also ships a screen cannot be reverted without
reverting the screen.

---

## 2. The acceptance was SPLIT, and that is ruling R-062

P3-01's acceptance asked for a **migration journal after an apply to
production**, plus an APPLY-LOG entry. The dispatch says the opposite, twice:

> Migrations: author, prove against the AUT-14 shim, commit the proof in the
> report, merge the file. The APPLY step against production is a separate
> blocked card per 8.6.
>
> STOP: nothing in this dispatch requires a database connection.

**Every assertion in that journal except the words "on production" is now
checked on every push.** The production half moved to **P3-27**, verbatim, and
was not dropped. R-062 records it.

**Note what section 8 actually says, because the card being blocked could be
misread.** Section 8 has NOT been revoked. R-001 still grants EXECUTOR a
temporary apply while the project holds zero real client data, P2-13 has not
run, and 8.7 has not fired. **P3-27 is blocked by a sentence in a dispatch, not
by the rules**, and its `question` says so, so that a future reader does not
conclude the grant lapsed.

---

## 3. The proof, and it is more than the card asked for

### 3.1 The migration applies to a real PostgreSQL, which is new for this repository

```
$ npm run check:migrations
docker server 29.4.2
shim applied
applied 0001_phase2_schema.sql
...
applied 0012_manager_flagged_products.sql
applied 0013_clients.sql

13 migration files applied, unmodified, on postgres:16
asserted 0013_clients.sql
1 assertion files passed
EXIT=0
```

**0013 is the first migration in this repository that a PostgreSQL executed
before it was merged.** 0001 to 0012 were merged and applied with no parser or
server having read them: P2-15 shipped SQL with its own card admitting "there is
no PostgreSQL binary and no running Docker on this machine". AUT-14 shipped
three hours ago and this is the first card to spend it.

### 3.2 The assertions raise, they do not print

`scripts/poc-free/local-db/assertions/0013_clients.sql` runs after every
migration and raises on: the table absent; `rowsecurity` not true; a policy
count other than 3; the three policies not being exactly SELECT, INSERT and
UPDATE; **any** delete policy, asserted separately by name rather than left
implied by the count; anon holding any privilege; `authenticated` not holding
SELECT; `client_type` not being exactly `(company, individual)`;
`clients_fiscal_code_unique` absent; `clients_set_updated_at` absent.

Then it exercises the rules rather than reading the catalogue, inside a
transaction it rolls back: a duplicate `fiscal_code` must be refused; two
individuals with a null `fiscal_code` must both insert; two companies may share
a name; the default type is `company`; and the `updated_at` trigger must MOVE
`updated_at`, asserted against the old value rather than against `now()`,
because a column defaulting to `now()` would satisfy a comparison with `now()`
while the trigger did nothing at all.

**`apply.mjs` now runs every `.sql` in that directory, in filename order.** That
makes it a regression suite as well as an acceptance: a later migration that
quietly drops a policy, grants anon a privilege or removes a trigger fails on
the pull request that does it.

### 3.3 Five mutations, each proved to fail

A check that has only ever passed is not a check.

| # | mutation of `0013_clients.sql` | result |
|---|---|---|
| 1 | `grant select on public.clients to anon` | **caught**, `anon must hold no privilege on public.clients, found 1 grants` |
| 2 | a delete policy added | **caught**, `expected exactly 3 policies on public.clients, found 4` |
| 3 | the `updated_at` trigger dropped | **caught**, `expected trigger clients_set_updated_at, found 0` |
| 4 | `enable row level security` removed | **caught**, `expected rowsecurity true on public.clients, found false` |
| 5 | `clients_fiscal_code_unique` dropped | **caught**, `expected index clients_fiscal_code_unique, found 0` |

---

## 4. The mutation that came back green, which is the useful part of this card

**Mutation 1 was originally "delete the `revoke all on table public.clients from
anon` line". It passed.** An assertion about the security property every
migration in this repository spends a paragraph on was not checking anything.
Two separate causes, and both were worth finding.

### 4.1 The shim did not reproduce Supabase's default privileges

A Supabase project sets `ALTER DEFAULT PRIVILEGES` so that anon, authenticated
and service_role are granted on every table created in `public` **at CREATE
TABLE time**. Nothing in a migration does it; it is already there when the first
one runs. On a bare `postgres:16`, anon is granted nothing, so "anon holds
nothing on this table" was true for **every** table whether or not any migration
said so, and 0001's entire GRANTS section was being validated against a database
where it could not fail.

`shim.sql` now carries the three statements, with a comment naming this as the
least obvious object in the file. **This makes 0001 through 0008 faithful**,
where the revokes genuinely are load-bearing.

### 4.2 Even with that fixed, deleting the line still passes, and correctly

Migration **0009** already ran:

```sql
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
```

So every table created in this schema after 0009 starts closed, and **0013's
explicit revoke has been decoration since the day 0009 landed.** P3-01's
`defaults` said to revoke anon explicitly "because Supabase grants anon at CREATE
TABLE time", which was true of 0001 through 0008 and has not been true since.

**The line stays**, with a comment in the migration saying it is a no-op, that
0009 is what closes this, and why it is kept anyway: if a future migration ever
re-grants the anon default privilege, every table that declared its own revoke is
still closed and every table that relied on 0009 is open. The comment exists so
nobody deletes it believing it was load-bearing, and nobody keeps it believing it
is.

**The mutation was corrected to the one that actually exercises the assertion**,
granting anon SELECT, plus a control asserting that deleting the redundant
revoke still passes. Both are in the table above and in the script.

### 4.3 The general rule, which is now a LEARNINGS entry

**A mutation test must remove the thing the assertion is about, and "remove the
line" is not always that thing.** When a mutation comes back green the first
question is whether the assertion is weak and the second is whether the mutation
was. Both were here, and the second taught more.

**A local test double must reproduce the AMBIENT state of the real system, not
only its objects.** Default privileges, ambient grants and role memberships are
invisible in a schema dump and are exactly the ground a negative security
assertion stands on. A double that omits them turns every such assertion into a
tautology.

---

## 5. P3-27, the apply card

One card for the wave, `blocked_on: ivan`, `depends_on []`.

**One and not five, which is a judgement call worth seeing.** The dispatch says
"a separate blocked card", singular, and does not say per file or per wave. Five
near-identical blocked cards would be five lines on the owner board saying the
same sentence, answered in one sitting anyway because that is how somebody
applies migrations. **No `depends_on` edges**, deliberately: an edge per schema
card would make it ineligible until the whole wave landed, and the owner may
reasonably want to apply what exists rather than wait. The pending file list
lives in the `question`, where he reads it, and grows as wave 1 lands.

Its `question` carries three options and a recommendation, per section 4: wait
for the wave, then either Ivan applies by hand or he lifts the no-connection
instruction and EXECUTOR applies under the normal three-phase 8.5. **`IMPACT IF
UNANSWERED` is the honest one**: nothing is blocked immediately, because every
wave 2 screen card tests against the local stack in CI anyway. What stays blocked
is anything the owner can SEE, which is the complaint wave 1 exists to answer.

---

## 6. The check that turned red, and why the fix made it stronger

The first push of this card failed `quality` in the Playwright suite:

```
1) [productie] > headers.spec.ts:128 > 5. jurnalul de aplicare are o intrare pentru fiecare migratie
   Error: migratia 0013_clients.sql nu are intrare in APPLY-LOG.md
   71 passed, 1 failed
```

Run `33332817113`. **Nothing was wrong with the migration or with the log.**
Test 5, added by R-013 after `0006` was found applied and nobody could say by
whom, asserted that every file in `supabase/migrations/` has an entry in
`docs/migrations/APPLY-LOG.md`. **That was true for four days and R-062 had just
made it false**, on purpose: a merged migration file is no longer an applied
migration.

**The fix is a stronger invariant, not a relaxed one.** `APPLY-LOG.md` gains a
PENDING register in a fixed machine-read format naming the file and the card
that will apply it, and the test now asserts that every migration file is in
**exactly one** of the two places:

| case | before | after |
|---|---|---|
| a file with no entry anywhere | fails | fails |
| a file listed as applied that was not | **passes** | fails |
| a file in both places | **passes** | fails |
| a pending line naming a file that does not exist | **passes** | fails |

All three of the new failures were proved to fail before this was pushed, by
mutating the log and re-running the parse. P3-27's `defaults` now carry the rule
that an apply removes its own pending line in the same pull request, so the
register cannot rot.

**That is one failed attempt on this card, of the three the failure ceiling
allows**, and it is recorded rather than quietly fixed because the general shape
is worth more than the incident: **a test is where an obsolete assumption
survives longest.** It keeps passing, so nobody rereads it, and the day it fails
it looks like a defect in the new work rather than a stale premise in the old
check.

---

## 7. The drop-after-backfill instruction needed nothing

The dispatch says P3-04 and P3-05 backfill without dropping the old column, and
the drop is its own card after backfill verification. **That is already board
structure**: P3-04b and P3-05b exist as separate cards, each carrying the drop in
its own migration, each `depends_on` its backfill card and P3-10. Authored before
this dispatch, verified rather than assumed, and recorded so nobody implements it
twice.

---

## 8. Checks

| check | result |
|---|---|
| `ls supabase/migrations/0013_clients.sql` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run check:migrations` | exit 0, 13 files, 1 assertion file passed |
| five mutations of the migration | all five caught, plus one control that correctly passes |
| `node docs/board/validate-board.mjs` on all three boards | PASS, 0 violations each |
| `npm run check:conflict-residue` | 3 checks passed |
| em dash or en dash in any file touched | zero |
| secret staged | none |

---

## 9. Production writes

**None.** `docs/PRODUCTION-WRITES.md` gets no row and
`docs/migrations/APPLY-LOG.md` gets no entry. The only database this pull
request touches is a container it starts and removes in the same process, and
`apply.mjs` takes no host argument and reads no database environment variable,
so it cannot be pointed anywhere else.

---

## 10. Learnings appended

One entry: **the shim made "anon holds nothing" vacuously true, and only a
mutation found it.** It carries both rules from section 4.3.

---

## 11. Next

Next eligible on the phase 3 board once this merges: **P3-02** (contacts,
`depends_on [P3-01]`) and **P3-05** (suppliers, `depends_on []`). P3-02 is the
lower id and is taken next. Next free migration number: **0014**.
