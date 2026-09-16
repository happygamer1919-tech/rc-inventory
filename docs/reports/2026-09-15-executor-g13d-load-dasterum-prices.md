# EXECUTOR report, 2026-09-15, card P3-58, the verified Dasterum prices

**Role:** AUTHOR (card written), then EXECUTOR (card built), in one pull request, as the
operator factory task for goal G13d asks. **Session:** the operator's task queue, on the
owner's machine (no Docker, no Supabase CLI, no production credentials).
**Branch:** `card/p3-58`. **Pull request:** #306. **State:** open, merge held for the owner:
real client data is in production, and merging applies migration 0047 to the live database
(CLAUDE.md 8.0). Max pre-approved this merge ("prices go, merge when green", factory mailbox
answer q031b), so POC verifies the conditions and merges without asking again.

## Boot status at the start

- Phase 2 board: 68 shipped, 32 todo, 2 blocked. Launch gate 0/9.
- Phase 3 board: 74 shipped, 32 todo. Launch gate 0/9. P3-57 shipped, its evidence read.
- Lowest eligible card across the boards: AUT-3.
- Open pull requests: #300 (Orange, board only). None of ours, so the one-open-PR slot was free.
- Worked instead of the next eligible card: the new card P3-58, authored here, because the
  owner's goal G13d names it.

## Cards touched

| card | status at start | status in this pull request |
|---|---|---|
| P3-58 | did not exist | authored `todo`, then `in_flight`, then `shipped` with evidence PR #306 |

## What changes for Rapid Construct, once merged

When someone adds a roofing sheet or metal tile and picks its model, series and thickness, the
price field fills itself with Dasterum's price for exactly that line. It is a suggestion: the
operator can type over it, and what the field holds when Adaugă produsul is pressed is what is
saved. A small Romanian line under the field says where the number came from, and it disappears
the moment the number is changed. Ordinary products are unaffected, no existing product's price
changes, and no new product is created by this card. Nothing changes on the live site until this
pull request merges.

## AUTHOR step

- Card P3-58 appended to `docs/board/rc-board-phase3.json` with `plain`, `defaults` quoting the
  task's "The fix" and "What must NOT change" plus six decisions taken at authoring,
  `depends_on: ["P3-57"]`, and an acceptance naming `tests/e2e/roofing-product-prices.spec.ts`.
- Validator exit 0, `check:card-ids` exit 0, `check:unique-ids` exit 0, `check:board-clock`
  exit 0. Commits `c339877` (authored) and `32124e9` (in_flight).

### The id allocation is a recorded deviation, not a silence

`npm run id:free -- P3-58` exits **2**, twice, before and after fetching the branch:

```
check-open-branch-ids: A SOURCE COULD NOT BE READ, SO NO ID IS REPORTED FREE.
  board/orange-20260915-manufactured-figure (#300): Expected double-quoted property name
  in JSON at position 119 (line 5 column 2)
```

That branch belongs to Ivan's ORANGE terminal and its `docs/board/rc-board-phase3.json` really
does not parse: it carries two top-level `as_of` keys, which is the shape a board merge conflict
leaves behind. It is not edited from here. The id was proved by hand instead: `git grep P3-58` on
that branch's `docs/board` finds nothing, the highest phase 3 id on `main` is P3-57, and
`npm run check:open-branch-ids` exits 0 on this branch. Both id checks run again in `quality`.
The refusal and the proof are written into the card notes and into `docs/LEARNINGS.md`.

**Ivan should know his open pull request #300 carries a board file that does not parse**, because
`check:conflict-residue` and the board validator will refuse it as it stands.

## What the verified list holds, checked before a line was written

A script read `inputs/dasterum-pret-2026-08-07-verificat.csv` in the factory folder and compared
it, line by line, with the 225 rows of migration 0046:

- 194 data lines, 8 columns each, 194 distinct (model, serie, grosime_mm, finisaj) lines.
- Those 194 lines are **identical, in both directions**, to the 194 distinct
  (price_group, series, thickness_mm, finish) lines that `public.sheet_options` already carries.
  Zero CSV lines without a combination, zero combinations without a CSV line.
- "PK/PS-20, VP-20" is 20 CSV lines, and each of them covers two `sheet_options` rows, which is
  exactly what `price_group` exists for.
- The prices sum to **26832 lei**, the number the migration and the spec both pin.
- The file begins with a byte order mark, stripped before the header is read. That is the only
  thing about the file that needed handling.

## Decisions, and why

