# EXECUTOR report: P3-53, white text on orange buttons reaches 4.5:1

**Role:** EXECUTOR (lane B, BLUE, the second worker). **Date:** 2026-09-15 UTC. **Branch:** `card/p3-53`, cut from `origin/main` at `3561430`. **Pull request:** none, by instruction. Lane B builds and pushes; a later main-line task opens the pull request once PR #293 is resolved, so the factory keeps one open pull request at a time.

## Boot status, phase 2 board

- Cards by status: 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted.
- Launch gate: 6/9.
- Next eligible card: AUT-3. This run was dispatched to P3-53 on the phase 3 board (RULE-05 defect: section 1 names only phase 2). P3-53 was eligible there: todo, not blocked, no dependencies.

## Cards touched

| Card | Status at end |
|---|---|
| P3-53 | todo on the board, work built and pushed. The board is left untouched by instruction; the pull request that carries this branch flips it. |

## What changed

- `app/globals.css`: two new tokens beside the other oranges, `--color-rc-orange-button: #c25401` and `--color-rc-orange-button-hover: #a84900`.
- `components/ui/primitives.tsx`: the Button `primary` variant, `bg-rc-orange text-white hover:bg-rc-orange-dark` became `bg-rc-orange-button text-white hover:bg-rc-orange-button-hover`. This is every primary button on every screen.
- `components/layout/Topbar.tsx`: the account initials circle, `bg-rc-orange` became `bg-rc-orange-button`.
- `components/orders/OrderDocumentUpload.tsx` (line 72) and `components/orders/ExtractionReviewPanel.tsx` (line 519, the card said 501; the file had grown): the browser file buttons, `file:bg-rc-orange` and `hover:file:bg-rc-orange-dark` moved to the new tokens. Card P3-49's Romanian file picker has not replaced them on `3561430`, so they were in scope.
- `tests/e2e/button-contrast.spec.ts`: new, five cases (below).

No migration. No new dependency. The board is not edited.

## The colours, measured

WCAG 2.1 relative luminance, white text `#ffffff`:

| Background | Token | Ratio |
|---|---|---|
| `#f47c1f` | `--color-rc-orange` (before) | 2.71:1 |
| `#e27200` | `--color-rc-orange-dark` (hover before) | 3.16:1 |
| `#f06801` | `--color-rc-orange-deep` | 3.14:1 |
| `#c25401` | `--color-rc-orange-button` (new) | **4.60:1** |
| `#a84900` | `--color-rc-orange-button-hover` (new) | **5.80:1** |

## Left alone, on purpose

- `--color-rc-orange` itself: it is also the active sidebar marker, the tab underline, the focus outline and the dashboard activity dots, none of which carry white text.
- The four black-on-orange buttons (`app/error.tsx`, `app/not-found.tsx`, `app/(app)/acces-interzis/page.tsx`, `components/auth/LoginForm.tsx`), 7.26:1, already passing.
- Orange text on `bg-rc-orange-soft` chips, and `disabled:opacity-45` on disabled buttons.
- Every file PR #293 touches, `card/p3-54`'s icon files, Orange's extraction paths, and `docs/board/*.json`.

## Acceptance, clause by clause

| Clause | How it is met |
|---|---|
| new spec, fails first | local harness on the old tree fails 8 of 11 checks (below); the spec itself runs only in CI |
| method stated in the spec | header comment: `getComputedStyle` `color` and `backgroundColor` of the element itself, WCAG 2.1 relative luminance, the formula written out |
| (1) primary Button at 4.5:1 on three screens | one case each: Client nou (`client-new`) on `/clienti`, Proiect nou (`project-new`) on `/proiecte`, Adaugă produs (`product-new`) on `/inventar` |
| (2) the same after `hover()` | same three cases; they wait for the colour transition to finish, assert the background really changed, then assert 4.5:1 |
| (3) same `backgroundColor` on all three | its own case, at rest and under the cursor, plus the ratio, so it also fails on the old tree |
| (4) top bar initials circle at 4.5:1 | its own case, `topbar-avatar` |
| `grep -rn "bg-rc-orange text-white" app components` exits 1 | exit 1, locally |
| `grep -rn "file:bg-rc-orange " app components` exits 1 | exit 1, locally |
| `npx tsc --noEmit` exits 0 | exit 0, locally |
| pull request states colours, ratios, no migration | for the pull request task; the numbers are in the table above |

## Red first and green after, locally

This machine has no database and no test accounts, so the spec cannot sign in here. To prove the measurement locally, a harness outside the repository (`/Users/sm33xy/Projects/rc-inventory-worktrees/p3-53-tools/contrast-harness.mjs`) renders the exact class strings read from `primitives.tsx` and `Topbar.tsx` with the app's own compiled CSS from `npm run build`, in headless Chromium, and measures with the same in-page method as the spec.

Old tree (`3561430`, CSS built before any edit): **8 FAILED**.

```
FAIL  clause 1 rest    rgb(255, 255, 255) on rgb(244, 124, 31)  2.71
FAIL  clause 2 hover   rgb(255, 255, 255) on rgb(226, 114, 0)   3.162
FAIL  clause 3 same background, ratio under 4.5
FAIL  clause 4 avatar  rgb(255, 255, 255) on rgb(244, 124, 31)  2.71
PASS  clause 2 hover changed the background (x3)
```

This branch: **ALL PASS**.

```
PASS  clause 1 rest    rgb(255, 255, 255) on rgb(194, 84, 1)  4.603  (x3)
PASS  clause 2 hover   rgb(255, 255, 255) on rgb(168, 73, 0)  5.804  (x3)
PASS  clause 3 one rest and one hover background across all three
PASS  clause 4 avatar  rgb(255, 255, 255) on rgb(194, 84, 1)  4.603
```

It also showed that Tailwind's `hover:` variant does apply in headless Chromium, so clause 2 measures a real hover and not the resting colour twice.

**Left for CI:** `npx playwright test tests/e2e/button-contrast.spec.ts` against the local Supabase stack, red on the old tree and green on this one. The pull request task should push the spec alone first for the red run, as P3-47 did, or record why not.

## Local commands

From the worktree on `66abd6e`, each exit 0: `npx tsc --noEmit`, `npm run build`, the board validator on all three boards, `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`, `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`, `check:board-clock`.

**One exit 1, expected: `check:board-edit` REFUSES**, "P3-53: status is todo at the merge base AND at the head". This lane was told not to edit the board, and the check only accepts shipped, blocked or halted, so nothing honest can satisfy it before the pull request exists. LB1 hit the same refusal on `card/p3-54`, and PURPLE ruled (factory answer q017) that the pull request task flips the card. The Playwright suite and the applier proofs run only in CI (no Docker, no Supabase CLI on this machine).

## LEARNINGS

`docs/LEARNINGS.md` untouched: nothing in the repository broke while working this card.

## Merge

No pull request opened, nothing merged. Real client data is in production; when the pull request exists, the owner approves and POC merges.
