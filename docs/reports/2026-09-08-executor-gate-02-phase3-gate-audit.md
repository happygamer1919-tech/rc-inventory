# GATE-02: phase 3 launch gate re-audit, against the live premise

**Role:** EXECUTOR
**Run:** 20260908-070003, unattended, CLAUDE.md section 13
**Date:** 2026-09-08
**Card:** GATE-02, board `docs/board/rc-board-phase3.json`
**Branch:** `card/gate-02`

---

## Why this audit exists

Every one of the nine phase 3 gate conditions carried the same evidence field,
written on 2026-08-31, and every one of them named the same blocker:

> "THE COMMON BLOCKER, AND IT IS THE WHOLE AUDIT: no phase 3 migration has been
> applied to the RC Supabase project."

That premise is dead. Ruling R-124 established on 2026-09-04 that merging a
migration applies it, P3-27 has shipped, and the pending register is empty.
Eight of the nine conditions were therefore recorded against a world that has
stopped existing, and the ninth (G1) was half-rewritten by GATE-01 yesterday.

The card's defaults bind this report and are restated because they decided its
shape:

- **the count may go up, down or nowhere**, and this card may not flip a
  condition to pass in order to move the number
- **every condition is re-derived, none is declared unchanged**
- **it is an audit, not a build.** A condition one command short of passing
  names a NEW CARD; that command is not written here.

---

## The result, first

**PHASE 3 LAUNCH GATE: 0 of 9. The count did not move.**

It did not move, and the reason it did not move is now completely different, on
every single condition. Not one of the nine still fails for the reason recorded
against it on 2026-08-31. That is the finding this card was authored to produce:
the old number was right by accident and is now right on purpose.

| | 2026-08-31 blocker | 2026-09-08 blocker | state |
|---|---|---|---|
| G1 | no migration applied | no committed instrument makes an unauthenticated READ | fail |
| G2 | no migration applied | nothing reads `unassigned_outbound_count()` on production | fail |
| G3 | screens read tables that do not exist | no authenticated deployed-screen verification exists | fail |
| G4 | no migration applied | the nine-direction walk has never been run against production | fail |
| G5 | no migration applied | there is no real project on production to hand-reconcile | fail |
| G6 | the card itself, then production | the card shipped; the four cases have never been shown on production | fail |
| G7 | three cards todo | all three shipped; no real project on production to build a deviz against | fail |
| G8 | two cards todo | unchanged: P3-15 and P3-16 are still todo | fail |
| G9 | eight cards todo | unchanged: P3-19 through P3-26 are still todo | fail |

---

## The facts this audit was decided on

All five were taken today, by this run, and every one of them is re-runnable by
a stranger with no credential except where noted.

**F1. Production runs the current `main`.**

    GET https://rc-inventory-iota.vercel.app/api/health   ->  HTTP 200
    {"commit":"49fef9adb89a443076ee2e9879f964c37c823f79",
     "ledger_version":"0036",
     "at":"2026-09-08T11:04:16.902Z"}

`49fef9a` is `origin/main` at the moment this card was claimed. No credential.

**F2. The production DATABASE is on ledger 0036.** `ledger_version` in that
response is not read from the repository. `app/api/health/route.ts` calls
`public.applied_ledger_version()`, a SECURITY DEFINER function added by
migration 0028, and returns null rather than guessing when it cannot read. It
returned `"0036"`. Every phase 3 migration, 0013 through 0036, is applied to
production. `npm run check:pending-schema-reads` agrees from the other side:
`nicio migratie in asteptare`.

**F3. A write from a role without permission is refused at the database.**

    npm run prove:anon-write-refused      exit 0, 2026-09-08T11:04:56Z
    clients    HTTP 401  42501  REFUSED
    contacts   HTTP 401  42501  REFUSED
    suppliers  HTTP 401  42501  REFUSED

Taken by this run, not inherited from GATE-01's run three hours earlier. It
needs the PUBLIC anon key, which is compiled into the browser bundle; no value
is printed by the script or by this report.

**F4. THE CLIENT DOMAIN NO LONGER SERVES THE INVENTORY APP.** This was not
looked for and it is the most consequential thing in this report. See below.

**F5. Card statuses on the phase 3 board.** P3-06, P3-07, P3-08, P3-09, P3-10,
P3-11, P3-12, P3-13, P3-13b, P3-13c and P3-27 are shipped. P3-14, P3-15, P3-16,
P3-17 and P3-19 through P3-26 are todo.

---

## F4 IN FULL: www.rapidconstructmd.com is a GitHub Pages marketing site

    GET https://www.rapidconstructmd.com/            -> 301, server: GitHub.com
    GET https://rapidconstructmd.com/                -> 200, server: GitHub.com
                                                        last-modified 2026-09-07T21:28:04Z
    GET https://www.rapidconstructmd.com/api/health  -> 404 (marketing 404 page)
    GET https://www.rapidconstructmd.com/autentificare -> 404

    GET https://rc-inventory-iota.vercel.app/        -> 307 -> /autentificare, server: Vercel

