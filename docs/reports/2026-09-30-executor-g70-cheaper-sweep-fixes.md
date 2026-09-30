# EXECUTOR report: P3-115, goal G70, the ten cheaper findings of bug sweep 2

Role: **AUTHOR** (the board card) then **EXECUTOR** (everything else), one pull request.
Date: 2026-09-30, UTC. Branch `card/p3-115`, cut from `origin/main` at `5482df3`.
Specification: `docs/reports/2026-09-29-critic-bug-sweep-2.md`, findings G2, G3, G7, G8,
G12, G13, G14, G15, G17 and G18.

---

## FOR THE OWNER, IN PLAIN WORDS

**This card changes the live database.** It adds one migration file,
`supabase/migrations/0065_invoice_chisinau_day_and_paid_date.sql`. Merging it applies it
to production within about two minutes, and there are real invoices in that database.

**What it does to the database, in one sentence:** it teaches the invoice numbering to use
the Chisinau calendar day rather than the clock on the server, and it stops any payment
from being recorded on a day before the invoice was issued or on a day in the future.

**It does not touch a single invoice.** No row is changed, cancelled or removed. There is
no `DROP TABLE`, no `TRUNCATE`, no `DELETE`, no `DROP COLUMN` and no `UPDATE` of an
existing row anywhere in the file. It replaces the bodies of two functions, which is what
migrations 0057, 0060 and 0064 did before it, and it adds one new trigger. Nothing in it
can fail to apply because of a row that is already there.

**One thing the owner should know and nobody needs to act on.** If a real invoice in
production already carries a payment day before its issue day, this card leaves it exactly
as it is. The new rule governs writes from the moment it lands and asks nothing of the
past. That was a deliberate choice and the reason is written into the migration: a
constraint that validated history would have forced a choice between breaking a deploy and
correcting a row the goal line forbids anyone to touch.

**What changes on screen:** eight small things, listed one by one below. The one an owner
will notice first is that the money figure under the invoice list now says what it is
adding up, and adds up only invoices that were actually issued or paid.

---

## THE TEN FINDINGS, AND WHAT WAS DONE TO EACH

### G2 and G3: the Chisinau day decides a series and an issue date

**What was wrong.** Cancelling a draft has to issue it first, because
`invoices_numbered_past_draft` forbids any status past draft without a number, and
`cancelInvoice` did that with an EMPTY issue date. That became `null`, reached
`coalesce(p_issue_date, current_date)` inside `public.issue_invoice`, and `current_date` is
the day on the database server, which is UTC. Chisinau is UTC+2 or UTC+3, so for the first
two or three hours of every Chisinau day the server's day is YESTERDAY. That day decides
two things: the `issue_date` printed on the document, and, through
`public.invoice_series_for`, WHICH SERIES the document is numbered in. A draft cancelled at
00:30 Chisinau on 1 January 2027 was stamped `2026-12-31` and took the next number in
`RC-2026`. G3 reaches the same clock deliberately, by clearing the Data emiterii box and
pressing Emite, because the editor's `problems` list never required the field.

**Which side each fix landed on, and why both.** The card asked for this to be said
explicitly.

| Side | What changed | Why it is there |
|---|---|---|
| Application | `cancelInvoice` passes `chisinauToday()` instead of `""`. `issueInvoice` turns an empty box into the Chisinau day instead of `null`. | This is where the day is DECIDED in normal operation, and the repository already had the helper: `chisinauDateOf` and `chisinauToday` in `lib/data/format.ts`, written by card P3-90 for exactly this, with a comment explaining why the parts are assembled by hand. Reusing them means there is no third copy of the rule. Passing the day on the face of the call also means a reader of `cancelInvoice` can see which day goes to the database. |
| Database, migration 0065 | `public.invoice_series_for` and `public.issue_invoice` fall back to `(now() at time zone 'Europe/Chisinau')::date` instead of `current_date`. | A fallback that is wrong is a trap for the next caller, and the application is not the only thing that can call these functions. **The time zone name is written identically on both sides**, `Europe/Chisinau`, which is the card's own condition: two places that decide a day and disagree are worse than one place that is wrong. It is also the form migrations 0040, 0057 and 0058 already use. |

