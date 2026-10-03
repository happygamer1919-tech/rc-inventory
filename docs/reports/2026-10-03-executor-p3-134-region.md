# P3-134 executor report: server functions to Dublin (dub1)

Date: 2026-10-03

## What changed
- New `vercel.json` at the repo root: `regions` is `["dub1"]`. Nothing else in code.
- Board: P3-134 marked shipped in `docs/board/rc-board-phase3.json`, notes record the database region check and the owner's go.

## Why dub1
- The owner said go (q131, 2026-10-03).
- The database host resolves to Amazon eu-west-1 (Ireland), pooler aws-0-eu-west-1. The nearest Vercel region is dub1, not fra1.

## Not done in this run
- Preview x-vercel-id check and the before and after speed numbers (acceptance a and b) need the deploy. They are a follow-up after merge: production `x-vercel-id` should contain `::dub1::`.
- Andre's side was not told: no request or response changes, only latency.

## Local checks
- Board validator: exit 0 on all three boards.
- No migration, no change under app/, components/, lib/ or proxy.ts.
