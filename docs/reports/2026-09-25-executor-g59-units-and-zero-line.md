# EXECUTOR, card P3-102: units a document prints, and the line that arrived at zero

Role: AUTHOR, then EXECUTOR, in one pull request.
Date: 2026-09-25 UTC (the evening of 2026-09-24 where the owner is).
Branch: `card/p3-102`, cut from `origin/main` at `310c9e2`.
Worktree: `/Users/sm33xy/Projects/rc-inventory-worktrees/g59-units-and-zero-line`.
Goal: G59 in the operator factory's `GOALS.md`, carrying Ivan's finding F23 of 2026-09-24.

## In plain words, for the owner

A supplier writes a unit on a delivery note and Rapid Construct has to understand it. On an MPC
confirmation on 2026-09-24 two words did not land: `set` on a box of self-drilling screws and
`litri` on paint thinner. The screen showed an empty dropdown saying "Alege unitatea" with "Pe
document: set" underneath, and the operator had to answer a question the paper had already
answered. Two of them now land by themselves, and so do the ordinary spellings of pieces, square
metres, linear metres and kilograms. `set` becomes a real unit.

A word we still do not know keeps showing what the supplier wrote, the operator picks a unit from
the list once, and the system remembers that answer for that supplier's next document. The word
stays on screen either way, so nothing the supplier wrote is lost.

And line 5 of that same document had arrived with a quantity of zero, marked "stoc epuizat". It was
already being left out of stock, correctly, and nothing on screen said so, so the count at the
bottom did not match the paper and there was no way to see why. It is now greyed with the sentence
"Cantitate 0: nu intră în stoc". Typing a quantity above zero brings it back.

**Nothing in this card multiplies a number.** A set is not taught to be a thousand pieces, a litre
is not taught to be a kilogram. A synonym renames a unit, it never converts one.

## The question filed before anything was written

`mailbox/questions/q086-g59-new-unit-from-dropdown-contradicts-unitsettings.md`, to the owner.

Goal G59 part (2) asks for the operator to be able to **add the document's word as a new unit from
the same dropdown**. `components/settings/UnitSettings.tsx` opens by recording the opposite, on
purpose, and the screen repeats it to the user:

> "Unitatile de masura. Doar vizualizare, si asta este o decizie, nu o lipsa. Setul este fixat de
> enumul unit_code din migratia 0001. O unitate noua inseamna o migratie numerotata, nu un rand
> introdus dintr-un ecran, pentru ca fiecare cantitate stocata este interpretata prin unitatea
> produsului ei. Ecranul spune asta pe fata, ca nimeni sa nu caute butonul care lipseste."

Repo `CLAUDE.md` section 9c: a recorded decision is superseded by a formal correction that quotes
it, marks it and states the new rule, never by a quiet code change. That is the same shape as
finding F8 against ruling R-197. So the question was filed with a recommended default of
**re-scope**, and the build went ahead on that default rather than idling:

- when a document word does not map, the operator picks an **existing** RC unit;
- that choice is remembered for that supplier's next document;
- the word stays visible as "Pe document: <word>".

Nothing here is blocked on the answer. If the owner supersedes the decision, adding "create a unit
from the dropdown" is its own card plus a ruling id from `npm run id:free`.

## Three things this card deliberately did NOT do

1. **`l` already existed.** Migration 0030 added it, with the label `l`. Diluant nitro was never a
   missing unit, it was a missing SYNONYM, and the map alone fixes it. No migration was needed for
   litri and none was written.
2. **`cutie` is deliberately left unmapped.** The goal mentions the word without listing it among
   the units to create. A unit born from a passing mention is a unit every future quantity is read
   through. It stays unmapped, takes the "does not map" path, and case 3 of the spec uses it for
   exactly that. It is named in q086 so the owner can say the word.
3. **The zero line's exclusion is not new and was not changed.** `lib/data/extraction-actions.ts`
   has carried `if (!Number.isFinite(quantity) || quantity <= 0) continue;` since it was written.
   The line was already excluded, silently. What this card adds is that the screen SAYS so. A card
   that claimed to have built an exclusion that already existed would be a card misreporting itself,
   so it is said here, in the card's `defaults`, in the card's `notes` and in the spec's own header.
   There is no second rule at confirmation: typing a quantity above zero includes the line through
   the filter that already exists, and case 2 proves that rather than adding a branch.

## What was built

### Part 1, the synonym map: `lib/data/unit-synonyms.ts`

A new module that touches no database, so a client component can import it and it works before any
migration lands. It folds a word (NFD, drop nonspacing marks, drop every full stop, lowercase,
collapse white space, trim) and looks it up:

| the document says | the RC unit |
|---|---|
| set, set., seturi | `set` |
| l, L, litri, litru | `l` |
| buc, buc., bucăți, pcs | `pcs` |
| m2, m², mp | `m2` |
| ml, m.l., metru liniar | `lm` |
| kg | `kg` |

Every key goes through the same fold at load time, so a row added later with diacritics or capitals
still lands on the right key and nobody has to remember the convention. `m²` gets its own row
because the superscript is not a combining mark and folding does not turn it into `m2`.

The file carries migration 0030's capitals verbatim: **NICIO CONVERSIE NU ESTE INTRODUSA AICI SAU
ORIUNDE.** There is no factor anywhere in it.

### The unit `set`, in two migration files because PostgreSQL requires it

