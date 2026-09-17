# P3-67: resync with main and open the pull request (G23 part 4)

Role: EXECUTOR. Date: 2026-09-17 (UTC). Branch: `card/p3-67`.

## In plain words

The phone layout for the last screens (dashboard, Memento stoc, Necesar, CRM landing,
Ieșiri materiale, Setări, the Deviz and Comparație tabs and the 403 screen) was built on
2026-09-16 and waited for part 3 to merge. This run brought the branch up to date with
everything merged since, fixed one small thing the newer work introduced, and opened the
pull request. Nothing changes on a computer. No database change.

## Boot

Phase 2 board: shipped 68, todo 32, blocked 2, in_flight 0, halted 0. Launch gate 6/9.
Next eligible by lowest id: AUT-3. Phase 3 board: shipped 82, todo 32, blocked 1.
P3-67 was already `shipped` on the branch with evidence (commit c563e1d), so no flip was
needed; `last_checkpoint` and `as_of` were bumped with the resync note.

## Resync with main

Branch head before: `0d27d15`. `git merge origin/main` at `450d737` brought in P3-65 (#314),
P3-68 (#315), the rulings PR (#317), P3-69 (#316) and P3-70 (#318). Never a rebase.

- `docs/board/rc-board-phase3.json`: conflict. Rebuilt card by card from both parents with a
  three-way comparison: main added P3-65, P3-68, P3-69 and P3-70; this branch added P3-67; no
  card edited on both sides; only top-level `as_of` differed. Main's board kept whole, P3-67
  inserted after P3-66. Validator exit 0.
- `docs/LEARNINGS.md`: conflict, both entries kept (this branch's, then P3-68 to P3-70's).
- Every other file merged cleanly. This branch's code files and main's changes do not overlap.

## One fix found after the merge

P3-68 added an `Administrează lista` link to the Setări page. Case (f) of
`tests/e2e/phone-remainder.spec.ts` measures every link on that page at 44 px on a phone, and the
link is about 34 px there (`py-1.5`, 13 px text), so the spec would have failed in CI on a file this
branch never edited. The link now takes `PHONE_TAP` from `components/ui/phone.ts` (part 3, on
main), which applies only under 768 px. Desktop unchanged.

The card's acceptance file list gains `app/(app)/setari/page.tsx`. Nothing the acceptance checks
was loosened. The defaults kept that page out only because the price-management goal (G22) was
unmerged and might extend it; it has merged.

Also checked after the merge: main's changes to `components/ui/primitives.tsx`,
`components/ui/DateField.tsx` and `components/projects/ProjectDetailScreen.tsx` are all `max-md`
additions from part 3, and every test id the spec uses still exists in the merged tree.

## Local gates on the merged tree

| Command | Exit |
|---|---|
| `node docs/board/validate-board.mjs` (all three boards) | 0 |
| `npx tsc --noEmit` | 0 |
| `npm run build` | 0 |
| `npm run check:card-ids` | 0 |
| `npm run check:board-edit` | 0 |
| `npm run check:board-clock` | 0 |
| `npm run check:unique-ids` | 0 |
| `npm run check:open-branch-ids` | 0 |
| `npm run check:no-destructive-migration` | 0 (0 migration files) |
| `npm run check:conflict-residue` | 0 |
| `npm run check:categories` | 0 |
| `npm run check:ledger-rows` | 0 |
| `npm run check:no-prod-target` | 0 |
| `npm run check:pending-schema-reads` | 0 |
| `npm run check:removal-safety` | 0 |
| `npm run check:assertion-register` | 0 |
| `git diff --exit-code origin/main -- tests/e2e ':!tests/e2e/phone-remainder.spec.ts'` | 0 |

`git diff --name-only origin/main` lists only files in the corrected acceptance list.

Not run here: the Playwright spec and `check:migrations` need the local Supabase stack or
Docker, which this machine does not have. They run in CI's `quality` job on the pull request.

## No migration

No file under `supabase/migrations/` is added or changed.

## Left for a later task

- The `/setari/tabla` screen (P3-68) on a phone: not measured by this card.
- From the build report: the extraction review panel (Orange's track), `ProductForm.tsx`, the 500
  and sign-in screens, and replacing this card's local phone constants with `components/ui/phone.ts`.

## Merge

Not merged by this run. Real client data is in production, so the pull request is left open
and green for the owner's approval.