1. **A new table, not a column on `sheet_options`.** A column would have to be filled by UPDATE
   of 225 existing rows, and G13d is INSERT only. A separate table also keeps a shared price
   honest: "PK/PS-20, VP-20" is one price line, so it is one row, read by both profiles.
2. **The key is the price line (price_group, series, thickness_mm, finish), and there is no
   foreign key.** `price_group` is deliberately not unique in `sheet_options`, so there is no key
   to reference. The migration asserts the same property more strongly instead: the two tables
   name exactly the same 194 price lines, both ways, or the file applies nothing.
3. **`price_lei numeric(14,2)`**, the type of `products.unit_value_mdl`, which is the field the
   suggestion fills. Lei and MDL are one currency. The check `price_lei > 0` is kept.
4. **The file is re-runnable**, in the pattern 0029 and 0031 already use here: `create table if
   not exists`, the select policy created only when it is missing, and `on conflict do nothing`.
   A second run writes no row and the count of 194 still holds.
5. **The join runs on the server**, inside `listSheetOptions`, so the form receives one thing to
   understand, a combination with its price, and `price_group` never reaches the browser.
6. **`hasSheetPrices` gates it.** Until 0047 is applied, combinations carry no price and the form
   behaves exactly as P3-57 left it. Written as its own probe rather than shared with
   `hasSheetOptions`, because the two migrations arrive separately.
7. **The note under the field is state, not decoration.** It shows only while the field still
   holds exactly the suggested number, so the screen never claims a price came from Dasterum
   after somebody changed it.
8. **`createProduct` and `updateProduct` are untouched.** The price was already an ordinary form
   field; making the server aware of the suggestion would have turned a hint into a rule.

## EXECUTOR step, files

- `supabase/migrations/0047_sheet_prices.sql` (new): the table, the 194 prices in the order of
  the verified list, RLS and grants, and a DO block asserting 194 rows, the 26832 lei sum and the
  two-way match with `sheet_options`. 15 statements, no DROP, TRUNCATE, DELETE or UPDATE.
- `scripts/poc-free/local-db/assertions/0047_sheet_prices.sql` (new): shape and key, eight prices
  written by hand from the CSV, all 225 combinations finding their price, the shared line read by
  both profiles, the refusals (zero price, untrimmed text, empty series, a second price for one
  line), a re-run adding nothing, owner reads 194 and cannot write, anon reads nothing.
- `docs/migrations/APPLY-LOG.md`: pending line `0047_sheet_prices.sql`, card de aplicare P3-58.
- `lib/data/schema-capability.ts`: `hasSheetPrices`, the same shape as the probes beside it.
- `lib/data/sheet-options-types.ts`: `priceLei` on the option, `normalizePrice`,
  `SHEET_PRICE_NOTE`, and the header's "no prices" sentence corrected in place rather than
  deleted.
- `lib/data/sheet-options.ts`: the price lines read and joined to the combinations on the server.
- `components/inventory/ProductForm.tsx`: the pick fills Valoare unitară (MDL); the note under
  the field; the helper line names the price only when prices are actually loaded.
- `tests/e2e/roofing-product-prices.spec.ts` (new): the card's three cases.

## Commands run locally, all exit 0

`npx tsc --noEmit`, `npm run build`, the board validator on all three boards, `check:card-ids`,
`check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration` (1 file, 15
statements), `check:conflict-residue` (run after staging), `check:categories`,
`check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads` (4 pending migrations),
`check:removal-safety`, `check:assertion-register`, `check:board-clock`, `check:board-edit`
(after the shipped flip).

**Left for CI**, because this machine has no Docker and no Supabase CLI: `npm run
check:migrations` (applies 0047 to a bare postgres and runs its assertion file),
`npm run prove:applier`, `npm run prove:assertions`, and the Playwright suite including the
acceptance spec. Their result on the head sha is recorded in the pull request and in the owner
question, not here, because writing it here would move the head sha.

## Defects found

One, and it is not in this repository: `id:free` cannot answer while another open branch carries
an unparseable board. The signature, the proof used instead and the rule are appended to
`docs/LEARNINGS.md`. Nothing broke in the build itself.

## Left for the owner

- Approve the merge. It is pre-approved ("prices go, merge when green"); POC verifies the green
  run, the migration steps having RUN, and the acceptance, then merges.
- Know that merging writes 194 reference prices into the live database and changes nothing else.
- Ivan: pull request #300 carries a board file that does not parse.
