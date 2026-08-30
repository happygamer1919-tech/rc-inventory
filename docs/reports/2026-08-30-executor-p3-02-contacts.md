# EXECUTOR: P3-02, public.contacts. One rule, three ways to get it wrong, all three proved to fail.

**Date:** 2026-08-30
**Role:** EXECUTOR
**Branch:** `card/p3-02-contacts`, cut from `origin/main` at `d16daa5`
**Card:** P3-02
**Migration files added:** `supabase/migrations/0014_contacts.sql`

---

## 0. Boot

Phase 3 board read at `d16daa5`. P3-01 `shipped`, so **P3-02** is the
lowest-id eligible card: `depends_on [P3-01]`, `blocked_on null`. Claimed as
`executor` through PR #105 before the work began.

---

## 1. What shipped

`public.contacts`, the people at a client. Columns, labels and the free-text
`role` decision are exactly what P3-02's `defaults` fixed. Cascade from the
client, RLS with three policies and no delete policy, anon revoked, and the one
rule this table actually has: **at most one primary contact per client**.

---

## 2. The one rule, and the three ways to get it wrong

```sql
create unique index contacts_one_primary_per_client
  on public.contacts (client_id)
  where is_primary;
```

Every character of that is load-bearing, which is why three of the eight
mutations attack it from different directions:

| what changes | what the table then does | caught by |
|---|---|---|
| the `where is_primary` is dropped | **one CONTACT per client**, the opposite of the table's purpose | the index definition assertion |
| the whole index is dropped | two primaries for one client | the index existence assertion |
| it indexes `is_primary` instead of `client_id` | **one primary in the entire system** | the two-clients behavioural check |

**The third is the interesting one.** It would look correct in a diff, it
enforces "at most one primary" in a sentence anybody would nod at, and **a test
that used only one client would pass it forever.** The assertion file inserts a
primary for a second client and requires both to survive, which is the only
thing that separates the two indexes.

**Zero primaries is legal and is asserted too.** A client may have three people
and no designated one, and forcing a choice would make the first contact form
refuse to save.

---

## 3. One decision the card left open, made and recorded

**No trigger auto-clears the previous primary.** A before-insert trigger
demoting the old one would make the handover automatic and would also mean the
unique index **can never fire**, which would make the card's own named
acceptance, "the partial unique index rejecting a second primary contact",
unprovable.

The card asks for a refusal and says the interface clears the old primary in the
same transaction. **The refusal is what is built**, and the assertion file
proves both halves: a second primary is refused on UPDATE and on INSERT, and the
clear-then-set handover works inside one transaction.

This is deliberately the opposite of the call made on P3-13, where a trigger
does enforce the rule. The rules are different shapes. "A sent estimate is
immutable" must be a refusal from the database, because the estimate has left
the building. "At most one primary" is a rule about a flag, and whether a second
one is an error or a silent demotion is a product decision the card already made.

---

## 4. The proof

### 4.1 The migration applies, and its assertions run

```
$ npm run check:migrations
...
applied 0013_clients.sql
applied 0014_contacts.sql

14 migration files applied, unmodified, on postgres:16
asserted 0013_clients.sql
asserted 0014_contacts.sql
2 assertion files passed
EXIT=0
```

**0013's assertions still run**, which is the half of R-062 that keeps paying:
this card's pull request re-proves the previous card's schema, and every card
after it will do the same.

### 4.2 What the assertions check

**Catalogue:** the table; `rowsecurity`; the policies being exactly SELECT,
INSERT and UPDATE; **any** delete policy, asserted by name; anon holding
nothing; `authenticated` holding SELECT; `client_id` referencing `clients(id)`
**ON DELETE CASCADE**, the action asserted and not only the key's existence;
`contacts_client_id_idx`; `contacts_one_primary_per_client` being UNIQUE **and**
PARTIAL on `is_primary`; `contacts_set_updated_at`; and `role` still being
`text`.

**That last one is asserted because a later reader tidying the schema is likely
to "fix" it into an enum**, and P3-02 spends a paragraph on why it must not be:
a role is a description of a person, nothing joins to it, nothing computes on
it, and the real vocabulary on a Moldovan site is longer and less tidy than any
enum authored in advance.

**Behavioural**, inside a transaction that is rolled back: three contacts on one
client; zero primaries legal; a second primary refused on UPDATE and on INSERT;
a different client keeping its own primary; the clear-then-set handover; a
client delete cascading to its people **and leaving another client untouched**;
and four shapes of the same Moldovan phone number stored verbatim, because there
is no normaliser and there must not be one.

### 4.3 Eight mutations, each proved to fail

| # | mutation | error |
|---|---|---|
| 1 | the unique index is not PARTIAL | `must be UNIQUE and PARTIAL on is_primary` |
| 2 | the unique index is dropped | `expected index contacts_one_primary_per_client, found none` |
| 3 | the index is on `is_primary`, not `client_id` | `duplicate key value violates unique constraint` |
| 4 | the foreign key is RESTRICT | `expected client_id to reference clients(id) ON DELETE CASCADE, found ... ON DELETE RESTRICT` |
| 5 | `role` becomes an enum | `contacts.role must stay free text per the card, found type client_type` |
| 6 | a delete policy is added | `expected policies for exactly INSERT, SELECT and UPDATE, found DELETE,INSERT,SELECT,UPDATE` |
| 7 | anon is granted SELECT | `anon must hold no privilege on public.contacts, found 1 grants` |
| 8 | RLS is never enabled | `expected rowsecurity true on public.contacts, found false` |

**Mutation 3 fails inside the behavioural block rather than the catalogue
block**, which is the point of having both: no catalogue read distinguishes
`(client_id) where is_primary` from `(is_primary) where is_primary` as a
statement about correctness. Only inserting a second client's primary does.

---

## 5. One thing tidied while writing, and it is worth naming

The phone-format check was first written to reuse rows inserted earlier in the
file, which the cascade check had by then deleted, so it ran inside an
`if n = 0` branch. It passed, and it was **a check whose subject may or may not
exist depending on an earlier assertion**, which is a check nobody can reason
about six months later. It now inserts its own four rows unconditionally.

---

## 6. Checks

| check | result |
|---|---|
| `ls supabase/migrations/0014_contacts.sql` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run check:migrations` | exit 0, 14 files, 2 assertion files passed |
| eight mutations of the migration | all eight caught |
| `node docs/board/validate-board.mjs` on all three boards | PASS, 0 violations each |
| `npm run check:conflict-residue` | 3 checks passed |
| APPLY-LOG pending register | 14 files, 13 applied entries, 2 pending, each file in exactly one place |
| em dash or en dash in any file touched | zero |
| secret staged | none |

---

## 7. Production writes

**None.** `docs/PRODUCTION-WRITES.md` gets no row.
`docs/migrations/APPLY-LOG.md` gets no apply entry, and gains one pending line:
`0014_contacts.sql`, card de aplicare P3-27.

---

## 8. Learnings appended

**None.** This card hit no defect. Eight mutations were written and eight were
caught on the first attempt, the pass path was green the first time, and nothing
in the repository contradicted the card. `CLAUDE.md` section 9 says a card that
hit no defects appends nothing and says so, and this is that sentence.

---

## 9. Next

Next eligible on the phase 3 board: **P3-03** (projects, `depends_on [P3-01]`)
and **P3-05** (suppliers, `depends_on []`). P3-03 is the lower id and is taken
next. Next free migration number: **0015**.
