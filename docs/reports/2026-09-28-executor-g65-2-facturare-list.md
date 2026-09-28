# Facturare part 2 of 3: the Facturi list and its menu entry

**Role:** AUTHOR, then EXECUTOR, one session, one pull request.
**Date:** 2026-09-28 UTC.
**Card:** P3-109, authored in this pull request, on `docs/board/rc-board-phase3.json`.
**Goal:** G65 part 2. Part 1 is card P3-108, pull request #372, migration
`0063_invoices.sql`, merged and live. Part 3 is a separate card and is not started.
**Branch:** `card/p3-109`, cut from `origin/main` at `d7c1fdd`.
**Migration:** none. `git diff --name-only origin/main...HEAD` lists nothing under
`supabase/migrations/`.

---

## 1. What Rapid Construct can do now that it could not yesterday

Mihai can see his invoices. A new **Facturare** section appears in the menu, between
`Stoc` and `Configurare`, with one entry, **Facturi**. It opens a list of invoices,
newest first, showing for each one: the number, the date, the customer, the building
site, the total in lei including the bani, and what state it is in, as a coloured
label: `Ciornă`, `Emisă`, `Plătită` or `Anulată`.

The list opens on the current month. The period can be changed with two date boxes
written the way a date is written here, day.month.year. There is a filter for the
state, a filter for the customer, and one search box that finds an invoice either by
its number or by the customer's name.

Under the list there is a line saying **how many invoices are on screen and what they
add up to**, so nobody has to reach for a calculator to total a month. And under that,
one honest line: `Tipărirea și e-Factura urmează.` Printing an invoice and sending it
to the state system are not built, and the screen says so rather than letting somebody
hunt for a button.

**What is deliberately not here:** making an invoice, issuing one, marking one paid,
cancelling one, and the page of a single invoice. All of that is part 3.

---

## 2. The three questions the task asked to be answered in this report

### Was the `Proiect` column included? Yes.

The goal line names five columns and the design report names six. Six fit at 1440
without crowding, at `Număr, Data, Client, Proiect, Total, Stare`, and the project is
a link to the project exactly as the client is a link to the client.

The deciding reason is not width. The same design report refuses a location filter,
and the sentence it refuses it with is that the equivalent axis here **is the
project**, which "is already a column and already searchable". Dropping the column
would have left the screen without the axis the report kept in place of the filter it
removed, so the list would answer one fewer question than the design it implements.

### What happens to the `Factură nouă` button until part 3? It does not exist at all.

Not present, not disabled, no hint. The design report does put one on this screen, and
it goes to a screen part 3 builds.

The task allowed either a disabled button with a Romanian hint or nothing, and asked
which. Nothing, for the reason the report itself states two paragraphs earlier about
the menu: "nothing appears in the menu that cannot be used yet", because a section
that opens onto something that does not work "teaches Mihai that the section does not
work, and he will stop opening it". A greyed-out primary button on a brand new screen
is the same lesson in a smaller place, and it is the first thing the eye lands on. The
empty state and the line under the list already say what is and is not here, in
Romanian, without offering anything.

The acceptance asserts this rather than trusting it: case 4 asserts `Factură nouă`
appears **nowhere** on the screen, in any state.

### What was deliberately left for part 3?

- **Creating an invoice**, both paths the report describes: from an `Ieșire` with the
  lines already filled in, and by hand from nothing.
- **Issuing one.** `public.issue_invoice` exists and is proved by part 1; no screen
  calls it.
- **Marking one paid, and cancelling one.** Both are ordinary updates the database
  already permits and refuses correctly; no screen performs them.
- **The page of a single invoice**, with its lines, its subtotal, its VAT, its note and
  its history. A row on this list therefore does not open anything: the client and the
  project are links to records that **exist**, and the number is text. A row that
  navigated nowhere would be the same broken promise as the disabled button above.
- **Printing and e-Factura**, which is what the line under the list says out loud.
- **Pagination.** The period is the bound today: the default filter is one month, and a
  month of invoices is a list a person reads. A silent row cap would make the foot line
  lie about the period, which is the one thing this screen exists to get right.

---

## 3. The decisions this card had to make, and the reasons

Every one of these is also written into the card's `defaults` on the board, so a
reviewer reading the board alone sees them.

