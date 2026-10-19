# P3-324: the guide as one PDF (guide PR 5 of 6)

## What was done
- `npm run guide:pdf` (`scripts/guide/pdf.mjs`, `lib/guide/pdf.mjs`) prints the whole guide to
  `public/guide/ghid-rapid-construct.pdf`: cover, contents, a page per chapter, a page per lesson
  (title, numbered steps with the exact labels in bold, desktop picture or the "fără imagine" card,
  "Vezi și"), the Întrebări frecvente, page numbers. The PDF is committed (55 pages, about 6 MB).
- Same tool as the invoice PDF (P3-272): pdfkit and the DejaVu Sans Condensed font in `lib/pdf/fonts`,
  so ă, â, î, ș, ț print correctly. No browser, no network.
- Freshness: the PDF carries a SHA-256 of the content files, the desktop pictures, the fonts and the
  generator. `tests/e2e/guide-pdf.spec.ts` recomputes it and fails when the committed PDF differs.
  A date comparison was not used because git gives every file the same time in CI.
- Same source, nothing written twice: no lesson text lives in the generator.

## Checked locally
- `npm run guide:pdf` exits 0; two builds are byte for byte identical (fixed creation date).
- `guide-pdf.spec.ts`: 7 passed (with a minimal config, since the full config needs the database stack).
- The PDF was not looked at page by page on this machine (no PDF viewer or renderer installed).

## Not covered
- The menu entry "Ajutor" (PR 6). Nothing links to the PDF or to /ajutor.
- No download button on the page: the brief asks for a command, not a link.