The apex and www hosts answer from GitHub Pages and serve a construction
company's marketing site. The inventory application answers from Vercel at
`rc-inventory-iota.vercel.app`. They are two different products on two different
hosts, and the domain the launch gates mean by "production" is currently the
marketing one.

**WHY THIS IS NOT A COSMETIC FINDING.**
`scripts/poc-free/check-deployed-commit.mjs` defaults to
`https://www.rapidconstructmd.com/api/health`. That is the check INC-06 produced,
and it is the check that stands between a removal migration and six screens
answering 500. Run today with its default origin it fetches a 404 HTML page from
a marketing site, fails to find a commit, and REFUSES. Its refusal is correct
behaviour on a wrong input: it fails closed, exactly as its header says it will.
But the guard is now pointed at a host that can never satisfy it, so the next
removal migration is blocked by a stale default rather than by a real risk, and
whoever hits it will be tempted to pass `--origin` and move on.

**WHAT THIS AUDIT DID NOT DO ABOUT IT.** Nothing. It is an audit, not a build,
and repointing a guard's default is a change to a safety check that deserves its
own card and its own reasoning about which origin is canonical. Recommended card
below.

---

## Condition by condition

### G1: counterparties are records, not typed text

| clause | verdict | what decided it |
|---|---|---|
| 1. client, contact and supplier tables exist on production | **MET** | F2: ledger 0036 includes 0013_clients, 0014_contacts, 0019_suppliers. F3 independently: a 42501 naming each table is an answer FROM that table. |
| 2. RLS enforced, proven by an unauthenticated request returning zero rows | **NOT ATTEMPTED** | No committed command makes an unauthenticated READ against these tables and records the row count. `prove:anon-write-refused` is a write, by design. |
| 3. a write from a role without permission refused AT THE DATABASE | **MET** | F3, taken by this run at 2026-09-08T11:04:56Z. |
| 4. products carry a supplier foreign key | **MET** | `0019_suppliers.sql` line 130: `add column supplier_id uuid null references public.suppliers (id) on delete restrict`. Applied per F2. The production post-check journalled under `0027_drop_products_supplier_name.sql` in `docs/migrations/APPLY-LOG.md` read it back from a fresh connection: `products.supplier_id -> present`, `products.supplier_name -> ABSENT`. |

**State: fail. 3 of 4 clauses met.** The blocker is clause 2 and it is one
command: an anon GET against `clients`, `contacts` and `suppliers` asserting
`200` with an empty array. **NEW CARD.**

### G2: projects exist with the six-state pipeline, every issue names one

| clause | verdict | what decided it |
|---|---|---|
| 1. the project table is live with its status pipeline | **MET** | F2: 0015_status_entity_project, 0016_projects and 0021_projects_search_and_status applied. |
| 2. outbound issues carry a project foreign key | **MET** | `0017_outbound_project_id.sql` line 93: `add column project_id uuid null references public.projects (id) on delete restrict`, plus 0018 for the write path and 0026 which dropped the free-text column. All applied per F2. |
| 3. the count of issues with no project assigned is ZERO, taken read-only and pasted | **NOT ATTEMPTED** | `public.unassigned_outbound_count()` is live on production (0024, applied). Nothing committed calls it against production and pastes the number. The Cost tab prints it, which needs a logged-in browser. |

**State: fail.** The instrument exists and the read has never been taken.
**NEW CARD**, and it is a small one.

### G3: Clienti and Proiecte are live sections, summary first

| clause | verdict | what decided it |
|---|---|---|
| 1. both list screens live on production | **NOT ATTEMPTED** | The code is deployed: F1 puts commit 49fef9a live, and P3-06 through P3-09 are in it. "Live" in this clause means the screen renders, and every screen sits behind `/autentificare`. |
| 2. both detail screens live with their tabs | **NOT ATTEMPTED** | as above |
| 3. density honoured, pagination present, filters in the address bar | **MET, LOCALLY** | P3-06 through P3-09 shipped with named specs green in CI. |
| 4. verified by the executor ON THE DEPLOYED SCREENS, recorded as evidence | **NOT ATTEMPTED** | No terminal in this project holds a production session, and no committed instrument takes one. |

**THE CHANGE SINCE 2026-08-31 IS REAL AND IT IS NOT A PASS.** The old audit said
a deployed-screen check "would find an error page, because the screens read
tables that do not exist". The tables exist now. The check has still never been
run. **NEW CARD**, and it is the largest of the four recommended below, because
an authenticated production walk is the same instrument G4 needs.

### G4: the system is connected, nine directions, both ways

| clause | verdict | what decided it |
|---|---|---|
| 1. the cross-linking walk passes ON PRODUCTION | **NOT ATTEMPTED** | Same missing instrument as G3 clause 4. |
| 2. all nine directions | **MET, LOCALLY** | P3-10 shipped all nine with its named spec green, per `docs/reports/2026-08-30-executor-p3-10-cross-links.md`. |
| 3. each landing page identifies the record it was linked from | **MET, LOCALLY** | same spec |

