# EXECUTOR report: P3-42, the reminder threshold reached from the reminders row

**Role:** EXECUTOR. **Date:** 2026-09-13 (the run crossed midnight UTC; board timestamps read 2026-09-14). **Branch:** `card/p3-42`, cut from `origin/main` at `64f4529`. **Pull request:** #284.

## Boot status, phase 2 board

- Cards by status: 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted.
- Launch gate: 6/9.
- Next eligible card: AUT-3. This run was dispatched to P3-42 on the phase 3 board (RULE-05 defect: section 1 names only phase 2), where P3-42 was eligible: todo, no dependencies, not blocked.

## Cards touched

| Card | Status at end |
|---|---|
| P3-42 | shipped (pending merge of #284 at the time of writing) |

## THE CAPABILITY ALREADY EXISTED

Changing a product's reminder threshold already worked before this card, from the product sheet in Inventar. This card added a way to reach it from the reminders screen. It did not add the ability to change the threshold, and describing it as new would be false.

## Premise check, before any work

What writes `products.threshold`, measured with grep over `app`, `components`, `lib`, `scripts` and `supabase/migrations`:

1. `updateProduct` in `lib/data/product-actions.ts`, called only from `components/inventory/ProductForm.tsx`. The only path that changes the threshold of an existing product.
2. `createProduct`, same file, same form in add mode. Sets it once at creation.
3. The extraction review confirm in `lib/data/extraction-actions.ts`. Inserts a new flagged product with threshold 0; never edits one.
4. Test seed scripts under `scripts/`. Not a screen.

The column is declared in migration 0001: `numeric(14,3) not null default 0`, `check (threshold >= 0)`. `app/(app)/memento/page.tsx` read the threshold, wrote nothing, and its card header said the threshold is edited in the product sheet, from Inventar. The premise held; the card was worked as authored.

Who may change it: only the owner role. `updateProduct` refuses any other role with a Romanian message, row level security in migration 0001 refuses underneath, and Inventar renders no edit button for other roles. `/memento` is not owner-only (`lib/routes.ts` lists only `/setari`), so the account manager can open it; that is the account the permissions clause is asserted with.

## Shape chosen: the link, not an inline edit

The card allows either. `updateProduct` takes the whole product (SKU, name, category, unit, threshold, value, supplier, packaging), so an inline editor on the row would have needed either a new server action that writes only the threshold, which the one-write-path clause refuses, or a row that carries and resubmits every product field, which is a second form in disguise. The defaults say to prefer the link in that case, and the link was built.

## What changed

- `app/(app)/memento/page.tsx`: for the owner only, the threshold on each row is a link (`RecordLink`, the single record-link style from P3-10) to `/inventar?produs=<sku>&camp=prag`. The card header hint tells the owner to click the threshold. Other roles see the value and the old hint, unchanged.
- `components/inventory/InventoryScreen.tsx`: `camp=prag` together with `produs=` opens the existing `ProductForm` in edit mode directly, for the owner only. Without the right to write it opens the read-only panel, exactly what `produs=` alone has done since P3-10.
- `components/inventory/ProductForm.tsx`: an optional `focusField` prop puts the threshold input in focus and selects it when the form opens from that link. The input gains `name="threshold"` so the form can find it. Nothing about what is saved changes.

No migration. No new dependency. No leads files touched. The reminders list stays a list, with no drill-in added to it.

## Acceptance

`npx playwright test tests/e2e/reminders.spec.ts`, four new cases in the describe "Memento stoc: pragul se modifică din rândul lui":

1. "pornind din memento, pragul se schimbă și se citește din rândul stocat": owner, starts on `/memento`, clicks the threshold link, lands on the form with the threshold focused, saves 7, reads 7 back from the stored `products` row through PostgREST.
2. "fișa produsului din Inventar editează în continuare același prag": the existing path, row, panel, Modifică, saves 13, stored row reads 13.
3. "amândouă drumurile scriu pragul prin aceeași acțiune de server": both paths on one product; the `Next-Action` header on each save request is captured and asserted equal and non-empty. Next gives every server function its own id, so equal ids mean one function: `updateProduct` in `lib/data/product-actions.ts`.
4. "operatorul nu poate schimba pragul nici pornind din memento": the account manager sees the row with no edit link; the link's address typed by hand opens the read-only panel with no edit button, no form and no threshold field; the stored threshold is still 10.

Shipped cases on the same surface, unmodified: `tests/e2e/products.spec.ts`, `tests/e2e/dashboard.spec.ts` (memento reads real thresholds), `tests/e2e/cross-links.spec.ts` (`produs=` opens the panel).

### Red first

Quality run **34791543786** on `ffe15ac`, the head carrying the four new cases alone with no application change, concluded **failure at End to end only**. Every step in front of it passed; both applier proof steps were skipped, correctly, with no migration.

- **2 failed**, both at `reminders.spec.ts:291`, `locator.click` timing out on `getByTestId('threshold-edit-link')` inside the threshold row:
  - `:314` "pornind din memento, pragul se schimbă și se citește din rândul stocat", after its stored-row read of the starting threshold (10) had passed.
  - `:354` "amândouă drumurile scriu pragul prin aceeași acțiune de server", after its save from the product sheet, the `Next-Action` capture and the stored-row read (12) had passed.
- **216 passed**, among them `:342` the product sheet case, `:374` the account manager case, the four shipped reminders cases, and `products.spec.ts`, `dashboard.spec.ts` and `cross-links.spec.ts`.

That is the predicted shape: the two cases that need the new link fail on the missing link and on nothing else, and the two that guard what must not change pass.

The implementation was committed only after this run concluded. The `quality` workflow has `concurrency: cancel-in-progress: true` on the branch ref, so pushing the implementation while the red arm was still running would have cancelled it and left no before-result.

### Green after

The quality run on the implementation head, the commit that carries this report. Its id and result are recorded in pull request #284 and in the factory's run log, not here, because writing them into this file would move the head away from the run that proved it.

### Local commands

No Docker and no Supabase CLI on this machine, so the end to end suite and the applier proofs ran only in CI.

- `npx tsc --noEmit`: exit 0, on the red-arm head and on the implementation.
- `npm run build`: exit 0, on both.
- Board validator on all three boards: 0 violations before every commit.
- `check:card-ids`, `check:board-edit`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`, `check:conflict-residue` (after staging), `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`: all exit 0.

## Defaults applied (CLAUDE.md section 5)

- DO NOT BUILD A SECOND CONFIGURATION SURFACE: honoured; no settings screen, no bulk editor, no second form.
- PREFER THE LINK IF INLINE EDIT WOULD NEED A NEW SERVER ACTION: applied, for the reason above.
- RECORD THAT THE CAPABILITY ALREADY EXISTS: recorded in the pull request, the card's evidence and notes, and this report.
- DENSITY DOCTRINE STILL BINDS: no drill-in added to the list.

## Findings, not fixed here

- **The reminders list does not paginate.** The card's defaults say "The reminders list paginates and stays a list", and the board doctrine says a list paginates at 25, but `app/(app)/memento/page.tsx` renders every active product in one table, and the fired-alerts table the same. Not widened into this card; it belongs to the density sweep.

## Defects met in this run

None. Nothing broke in the application, the tests or the checks, so per CLAUDE.md section 9 nothing was appended to `docs/LEARNINGS.md`. One mistake was caught in review before it ran: the first draft of the account manager case opened a second browser with `browser.newContext()`, which does not inherit the configured `baseURL`; it was rewritten to sign out and sign in on the same page, the pattern `tests/e2e/support/auth.ts` already provides.

## State at the end

- P3-42 reads `shipped` on this head. The merge follows CLAUDE.md section 3.1: `quality` green on the head sha, `npm run checks:state 284` exit 0, the acceptance above passed in that run, then squash merge with the branch deleted. No migration, so no owner approval is needed before merging.
- After merge, the deployed commit is checked at `https://app.rapidconstruct.md/api/health` and the result goes in the pull request.
- For the next session: the reminders list does not paginate (finding above), which the density sweep should pick up. Nothing else is left open by this card.
