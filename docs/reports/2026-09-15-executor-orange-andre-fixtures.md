# ORANGE, EXECUTOR, 2026-09-15: validator keys header, two extraction fixtures, six sample links

Owner dispatch received after the second 2026-09-15 ORANGE report. Role EXECUTOR
(ORANGE). **The owner ratified all six deviations of that report as written.
Nothing new in this report is self-ratified.**

**Outcome.**
- **Step 1.** `/Users/ivan/rc-samples/ANDRE-VALIDATOR-KEYS.md` carries the pinning
  header. Mode 600, 147 lines.
- **Step 2.** Two fixture PDFs built under `/Users/ivan/rc-samples/fixtures/`, one
  page each by our own counter. The shipped classifier puts each one on its
  intended arm.
- **Step 3.** Both uploaded to `rc-docs/_samples/andre/` beside the existing four,
  and the write is journalled.
- **Step 4.** Six links signed at `TTL_SECONDS` into
  `/Users/ivan/rc-samples/ANDRE-SAMPLES-2026-09-15.md`, mode 600, 22 lines,
  expiring `2026-09-16T13:16:31.396Z`. All six verified live.
- **Step 5.** Both sha256 added to the committed upload table.

No key, token or signed URL appears here or in any commit.

---

## BOOT

`docs/board/rc-board-phase2.json` at `origin/main` `b9059ee`:
- **Cards:** todo 32, in_flight 0, blocked 2 (P2-08b on andre, P2-14 on client),
  halted 0, shipped 68.
- **Launch gate:** **6/9**.
- **Next eligible card,** by `scripts/poc/card-order.mjs`: **AUT-3**, "Add the
  TRIAGE role to the POC chain". Not worked, because this dispatch names its steps.

Phase 3 board: todo 37, shipped 65, gate 0/9.

