# P3-323: guide PR 4 of 6, Intrebari frecvente

Date: 2026-10-19. Role: EXECUTOR. Brief: the in-platform guide (step 4, the FAQ).

## What changed

- `content/guide/faq.md`: one file with front matter, nine entries. Each entry is one line,
  `lesson id | question | answer`, in the same source folder as the lessons.
- `lib/guide/faq.mjs`: reads the file (`loadFaq`) and keeps, per role, the entries whose lesson that
  role can open (`faqForRole`). It imports only `parse.mjs`, so the page does not pull the code
  walker of `source.mjs` into the serverless function (P3-321 learning).
- `lib/guide/source.mjs`: `validateFaq` enforces 7 to 10 entries, a lesson that exists and is used
  once, a question ending in `?`, an answer of at most 45 words, every `**label**` found in the app
  and in the steps of the lesson the entry links to, no em or en dash, no cedilla letters.
- `app/(app)/ajutor/page.tsx`: the "Intrebari frecvente" section below "Ghidul platformei": question,
  answer (labels in bold), and a "Vezi lecția" link of 44 px on a phone.
- `scripts/poc-free/check-guide-source.mjs` runs `validateFaq` too.
- Tests: `tests/e2e/ajutor.spec.ts` (FAQ divergence test with six cases that make it fail, plus the
  page for the Administrator and for the Operator) and `tests/e2e/guide-source.spec.ts` (each FAQ
  rule has a failing case).

## Entries

Walk-in release, release to a project, receiving an order, issuing an invoice, importing clients,
adding a task, uploading a document for automatic reading, finding a product, adding a client.
The Administrator sees 9, the Operator 7 (client import and adding a client are Administrator-only
lessons, so their questions are not shown to the Operator).

## Not done here

The PDF (PR 5) and the menu entry (PR 6). Nothing links to /ajutor yet.

## Checked locally

`npx tsc --noEmit`, `npm run check:guide-source`, the board validator. The browser specs run only in
CI (no Docker or Supabase on this machine).