**The allocator was not touched.** `public.issue_invoice` was replaced, and exactly one
line of its body differs from 0063: the declaration of `v_issue`. The counter insert, the
single `update ... returning` that allocates under the row lock, the two raises around it
and the final update are character for character 0063's. That is deliberate, because
P3-111's concurrency proof fires five real HTTP requests at this function and asserts five
distinct consecutive numbers and a counter that advanced exactly five times, and it must
keep passing unmodified.

### G14: a payment day before the invoice existed

**What was wrong.** `parseDay` checked only the shape `YYYY-MM-DD`. Nothing compared the
day to `issue_date`, to today, or to anything else, and the database had no constraint on
`paid_at`. An invoice issued today could be recorded as paid in 2019 or in 2031.

**On the screen.** `markInvoicePaid` now refuses a day in the future and a day before the
issue date, each with its own Romanian sentence beside the field:

- "Ziua plății este în viitor. O plată se înregistrează după ce a fost făcută."
- "Ziua plății este înainte de ziua emiterii, 30.09.2026. O factură nu poate fi plătită înainte să existe."

Today is the Chisinau day, not the server's, for the reason `lib/data/format.ts` gives: a
comparison on the UTC day would refuse a payment recorded in the first hours of a Chisinau
day. Days are compared as strings, because `YYYY-MM-DD` sorts exactly like a calendar date
and a `new Date(string)` would be midnight UTC.

**In the database, and it is a TRIGGER and not a CHECK constraint.** This is the one place
the card's own wording could not be followed literally, and the reason is not a preference:

> PostgreSQL refuses a non-IMMUTABLE function in a CHECK constraint, and **every** way of
> reading a calendar day out of a `timestamptz` is STABLE: `paid_at at time zone 'x'`,
> `paid_at::date` and `issue_date::timestamptz` all are, and `now()` is STABLE too, so the
> future half could never have been a constraint under any spelling.

So the rule sits in a new `public.invoices_validate_paid_date()`, a BEFORE INSERT OR UPDATE
row trigger, which is the instrument 0064 already uses on this table for the freeze and the
pipeline. It carries a second property that matters more to the owner than the first: **a
trigger asks nothing of the rows that already exist.** Its name sorts after
`invoices_stamp_status`, on purpose, so it judges the FINAL `paid_at` including one the
stamper filled with `now()`; and after `invoices_require_draft_to_edit`, so a rewrite of an
already-stamped `paid_at` is still refused by 0064's guard with 0064's message.

**Nothing was unfrozen.** The fifteen guarded columns and the six stamps from 0064 stay as
that file left them. G14 is about a value written for the FIRST time, and 0064's guard
already refuses a change to a non-null `paid_at`, so the two rules meet rather than overlap.

### G7: the only money figure on the Facturi screen

**What was wrong.** The footer drew two things and no label between them. The figure added
every row that passed the filters, and the default state filter is empty, meaning Toate
starile, so it counted drafts, which are not documents and have no number, and cancelled
invoices, which are the declaration that the money is NOT owed. For any month containing a
cancellation, the one number an owner reads as "what we billed this month" was not that
number. The page's own lead sentence promises "Facturile emise clienților".

**What it says now.** "4 facturi" on the left, the rows on screen; "Emise și plătite,
2 facturi, 180,00 MDL" on the right. Two numbers because there are two questions, and both
go through `plural`, so both take the Romanian "de" form past nineteen. `LIVE_INVOICE_STATUSES`
and `isLiveInvoice` live in one file so the screen and the read cannot disagree about what a
live invoice is. `sumMdl` became `liveSumMdl`: the name changed with the meaning, on purpose.

