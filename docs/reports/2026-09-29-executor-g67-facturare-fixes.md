# EXECUTOR: card P3-111, goal G67. The four Facturare holes, the audit stamps, and three coverage gaps

Role: **AUTHOR** (the board card, no application code) then **EXECUTOR**, in one pull request.
Card: **P3-111**, on `docs/board/rc-board-phase3.json`, allocated with `npm run id:free -- P3-111`.
Branch: `card/p3-111`, cut from `origin/main` at `ce5e9ec`.
Date: 2026-09-29, UTC.

---

## For the owner, in plain words

Four ways an invoice could go wrong are now impossible, and the system stops them in the database
rather than only on the screen.

1. An invoice that has been issued can no longer be turned back into a draft by anything at all.
   That was the worst of the four: it was the one hole that could have unlocked a finished
   document's number, customer, dates, amounts and lines all at once.
2. The record of who issued, paid or cancelled an invoice, and when, is written once and can never
   be rewritten. That record is what the history on the invoice page is made of.
3. The total shown while an operator is typing an invoice is now always the same total that gets
   stored. It could differ by one ban: a quantity of 8,165 at one leu showed 8,16 on screen and
   saved 8,17.
4. One material release can now have only one live invoice. Before this, two people, or one person
   with two tabs open, could each make an invoice for the same delivery, and because nothing is
   ever deleted here the only way out was to cancel one, which burns a real invoice number. If the
   invoice for a release is cancelled, that release can be invoiced again.

And a save that fails part way through now leaves nothing behind. Before this, if the first half of
a save succeeded and the second half failed, an empty invoice with no number stayed on the list for
the month and nobody could remove it.

**The one sentence about the live database.** This card adds one file to the database,
`supabase/migrations/0064_invoice_freeze_and_one_per_issue.sql`, and merging the pull request applies
it to the live database within about two minutes. It adds rules, an index and one new function. It
removes nothing, deletes no invoice, and cancels no invoice.

**One thing to know before the merge.** This is the only migration in this feature that can refuse to
apply. It adds the rule "one live invoice per release", and if the live database already holds two
live invoices for one release, the rule cannot be created. In that case the file stops with a message
naming the release, changes nothing at all, and the decision about which of the two invoices is the
real one is yours and the accountant's. I could not check whether such a pair exists: there are no
production credentials on this machine and reading a production row is not allowed. The pair can only
have been created by the very race this card closes, which needs two tabs or two people on one
release within the two days the create screen has existed, so it is unlikely rather than impossible.

---

## Which status moves are now legal, and on what written basis

The legal moves are exactly three:

    ciorna  -> emisa      public.issue_invoice, the only way a number is handed out
    emisa   -> platita    markInvoicePaid
    emisa   -> anulata    cancelInvoice

Everything else is refused, including **platita -> anulata** and **every move back to ciorna**.

This was READ and not chosen, which is what the goal line asked for. Two things were already written
down and they agree with each other:

- `docs/reports/2026-09-24-author-facturare-design.md`, screen 3, of a `Platita` invoice: *"download
  the PDF, email it. **Nothing else.**"* So paid is terminal.
- Part 3 shipped exactly that. `lib/data/facturare-detail-types.ts` is the one source both the screen
  and its specification read, and it says `paid: []` and `cancelled: []`.
  `lib/data/facturare-actions.ts` refuses cancelling a paid invoice in so many words, with the reason
  written beside it: a paid invoice that is cancelled is a refund, which is an accountant's decision.

So the code and the design did NOT disagree, and the mailbox question the brief held in reserve was
not needed. What was wrong is that the database permitted what the screen refused. Now they agree.

If the owner later wants a paid invoice cancellable, that is a new decision and a new card, not a
branch added here.

**A draft cannot skip the middle either.** The status branch sits BEFORE the guard's early return for
a draft, because the rule is about the MOVE and not about where the row started. This costs nothing:
cancelling a draft is already issue-then-cancel in `lib/data/facturare-actions.ts`, because
`invoices_numbered_past_draft` forbids a numberless row past draft.

**No invoice row was deleted or cancelled by this card.** No delete privilege was granted, no delete
policy was created, and section 5 of the migration re-asserts on every run that neither exists on any
of the four invoice tables and that the series counter is still unwritable by anybody.

---

## What changed, file by file

### `supabase/migrations/0064_invoice_freeze_and_one_per_issue.sql`

