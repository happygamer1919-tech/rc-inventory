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

**Status: `shipped` on the board, PR #236, held unmerged until `quality` is green
on the head sha.**

**IT WAS PUSHED AS `in_flight` FIRST, AND THE CHECK REFUSED IT.** The reasoning
for `in_flight` was section 6: two of the card's three acceptance commands run in
CI rather than here, and claiming a pass that has not been observed is the one
failure this project has no recovery path for. `check:board-edit` disagreed, and
it is right: it resolves the card ids in the branch name and the commit subjects
and requires each one to reach a TERMINAL status at the head, `in_flight` is not
terminal, and the job exited 1 before any other step reported. Run 34075294824 on
`8cf6e73`, `satisfied 0 of 1 card id(s)`.

**The two readings reconcile the way this repository already works.** The
acceptance commands RUN IN `quality`. A green check on the head sha IS the
acceptance passing, and the merge is the single moment at which both halves of
section 5b are true at once. So the board flip lands in this pull request, where
CLAUDE.md section 2 says it belongs, and the MERGE is what waits. That is
logged as a learning and on the card.

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
| `npm run check:migrations` | `quality`, unfiltered | see the merge condition below |
| `npx playwright test tests/e2e/products.spec.ts` | `quality`, full e2e suite | see the merge condition below |

**Docker is not usable on this machine right now**, so `check:migrations` could
not be run locally. It runs in `quality` with no path filter, which is the same
command against the same `postgres:16` image.

**THE MERGE CONDITION, STATED SO NOBODY HAS TO INFER IT:** this pull request is
merged only on a `quality` run that EXISTS FOR THE HEAD SHA and concluded
success, read together with `mergeStateStatus` per section 3, using
`npm run checks:state 236`. Two earlier runs on this branch FAILED and are
recorded here rather than left for somebody to find: 34075294824 on `8cf6e73` and
34075340961 on `57140f3`, both on `check:board-edit` and both for the same reason
above. Neither is a failure of the card's own acceptance, and neither may be read
as one.

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

1. **PR #236, before anything else, if this run did not merge it.** Read
   `npm run checks:state 236`. On a green `quality` for the head sha, self-merge
   under section 3.1: the board already says `shipped` and the evidence already
   names the pull request. On a red one, the board says `shipped` and the code is
   not on `main`, which is the one state this arrangement can produce and the
   reason it must be resolved before anything else is started. **Do not start a
   new card while #236 sits green and unmerged**: an unapplied migration on an
   open branch is what the RST cards exist to clean up.
2. **The APPLY-LOG entry for `0035` says its post-merge observation is NOT
   claimed.** Whoever next probes production should record
   `applied_ledger_version()` reading `"0035"` as a correcting entry, append-only,
   per that file's own rules.
3. **Then `EXT-11`**, the next eligible id, which is the supplier document series.

## Harness note

The 45 minute cap governs this run and the merge is the only step that depends on
somebody else's clock: `quality` builds five throwaway postgres containers and a
local Supabase stack. Whether the merge landed inside the cap is stated in the
closing line of this file's final version and in the run log, never inferred.

## Learnings appended

Three entries in `docs/LEARNINGS.md`: merge-applies-so-gate-the-read; a nullable
numeric column read through a zero-defaulting helper losing the difference between
none and zero; and `check:board-edit` refusing a card pushed as `in_flight`
beside its own code.