### G8: the number in the Emite confirmation

**What was wrong, twice.** The sentence read "Factura primește numărul RC-2026-0007,
următorul din serie". That number was read when the PAGE rendered, so two operators with
the page open were promised the same one. And the prediction was always made for TODAY's
series while the operator may set any issue date, so back-dating showed a number from one
year's counter and allocated one from another's.

**What it says now.** "Factura primește următorul număr din serie, RC-2026-0007 dacă nimeni
nu emite înaintea ta, și nu se mai poate modifica după aceea: se poate doar anula." The
same hedge is on the cancel confirmation, which names the number a draft will consume.

**The back-dating half, per screen.** On `/facturare/<id>` there is no date box, and the
route now predicts for `invoice.issueDate ?? today`, the same day `doIssue` sends, so the
two cannot disagree. On `/facturare/nou` the box is live in the browser, so the editor
computes the chosen day's SERIES with the new shared `invoiceSeriesFor` and names no number
at all when it differs from the series the prediction was made for. Dropping the number is
the remedy the finding offers first, and both screens already carried that branch.

### G12: the client's missing IDNO

Both halves of a fiscal document need an IDNO and only one said so. The Client card now
draws the same orange line the Furnizor card draws, pointing at the client's own record:
"IDNO-ul clientului nu este completat. Se completează pe fișa clientului." It does **not**
block issuing: whether a missing client IDNO should stop the press is an accountant's
question and belongs with the three e-Factura options in
`docs/reports/2026-09-24-author-facturare-design.md` section 2.

### G13: the Iesire's line order

The comment said the lines come "in ordinea in care baza le da" and the code ended with an
alphabetical sort on the product name. The sort is gone and the comment now says what the
code does. **And "the order the database gives" was not an order either**, which is why
this was more than deleting a line:

- a PostgREST embedded resource with no `order` promises nothing, so removing the sort alone
  would have left the order to the query plan;
- **`public.outbound_lines` has no order column.** There is no `sort_order`, and `created_at`
  is identical across the lines of one Iesire because they are written in one transaction and
  `now()` is constant inside one. **The order the lines were typed in is not stored anywhere
  and cannot be recovered from the row.**

So what is promised is what can be: a deterministic order, `created_at` then `id`, asked for
explicitly, **and the same on both screens**. `lib/data/outbound.ts` now asks for the same
order on the Iesire panel, because fixing only the invoice side leaves the two documents free
to disagree, which is the harm the finding names. A real `sort_order` column on
`outbound_lines` would be a migration on the Iesire table and a card of its own; it is named
here as a candidate and was not invented into this one.

### G15: the double hyphen

With `number_includes_year` false the series is the bare prefix, and `RC-` plus another
hyphen gave `RC--0001` on every number. `joinSeriesAndNumber` now puts the separator once,
and `invoiceNumberExample` goes through the same two functions as the real number instead of
carrying its own copy of both rules. A prefix that does NOT end in a hyphen still gets one:
the fix is "once", not "never". The Setari example moved out of the field hint into its own
span with `data-testid="facturare-number-example"`, following the precedent the VAT note in
the same component states in a comment.

### G17: every contact row in the database

**What was wrong.** `loadExisting` answered "which clients already have a contact" with
`select("client_id")` over the whole contacts table, no filter and no limit, on every
import, and the client ids it needed were computed on the line directly above and used only
to test that the array was not empty.

**The finding's own one-line remedy would not have helped**, and this is worth recording. It
proposes `.in("client_id", ids)`, and those ids are EVERY client, because the clients read is
deliberately unfiltered for a reason its own header gives: the duplicate is matched on a
NORMALISED phone, and the normalising is done in code, so a query searching for the number as
written in the file would miss the case normalising exists for. A filter on all clients reads
all contacts. It would have been more explicit and nothing else.

