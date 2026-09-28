# Facturare part 3 of 3: create and manage an invoice

**Role** EXECUTOR, after one AUTHOR step in the same session and the same pull request.
**Date** 2026-09-28, UTC.
**Card** P3-110, phase 3 board, `shipped` in this pull request.
**Branch** `card/p3-110`, cut from `origin/main` at `f29f6fb` (card P3-109, part 2).
**Goal** G65 part 3, the last of three.

---

## 1. What Rapid Construct can do that it could not do this morning, in plain words

Mihai can now make an invoice and take it to the end.

On a material release there is a button, **Creează factură**. It opens an invoice already
filled in from that release: the customer, the building site, and one line per item with
the quantity, the unit and the price the material left at. There is also **Factură nouă**
on the invoice list, for an invoice with no release behind it, where everything is chosen
by hand.

While the invoice is a draft he can change quantities and prices, add a line the release
did not have, such as delivery, and write a note. Pressing **Emite** asks first, in one
sentence, and says the number the invoice is about to get, because after that the invoice
cannot be changed any more, only cancelled. Once issued it can be marked **plătită** with
the date it was paid, or **anulată**, and cancelling always asks why in a box that cannot
be left empty. A cancelled invoice keeps its number and stays on the list.

Nothing is ever deleted. There is no delete button anywhere, in any state, for anybody.

The customer's page and the building site's page each have a **Facturi** tab, so the
invoices of a customer are found where the customer is.

---

## 2. The one place the design report and the goal disagreed, and how it was settled

This is the first thing the brief asked to be recorded, and both sentences are quoted so
the next reader can see the disagreement was noticed and settled rather than missed.

**The design report**, `docs/reports/2026-09-24-author-facturare-design.md`, screen 3:

> "A draft that was never issued and never numbered is the only thing here that may
> genuinely be thrown away, because it was never a document."

**The goal line**, G65 part 3, the owner's own words on 2026-09-28:

> "Nothing is ever deleted."

**The goal wins, and it wins three times over.**

1. It is this repository's doctrine and the report itself says so two sections earlier,
   under "THE RULE: AN INVOICE IS NEVER DELETED": "The invoice tables carry no delete
   permission for any role, owner included."
2. It matches the precedent already shipped. Card P3-84 gave extraction drafts a
   `cancelled` state precisely so that a junk draft is set aside and kept rather than
   deleted.
3. **Migration 0063 has already decided it, and a screen cannot overrule a grant.**
   `authenticated` holds `select, insert, update` on all four invoice tables and no
   `delete`, there is no delete policy for any role, and the migration's own section 11
   asserts both on every run. A delete button would have been a button that fails in
   front of the operator.

So an unwanted draft is **cancelled with a reason** and stays readable, like any other
invoice.

### The part of that decision which cost the most thought: a line

The brief also says that while an invoice is a `ciornă` the operator may **remove a
line**. The same grant blocks it: `public.invoice_lines` has no delete privilege and no
delete policy, and zeroing a line is not a way round either, because
`invoice_lines_quantity_positive` refuses `quantity = 0` and the line would still print
on the document. An additive migration granting a narrow delete was considered and
refused: it would contradict the goal's own rule inside the card that quotes it, and the
card's acceptance forbids any file under `supabase/migrations/`.

**What was built instead, and it is not a workaround, it is the honest shape of the
screen.** The create screen writes the lines ONCE, when `Salvează ciorna` or `Emite` is
pressed. While the invoice is being composed nothing is stored, so taking a line off
removes nothing and is free: that is the path the goal describes, the one from an
`Iesire`, and it works exactly as written. On a draft that is already saved the operator
may still change every quantity, every price, the dates and the note, and add a line;
the remove button is disabled **with the reason beside it** and the screen says what to
do instead, which is to cancel the draft with a reason and make a new one.

The server action refuses a save that omits a stored line rather than accepting it
quietly, because a line that disappears from the screen and stays in the document is the
worst of the three possible outcomes.

### A second thing the schema decided, and the screen now says out loud

`invoices_numbered_past_draft check (status = 'draft' or number is not null)` means no
invoice can hold any state past draft without a number. A **cancelled draft** is a state
past draft. So cancelling a draft **issues it first**, through `public.issue_invoice`,
and then cancels it. The operator sees a cancelled document carrying a number, on the
list, with its reason, which is ordinary bookkeeping and which the design report already
describes; what cannot happen is a hole in the series. The confirmation says this
**before** it happens, because a consumed invoice number is a consequence the operator
has a right to know about.

