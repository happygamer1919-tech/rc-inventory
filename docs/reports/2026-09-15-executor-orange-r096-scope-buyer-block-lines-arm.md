# ORANGE, EXECUTOR, 2026-09-15: R-096 covers every sample document, where the buyer block came from, and where two wrong-line payloads land

Owner dispatch received after `docs/reports/2026-09-15-executor-orange-andre-fixtures.md`.
Role EXECUTOR (ORANGE). **Ratified by the owner: deviations 2, 3, 5, 6 and 8 of
that report. Refused: deviation 1, fixed here in step 1. Deviation 4 is answered
in step 2. Deviation 7 is noted: that earlier report is not committed and is not
ground truth. Nothing new in this report is self-ratified.**

**Outcome.**
- **Step 1.** R-096 now has a dated clause appended: its scope is every document
  under `_samples/andre`, six on 2026-09-15, not a fixed count of four. Nothing in
  it was removed. The script header and the contract TTL table match, in one pull
  request, under card EXT-32.
- **Step 2.** All four original samples carry the same buyer block. No committed
  source put it there: no commit in this repository contained that IDNO or that
  address before 2026-09-15. Nothing was changed.
- **Step 3.** Case (a), a wrong line total, lands as `partial` on exactly one
  payload shape: a digital `partial` sent with no error code. Case (b), a right
  line total whose quantity times unit price disagrees, is never refused on any
  shape. No third fixture was built.
- **A correction to the previous report.** Its claim that the shipped classifier
  puts each fixture on its intended arm was true only of the classifier function
  itself. The route never calls that function for a digital `extracted` payload.
  See step 3.

No key, token or signed URL appears here or in any commit.

---

## BOOT

`docs/board/rc-board-phase2.json` at `origin/main` `f4e0140`, the merge of #296:
- **Cards:** todo 32, in_flight 0, blocked 2, halted 0, shipped 68.
- **Launch gate:** **6/9**.
- **Next eligible card,** by `scripts/poc/card-order.mjs`: **AUT-3**, "Add the
  TRIAGE role to the POC chain". Not worked, because this dispatch names its steps.

Phase 3 board at the same commit: todo 37, shipped 65, gate 0/9.

Work happened in the worktree `/Users/ivan/rc-inv-ext32`, on `card/ext-32`, cut
from `origin/main` `f4e0140`.

## STEP 1. R-096 amended, script header and contract table to match

**Why there is a card.** `scripts/poc-free/check-board-edit.mjs` classifies every
path under `scripts/` as code, comments included, and refuses code that arrives
under no card (`code-with-no-card`). The script header could not change without a
card. `npm run id:free -- EXT-32` answered FREE, and EXT-32 is authored and
shipped in this same pull request.

**`decisions/inbox.md`.** A clause headed "AMENDED 2026-09-15" is appended to the
end of R-096. It:
- sets the scope to every document under `_samples/andre`, six on that day, not a
  fixed count of four
- quotes the three sentences that name four, which also stay verbatim where they
  were
- says why the count went, pointing at the #296 journal row and report
- restates what does not change: the prefix only, fixtures with no client data, no
  product surface reaches them, fifteen minutes on both application signing paths,
  and the failure contract untouched
- leaves the R-096 heading unchanged and moves no ruling id

**`scripts/ext/serve-sample-documents.mjs`, comments only.** The header's first
line and step 1 no longer say four. A dated note under the first line keeps the old
wording. No executable line changed.

**`docs/contracts/extraction-v2.md`, section 5.4c.** The third row's scope column
now reads "every document under `_samples/andre`, six on 2026-09-15, R-096 as
amended 2026-09-15". A dated note under the table quotes the row's former wording.
The TTL itself is unchanged.

**Acceptance, run 2026-09-15T14:07:31Z:**

| check | result |
|---|---|
| R-096 on `origin/main` compared with the branch: every base line present, in order | **50 of 50**, 0 lines removed from `decisions/inbox.md`, clause present, exit 0 |
| non-comment lines of the script against `origin/main` | `diff` exit 0 |
| `node --check scripts/ext/serve-sample-documents.mjs` | exit 0 |
| new contract row present / former wording only on the quoted note line | 1 / yes |
| `validate-board.mjs`, phase 2 and phase 3 | exit 0, exit 0 |
| `check:unique-ids`, `check:grant-revocation`, `check:conflict-residue`, `check:document-url` | all exit 0 |
| em or en dashes added | 0 |

**Named as not edited, so nobody finds them later.**
- The body comment above the probe in `scripts/ext/serve-sample-documents.mjs`
  still says the probe touches none of "cele patru documente".