**What was done instead.** The question is asked AFTER the plan knows which stored clients the
file matched, for those clients and no others, in a new `addContactNameFillable`. A file of
ten rows touching two clients now reads the contacts of two clients. `contactName` therefore
leaves `empty` in `loadExisting`, whose remaining fields are all columns on `public.clients`
read in the same request. Both entry points ask it, because if only the screen asked then the
write would not know the choice had been offered.

**And the severity is lower than the finding thought, which is reported rather than hidden.**
The finding's worst case is a silent PostgREST `max-rows` truncation reading a client as having
no contact and a fill then writing a SECOND primary contact. That cannot happen: the write side
already re-asks, narrowly, per client, with `.eq("client_id", clientId).limit(1)`, before
creating anything. So this was an unbounded read and a plan that could offer a fill that then
does nothing, not a data-integrity defect.

### G18: a row in none of the three numbers

**What was wrong.** A duplicate of an earlier row of the SAME FILE chosen for filling was
handled by `mergeWithinFile`, which counted it only if it changed something, and the entries
loop then pushed nothing because the choice was "fill". `mergeWithinFile` now returns WHICH
lines it filled rather than how many, so the loop can tell the two apart and records a no-op as
skipped with a reason, exactly as the stored-duplicate branch already does.

**The same sum had a second leak and it is closed here too.** A lead that WAS created but whose
import note failed to save was counted in `created` AND pushed into the unhandled rows, so it was
counted twice and the three numbers exceeded the file. That message is now a warning, carried
beside the three numbers and shown on screen with its line, because the row is not unhandled:
the client exists. This is inside G18 and not an eleventh finding: the goal line says make the
three add up, and they do not add up while that holds.

**And the invariant is asserted in code**, at every import, not only in a test. The three numbers
are accumulated on five different paths through that loop, and a sixth path added with good
intentions is exactly how this finding came to exist. A mismatch does not throw and does not stop
the import, because the writes already happened and are correct; it is recorded as a warning with
the numbers in it. The screen also states the total: "5 rânduri citite din fișier."

---

## THE MIGRATION

**Path:** `supabase/migrations/0065_invoice_chisinau_day_and_paid_date.sql`
**Assertions:** `scripts/poc-free/local-db/assertions/0065_invoice_chisinau_day_and_paid_date.sql`

| What | Kind |
|---|---|
| `public.invoice_series_for(date)` | function body REPLACED |
| `public.issue_invoice(uuid, date, date)` | function body REPLACED, one declaration changed |
| `public.invoices_validate_paid_date()` | function ADDED |
| trigger `invoices_validate_paid_date` on `public.invoices` | ADDED |

Nothing is removed. The one `drop trigger if exists` line carries the new trigger's own name,
is a no-op on a first run, and is the re-runnable shape 0063 and 0064 both use. The file runs as
one transaction, is safe to run twice, and section 4 re-checks the result on every run: that both
functions carry `Europe/Chisinau` and neither still reads `current_date`, that the locking
statement is still one statement, that both are still SECURITY DEFINER, that the trigger carries
both halves and fires last, that 0064's guard still carries both of its branches, that no delete
policy exists on the four invoice tables, and that nobody may write the number counter.

`npm run check:no-destructive-migration` was run on this branch and reported
**OK, 1 file(s) parsed, 15 statement(s), no DROP TABLE, no TRUNCATE, no DELETE, and every
statement kind classified.** The two applier proofs and `npm run check:migrations` need Docker,
which this machine does not have; they run in CI and their result is in the pull request body.

---

## THE THREE EXISTING TESTS THAT ENCODED A FINDING, AND HOW THEY WERE CORRECTED

A test that encodes a bug is fixed by fixing the bug. None was weakened and none was deleted.

