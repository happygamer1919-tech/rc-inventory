# EXECUTOR report, 2026-09-16, card P3-68, the owner's screen for models, series and thicknesses

**Role:** AUTHOR (card written), then EXECUTOR (card built), in one pull request, as the
operator factory task for goal G22 asks. **Session:** the operator's task queue, on the owner's
machine (no Docker, no Supabase CLI, no production credentials).
**Branch:** `card/p3-68`. **Pull request:** opened from this branch after this report was
committed; its number is in the factory mailbox question `approve-p3-68-merge`.
**State:** open and NOT merged. The merge is NOT pre-approved: it carries a migration and it
changes who may write price data.

## Boot status at the start

- Phase 2 board: 68 shipped, 32 todo, 2 blocked. Launch gate 6/9.
- Phase 3 board: 82 shipped, 32 todo, 1 blocked. Launch gate 0/9.
- Lowest eligible card on phase 3: P3-14.
- Open pull requests of ours: none, so the one-open-PR slot was free.
- Worked instead of the next eligible card: the new card P3-68, authored here, because the
  owner's goal G22 names it.

## Cards touched

| card | status at start | status in this pull request |
|---|---|---|
| P3-68 | did not exist | authored `todo`, then `in_flight`, then `shipped` with evidence |

## What changes for Rapid Construct, once merged

Settings (Setări) gets a new card, "Model, serie și grosime", with a button that opens a screen
only the owner can reach. The screen lists all 225 roofing sheet and metal tile combinations,
grouped by model and series, each with its price and whether it is offered. From it the owner can:

- **add a combination** (model, series, thickness, finish, unit, price group, and optionally a
  price). A combination that already exists gets a plain Romanian message instead of an error.
- **change a price.** The price belongs to a price line, and when several combinations share one
  (PK/PS-20 and VP-20) the screen says so beside the price.
- **retire a combination** he no longer sells. It stops being offered when a product is added.
  Nothing is deleted, and it can be turned back on with Reactivează.

Products that already use a retired combination keep it: their edit form opens with it selected
and saves normally. Nobody else can change the list: the account manager gets the "no access"
screen, and the database itself refuses their writes.

**In the live database** (on merge, within about two minutes): one new empty column that marks a
combination as retired, plus owner-only permission to add combinations and prices and to change a
price or the retired mark. No existing row is changed or removed.

## AUTHOR step

- `npm run id:free -- P3-68`: FREE, lane highest P3-66. P3-67 not taken: origin holds
  `card/p3-67` for another factory task.
- Card P3-68 appended to `docs/board/rc-board-phase3.json` with `plain`, `defaults` quoting the
  task's "The fix" plus nine decisions (a) to (i), `depends_on: ["P3-57", "P3-58"]`, and an
  acceptance naming `tests/e2e/sheet-options-admin.spec.ts`.
- Board validator exit 0 (after correcting the derived `lane` of a todo card to `in_flight`),
  `check:card-ids` exit 0, `check:unique-ids` exit 0, `check:board-clock` exit 0.
  `check:board-edit` answered "NOT A PULL REQUEST" at that point (branch equal to main).

## EXECUTOR step

### Migration `supabase/migrations/0048_sheet_options_admin.sql`

- `alter table public.sheet_options add column if not exists retired_at timestamptz null`.
- `grant insert` and `grant update (retired_at)` on `sheet_options`; `grant insert` and
  `grant update (price_lei)` on `sheet_prices`, to `authenticated`.
- Policies `sheet_options_owner_insert`, `sheet_options_owner_update`,
  `sheet_prices_owner_insert`, `sheet_prices_owner_update`, all `public.is_owner()`.