### The period is read on the issue date, and on the CREATION day for a draft

This is the only place the card interprets rather than implements, and it is the thing
to read twice.

Migration 0063 sets `issue_date` only at `Emite`, so **a draft has no date at all**. A
screen whose default filter is a month and which filters only on `issue_date` would
therefore hide **every draft ever written**, which is exactly the unfinished work an
operator must not lose. So each row carries the issue date when it has one and the
Chișinău calendar day of `created_at` when it does not. The `Ciornă` chip on the same
row says the invoice is not issued, and the cell's title says which of the two dates
it is showing.

The implementation has one wrinkle worth knowing about. `created_at` is a
`timestamptz`, and its Chișinău day is not its UTC day for three hours of every day.
The database is therefore asked for the period with **one day of margin at each end**,
through a single PostgREST `or` of two `and` groups, and the exact day is compared in
`lib/data/facturare-list.ts` using `chisinauDateOf`, which is the function the rest of
the application already uses for precisely this distinction.

### The search happens in the reader, and only the search

This looks like the thing `ClientsScreen` forbids in its own header, and it is not.
The ban there is on a **component** filtering in memory and then disagreeing with its
own count; here the component filters nothing whatsoever.

The reason the reader does it is that **the invoice number is not a column**. It is the
series plus the number, composed at display time by `invoiceNumberText`, and part 1
refuses in its own header to store a third copy of the same information. A filter
cannot be written over a string that is not stored.

The state, the client and the period are database filters. The rows, the count and the
sum all leave the reader together, computed from the same array, so the foot line
cannot disagree with the rows above it.

### `formatMoneyExact`, and `formatMoney` untouched

The task said to put the total through `formatMoney`. `formatMoney` rounds to whole
lei, and for an invoice that is wrong: the total is stored `numeric(14,2)`, it is the
sum the customer pays, and it is written on a document. `1.200 MDL` for a stored
`1199.50` is a number that appears nowhere else. `lib/data/format.ts` therefore gains
`formatMoneyExact`, with both `minimumFractionDigits` and `maximumFractionDigits` set
to 2, and `formatMoney` is not touched: whole lei is right for the value of a stock and
every existing screen stays exactly as it is. This is recorded in
`docs/LEARNINGS.md` as well, because the next card that reaches for a formatter by its
name will hit the same thing.

### No new capability gate

`lib/data/facturare-list.ts` reads `public.invoices` behind `hasFacturareSettings`.
0063 creates the enum and all four tables in **one transaction**, so "invoice_settings
exists" and "invoices exists" are the same fact and cannot ever answer differently. A
second probe would be a second trip to the database for an identical answer, plus a
second cache that could go stale differently from the first. The sentence in
`schema-capability.ts` that explains P3-108's choice is kept and extended rather than
rewritten.

### The rest, briefly

- **The client filter offers the clients that HAVE at least one invoice**, not every
  client, and builds that list without the period so that choosing a client stays
  possible when the month on screen holds none of theirs. Same judgement the report
  writes about the location filter: a filter whose every option can return a row is a
  filter an operator trusts.
- **No location filter**, as the report requires in terms.
- **Every filter is in the URL**, as on `/clienti`, so a filtered list can be sent to
  somebody as a link and the back button rebuilds it. Romanian parameter names
  (`de-la`, `pana-la`, `stare`, `client`, `q`), English enum values, exactly as
  `etapa=client` and `stare=active` already are.
- **A broken `client` parameter is ignored rather than obeyed.** A value that is not a
  uuid makes PostgREST answer `22P02`; the read would return null and the screen would
  say invoicing is not active, which is false. A mangled address shows the unfiltered
  list, which is the only true thing it can show.
- **One date box emptied does not empty the period**: that end returns to the month
  boundary and the other stays. **A reversed period is swapped back**, because `De la`
  after `Până la` can return no row and would show the empty state with both boxes full
  and no explanation.
- **The date boxes are the Romanian ones from P3-49** and there is no
  `<input type="date">` anywhere on the screen. The owner chose day.month.year
  explicitly (mailbox answer q009, option 1).
- **The four chips use four tones that already exist**: `neutral` for `Ciornă`, which is
  not yet a document, `info` for `Emisă`, `ok` for `Plătită`, `danger` for `Anulată`. No
  tone is added, so nothing needed adding to `tests/e2e/button-contrast.spec.ts`, whose
  last case already walks `CHIP_TONE_NAMES` and holds all six at 4.5:1.