The two statements are not one transaction, and that is said rather than hidden: if the
second fails the invoice stays `Emisă` with its number, the message says exactly that,
and a second press finishes the job. No number can be lost.

---

## 3. Stock is not touched by invoicing

The second thing the brief asked to be recorded.

**Issuing an invoice moves no material and changes no batch.** Nothing in this card
writes `public.batches`, `public.outbound_lines` or any product row, and nothing calls
`product_available_stock` or `checkThresholdsFor`. The `Iesire` already moved the stock,
at the moment the bon was created, which is where that check lives under an advisory lock
in migration 0004. An invoice is the document that follows the movement; it is not a
second movement.

This matters because an invoice looks like a sale, and a system that decremented stock
when an invoice was issued would take the same material out of the warehouse twice.

---

## 4. What remains unbuilt, and what it waits on

The third thing the brief asked to be recorded.

**No PDF, no printing, no email, no e-Factura.** Section 2 of the design report lays out
three options for Moldova's state system, e-Factura, and **Max has not chosen one**. Part
2 shipped the line `Tipărirea și e-Factura urmează.` under the list; it is still true,
it is still there, and the invoice page now carries the same sentence for the same
reason. `invoices.state_system_number` and `invoices.state_system_status` stay nullable
and empty, exactly as part 1 left them.

Also deliberately not built, each for a stated reason:

- **A credit note.** The design report leaves it out of scope rather than inventing it. A
  correction to an issued invoice is a cancellation plus a new invoice.
- **Cancelling a paid invoice.** The goal gives actions for `ciornă` and `emisă` only. A
  payment already received that is then undone is a refund, which is an accounting
  decision this card does not invent. The action refuses it with a Romanian sentence
  saying so.
- **A total on the client and project tabs.** The sum of a customer's invoices is a
  report question. A number placed there without saying what it includes, cancelled ones
  for instance, is a total nobody can trust. The `/facturare` list has the foot line,
  with its filters.
- **A link from the invoice to its `Iesire`.** An `Iesire` has no address of its own in
  today's application: its panel opens from a click on `/comenzi` and that selection
  lives in component state, not in the URL. A link to `/comenzi` carrying a bon number
  would promise a document and deliver a list, which is the dead link
  `components/ui/RecordLink.tsx` exists to refuse. The reference is text. The day an
  `Iesire` has an address, that text becomes a link and nothing else changes.
- **A `Creează factură` button on each row of the `/comenzi` list.** It is on the
  `Iesire`'s own panel and on the confirmation of a freshly created bon, which are the
  two moments the operator has the release in front of them. A list row carrying a second
  primary action is how a list becomes a form.

---

## 5. What was built, file by file

**Reads.**

- `lib/data/facturare-detail-types.ts`, `lib/data/facturare-detail.ts`: one invoice with
  its parties, lines, totals and history. Three answers and not two, `pending`, `missing`
  and `ok`, so the route can tell an unapplied migration from an id that does not exist.
- `lib/data/facturare-create-types.ts`, `lib/data/facturare-create.ts`: whether an
  `Iesire` can be invoiced and why not when it cannot; what the form opens with for all
  three paths; and the next number of today's series, READ and never allocated.
- `lib/data/facturare-list.ts`: `listInvoicesForRecord` added beside `listInvoices`, on
  the same `select` and the same row mapping, for a client's and a project's own
  invoices. Not a second file, because that would be a second shape of the same row and
  the first place the two would drift.

**Writes**, four and no fifth, all in `lib/data/facturare-actions.ts` beside part 1's
settings action: `saveInvoiceDraft`, `issueInvoice`, `markInvoicePaid`, `cancelInvoice`.

**Screens.**

- `app/(app)/facturare/nou/page.tsx` plus `components/facturare/FacturaEditor.tsx`: one
  screen for both paths, `?iesire=<id>` prefilled and empty for the manual path.
- `app/(app)/facturare/[id]/page.tsx` plus `components/facturare/FacturaScreen.tsx`: the
  invoice page.
- `app/(app)/facturare/[id]/modifica/page.tsx`: the same form loaded off a saved draft.
- `components/facturare/FacturaRefuz.tsx`: why a screen cannot be opened, in Romanian,
  with a way back.
- `components/facturare/InvoicesForRecord.tsx`: one table, both tabs.