- No DELETE, DROP, TRUNCATE, INSERT or UPDATE statement. No delete grant, no delete policy.
- Re-runnable (0047's shape). A closing block raises unless the column, the four policies, the
  one-column update grants, the absence of delete and anon's lack of any privilege all hold.

### Assertions

- New `scripts/poc-free/local-db/assertions/0048_sheet_options_admin.sql`: shape; an account
  manager and a deactivated owner write nothing; the owner adds a combination and a price line,
  a duplicate is refused by the key, the table checks still refuse a padded model and a zero
  price, a price changes, a key column and a price group cannot be rewritten even by the owner,
  nothing can be deleted even by the owner, a product naming a combination keeps it and still
  saves after that combination is retired, and reactivation clears the mark; anon writes nothing.
- `assertions/0046_sheet_options.sql` and `assertions/0047_sheet_prices.sql` asserted that only
  migrations write these tables. That becomes false with 0048, and because assertion files run
  against the finished schema they would have failed. Amended under CLAUDE.md 9c: the false
  sentences are quoted and kept, the refusal is now asserted against an account manager.
- `docs/migrations/APPLY-LOG.md`: pending line for 0048, card de aplicare P3-68.

### Application code

- `lib/data/schema-capability.ts`: `hasSheetOptionRetirement`, probing `sheet_options.retired_at`.
  Before 0048 lands the product form offers everything and the screen is read only.
- `lib/data/sheet-options-types.ts`: `retired` on `SheetOption`, `SheetOptionAdminRow`,
  `SheetOptionInput`, `parseThicknessInput` (refuses a third decimal rather than letting
  numeric(3,2) round it) and `parsePriceInput`.
- `lib/data/sheet-options.ts`: one reader for both the product form and the screen, carrying the
  retired mark and how many combinations share each price line.
- `lib/data/sheet-options-actions.ts` (new, server actions): `createSheetOption`,
  `setSheetPrice`, `setSheetOptionRetired`. Each checks the session, the owner role and the
  capability before writing, turns 42501 and silent zero-row updates into "Doar administratorul
  poate modifica lista de modele.", and revalidates `/setari/tabla` and `/inventar`.
- `lib/data/product-actions.ts`: a retired combination is refused on a new product, and on an
  edit only when it differs from the combination the product already carries.
- `components/inventory/ProductForm.tsx`: one filter, `offeredSheetOptions`, drops retired
  combinations except the product's own saved one. Nothing else in the form changed.
- `app/(app)/setari/tabla/page.tsx`, `components/settings/SheetOptionsSettings.tsx` (new), and a
  link card on `app/(app)/setari/page.tsx`. Shared primitives only, Romanian throughout.

### Tests

- New `tests/e2e/sheet-options-admin.spec.ts`, five cases matching the card's acceptance. Each
  case adds its own `TEST-` combination so no case depends on another.
- `tests/e2e/roofing-product-prices.spec.ts` case 3 now counts sheet_prices and sheet_options
  without rows whose price group or model starts with `TEST-`. It still asserts exactly 194
  prices, 26832 lei and 225 combinations of the verified list.

## Commands run locally and their results

| command | result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0, `/setari/tabla` listed as a dynamic route |
| `npm run check:card-ids` | exit 0 |
| `npm run check:unique-ids` | exit 0 |
| `npm run check:open-branch-ids` | exit 0 |
| `npm run check:no-destructive-migration` | exit 0, 1 file, 15 statements |
| `npm run check:conflict-residue` | exit 0 |
| `npm run check:categories` | exit 0 |
| `npm run check:ledger-rows` | exit 0 |
| `npm run check:no-prod-target` | exit 0 |
| `npm run check:pending-schema-reads` | exit 0 |
| `npm run check:removal-safety` | exit 0 |
| `npm run check:assertion-register` | exit 0 |
| `npm run check:board-clock` | exit 0 |
| `npm run check:board-edit` | exit 1 while the card was `in_flight` (expected), rerun after the shipped flip before the push |
| board validator | exit 0 before every commit |
| every migration and all 31 assertion files on a throwaway local postgres 17 (stand-in for `check:migrations`, which needs Docker) | all passed; 0048 re-run clean |
| mutation: owner insert policy opened to `true` | refused by 0048's own check ("2 of the four owner write policies") |
| mutation: full-row update grant on sheet_options | refused by 0048's own check ("may update every column") |

**Left for CI, because this machine has no Docker and no Supabase stack:** `npm run
check:migrations` on postgres 16, the migration applier proof, the proof that every applier
assertion can fail, and the whole Playwright suite, including `sheet-options-admin.spec.ts`.
Their results are read on the pull request's head sha and quoted in the mailbox question.

## Split or not

Not split. The migration, data layer, server actions and screen are one pull request of about
1,900 added lines, most of them the migration's and assertions' own comments and checks.

## Learnings

Two entries appended to `docs/LEARNINGS.md`: an older card's assertion file keeps asserting the
old access rule after a later card changes it on purpose; and a Homebrew postgres can stand in
for `check:migrations` before the push, once `pg_ctl start` gets a log file and no inherited pipe.

## Left for the owner

- Approve or decline the merge. The factory mailbox question states the pull request number,
  head sha, migration path, and that GOALS.md marks this merge NOT pre-approved while POC's
  overnight note approves trusted-green merges tonight without naming this card.
- The screen appears on the live site only after the merge.
