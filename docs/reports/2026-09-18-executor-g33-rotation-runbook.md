# G33: the credential rotation runbook, authored

**Date:** 2026-09-18
**Role:** AUTHOR (docs only; filed under `executor` as the goal names the path)
**Card:** P2-13 (its document half only; the card is NOT worked, its status and text are untouched)
**Branch:** `card/g33-rotation-runbook`

## In plain words

Max now has the checklist he will work through on the day the build passwords
are changed. It lists every key to change, every place an old copy might sit,
and every build permission that ends that day, with click-by-click steps for the
Vercel and Supabase dashboards. Nothing was changed on the live system and no key
was touched.

## What changed

1. `docs/RUNBOOK-CREDENTIAL-ROTATION.md`, new. **35 boxes, all `- [ ]`**, zero
   `- [x]`. No credential value anywhere; variable names, places and steps only.
2. `decisions/inbox.md`: ruling **R-207**, "Who is the owner now", a CLAUDE.md
   9c correction. It quotes P2-13's superseded sentence ("nothing reaches the
   live system without Ivan"), keeps it, and records that every "Ivan" in the
   approval steps now reads "Max". It names `scratchpad/auto-merge.sh` as Max's
   own decision as owner. It also says Ivan's terminals keep their GitHub access.
3. `decisions/NEXT-RULING-ID`: R-207 to R-208, in the same commit.
   `npm run id:free -- R-207` exited 0 before it was used.

## Boot status (read before any write)

- Phase 2: 68 shipped, 32 todo, 2 blocked; launch gate 6/9. Next eligible AUT-3.
- Phase 3: 92 shipped, 32 todo, 1 blocked; launch gate 0/9. Next eligible P3-14.
- Phase 1: 13 shipped, closed.

## How each item P2-13 lists maps to a box

| From P2-13 | Box in the runbook |
|---|---|
| APPLY-LOG precondition (R-072, R-095, R-130) | Part 1, written as a re-check on the day, no count stated as fact |
| P3-35 shipped or ruled unreachable (R-095) | Part 1. P3-35 is `todo` today |
| Unshipped card count told to the owner (R-157) | Part 1, a blank to fill on the day. 67 today, given for scale only |
| Test rows cancelled, never deleted | Part 1 |
| `prove:anon-write-refused` becomes unrunnable (R-173) | Part 1 |
| Rotate `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_TOKEN`, `SUPABASE_DB_PASSWORD` | Part 2, must rotate |
| Anon key, `MAKE_CALLBACK_SECRET`, `X-RC-Secret`, `RESEND_API_KEY` | Part 2, one box each for the owner's decision |
| Dev account passwords (R-003, CRIT-10) | Part 2 |
| `RESEND_FROM` on the `send.` subdomain (item e) | Part 2 |
| Real owner account, `owner_reminder_recipients()` (item f) | Part 2 |
| Terminal-held copies: secrets file, `.env.local`, other `.env`, shell history, scratchpad, chats, CLI logins | Part 3, one box per place |
| R-001, R-007, R-047, R-049, R-056, R-059, R-082 | Part 4, one box each |

**Added beyond the card's list, and why:** R-012 (the board-wide secrets read,
granted "until P2-13", which CLAUDE.md 8.7 covers only by the phrase "revoking
this read permission"), R-206 (the Andre sample access, confirmed closed), R-200
(rotation may only start after the Andre close), a box for P2-13's own
`depends_on` cards (P2-08b, GATE-03, MIG-01), and two finish boxes (site works,
file committed ticked).

## Commands run, all exit 0

    node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json
    npm run check:grant-revocation      OK, 7 of 7 declared grants named
    npx tsc --noEmit
    npm run build
    npm run check:card-ids
    npm run check:board-edit            record-only PR, passes by design
    npm run check:unique-ids            207 ruling ids unique, counter R-208
    npm run check:open-branch-ids
    npm run check:no-destructive-migration   0 files, no migration in this PR
    npm run check:conflict-residue
    npm run check:categories
    npm run check:ledger-rows
    npm run check:no-prod-target
    npm run check:pending-schema-reads
    npm run check:removal-safety
    npm run check:assertion-register

## Worth knowing

- `check:pending-schema-reads` reports **9 pending migrations** in the register
  today. The APPLY-LOG box in Part 1 therefore could NOT be ticked today. It is
  written as a re-check on the day, as P2-13 requires.
- Supabase has two key systems (newer "secret" keys and the older
  "service_role" key). The service role box covers both. On the older system,
  rotating also changes the anon key, and the box says so.
- `X-RC-Secret` is a header name. Its value is the Vercel variable
  `MAKE_WEBHOOK_SECRET` (`lib/env-required.ts`), and the box names both.

## Learnings

Nothing broke. `docs/LEARNINGS.md` is left untouched.

## Not done, on purpose

No rotation, no credential read, no board edit, no change to P2-13's status or
text, no application code, no migration.
