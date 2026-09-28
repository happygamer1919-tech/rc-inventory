# Facturare part 1 of 3: the data and the Setari entries

Role AUTHOR, then EXECUTOR, in one pull request. Card **P3-108**. Goal **G65 part 1**.
Date 2026-09-28. Branch `card/p3-108`, cut from `origin/main` at `66d5e3c`.

---

## For the owner, in plain words

The system can now hold an invoice. **Nothing about invoices shows up on screen yet except a new
block in the settings page**, because the list of invoices and the screen that makes one are the next
two pieces of work.

**The migration this adds is `supabase/migrations/0063_invoices.sql`, and merging it changes the live
database within about two minutes.** It only ADDS: four new tables, one new list of allowed status
words, and the rules around them. It removes nothing, changes no existing table, and deletes no row
anywhere.

What the piece puts in place is the part that has to be right before anyone types a real invoice:

- An invoice gets its number **only at the moment it is issued**. A draft has no number at all.
- The numbers run one after another with **no holes and no repeats**, even if two people press the
  button in the same second.
- A **cancelled invoice keeps the number it was given**. The number is not handed back and not reused.
- Once an invoice has been issued it **cannot be edited at all**, and that is refused by the database
  itself rather than by a greyed out button, so no future screen can get around it.
- The price written on a line is **the price on the day it was written**, and it never moves
  afterwards, even when the price list changes.
- **Nothing can ever be deleted**, by anybody, including the administrator.

In the settings page the administrator can now set what invoice numbers look like (`RC-` and the year
by default), the standard VAT rate, which is shown as 20 per cent **with a note on screen saying it
still has to be confirmed with the accountant**, and Rapid Construct's own company details for the
top of an invoice: name, IDNO, address, bank and IBAN. Nothing is invented: the company fields start
empty and wait to be filled in.

---

## 1. How the numbering works, and why it is a counter row and not a sequence

**One statement does the whole job, and that statement is also the lock.**

Inside `public.issue_invoice`, which is the only way a number is ever handed out:

    update public.invoice_number_series
       set next_number = next_number + 1
     where series = v_series
    returning next_number - 1 into v_number;

Three properties follow, and each one is a thing the design report asked for:

**No duplicates.** The read and the write are one statement, so it takes a row lock. A second session
running the same statement for the same series BLOCKS on that row until the first transaction ends,
then re-reads it under `READ COMMITTED` and carries on from the value the first left. Two operators
pressing Emite in the same moment therefore get two consecutive numbers rather than the same one. On
top of that, `invoices_number_unique_per_series` would refuse a second claim on one number anyway, so
a wrong allocator would fail loudly rather than quietly writing two invoices that both say number 7.

**No gaps.** The increment is inside the same transaction as the invoice. A transaction that takes a
number and then fails for any reason rolls the increment back with it, so the number is not consumed.
**This is the whole reason it is not a sequence.** `nextval` is deliberately not transactional: a
failed attempt would have consumed a number and left a hole in the middle of a legal series, which is
exactly what an accountant cannot accept.

**No reuse after a cancellation.** Nothing anywhere reads a cancelled row looking for a free number,
and nothing decrements the counter. A cancelled invoice keeps its number and stays readable under it.

**And the way an Iesire reference is allocated today is NOT copied.** The design report forbids it in
terms, quoted in the migration: reading the highest one and adding one in application code "can hand
the same number to two people, and its current answer to that is a Romanian message asking the
operator to try again, which on an invoice series produces a gap". The assertion file checks the SHAPE
of the allocator out of `pg_get_functiondef` and not only its outcome: the text must contain the
locking update and must NOT contain `max(number)`. So somebody rewriting it the forbidden way turns
the run red rather than passing five tests that happen not to race.

**The counter is writable by nobody.** `public.invoice_number_series` has no write policy and no write
grant at all. `authenticated` may read it and may not touch it. The only writer is
`public.issue_invoice`, which is `SECURITY DEFINER`.

