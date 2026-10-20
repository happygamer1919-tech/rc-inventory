# P3-328: the guide pictures and PDF need a login (bug check 2026-10-20, finding 4)

## What changed for Rapid Construct
- The guide's screenshots and PDF could be opened by anyone who knew the address, with no account.
  Now both need a login.
- The PDF holds only the lessons of the role asking: an account manager's has 28 lessons (38 pages),
  the owner's all 45 (55 pages). The PDF is printed on request, so there is no old copy to go stale.
- A "Descarcă ghidul (PDF)" link on /ajutor points at the new route.

## How
- `public/guide` moved to `content/guide-images` (87 PNG files). The committed PDF is gone.
- `GET /api/guide/poza/<id>-desktop|mobile` and `GET /api/guide/pdf` (`app/api/guide/`). No extension
  in the address, because the matcher in `proxy.ts` skips `.png` and `.pdf` paths. Each route checks
  the session itself (401 without one). A picture of a lesson the role does not see is 404.
- `lib/guide/pdf.mjs`: `renderGuidePdf(role)` and `lessonIdsForRole(role)`, using `guideForRole`, the
  same function as the pages. `npm run guide:pdf [role]` writes a local copy to `out/` (git-ignored).
- `next.config.ts` ships the pictures, text and fonts with the two routes. The screenshot workflow and
  script commit to `content/guide-images`, and `docs/guide/screenshots.json` paths follow.

## Checked here
- `npx tsc --noEmit`: 0. Printed the PDF for both roles in a script: 55 and 38 pages, 45 and 28
  lessons, same bytes when printed twice, a role with no lessons gets an error.
- The end to end specs (`guide-files`, `guide-pdf`, `ajutor`) need the app and database: left to CI.
