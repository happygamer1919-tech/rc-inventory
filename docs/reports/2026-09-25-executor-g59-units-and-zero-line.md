# EXECUTOR, card P3-102: units a document prints, and the line that arrived at zero

Role: AUTHOR, then EXECUTOR, in one pull request.
Date: 2026-09-25 UTC (the evening of 2026-09-24 where the owner is).
Branch: `card/p3-102`, cut from `origin/main` at `310c9e2`.
Worktree: `/Users/sm33xy/Projects/rc-inventory-worktrees/g59-units-and-zero-line`.
Goal: G59 in the operator factory's `GOALS.md`, carrying Ivan's finding F23 of 2026-09-24.

## In plain words, for the owner

A supplier writes a unit on a delivery note and Rapid Construct has to understand it. On an MPC
confirmation on 2026-09-24 two words did not land: `set` on a box of self-drilling screws and
`litri` on paint thinner. The screen showed an empty dropdown saying "Alege unitatea" with
"Pe document: set" underneath, and the operator had to answer the same question on every document.

**`litri` now lands by itself**, along with the ordinary spellings of pieces, square metres, linear
metres and kilograms.

**`set` does not become a unit, and that turned out not to be mine to decide.** An earlier piece of
work, card EXT-10, decided that packaging words are not units and wrote a check that refuses
`palet`, `cutie`, `set` and `bax` by name. I tried it anyway, on the goal's instruction, and the
check stopped it inside 74 seconds. The reason is good: a "set" does not say HOW MUCH, it says what
it came in, and if six sets and six pieces sit in the same column meaning different things, nobody
can read a stock level again.

**What `set` gets instead is the other half of the goal, and it fixes the actual complaint.** A word
the system does not know keeps showing what the supplier wrote, the operator picks a unit from the
list **once**, and the system remembers that answer for that supplier's next document. Ivan's
complaint was that the question is asked on every document. It now gets asked once.

And line 5 of that same document had arrived with a quantity of zero, marked "stoc epuizat". It was
already being left out of stock, correctly, and nothing on screen said so, so the count at the
bottom did not match the paper. It is now greyed with the sentence "Cantitate 0: nu intră în stoc".
Typing a quantity above zero brings it back.

**Nothing in this card multiplies a number.** A set is not taught to be a thousand pieces, a litre
is not taught to be a kilogram.

## The collision that stopped the first attempt, in full

**Attempt 1**, head `b002d79`, run `36078834380`, red in 1m14s at "Apply every migration to a bare
postgres, unmodified":

```
FAILED: assertions/0035_products_package.sql
ERROR:  EXT-10: 1 packaging label(s) reached public.unit_code,
        and the quantity column now means two things
```

That assertion is card EXT-10's, and its last block says why:

> "The whole reason packaging is not an enum value: products.unit still means what a stored quantity
> is counted in, and no packaging label reached it."

It names `palet`, `cutie`, `set` and `bax`, one by one. EXT-10 built the real mechanism for the case
instead: `products.package_unit` (free text) and `products.package_factor` (numeric), paired by
`products_package_pair_complete` so that neither can exist without the other, with a factor that
must be above zero and may be fractional.

**Neither goal G59, nor the task brief, nor the two files the brief told me to read first mentioned
any of it.** The brief's own Step 0 anticipated exactly this shape of conflict, at
`components/settings/UnitSettings.tsx`. It turned out there were two recorded decisions in the way,
not one, and the second is machine-enforced.

**The check was not touched.** Three laws, close-out step 7: never make a check pass by weakening
what it checks. Reaching the goal's literal wording would need either an owner ruling superseding
EXT-10 under `CLAUDE.md` section 9c, or a much bigger card that captures a packaging factor on the
review screen and multiplies by it, which is a conversion and which G59 forbids in the same breath
as it asks for `set`. Both are the owner's call, both are named in `q086`, and neither is a thing a
terminal decides at midnight.

**So attempt 2 shipped the part that contradicts nothing**, which is most of the value: the synonym
map for the words that ARE units, the remembered per-supplier answer for the words that are not, and
the whole zero-line half.

## Three things this card deliberately did NOT do

1. **`l` already existed.** Migration 0030 added it. Diluant nitro was never a missing unit, it was a
   missing SYNONYM, and the map alone fixes it. No migration was needed for litri and none was
   written.
2. **No packaging word became a unit.** `set`, `cutie`, `palet` and `bax` are all left unmapped, on
   purpose, and both `lib/data/units.ts` and `lib/data/unit-synonyms.ts` now carry the refusal in
   writing with the reason and the assertion path, so the next card does not try it again. They are
   not mapped to `pcs` either: that would be a silent conversion with factor 1, written for every
   supplier at once, where the right answer differs from one to the next.