The only file this branch adds under `supabase/migrations/`. It adds three things and removes nothing.

**1. `public.invoices_require_draft_to_edit()`, replaced, two new branches.**

Finding **G1**: the guard compared fifteen columns past draft and `status` was not one of them, on the
stated ground that an issued invoice has to be able to become paid or cancelled. True about why, and
silent about WHICH moves. So `{"status":"draft"}` changed nothing else and was permitted, and on the
next update the guard returned early at `0063:516` and the number, the series, the client, the project,
the dates, the notes and all three stored totals became writable, lines included, because
`invoice_lines_require_draft` reads the parent's CURRENT status.

Neither existing constraint could catch it, and both look as if they might:

| constraint | why it is satisfied anyway |
|---|---|
| `invoices_numbered_past_draft` | reads `status = 'draft' or number is not null`, and the first half is true the moment the status is `draft` |
| `invoices_cancel_reason_only_when_cancelled` | reads `status = 'cancelled' or cancel_reason is null`, and an issued invoice has no cancel reason to begin with |

Finding **G16**: the guard deliberately omitted the six stamp columns because
`invoices_stamp_status` writes them. Also true, and also not the whole rule: that function fills a
stamp only WHEN IT IS NULL, so it never corrects one, and an already stamped `issued_at` could be
rewritten to any timestamp by a plain UPDATE. The Istoric on the invoice screen is built entirely from
those six columns. They are now writable only while the old value is null.

The rule is "writable only while null" and not "never writable", because `markInvoicePaid` deliberately
writes `paid_at` itself, at midday UTC, so that the stored moment falls inside the Chisinau calendar
day the operator chose. A write that repeats the value a column already holds is not a change and
passes, which is what an UPDATE that sends the whole row does.

The trigger keeps its name, and the file says why: PostgreSQL fires BEFORE row triggers in name order,
so `invoices_require_draft_to_edit` runs before `invoices_stamp_status`, which is the only reason the
stamp branch can tell a caller's rewrite apart from the stamper's own fill. The assertions file checks
that ordering as a string comparison, so a rename cannot quietly break it.

**2. `invoices_one_live_per_outbound_issue`, a partial unique index.**

Finding **G5**: "Exista deja o factura pentru aceasta iesire" was decided by a SELECT in
`getIssueInvoiceability` and the write path inserted without re-asking.
`invoices.outbound_issue_id` was an ordinary nullable foreign key with an index and no unique
constraint. Two tabs on `/facturare/nou?iesire=X` both succeeded and NEITHER invoice could be deleted.

    create unique index if not exists invoices_one_live_per_outbound_issue
      on public.invoices (outbound_issue_id)
      where outbound_issue_id is not null and status <> 'cancelled';

Cancelled invoices are outside it, because an Iesire whose invoice was cancelled must be invoiceable
again, which is the whole point of cancelling one. Null is excluded in the predicate as well as by
PostgreSQL treating nulls as distinct, so the rule is stated rather than inherited.

In front of it sits the counting block described in the owner section above. It raises a readable
exception naming every offending `outbound_issue_id`, and the whole file is one transaction, so the
raise leaves the database exactly as it was.

**3. `public.save_invoice_draft(uuid, jsonb, uuid, uuid, uuid, date, text)`.**

Finding **G6**: saving was two PostgREST requests, the header then the lines. If the second failed the
function returned a refusal and the header STAYED: numberless, lineless, on the month's list because a
draft's list date is its creation day, and removable by nobody, because `public.invoices` has no
delete privilege and no delete policy for any role, owner included. The only route out is to cancel
it, which spends a real number on a document that was never composed. The edit path had the same
shape, one request per line.

The function writes the header and every line in one transaction, creates when `p_invoice_id` is null
and rewrites a draft when it is not, and refuses: a caller with no active profile, an invoice that
does not exist, an invoice past draft, an empty line list, a stored line left out, and a line id that
belongs to another invoice. It writes no total: the triggers from 0063 still own all six figures, and
it does not write `issue_date` either, for the reason the action already gave.

It is **SECURITY INVOKER**, which is the opposite of `issue_invoice`, and the file says why.
`issue_invoice` must be SECURITY DEFINER because it writes `public.invoice_number_series`, which has
no write policy and no write grant at all. This function writes nothing a caller may not already
write, so running it as the caller keeps the `invoices` and `invoice_lines` policies in force on every
statement inside it; a SECURITY DEFINER version would have been a second door into the same two tables
for no gain. It still takes the authorization decision on its first line, with the same predicate the
policies use, because a policy filters a row and returns a silent zero-row answer where a caller
deserves a sentence.