1. **`tests/e2e/facturare-list.spec.ts` case 3** asserted, in its own comment, "120 + 60 + 12 +
   24 = 216" over four invoices in four states. That is G7 exactly. It now asserts 120 + 60 = 180
   over emisa and platita AND measures the 12 + 24 = 36 that was removed, so the exclusion is
   proved rather than assumed. Two new arms assert that filtering to cancelled or to draft shows a
   row and a figure of zero. Client C's twenty invoices are now issued rather than drafts, because
   that client is the only fixture with more than nineteen invoices and therefore the only one that
   can prove the "de" form on BOTH counts; with twenty drafts the live count would have been zero
   and the new half of the clause would have passed without being tried.
2. **`tests/e2e/facturare-create.spec.ts` case 1** sorted its expected Iesire lines
   alphabetically. That is G13 exactly. It now asks the database for `created_at` then `id`, the
   same order the application asks for, and a source-level half is added beside it.
3. **`tests/e2e/facturare-create.spec.ts` case 5** asserted the confirmation names the number. It
   still does, and now also asserts the hedge is present and that the categorical phrasing is gone.

---

## WHAT PROVES EACH CLAUSE

| Clause | Where |
|---|---|
| Chisinau day and series on a cancel, at a moment the two clocks differ | `tests/e2e/facturare-chisinau-day.spec.ts` cases 1, 2, 3; and section 3b of the 0065 assertions |
| Payment day before the issue date and in the future refused, valid saves | same spec case 4, both through the screen and straight at the database; and section 4 of the 0065 assertions |
| Facturi foot line counts and sums only emise and platite, labelled, "de" form | `tests/e2e/facturare-list.spec.ts` case 3 |
| Emite confirmation no longer states the number as certain; back-dating predicts from that date's series | `tests/e2e/facturare-create.spec.ts` case 5; `facturare-chisinau-day.spec.ts` case 5 |
| A client with no IDNO produces the warning, in the same style as the supplier one | `tests/e2e/facturare-create.spec.ts` case 12 |
| An invoice keeps its Iesire's order, and the comment agrees with the code | `tests/e2e/facturare-create.spec.ts` case 1 |
| A series with the year off has no double hyphen | `tests/e2e/facturare-settings.spec.ts` case 1b |
| The import reads contacts only for the clients in the file | `tests/e2e/lead-import.spec.ts` "G70 (G17)" |
| created plus filled plus skipped equals the rows read | `tests/e2e/lead-import.spec.ts` "G70 (G18)" |
| P3-111's concurrency and freeze cases still pass unchanged | `tests/e2e/facturare-data.spec.ts`, byte-identical to main |

**HOW THE TEST FIXES THE CLOCK**, which the card asks to be answered in writing. Neither the
machine's clock nor the database's is touched; neither can be moved from a test, and a test that
tried would be a test about moving a clock. Three mechanisms, and the third is the decisive one:

1. **The moment, not the clock.** Case 1 of the new spec hands written instants to
   `chisinauDateOf`, the function the application itself uses. At 22:30 UTC on 31 December 2026 the
   Chisinau day is already 1 January 2027, so the two are different calendar days in different
   YEARS. Deterministic at any hour and on any machine. Summer (+3) and the hour before the boundary
   are covered too, so the function is not merely adding a day.
2. **The consequence, asked of the database.** `public.invoice_series_for` is asked about both days
   and must answer two different series. That is why the wrong day matters: the document does not
   only carry the wrong date, it takes a number out of the closed year's legal series.
3. **The SESSION's time zone, in the 0065 assertions, section 3b.** `current_date` reads the
   session's TimeZone setting and `(now() at time zone 'Europe/Chisinau')::date` ignores it. The
   block moves the session to `Etc/GMT+12` when the Chisinau hour is below 14 and to `Etc/GMT-14`
   otherwise, so the session's own date is PROVABLY a different calendar day from Chisinau's at
   every instant of the clock, asserts that the fixture worked before asserting anything else, and
   then requires the fallback to still answer Chisinau. That is the only half that can tell the two
   clocks apart, and it is decisive every time it runs rather than only at a year boundary nobody
   is awake for.