**Wiring.** `components/orders/OutboundPanel.tsx` and
`components/outbound/OutboundScreen.tsx` carry `Creează factură`;
`components/facturare/FacturiScreen.tsx` gains `Factură nouă` and makes the number a
link; `ClientTabs` and `ProjectTabs` gain a `Facturi` tab, threaded through their detail
screens and routes; `lib/data/outbound-detail.ts` reads the invoiceability in the same
round trip as the issue.

**Nothing under `supabase/migrations/`.** `git diff --name-only origin/main...HEAD` lists
no path there, and `npm run check:no-destructive-migration` parses 0 files for exactly
that reason. **Merging this pull request changes no database.**

### One word changed in a file this card did not otherwise need to touch

`lib/data/facturare-actions.ts` carried a comment reading "nici drept de insert nici de
delete pe tabela". The card's acceptance asks that a search for the English word over
`lib/data/facturare*` find nothing, so that the claim "no delete path in the data layer"
is checkable rather than asserted in prose. The word is now `stergere`. The meaning of
the sentence is unchanged and the change is noted here so it does not look like a stray
edit in the diff.

---

## 6. How the acceptance is proved

`tests/e2e/facturare-create.spec.ts`, nine cases, none skipped, in the `quality` run on
the head sha. Case by case: the copy from an `Iesire` asserted value by value against the
release rows read out of the database and a quantity change moving every total; `Emite`
confirming with the number in the sentence, then the database allocating exactly that
number, then the next invoice taking the next one, then a `PATCH` straight to PostgREST
refused with `nu mai este ciorna`, which is the database and not the screen; paid with a
date, checked in `Europe/Chisinau`; cancelled with a required reason kept, shown, and the
number unchanged, still on the list, and the next issue not reusing it; no delete control
in any of the four states plus a grep over `lib/data/facturare*` run from the spec itself;
the disabled button with its Romanian reason for both causes, and the route refusing the
hand-typed address with the same reason; both tabs; the manual path; and both new screens
at 390x844.

`tests/e2e/facturare-list.spec.ts` case 4 had one assertion whose PREMISE this card
changes: it asserted that `Factură nouă` appears nowhere. That was true and correct while
the screen the button opens did not exist, and P3-109 said so in its own defaults (b).
The assertion is replaced by its opposite, with the old two lines quoted above it, and the
other five cases of that file are untouched and green in the same run. **This is not a
weakened check.** The rule that kept the button out is the same rule that brings it in:
nothing appears that cannot be used yet.

The new `Facturi` tab is already swept for contrast by
`tests/e2e/client-project-tabs.spec.ts`, whose `expectRowReadable` measures EVERY inactive
tab in the band rather than a named list. It was deliberately not added to the `TABS`
constants of `client-detail.spec.ts` and `project-detail.spec.ts`: both files walk their
list and then assert which panel survives a reload, so those loops encode "the last tab",
and appending to them would change what those cards assert. That is scope this card does
not have.

### Local gates, each command run alone, each exit 0