### `scripts/poc-free/local-db/assertions/0064_invoice_freeze_and_one_per_issue.sql`

Eight sections: the shape, the fixtures, the three legal moves and every refused one, the six stamp
columns with the witness half, the index including that a cancelled invoice does not block its Iesire,
the RPC and each of its refusals, the four measured rounding cases on the database side, and a
re-check that nothing about deleting moved. Everything inside one transaction that is rolled back.

Its header names what it deliberately does NOT assert and where that is proved instead: the RPC's
atomicity, because a psql session is one transaction and a plpgsql `EXCEPTION` block would roll back
the OLD two-statement code exactly as it rolls back the new one; and the TypeScript preview
arithmetic, which has no SQL to assert, though the database side of that promise is asserted here so
the figure the screen must match is written down in SQL as well.

### `lib/data/facturare-money.ts`, new

Finding **G4**. The editor computed the preview with
`Math.round((value + Number.EPSILON) * 100) / 100` over binary floats while the database uses
`round(numeric, 2)` over exact decimals, and the file's own header promised they agree. The ORDER did
match; the arithmetic could not. `Number.EPSILON` does not rescue it: it is about 2.2e-16 and it is
added BEFORE the multiplication by 100, so for any value above about 1 it is orders of magnitude
below that value's own floating point step.

The module works on integers: quantity in thousandths, money in bani, the rate in hundredths, each
read out of the typed decimal STRING digit by digit rather than through a float, so there is no moment
at which the value is approximated. The rounding order is the trigger's, unchanged.

It uses `BigInt`, and that is not gold plating: `numeric(14,3)` times `numeric(14,2)` can reach about
1e28 and `Number.MAX_SAFE_INTEGER` is about 9e15, so a `number` version would have been exact for the
figures anybody tested and silently wrong for the ones nobody did, which is the same class of defect
this card is closing.

The four measured cases, all now in agreement:

| quantity | unit price | line subtotal | line VAT at 20 | line total |
|---|---|---|---|---|
| 0,333 | 1000,00 | 333,00 | 66,60 | 399,60 |
| 1,005 | 1,00 | 1,01 | 0,20 | 1,21 |
| **8,165** | **1,00** | **8,17** | **1,63** | **9,80** |
| 1234,565 | 1,00 | 1234,57 | 246,91 | 1481,48 |

Footer: Subtotal 1576,75, TVA 315,34, Total de plata 1892,09.

### `components/facturare/FacturaEditor.tsx`

`round2` is gone and the figures go through the module. The comment at the top that promises the
screen and the database agree is KEPT rather than weakened: the sweep offered "the screen should stop
promising that it matches" as an alternative and the goal asks for the number to be right instead. The
paragraph now records that the promise was false until this card and says why.

`num()` is kept for the validation list and is not replaced, so no refusal on the screen changes
behaviour: the problems list asks whether a quantity is above zero and whether a price is not
negative, and a float answers those well enough.

### `lib/data/facturare-actions.ts`

`saveInvoiceDraft` writes through the RPC on both paths. Its Romanian field-attached refusals are
unchanged, and the two-level defence this file's header already describes is intact: the checks in
code exist to return a sentence with the field beside it, and the function is the guarantee.

`refusal()` translates `23505` by **constraint name** and not by code alone. On this table `23505`
could in principle be `invoices_number_unique_per_series`, and the sentence about an Iesire put on a
series collision would be a message that lies. The constraint name appears in PostgreSQL's raw error
text, which never reaches the screen.

### `docs/migrations/APPLY-LOG.md`

One line added to the pending register, as `tests/e2e/headers.spec.ts` requires: every migration file
must be in exactly one of applied or pending-with-its-card.

---

## What proves it

Nine cases in `tests/e2e/facturare-data.spec.ts` and eleven in
`tests/e2e/facturare-create.spec.ts`, none skipped.

