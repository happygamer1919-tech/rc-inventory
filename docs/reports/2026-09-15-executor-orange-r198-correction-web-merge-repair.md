# ORANGE, EXECUTOR, 2026-09-15: #300 red from a web-editor merge, R-198 corrected, pattern P-3, empty lines on a digital failure, EXT-34's fifth field

Owner dispatch received after `docs/reports/2026-09-15-executor-orange-manufactured-figure-ruling-cards.md`.
Role EXECUTOR (ORANGE).

**Standing instructions for this dispatch, all held:**
- `/Users/ivan/rc-secrets/` and every credentials file were not read.
- Nothing was signed, and nothing was written to production storage.
- #300 was not merged.

**Nothing new in this report is self-ratified.** This dispatch ratified nothing
from the previous report, so its deviations stay open.

**Outcome.**
- **Step 1.** #300 went red because its head `416f5c7` is a merge made in
  GitHub's web conflict editor. It left conflict-marker residue in
  `docs/board/rc-board-phase3.json`, and the board stopped parsing. The board is
  rebuilt by parsing from git objects on a forward commit. After my last run, #302
  merged.
- **Step 2.** R-198 is amended: its backward half is corrected under
  `CLAUDE.md` section 9c, with every superseded sentence quoted.
- **Step 3.** R-198 part (g) records the boundary that exists: counterparty prompt
  version `2026-09-15b` and its `line_total_source` field.
- **Step 4.** Pattern **P-3**, a control filed under the wrong scope, is recorded
  in R-198 part (h) and entered in `docs/DOCTRINE-PATTERNS.md`.
- **Step 5.** A `failed` digital payload with `lines: []` is **accepted**. No line
  rows are stored, and **nothing downstream can tell empty from absent**.
- **Step 6.** EXT-34 carries `line_total_source` as a fifth field.
- **Step 7.** **No new ruling id and no new card id.** R-198 and EXT-34 are
  amended in place, P-3 is added, and the ruling counter stays at `R-199`.

No key, token or signed URL appears here or in any commit.

---

## BOOT

`docs/board/rc-board-phase2.json` at `origin/main` `8cbd3ce`:
- **Cards:** todo 32, in_flight 0, blocked 2, halted 0, shipped 68.
- **Launch gate:** **6/9**.
- **Next eligible card:** **AUT-3**. Not worked, because this dispatch names its
  steps.

Phase 3 at the same commit: todo 33, shipped 71, gate 0/9.

## STEP 1. #300 is red, and why

**Its head when this dispatch arrived:** `416f5c7ce525b8349aacd2518e6f55b901c9738d`.
My last push was `b4b4a4a`.

**The actual check status on that head:**

| check | status | when |
|---|---|---|
| `quality` | **completed, failure** | 2026-09-15T20:05:53Z to 20:06:28Z, 35 seconds; run `35017537599`, job `104544649240` |
| failing step | **7, "Validate boards"** | |
| Vercel Preview Comments | completed, success | |
| Supabase Preview | skipped | |

Merge state `BLOCKED`, mergeable `MERGEABLE`.

**The first failing assertion, verbatim from the log:**

```
FAIL  docs/board/rc-board-phase3.json  (1 violation)
  - file: could not read or parse - Expected double-quoted property name in JSON at position 119
##[error]Process completed with exit code 1.
```

