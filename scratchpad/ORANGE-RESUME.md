# ORANGE resume state

Written at the end of the phase 1 executor run. Everything below is verified,
not assumed.

## Exact state

- Repo: `/Users/ivan/rc-inventory`
- Branch: `board/rc-board-system` (HEAD). `main` does not exist and was never created.
- No remote, no push, no CI. All commits are local.
- Working tree: clean.
- Last commit: see `git log -1` (the RC-11 board checkpoint).
- Board: `docs/board/rc-board.json`, 13 cards, validator exits 0.
- Artifact (live, updated after every board change):
  https://claude.ai/code/artifact/e346cb5b-cb39-42ce-aa14-821ceb53e4ce

## Cards

| Card | Gate | Status |
|---|---|---|
| RC-00 | green_self_merge | shipped |
| RC-BOARD-RENDER | green_self_merge | shipped |
| RC-01 | green_self_merge | shipped |
| RC-02 | green_self_merge | shipped |
| RC-03 .. RC-11 | owner_merge | in_flight, evidence set, open_on_purpose set |

Launch gate: 0/9. Every condition is still `fail` with `evidence: null`, by
design. Gate conditions flip only on Ivan's confirmation, never on ORANGE's.

## How to run

    cd /Users/ivan/rc-inventory
    npm run dev          # http://localhost:3000

`npm run build` also passes. Node v22.22.3, Next.js 16.3.1, React 19.2.8,
Tailwind v4.3.3, TypeScript 7.0.2.

## Things worth knowing before the next session

- The dev server may still be running in the background from this session.
  `lsof -nP -iTCP:3000 -sTCP:LISTEN` will show it. Kill it before starting a new one.
- The app keeps state in memory only (`lib/store.tsx`). A page reload resets
  everything to the RC-02 snapshot. This is deliberate phase 1 behaviour, not a bug.
- Full-page navigation resets that state; in-app navigation preserves it. When
  demonstrating, move through the left nav rather than typing URLs.
- `scratchpad/board-set.mjs` is the helper used to update a card on the board.
  Usage: `node scratchpad/board-set.mjs <cardId> ship|inflight <sha> ["open_on_purpose"]`.
  Always run the validator and re-render + republish the artifact after using it.
- The renderer needs four files copied from the OsteoJP repo. `board.css` is a
  hard dependency that was NOT on the original copy list; do not drop it.
- Native `<select>` elements do not respond to synthetic key events under browser
  automation. Drive them through their React change handler instead if scripting.

## Deferred, nothing blocked

Nothing is blocked and nothing was abandoned. All 13 cards were executed.

Deliberately not built in phase 1, recorded on the Settings screen and in
docs/RUTA-DEMO.md so the client hears "scheduled for phase 2", not "forgotten":
partial arrivals, partial shipments, multiple warehouses, auth and roles,
persistence across reloads, real alert delivery, editing categories and units,
any FX rate source, and mobile layouts.

One item for Ivan rather than for ORANGE: RC-03 through RC-11 are complete but
cannot close without his on-screen confirmation. That review wave is the next
action. His change requests belong in the `rodica_batch` lane, titled
"REVIEW BATCH (IVAN)", and are worked as one pass rather than one at a time.