3. **The zero line's exclusion is not new and was not changed.** `lib/data/extraction-actions.ts`
   has carried `if (!Number.isFinite(quantity) || quantity <= 0) continue;` since it was written.
   The line was already excluded, silently. What this card adds is that the screen SAYS so. There is
   no second rule at confirmation: typing a quantity above zero includes the line through the filter
   that already exists, and case 2 proves that rather than adding a branch.

## What was built

### Part 1, the synonym map: `lib/data/unit-synonyms.ts`

A new module that touches no database, so a client component can import it and it works before any
migration lands. It folds a word (NFD, drop nonspacing marks, drop every full stop, lowercase,
collapse white space, trim) and looks it up:

| the document says | the RC unit |
|---|---|
| l, L, litri, litru | `l` |
| buc, buc., bucăți, pcs | `pcs` |
| m2, m², mp | `m2` |
| ml, m.l., metru liniar | `lm` |
| kg | `kg` |

Every key goes through the same fold at load time, so a row added later with diacritics or capitals
still lands on the right key. `m²` gets its own row because the superscript is not a combining mark
and folding does not turn it into `m2`.

The file carries migration 0030's capitals verbatim: **NICIO CONVERSIE NU ESTE INTRODUSA AICI SAU
ORIUNDE.** There is no factor anywhere in it. The `set`, `set.`, `seturi` rows that attempt 1 carried
are gone, and the comment where they stood says why, naming EXT-10 and the assertion file.

### Part 2 as re-scoped: `supabase/migrations/0061_supplier_unit_aliases.sql`

An **append only** table: `id`, `supplier_key`, `unit_raw_key`, `unit` (the `unit_code` enum, not
free text), `created_by`, `created_at`. One lookup index. Two filled-key checks. Row level security
with exactly a select and an insert policy, both `public.current_app_role() is not null`, the insert
additionally requiring the author to be the caller. **No update policy, no delete policy, and
neither privilege granted.**

- **Append only, reader takes the newest.** An operator who answers the same word differently next
  month writes a second row and the earlier answer stays readable. An alias overwritten in place is
  a record of the present pretending to be a record of the past, the reason 0001 gives for
  `status_history` and 0059 gives for `client_notes`.
- **The insert is NOT `is_owner()`.** An account manager confirms supplier documents, which is the
  one screen that writes here. An owner-only insert would mean the person doing the work can never
  teach the system anything. The assertion file proves an active account manager can write and a
  deactivated profile can do neither.
- **No conversion column, and the assertion file checks that by name.** There is no `factor`,
  `multiplier`, `ratio`, `quantity`, `per_unit` or `conversion`.

`lib/data/unit-aliases.ts` reads and writes it, behind the new capability gate
`hasSupplierUnitAliases`. `app/(app)/incarca-comanda/page.tsx` loads the aliases for the suppliers
actually on screen and passes them down. `lib/data/extraction-actions.ts` remembers the operator's
answers after the order is created, reading the document's own words out of
`extraction_draft_lines` BEFORE the RPC consumes the draft, and never from what the caller sent. It
writes only words the synonym map does not know, only when the answer differs from what is already
remembered, and it cannot fail the confirmation: the order already exists, and losing a delivery to
save a preference would be the wrong trade.

**The folding lives in one file.** `unit-synonyms.ts` owns both the word fold and the supplier fold
and is the only writer of both keys, so the fold a row was written with and the fold it is read back
with cannot disagree.

### Part 3, the zero-quantity line: `components/orders/ExtractionReviewPanel.tsx`

The row is greyed (`opacity-60`) and carries `data-zero-excluded="true"` plus a paragraph reading
"Cantitate 0: nu intră în stoc", on the line itself rather than in a banner at the top of the
screen, for the same reason the scan notice sits there: a banner is read once and then scrolled
past.

The condition has two halves and both matter: the quantity **arrived** as 0 from the reading, AND
the box does not currently hold a number above zero. The first half distinguishes it from a box the
operator has just emptied. The second makes the grey and the sentence leave the instant a quantity
is typed.

It is a function rather than a variable inside the `map` body, deliberately, so the row stays an
expression and this card's diff does not reindent two hundred lines of JSX it did not touch.

## Acceptance, and where it is proved

`tests/e2e/extraction-units-and-zero-line.spec.ts`, five named cases, fixture built by hand inside
`tests/`, every row prefixed `TEST`, no production data read and the live site never opened.

1. `1. litri se mapeaza singur, set isi arata cuvantul, iar linia cu cantitatea 0 spune pe ecran ca nu intra in stoc`
2. `2. o cantitate peste zero tastata in linia cu 0 o include inapoi`
3. `3. un cuvant care nu se mapeaza se alege o data si se tine minte pentru urmatorul document al aceluiasi furnizor`
4. `4. niciun numar nu s-a schimbat acolo unde s-a aplicat un sinonim sau s-a ales o unitate`
5. `5. fisa de verificare se poarta la 390x844, cu propozitia liniei de zero pe ecran`