**The cause.** `416f5c7` is a merge commit:
- **subject:** "Merge branch 'main' into board/orange-20260915-manufactured-figure"
- **author:** the owner's GitHub account
- **committer:** GitHub
- **time:** 2026-09-15T16:05:44-04:00
- **parents:** `b4b4a4a` (my last push) and `8cbd3ce` (#302)

That is the web conflict editor. It deleted the marker characters and left their
tails behind as file content:

```
5: board/orange-20260915-manufactured-figure
6:  "as_of": "2026-09-15T19:31:38Z",
8:  "as_of": "2026-09-15T19:25:40Z",
9: main
```

**The damage is confined to that file, and this is measured, not assumed:**
- Every other file in `416f5c7` is identical to the machine merge
  `git merge-tree --write-tree b4b4a4a 8cbd3ce`. The only path that differs is
  `docs/board/rc-board-phase3.json`.
- `npm run check:conflict-residue` on the synced tree exits 1 with
  `CHECK 3 JSON parse: docs/board/rc-board-phase3.json: expected a string at line 5`.

This is the failure the Conflicts section of `CLAUDE.md` (ruling R-052) was written
about, and it would be the fourth instance on that list.

**What merged after my last run:**
- **#302** (`card/p3-51`) at 2026-09-15T20:02:54Z. This is the merge the web
  editor pulled in.
- Nothing else. #301 (`card/p3-52`) merged at 19:17:27Z, before my last sync, and
  that sync already carried it.
- #303 (`card/p3-50`) is open.

**The repair, a forward commit with no force push:**
- The worktree was fast-forwarded to `416f5c7`.
- `docs/board/rc-board-phase3.json` was rebuilt from git objects as a parsed
  three-way union: base `2ac5905` (the machine-computed merge base), my side
  `b4b4a4a`, main's side `8cbd3ce`.
- Result: **106 cards = 104 from main + EXT-34 and EXT-35 from the branch**. P3-51
  is kept exactly as main has it.
- Every main card and every branch card was asserted unchanged, and a deep-copy
  comparison proved **EXT-34 is the only deliberate edit** (step 6).
- `as_of` is bumped, 0 residue lines remain, and `validate-board.mjs` exits 0.
- **The web-editor merge commit stays in the branch history.** Rewriting it would
  need a force push.

## STEP 1, CONTINUED. THE SAME BREAK A SECOND TIME, DURING THIS DISPATCH

My repair `74b07f6` was pushed at about 20:28Z. **Its `quality` run started at 20:29:04Z and was cancelled at 20:54:24Z**, because the branch moved under it:
- **#303** (`card/p3-50`) merged at 2026-09-15T20:53:03Z and edited the phase 3 board.
- **`9b1e662`** followed 30 seconds later: again "Merge branch 'main' into board/orange-20260915-manufactured-figure", author the owner's GitHub account, committer GitHub, 2026-09-15T16:53:33-04:00, parents `74b07f6` and `7c1a528`.
- **The same residue on the same lines:** ` board/orange-20260915-manufactured-figure` at line 5 and ` main` at line 9. The board does not parse. Every other file in that merge matches a clean machine merge of its two parents.

**Repaired the same way, on top of it:** a parsed three-way union with base `8cbd3ce`, branch `74b07f6` and main `7c1a528`. Result: 106 cards = 104 from main + EXT-34 and EXT-35 from the branch. Main's change since the base is kept as main has it (P3-50), and the branch's changes are kept (none). Every card is asserted, and `as_of` is bumped. A forward commit, with no force push.

## STEP 2. R-198 corrected

Amended in `decisions/inbox.md` under `CLAUDE.md` section 9c: the true statement
first, the superseded text quoted beneath it, nothing deleted. The amending
dispatch steps 2 to 4 are quoted verbatim at the top of the ruling.

- **The ruling paragraph:** "The boundary date is TBD." is quoted as superseded.
- **(d) is replaced**, under a new heading: "EXPOSURE: NONE IN PAST TRAFFIC. THE
  DEFECT WAS NEVER EXERCISED AGAINST A CLIENT DOCUMENT". The true statement:
  - no unmeasured historical incidence
  - the counterparty reports his scenario has never been active: 46 executions
    between 1 and 15 September 2026, all his own, and no client document through it
  - the defect was never exercised against client documents
  - no boundary date is needed for past traffic

  The old heading and all four old bullets are quoted in full beneath it.
- **(c) gains a note** that the withholding rule was tried twice and did not hold.
  Its sentence "The fix: a prompt rule refusing to emit a figure the page does not
  show." is quoted as superseded. Our side's measured routing of a null
  `line_total` is unchanged.
- **(e) is narrowed, not reversed.** No client extraction lies before the
  boundary, so its weighting now attaches only to the counterparty's own executions
  before `2026-09-15b`, and to anything that cites one.

## STEP 3. The boundary that exists, R-198 part (g)

- **Counterparty prompt version `2026-09-15b` makes `line_total_source` a required
  per-line field**, valued `printed` or `derived`.
- **One `derived` line fails reconciliation, regardless of arithmetic agreement.**
- **Two prior attempts at a withholding rule were ignored by the model**, with
  `line_total` already permitting null.

Part (g) also records two things:
- **Why P-2's construction does not defeat this control:** the failure depends on
  the declaration, not on the arithmetic.
- **What it still cannot prove:** that a line declared `printed` was printed.

On our side, the field is accepted and ignored today, as step 6 records.

## STEP 4. Pattern P-3

**R-198 part (h)** and **`docs/DOCTRINE-PATTERNS.md` entry P-3**, "A control filed
under the wrong scope":
- **The rule:** "A control correctly written but filed under the wrong scope
  executes in that scope only and reads as coverage everywhere else. Its presence
  is what prevents anyone looking."
- **The instance:** the counterparty's no-invented-figure rule sat under a
  scanned-document heading and was never applied to digital PDFs.
- **The bar:** a control's scope is verified independently of its text.
- **Distinct from P-2:** P-2's control runs in scope and is satisfied by
  construction. P-3's control would catch the defect but runs elsewhere.
- **Distinct from R-193:** R-193's control never executes. P-3's executes in its
  own scope, so a test there passes.

P-2's entry in the same file is corrected the same way, with its superseded
sentences quoted: the TBD boundary with the unknowable incidence, and "The only
control" paragraph.

## STEP 5. A digital `failed` payload with `lines: []`, read from the validator on origin/main `8cbd3ce`

**Accepted**, provided it carries a valid `error_code` and names a draft we sent.
The path through `app/api/extraction/callback/route.ts`:

```
150:  if (status === "failed" && errorCodeRaw === null) {
210:  const scanFailure = documentSource === "scan" && status === "failed";
213:  if (scanFailure && carriesLinesKey) {
220:  const rawLines: unknown[] | null = scanFailure
221:    ? []
222:    : Array.isArray(body.lines)
223:      ? (body.lines as unknown[])
224:      : null;
225:  if (rawLines === null) {
226:    return NextResponse.json({ error: "lines lipseste" }, { status: CALLBACK_CODES.rejected });
235:  if (status === "partial" && errorCodeRaw === null && rawLines.length === 0) {
```

- `:150` refuses a `failed` payload with no `error_code`, whatever its lines.
- `:210` makes `scanFailure` false for `digital`, so the lines-key refusal at
  `:213` does not apply.
- `:222-223`: `[]` is an array, so `rawLines` is `[]`, not null, and `:225-226`
  does not refuse.
- `:235` refuses empty lines on `partial` only.

**Is an empty lines array stored? No.**
- `:632-633` delete the draft's existing line rows (`.from("extraction_draft_lines")`,
  `.delete()`).