- `supabase/migrations/0061_unit_set.sql`: `alter type public.unit_code add value if not exists
  'set';` and nothing else, with no transaction block.
- `supabase/migrations/0062_unit_set_row.sql`: the row in `public.units` at `sort_order` 10,
  `on conflict (code) do nothing`.

This is 0030 and 0031's trap, recorded in their own headers: a newly added enum label cannot be USED
in the transaction that added it (55P04), and `supabase db reset`, which CI uses, wraps each
migration file in a transaction of its own and swallows an explicit `commit`. Two files are two
transactions under all three runners.

`lib/data/units.ts` learns the label and `ALL_UNITS`. `components/settings/UnitSettings.tsx` learns
its meaning: "Set, pentru articole livrate ambalat ca un tot, de exemplu o cutie de șuruburi vândută
la set". That file's `UNIT_MEANING` is a `Record<UnitCode, string>` on purpose, so the build failed
until somebody wrote what the new unit is for, which is the property that file's own comment claims.

### Part 2 as re-scoped: `supabase/migrations/0063_supplier_unit_aliases.sql`

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
is typed, which includes the line through the filter that already exists.

## Acceptance, and where it is proved

`tests/e2e/extraction-units-and-zero-line.spec.ts`, five named cases, fixture built by hand inside
`tests/`, every row prefixed `TEST`, no production data read and the live site never opened.

1. `1. set si litri se mapeaza, iar linia cu cantitatea 0 spune pe ecran ca nu intra in stoc`
2. `2. o cantitate peste zero tastata in linia cu 0 o include inapoi`
3. `3. un cuvant care nu se mapeaza se alege o data si se tine minte pentru urmatorul document al aceluiasi furnizor`
4. `4. niciun numar nu s-a schimbat acolo unde s-a aplicat un sinonim`
5. `5. fisa de verificare se poarta la 390x844, cu propozitia liniei de zero pe ecran`

Case 4 is the no-conversion clause and it reads the stored position: `6 set`, never `6000`, and
`12 l`. The unit label beside the number comes from the product's own unit through `unitLabel` in
`InboundPanel`, so those two lines prove the stored unit and the untouched number at once.

Case 5 is the phone check at 390x844. Everything else runs at the default 1440x900, which is what
proves the desktop did not move.

**Each case carries its own digit in its supplier name and its product names.** Unique per run is
not enough: this card's own logic searches the whole alias table on the supplier key, and test data
is never deleted here, so two cases of one run sharing a supplier would see each other's answers.
That is the class `KNOWN-FAILURES.md` records after P3-101.

Two SQL assertion files run against the bare postgres after every migration:
`scripts/poc-free/local-db/assertions/0062_unit_set_row.sql` and `0063_supplier_unit_aliases.sql`.

## The older assertion that had to be amended, and why it was not weakened

`scripts/poc-free/local-db/assertions/0031_units_tonne_litre_rows.sql` pinned `expected 9` twice: the
number of labels on `unit_code` and the number of rows in `public.units`. Adding a tenth unit broke
it. That is the signature `KNOWN-FAILURES.md` calls "An older assertion pins a whole enum label set",
and the fix it prescribes is the one applied: the old file now pins only what its own two migrations
decided, the nine labels **in order** and the nine rows at `sort_order` 1 to 9, and the TOTAL moved to
`assertions/0062`, the file of the migration that decides it. `assertions/0049` made the same move
when it took the category total off `assertions/0029`.

Nothing was relaxed. The two new labels, the two new rows, their order, the agreement between labels
and rows, and now the whole set of ten, are all asserted, across the two files. The header of 0031's
assertion quotes what it used to say and why it was a trap, under `CLAUDE.md` section 9c.

## Migrations, by path, and what merging them does

- `supabase/migrations/0061_unit_set.sql`
- `supabase/migrations/0062_unit_set_row.sql`
- `supabase/migrations/0063_supplier_unit_aliases.sql`

**MERGE IS APPLY** (`CLAUDE.md` 8.0, ruling R-124): merging this pull request adds one enum label,
one row in `public.units` and one empty table to the production database within about two minutes.

All three are additive only. No `DROP TABLE`, no `TRUNCATE`, no `DELETE`, no `DROP COLUMN` and no
`UPDATE` of an existing row runs in any of them. No existing unit is renamed, reordered or removed,
and no product changes unit: assertion 0062 checks that zero products sit on the new unit.

All three are listed in the waiting register in `docs/migrations/APPLY-LOG.md` with P3-102 as the
applying card, which is what `tests/e2e/headers.spec.ts` requires.

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
`check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`,
`check:board-clock`, and `npx playwright test --list`.

`check:board-edit` was red until the commit that carries the board card, which is that check working
exactly as written.

## Merge

**No self-merge.** Real client data has been in production since 2026-09-14, so the close-out
block's step 8 revokes the section 3.1 grant on every path, and a pull request that adds files under
`supabase/migrations/` never self-merges under any circumstances. The owner is told before the live
database changes: the merge question is filed in the factory mailbox with the pull request number,
the head sha, every migration path, and one plain sentence of what changes in the live database.

## Left for the owner

1. **q086**, the doctrine question above: supersede the recorded decision under section 9c and let a
   unit be created from the dropdown, or keep the re-scope this card shipped.
2. **`cutie`**, and any other word the owner wants in the synonym map. Adding a row to
   `RAW_SYNONYMS` is one line; adding a UNIT is a migration pair plus a meaning sentence.
3. **The merge approval**, with the three migration paths above.
