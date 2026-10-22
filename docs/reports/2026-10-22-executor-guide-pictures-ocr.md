# P3-339: guide pictures are read from their pixels

Source: Fable bug check 2026-10-22 17:50Z, finding 7.

## What changed
- `npm run check:guide-ocr` (scripts/poc-free/check-guide-ocr.mjs, rules in lib/guide/ocr.mjs) runs OCR
  (tesseract.js 7, Romanian + English) over every PNG in content/guide-images/.
- A line of docs/guide/real-names.txt found in a picture fails the check (exit 1).
- A capitalised word of four letters or more that is not in the invented data (scripts/guide/fixtures.mjs),
  the lessons, the text captured for that picture, or docs/guide/ocr-allow.txt is a warning: `::warning::`
  lines plus a section in the job summary. It never fails the check, because OCR misreads words.
- Results are cached per picture by sha256 in `.cache/guide-ocr` (git ignored); both workflows keep the
  directory with actions/cache, so an unchanged picture is not read again.
- quality.yml runs the step only when a picture, docs/guide/, lib/guide/ocr or privacy, the OCR script, the
  fixtures or package-lock.json changed (fails open if the base is unknown) and skips drafts.
  guide-screenshots.yml runs it right after the pictures are taken.
- docs/guide/real-names.txt now has a header saying Max and Ivan add real client and supplier names there.

## Run on this machine
- Cold run over the 87 committed pictures: 89 s, check ok, 53 warnings (almost all OCR misreads of short words,
  plus "Administrator", now allowed). Cached run: a second.
- tests/e2e/guide-ocr.spec.ts: 6 cases pass with a minimal Playwright config (no web server here). The last
  runs the real check on login picture: a deny name printed in it ("Autentificare") exits 1, an absent one exits 0.
- Needs network the first time (tesseract language data), as CI has.

## Not done here
- No Docker: the full Playwright suite and build-time jobs run in CI only.