- **No phone class is written here.** The screen imports `PHONE_CELL`, `PHONE_CONTROL`,
  `PHONE_LINK`, `PHONE_ROW`, `PHONE_TABLE` and `PHONE_WIDE` from
  `components/ui/phone.ts`, which is what card P3-100 swept eleven files into.

---

## 4. What was written

| Path | What it is |
|---|---|
| `lib/nav.ts` | the `Facturare` group and its one `Facturi` entry, plus `invoice` on `IconName` |
| `components/ui/Icon.tsx` | one inline path for that icon, because `IconName` is a `Record` |
| `lib/data/facturare-list-types.ts` | the query and the row, the default month, the URL parsing. No `server-only`: the screen is a browser component |
| `lib/data/facturare-list.ts` | the read, `server-only`, behind the schema gate |
| `lib/data/format.ts` | `formatMoneyExact` added, `formatMoney` untouched |
| `lib/data/schema-capability.ts` | one paragraph saying why this card reuses `hasFacturareSettings` |
| `app/(app)/facturare/page.tsx` | the route. Reads today once, parses, renders `SchemaPending` when 0063 is not applied |
| `components/facturare/FacturiScreen.tsx` | the screen |
| `tests/e2e/facturare-list.spec.ts` | the acceptance, six cases |
| `docs/board/rc-board-phase3.json` | card P3-109 |
| `docs/LEARNINGS.md` | four ERROR and SOLUTION pairs |

---

## 5. Proof

### Local, this machine, each command run alone, each exit 0

