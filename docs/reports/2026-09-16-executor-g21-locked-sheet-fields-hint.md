# 2026-09-16 executor: G21, Serie and Grosime say why they are locked (P3-61)

Role: AUTHOR (card), then EXECUTOR (code), one pull request, branch `card/p3-61`.

## In plain words

On the new product form, the roofing picker's Serie and Grosime lists stay locked
until the list above them is chosen. That was already so, but nothing said it, so
clicking them looked broken (Max, 2026-09-16: "apas si nu se intampla nimic"). Now a
locked list is greyed out, the pointer shows it cannot be clicked, and a small line
under it says "Alege întâi modelul" or "Alege întâi seria". Choosing the list above
removes the line and the grey. The order itself is unchanged. No database change.

## Boot

- Phase 2 board: 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted; launch gate 0/9.
- Phase 3 board: 79 shipped, 32 todo, 1 blocked, 0 in_flight, 0 halted; launch gate 0/9.
- Lowest eligible card by the sort: AUT-3. This run works the owner-assigned goal G21.
- P3-57, P3-58, P3-59 (G20), P3-60 and P3-64 read `shipped`. No open pull request of ours.

## Card

- `npm run id:free -- P3-61`: FREE, lane highest P3-64. P3-61 authored on
  `docs/board/rc-board-phase3.json` after P3-60, with `plain`, `defaults` (the task's
  fix quoted), `depends_on: ["P3-57"]` and a named acceptance spec.
- Commit order: authored `todo`, then `in_flight`, then built, then `shipped`.

## Correction to the task's premise

The task said the two lists sit inside `Field` from `components/ui/primitives.tsx`
and to use its `hint` prop. `components/inventory/ProductForm.tsx` does not use that
`Field`: it declares its own private `Field` (label and children only, no hint, no
"(opțional)"), and every field on the form uses it. The first `npx tsc --noEmit`
failed with TS2322 on the `hint` prop. Switching to the shared `Field` would print
"(opțional)" beside Serie and Grosime but not beside Model, and drop the bottom
margin, which is the inconsistency the task warned against. So the private `Field`
gained an optional `hint` rendering the same line as the shared one
(`block text-[12px] text-rc-muted mt-1`). `primitives.tsx` (Field, Select, CONTROL)
is untouched. Recorded in the card's defaults (a) and in `docs/LEARNINGS.md`.

## What changed

- `components/inventory/ProductForm.tsx`
  - Serie: `hint="Alege întâi modelul"` while no model; hint omitted once unlocked.
  - Grosime: `hint="Alege întâi seria"` while no series; hint omitted once unlocked.
  - Both selects: `disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-rc-line`
    joined with `fieldClass("sheet")` in one constant, on these two selects only.
    `rc-line` is an existing token in `app/globals.css`.
  - The private `Field` gained the optional `hint` line.
- `tests/e2e/product-sheet-locked-hint.spec.ts`, new, five cases: (1) Serie locked with
  hint, disabled attribute, class and computed opacity 0.5 and cursor not-allowed;
  (2) C-10 unlocks Serie, opacity 1, hint gone, and Fără model locks it again;
  (3) Grosime locked with its hint, with no model and with C-10 but no series;
  (4) Standart Zn unlocks Grosime, hint gone; (5) C-10, Standart Zn, 0,45 mm fills the
  name, saves, and the row read with the local service_role key holds the combination,
  and Model and Categorie carry no locked class.
- `docs/LEARNINGS.md`: one entry, the shadowed `Field`.

## Not changed

Lock order and logic; the shared `Field`, `Select`, `CONTROL`; any other select's
disabled style; Orange's extraction and documents paths. **No migration: no file under
`supabase/migrations/` added or changed.**

## Local proof

- `npx tsc --noEmit` exit 0 (after the private `Field` fix).
- `npm run build` exit 0. The built CSS holds `disabled\:opacity-50:disabled{opacity:.5}`,
  `disabled\:cursor-not-allowed:disabled{cursor:not-allowed}` and
  `disabled\:bg-rc-line:disabled{background-color:var(--color-rc-line)}`.
- A throwaway Playwright probe (no database) loaded the built CSS on a copy of the
  picker markup: locked Serie computed opacity 0.5, cursor not-allowed, background
  rgb(230, 230, 234); unlocked Grosime and Model opacity 1, cursor default, white; the
  locked field holds two spans (label and hint), the unlocked one holds one. The same
  checks the spec makes. Not committed.
- Board validator exit 0 before every commit. `check:card-ids`, `check:board-edit`,
  `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`,
  `check:conflict-residue`, `check:categories`, `check:ledger-rows`,
  `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`,
  `check:assertion-register`: all OK.

## Left for CI

This machine has no Docker and no Supabase CLI, so the end to end suite does not run
here: the new spec and the P3-57, P3-58 and P3-59 specs
(`roofing-product-picker`, `roofing-product-prices`, `product-sheet-edit`) run only in
`quality`. The run id and result are recorded in the pull request and the owner
question, not here, because writing them here would move the head sha.

## Merge

Not merged by this session. Real client data is in production, so no pull request
self-merges. The session files an `OWNER:` approval question in the factory mailbox
once `quality` is green on the head sha and `npm run checks:state` exits 0.
