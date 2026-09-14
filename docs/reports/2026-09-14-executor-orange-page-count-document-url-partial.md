# ORANGE, EXECUTOR, 2026-09-14: page count, download route origin, and a partial with no code

Two owner dispatches, the second queued behind the first. Role EXECUTOR.
Worktrees, each from `origin/main`: `/Users/ivan/rc-inv-ext28` (EXT-28),
`/Users/ivan/rc-inv-ext30` (EXT-30), `/Users/ivan/rc-inv-p355` (P3-55).

**Outcome:**

| card | pull request | state when this report was committed |
|---|---|---|
| EXT-28, page count | #290 | open, **merge held for the owner** because it applies migrations `0042` and `0043`. `quality` passed on `b27cd33`; main moved, so it was re-run on the merged head `241310d` and was in progress. |
| EXT-30, document link origin and test links | #291 | **merged** as `77f5325` on green `quality`; production `/api/health` reports that commit |
| P3-55, partial with no code | #292 | open; `quality` running at commit time |

No token, signed URL or credential value appears in this report, in any commit or
in any pull request.

---

## DISPATCH 1

### STEP 0. VERIFY

**`main` and open pull requests.** At the start `git fetch --all --prune` gave
`origin/main` `d25fbf9416bd27f5d61d73cf20439203a72f8dbe` and **1** open pull
request (#287, Max). `main` moved to `d1f7074` during the session, when #287 and
#288 merged.

**Does every path that fires the extraction webhook emit `size_bytes`, always,
numeric, never null or absent? YES, on all three paths, read from source.**

| # | path | where | value sent |
|---|---|---|---|
| 1 | upload lane | `lib/data/extraction-actions.ts`, `startExtraction` | `file.size`; a zero-byte file is refused before this |
| 2 | document attached to an order | `lib/data/inbound-actions.ts`, `uploadOrderDocument` | `file.size`; same zero-byte refusal |
| 3 | refire button | `lib/data/extraction-actions.ts`, `refireExtraction` | `Number(draft.size_bytes)` from the stored row |

All three call `fireExtraction` in `lib/data/extraction-fire.ts`.
- It writes `size_bytes` to `extraction_drafts.size_bytes` **before** the webhook
  `fetch`. That column is `bigint NOT NULL` with `CHECK (size_bytes > 0)` from
  migration `0008`.
- It returns without sending when that write fails, and the body carries the same
  value. A value the column refuses (null, NaN, zero, negative, fractional) never
  reaches the body.
- The only way nothing is sent at all is a missing `MAKE_WEBHOOK_URL`. That is no
  send, not a send without the field.
- On the EXT-28 branch, `extraction.spec` case 32 asserts that `size_bytes`
  arrives as a JSON number on all three paths.

**STEP 3's condition did not fire, so no card was authored.**

**Are `_meta.model` and `prompt_version` read anywhere on our side? NO.**
`app/api/extraction/callback/route.ts` stores `_meta` verbatim into
`extraction_drafts.meta`, and the only key read out of it is `page_count`. No file
in `lib/`, `app/` or `components/` reads `model` or `prompt_version`. The only
readers are end-to-end cases that assert the stored value.

**`NEXT_PUBLIC_SITE_URL`, as the code read it on `main`, and every fallback:**

- **Where it was read:** one application function, `siteOrigin()` in
  `lib/data/extraction-fire.ts`. `lib/env-required.ts` lists it as expected in
  production, which only logs a startup warning.
- **Fallback 1:** absent, empty or whitespace produced
  `https://www.rapidconstructmd.com`, for both `document_url` and `callback_url`.
- **Fallback 2:** `RC_CALLBACK_URL`, when set, overrides the callback URL only.
- **Production value source:** a Vercel environment variable.
  `vercel env ls production` lists `NEXT_PUBLIC_SITE_URL` for Production, created
  on 2026-09-13. The value is encrypted and **was not read**. `RC_CALLBACK_URL` is
  not set in Production.
- **Inference, flagged:** before 2026-09-13 production had no such variable, so
  both links would have used the marketing host.

### STEP 1. EXT-28, PAGE COUNT. PR #290

**What it does.** The upload counts a document's pages before sending anything.
It sends the count as `page_count`, refuses a document of 100 pages or more before
any send, and shows our count on the header-only scan screen.

- **Counter:** `lib/data/page-count.mjs`, no new dependency (`node:zlib` only). It
  resolves the page tree root through trailer `/Root`, catalog `/Pages` and
  `/Count`, which fixes the seven undercounts the 2026-09-12 probe made by taking
  the largest visible `/Count`. A PNG or JPG is 1. Anything it cannot read with
  certainty is null.
- **Measured against `pdfinfo` on 1735 local PDF files (431.9 MB): 1734 correct,
  1 null, 0 wrong.** The one null is an encrypted file with object streams.
  Average 0.92 ms per file. The probe scored 1526 correct, 2 no answer and 7 wrong
  on 1535 files.
- **Store:** migration `0043` adds `extraction_drafts.upload_page_count`.
  `page_count`, the model's report, is not written.
- **Webhook:** seven fields. `page_count` is always present, an integer or null.
  Contract section 3 edited.
- **Refusal:** inside `fireExtraction`, so the upload lane, the refire button and
  the attached-document path are all covered. At 100 pages or more the draft is
  stored `failed` with `document_too_large` and nothing is signed or sent. A null
  count never refuses.
- **Label:** migration `0042` adds `document_too_large`, with the sentence EXT-27
  proposed. A callback carrying the code is now accepted; before, it was a 400.
- **Screen:** "Pagini numărate la încărcare" on the header-only scan screen.

**Local gates:**
- `tsc` exit 0.
- `check:page-count` 28 cases.
- `check:migrations` exit 0, 26 assertion files.
- `extraction.spec` plus `review.spec`: 63 passed, 1 failed. The failure was
  review case 1, which timed out waiting for the upload input; rerun alone it
  passed. New cases 32, 33 and 11b passed.
- `headers.spec` 5 passed.
- Twenty more checks and proofs, each exit 0.

After main moved, the branch was merged with main (two conflicts, resolved
locally) at `241310d`.

### STEP 2. EXT-30, DOWNLOAD ROUTE CONTRACT. PR #291, MERGED

- **Origin:** the `https://www.rapidconstructmd.com` fallback is removed. The origin
  comes only from `NEXT_PUBLIC_SITE_URL`, through `lib/data/site-origin.mjs`. A
  missing, empty, schemeless or path-carrying value refuses the send after the
  draft row exists, logs the variable name, and stores the draft `failed` with that
  reason.
- **Host guard:** `check:document-url` (37 cases) refuses the build if the
  deployed-commit guard, the contract, the sample script and the test-link script
  name different production hosts, or if any code line in the application names
  the marketing host.
- **Live probe on `https://app.rapidconstruct.md`, read-only, no credential:**
  EXPIRED_TOKEN answered 400 and INVALID_TOKEN answered 401, both
  `application/json`.
- **The three failure test links:**
  - **EXPIRED_TOKEN and INVALID_TOKEN are produced and verified** by
    `scripts/ext/document-url-test-links.mjs`. They are written to
    `/Users/ivan/rc-samples/EXT-30-TEST-LINKS.md` with mode 600 and were not
    printed.
  - **OBJECT_NOT_FOUND needs a valid signature**, so it is the owner-run
    `--object-not-found` mode of the same script.
- **Local gates:** `tsc` exit 0. `check:document-url` 37 cases. Document-url spec
  plus extraction cases 1 and 34: 10 passed.
- **Merged** on `quality` SUCCESS for head `1b5f38b` (28m30s, mergeStateStatus
  CLEAN) as `77f5325`. Production reports that commit.

### STEP 3. No card; see step 0.

### STEP 4. RECORD. Ruling R-196, in PR #290

- **(a) R-194(b) is narrowed in place.** The counterparty's callback delivery and
  its retries now run in a separate, permanently active scenario. The superseded
  text is quoted, marked narrowed and names R-196. The same note is in contract
  5.4b.
- **(b) `_meta.model` and `prompt_version`.** `_meta.model` carries the configured
  model as a literal on both failure paths. `prompt_version` is dated on a model
  refusal and null when the model was never called. Contract 4.3 updated.

### STEP 5. EXCLUSIONS

All honoured: no P2-13 or P2-14, no credential rotation, no CRM surface, no .com
domain or DNS, no TTL change, and no token or signed URL printed.

---

## DISPATCH 2

### STEP 0. VERIFY

**`main` and open pull requests.** `origin/main`
`d1f707483b1627aaa9a3e3cf733781243520a0e4`. **3** open pull requests when this
dispatch started: #289 (Max), and #290 and #291 from dispatch 1.

**The condition that returns 400 on a null `error_code`, verbatim from
`app/api/extraction/callback/route.ts` on `main`, lines 150 to 155:**

```ts
  if (status === "failed" && errorCodeRaw === null) {
    return NextResponse.json({ error: "error_code obligatoriu la failed" }, { status: CALLBACK_CODES.rejected });
  }
  if (status === "extracted" && errorCodeRaw !== null) {
    return NextResponse.json({ error: "error_code interzis la extracted" }, { status: CALLBACK_CODES.rejected });
  }
```

**It covers `failed` only.** Line 137 is the comment above it. Until P3-29a
(#286, merged 2026-09-14T06:14Z) the condition was
`status === "failed" || status === "partial"`.

**What the classifier does today with a `partial`:**

- **Digital partial:** not classified. It is stored as sent, with the sender's
  code or null, no platform verdict, and its lines kept.
- **Scan partial with a code:** ours is recorded beside it, and the sender's code,
  status and lines stand.
- **Scan partial with no code:** when ours refuses, ours is supplied, the status
  becomes `failed` and the lines are dropped. When ours does not refuse, it stays
  `partial` with its lines.

**Are lines accepted on a partial? Yes, and they are not refused before shape
validation.** `lines` must be an array, or `400` "lines lipseste", and each line
needs a `product_name`, or `400`. Then they are stored.

**The premise "partial is currently 100 percent discarded before storage" is false
about `main` and production**, which answered health with `ledger_version`
`"0041"` at `d1f7074`. The red arm below proves it by run.

### STEP 1. P3-55. PR #292

**Built:**
- A code-less **digital** `partial` is classified.
- Our verdict is always recorded in `platform_error_code` and `platform_arm`.
- Our code is stored as `error_code` only when it is `reconciliation_failed`.
- The status stays `partial` and the lines are kept and shown.
- A code-less `partial` with no lines is `400`. A code-less `failed` stays `400`.

**Acceptance, `review.spec` case 5b:** a digital partial with no code, a header
that adds up (18450 + 3690 = 22140) and two lines summing to 18000. It asserts:
- `202`, and a draft stored with status `partial`, `reconciliation_failed`, arm
  `line_sum_missed` and both lines.
- The reconciliation sentence on the upload screen, with both lines beneath it in
  the review form, compared by on-screen position.
- A code-less `failed` answers `400` and writes nothing.
- A code-less, line-less `partial` answers `400`.
- A control whose lines add up stores no code.

**Red before:** the same case against `main`'s route failed at line 826, Expected
`"reconciliation_failed"`, Received `null`.

**Green after:** 61 passed, 1 failed. The failure was extraction case 28, which
stalled on the settings page before any callback; rerun alone it passed in 9.1 s.
Case 5b, P3-29a case 31 and digital cases 1d and 14 passed.

**Checks:** `check:reconciliation` had pinned "the digital path is never judged".
It fired on the ruled change, was amended to pin exactly R-197's shape, and **four
mutants each made it exit 1**. `tsc` exit 0, and 15 more checks exit 0.

### STEP 2. RECORD. Ruling R-197, in PR #292

- **No contract change on either side.** The lines structure keeps no `error_code`.
- **Moving partial into the failed structure is rejected:** it discards the lines,
  and a `failed` draft offers no review form.
- **Adding `error_code` to the lines structure is rejected:** a two-sided change
  carrying one constant value.
- **`_meta.model` on a failure path is the configured model, never the resolved
  snapshot**, because the call did not complete. A refusal can never be attributed
  to a snapshot; only the success path can.

### STEP 3. RESUME

Nothing to resume: the page cap is #290 and the download route is #291, both
complete.

### STEP 4. EXCLUSIONS

All honoured.

---

## DEVIATIONS, FLAGGED AND NOT SELF-RATIFIED

1. **EXT-28 was built while its dependency EXT-27 is `todo`.** Migration `0042` is
   EXT-27's clause one for the single label `document_too_large`, the one reason
   the edge exists. The edge is left as authored, and EXT-27 has a note.
2. **An EXECUTOR wrote rulings R-196 and R-197 and authored card P3-55**, all
   instructed. R-196 rides in #290.
3. **R-196 reads "held-retry warning" as R-194(b).** The word "held" is not in
   R-194.
4. **EXT-30's clause one was replaced by the dispatch** (remove the fallback, not
   correct it). The EXPIRED_TOKEN link uses a JWT-shaped token with a past `exp`
   and no valid signature; the route answers it exactly as it answers a real
   expired link. OBJECT_NOT_FOUND is owner-run.
5. **EXT-30 was self-merged** under CLAUDE.md 3.1, on green `quality` for its head
   sha and passing acceptance.
6. **P3-55: the dispatch's premise is false** (see step 0).
7. **P3-55 stores our code only when it is `reconciliation_failed`.** Any other arm
   is recorded, and no code is stored.
8. **P3-55's zero-line refusal applies to scans too.** A code-less scan partial
   with no lines was stored `failed`; now it is `400`.
9. **P3-55 amends `check:reconciliation`.** Three assertions pinned the old
   behaviour and fired on the ruled change. They are replaced with pins on exactly
   R-197's shape, and the old ones are quoted in place.
10. **"No contract change" is read as the wire shape.** Contract 5.2 and 5.3a gain
    notes describing our behaviour.
11. **Two of this terminal's pull requests are in flight** (#290 and #292) against
    dispatch 2's "one PR each". #290 predates that dispatch and waits on the
    owner's merge; P3-55 was opened because the dispatch ranks it first and a branch
    without a pull request cannot merge.
12. **Session process errors, caught.** Twice a gate command ran in the wrong
    worktree, because a parallel `cd` moved the session directory. Both were caught
    from the printed path and rerun, and no commit was affected. Two defects in my
    own test scaffolding were caught by the checks before any commit.

## FINDINGS, REPORTED AND NOT FIXED

- **`fireExtraction` refuses a missing `MAKE_WEBHOOK_URL` before the draft row
  exists.** The failure update then touches no row, and the document appears
  nowhere on the screen. Not carded.
- **R-196 tension.** A failure path carrying `_meta` on the header-only scan shape
  would contradict contract 4.1a's "sixteen fields and nothing else". The route
  would accept it.

## OWNER ACTIONS

1. **Merge #290** once `quality` is green on its merged head. Merging applies
   `0042` and `0043`.
2. **Send the counterparty the sentence in #290's body**: `page_count` is in the
   webhook, and `document_too_large` is accepted.
3. **Run the OBJECT_NOT_FOUND link:**
   `node scripts/ext/document-url-test-links.mjs --object-not-found`, with
   `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment.
   It is a production write (one upload and one delete of its own placeholder), so
   add its row to `docs/PRODUCTION-WRITES.md`. Then hand over
   `/Users/ivan/rc-samples/EXT-30-TEST-LINKS.md`.
4. **Rule on the deviations above.**

## STATE AT THE END

- `main` is `77f5325`.
- **Open pull requests:** #289 (Max), #290 (EXT-28, held for owner merge), #292
  (P3-55).
- **Next extraction card by value:** EXT-27, whose remaining clauses are the
  instruction `download_failed` lacks, the sentence-uniqueness check and its
  mutants.
