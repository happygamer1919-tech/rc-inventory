# AUTHOR: every card for Ivan's four items, the Item 2 ruling, and the eighth deviation

**Role:** AUTHOR
**Date:** 2026-09-30
**Goal:** G71 of the operator factory
**Branch:** `card/ivan-four-items-cards`, cut from `origin/main` at `fae7736`
**Source:** owner request from Ivan, 2026-09-30, routed via Max. Full text at
`inputs/2026-09-30-ivan-four-items.md` in the operator factory, 48 lines, read in full.

No application code, no migration, no test was written by this run. One ruling, seventeen
cards, one board artifact re-render and this report.

---

## 1. Boot report, per CLAUDE.md section 1

Role stated: **AUTHOR**. Both `docs/board/rc-board-phase2.json` and
`docs/board/rc-board-phase3.json` were read, per the RULE-05 defect that section 1 names only
phase 2 while the next eligible cards sit on phase 3.

**Card counts at boot, before this run wrote anything:**

| Board | Cards | shipped | todo | blocked |
|---|---|---|---|---|
| `rc-board.json` (phase 1, closed) | 13 | 13 | 0 | 0 |
| `rc-board-phase2.json` | 102 | 68 | 32 | 2 |
| `rc-board-phase3.json` | 165 | 132 | 32 | 1 |

**Launch gate, phase 3: 0 of 9 passed.**

**Next eligible card at boot:** `AUT-3`, "Add the TRIAGE role to the POC chain". 61 cards were
eligible across the two planning boards.

---

## 2. Every card id, with its one line plain description, in `depends_on` order

This is the list POC turns into goal lines. It is in dependency order: nothing here depends on
anything below it.

| Card | Depends on | What it is, in one line |
|---|---|---|
| **P3-117** | (none) | Put a stopwatch on the six main screens and record the baseline, before anything is changed. |
| **P3-118** | (none) | Teach the system to record material going out to a direct customer with no project, taking stock off exactly as it already does. |
| **P3-119** | P3-118 | The screen: pick project or direct customer, choose or create the customer, give a collection date and the lines. |
| **P3-120** | P3-118, P3-119 | Show which kind each release was, everywhere releases are listed, and let the list be filtered by it. |
| **P3-121** | P3-101 | Take the working parts of the existing leads import into one shared piece the other three can sit on. |
| **P3-122** | P3-121 | Bring the existing leads import up to standard: an example row in the model file, written instructions, a reason column. |
| **P3-123** | P3-121 | Load the customer list from a spreadsheet, matched by email, never overwriting anything a person typed. |
| **P3-124** | P3-121, P3-123 | Load the project list from a spreadsheet, matched by name plus customer, rejecting rows naming a customer that does not exist. |
| **P3-125** | P3-121 | Load the material catalogue from a spreadsheet, rejecting any unit the system does not use and refusing to change the unit of a material that has moved. |
| **P3-126** | P3-122 | Save the leads the operator is currently looking at as a spreadsheet that loads straight back in. |
| **P3-127** | P3-123 | Save the customers the operator is currently looking at as a spreadsheet that loads straight back in. |
| **P3-128** | P3-124 | Save the projects the operator is currently looking at, with the customer written in the form the import reads. |
| **P3-129** | P3-125 | Save the materials the operator is currently looking at, with no column that could ever change a stock level. |
| **P3-130** | (none) | Storage and access rules for a proper to-do list: state, urgency, due date, owner, optional linked record. |
| **P3-131** | P3-130 | The Sarcini tab: the list, five filters, three sorts, the late marker and the three groupings. |
| **P3-132** | P3-130, P3-131 | The same jobs shown on the customer, lead or project page, and created from there already linked. |
| **P3-133** | P3-130, P3-131 | A second section on the Azi screen for the jobs due today, beside the call list, never merged into it. |

**Ruling: R-215**, "Outbound gains a second mode: a direct client with no project ... with no
invoice and no sale document". In `decisions/inbox.md`.
`decisions/NEXT-RULING-ID` advanced to `R-216` in the same commit, per CLAUDE.md section 8b.