- `docs/contracts/extraction-v2.md` still says "four sample documents" in three
  places: the note that one has no text layer, the retention condition that calls
  them synthetic, and the heading over the reconciliation fixtures.

**Note 2026-09-15, card EXT-33:** the sample set under `_samples/andre` holds six documents since 2026-09-15, and R-096 as amended that day covers every document under that prefix, not a fixed count of four. The four named here are the original set; nothing above is changed.

All four describe the original set, not the ruling's scope, and the dispatch named
only the header and the table.

## STEP 2. The buyer block on the four original samples

**Yes: RAPID CONSTRUCT SRL, the IDNO and the address are on all four originals.**

| original | how read | buyer block as printed |
|---|---|---|
| `confirmare-comanda-mpc-8842 (2).pdf` | text layer | "Client / RAPID CONSTRUCT SRL IDNO 1019600038221 / str. Ion Creangă 62, mun. Chișinău, Republica Moldova" |
| `factura-betonmix-4417 (2).pdf` | text layer | "Cumpărător / RAPID CONSTRUCT SRL IDNO 1019600038221 / str. Ion Creangă 62, mun. Chișinău" |
| `factura-tehnocom-0009312.pdf` | text layer | "Cumpărător / RAPID CONSTRUCT SRL IDNO 1019600038221 / str. Ion Creangă 62, mun. Chișinău". Name and IDNO also repeat on both continuation page headers. |
| `aviz-scan-matnord-0021884.pdf` | no text layer (1 character extracted); read from the page rendered as an image | "Cumpărător / RAPID CONSTRUCT SRL IDNO 1019600038221 / str. Ion Creangă 62, mun. Chișinău" |

**No committed source put them in, and the search that shows it:**
- `git log --all -S "1019600038"` over every ref finds exactly two commits, both
  #296 (`79427be` and its merge `f4e0140`). That is the fixtures report quoting the
  block, on 2026-09-15.
- `git log --all -S` for "Creanga 62", "RAPID CONSTRUCT SRL IDNO", "Uzinelor 27"
  and "materialepro" finds nothing.
- The four PDFs are not in the repository. They sit in `/Users/ivan/rc-samples`,
  with copies of two of them in `~/Downloads`, and three name ReportLab as their
  producer.

**Note 2026-09-15, card EXT-33:** the sample set under `_samples/andre` holds six documents since 2026-09-15, and R-096 as amended that day covers every document under that prefix, not a fixed count of four. The four named here are the original set; nothing above is changed.

**What the committed record does say about where they came from, quoted exactly,
and it names no author or source data:**
- R-096 (`decisions/inbox.md`): *"they are supplier documents handed over as an
  extraction sample set, and nothing under that prefix is reached by any product
  surface."*
- `docs/contracts/extraction-v2.md`, section on model provider retention: *"The
  four sample documents are synthetic and are already through; a real document is
  the line."*
- The EXT-08 card's notes and the EXT-08 report describe the upload and the failure
  contract, and say nothing about who produced the documents or from what.

**Note 2026-09-15, card EXT-33:** the sample set under `_samples/andre` holds six documents since 2026-09-15, and R-096 as amended that day covers every document under that prefix, not a fixed count of four. The four named here are the original set; nothing above is changed.

**Consequence for deviation 4.** The two fixtures copied the block from these four,
so they add nothing new. Whether the IDNO and the address belong to the real client
is still unverified: the repository cannot answer it, and nothing was changed.

## STEP 3. Where a wrong line lands, run against our own classifier

**Method.**
- The decision block of `app/api/extraction/callback/route.ts` (5892 bytes, from
  `const digitalPartialWithoutCode` to the draft lookup) and its `num`, `str` and
  `bool` helpers were sliced out of the file verbatim and run under node.
- They ran against the real `classifyScan` and `headerConsistency` from
  `lib/data/reconciliation.ts`.
- The code was taken from a worktree whose `lib/` and `app/` were first proved
  identical to `origin/main` `f4e0140`.
- `canFlagReconciliation` and `canStoreSource` were set true, the production state
  since 0034 and 0033 applied.
- The guards that answer 400 before the block (an `extracted` payload with an error
  code, a `partial` with no code and no lines) were not exercised: every payload
  used passes them.
- The figures are synthetic, two lines under a header that adds up, and none comes
  from either fixture.
- Both existing fixture files are unchanged.

"Stored code" below is what lands in `error_code`. Our own verdict is always
written to `platform_error_code` and `platform_arm` whenever the block runs.

**Case (a): a line total present but wrong, header otherwise sound.** Tested with
quantity times unit price agreeing with the true total and, separately, with the
wrong one. Both give the same result, because the classifier never reads quantity
or unit price.