In the shared clone `/Users/ivan/rc-inventory`, local `main` sits at `af9f592`
(#222), far behind `origin/main`. Every read came from `origin/main`. The work
happened in a sibling worktree, `/Users/ivan/rc-inv-andre-fx`, on
`board/orange-20260915-andre-fixtures`.

## STEP 1. The validator keys header

A block under the title now says three things:
- the key lists are read from the validator at commit
  `b9059ee95b20ec307e63fd79cebf362814bbf537`
- every line number is pinned to that commit, and line numbers drift as `route.ts`
  (and `lib/data/extraction-types.ts`) change
- the key names, not the line numbers, are the contract-relevant content

Details:
- Path: `/Users/ivan/rc-samples/ANDRE-VALIDATOR-KEYS.md`
- Mode: `-rw-------`, re-asserted after the edit
- Lines: **147**

## STEP 2. The two fixtures

| file | pages, our counter | pdfinfo | intended arm | shipped classifier on the printed figures |
|---|---|---|---|---|
| `factura-nordavex-0002718.pdf` | **1** | 1 | **sums**: sound printed header, line sum outside the 0.07 tolerance | `reconciliation_failed`, arm `line_sum_missed` |
| `confirmare-comanda-lumicast-5531.pdf` | **1** | 1 | **lines**: one line with no line total, header otherwise sound | `unreadable_document`, arm `line_total_missing` |

"Our counter" is `countPages` from `lib/data/page-count.mjs`, the one the upload
path calls.

**How each arm was proved, without trusting the generator.**
1. The generator asserts both arms in integer cents before it writes a byte, and
   writes nothing on any failure.
2. A separate verifier reads the PRINTED document back with `pdftotext -layout`. It
   rebuilds the row table and the three header figures from that text, then checks:
   rows numbered in order, the header sum and VAT checks both pass, and "fără TVA"
   is printed. For the sums arm it also requires no missing line total and a line
   sum outside tolerance of both totals. For the lines arm it requires exactly one
   missing line total. Both files PASS, exit 0.
3. **Negative control:** each file checked against the OTHER arm fails, exit 1
   both ways.
4. The figures parsed from the text went to the shipped `headerConsistency` and
   `classifyScan` in `lib/data/reconciliation.ts`, with `prices_include_vat` false
   as each document prints it. The results are in the table above, and both header
   checks returned `passed` on both files.

**What the documents are.**
- Digital source, not scans: vector text through CoreGraphics and CoreText, fonts
  embedded (Helvetica subsets), A4, unencrypted, Romanian, with diacritics that
  survive text extraction.
- Same shape as the existing four: supplier block, document title and number,
  buyer block, a numbered table (name, code, unit, quantity, unit price, value),
  total without VAT, VAT 20%, total, notes, bank footer. One is an invoice in the
  style of the two existing invoices, the other an order confirmation in the style
  of the existing one. Currency MDL.
- Units only from the fixed set, as `lib/data/units.ts` labels them: `sac`, `m3`,
  `m2`, `t`, `rolă`, `ml`, `buc`, `l`, `kg`. `m2` and `m3` are printed without
  superscript, the way the existing four print them.
- **No real supplier identity**, checked five ways:
  - both supplier names are invented, and a web search found no Moldovan company
    under either
  - both `.md` domains answer NXDOMAIN
  - both supplier IDNOs FAIL the 7-3-1 control digit
  - both IBANs FAIL mod 97, so neither identifier can be registered
  - the generator refuses to write a file whose IDNO or IBAN passes its check. That
    guard fired once: the first IDNO invented for the invoice passed the control
    digit, so it was changed.
- **This report contains no line count and no total for either document**, for
  the reason the EXT-08 report gives for the first four.

**One property of the lines arm to know when reading his result.** The line with no
value still prints its quantity and unit price. A pipeline that multiplies them
and fills in the value will reconcile cleanly and never reach the arm. So a pass
on that document with no refusal means the extractor wrote a figure the page does
not carry.

The generator and the verifier are kept outside the repository, next to the
fixtures, at `/Users/ivan/rc-samples/fixtures/src/`. The PDFs cannot be rebuilt
byte for byte from them because the creation date is embedded, so **the sha256 is
the identity, not the generator.**

## STEP 3. Upload and journal

Pre-check, read only: the prefix held exactly the four existing objects, so neither
new name was taken.

The upload was **run A** of the committed script
`scripts/ext/serve-sample-documents.mjs` (sha256
`1b840b65ebd7b96f5b92807e383f7aaa65f09c44a771ef0333ae0d14fe5817ab` at `b9059ee`),
with `RC_SAMPLES_DIR` holding only the two fixtures, 2026-09-15T13:16:21Z to
13:16:31Z, exit 0:

| file | bytes | sha256 | object |
|---|---|---|---|
| `confirmare-comanda-lumicast-5531.pdf` | 36958 | `056eabac3542976ff9472375d053fd3ff96893ea48fe71c551e10800652954c5` | `_samples/andre/confirmare-comanda-lumicast-5531.pdf` |
| `factura-nordavex-0002718.pdf` | 37525 | `a0c1a77602add5072b85e53d743dfa0086c5e8eaf077d98c1494391ec5aee3f1` | `_samples/andre/factura-nordavex-0002718.pdf` |

Journalled in `docs/PRODUCTION-WRITES.md`, row 2026-09-15, which names both
objects, both runs and both probe objects.

## STEP 4. Six links at TTL_SECONDS

**Run B** used the same script with `--capture-only` over all six, 2026-09-15T13:16:31Z
to 13:16:40Z, exit 0. `--capture-only` uploads nothing and signs every file at
`TTL_SECONDS`, which is 86400 seconds per R-096.

- Path: `/Users/ivan/rc-samples/ANDRE-SAMPLES-2026-09-15.md`
- Mode: `-rw-------`
- Lines: **22**
- Expiry: **`2026-09-16T13:16:31.396Z`**

Checked afterwards, reads only, no link printed:
- prefix `_samples/andre`: 6 objects, 0 probe objects left
- both new objects downloaded back: sha256 equal to local, 2 of 2
- all six links through `/api/documents/`: HTTP 200, `application/pdf`, body
  sha256 equal to local, **6 of 6**

Both runs also re-captured the failure contract through the route, and it is
unchanged: expired `400`, invalid `401`, missing `404`, no token `401`.

The script prints the links to stdout. Both runs therefore sent stdout to a mode
600 file inside a mode 700 scratch directory, never to the terminal. The links
were copied into the file above, and the raw captures were replaced by redacted
copies (swept: 0 token values).

## STEP 5. sha256 in the committed upload table

| file | sha256 |
|---|---|
| `factura-nordavex-0002718.pdf` | `a0c1a77602add5072b85e53d743dfa0086c5e8eaf077d98c1494391ec5aee3f1` |
| `confirmare-comanda-lumicast-5531.pdf` | `056eabac3542976ff9472375d053fd3ff96893ea48fe71c551e10800652954c5` |

Both are now rows in the section 7 table of
`docs/reports/2026-09-02-executor-ext-08-sample-documents.md`, where the four
existing sha256 are committed. A dated note under the table says the two rows came
from this dispatch and are not EXT-08's.

## DEVIATIONS, for ratification. None is self-ratified.

1. **Six links were signed at the 24 hour TTL, but R-096 scopes that TTL to "the
   four permanent test documents only".** The dispatch said "per R-096", while the
   ruling, the script's header comment and `docs/contracts/extraction-v2.md` all
   still say four. I followed the dispatch and did not amend the ruling or those
   files. **Recommendation:** a one-line ruling amendment widening R-096 to the
   fixtures under `_samples/andre`.
2. **The script ran twice, not once.** A single run over all six would have
   re-uploaded the four existing objects with `upsert`, a write the dispatch did
   not name. The costs: two probe objects written and deleted instead of one, and
   two extra 24 hour links. Run A minted them for the new fixtures and run B
   superseded them. They were never shown and are not kept anywhere.
3. **The fixtures' page counts are now in a committed report in a PUBLIC
   repository.** The EXT-08 report withheld page counts for the first four. The
   dispatch asked for these, and since EXT-28 every document we send carries our
   page count, so it tells the counterparty nothing he will not receive anyway.
   Totals and line counts stay withheld, though a reader can infer the sums arm's
   line count from its 0.07 tolerance and the published formula.
4. **The buyer block is copied from the existing samples**: "RAPID CONSTRUCT SRL
   IDNO 1019600038221, str. Ion Creangă 62". I could not verify whether that IDNO
   and address are the client's real ones. They add nothing that was not already in
   the set R-096 describes as containing no client data. If they are real, that
   description was already wrong about all four.
5. **A past report was edited.** The committed upload table lives in the 2026-09-02
   EXT-08 report, so the rows were added there with a dated note. The section
   heading "The four documents" was left as written.
6. **No card.** The dispatch rides on `board/orange-20260915-andre-fixtures` with
   no board edit, as the 2026-09-14 closeout did.
7. **I could not find the second 2026-09-15 ORANGE report, the one whose six
   deviations were ratified, committed anywhere.** It is not on `origin/main`, on
   any remote branch or in any worktree, yet section 9b makes a committed report
   the original. The ratification is recorded here, but the report it ratifies is
   not in the repository.
8. **The PDF metadata differs from the first four.** They name ReportLab as the
   producer; these name `macOS ... Quartz PDFContext`. This is not a real identity.
   It is noted so nobody mistakes it for evidence of a different source.

## STATE AT THE END

- **Pull request #296** carries the journal row, the upload table rows and this
  report, from `board/orange-20260915-andre-fixtures`.
- Nothing is blocked and nothing was sent to the counterparty. Forwarding the
  links file is the owner's act.
- The links expire `2026-09-16T13:16:31.396Z`.
- Defects found in the repository: none, so no `docs/LEARNINGS.md` entry. The only
  defect was in this session's own generator (an invented IDNO that passed its
  check), and the generator's guard caught it before any file was written.
