# EXECUTOR - run 20260906-220005 - EXT-10, the supplier's packaging

**Role:** EXECUTOR, unattended scheduled run, CLAUDE.md section 13.
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, branched from `origin/main` at `2f0878d`.
**Cards worked:** one. **Cap:** 45 minutes, and the second card was never started
because the first one would not have finished beside it.

---

## Boot report, as printed before any write

| board | shipped | in_flight | todo | blocked | halted |
|---|---|---|---|---|---|
| phase 2 | 64 | 1 | 13 | 3 | 0 |
| phase 3 | 39 | 0 | 33 | 0 | 0 |

- **Launch gate, phase 2: `0/9`.** Phase 3: `0/9`.
- **Blocked:** P2-08b on `andre`, P2-14 on `client`, MIG-01 on `ivan`. In flight: AUT-3.
- **Claims: none live.** `docs/poc/claims/` holds only its README. `state.claims`
  carries one `APPLY-02` lease taken 2026-09-05T05:50:52Z, which is past the six
  hour TTL and parks nothing. **No card was skipped for a claim this run.**
- **Next eligible card: `EXT-10`**, first of 43, phase 3 board then phase 2, which
  is the order `analyseAll` produces and CLAUDE.md section 2's lowest-id rule
  applied within each board.

---

## What happened to the card

**EXT-10 - "Products carry a package unit and a package factor, so a supplier
billing per pallet or per box stops being read as billing stock units."**

**Status: `in_flight` on the board, PR #236 open, quality not yet reported at the
moment this report was committed.** It is deliberately NOT flipped to `shipped`.
Section 6 requires the named acceptance to have been run and passed in the pull
request that ships the card, and two of its three commands run in CI rather than
here. Flipping it on a pending check would be the one failure this project has no
recovery path for.

### What was built

- `supabase/migrations/0035_products_package.sql` - `products.package_unit`
  (text, nullable) and `products.package_factor` (numeric(14,3), nullable), paired
  by the check constraint `products_package_pair_complete`: both fields or
  neither, and the factor greater than zero.
- `scripts/poc-free/local-db/assertions/0035_products_package.sql` - the four
  combinations the acceptance names, each in its own `DO` block with its own
  message, plus three it does not: a factor of zero refused, a negative factor
  refused, and a fractional factor of 2.5 ACCEPTED, because a 2.5 kg set is a
  real supplier package and somebody will otherwise "tighten" the column to an
  integer and round it away in silence. It also asserts that **zero packaging
  labels reached `public.unit_code`**, which is the card's first default made
  machine-checkable rather than promised.
- `lib/data/schema-capability.ts` - `hasProductPackaging`.
- `lib/data/products.ts` - `CatalogProduct` gains `packageUnit` and
  `packageFactor`; the column list is built from the gate's answer.
- `lib/data/product-actions.ts` - `validatePackage`, and the write gated by the
  same capability.
- `components/inventory/ProductForm.tsx` - the two fields, under a heading that
  says in Romanian what they are for and that they are for the case where the
  supplier bills differently.
- `components/inventory/ProductPanel.tsx` - the sentence, shown only when a
  product actually has packaging.
- `tests/e2e/products.spec.ts` - two named cases.
- `docs/migrations/APPLY-LOG.md`, `docs/LEARNINGS.md`, and the board.

### Acceptance, honestly

| command | where | result |
|---|---|---|
| `npx tsc --noEmit` | locally | **exit 0** |
| `npm run check:migrations` | `quality`, unfiltered | **pending on `8cf6e73`** |
| `npx playwright test tests/e2e/products.spec.ts` | `quality`, full e2e suite | **pending on `8cf6e73`** |

**Docker is not usable on this machine right now**, so `check:migrations` could
not be run locally. `npm run checks:state 236` at the moment of writing printed
`mergeStateStatus BLOCKED` and an empty `quality`, which is exactly the state
section 3 says must never be mistaken for green, and it is not being mistaken for
green here.

### Defaults applied, per section 5

1. **"NOT AN ENUM CHANGE, and `cutie` and `palet` do not go into
   `public.unit_code`."** Applied. The enum is untouched and the assertions file
   proves it.
2. **"BOTH NULLABLE, BECAUSE MOST PRODUCTS HAVE NO PACKAGING."** Applied. Neither
   column is NOT NULL and neither carries a default, both asserted, for the same
   reason 0033 gives.
3. **"SCHEMA AND SCREEN ONLY."** Applied. Nothing here touches the extraction
   path or converts anything.

### The one decision taken on the card's own authority

**The package unit is free text, not a second closed list.** The vocabulary
belongs to the suppliers (`palet`, `cutie`, `set`, `bax`, `rola`) and a closed
list would refuse the next one Andre meets. A blank string is normalised to NULL
in the write path, so it never reaches the constraint pretending to be a package
unit. Recorded in the card notes.

### The one thing added that the card did not ask for

`hasProductPackaging`, and the gate on the read and the write.

Merging this migration applies it, within about two minutes, and the deploy
carrying the code that reads the columns leaves the same push and lands on its own
schedule. `listProducts` is called by the dashboard, by inventory, and by every
form that picks a product. An unguarded `select` naming `package_unit` answers
42703 for the length of that window and takes six screens down with it. That is
INC-05 exactly, and this repository has paid for it once. It is reported here
rather than treated as scope creep, and it is in the card notes and in the pull
request body so a reviewer can disagree with it in one place.

---

## Escalations

**None.** Nothing on the R-057 list was reached, no `ask.sh` question was sent,
and no card was blocked by this run.

---

## What the next run should pick up first

1. **PR #236, before anything else.** Read `npm run checks:state 236`. On a green
   `quality` for the head sha, flip EXT-10 to `shipped` with `evidence` naming the
   pull request and the run, and self-merge under section 3.1. On a red one, the
   card is `in_flight` and the failure is the next work. **Do not start a new card
   while #236 sits green and unmerged**: an unapplied migration on an open branch
   is what the RST cards exist to clean up.
2. **The APPLY-LOG entry for `0035` says its post-merge observation is NOT
   claimed.** Whoever next probes production should record
   `applied_ledger_version()` reading `"0035"` as a correcting entry, append-only,
   per that file's own rules.
3. **Then `EXT-11`**, the next eligible id, which is the supplier document series.

## Harness note

Elapsed at the moment of committing this report is at or near the 45 minute cap.
The run reached a pushed branch and an open pull request; it did not reach a
merge, and it says so rather than leaving a card that looks finished.
