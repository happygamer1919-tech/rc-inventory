# P3-325: the Ajutor menu entry (guide PR 6 of 6)

## What was done
- `lib/nav.ts`: a new last menu group "Suport" with one entry, "Ajutor", to `/ajutor`, with the
  existing `orders` icon (no new icon name). The side menu and the phone drawer both read NAV, so
  both show it.
- `labelForPath`: the `/ajutor` case now runs before the NAV walk, so the top bar title stays
  "Suport și Ghid" and not "Ajutor".
- `/ajutor` is now in `ALL_ROUTES`, so the header and console sweeps cover it.
- `tests/e2e/ajutor.spec.ts`: the case that said nothing links to /ajutor is replaced by two cases
  (last link of the desktop menu opens /ajutor; same entry in the phone drawer at 390 px).
- Nothing else changed: no database change, no cookie, no read tracking.

## Checked locally
- Board validator exit 0, `npx tsc --noEmit` exit 0.
- Playwright specs need the database stack and run in CI only.

## Waiting on Max
- The PR is a draft. Merging it makes the guide visible to all staff.
