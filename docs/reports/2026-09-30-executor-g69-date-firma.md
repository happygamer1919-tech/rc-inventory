# EXECUTOR, card P3-116: Date firma in Setari. Goal G69 part 4, the last part

Role AUTHOR, then EXECUTOR, in one run and one pull request, 2026-09-30.
Branch `card/p3-116`, cut from `origin/main` at `7123a74`.
Specification: `docs/reports/2026-09-30-author-setari-design.md`, the **Date firma** subsection of
section 3 and **Part 2** of section 4, which merged as pull request #378.

**Once this merges, goal G69 is done.**

---

## For the owner, in plain words

Setari now has a **Date firma** section holding everything about Rapid Construct in one place: the
company name, its IDNO, its **VAT registration code**, the address, the bank, the IBAN, the
**telephone number** and the **email address**.

Three of those did not exist anywhere in the system before: the VAT code, the phone and the email.
This is what adds them.

**The migration that adds them is `supabase/migrations/0066_invoice_settings_company_contact.sql`,
and merging it changes the live database within about two minutes.** It adds three empty, optional
boxes to the one record that already holds the company details and removes nothing. Nothing that
works today changes: the record reads empty in all three until somebody types into them.

**There is still exactly one record holding the company details, and there is no second copy
anywhere.** The Date firma section and the Facturare section are two views of the same record, and so
is the supplier half of an invoice. That is why they can never disagree. The reason the design note
gave is worth repeating: two places holding one company's IDNO is exactly how they come to disagree,
and the one that is wrong is always the one that got printed.

Only you can change any of it, and the database itself refuses anybody else rather than the screen
merely hiding the button.

**The company logo is still not included.** It would only be worth having once there is a printed
document to put it on, and that document is not built. Printing and e-Factura are still waiting on
you choosing one of the three Moldova options.

---

## The decision the task asked for, and it was not a preference

The task asked whether the five company fields that already existed now live only in Date firma, or
stay visible in the Facturare block too.

**They stay in the Facturare block.**

This was forced, not chosen. Case 2 of `tests/e2e/facturare-settings.spec.ts` fills
`facturare-issuer-name` and its four siblings **inside that block**, presses `facturare-save`, and
reads all five plus the VAT rate back out of the database. If the fields moved, those test ids would
sit inside a different section and a different save button would own them, so that case would fail.
The task's own words: "If your choice makes that test fail, you are changing a test to fit a
preference, which this project refuses: pick the other option." That is what was done.

The cost is presentational only, because the row is one. Case 3 of the new spec measures it: five
values are typed in **Date firma**, saved, and then read back out of the **Facturare** block on the
bare `/setari` address with nothing having been typed there, and out of an invoice's supplier card.

### The hazard that came with it, and how it is handled

Two forms now write one row, which the design note itself flagged: "each form saves only its own
fields and never writes back a blank over the other's."

- `saveInvoiceSettings` is behaviourally unchanged. It still writes the numbering, the rate and the
  five issuer fields, with the same messages and the same test ids.
- The new `saveCompanyDetails` writes the **eight** company fields and never names `series_prefix`,
  `number_includes_year` or `default_vat_rate`. A grep over its body shows that, and case 2 of the
  spec asserts all three are unchanged after a Date firma save.

That left one real defect: both forms are client components whose field state is seeded **once** from
props, and `router.refresh()` re-renders the server tree without remounting a client component. So
the form nobody touched kept the old value and its next save would have written it back. **Both forms
now re-seed the five shared values from the server props when those props change**, which happens
exactly when the other form saved and called `router.refresh()`. The `saved` and `error` flags are
deliberately not reset, because clearing them would remove the Romanian confirmation after the very
refresh that message triggered, and `facturare-settings.spec` case 1 waits on that message. That
re-seed is the **only** change this card makes inside `FacturareSettings.tsx`.

---

## Which Romanian strings were reused, word for word

Reused from the Facturare block, unchanged:

| Field | Label |
|---|---|
| Name | **Denumirea firmei** |
| IDNO | **IDNO** |
| Address | **Adresa** |
| Bank | **Banca** |
| IBAN | **IBAN** |

The three new ones, in the same register:

| Field | Label |
|---|---|
| VAT registration code | **Cod TVA** |
| Phone | **Telefon** |
| Email | **Email** |

`Telefon` and `Email` are exactly what `components/clients/ClientForm.tsx` and
`components/clients/ContactForm.tsx` already show, so no new word was coined for a field the
application already names. Case 1 of the spec reads each label off the box's **own wrapping label
element**, not from anywhere in the block, so a renamed label fails the case rather than passing it
quietly.

