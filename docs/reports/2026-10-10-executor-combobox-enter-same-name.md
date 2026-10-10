# P3-219: Enter on a name two clients share

Plain words: in the buyer picker, typing a name that two clients share and pressing Enter used to pick the first one without asking. Now nothing is picked and the list stays open. If the operator moves the highlight with the arrow keys first, Enter picks that row.

## Change
- `components/ui/Combobox.tsx`: new `movedByArrows` state (set by ArrowUp and ArrowDown, cleared on typing and focus). On Enter, when `dontSelectOnMultipleExactMatches` is on, the arrows were not used and `decideCommit` reports several exact matches, Enter returns without picking.
- `tests/e2e/outbound-direct-client.spec.ts`: case "P3-219" with two test clients of the same name.
- `docs/board/rc-board-phase3.json`: card P3-219. `docs/LEARNINGS.md`: one entry.

## Unchanged
Single match, creatable lists, Escape, outside click, mouse clicks and pickers without the flag. `lib/data/combobox-commit.ts` is untouched.

## Not run here
The end to end spec needs the database and runs only in CI.
