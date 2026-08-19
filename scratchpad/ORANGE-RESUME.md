# ORANGE resume state

PHASE 1 COMPLETE. Awaiting the client demo and phase 2 authorization.

Owner review wave closed on 2026-08-19: Ivan walked every screen on
localhost:3000 and confirmed all nine launch gate conditions in one pass. All 13
cards are shipped and the launch gate reads 9/9. Nothing is in flight and
nothing is blocked.

Written at the end of the phase 1 executor run and updated at closure.
Everything below is verified, not assumed.

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

| Card | Gate | Status | Evidence kind |
|---|---|---|---|
| RC-00 | green_self_merge | shipped | journal |
| RC-BOARD-RENDER | green_self_merge | shipped | journal |
| RC-01 | green_self_merge | shipped | journal |
| RC-02 | green_self_merge | shipped | journal |
| RC-03 .. RC-11 | owner_merge | shipped | screenshot |

13 of 13 shipped. The nine owner_merge cards carry `screenshot` evidence, which
the doctrine defines as Ivan on-screen confirmation; each ref still carries the
original commit sha so the code behind the card stays re-verifiable. No card
carries `open_on_purpose` any more.

Launch gate: 9/9. All nine conditions are `pass`, each with screenshot evidence
naming the 2026-08-19 review wave. They were flipped on Ivan's confirmation,
never on ORANGE's, which is what the doctrine requires.

Closure commit: b785719686aeecde4bbe4f476855a2e6420c6dca

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

Nothing is blocked and nothing was abandoned. All 13 cards were executed and all
13 are shipped.

Deliberately not built in phase 1, recorded on the Settings screen and in
docs/RUTA-DEMO.md so the client hears "scheduled for phase 2", not "forgotten":
partial arrivals, partial shipments, multiple warehouses, auth and roles,
persistence across reloads, real alert delivery, editing categories and units,
any FX rate source, and mobile layouts.

## What comes next

The review wave is done, so the next two events are outside this repo:

1. The client demo. Walk `docs/RUTA-DEMO.md`, which carries the exact click
   order and the line to say at each step, in Romanian.
2. Phase 2 authorization. Until that arrives there is no work queued here.

If Ivan raises changes after the client demo, they land as cards in the
`rodica_batch` lane, titled "REVIEW BATCH (IVAN)", and are worked as one wave
rather than one correction at a time.

Phase 2 scope is already written down in two places that agree: the Settings
screen in the app and the closing section of `docs/RUTA-DEMO.md`. Partial
arrivals, partial shipments, multiple warehouses, auth and roles, persistence,
real alert delivery, editing categories and units, an FX rate source, and mobile
layouts.