- `:639` then reads `if (rawLines.length > 0 && !dropLines) {`, which is false, so
  nothing is inserted.
- `:671` answers `lines: dropLines ? 0 : rawLines.length`, which is `0`.
- No column, and nothing in the stored `_meta`, records that a `lines` key arrived.

**Does anything downstream distinguish empty from absent? No.**
- `lib/data/extraction.ts:229` reads the embedded `extraction_draft_lines`, and zero
  rows arrive as an empty array.
- `components/orders/ExtractionReviewPanel.tsx:577` renders
  `data-lines={String(draft.lines.length)}` as `0`. The kept-lines sentence
  (`:603-608`) renders only for `partial`.
- A digital failure sent with `[]` and a scan failure sent with no `lines` key
  therefore store the same zero rows and read back identically.

**The only place empty and absent differ is the route's own acceptance, and there
the two sources are opposite:**
- a **digital** failure: `[]` is accepted, and an absent key is refused `400 lines
  lipseste` at `:226`.
- a **scan** failure: an absent key is accepted, and `[]` is refused `400` at
  `:213-218`.

## STEP 6. EXT-34's fifth field

EXT-34 now stores five fields: `document_type` and `client_ref` on the draft, and
`supplier_code`, `description` and **`line_total_source`** on each line.

**Checked before adding it:** no line of the route on `origin/main` `8cbd3ce` reads
`line_total_source`, and the per-line insert at `:645-657` names ten keys, none of
them this one. So the dispatch's statement holds: it is accepted and ignored.