**That is why the function takes the authorization decision itself, on its first line**, with the same
predicate the policies use, `public.current_app_role() is not null`. A definer function bypasses the
policies, so a definer function that did not ask would be a way around them. The assertion file
asserts that line is present in the function's source, so deleting it turns the run red.

---

## 2. The settings became a one-row TABLE, not a settings row, and why

The design report offered both shapes and said to choose. The choice is `public.invoice_settings`, a
table with exactly one row, and the reason is that **the alternative is not cheaper**.

**There is no settings table in this schema to put a row in.** There never has been. So "a settings
row" would have meant inventing a generic key-and-value store, which is a new table too, and a weaker
one:

- typed columns carry `invoice_settings_series_prefix_not_blank` and
  `invoice_settings_default_vat_rate_range`, which refuse a blank prefix and a rate outside 0 to 100.
  A `jsonb` blob cannot refuse either.
- this repository's own standard, written all over `0025_deviz.sql` and `0047_sheet_prices.sql`, is to
  make wrong data impossible rather than unlikely.

**The single row is enforced and not merely intended.** `id` is a boolean pinned to `true` by a CHECK
and used as the primary key, so a second row cannot exist. `authenticated` is granted no INSERT on the
table at all, so no screen could add one even if the key allowed it.

Writing the settings is **owner only** (`public.is_owner()`), because the goal line says so in terms:
"all editable by the owner in Setari". The prefix and the company details decide what every future
invoice is called and who it says it is from, which is not an operator's decision. Every other write
on the invoice tables is open to an operator, which is the "owner/operator to write" the same line
asks for.

---

## 3. What the migration adds, in full

`supabase/migrations/0063_invoices.sql`. **Additive only.** No `DROP TABLE`, no `TRUNCATE`, no
`DELETE`, no `DROP COLUMN`, and no `UPDATE` of any pre-existing row. The nine `DROP`s in it are
`drop trigger if exists` immediately before the matching `create trigger`, which `CLAUDE.md` 8.6 names
as permitted (it removes a rule about rows, never a row) and which is what makes the file re-runnable.

| kind | name |
|---|---|
| type | `public.invoice_status`: `draft`, `issued`, `paid`, `cancelled` |
| table | `public.invoice_settings`, one row |
| table | `public.invoice_number_series`, the per series counter |
| table | `public.invoices` |
| table | `public.invoice_lines` |
| function | `public.invoice_series_for(date)` |
| function | `public.issue_invoice(uuid, date, date)` |
| function | `public.invoices_require_draft_to_edit()` |
| function | `public.invoices_stamp_status()` |
| function | `public.invoice_lines_compute_totals()` |
| function | `public.invoice_lines_sync_invoice_totals()` |
| function | `public.invoice_lines_require_draft()` |
| triggers | nine, four of them `set_updated_at` |
| indexes | six |
| policies | ten, and **no DELETE policy on any of the four tables** |
| insert | one, the single settings row, `on conflict do nothing` |

### The stored status values are English

`draft`, `issued`, `paid`, `cancelled`. The goal line writes the Romanian because that is what the
operator reads; the four Romanian words live in `INVOICE_STATUS_LABEL` in
`lib/data/facturare-types.ts`. This is repo doctrine, P2-01, quoted in `lib/data/units.ts`, and
`public.deviz_status` and `public.project_status` already do it. **No diacritic is in the schema.**

### Only a draft may change, and the database holds it

Two triggers, in the shape of `devize_require_draft_to_edit` and `deviz_lines_require_draft` in 0025.
`invoices_require_draft_to_edit` freezes the number, the series, who it is to, which project, which
Iesire, the dates, the currency, the notes, the totals and the two e-Factura columns. What stays
changeable past draft is a short list on purpose: the status, because an issued invoice has to be able
to become paid or cancelled, the cancellation reason, because the statement that cancels writes it in
the same UPDATE, and the six stamp columns, which are written by `invoices_stamp_status` AFTER this
guard by name order, so the guard always sees the row as the caller submitted it.

