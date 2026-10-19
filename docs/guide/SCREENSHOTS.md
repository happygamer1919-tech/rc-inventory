# The guide pictures

Card P3-320, PR 2 of the six-PR guide series. Every lesson in `content/guide/` gets one
annotated picture at desktop width (1440 px) and one at phone width (390 px), made by a
program and never by hand. Re-running the program makes every picture again, so a picture
never goes stale after a screen changes.

## How a picture is made

1. `.github/workflows/guide-screenshots.yml` starts the same local Supabase stack the End to
   end block of `quality` starts, on a GitHub runner. Never production: the stack lives on the
   runner, its keys are the published demo keys, and both scripts refuse any address that is
   not `localhost` and run `scripts/assert-not-prod.mjs` first.
2. `scripts/seed-test-accounts.mjs` makes the two test accounts, then `scripts/guide/seed.mjs`
   fills the stack with the INVENTED data in `scripts/guide/fixtures.mjs`: invented companies,
   people, addresses, phones (`+373 00 000 NNN`, a prefix no Moldovan operator uses) and emails
   (`@....example`, a domain reserved by RFC 2606). Fixed ids, no DELETE.
3. The app is built and served on `localhost:3104`, and `scripts/guide/screenshots.mjs` signs
   in, opens each lesson's screen, runs the lesson's `before` actions (they open and fill forms,
   they never press save), finds each `marks` element, draws a box around it, an arrow to it and
   a circle with the step number, all in `--color-rc-orange` from `app/globals.css`, and saves
   `public/guide/<id>-desktop.png` and `public/guide/<id>-mobile.png`.
4. `docs/guide/screenshots.json` records, for every picture: the address, which marks were found,
   the text that was on the screen, and the sha256 of the file. A lesson whose screen could not be
   opened, or on which no mark was found, gets no picture and is listed under `skipped`: its page
   will show "fără imagine".
5. The workflow uploads the pictures as the artifact `guide-screenshots`. They are committed to
   the pull request from there, so every committed picture goes through a normal `quality` run.

To make them again after a screen changes: Actions, `guide-screenshots`, Run workflow (or push a
change under `content/guide/`, `scripts/guide/` or `lib/guide/` on a pull request), download the
artifact, commit `public/guide/` and `docs/guide/screenshots.json`.

## The keys in a lesson's front matter

All optional. A lesson without `screen` has no picture.

| Key | Meaning |
|---|---|
| `screen` | The address, starting with `/`. `{client}`, `{project}` and the other keys in braces are replaced by the id of an invented row (`SHOT_PLACEHOLDERS` in `lib/guide/source.mjs`, ids in `scripts/guide/fixtures.mjs`). |
| `account` | `owner` (default), `account_manager`, or `none` for the sign-in screen. |
| `before` | Actions before the picture, one per line: `click <selector>`, `wait <selector>`, `fill <selector> => <text>`, `select <selector> => <visible label>`. |
| `before_mobile` | Extra actions on the phone only. |
| `sizes` | `[desktop, mobile]` by default. `[mobile]` for a phone-only lesson. |
| `marks` | `"<step number> <selector>"`. Several marks may share a step number. The number must be a step of the lesson. |

Selectors are Playwright selectors: CSS (`[data-testid='client-new']`), `role=button[name='Salvează']`,
and chains with `>>`. Only visible elements count.

`npm run check:guide-source` refuses a malformed key, an unknown brace key, or a mark whose step
number the lesson does not have.

## The privacy check

`docs/guide/real-names.txt` lists names that must never appear: one per line, case and
diacritics ignored, whole words only. `npm run check:guide-privacy` (a step of `quality`, and
`tests/e2e/guide-privacy.spec.ts`) fails when a listed name appears in `scripts/guide/`, in the
`scripts/seed-test-*.mjs` fixtures, in a lesson, or in the text captured with a picture, and when a
phone or email in `scripts/guide/fixtures.mjs` has a shape that could belong to a real person.

To extend the list, add a line and open a pull request. Never paste a whole client list: the file
stays in git for good.