**Every one of the eighteen ids was taken through `npm run id:free`** on 2026-09-30 and every
one came back FREE: R-215, and P3-117 through P3-133. R-215 was confirmed free at the time of
the run rather than assumed from the goal line.

---

## 3. The eight deviations, restated

D1 to D7 were found by POC before this run and are recorded in the operator factory's
`GOALS.md`. D8 was found while drafting this task and was **verified in the repository by this
run before being written**, as the task required.

### D1. Production timing
A terminal running Playwright against production would sign in with a real account and render
real client rows, which the request itself forbids. **Default applied:** the timing script reads
its base address and credentials from environment variables, defaults none of them and prints
none of them; the terminal runs it against a Vercel preview seeded with production-like
fixtures; the production number is produced by Max or Ivan on their own machine and pasted into
the card. Max confirmed this on 2026-09-30. **Written into:** P3-117.

### D2. Section names
There is no `Stoc` route and no `Rapoarte` route in this application. **Default applied:** the
six sections measured are Tablou de bord, Inventar (which is Stoc), Ieșiri materiale, CRM,
Facturi and Setări. Rapoarte is skipped until it exists and is not stubbed. **Written into:**
P3-117, and referenced by P3-120 where "reports" appears in Ivan's Item 2.

### D3. Units: nine, not seven
The request's governance line lists seven units. `lib/data/units.ts` has had **nine** since
migration 0030 under card P3-33: `m2, lm, pcs, bag, kg, roll, m3, t, l`. **Default applied:**
keep all nine, never remove a value, and validation reads `ALL_UNITS` rather than repeating a
list anywhere. Max confirmed this on 2026-09-30. **Written into:** R-215, P3-118, P3-119,
P3-123, P3-124, P3-125, P3-129.

### D4. There is no organisation
This platform has no organisation or tenant model. Rapid Construct is one company. The access
predicates are `public.current_app_role()` and `public.is_owner()` from migration 0001, both
`security definer`, and `is_owner()`'s own comment already says it "Returns false for an
unauthenticated caller and for a deactivated profile". **Default applied:** Ivan's "RLS test
that a user sees only their organisation's issues" becomes three named cases: a signed-out
request sees no rows, a deactivated account sees no rows, and a role without the permission
cannot write. **No organisation table is invented.** **Written into:** R-215, P3-118, P3-119,
P3-120, P3-123, P3-130, P3-131, P3-132, P3-133.

### D5. The lead import already exists
Card P3-101, pull request #363. It never deletes and never overwrites. **Default applied:** keep
it and bring it up to Item 3's standard rather than rebuilding it; the other three entities get
new screens that reuse its parser and preview; all four exports are new. **Written into:**
P3-121, P3-122, P3-123, P3-124, P3-125, P3-126, P3-127, P3-128, P3-129.