`invoice_lines_require_draft` covers **INSERT as well as UPDATE**. Adding a line to an issued invoice
changes what was invoiced exactly as much as editing one does, and a trigger that caught only UPDATE
would leave the larger half of the hole open.

### The frozen price, and the arithmetic

`invoice_lines.unit_price_mdl` is written once and nothing refreshes it from the catalogue. The
migration comments it as such with the report's reason: "the quoted price is a snapshot written once,
and nothing refreshes it from the catalogue. On an invoice that is not a nicety, it is the difference
between a document and a guess."

The three line figures and the three invoice figures are **computed by triggers and never accepted
from a caller**, rounded to the ban once per figure at each step so the printed column adds up. The
goal line asks for the totals to be STORED, which is the opposite of the choice 0025 made for the
deviz; storing them is only safe because the trigger makes it impossible for a stored total to
disagree with the lines it came from. The assertion supplies deliberate nonsense for all three line
figures, so a trigger that merely defaulted them would fail.

`invoice_lines_sync_invoice_totals` is `SECURITY DEFINER` and the migration says why: as
`SECURITY INVOKER` its write to `public.invoices` would be filtered by the invoices UPDATE policy, so
the totals would silently stop being maintained for any caller the policy does not cover, and a
silently stale total is the failure the storing decision accepted a trigger in order to avoid.

### Where this differs from 0025, deliberately

- **`invoice_lines` carries a `unit` column** and `deviz_lines` does not. An invoice line need not have
  a catalogue product at all, so it must be able to say what its quantity is counted in.
- **There is no `(invoice_id, product_id)` unique constraint**, unlike `deviz_lines`, because one
  product may legitimately appear twice on one invoice at two prices from two deliveries. So
  `invoice_lines.invoice_id` gets an index of its own rather than riding on a constraint.
- **The grant block revokes from `authenticated` before granting.** 0025 did not, because it granted
  delete anyway. See the LEARNINGS entry: Supabase's project defaults grant DELETE at CREATE TABLE
  time, so a file that only added grants would leave DELETE standing on every invoice table.

---

## 4. Where this task and the design report disagreed, and which won

The task said to follow the report's REASONS where the two differ. In practice they did not differ on
anything load bearing, and the two places worth naming are:

**The report suggested the settings "could be a settings row rather than a new table" and left the
choice open.** Section 2 above makes it, and the reason is the report's own standard rather than a
preference: there is no settings table to add a row to, so both options are a new table, and only one
of them can carry constraints.

**The report describes a `link to the stored PDF` column and a `VAT rate` on the invoice.** Neither is
here. The PDF is part 3 and there is no PDF capability in this project at all, so a column pointing at
a document nothing produces would be a column nobody can fill. The VAT rate is per LINE, which is the
report's own question 4 recommended default, taken in terms: storing it per line costs nothing now and
cannot be added cheaply later, because retro-fitting a per line rate onto invoices already issued means
deciding what rate the existing ones had.

---

## 5. What was deliberately left for parts 2 and 3

- **No sidebar entry, no `/facturare` route, no invoice page, no "Creeaza factura" button.** The
  existing rule that nothing appears in the menu that cannot be used yet is why the data lands first
  and the Facturare menu entry arrives with part 2, which is the card that gives it somewhere to go.
  `npm run build`'s route list on this branch carries no `/facturare`.
- **No PDF and no e-Factura.** The report's section 2 lays out three options for Moldova's state
  system and **Max has not chosen one**. `invoices.state_system_number` and
  `invoices.state_system_status` exist, nullable and empty, and nothing in this card writes, reads or
  assumes either. **They stay empty until he decides.** They exist now because adding them later would
  mean deciding what value the invoices already issued had, and that answer is not recoverable.
- **No cancel function.** Cancelling is an UPDATE that sets the status and the reason, which the guard
  permits and the stamp trigger records. A cancel function with its own rules belongs to part 3, which
  owns the screen that presses the button.
