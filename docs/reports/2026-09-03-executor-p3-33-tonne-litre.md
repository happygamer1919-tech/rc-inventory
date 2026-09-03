# EXECUTOR, 2026-09-03: P3-33, tonne and litre

Card **P3-33** (Andre's EXT-04). Branch `card/p3-33`.
**Migrations added:** `0030_units_tonne_litre.sql` and `0031_units_tonne_litre_rows.sql`, both **authored and merged, NOT applied**, registered under this card.

---

## 1. What it fixes

A supplier billing in **tone** had no unit to be billed in, so the quantity landed under `kg` and the number was **silently multiplied by a thousand**. `litri` had the same shape with no unit at all behind it.

## 2. No conversion is introduced, and that is the point

The card's default:

> NO CONVERSION IS INTRODUCED. This card adds units; it does not teach the system that a tonne is a thousand kilograms, and it must not, because a silent conversion is the defect being fixed.

Nothing here teaches that relationship. Replacing an invisible multiplication by a thousand with a **different** invisible one is not a fix. The assertion file checks the ORDER and the label-to-row agreement, because there is no factor to check and there must not be one.

## 3. The file had to be split, and the card said so in advance

> If it turns out not to be fine, split the file and say so.

It was not fine.

A newly added enum label **cannot be used in the transaction that added it** (`55P04`). The first draft put the `ADD VALUE`s and the `public.units` rows in **one file** separated by an explicit `commit;`.

It applied cleanly through the applier **and** through the Docker shim - both feed the file to `psql`, which honours that commit. It failed under `supabase db reset`:

```
ERROR: unsafe use of new value "t" of enum type unit_code (SQLSTATE 55P04)
At statement: 3   insert into public.units (code, sort_order) values ('t', 8),
```

**`supabase db reset` wraps each migration file in one transaction of its own** and swallows the explicit commit. The file worked in both places it had been tested and broke in the one place it had not - and that place is the runner CI uses to build the end-to-end stack.

**Two files are two transactions under all three runners**, with no special case anywhere. `0030` adds the labels, `0031` adds the rows.

`docs/LEARNINGS.md` carries it: **a migration is not proven until it has been applied by every runner that will ever apply it.** This repository has three, and they disagree about transaction boundaries - exactly the property an enum addition is sensitive to. When a file needs a statement committed before the next one, the boundary is a **file** boundary, because that is the only one all three agree on.

## 4. The type system found the second place that had to change

`components/settings/UnitSettings.tsx` carries `UNIT_MEANING` as `Record<UnitCode, string>`, so extending the enum made that file **stop compiling** until somebody said what each new unit is for:

```
error TS2739: Type '{ m2: ...; m3: string; }' is missing the following properties
from type 'Record<UnitCode, string>': l, t
```

A `Partial` there would have let the screen show a unit with no explanation and nothing would have noticed. It is a distinct fact per unit, not a duplicate of the label map, so the two entries are written rather than removed.

The review form needed no change at all: it derives its options from `ALL_UNITS`.

## 5. Acceptance, run

```
$ npx playwright test review.spec.ts --project=chromium -g "P3-33"
  ✓ 10. P3-33: tona si litrul sunt oferite pe linie si se salveaza pe produsul nou
  1 passed

$ npm run check:migrations
  applied 0030_units_tonne_litre.sql
  applied 0031_units_tonne_litre_rows.sql
  asserted 0031_units_tonne_litre_rows.sql
  13 assertion files passed          (31 migrations against a bare postgres:16)

$ supabase db reset      then: units = m2 lm pcs bag kg roll m3 t l
$ npx tsc --noEmit       exit 0
```

**The review case asserts both labels are offered, not only the one it selects.** A list that offered `t` and not `l` would pass a test that chooses only `t`.

The assertion file checks nine enum labels, nine rows, `t` then `l` **last**, that `sort_order` 1 and 7 still hold `m2` and `m3`, and that **every enum label has a row** - a label with no row is a value the database accepts and no screen offers.

## 6. A note on the local stack

`supabase db reset` collided with another project's stack holding ports 54321/54322. The rc-inventory stack was brought up on 54421/54422 by an **uncommitted** edit to `supabase/config.toml`, and that file was restored from the index before committing. Nothing in this PR changes the committed ports.

## 7. Not in this PR

**The apply.** `0030` and `0031` are registered pending alongside `0028` and `0029`. Until they are applied, tonne and litre are live in the code and the validator, and not in the database.
