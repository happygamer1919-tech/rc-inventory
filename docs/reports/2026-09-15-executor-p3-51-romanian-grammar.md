# EXECUTOR report: P3-51, Romanian counts agree with their number and two builder notes are rewritten

**Role:** EXECUTOR (lane B, BLUE, the second worker). **Date:** 2026-09-15 UTC. **Branch:** `card/p3-51`, cut from `origin/main` at `4b65ced`. **Pull request:** none, by instruction. Lane B builds and pushes; a later main-line task opens the pull request, so the factory keeps one open pull request at a time.

## Boot status, phase 2 board

- Cards by status: 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted.
- Launch gate: 6/9 (`readiness_passed` 6 of `denominator` 9; G1, G2, G3, G5, G6 and G8 at pass, G4, G7 and G9 at fail).
- Next eligible card: AUT-3. This run was dispatched to P3-51 on the phase 3 board (RULE-05 defect: section 1 names only phase 2). P3-51 was eligible there: todo, not blocked, no dependencies.

## Cards touched

| Card | Status at end |
|---|---|
| P3-51 | todo on the board, work built and pushed. The board is left untouched by instruction; the pull request that carries this branch flips it. |

## What changed for Rapid Construct

Product counts now read as normal Romanian (1 produs, 5 produse, 20 de produse) on the dashboard, in Inventar and in Memento stoc. The Contacte card on a client explains itself in a sentence that makes sense. Necesar no longer says "all 0 sites are covered". Two notes written for the people building the system are replaced with text for the person using the screen.

## What changed, file by file

- `app/(app)/page.tsx` line 67: the first StatCard's `sub` is `plural(d.productCount, "produs", "produse")` plus "în catalog".
- `components/inventory/InventoryScreen.tsx` lines 206 to 209: unfiltered `plural(rows.length, "produs", "produse")`; filtered, the noun agrees with the number shown first, then "din" and the total: "1 produs din 42".
- `app/(app)/memento/page.tsx` line 65: `plural(products.length, "produs", "produse")`.
- `components/clients/ClientTabs.tsx` line 113 (the card said 109; the file had grown): hint "Un client poate avea mai multe persoane de contact."
- `components/inventory/ProcurementScreen.tsx` lines 124 to 137: with no excluded project, zero included sites show "Niciun șantier activ nu are încă un deviz acceptat."; one or more show the count through `plural` ("1 șantier activ are deviz acceptat și este cuprins în cifrele de mai jos.", "3 șantiere active au deviz acceptat și sunt cuprinse ...", "20 de șantiere active ...").
- `components/orders/OrdersScreen.tsx` lines 200 to 201: "Starea se schimbă pentru toată comanda odată; o recepție sau o expediere parțială nu se poate înregistra."
- `components/orders/UploadOrderScreen.tsx` lines 89 to 91, `data-testid="upload-explainer"`: "Documentul atașat rămâne salvat lângă comandă. Dacă vrei ca sistemul să citească documentul în locul tău, folosește panoul de mai sus. Aici completezi comanda de mână, ca la adăugarea manuală." The link to `/adauga-manual` is kept. The panel above is `ExtractionReviewPanel`, rendered first by `app/(app)/incarca-comanda/page.tsx`, so "mai sus" is true.
- `tests/e2e/copy-fixes.spec.ts`: new, eight cases (below).

Every count goes through the existing `plural` in `lib/data/format.ts`; no second plural function. **No migration.** No new dependency. No layout or data change. The board is not edited.

## Left alone, on purpose

- The Necesar branch with excluded projects ("N proiecte fără deviz acceptat") still uses its own one/many ternary and does not add "de" from 20 up. The card names only the all-included sentence, so this is a candidate for a new card, not an extra edit here.
- Every file the queued Lane B branches touch (`card/p3-52`, `card/p3-53`, `card/p3-54`), Orange's extraction paths, and `docs/board/*.json`. None of this card's strings live in those files.
- The word `lead=` (PageHeader prop), untouched.

## Acceptance, clause by clause

| Clause | How it is met |
|---|---|
| new spec, fails first | red arm `474bcdf` carries the spec alone on the old tree; see "Red first" below |
| (1) count of 1 | case 1: creates `TEST-P351-<run>`, searches it, counter contains "1 produs" and not "1 produse" |
| (2) counts above 1 | case 2 Inventar unfiltered against `product-row` count; case 3 dashboard line against its own number; case 4 Memento against `threshold-row` count; all by the rule written out in the spec, not imported from the app |
| (3) Contacte | case 5: new client, panel does not contain the old sentence; the hint under the card title is non-empty and reads the new sentence |
| (4) Necesar | case 6: body contains neither old string; when nothing is excluded, the sentence is checked by the rule too |
| (5) /comenzi | case 7: body contains neither the old footnote nor "fazei" |
| (6) upload explainer | case 8: neither old string; the "adăugarea manuală" link still points at `/adauga-manual` |
| `dashboard.spec.ts` unmodified | `git diff --exit-code origin/main -- tests/e2e/dashboard.spec.ts` exits 0 |
| grep for a hard-coded plural exits 1 | `grep -cE "produse în catalog\|[}] produse" ...` prints 0 for all three files |
| `npx tsc --noEmit` exits 0 | exit 0, locally |
| pull request states no migration | for the pull request task: this card adds no migration |