| source | sent status | `prices_include_vat` | our arm | stored code | stored status | lines |
|---|---|---|---|---|---|---|
| scan | `extracted` or `partial`, no code | known | `line_sum_missed` | `reconciliation_failed` | **`failed`** | dropped |
| scan | `extracted` or `partial`, no code | null | `anchor_unknown` | `unreadable_document` | **`failed`** | dropped |
| digital | `extracted` | known or null | not run | none | `extracted` | kept |
| digital | `partial`, no code | known | `line_sum_missed` | `reconciliation_failed` | **`partial`** | kept |
| digital | `partial`, no code | null | `anchor_unknown` | none (verdict recorded only) | **`partial`** | kept |

A wrong total within tolerance (0.04 off, on two lines) is accepted unrefused on
every shape.

**Case (b): a line total present and correct, quantity times unit price
disagreeing with it.**

| source | sent status | `prices_include_vat` | our arm | stored code | stored status |
|---|---|---|---|---|---|
| scan or digital | `extracted` or `partial`, no code | known or null | **none**, the line sums reconcile | none | **as sent** |

**No arm catches (b), on any shape.** Quantity and unit price are stored and never
compared with the line total by the route or by the classifier.

**Does either land as `partial` rather than `unreadable_document`?**
- **(a) does, on one shape only:** a digital payload sent as `partial` with no error
  code. It stays `partial` with its lines. With `prices_include_vat` known it
  carries `reconciliation_failed`. With the flag null, `error_code` stays empty and
  our `unreadable_document` verdict is recorded only in the platform fields. On a
  scan, (a) lands `failed` with its lines dropped. On a digital `extracted`
  payload, it is not judged at all.
- **(b) never lands as `unreadable_document`,** and never becomes `partial` through
  our verdict. It keeps whatever status it was sent with, unrefused.

**Not "neither", so the plain statement the dispatch asked for does not apply. No
third fixture was built, because this step only asked for a report.**

**The correction, and what it changes about the two existing fixtures.** Run
through the same block, the lines-arm fixture's shape (one line total missing)
behaves as follows:
- **scan:** `unreadable_document`, `failed`, lines dropped
- **digital `partial` with no code:** stays `partial`, `error_code` null, our
  `line_total_missing` verdict recorded only
- **digital `extracted`:** not judged, stored `extracted`

The sums fixture's arm, on the same shapes:
- **scan:** `reconciliation_failed`, `failed`
- **digital `partial` with no code:** `partial` with `reconciliation_failed`
- **digital `extracted`:** not judged

Both fixtures are digital documents. **If the counterparty sends them as
`document_source: "digital"` with `status: "extracted"`, our validator refuses
neither of them.** The previous report did not say this.

## DEVIATIONS, for ratification. None is self-ratified.

1. **A card was authored and shipped inside this dispatch.** EXT-32 exists only
   because `check:board-edit` refuses a comment edit under `scripts/` with no card.
   The dispatch did not name one.
2. **Header only.** One body comment in the script and three contract passages
   still say four, as step 1 lists. They describe the original set, and the
   dispatch named the header and the table.
3. **I moved a POC worktree.** Asking `id:free` about EXT-32 ran
   `git checkout --detach origin/main` inside `/Users/ivan/rc-inventory-poc-chat`,
   moving it from `b9059ee` to `f4e0140`. That worktree exists to read scripts at
   `origin/main`, so the move matches its purpose and it is clean. But it was a
   checkout in a deployed worktree that the dispatch did not name.
4. **Step 3 assumed two schema gates rather than reading them live today:**
   `canFlagReconciliation` and `canStoreSource` set true. The production ledger was
   reported at 0043 on 2026-09-14, past both 0033 and 0034. If either gate were
   false, the stored code in the case (a) tables would differ, and our verdict
   would not.
5. **The step 3 harness is not committed.** It lives in the session scratchpad and
   is lost on a restart. The method above is enough to rebuild it, and the tables
   are its full output for the cases asked.
6. **The fixtures report is corrected here, not in place.** Its sentence about the
   shipped classifier still stands in that file. **Recommendation:** a one-line
   dated note there pointing at this report's step 3.
7. **Not merged.** The pull request is left for the owner, as #296 was.

## STATE AT THE END

- **Pull request #297**, branch `card/ext-32`, carries the R-096 clause, the script
  header, the contract row, card EXT-32 and this report. Locally, before the
  pull request's `quality` run: `check:board-edit` said "satisfied 1 of 1 card
  id(s)", with EXT-32 absent at base and shipped at head, and
  `check:grant-revocation` exited 0.
- Nothing blocked. Nothing sent to the counterparty.
- No `docs/LEARNINGS.md` entry: no defect was found in the repository. The one
  error in this session was my own statement in the previous report, and step 3
  corrects it.
