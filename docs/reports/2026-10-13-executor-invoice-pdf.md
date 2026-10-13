# P3-272: invoice PDF download

Role EXECUTOR. Date 2026-10-13. Card P3-272 (phase 3 board). Branch `card/p3-272`.

## What changed for Rapid Construct

An issued, paid or cancelled invoice has a "Descarcă PDF" button. It downloads a clean
one-page Romanian invoice with the Rapid Construct logo, the seller and buyer blocks, the
lines, Subtotal, TVA and Total de plată in lei with two decimals, and the note if there is
one. A cancelled invoice carries a large "ANULATĂ" mark and the cancel reason. A draft has
no button, because it has no number yet. Owner decision: Max, 2026-10-13, in chat: "yes
add the PDF button, romanian only, with logo". Print, email and e-Factura stay out.

## What was built

- `app/api/facturare/[id]/pdf/route.ts`: GET, `application/pdf`,
  `Content-Disposition: attachment; filename="<invoice number>.pdf"`. Reads through
  `getInvoice`, so it has the same session and RLS as the invoice screen; `proxy.ts` already
  sends a request without a session to the login page. Draft answers 409 JSON, missing 404,
  schema not applied 503, render failure 500, all JSON.
- `lib/pdf/invoice-pdf.ts`: pdfkit renderer (pure JavaScript, no headless browser). Empty
  seller fields are left out. Money uses `formatNumberExact` and `formatMoneyExact`; the
  percent uses `formatRate`, moved from the invoice screen into `lib/data/format.ts`
  (same output, one function).
- `lib/pdf/fonts/`: DejaVu Sans Condensed regular and bold plus its license text. The
  standard PDF fonts have no ș or ț. All of ă â î ș ț and their capitals were checked in
  both files with fontkit.
- `lib/data/facturare-detail*.ts`: the issuer block now also carries `vatCode`, `phone`
  and `email`, read from the settings row the screen already read.
- `components/facturare/FacturaScreen.tsx`: the button, outside the actions card and not
  part of `invoiceActionsFor`. The header sentence "NICIUN PDF, NICIUN TIPAR, NICIUN EMAIL
  SI NICIO e-FACTURA" is quoted and marked false about PDF under CLAUDE.md 9c, and kept.
- `next.config.ts`: `serverExternalPackages: ["pdfkit"]` and `outputFileTracingIncludes` for
  the route, so the fonts and the logo are in the function bundle. Checked in the build
  output: the route's trace file lists both fonts and the logo.
- `tests/e2e/invoice-pdf.spec.ts`: four cases (see the card).
- `package.json`: `pdfkit` and `@types/pdfkit`.

## Checked locally

- `npx tsc --noEmit`, `npm run build`, the board validator and every `check:*` gate of the
  close-out list exit 0.
- Rendered three sample PDFs (4 lines issued, 4 lines cancelled, 34 lines paid) and read them
  back with pdfjs: one page, two pages for 34 lines with the table header repeated, all text
  inside the margins, diacritics extracted correctly (Țâșnitor, Chișinău, Ștefan, FACTURĂ,
  Cumpărător), the empty bank, VAT code and email lines absent, the ANULATĂ mark and reason
  present on the cancelled one.
- Not run here: the end to end spec (needs the local Supabase stack, runs in CI) and a
  visual look at the page (no PDF renderer on this machine).

## Not done, on purpose

- No migration. No change to states, numbering, VAT logic or `invoiceActionsFor`.
- The card P3-110 text still says "NO PDF"; it is history and was not edited.
- The seller fields are placeholders until Max fills Setări, Date firmă; the PDF prints what
  is there and leaves the rest out.

## Learnings

One entry appended to `docs/LEARNINGS.md` (how to check a PDF on a machine that cannot show one).
