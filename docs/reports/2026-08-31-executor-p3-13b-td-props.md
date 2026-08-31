# EXECUTOR, 2026-08-31: P3-13b ships on attempt 3, and the defect was one primitive

Card: **P3-13b**, deviz editor. PR **#133**, branch `card/p3-13b`.
Attempt **3 of 3** against the failure ceiling in CLAUDE.md section 10.
The ceiling was not reached.

---

## 1. What was inherited, and why it was wrong

The handoff said the eight failing `deviz.spec.ts` cases in CI were a seeding or
ordering problem in `quality.yml`, on the reasoning that the failures reproduced
locally only while `scripts/seed-test-deviz.mjs` had not been run. It named the
CI run to check.

**That hypothesis is false, and checking it cost one grep.**

- The seed step in run `33385467677` concluded `success`.
- Its log contains `seed-deviz: gata` at line 978.
- The failure **reproduces locally with the seed applied**. Two cases were
  reproduced that way before any code was changed.

Had it been carried rather than checked, the next change would have been to the
workflow, which was never the problem.

## 2. The actual root cause

`components/ui/primitives.tsx`:

```tsx
export function Td({ children, align = "left", className }: {...}) {
  return <td className={cx(...)}>{children}</td>;
}
```

`Td` and `Th` destructured exactly three props and spread nothing else. **Every
`data-testid` and `data-value-mdl` written on a `<Td>` was discarded before it
reached the DOM.** Nine test ids in `DevizPanel.tsx` sit on `Td`:
`deviz-row-total`, `deviz-line-unit-*`, `deviz-line-quoted-*`,
`deviz-line-current-*`, `deviz-line-difference-*`, `deviz-line-total-*`,
`deviz-subtotal`, `deviz-adaos`, `deviz-total`.

Three things kept this hidden:

1. **The screen was correct.** The Playwright artifact's page snapshot at failure
   shows the table fully rendered, `100 MDL` in the quoted-price cell, `770 MDL`
   at Total. The text was there; only the attributes were missing. A failure that
   says "not found" about an element you can see on screen points at rendering,
   not at data, and that distinction is what separated this from the seeding
   theory.
2. **`tsc` cannot report it.** A JSX attribute name containing a hyphen is exempt
   from prop type checking, so `data-testid` on a component that does not accept
   it is not an error. Typecheck was green through all three attempts.
3. **`Button`, in the same file, already spread `...rest`.** The inconsistency
   between two primitives in one file was the entire defect, and it is why
   `ProjectTabs.tsx` works: it puts the same attributes on raw `<tr>` and `<div>`
   elements, which is why the P3-11 cost tests always passed.

**This also explains why attempt 2 made things worse rather than better.** It
moved `deviz-subtotal`, `deviz-adaos` and `deviz-total` from the row onto the
cell, which was the right call for `getAttribute`, and in doing so moved three
working test ids onto the one component that discards them.

**Fix:** `Td` and `Th` take `...rest` and spread it, typed as
`React.TdHTMLAttributes` / `React.ThHTMLAttributes`.

## 3. A second defect, exposed by the first fix

With the attributes reaching the DOM, ten of eleven cases passed and one did not:
`același produs nu poate fi adăugat de două ori pe un deviz`, expecting 2 lines
and finding 3.

**The product was correct.** The duplicate was refused by the database
constraint, and the Romanian message assertion passed. The test's assertion was
wrong: creating a version copies the lines of the **open** version, and an
earlier test in the same file leaves a version with three lines there. The
hard-coded 2 asserted how many lines the copied version happened to have, which
is not this test's property and depends on run order.

It now compares against the count taken immediately before the add. If the
duplicate were accepted the count would grow and the test would still fail, so
the property is preserved exactly and the order dependence is gone.

## 4. Evidence, as it actually ran

The named acceptance, against the local Supabase stack on the shifted ports
(API `127.0.0.1:54421`) with the deviz seed applied:

```
npx playwright test tests/e2e/deviz.spec.ts --project=chromium
  11 passed (17.8s)
EXIT=0
```

```
npx tsc --noEmit            -> exit 0
npm run check:pending-schema-reads -> OK, 13 migratii in asteptare,
                                      11 fisiere scutite cu motiv
node docs/board/validate-board.mjs (all three boards) -> PASS, 0 violations
npm run check:conflict-residue -> 3 of 3 checks passed, 283 files
```

The full local suite alongside it: **113 passed, 5 failed.** All eleven deviz
cases are in the passing set. The five are `clients.spec.ts`, and they are
section 5.

## 5. A pre-existing defect found in passing, NOT fixed here

`tests/e2e/clients.spec.ts:30` builds an IDNO meant to be unique per run:

```ts
String(1000000000000 + (Number(`0x${RUN.slice(-4)}`) || 1) * 100 + seed).slice(0, 13)
```

`RUN` is `Date.now().toString(36)`. Base36 uses `0-9a-z`; hex uses `0-9a-f`. When
the last four characters contain a letter past `f`, and at present timestamps they
almost always do, `Number('0x...')` is `NaN`, the `|| 1` fallback fires, and the
expression collapses to the same constant every run: `1000000000101`,
`1000000000102`. **Twenty of twenty sampled timestamps hit the fallback.**

IDNO is unique-constrained, so the second run against the same database is
refused and five tests fail. `quality` never sees it because every CI run gets a
fresh Supabase stack; it appears only on a persistent local stack, which is
exactly where someone runs the suite twice to check a fix.

Not fixed here, deliberately: CLAUDE.md section 3 says a defect noticed in
passing becomes a card or a `docs/LEARNINGS.md` entry, not a quiet commit in a PR
carrying another card. The LEARNINGS entry is written. **It wants a card**, and
the fix is to stop parsing a base36 string as hex and to make the fallback noisy
rather than plausible.

## 6. The pending-schema-reads exemptions, verified rather than asserted

`lib/data/deviz.ts` and `lib/data/deviz-actions.ts` name `devize`, `deviz_lines`
and `project_id`, all added by pending migrations, so `check:pending-schema-reads`
refused them. Both are now in `EXEMPT` with a written reason, and the condition
the list requires (every caller already guarded) was checked, not assumed:

- `getProjectDevizView` has exactly one executing importer,
  `app/(app)/proiecte/[id]/page.tsx`, which calls `hasPhase3Schema()` at line 29
  and returns `SchemaPending` before reaching line 63. The other three importers
  of that module are `import type` and erase at compile time.
- `lib/data/deviz-actions.ts` is imported only by `DevizPanel.tsx`, rendered by
  `ProjectTabs` only inside that page's tree, so only past the same gate. This is
  the reasoning `contact-actions.ts`, `project-actions.ts` and
  `client-actions.ts` already carry.

## 7. Learnings appended

Two entries, per section 9:

1. A `data-testid` on a presentational component that does not spread its props
   disappears silently, and `tsc` cannot report it.
2. `Number('0x' + <base36 string>)` is `NaN` almost always, so an IDNO meant to
   be unique per run is a constant.

Both carry the rule that prevents the next instance. The second is the one worth
reading twice: **a fallback on a path that should never be taken must throw or
report, never return a plausible constant.** `|| 1` turned "the parse failed"
into a valid IDNO, which moved the failure months away, into another file.
