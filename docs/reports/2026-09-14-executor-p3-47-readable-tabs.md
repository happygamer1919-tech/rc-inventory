# EXECUTOR report: P3-47, readable tabs on the client and project pages

**Role:** EXECUTOR. **Date:** 2026-09-14 UTC. **Branch:** `card/p3-47`, cut from `origin/main` at `a4ea08e`. **Pull request:** #288.

## Boot status, phase 2 board

- Cards by status: 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted.
- Launch gate: 6/9.
- Next eligible card: AUT-3. This run was dispatched to P3-47 on the phase 3 board (RULE-05 defect: section 1 names only phase 2). P3-47 was eligible there: todo, not blocked, no dependencies.

## Two runs, one branch

The first run cut the branch, re-read the premises, committed and pushed the red arm (`78f225d`), opened #288, and made the class change in the worktree. A session limit on the operator machine ended it before the change was committed. This run resumed from that state: it read the red run's log, re-read both ancestor chains against the tree, committed the change, and carried the card to the owner's question. Nothing was redone and nothing was force pushed.

## Cards touched

| Card | Status at end |
|---|---|
| P3-47 | shipped (merge held for owner approval at the time of writing) |

## What changed

- `components/clients/ClientTabs.tsx`: the tab row only. Active `text-rc-white`, inactive `text-rc-muted-2 hover:text-rc-white`. `border-rc-orange` kept.
- `components/projects/ProjectTabs.tsx`: the same change on its tab row only.
- `tests/e2e/client-project-tabs.spec.ts`: new, three cases (below).

No migration. No new dependency. No new colour token. No shared tab component.

## Rows checked before changing anything

| Row | Sits on | Decision |
|---|---|---|
| `ClientTabs` tab row | bare `div.mt-5` in `ClientDetailScreen.tsx`, on the `rc-black` body | changed |
| `ProjectTabs` tab row | bare `div.mt-5` in `ProjectDetailScreen.tsx`, on the `rc-black` body | changed |
| `ProjectTabs` Cost material filter (Toate ieșirile, Doar expediate) | inside `<Card>`, white | unchanged |
| `DevizComparisonPanel` version picker | inside `<Card>`, white | unchanged |

## Acceptance, clause by clause

| clause | how it is met |
|---|---|
| new spec, fails first | red on quality run 34872330289, below |
| contrast method stated in the spec | header comment of the spec: computed colour, first non-transparent background walking up to `html`, WCAG 2.1 relative luminance |
| (1) client page, active and every inactive tab at 4.5:1 | case "fișa clientului" |
| (2) project page, the same | case "fișa proiectului" |
| (3) each tab clicked in turn keeps the new active label at 4.5:1 | both cases click every tab and measure the newly active label and the whole row after each click |
| (4) Cost filter inside the white card still `rgb(11, 11, 12)` and at least 4.5:1 | case "filtrul din cardul alb", also asserts the background is `rgb(255, 255, 255)` |
| `npx tsc --noEmit` exits 0 | locally, and in `quality` |
| PR says no migration was added | PR body |

## Red first

Quality run **34872330289** on `78f225d`, the spec alone with no application change, concluded failure at End to end: **2 failed, 222 passed**.

```
client-tabs, fila activa "Contacte": rgb(11, 11, 12) pe rgb(11, 11, 12), contrast 1.00:1
project-tabs, fila activa "Consum": rgb(11, 11, 12) pe rgb(11, 11, 12), contrast 1.00:1
```

The white card filter case passed, as it should: it guards what must not change.

## Green after

The quality run on the implementation head is recorded in PR #288 and in the owner question `q011-approve-p3-47-merge.md`, not on the board, because writing its id into the board would move the head.

## Local commands

From the worktree, each exit 0: `npx tsc --noEmit`, `npm run build`, the board validator on all three boards, `check:card-ids`, `check:board-edit`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`, `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`, `check:board-clock`. The Playwright suite and the applier proofs run only in CI (no Docker, no Supabase CLI on this machine).

## LEARNINGS

`docs/LEARNINGS.md` untouched: nothing in the repository broke. The only interruption was the session limit that ended the first run, which is an operator machine matter and not a repository learning.

## Merge

Not self-merged. Real client data is in production; the owner approves and POC merges.