- **No client VAT registration code column.** The report names it as a possible addition to
  `public.clients` and the goal line for part 1 does not ask for it. It is a one column additive
  migration on the day a card asks.
- **Nothing writes `public.status_history`.** `public.status_entity` carries no `invoice` value, so an
  invoice status change writes no history row and the six stamp columns carry who and when instead.
  0016 and 0025 both documented the same seam for the same reason: adding an enum label is a migration
  of its own, in the card that needs the history.
- **The two decimal money format.** The report's item 5 notes that `formatMoney` rounds to whole lei,
  which is wrong for an invoice. Nothing on screen shows an invoice figure in this card, so nothing was
  changed; the screen that first prints one owns that fix.

---

## 6. Two findings recorded and not acted on

**1. Nothing refuses issuing an invoice with no lines.** An invoice can take a number and total zero.
That is arguable and it is a rule about a screen that does not exist yet, so inventing it here would be
a terminal deciding what a part 3 button means. Part 3 either refuses it on the screen or a follow-up
migration adds the constraint.

**2. `service_role` can still delete, and that is not a hole this card opened.** The no-delete rule is
about who the APPLICATION can be: `anon`, `authenticated`, an operator, the owner. `service_role` is a
server-side secret that bypasses row level security by design across this whole schema, and no
migration in this repository revokes anything from it. Said here so nobody reads "no delete for any
role" as a claim about the service key.

---

## 7. What was proved, where, and what this machine could not prove

### In CI, on a bare postgres: `scripts/poc-free/local-db/assertions/0063_invoices.sql`

Eight sections, inside `begin ... rollback`, every fixture built by hand and prefixed with the card id,
nothing deleted.

1. the shape: four English enum values in pipeline order, four tables with RLS on, **zero delete
   policies and zero delete privileges**, the counter read only to every role with zero non-SELECT
   policies, `anon` holding nothing, the settings owner-only to write and active-profile to read,
   the six invoice and line policies on the active-profile predicate, the fifteen named constraints,
   the unique constraint being exactly `(series, number)`, the three RESTRICT references and the one
   CASCADE, the allocator's SHAPE out of `pg_get_functiondef`, and both draft triggers with the line
   one firing on INSERT as well as UPDATE;
2. the fixtures: an owner, an active operator, a deactivated operator, a client, a project, a category
   and two products;
3. what a row may be: a draft with no number, `created_by` defaulting to the signed-in user, the line
   arithmetic computed over deliberate nonsense (3 x 125,50 = 376,50, VAT 75,30, total 451,80) and the
   invoice foot following it, then eight refusals including a currency other than MDL, a zero quantity,
   a negative price, a negative rate, a line with neither product nor description, a series with no
   number, a reason on a draft, and a draft pushed past draft with no number;
4. the numbering: `RC-2026` from the default prefix, numbers 1 and 2, a refused second issue leaving
   the number alone, a cancellation keeping number 2 with `issued_at` not cleared, the next issue
   getting 3, the counter at 4, a signed-in account refused when it tries to move the counter, and an
   invoice issued in 2027 landing in `RC-2027` at number 1;
5. only a draft may change: for each of issued, paid and cancelled, the notes, the project, the number
   and the total refused on the invoice, the quantity and the price refused on the line, a new line
   refused, **with the draft control first** so a trigger that refused everything could not pass, and
   what must stay possible past draft proved to still work;
6. the frozen price: a line at 100 on an invoice issued 2026-03-01 totalling 480, the catalogue moved
   to 130 and asserted moved, the line still 100 and the invoice still 480;
7. who may write: an active operator writing and issuing, an operator's settings update changing
   nothing, a deactivated profile reading zero rows of both tables and refused both an insert and
   `issue_invoice`, `anon` refused both reads and the function, and **the OWNER refused a DELETE on all
   four tables** with the invoice count unchanged across all four attempts;
8. the owner changing the prefix and the series following it to `FAC-2026`, a blank prefix refused, a
   negative rate refused, and a second settings row refused.