Case 3 uses **`set`**, which is Ivan's own word, precisely because `set` is the case the goal cared
about and the remembered alias is how it is answered.

Case 4 is the no-conversion clause and it reads the stored position: `6 buc`, never `6000`, and
`12 l`. The unit label beside the number comes from the product's own unit through `unitLabel` in
`InboundPanel`, so those two lines prove the stored unit and the untouched number at once.

Case 5 is the phone check at 390x844. Everything else runs at the default 1440x900, which is what
proves the desktop did not move.

**Each case carries its own digit in its supplier name and its product names.** Unique per run is
not enough: this card's own logic searches the whole alias table on the supplier key, and test data
is never deleted here, so two cases of one run sharing a supplier would see each other's answers.
That is the class `KNOWN-FAILURES.md` records after P3-101.

One SQL assertion file runs against the bare postgres after every migration:
`scripts/poc-free/local-db/assertions/0061_supplier_unit_aliases.sql`.

## Migrations, by path, and what merging them does

- `supabase/migrations/0061_supplier_unit_aliases.sql`

One file, down from three: attempt 1's `0061_unit_set.sql` and `0062_unit_set_row.sql` were removed
with the `set` unit, and the alias table was renumbered from 0063 to 0061 so the ledger has no gap.
A gap is its own CI failure and `KNOWN-FAILURES.md` records it.

**MERGE IS APPLY** (`CLAUDE.md` 8.0, ruling R-124): merging this pull request adds **one empty
table** to the production database within about two minutes. Nothing else.

It is additive only. No `DROP TABLE`, no `TRUNCATE`, no `DELETE`, no `DROP COLUMN` and no `UPDATE`
of an existing row. No unit, no product and no stored quantity is touched or reinterpreted, and no
existing table, column, function, policy or grant changes.

It is listed in the waiting register in `docs/migrations/APPLY-LOG.md` with P3-102 as the applying
card, which is what `tests/e2e/headers.spec.ts` requires.

`scripts/poc-free/local-db/assertions/0031_units_tonne_litre_rows.sql`, which attempt 1 amended, is
back to exactly what is on `main`. That amendment only existed because a tenth unit was arriving. The
trap it was fixing is real and will bite the next card that legitimately adds one, so it is written
into `docs/LEARNINGS.md` as an entry rather than carried here as scope this card no longer needs,
which is what repo `CLAUDE.md` section 3 prescribes.

## The extraction callback route

`app/api/extraction/callback/route.ts` is **not touched by this card**. Nothing changes in what that
route accepts, refuses or returns, error texts included, so Andre needs no notice. The freeze on that
file was lifted on 2026-09-17; this card simply did not need it, because the synonym map runs on the
review screen and on the confirm path, where the operator can still see and change the result.

## What was run here, and what only CI can run

This machine has **no Docker and no Supabase CLI**, so the bare postgres apply, both applier proofs
and the End to end suite run only in CI. Nothing in this report claims otherwise.

Run locally, each command alone, each exit 0: `npx tsc --noEmit`, `npm run build`, the board
validator on all three boards, `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
`check:no-destructive-migration`, `check:conflict-residue` (run AFTER `git add`, for the reason
`KNOWN-FAILURES.md` records), `check:categories`, `check:ledger-rows`, `check:no-prod-target`,
`check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`, `check:board-edit`,
`check:board-clock`, and `npx playwright test --list`.

## Merge

**No self-merge.** Real client data has been in production since 2026-09-14, so the close-out
block's step 8 revokes the section 3.1 grant on every path, and a pull request that adds a file
under `supabase/migrations/` never self-merges. The owner is told before the live database changes:
the merge question is filed in the factory mailbox with the pull request number, the head sha, the
migration path, and one plain sentence of what changes in the live database.

## Left for the owner

1. **`q086`**, now carrying TWO collisions, not one. The recorded decision in
   `components/settings/UnitSettings.tsx` that a new unit means a numbered migration and never a row
   typed into a screen, and the recorded decision in card EXT-10 and
   `assertions/0035_products_package.sql` that a packaging word is never a unit at all. Goal G59's
   request for a `set` unit runs into the second one. Superseding it needs a ruling id under section
   9c, and the honest alternative is a card that uses EXT-10's own `package_unit` and
   `package_factor` columns, which means introducing a conversion on the review screen, which G59
   forbids in the same breath. That contradiction is the owner's to resolve.
2. **Words for the synonym map.** Adding a row to `RAW_SYNONYMS` is one line, for any word that is
   genuinely a unit. A word that is packaging is not a candidate and the file says so.
3. **The merge approval**, with the migration path above.
