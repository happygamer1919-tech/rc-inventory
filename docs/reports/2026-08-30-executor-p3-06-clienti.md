# EXECUTOR: P3-06, the CRM appears in the menu. One search box, and the fold that forced an RPC.

**Date:** 2026-08-30
**Role:** EXECUTOR
**Branch:** `card/p3-06-clienti`, cut from `origin/main` at `1a18f04`
**Card:** P3-06
**Migration files added:** `supabase/migrations/0020_search_clients.sql`

---

## 0. Boot

Phase 3 board read at `1a18f04`. Wave 1 is shipped as far as it can go, so
**P3-06** is the lowest-id eligible card, `depends_on [P3-01]`. Claimed as
`executor` through PR #113 before the work began.

---

## 1. This is the first thing the owner can look at

Wave 1 built five tables he cannot see. **This is the card where the CRM appears
in the menu**, which is the dispatch's stated priority: "the platform currently
has no client or project management at all, which is the owner's primary
complaint. Wave 1 and wave 2 are the path to something visible on screen."

`/clienti` and `/clienti/[id]`, under a new **Relații** nav group.

**The group sits above Stoc**, which the card did not decide. It goes there
because every question the owner asks starts the same way: **who**, then **which
site**, then **what material**. The menu now reads in the order the questions get
asked. P3-07 adds Proiecte to the same group.

---

## 2. The fold forced an RPC, and that is the one real design decision here

P3-06 asks for **one** search box over name, IDNO, phone and email,
diacritic-folded and case-folded, **filtered server side**.

**PostgREST cannot do the folding.** It filters named columns, not expressions,
so `fold_text.ilike.%tigla%` is not something the client can send. And `ilike`
over the raw column **does not match "Țiglă" when somebody types "tigla"**,
which is the exact defect phase 1 found on screen and wrote into
`docs/LEARNINGS.md`.

The alternatives were a generated column on every searchable field, or a
function. `public.search_clients` keeps **one** definition of the fold, the one
migration 0017 created, so **what the search box finds and what a backfill
matches cannot disagree.**

Two things ride along in the same query because they cost nothing there and
cost a round trip anywhere else:

- **The total, as a window function over the filtered set.** A separate count
  query is a second round trip that can disagree with the first under concurrent
  writes, and the footer would then claim a number of pages the list cannot
  produce.
- **The open-project count**, which is the fifth of the five columns the card
  allows. Counting it afterwards is a query per page at best and a query per row
  at worst.

**Open means not closed and not deactivated, and suspended counts.** A stopped
site is still a relationship in progress; leaving it out would make the column
say a client has no work with the firm.

---

## 3. Five columns and not one more

Denumire, Tip, Telefon, Proiecte active, Stare. Address, email, IDNO and notes
are detail, not list. The `ClientRow` type is that rule written in TypeScript:
**a screen cannot render a column it cannot read.**

**Every filter is in the URL**, so a filtered list can be sent to somebody as a
link and the back button restores it. The spec asserts exactly that: navigate to
a filtered list, open a client, press back, and the search box still holds the
term.

**An unknown filter value falls back to the default and does not error**, at both
ends: `parseClientQuery` for `?pagina=abc`, and the SQL for `?stare=nonsense`.
Somebody sends a stale link and gets a list, not an error page.

---

## 4. The role gate is in two places and neither is the real one

The policies in 0013 are owner-only and refuse the write **at the database**.

- **The screen hides the button**, because P3-06 says an interface that offers a
  button the database will refuse is the defect, not the policy.
- **The action re-checks**, because a server action is reachable without the
  screen.

The spec proves the first: signed in as the account manager, the filters are
visible and `client-new` does not exist.

---

## 5. What the two proofs each cover

**The spec proves the screen.** `tests/e2e/clients.spec.ts`, seven cases: the
list comes from the database and survives a reload; search ignores diacritics and
case; search by IDNO matches and a nonexistent IDNO matches **nothing** rather
than falling back to the whole list; the status filter hides deactivated clients
and `toate` shows them; the list never renders more than 25 rows; a row click
opens the detail route and back returns with the search intact; and the account
manager sees the list but gets no write button.

**The assertions prove the query.** `assertions/0020_search_clients.sql` raises
on: the default not being active-only; `tigla` not finding a diacritic name; a
search by phone or email missing its row; a search matching nothing returning
rows anyway; either filter returning the wrong count; an unknown status not
falling back to active; the open-project count including a closed or deactivated
project or excluding a suspended one; a one-row page not carrying the correct
total; **two pages of two not covering four distinct clients exactly once**; an
offset past the end erroring; or the ordering not being by name
case-insensitively.

**That pagination assertion is the one worth keeping.** An unstable sort silently
shows a row twice and hides another, and nobody reports it because both pages
look plausible. The order is `lower(name), id`, and the assertion is what proves
the tiebreaker is there.

---

## 6. Checks

| check | result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run check:migrations` | exit 0, 20 files, 6 assertion files passed |
| `node docs/board/validate-board.mjs` | PASS, 0 violations |
| `npm run check:conflict-residue` | 3 checks passed |
| APPLY-LOG pending register | 20 files, 8 pending, each in exactly one place |
| em dash or en dash in any file touched | zero |
| secret staged | none |

---

## 7. Production writes

**None.** One new pending line, no apply entry, no row in
`docs/PRODUCTION-WRITES.md`. `0020` creates a read-only function and touches no
table, which makes it the safest file in the pending set and the one the Clienti
screen does not work without.

---

## 8. Learnings appended

**None.** This card hit no defect: the migration applied first time, the
assertions passed first time, and the typecheck and build were clean. The one
design constraint worth remembering, that PostgREST cannot filter on an
expression so a folded search has to be a function, is recorded on the card and
in the migration header rather than as a general lesson, because it is a fact
about this stack rather than a rule about building software.

---

## 9. Next

Next eligible: **P3-07**, Proiecte, `depends_on [P3-03]`, which is shipped. It is
the sibling of this card and shares the Relații nav group. Next free migration
number: **0021**.