---

## The VAT rate and the VAT code are two different things, and so is the IDNO

Three numbers that a tidy-up could blur into each other, so each is named in the migration header,
on the screen, and in the assertions:

| Column | What it is |
|---|---|
| `issuer_fiscal_code` | the **IDNO**, the company's state registration number (0063) |
| `issuer_vat_code` | the **VAT registration code**, given on registering as a VAT payer. A different number. |
| `default_vat_rate` | a **per cent** applied to an invoice line (0063). It identifies nobody. |

The rate stays in the Facturare block with its `VAT_NOTE` ("De confirmat cu contabilul."), untouched.
The code lives in Date firma and carries its own Romanian sentence beside it, saying it is neither the
IDNO nor the rate on the invoice.

Case 4 of the spec proves the independence in **both** directions, and each half carries a witness
that the value under test actually moved, so the case cannot pass on a screen that changes nothing.
Group 3 of the assertions file proves the same three ways in SQL.

---

## The migration

`supabase/migrations/0066_invoice_settings_company_contact.sql`

Three columns on `public.invoice_settings`, each **added, nullable, with no default and empty for the
one existing row**: `issuer_vat_code`, `issuer_phone`, `issuer_email`. Each comment written the way
0063 comments its columns. The table comment keeps 0063's sentence word for word and extends it.

**Nothing else.** No `DROP TABLE`, no `TRUNCATE`, no `DELETE`, no `DROP COLUMN`, no `UPDATE` of an
existing row, no `INSERT`, no grant, no policy, no constraint, no trigger, no function. One
transaction, safe to run twice (`add column if not exists`, `comment on`).

Assertions: `scripts/poc-free/local-db/assertions/0066_invoice_settings_company_contact.sql`, five
groups in the shape 0047 and 0049 use.

1. the three columns are nullable text with no default; the five 0063 columns are unchanged; the
   single-row check and row level security survive
2. 0066 wrote nothing: one row, null in all three new columns, and the numbering and rate still at
   0063's defaults
3. the round trip, and that writing the code does not move the rate, that writing the rate does not
   move the code, and that the IDNO is a third value
4. no new permission: still exactly the two 0063 policies, no insert and no delete for
   `authenticated`, nothing for `anon`, an account manager changes none of the three, and **the owner
   can**, which is the witness that stops the group passing on a table nobody may write at all
5. 0063 and 0064 are untouched: the blank-prefix refusal, the rate range, the impossible second row,
   and `invoice_series_for`

`ls supabase/migrations/` was re-read immediately before the final push, because a number collision
with Ivan's terminals is the classic failure here (PR #290, PR #293). `0066` was still free.

`docs/migrations/APPLY-LOG.md` gained its waiting-register line in the same commit, which
`docs/LEARNINGS.md` records as the second file a migration always needs.

---

## The schema gate, and why it was not optional

`hasCompanyContactFields` in `lib/data/schema-capability.ts` probes `issuer_vat_code`.

`hasFacturareSettings` answers a different question: is 0063 applied. Between merging 0066 and the
Supabase GitHub app applying it there is a window of about two minutes in which the table exists and
the columns do not, and the code ships from the same push. Without the gate `getInvoiceSettings`
would ask for a column PostgREST does not have, get 42703, return null, and the **whole Facturare
block** would say invoicing is not active on a screen where it is. That is INC-05 in a milder form.

One probe covers all three columns because 0066 adds them in one transaction, which is the same
judgement `hasFacturareSettings` writes about `invoice_settings` and `invoices`. The write path is
gated too, so a save during that window still stores the five fields that do exist rather than being
refused entirely. Until the columns land, the section shows those five and one Romanian sentence
about the other three.

---

## There is still exactly one row, and one read path

Confirmed by grep rather than asserted:

```
grep -rn 'from("invoice_settings")' lib/ app/ components/
  lib/data/schema-capability.ts   two probes
  lib/data/facturare-settings.ts  the ONE read
  lib/data/facturare-actions.ts   the two writes
```

No second table, no copy, no "company profile" alongside. `getInvoiceSettings` is the only reader,
and `lib/data/facturare-detail.ts` reads the invoice issuer through it, untouched by this card. The
row is one by the database's own design: the primary key is a boolean pinned to `true` by a check
constraint, so a second row cannot exist.

---

## Every existing spec that touches this screen, unedited

`git diff --name-only origin/main...HEAD -- tests/` lists exactly two paths:

- `tests/e2e/setari-date-firma.spec.ts`, new
- `tests/e2e/setari-sections.spec.ts`, **one line**