The card's title, plain, acceptance and defaults are rewritten from four fields to
five, and a dated note records the change. The acceptance migration adds five
nullable text columns, and the new case sets `printed` on one line and `derived`
on another. The defaults store the value as sent, with no check constraint, and
do not add a reconciliation rule on our side.

Still `todo`, still marked "FOR THE PLATFORM OWNER, NOT FOR THE ORANGE TERMINAL",
not built.

## STEP 7. Ids

| id | what happened |
|---|---|
| **R-198** | amended in place: the ruling paragraph, part (c) note, part (d) replaced, part (e) note, parts (g) and (h) added |
| **P-3** | added to `docs/DOCTRINE-PATTERNS.md`, recorded by R-198 part (h) |
| **EXT-34** | amended: fifth field `line_total_source` |
| **EXT-35** | unchanged |

**No new ruling id and no new card id were created.** `decisions/NEXT-RULING-ID`
stays at `R-199`.

## DEVIATIONS AND FINDINGS, for ratification. None is self-ratified.

1. **R-198 is amended in place, not replaced by a new ruling, and P-3 lives in
   R-198 part (h)** rather than under its own id. R-198 has not merged, and P-3
   comes from the same incident. **If you want P-3 under its own ruling, `R-199` is
   the next id.**
2. **The broken web-editor merge commit stays in #300's history.** The repair is a
   forward commit on top of it, because a force push is forbidden. A squash merge
   of #300 would keep it off `main`.
3. **The merge that broke the board was made in the GitHub web editor from the
   owner's account.** `CLAUDE.md`'s Conflicts section (R-052) names that path, and
   these are the fourth and fifth instances of the residue it lists. It is recorded as a fact,
   not a criticism.

   **#300 re-conflicts on the phase 3 board every time another lane merges**, which
   has now happened four times, twice settled in the web editor with the same residue. **Recommendation:** merge #300 soon after its next
   green run, and leave any further conflict on it to this terminal.
4. **Part (g) says one thing the dispatch did not:** a declared `printed` cannot be
   verified from the payload. It is stated because it is the new control's limit,
   and it is flagged so it is not read as the owner's words.
5. **Part (e) is narrowed rather than quoted as superseded.** The dispatch named the
   backward half, not (e). (e)'s weighting is still true of the counterparty's own
   executions.
6. **Using `line_total_source` in our own reconciliation is not carded.** EXT-34
   only stores it.
7. **Step 5 assumes a valid `error_code` and a known `order_id`.** Without
   `error_code`, a `failed` payload is refused `400` at `:150` before `lines` is
   read, and an unknown `order_id` is refused `400` at `:485`.
8. **The grant finding from the previous report is still unresolved.** This
   dispatch's instructions were held.

## STATE AT THE END

- #300 carries the repair, the amendments, P-3, EXT-34's fifth field and this
  report. It is not merged.
- **The `quality` result on the repair head is not written here.** Writing it into
  this file would move the head away from the run that proved it. It is reported in
  the terminal and read beside merge state.
- Nothing blocked. Nothing sent to the counterparty. Nothing built.
