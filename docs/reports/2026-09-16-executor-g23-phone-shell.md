# EXECUTOR report: P3-60, the app shell on a phone (G23 part 1)

Date: 2026-09-16. Role: AUTHOR (card), then EXECUTOR (code). Lane B (BLUE).
Branch: `card/p3-60`, cut from `origin/main` at 1a240b5. No pull request opened (Lane B rule).

## In plain words

The sign-in screen, the menu and the top bar now fit a phone. On a phone the menu is tucked
away behind a button at the top left and slides out when tapped; it closes with its X, by tapping
beside it, with Escape, or by picking a page. On a computer nothing changes: screenshots before
and after are identical.

## Card

- New card **P3-60** on `docs/board/rc-board-phase3.json`, id from `npm run id:free -- P3-60`
  (answered FREE, lane highest P3-59). `plain`, `defaults` (quotes the task's fix and acceptance,
  records G23 part 1), `depends_on: []`, machine-checkable `acceptance`.
- Lifecycle: authored `todo`, flipped `in_flight` when work started, `shipped` in the last commit.

## What changed

| File | Change |
|---|---|
| `app/layout.tsx` | New `export const viewport` with `width: "device-width"`, `initialScale: 1`. Nothing else. |
| `app/globals.css` | `.rc-shell { min-width: 1100px }` now applies only at 768 px and wider. **Outside the task's file list, see below.** |
| `components/layout/Sidebar.tsx` | Under 768 px the `aside` is hidden until opened; open, it is a fixed drawer (248 px, max 85vw) over a dark backdrop, with a close button outside `<nav>`. Closes on the X, the backdrop, Escape, and on navigation; focus goes to the X on open and back to the menu button on close. Nav links are 44 px tall on phones only. Exports `SidebarMenuButton`. Open state is a tiny module-level store shared with the top bar, so no new provider in `app/(app)/layout.tsx`. |
| `components/layout/Topbar.tsx` | Under 768 px: padding 16 px, menu button (44x44, `aria-label` "Deschide meniul", `aria-expanded`) before the title, title may wrap to two lines instead of being cut, the decorative "/ Rapid Construct" and "Depozit central" are hidden, the Ieșire button is 44 px tall. Desktop classes untouched. |
| `components/auth/LoginForm.tsx` | Inputs carry `text-base` (16 px) and the button `min-h-11` (44 px). Both were already exactly those sizes on desktop, measured: input 16 px / 46 px tall, button 44 px. |
| `app/autentificare/page.tsx` | Not changed. It already fits 390 px (measured). |
| `tests/e2e/phone-shell.spec.ts` | New spec, 390x844, three cases (below). |

No wording changed. The only new on-screen strings are the two accessible labels "Deschide meniul"
and "Închide meniul" on the new buttons, Romanian with diacritics.

**No migration was added.**

### The one file outside the task's list, and why

`app/globals.css` pinned `.rc-shell` to `min-width: 1100px`. `app/(app)/layout.tsx` puts that class
on the outer frame, so on a phone the whole frame, top bar included, stays 1100 px wide and scrolls
sideways no matter what the sidebar does. None of the five listed files can change that. GOALS.md
says BLUE owns the shell and GREEN owns `ProductForm.tsx` and G22's files; `globals.css` is neither
GREEN's nor Orange's, so the rule was scoped to `@media (min-width: 768px)` rather than stopping.
Desktop proof below. `components/inventory/ProductForm.tsx`, G22 files and Orange's paths were not
touched.

### Desktop unchanged, proved

The same harness page was screenshotted at 1440x900, 1100x900 and 800x900, plus the sign-in
screen at each width, once with `origin/main`'s versions of the five files and once with this
branch. All six pairs are byte-identical (sha256 prefixes): shell-1440 a3ee02963088d63b,
sign-in-1440 6f63d4d83848151d, shell-1100 3b6d619aac7cecd4, sign-in-1100 9d7f45dc2f24fb25,
shell-800 d373b90c43be2af6, sign-in-800 622b5c3d472b506d. The served page was checked to be
main's code (no `sidebar-open` in the HTML) during the main run.