### In CI, on a real local Supabase stack

`tests/e2e/facturare-data.spec.ts`, five cases, and `tests/e2e/facturare-settings.spec.ts`, three.

**Case 2 of the data spec is the one the assertions cannot give.** It fires **five parallel PostgREST
calls** to `public.issue_invoice` on five drafts of one series, which is five separate database
sessions, and asserts all five succeeded and returned five distinct consecutive numbers from 1 to 5
with the counter at 6. If the number were read as the highest plus one, either two calls would collide
on the unique constraint and fail, or two would succeed with the same number. Both are asserted
against.

Each case takes **its own series**, unique per run and per case, set through the settings with the
service key. The series is global and comes from the settings, so two cases sharing one would number
over each other and would also depend on yesterday's runs, because test data is never deleted. That is
the rule P3-101 names. `afterAll` puts the prefix back on `RC-` and the settings spec asserts the
restore.

### What this machine could not run, said plainly

**No Docker and no Supabase CLI here.** The bare postgres apply, both applier proofs and the whole End
to end suite run only in CI, and nothing in this report claims otherwise. The two SQL files were
parsed locally with `pgsql-parser`, the same grammar `check:no-destructive-migration` uses, which
catches a top-level syntax error and by construction does NOT parse plpgsql function bodies, since
those are string literals to the parser.

### Local gates, each command run alone, each exit 0

`npx tsc --noEmit`; `npm run build`, whose route list carries no `/facturare`;
`node docs/board/validate-board.mjs` on all three boards before every commit; `check:card-ids`;
`check:board-edit`; `check:unique-ids`; `check:open-branch-ids`; `check:no-destructive-migration`,
which parsed 0063 and reported 91 statements with no DROP TABLE, no TRUNCATE and no DELETE;
`check:conflict-residue` after `git add`; `check:categories`; `check:ledger-rows`;
`check:no-prod-target`; `check:pending-schema-reads`, which passes with 0063 in the pending register
because `lib/data/facturare-settings.ts` imports and uses the new gate; `check:removal-safety`;
`check:assertion-register`; `check:live-fixtures`; `check:board-clock`; and
`npx playwright test --list`, which collected all eight new cases.

---

## 8. The merge window, and why there is a capability gate

Merging 0063 applies it to production in about two minutes, and the code ships in the same merge. In
the minutes between the two, `public.invoice_settings` does not exist yet while the new
`app/(app)/setari/page.tsx` is already live. Without a gate that window is INC-05 again, on the screen
that also administers the categories and the sheet list: `/setari` would answer 500.

`hasFacturareSettings` in `lib/data/schema-capability.ts`, in the shape of `hasClientNotes`, probes
`invoice_settings` through PostgREST and caches the answer for a minute, so the day the migration lands
the block lights up on its own with no redeploy. `getInvoiceSettings` returns `null` behind it, and the
block then draws a Romanian line saying facturarea is not active yet, with no form and no buttons.
Nothing else on any screen changes.

---

## 9. Coordination and access

**Ivan's terminals also open pull requests on this repository.** `git fetch origin` then
`git merge origin/main` before the push, never a rebase and never a force push. A board JSON conflict
would be resolved by keeping BOTH sides. `ls supabase/migrations/` was re-read immediately before the
final push to confirm 0063 is still free, because a migration number taken by another open branch is
the classic failure here and it cost PR #290 and PR #293 a wait each.

**No production access.** No live site opened, no production row read, no credential sourced. No file
under `app/api/extraction/**`, `app/api/documents/**`, `lib/data/extraction*` or
`docs/contracts/extraction*` is touched, so there is nothing to tell Andre.

**No self-merge.** Real client data has been in production since 2026-09-14 and this pull request
carries a migration, so the merge question is filed for the owner with the pull request number, the
head sha and the migration path, and the run ends there.

---

Role AUTHOR, then EXECUTOR. One card, one branch, one pull request. Card P3-108, goal G65 part 1.
