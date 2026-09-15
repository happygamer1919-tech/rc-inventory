# EXECUTOR report: P3-54, the browser tab icon

**Role:** EXECUTOR, second worker (BLUE, lane B) of the factory on Max's machine.
**Run date (UTC):** 2026-09-15. **Branch:** `card/p3-54`, cut from origin/main `3561430`.

## In plain words

The system's browser tab showed a blank page symbol because the site had no icon. It now
has the Rapid Construct roof, taken from the company logo file, so the tab is easy to find
among other tabs. Nothing else on screen changes, and no database change is involved.

## Card touched

- **P3-54**, status left `todo` on purpose. This lane builds and pushes only: no pull
  request, no board edit. The task that opens the pull request flips the card there.

## What changed

- `app/favicon.ico`: 16, 32 and 48 pixel images (PNG inside ICO).
- `app/icon.png`: 180 by 180 pixels, transparent background.
- `tests/e2e/favicon.spec.ts`: new, three cases, per the card's acceptance.
- `docs/LEARNINGS.md`: two entries appended.
- Root layout metadata, `proxy.ts`, `next.config.ts`, security headers and
  `tests/e2e/headers.spec.ts`: unchanged.
- **No migration was added.**

## How the icon was made, and why it is not a new mark

Source: `public/brand/rapid-construct-logo.png` (752 by 331). The orange roof outline was
measured at x 287 to 723, y 8 to 131, and the crop window x 280 to 731, y 2 to 138 holds
zero dark (text) pixels. Per pixel, coverage was read from the file itself as
`(255 - blue) / (255 - 61)`, which keeps the logo's own anti-aliased edges as transparency.
The colour is the mean of the roof's fully covered pixels, rgb(218, 113, 31). The mark was
centred on a transparent square with a 4 percent margin and scaled with lanczos3.

Strokes in the source are about 7 pixels on a 443 pixel wide mark, which would be under half
a pixel at 16. They were dilated with a round kernel only as far as each size needs:

| size | dilation radius (source px) | stroke in output |
|---|---|---|
| 16 | 23.1 | 1.6 px |
| 32 | 14.1 | 2.2 px |
| 48 | 10.1 | 2.6 px |
| 180 | 0 | 2.6 px, original stroke |

Judged by eye on upscaled previews: at 180 and 48 the two roofs and the chimney are all
clear; at 32 the roof, the chimney and the second roof line are recognisable; at 16 the roof
shape reads. The card's stop condition (unrecognisable at 32) did not apply.

Tools: `sharp` already in `node_modules` for the crop and scale, and a 40 line Node packer
for the ICO container, because ImageMagick was not allowed in this headless run. Both
scripts are kept outside the repository at
`/Users/sm33xy/Projects/rc-inventory-worktrees/p3-54-tools/` (`make-icons.mjs`,
`pack-ico.mjs`). No npm package was added.

## Red first, then green (local, placeholder environment)

This machine has no Docker, no Supabase CLI and no test accounts. A gitignored `.env.local`
in the worktree named `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with
placeholder local values (a local address with nothing running, no key). No production
access of any kind.

Before, `next start` on a build of origin/main `3561430`:

    BASELINE /favicon.ico status=404 type=text/html; charset=utf-8 location=null
    BASELINE /autentificare status=200 icon links=0

After, `next start` on a build with the two icon files:

    AFTER /favicon.ico status=200 type=image/x-icon location=null
    AFTER /autentificare status=200 icon links=2
      <link rel="icon" href="/favicon.ico?favicon.1ahvxugt8aeyi.ico" sizes="48x48" type="image/x-icon"/>
      -> status=200 type=image/x-icon location=null
      <link rel="icon" href="/icon.png?icon.3s34kjun75-6z.png" sizes="180x180" type="image/png"/>
      -> status=200 type=image/png location=null

A first baseline attempt without `.env.local` answered 500 for `/favicon.ico` because the
server refuses to boot without those names; that was discarded as a red for the wrong reason
(LEARNINGS entry).

Playwright, on the real dev server, cases 1 and 2:

    npx playwright test tests/e2e/favicon.spec.ts --grep-invert "tabloul de bord"
    ✓ 1 Iconita aplicatiei › 1. /favicon.ico raspunde cu o imagine unui vizitator fara sesiune
    ✓ 2 Iconita aplicatiei › 2. pagina de autentificare anunta o iconita care se incarca
    2 passed (9.8s), exit 0

The spec file was committed alone first (`9692c9f`), the icons after it (`4835be7`).

## Local gates, from the worktree

| command | result |
|---|---|
| `node docs/board/validate-board.mjs` (3 boards) | exit 0, 0 violations each |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0, `/icon.png` in the route table |
| `npm run check:card-ids` | exit 0 |
| `npm run check:board-edit` | **exit 1, REFUSED: P3-54 `todo` at base and head** |
| `npm run check:unique-ids` | exit 0 |
| `npm run check:open-branch-ids` | exit 0 |
| `npm run check:no-destructive-migration` | exit 0, 0 files |
| `npm run check:conflict-residue` | exit 0 |
| `npm run check:categories` | exit 0 |
| `npm run check:ledger-rows` | exit 0 |
| `npm run check:no-prod-target` | exit 0 |
| `npm run check:pending-schema-reads` | exit 0 |
| `npm run check:removal-safety` | exit 0 |
| `npm run check:assertion-register` | exit 0 |
| `git diff --exit-code origin/main -- tests/e2e/headers.spec.ts` | exit 0 |
| `test -f app/favicon.ico` | exit 0 |

The one refusal is expected in this lane: the brief forbids the board edit, and
`check:board-edit` requires it. It is not waived; it moves to the pull request.

## Left for CI and for the task that opens the pull request

1. Flip P3-54 on `docs/board/rc-board-phase3.json` in that pull request (status, evidence,
   `last_checkpoint` from `date -u`, notes, `as_of`), then `check:board-edit` and
   `check:board-clock` locally.
2. Case 3 of `favicon.spec.ts` (dashboard signed in) and all of `headers.spec.ts` need the
   local Supabase stack and test accounts: CI only.
3. State in the pull request body, in one line, that no migration was added.

## Defects found

Two, both in `docs/LEARNINGS.md`: the 500 boot refusal masquerading as a red, and the
build-only lane's expected `check:board-edit` refusal.