| finding | case | what it asserts |
|---|---|---|
| G1 | data 3, data 6 | a move back to draft refused on issued, paid and cancelled, the status unchanged after each; the three legal moves succeeding; eight illegal moves refused, paid to cancelled included |
| G16 | data 7 | each of the six stamp columns refused once set and WRITTEN while null; the day `markInvoicePaid` chose kept; cancelling not clearing the issue date |
| G5 | data 8, create 11 | a second live invoice on one Iesire refused by the index BY NAME, exactly one invoice on it afterwards, another Iesire and two manual invoices unaffected, a cancelled invoice not blocking its Iesire and keeping its number; on the screen the Romanian sentence with no index name, no `23505` and no raw duplicate-key text |
| G6 | data 9 | a fresh client, a save that fails on its line, the invoice count UNCHANGED; a half-good pair that also leaves nothing; a witness save that moves the count by one and whose totals come from the trigger |
| G4 | create 10 | the four measured cases typed in, the line totals and the footer read OFF THE SCREEN before saving, and every figure equal to what the database stored |
| G9 | data 2 | two `issue()` calls on ONE draft through `Promise.all`: one winner, one number, and the counter advanced by EXACTLY one |
| G10 | data 3 | `{"status":"draft"}` in the refusal loop the sweep pointed at, for each of the three states |
| G11 | data 8, data 9 | the two write paths that were not transactions, at the data layer |

**No existing assertion was weakened or removed.** The witness case in `facturare-data.spec.ts` case 3
that proves the trigger is not simply a wall is kept, and case 6 and case 7 each carry a witness half
of their own for the same reason. `git diff origin/main...HEAD -- tests/` shows additions to the
refusal loops and no deletion of an assertion.

### Local gates, each command run alone, each exit 0

    npx tsc --noEmit
    npm run build                     the route list still carries /facturare/nou, /facturare/[id], /facturare/[id]/modifica
    node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json
    npm run check:card-ids
    npm run check:board-edit          P3-111 absent at base, shipped at head, 1 of 1 satisfied
    npm run check:board-clock
    npm run check:unique-ids
    npm run check:open-branch-ids
    npm run check:no-destructive-migration   1 file parsed, 20 statements, every kind classified
    npm run check:conflict-residue
    npm run check:categories
    npm run check:ledger-rows
    npm run check:no-prod-target
    npm run check:pending-schema-reads       21 pending migrations, no unguarded read
    npm run check:removal-safety
    npm run check:assertion-register
    npx playwright test --list               480 tests collected, 20 across the two Facturare files

**This machine has no Docker and no Supabase CLI**, so the end to end suite, `npm run check:migrations`
and the two applier proofs run only in CI, and nothing here claims otherwise. For this pull request the
destructive-migration step and BOTH applier proof steps must have RUN and passed, not been skipped.

---

## What was deliberately not done

- **The sweep's other findings.** G2 and G3 (the Chisinau clock on the cancel path and on an empty
  issue date), G7 (the unlabelled money total on the Facturi list), G8 (the predicted number in the
  Emite confirmation), G12, G13, G14, G15, G17 and G18 are all real and none of them is this card.
  Fixing a defect noticed in passing is self-invented scope.
- **The numbering.** `public.issue_invoice`, `public.invoice_series_for` and
  `public.invoice_number_series` are byte for byte unchanged. The sweep says the allocator is the one
  piece of this feature that was built right. The new index cannot interfere with it: it is on a
  different column and it excludes exactly the cancelled rows a series keeps.
- **`issue_date`.** Already properly frozen by the fifteen-column list, which this card keeps and the
  assertions file re-checks.
- **PDF, printing, email and e-Factura.** The sentence part 2 put under the Facturi list stays true
  and stays on the screen: Max has not chosen one of the three Moldova options.
- **Production.** No live site opened, no production row read, no credential sourced. No file under
  `app/api/extraction`, `app/api/documents`, `lib/data/extraction` or `docs/contracts/extraction` was
  touched, so there is nothing to tell Andre.

---

## Left for the owner

1. **The merge decision.** Real client data has been in production since 2026-09-14 and there are real
   invoices in it since 2026-09-28, so this pull request is not self-merged. The mailbox question
   carries the pull request number, the head sha and the migration path.
2. **The one risk, restated.** If the live database already holds two live invoices for one release,
   the migration refuses to apply, names the release, and changes nothing. That would need a decision
   about which of the two invoices is real, and it is not a decision a terminal may take: the goal line
   forbids deleting or cancelling an invoice to make a constraint pass.
3. **Whether a paid invoice should ever be cancellable.** The database now refuses it, matching the
   design report and the shipped screen. If an accountant needs it, that is a new card.