---

## OBSERVATIONS RECORDED AND NOT ACTED ON

Neither is one of the ten, and neither was changed. They are written here so the next reader does
not have to find them again.

1. **The year on the Setari example is the UTC year, not the Chisinau year.**
   `app/(app)/setari/page.tsx` passes `new Date().getUTCFullYear()` to `invoiceNumberExample`. For a
   few hours around New Year the example would name last year's series while an invoice issued in
   the same minute would land in this year's. It is cosmetic, it is on a preview rather than on a
   document, and it is not one of the ten. The new test reads the same clock as the route so it does
   not paper over the difference.
2. **`public.outbound_lines` has no column that records the order its lines were typed in.** G13 is
   closed as far as it can be without one, and the section above says exactly what is and is not
   promised. Adding one would be a migration on the Iesire table.

---

## THE LOCAL GATE SET, RUN ON THIS BRANCH

Every one exited 0 unless stated.

```
npx tsc --noEmit                        OK
npm run build                           OK
npm run check:card-ids                  OK, 456 subjects, every card id resolves
npm run check:unique-ids                OK, 279 card ids, 214 ruling ids
npm run check:open-branch-ids           OK, no id claimed on another open branch
npm run check:no-destructive-migration  OK, 1 file, 15 statements
npm run check:conflict-residue          OK, 3 checks, 750 files
npm run check:categories                OK, 8 checks
npm run check:ledger-rows               OK, 6 checks
npm run check:no-prod-target            OK, 5 checks
npm run check:pending-schema-reads      OK, 21 pending migrations
npm run check:removal-safety            OK, 21 pending migrations
npm run check:assertion-register        OK, 18 assertions
npm run check:executor-env              OK
npm run check:board-clock               OK, 3 boards
npm run check:card-order                OK
npm run check:action-pins               OK
node docs/board/validate-board.mjs (all three boards)   PASS, 0 violations
npm run check:board-edit                REFUSED until the card flips to shipped, then OK
```

**What could not run here, and why.** `npm run check:migrations`, `npm run prove:applier` and the
whole end to end suite need Docker and the Supabase CLI. This machine has neither, which is
recorded in the factory's own rules. They run in CI and their results are in the pull request body.
The SOURCE-LEVEL halves of the new specs were run here, outside Playwright, against the real files,
and pass; so does a check that no em dash or en dash appears in any file this card touched.

---

## LEARNINGS

Four ERROR/SOLUTION pairs were appended to `docs/LEARNINGS.md`:

1. A CHECK constraint cannot compare a `timestamptz` to a `date`, so the rule belongs in a trigger.
2. A test that greps the source is defeated by a comment that quotes the code it looks for.
3. A regex with a negated character class cannot cross the arguments of the call it looks for.
4. An end to end assertion built on a uuid tiebreak is flaky half the time.

---

## NOTHING WAS DEFERRED

All ten findings shipped. No mailbox question was needed for a finding that turned out to be
bigger than the sweep thought, and the failure ceiling in CLAUDE.md section 10 was not reached: no
fix attempt failed. The two places where the card's literal wording could not be followed, G14's
CHECK constraint and G17's one-line remedy, are both explained above with the reason the letter was
impossible and the spirit was kept.

**No production row was read and the live site was never opened.** Every fixture is built by hand
in `tests/`, prefixed `TEST`, and nothing is deleted. No credential value appears in any file this
card touched; `git diff --cached` was read before every commit.

---

## MERGE

This pull request carries a migration, so the owner is told before the live database changes, per
his standing instruction. The mailbox question is
`mailbox/questions/q0NN-approve-p3-115-merge.md` in the factory folder, written as the record. The
auto-merger lands the branch on its first green `quality` run; no terminal merges it by hand.