**One precision on D5, found while reading the code.** D5 describes P3-101 as "CSV and XLSX".
The code does not read XLSX: `components/clients/LeadImportSheet.tsx` refuses a `.xlsx` or
`.xls` file with a Romanian sentence telling the operator to save it as CSV, and
`lib/data/lead-import-types.ts` gives the reason ("XLSX nu incape: este o arhiva zip cu XML
inauntru, deci cere o biblioteca"), with the dependency question parked with the owner at
mailbox q084. **The refusal is kept exactly as it is and nothing about XLSX is decided by these
cards.** This is a correction inside D5, not a new deviation: D5's substance, that the lead
import exists and is kept and extended, is unchanged.

### D6. Ruling citation
R-204 is the document-reading handover ruling, not a general channel. **Default applied:** R-215
cites "owner request from Ivan, 2026-09-30, routed via Max" and names R-204 only as how Max
received the request, saying in the same breath that it grants nothing about outbound.
**Written into:** R-215.

### D7. Tasks versus Azi
The Azi screen (card P3-91) and the CRM next step already exist. Azi is one list of leads and
clients to call today, driven by the client next-action date and, at the De reluat stage only,
the follow-up date, with its own rules in `lib/data/azi.ts`. **Default applied:** Sarcini is a
new table and a new tab; Azi shows tasks due today in a section of its own; the existing
next-step field is untouched. **Written into:** P3-130, P3-131, P3-132, P3-133.

**How D7 is enforced rather than merely stated.** P3-132 and P3-133 each carry a guard
acceptance line: the existing next-step test and the existing Azi test are re-run **unmodified**,
and a diff that had to edit either one has failed the card. That is the only machine-checkable
way to prove the existing field was not quietly folded in.

### D8. Currency: this repository stores MDL only. NEW, and verified by this run.

**The request says one thing and the repository says another.** Ivan's governance line reads
"Currencies EUR, RON, MDL", and Item 3 makes "currency outside EUR/RON/MDL" a row error.

**The repository stores MDL only, and it is a decided fact rather than an oversight. All three
pieces of evidence were read by this run before the deviation was written:**

1. **`CONTEXT.md` in the operator factory, under "Decided, do not reopen", line 32:**
   *"One currency per document. No cross-currency totals, no exchange rates."*
2. **`supabase/migrations/0025_deviz.sql`**, the estimate. Line 122:
   `constraint devize_currency_mdl check (currency = 'MDL')`. The comment above it, lines 90 to
   95, gives the reason: P3-03 ruled multi-currency out of scope and every wave 3 computation
   sums MDL, so "storing a currency the arithmetic ignores is a wrong number waiting".
3. **`supabase/migrations/0063_invoices.sql`**, the invoice. Line 309:
   `constraint invoices_currency_mdl check (currency = 'MDL')`, with a comment at line 243
   saying it does exactly what `devize_currency_mdl` does in 0025.

**Why this matters more than a wording mismatch.** A row carrying EUR or RON would be **refused
by the database**, not by the import. An import that accepted one would therefore pass its
preview, tell the operator the row was fine, and fail at the write. That is the worst possible
place to discover it: after the operator has confirmed, in a batch of several thousand rows,
with no obvious cause.

**Default applied:** validation accepts **MDL only** and rejects EUR and RON **in the preview**,
with a Romanian reason naming the accepted currency. **Written into the `defaults` of every
Item 3 card:** P3-121, P3-122, P3-123, P3-124, P3-125, P3-126, P3-127, P3-128, P3-129.

**THE QUESTION FOR MAX AND IVAN.** If EUR and RON are genuinely wanted, that is a change to a
decided fact and to two check constraints on live tables, and it needs **its own ruling and its
own cards**, not a validation list. Three things would have to be decided, and none of them is
a card this run could write:

- What a total means when one document holds two currencies, given the decided line says there
  are no cross-currency totals and no exchange rates.
- Where an exchange rate would come from, when it would be read, and whether a stored document
  keeps the rate of its day or floats.
- What happens to every estimate and invoice already written under the MDL constraint.

Until that ruling exists, the nine Item 3 cards reject EUR and RON at the preview and say so in
Romanian. **If the answer is "MDL only, the governance line was boilerplate", nothing changes
and this question closes with one sentence.**

---

## 4. Two places where the task brief and the repository disagreed, and what was done

### 4.1 `depends_on` cannot hold a ruling id

The task's definition of done item 2 asks that "the Item 2 cards name it [R-215] in
`depends_on`". **The board validator refuses that.** `docs/board/validate-board.mjs`, in the
`depends_on` graph pass, fails any entry that is not a card id **on the same board**:

> `cards (${id}).depends_on: ${JSON.stringify(dep)} is not a card id on this board.`

A ruling id there is a hard validator failure, and the validator must exit 0 before every commit.
The repository's own rules win where the two disagree, per the operator factory's `CLAUDE.md`.

**What was done instead, and it meets the intent.** Each of the three Item 2 cards names R-215 as
its authority in the **first line of its `defaults`**, which is the field an executor reads before
working the card, together with an explicit sentence saying why it is there rather than in
`depends_on`. The ruling itself names the three cards it unblocks. `depends_on` carries only real
card ids, so eligibility still computes.

### 4.2 "No delete policy, matching every other table in this system"

The task says Item 4's new table should have no delete policy, "matching every other table in
this system". **That is true of the newest tables and not of the oldest ones.**
`public.invoices` in `supabase/migrations/0063_invoices.sql` has `select`, `insert` and `update`
policies and **no delete policy at all**. The eleven tables created by migration 0001, including
`outbound_issues`, do carry owner-gated delete policies.

**What was done:** P3-130 and P3-118 both say "no delete policy" and both cite `public.invoices`
in 0063 as the convention being matched, rather than claiming every table in the repository does
it. The instruction is followed; the justification is made accurate.

---

## 5. Why only card 1a exists for Item 1

Goal G71 says the 1b onward cause cards come in a later AUTHOR pull request, "once 1a names the
causes". **No cause card is authored here.** Ivan's Item 1 lists five candidate causes (server
waterfalls, unindexed queries, oversized bundles, missing loading states, uncached fetches), and
which of them are real on this application is exactly what P3-117 exists to find out. A cause
card written before the measurement is a guess wearing a card id, and the board would then carry
work nobody has evidence for.

