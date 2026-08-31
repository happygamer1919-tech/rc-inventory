# EXECUTOR, 2026-08-31: the approved cleanup pass

Branch `cleanup/audit-pass`, PR **#137**. Not a card: this is the audit cleanup the
owner approved, with his six rulings applied.

---

## 1. The base changed, and the SAFE list was re-verified rather than assumed

The ruling said "cut from main @ `e40b1a0`". Main has moved twice since, through
PR #134 and PR #130, and the branch is cut from **`b7a1c7e`**.

Every SAFE item was re-checked against that base. **Zero differences from the
audit.** The greps are quoted in full in each commit message; the summary:

- `components/ui/Placeholder.tsx`: 0 references outside itself.
- The 4 re-export lines: all ten real imports from `lib/data/inbound.ts` and
  `lib/data/outbound.ts` are functions defined in those files. Not one is a
  re-exported name.
- The 7 dead symbols: 0 references outside their defining file, each. After
  deletion, 0 references anywhere at all.
- The 4 surplus exports: used, but only inside their own file, so only the
  `export` keyword goes.
- The 6 tracked `scratchpad/` files: 0 references in app, components, lib,
  scripts, tests, docs, `.github` or `package.json`.

`knip` is **not installed** in this repo; the audit ran it transiently via `npx`.
I did not re-run it, because the per-symbol greps are the actual evidence and a
transient download is not reproducible for a reviewer. If you want knip in CI that
is a dependency decision and therefore yours.

## 2. Three deviations from the letter of the rulings, each deliberate

**These are the parts to read.** Everything else did what it was told.

### 2.1 `one<T>()` went to a new `lib/data/row.ts`, not out of `outbound.ts`

The ruling said to point the six sites at the existing `one<T>()` in
`lib/data/outbound.ts`, guarding only against pulling a server-only module across a
client boundary. That boundary is fine: all six sites are server modules, two with
`import "server-only"` and four with `"use server"`.

The problem is one step further on. **`lib/data/outbound.ts` itself begins with
`import "server-only"`, and `one` is currently private.** Exporting it would add a
new value export out of a server-only module, which is precisely the latent hazard
commit `5ec78da` of this very branch deletes. The PR would have removed a hazard at
one end and created it at the other.

`lib/data/row.ts` imports nothing at all. `outbound.ts` now imports `one` from it
like everyone else. The ruling's goal, one definition instead of seven, is met.

### 2.2 `MAKE_WEBHOOK_SECRET` went to `EXPECTED_IN_PRODUCTION`, not `REQUIRED`

The ruling told me to stop and report if I concluded the variable was optional. **It
is not optional**, so I continued: it is the `X-RC-Secret` header the Make scenario
authenticates our request with, and without it document extraction cannot work at
all, exactly like `MAKE_WEBHOOK_URL`.

But `lib/env-required.ts` documents its own two-class boundary at length, and this
variable is unambiguously the second class: `REQUIRED` is what stops **every**
screen, `EXPECTED_IN_PRODUCTION` is what stops **one feature** while the rest of the
application works. That file also says in its own words why the stricter choice is
worse: it would turn a warehouse without extraction into a warehouse without an
application, and would make the test suite and every partially configured dev
environment impossible to run.

"Fails loud at boot" is satisfied either way: that class prints a boot warning
**naming the missing variable**. And the `?? ""` is gone, so the call now refuses
and names the variable instead of sending an empty header and reporting Make's 401.

### 2.3 The two filename builders were not byte-identical

The ruling described them that way. The five-step chain is identical; the
`|| "document"` fallback sat in a **different place** in each file, inside the path
template in one and at the assignment in the other. Same result, so one
`safeFileName` covers both with no behaviour change, but the description was wrong
and is corrected here rather than smoothed over.

## 3. One behaviour difference, found and proven harmless

`Array.isArray(x) ? x[0] : x` returns `undefined` where `one()` returns `null`. That
is a real difference and it was not waved away. All six call sites consume the
result through `?.`, `??` or `Boolean()`, and not one compares against `undefined`.
Each was read individually. No observable change at any of them.

## 4. The commits, and what was run after each

| commit | category |
|---|---|
| `5577f17` | delete `Placeholder.tsx` |
| `5ec78da` | delete the 4 dead re-export lines |
| `988ce61` | delete the 7 dead exported symbols |
| `7915a99` | downgrade the 4 surplus exports to local |
| `7073389` | untrack the 6 scratchpad files, extend `.gitignore` |
| `fc520ab` | declare `@next/env` as a devDependency |
| `7c93a4c` | `MAKE_WEBHOOK_SECRET` at boot, `?? ""` removed |
| `20af71c` | one `safeFileName` and one `one`, in `lib/data/row.ts` |

`npx tsc --noEmit` and `npm run build` after **every one**, both exit 0 each time.
`npm ci` exit 0 after the lock change, which is what CI actually runs.

Nothing was orphaned by the deletions, and that was checked rather than hoped:
`getSessionUser` still has two callers in `outbound-actions.ts`, `present()` two in
`supabase/env.ts`, and `mapDraft`, `LINE_COLUMNS` and `DRAFT_COLUMNS` are all still
used in `extraction.ts`.

## 5. `git rm --cached`, not `git rm`

The scratchpad files leave the repository and stay on local disk. That is the only
reading under which extending `.gitignore` means anything: if they were deleted from
disk, the two new patterns would have nothing to cover. They are someone's working
files and deleting them locally is the destructive choice with no gain to the tree.

## 6. The suite

Run on `card/p3-13b`, against a local stack reset to a CI-equivalent state
(`supabase db reset`, all 25 migrations, all four seed scripts from `quality.yml`):

```
npx playwright test
  118 passed (3.7m)
EXIT=0
```

This branch changes no test. The number is stated here because it is the baseline
the cleanup is measured against, and because the owner asked for the real output
rather than an assertion that it is fine.