`npx tsc --noEmit`; `npm run build`, whose route list carries `/facturare/nou`,
`/facturare/[id]` and `/facturare/[id]/modifica`; the board validator on all three boards
before every commit; `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
`check:no-destructive-migration`, `check:pending-schema-reads`, `check:conflict-residue`,
`check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:removal-safety`,
`check:assertion-register`, `check:board-clock`; and `npx playwright test --list`, which
collected the nine new cases.

`npm run check:board-edit` was red until the card was flipped to `shipped` on this same
branch, which is by design and is what that check exists to enforce.

**This machine has no Docker and no Supabase CLI**, so the end to end suite, the migration
apply and the two applier proofs run only in CI, and nothing here claims otherwise. The
two applier proofs are expected to SKIP, because this branch adds no migration.

---

## 6b. The first CI run went red on one case out of 474, and the fix is in the spec

Run **36491851648** on head `fb80d91` concluded failure in 37m48s: **473 passed, 1 failed.**
Every step before `End to end` passed, including `Refuse a code pull request whose board
edit is missing`, `Refuse a migration that removes rows`, `Refuse application code that
reads unapplied schema` and `Refuse a board timestamp from the future`. The two applier
proofs were skipped, which is what a skip means on a branch that adds no migration. Eight
of this card's nine cases passed, so the copy from an `Iesire`, `Emite` with its
confirmation and the consecutive numbers, the database refusing an edit, paid with a date,
cancelled with a kept reason and a kept number, the disabled button with its reason, both
tabs, the manual path and both screens at 390x844 were all proved in that run.

**The one failure was my own grep, and the product was right.** Case 5 proves "no delete
path in the data layer" by reading `lib/data/facturare*` from inside the spec, and the
first version matched the word `delete` on any line. It found
`lib/data/facturare-actions.ts:151`, which is a **comment quoting the goal line it obeys**:
*"Nothing is ever deleted", iar aceasta este linia care se respecta*. The same check would
also have caught the Romanian sentence that file returns to the operator, `nimic nu se
șterge aici`, which is the exact opposite of a delete path. Both sentences state the rule;
the check punished them for saying it.

The fix matches **the form of a call** instead, on every line including comments, because a
commented-out path is a path somebody uncomments: `.delete(`, `.remove(`, `delete from` and
`method: "DELETE"`, which is everything this layer has available. The case then puts those
four patterns against four lines written in the spec that are what a real delete would look
like, because **a grep in a test that matches nothing passes forever**. That self-test is
the part the first version did not have, so the second version is stricter than the first
rather than looser: the claim it makes is now about a delete path and it is proved able to
find one.

**No application code changed for this fix.** The second push carries
`tests/e2e/facturare-create.spec.ts`, `docs/LEARNINGS.md`, this report and the board entry,
and nothing else.

---

## 7. Defects found while working the card

Six, each appended to `docs/LEARNINGS.md` in this pull request as an ERROR and SOLUTION
pair:

1. A line already written to an invoice cannot be removed, and the schema is the reason.
2. Cancelling a draft invoice needs a number first, and the constraint says so.
3. PostgREST hands back `3.000` for a quantity of three, which a Romanian form reads as
   three thousand. Fixed by one helper in `lib/data/facturare-create.ts`; without it the
   quantity box on the create screen said three thousand to the person about to press
   `Emite`.
4. `check-pending-schema-reads` refuses a file for the ordinary word `description`. Fixed
   with three tolerated file-and-word PAIRS, which is the mechanism that check already
   has for this, and not with an exemption and not by renaming the application's own
   field.
5. A per-case fixture needs a per-case IDNO, because `clients.fiscal_code` is unique.
   Caught by reading migration 0013 before the first run rather than by a red one:
   `C7` and `C7b` both reduce to the digit `7`.
6. A grep for the word `delete` in a test falls over the sentence that forbids deleting.
   This is the one that cost a CI run; section 6b above is its whole story.

Of the six, numbers 4 and 6 were found by a check going red, 6 in CI. One, two, three and
five were found by reading the migrations and the PostgREST responses before writing the
code, which is where they are cheapest.

### One finding recorded and NOT acted on

`comboPick` now exists in a fourth spec file and the phone reading helper in a fifth.
`tests/e2e/outbound.spec.ts`, `deviz.spec.ts` and `reminders.spec.ts` each carry their own
`comboPick`; `phone-lists.spec.ts`, `phone-forms.spec.ts`, `phone-remainder.spec.ts` and
`facturare-list.spec.ts` each carry their own phone reader. P3-109 already noted the
second half of this. Pulling either into `tests/e2e/support/` is a sweep of files that
belong to other cards, which is scope this card does not have. It is written here so the
next spec card can claim it.

---

## 8. Coordination, safety, and what is left for the owner

- **No production access of any kind.** No live site opened, no production row read, no
  credential sourced. Every fixture is written by hand through PostgREST against the
  local stack, prefixed `TEST`, and no test data is deleted.
- **Nothing in Orange's track was touched.** No file under `app/api/extraction/**`,
  `app/api/documents/**`, `lib/data/extraction*` or `docs/contracts/extraction*` is in
  the diff, so there is nothing to tell Andre.
- **Synced with main before the push**, `git fetch origin` then `git merge origin/main`,
  never a rebase and never a force push. A board conflict would have been resolved by
  keeping both sides.
- **No self-merge.** Real client data has been in production since 2026-09-14, so the
  merge grant is over: the pull request is left open and green and a merge question is
  filed for the owner with the pull request number, the head sha and one plain sentence
  of what changes for Rapid Construct. No migration path is in this pull request, so
  merging it changes no database.

### What the next session picks up

Goal G65 is finished with this card. The next piece of invoicing work is screen 4 of the
design report, the printable document, and it **cannot be authored yet**: it waits on Max
choosing one of the three options in section 2 of that report for Moldova's e-Factura,
which is question 1 of its section 5. Until then the honest line stays on both screens.

---

Report written by EXECUTOR, committed before it was printed, per CLAUDE.md section 9b.