That one line was demanded by the compiler, not by a preference. `SECTION_MARKER` in that file is
typed `Record<Exclude<SettingsSectionId, "toate">, string>`, so a sixth section made
`npx tsc --noEmit` fail until somebody said how the new section is recognised on screen. Card P3-114
met exactly this for the fifth section and recorded it as a property rather than a nuisance. **The
line weakens nothing and strengthens two cases:** case 2 now also proves `settings-date-firma` is
absent from catalog, facturare and optiuni, and case 5 now sweeps the new address for console errors.

Every other file that touches `/setari` is byte-identical to `main`, including
`tests/e2e/facturare-settings.spec.ts`, whose `openSettings` helper needs the invoicing block visible
after a plain `goto("/setari")`, and `tests/e2e/phone-remainder.spec.ts`, which measures this screen
at 390x844. The screen still does not redirect, the categories add box is still on the bare address
without a click, and ten test files still give themselves a category exactly that way.

By count there are twenty spec files under `tests/e2e/` that name `/setari`, not the eighteen the task
said. The task's number came from the design note, which counted before P3-113 and P3-114 added their
own two sibling specs. Every one of the twenty is in the quality run.

---

## Local gates, each command run alone so the exit code is its own

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0, `/setari` and `/setari/tabla` still in the route list |
| `node docs/board/validate-board.mjs` on all three boards | exit 0, before every commit |
| `npm run check:card-ids` | exit 0 |
| `npm run check:board-edit` | exit 0, P3-116 absent to shipped |
| `npm run check:unique-ids` | exit 0 |
| `npm run check:open-branch-ids` | exit 0 |
| `npm run check:no-destructive-migration` | exit 0, 1 file, 9 statements, all classified |
| `npm run check:conflict-residue` | exit 0 |
| `npm run check:categories` | exit 0 |
| `npm run check:ledger-rows` | exit 0 |
| `npm run check:no-prod-target` | exit 0 |
| `npm run check:pending-schema-reads` | exit 0 |
| `npm run check:removal-safety` | exit 0 |
| `npm run check:assertion-register` | exit 0 |
| `npm run check:board-clock` | exit 0 |
| `npx playwright test --list` on the new spec | 5 cases collected |
| the APPLY-LOG register check, replayed locally | 66 migrations accounted for, 23 waiting |

**This machine has no Docker and no Supabase CLI**, so the end to end suite, `check:migrations` and
both applier proofs run only in CI. Nothing above claims otherwise.

---

## What did not happen

- **No production access of any kind.** The live site was never opened, no production row was read,
  no credential was sourced. Environment variable names only. The one row this card edits holds
  Rapid Construct's own details rather than a client's, and the rule is unchanged.
- **No real value anywhere.** Every value the spec writes carries `TEST` and the run identifier, and
  the spec restores the row to exactly what it found, asserting that it did.
- **No self-merge.** This is a migration pull request and the owner is told before it merges.
- **No draft.** The pull request is opened ready, because the auto-merger cannot merge a draft and
  card P3-102 sat stranded overnight for exactly that reason.
- **Nothing of Orange's track was touched:** no file under the extraction routes, the documents
  routes, `lib/data/extraction*` or the extraction contract docs, so there is nothing to tell Andre.
- **The `lead=` grep trap was respected.** Nothing was renamed or swept on the word lead. The Setari
  page's own lead paragraph and the `lib/nav.ts` description were left exactly as they are: the
  description names invoicing already, so no sentence became false.
- **No new phone class.** `grep -rn "^const PHONE_" components/ app/` returns only the two
  pre-existing lines in `components/projects/DevizPanel.tsx`, which this card did not touch.
- **No em dash and no en dash** anywhere in the diff, checked by grep over
  `git diff origin/main...HEAD`.

## Noticed and not touched

- The invoice screen tells a reader where to complete a missing supplier name and names the Facturare
  block. That sentence is still true, because the Facturare block still holds those five fields, so it
  was left alone.
- `tests/e2e/setari-sections.spec.ts` case 2 carries an assertion message saying the sub-menu has four
  entries while comparing against `SETTINGS_SECTIONS.length`, which is now six. The comparison is
  correct and only the message text is stale; it was already stale after P3-114 made it five, and
  correcting a message string is not this card's scope.
- By the tuple sort, `P3-14` on phase 3 and `AUT-3` on phase 2 are the lowest eligible ids. The
  operator task named this work instead.

## Still ahead

The logo, the invoice PDF, printing and e-Factura. The logo waits for a document to print it on;
the other three wait on Max choosing one of the three Moldova options, so the Facturi list still says
printing and e-Factura are to come, and that stays true.