`git diff --exit-code origin/main -- tests/e2e/auth.spec.ts tests/e2e/crm-landing.spec.ts tests/e2e/button-contrast.spec.ts tests/e2e/favicon.spec.ts tests/e2e/headers.spec.ts tests/e2e/support/auth.ts`
exits 0: no existing spec was touched. The two selectors existing specs read are kept true: the top
bar title is still the first `span` in `header` (the menu button holds only an svg), and there is
still one `aside` whose links are `aside nav a`.

## Acceptance spec: `tests/e2e/phone-shell.spec.ts`

1. Sign-in at 390x844: no sideways scroll, every control at least 44 px, every element inside
   0 to 390 px, both text inputs at least 16 px.
2. Signed in as owner on `/`: `aside` hidden, menu button visible, 44 px, reachable with Tab;
   click opens the drawer, no sideways scroll, every link and button inside the viewport and 44 px;
   closes from the X, from Escape (focus returns to the button), and after tapping "Necesar de
   materiale" (navigates to `/necesar`); then at 1440x900 the sidebar is visible without a click,
   the menu button hidden, and the link labels and hrefs equal the phone drawer's.
3. Top bar on `/` and on `/necesar` (the longest title): no own overflow, every child inside
   390 px, every button 44 px, no document sideways scroll.
4. Existing desktop specs unchanged (diff above).

### What ran where

- **Case 1 ran locally with the real Playwright config and passed:**
  `npx playwright test tests/e2e/phone-shell.spec.ts --grep "1\. ecranul" --project chromium`,
  1 passed.
- `npx playwright test tests/e2e/auth.spec.ts --grep "redirecționează" --project chromium`: 2 passed
  (the two desktop auth cases that need no database).
- **Cases 2 and 3 need a signed-in test account, which needs the local Supabase stack. This
  machine has no Docker and no Supabase CLI, so they run only in CI** (on the pull request the
  later PR-opening task creates). They were not skipped silently: their measurements were run
  locally on a harness instead, below.
- Local harness: a throwaway page under `app/auth/` (public in the proxy) rendering the exact
  markup of `app/(app)/layout.tsx` with a fake user, a dummy gitignored `.env.local`, and a
  Playwright script repeating the spec's measurements. 34 of 35 checks passed; the one miss was
  the harness itself (its address is not a nav route, so the title reads "Rapid Construct", not
  "Tablou de bord"). Harness page and env file deleted, never committed.

## Screenshots, 390x844 (from the local harness)

- Drawer closed: `docs/reports/2026-09-16-executor-g23-phone-shell-drawer-closed-390.png`
- Drawer open: `docs/reports/2026-09-16-executor-g23-phone-shell-drawer-open-390.png`
- Sign-in: `docs/reports/2026-09-16-executor-g23-phone-shell-sign-in-390.png`

The spec also saves `phone-shell-drawer-closed.png` and `phone-shell-drawer-open.png` into its
test output folder when it runs in CI.

## Gates, from the worktree, all exit 0

`npx tsc --noEmit`, `npm run build`, `npm run check:card-ids`, `npm run check:board-edit`,
`npm run check:unique-ids`, `npm run check:open-branch-ids`, `npm run check:no-destructive-migration`,
`npm run check:conflict-residue`, `npm run check:categories`, `npm run check:ledger-rows`,
`npm run check:no-prod-target`, `npm run check:pending-schema-reads`, `npm run check:removal-safety`,
`npm run check:assertion-register`. Board validator exit 0 before every commit. Branch merged with
`origin/main` (already current at 1a240b5 when checked).

## Learnings

Two entries appended to `docs/LEARNINGS.md`: the global 1100 px shell minimum that defeats any
per-component phone fix, and how to check an authenticated layout locally without a database.

## Left for later

- Card id note: `id:free` reads only open pull requests. Until this branch has one, another
  terminal asking for the next P3 id would also be told P3-60. The ready-branch question says so.
- The page content area (`<main>` padding 32 px) and the screens themselves are G23 parts 2 to 4.
- Known iOS detail not in scope: the shell uses `h-screen` (100vh) in `app/(app)/layout.tsx`;
  `h-dvh` would track Safari's moving toolbar. Candidate for the part 4 sweep.