## Red first, and what is left for CI

This machine has no Docker and no Supabase CLI, so the spec cannot sign in here and was not run locally. What was proved locally: every string the spec rejects exists verbatim on `origin/main` (`git grep`), and none exists on this branch.

```
origin/main:app/(app)/memento/page.tsx:65:              {products.length} produse
origin/main:app/(app)/page.tsx:66:          sub={`${formatNumber(d.productCount)} produse în catalog`}
origin/main:components/clients/ClientTabs.tsx:113:              hint="Un client este mai multe numere de telefon"
origin/main:components/inventory/InventoryScreen.tsx:207:              ? `${rows.length} produse`
origin/main:components/inventory/InventoryScreen.tsx:208:              : `${rows.length} din ${visible.length} produse`}
origin/main:components/inventory/ProcurementScreen.tsx:126:                Toate cele {formatNumber(includedProjects)} șantiere vii au deviz acceptat și sunt
origin/main:components/orders/OrdersScreen.tsx:201:        în afara domeniului fazei 2.
origin/main:components/orders/UploadOrderScreen.tsx:89:            Documentul se salvează real, în depozitul privat, și rămâne atașat comenzii. Citirea
origin/main:components/orders/UploadOrderScreen.tsx:91:            după ce verifici ce s-a extras. Aici comanda se tastează întâi, exact ca la{" "}
```

Expected in CI on the red arm `474bcdf`, stated honestly case by case:

- **Red for certain:** case 1 (old text "1 din N produse" has no "1 produs"), case 5 (old Contacte sentence), case 7 (old footnote and "fazei"), case 8 (old explainer).
- **Red only at some counts:** cases 2, 3 and 4. The old text "N produse" already agrees with the rule from 2 to 19, so they fail on the old tree only when the stack holds 1 or 20 and more products. The grep above is what proves no plural is left hard-coded.
- **Not red in CI:** case 6. `scripts/seed-test-procurement.mjs` seeds projects with no accepted estimate, so the old "Toate cele N șantiere" branch never renders on the CI stack. The acceptance line allows this ("at whatever count the local stack holds").

**Left for CI:** `npx playwright test tests/e2e/copy-fixes.spec.ts tests/e2e/dashboard.spec.ts` against the local Supabase stack, red arm then this branch. The pull request task should push the spec alone first for the red run, or record why not.

## Local commands

Run twice. First on `9ea7301` (main still `4b65ced`). Then again after the sync before push, because P3-54 (#295) merged meanwhile: `git merge origin/main` at `794629b` merged cleanly with no conflict, as merge commit `f4d8e62`, and every command below was re-run on that merged tree with the same results. Each exit 0: `npx tsc --noEmit`, `npm run build`, the board validator on all three boards, `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`, `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`, `check:board-clock`.

**One exit 1, expected: `check:board-edit` REFUSES**, "P3-51: status is todo at the merge base AND at the head". This lane was told not to edit the board, and the check only accepts shipped, blocked or halted, so nothing honest can satisfy it before the pull request exists. P3-53 and P3-54 hit the same refusal, and PURPLE ruled (factory answer q017) that the pull request task flips the card. The Playwright suite and the applier proofs run only in CI.

## LEARNINGS

`docs/LEARNINGS.md` untouched: nothing in the repository broke while working this card.

## Pull request run, 2026-09-15

A second EXECUTOR run opened the pull request once #301 (P3-52) had merged and the one open pull request slot was free.

- `gh pr list --state open --author @me` was empty before opening.
- `git merge origin/main` at `2ac5905` merged cleanly, no conflict. `git diff --exit-code origin/main -- tests/e2e/dashboard.spec.ts` exit 0 after the merge.
- On the merged tree, each exit 0: `npx tsc --noEmit`, `npm run build`, the board validator on all three boards, `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`, `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`. The hard-coded plural grep prints 0 for all three files.
- Pull request #302 opened. P3-51 flipped to `shipped` on `docs/board/rc-board-phase3.json` with evidence naming #302 and `tests/e2e/copy-fixes.spec.ts`; `last_checkpoint`, `evidence.at` and `as_of` set to 2026-09-15T19:25:40Z, read from the clock. `check:board-edit` and `check:board-clock` re-run after the flip.
- No CI red run, for the reason in "Red first" above: spec and fix were both on the pushed branch before a pull request existed, and a spec-alone head needs a rewritten history or a second pull request.

## Merge

Not merged by this terminal. Real client data is in production; the owner approves and POC merges.