`npx tsc --noEmit`; `npm run build`, whose route list carries `/facturare`; the board
validator on all three boards before every commit; `check:card-ids`,
`check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration` (0 files
parsed, because there is no migration), `check:conflict-residue` run **after**
`git add`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`,
`check:pending-schema-reads` (0063 still in the pending register, which it can only
pass because the reader imports the gate), `check:removal-safety`,
`check:assertion-register`, `check:board-clock`. `npx playwright test
tests/e2e/facturare-list.spec.ts --list` collects six cases.

`npm run check:board-edit` was red until the last commit, on purpose and by design:
it refuses a code pull request whose card is not at a terminal status at the head. The
final commit flips P3-109 to `shipped` with its evidence, which is the order the
factory's `KNOWN-FAILURES.md` requires for two separate reasons, both recorded there.

### In CI: the first run went red on one case of 465, and the fix is in the spec

**Run `36468928176`, head `9535de2`: failure, 464 passed, 1 failed, 33.3 minutes.**

Every step before `End to end` passed, including `Refuse a code pull request whose board
edit is missing`, `Refuse a migration that removes rows`, `Refuse application code that
reads unapplied schema` and `Refuse a board timestamp from the future`. The two applier
proofs were **skipped, which is what a skip means on this branch**: it adds no migration.

Cases 1, 3, 4, 5 and 6 of `tests/e2e/facturare-list.spec.ts` passed, so the menu place, the
foot line with its `de` form at twenty, the exact empty-state sentence, the draft with no
number, the four Romanian chip labels and the whole 390x844 reading were all proved in that
run.

The one failure was the **last assertion of case 2**, the five filter controls on one row:
`Expected: 5, Received: 7`. **The screen is right and the selector was wrong.** It gathered
the controls with a selector shaped like `input[data-testid], select[data-testid]` inside
the filter row, and `DateField` from card P3-49 renders **two** inputs per date box: the
visible `zz.ll.aaaa` text box, and an `<input type="date">` hidden with `display: none`
carrying the same test id plus `-native`, which exists so the calendar button can call
`showPicker()` on it. Two date boxes contribute four inputs; plus two selects and one
search box makes seven.

The assertion now **names the five controls** and measures each by its own test id, which
also makes a red run say which control left the row, and the case additionally asserts that
both `-native` inputs exist and are **hidden**, which is the real P3-49 rule the loose
selector was proving nothing about. That is a stronger case than the one it replaces, not a
weaker one.

**No application code changed for this fix.** The second push carries the spec, this
report, `docs/LEARNINGS.md` and the board entry, and nothing else.

### In CI, generally

The end to end suite, the bare postgres apply and both applier proofs run only in CI:
**this machine has no Docker and no Supabase CLI**, and nothing here claims otherwise.
The card's nineteen acceptance clauses are proved by the six cases of
`tests/e2e/facturare-list.spec.ts` plus `tests/e2e/headers.spec.ts` case 4, which
sweeps `/facturare` for console errors because the route is in `ALL_ROUTES`, and
`tests/e2e/button-contrast.spec.ts`, which holds the chip tones.

### How the spec stays true on its second run

Test data is never deleted here and invoices cannot be deleted at all, so the table
carries every earlier run's rows. **Every counting assertion therefore has a client
filter on a client this run created**, and the series prefix is put on a per run value
in `beforeAll` and back on `RC-` in `afterAll`, exactly as
`tests/e2e/facturare-data.spec.ts` does and for the reason card P3-101 wrote down.

Three clients, each with a job: A carries one invoice in each of the four states in the
current month plus one issued last month, so the state and period filters have
something to cut; B exists so the client filter and the client-name search have two
different answers rather than one; C carries twenty drafts, because the Romanian `de`
form starts at twenty and cannot be proved with fewer.

---

## 6. Defects and near misses, all five in `docs/LEARNINGS.md`

1. **`formatMoney` rounds to whole lei**, so following the brief literally would have
   put a number on screen that appears on no document and would have let the foot line
   disagree with its own rows.
2. **Two width classes on one element is a race** whose winner is decided by the built
   stylesheet's order, not by the order they are written. The width moved to the
   wrapping `<label>`. A `max-md:` variant over a base utility is a different case and
   is safe, which is what every override in `components/ui/phone.ts` relies on.
3. **A second `signIn` on a live session** asks for a login form the proxy will not
   serve, because `/autentificare` sends a signed-in account to the dashboard. The
   phone case only resizes; the sign-in stays in `beforeEach`.
4. **A test series ending in a hyphen produces a double hyphen** in the composed
   invoice number, because `invoiceNumberText` supplies the separator between the
   series and the number while the prefix supplies the one before the year. The spec
   reads the number back from the database and composes it with the same function the
   screen calls.
5. **A filter row counted seven controls**, because `DateField` keeps a hidden native
   date input beside each visible box. This is the one that did cost a CI run,
   `36468928176`, and it is also the one added to the factory's `KNOWN-FAILURES.md`, so
   the next screen that puts a date box on a filter row does not pay for it again.

The first four are near misses caught by reading. The fifth cost one run. **None of the
five is an application defect on `main`**, and nothing was found wrong with what part 1
shipped.

---

## 7. Coordination, access and what was not touched

- **Ivan's terminals also open pull requests here.** `git fetch origin` then
  `git merge origin/main` before the push, never a rebase and never a force push. A
  board conflict would be resolved by keeping both sides.
- **No file under `app/api/extraction/**`, `app/api/documents/**`,
  `lib/data/extraction*` or `docs/contracts/extraction*`** was touched, so there is
  nothing to tell Andre.
- **No production access.** The live site was not opened, no production row was read,
  no credential was sourced. Environment variable names only.
- **No self-merge.** Real client data has been in production since 2026-09-14, so the
  merge question is filed for the owner with the pull request number and the head sha.
  This pull request carries no migration, so merging it changes no database.

---

## 8. What the next session should pick up first

**Goal G65 part 3**, the create and manage flow: `Factură nouă` and `Emite factură`
from an `Ieșire`, the page of a single invoice, `Emite`, `Marchează plătită`,
`Anulează`. Two findings recorded by part 1 land on that card and should be read before
it is drafted: nothing refuses issuing an invoice with no lines, and
`public.status_entity` carries no `invoice` value, so an invoice's state changes write
no row in `public.status_history` and the six stamp columns carry who and when instead.

One finding from this card, recorded and deliberately not acted on:
`tests/e2e/phone-lists.spec.ts`, `tests/e2e/phone-forms.spec.ts` and
`tests/e2e/phone-remainder.spec.ts` each carry their own copy of the `readPhone`
helper, and this card writes a fourth, narrowed to the clauses its own acceptance
names. Pulling the four into `tests/e2e/support/` is a sweep of files belonging to
other cards, which is scope this card does not have. The next phone card can claim it.