**State: fail.** The 2026-08-31 blocker ("cannot be run until P3-27 runs") is
discharged. The walk simply has not been run.

### G5: material cost per project, hand-checked

| clause | verdict | what decided it |
|---|---|---|
| 1. the cost report is live on production | **NOT ATTEMPTED** | 0023 and 0024 applied, P3-11 deployed. Rendering unverified, per G3. |
| 2. ONE REAL PROJECT reconciled by hand, to the leu | **NOT MET** | There is no real project. The production post-check journalled under 0027 recorded `products 0, suppliers 0`, and there is no real client data on the project at all. |

**State: fail, and this one cannot be unblocked by a card.** Clause 2 needs real
data, which arrives with Mihai (P2-14 on the phase 2 board, blocked on `client`).
Recording it as "one command short" would be false.

### G6: budget versus actual, with the null-budget case

| clause | verdict | what decided it |
|---|---|---|
| 1. the comparison is live on production | **NOT ATTEMPTED** | 0023, 0024 and 0025 applied; P3-12 shipped and deployed. Rendering unverified, per G3. |
| 2. four cases demonstrated: under, exactly at, over, no budget set | **MET, LOCALLY** | P3-12 shipped, `tests/e2e/project-budget.spec.ts`, 7 of 7 passing. |

**THIS IS THE CONDITION THAT MOVED MOST.** On 2026-08-31 its evidence read
"EVIDENCE FOUND: none. P3-12 is todo". P3-12, and the P3-13 chain it waited on,
have all shipped since. It is now failing on the same production-verification
gap as G3 and G4 rather than on missing work.

**DEFECT NOTED, NOT FIXED, NOT MINE:** P3-12's evidence ref reads
`e2e #PENDING`. A stranger cannot re-verify `#PENDING`. Section 6 requires a ref
that resolves without asking anyone. Logged here rather than patched, per the
no-self-invented-scope rule.

### G7: an estimate built, attached, and compared line by line

| clause | verdict | what decided it |
|---|---|---|
| 1. a deviz built against a real project ON PRODUCTION | **NOT MET** | Same as G5 clause 2: no real project exists. |
| 2. the comparison shows estimated-and-issued, estimated-not-issued, issued-not-estimated | **MET, LOCALLY** | P3-13c shipped, `tests/e2e/deviz-comparison.spec.ts`, 9 of 9, run three times in a row. |

**State: fail.** The whole P3-13 chain shipped since the last audit and
`0025_deviz.sql` is applied. What remains is real data, not build work. The old
note stands: if the estimate feature is ever cut, the gate is re-pointed rather
than the denominator reduced. Nothing here cuts it.

### G8: documents and follow-up notes

| clause | verdict | what decided it |
|---|---|---|
| 1. a document uploaded on production against BOTH a client and a project | **NOT MET** | P3-15 is todo. |
| 2. readable only through a signed link, direct unsigned request refused, proven with a real request | **NOT MET** | P3-15 is todo. |
| 3. a note with a follow-up date appears on the reminders screen on its due date | **NOT MET** | P3-16 is todo. |

**State: fail, and unchanged.** This is one of the two conditions whose 2026-08-31
blocker is still the true one, because it was never the migration: it was the
cards. Both are eligible today.

### G9: density sweep complete, no English string on a user-facing path

| clause | verdict | what decided it |
|---|---|---|
| 1. every density sweep card shipped with its named acceptance passing | **NOT MET** | P3-19 through P3-26 are all todo. |
| 2. the localisation check wired into `quality` and SEEN TO FAIL on a reintroduced English string | **NOT MET** | P3-21 carries it and is todo. |
| 3. the density review document records a verdict for every screen, including ones left alone | **NOT MET** | P3-26 carries the deliberately-left-alone case and is todo. |

**State: fail, and unchanged**, for the same reason as G8. Eight eligible cards
stand between this condition and a pass.

---

## What this audit recommends, and does not do

Four cards, none of them authored here, per the card's own defaults.

1. **An anon READ probe against `clients`, `contacts` and `suppliers` on
   production**, asserting HTTP 200 with an empty array. Closes G1 clause 2 and
   takes G1 to 4 of 4. This is the cheapest remaining point on the board.
2. **A committed read of `public.unassigned_outbound_count()` against
   production**, pasting the number. Closes G2 clause 3.
3. **An authenticated production verification walk.** One instrument serves G3
   clause 4, G4 clause 1, G5 clause 1 and G6 clause 1, which is four conditions
   held by one missing capability. It is the highest-value card on this list and
   the hardest, because nothing in this project currently holds a production
   session.
4. **Repoint or retire `check-deployed-commit`'s default origin**, per F4. The
   guard between a removal migration and INC-06 is aimed at a marketing site.

G5 clause 2 and G7 clause 1 are NOT on this list. They need real client data and
no card can manufacture it.

---

## Doctrine note

Nothing in this run required a ruling, and nothing was escalated. The domain
finding in F4 is reported and the run continued, per CLAUDE.md section 4b: a
finding is not a block.