The epic acceptance Ivan wrote, "script exit 0, every p75 under 2000 ms", **belongs to the epic
and not to 1a**, and this is written into P3-117's own defaults. A baseline card that failed its
own run because the application is slow, which is the finding it exists to record, would be a
card that can never go green and can never record the number.

---

## 6. The board artifact

`node docs/board/render-board.mjs docs/board/rc-board-phase3.json` was run after the last card
landed:

```
rendered 182 cards + 0/9 gates (portal)
  fingerprint: a9079f553a5c706c
  lanes: shipped 132, in_flight 39, rodica_batch 7, loose_ends 4
```

The 39 in flight is the 22 that were there plus this run's 17.

**The HTML is regenerated and the hosted artifact is NOT yet updated from it, and that is said
plainly here rather than left to be assumed.** This run is a headless session and the tool that
writes a `claude.ai` artifact is not available to it, so the owner's link at
`https://claude.ai/artifact/6jBmM4FNut6WiKveHtUERf` still shows the board as it stood before
these seventeen cards. The URL is unchanged and is still recorded where the board records it, in
the phase 3 board's `renders_to` field, which now also carries this run's fingerprint and this
same statement. **The next session that has the artifact tool re-publishes that same URL** from
`docs/board/rc-board-phase3.rendered.html`, which is reproducible from the committed JSON by
re-running the render and will carry the same fingerprint. Nothing about the URL changes.

---

## 7. What changed for Rapid Construct

Nothing yet, and deliberately so. This run wrote down the work, it did not do any of it. What
exists now is a plan the owner can read: seventeen jobs on the board, each one saying in ordinary
business English what it means for the business, in an order where nothing is started before the
thing it needs, and each one carrying a proof that has to pass before it can be called done.

What the four items will give Rapid Construct when they are built:

1. Screens that move in under two seconds instead of two to four, with the measurement first so
   anyone can tell whether it worked.
2. The ability to record a sale to a walk-in buyer collecting from the warehouse, so the stock
   figure stops drifting from what is on the shelf. No invoice comes out of it; the money side
   stays outside the system.
3. Loading customers, leads, projects and materials from a spreadsheet and getting them back out
   again, instead of typing them one at a time.
4. A proper to-do list inside the customer system, with due dates, owners and a view of what is
   late.

---

## 8. Commands run and their results

```
npm run id:free -- R-215                            R-215 is FREE
npm run id:free -- P3-117 ... P3-133  (17 calls)    every one FREE
node docs/board/validate-board.mjs (three boards)   PASS, 0 violations, run before every commit
npm run check:unique-ids                            OK, 280 card ids and 215 ruling ids unique
node docs/board/render-board.mjs (phase 3)          182 cards, fingerprint a9079f553a5c706c
```

The full local gate set is recorded in the pull request body with each command's result.

---

## 9. Left for the owner

1. **D8, the currency question in section 3.** One sentence closes it if the answer is "MDL only".
   If EUR and RON are genuinely wanted, that is a ruling and its own cards, and section 3 lists
   the three things that ruling would have to decide.
2. **The production timing number for P3-117**, per D1. A terminal cannot produce it. Max or Ivan
   runs the script on their own machine and the number is pasted into the card.
3. **The board artifact re-publish**, per section 6.
4. **Two of these cards carry a migration and therefore never self-merge**: P3-118 and P3-130.
   Each one changes the production database within about two minutes of merging, and the owner is
   told before it does.
