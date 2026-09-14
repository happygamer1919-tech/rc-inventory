# ORANGE, EXECUTOR, 2026-09-14: EXT-28 merged, the third test link, verification answers

Owner dispatch received after `docs/reports/2026-09-14-executor-orange-page-count-document-url-partial.md`.
Role EXECUTOR (ORANGE). **The eleven deviations of that report are ratified by the
owner, with the conditions in step 6. Nothing new in this report is
self-ratified.**

**Outcome.**
- **EXT-28 (#290) is merged as `53b49b0`.** Production reports `ledger_version`
  `"0043"` on that commit.
- **The third test link, OBJECT_NOT_FOUND, is produced and returns 404 live.**
  Its production write is journalled.
- **EXT-27 is amended.**
- **Every step 5 question is answered from committed files.**

No key, token or signed URL appears here or in any commit.

---

## BOOT

`docs/board/rc-board-phase2.json` at `origin/main` `50732f2`:
- **Cards:** todo 32, in_flight 0, blocked 2, halted 0, shipped 68.
- **Launch gate:** **6/9**.
- **Next eligible card,** by `scripts/poc/card-order.mjs`: **AUT-3**, "Add the
  TRIAGE role to the POC chain". Not worked, because this dispatch names its steps.

Phase 3 board: todo 39, shipped 63, gate 0/9, next eligible CI-04.

## STEP 1. The SQL of 0042 and 0043, before any merge

The full SQL of both files was printed in the session before the merge, read from
#290's head `44f083b`:
- **0042:** sha256 `964943856a5c788dc0c8916bea10ce56f193b0e9792f91f1b6c9745aeb328cb9`.
- **0043:** sha256 `b9f7c14765b5ecdbf11471dd5edebbd86b65d7d127db9c2e080d9048b314ab80`.

**No stop condition was met.** Parsed with `pgsql-parser`, the PostgreSQL grammar:

| file | statements |
|---|---|
| `0042_error_code_document_too_large.sql` | 1 `AlterEnumStmt`, `add value if not exists 'document_too_large'`; 1 `SelectStmt` |
| `0043_extraction_upload_page_count.sql` | 2 `TransactionStmt`; 1 `AlterTableStmt` of subtype `AT_AddColumn` on `extraction_drafts`, adding `upload_page_count`, a NEW column; 2 `CommentStmt` on columns; 2 `SelectStmt` |

- **No DROP, no TRUNCATE, no DELETE statement.** Those words appear only in `--`
  comment lines that say the files contain none.
- **The one ALTER TABLE adds a column that did not exist**, so it held no data.
- **`ALTER TYPE ... ADD VALUE` adds a label** and changes no column.
- **`COMMENT ON COLUMN page_count` changes a column's description**, not its data.

## STEP 2. Green on the current head, and #289

- **#290 was green on its current head `44f083b`.** `quality` run 34904156224
  passed in 28m18s. `npm run checks:state 290` reported mergeStateStatus CLEAN,
  quality SUCCESS, and a result that belongs to head `44f083b`.
- **That head was not pushed by this terminal.** It is a GitHub "Merge branch 'main'
  into card/ext-28" commit made from the owner's account, parents `d917513` and
  `50732f2`. Checked before merging: no change to `supabase/migrations`, and no
  conflict-marker lines added.
- **#289 was not open.** It merged at 2026-09-14T21:09:26Z, so merging #290 could
  not make it stale. **#293** (Max, `card/p3-15`) was open, and this merge makes it
  stale.

## STEP 3. Merge and apply

- **#290 merged** at 2026-09-14T22:56:25Z as
  **`53b49b0e33bc46cdce69fd7c1b43d9a46ca17921`**, which is now `origin/main`. Its
  tree is byte-identical to `44f083b`.
- **`/api/health` on `https://app.rapidconstruct.md`, first poll, at
  2026-09-14T22:57:03Z:**

  ```
  ledger_version  "0043"
  commit          53b49b0e33bc46cdce69fd7c1b43d9a46ca17921
  ```

## STEP 4. The third test link

- **The run:** `node scripts/ext/document-url-test-links.mjs --object-not-found`,
  from 2026-09-14T22:57:45Z to 22:57:47Z, exit 0.
- **The script:** sha256
  `794b2202467fee2e38ab89fc502ba4edb66d4e37e72352f9cef4db258665ca34`, identical to
  the version merged in #291.
- **The key:** sourced from `/Users/ivan/rc-secrets/phase2.env` in a subshell. No
  value was printed, and output was passed through a token redactor.
- **What it did:** uploaded the placeholder `rc-docs/_samples/andre/ext-30-object-not-found.pdf`,
  signed it with the sample TTL of ruling R-096, deleted the placeholder, and
  requested the signed link through our route. It printed:

  ```
  ok    OBJECT_NOT_FOUND: status 404, content-type application/json; charset=utf-8, code OBJECT_NOT_FOUND
  ```

- **The link:** appended to `/Users/ivan/rc-samples/EXT-30-TEST-LINKS.md` (22 lines
  to 37, mode 600). It was not printed.
- **Confirmed live, independently of the script,** at 2026-09-14T22:58:20Z, by
  reading the link from that file and requesting it: host `app.rapidconstruct.md`,
  path prefix `/api/documents/`, **status 404, `application/json`, code
  `OBJECT_NOT_FOUND`**.
- **Expiry:** the link answers OBJECT_NOT_FOUND until the sample TTL expires
  (about 2026-09-15T22:57Z) and EXPIRED_TOKEN after.
- **Journal:** `docs/PRODUCTION-WRITES.md` gains the row, naming the placeholder
  object, the upload and the delete, plus a short section explaining it.

The file now holds all three links: EXPIRED_TOKEN, INVALID_TOKEN and
OBJECT_NOT_FOUND.

## STEP 5. Verification only, no edits

Line numbers are at `main` `53b49b0`, whose tree equals #290's head.

**a. When the counter cannot resolve a file, `page_count` is EMITTED AS `null`. It
is not omitted.**
- **Unreadable returns null.** `lib/data/page-count.mjs:43` defines
  `export function countPages(bytes, mimeType)`, and `:47-49` return null on any
  throw: `return countPdfPages(toBuffer(bytes));` / `} catch {` / `return null;`.
- **Encrypted skips the object streams.** At `:247`,
  `const encrypted = /\/Encrypt[\x00\t\n\f\r /<\d]/.test(s);`. At `:303`,
  `if (type === "ObjStm" && stream && !encrypted) {`. The catalog then does not
  resolve, and `:339` or `:346` return `null`.
- **The count is passed as-is.** `lib/data/extraction-actions.ts:103` has
  `const pageCount = countPages(await file.arrayBuffer(), file.type);`, and
  `lib/data/extraction-fire.ts:96` types it `pageCount: number | null;`.
- **The body keeps the key.** `lib/data/extraction-fire.ts:239` is
  `body: JSON.stringify({`, and `:247` is `page_count: input.pageCount,`.
  `JSON.stringify` keeps a key whose value is `null`; only `undefined` drops one.
- **Proven.** `tests/e2e/extraction.spec.ts:1834` asserts
  `expect(u[0]!.keys).toEqual(FIRE_FIELDS);`, where `tests/e2e/support/make.ts:25`
  lists `"page_count",`, and `:1835` asserts
  `expect(u[0]!.pageCount).toBeNull();`. That case uses a PDF whose catalog has no
  `/Pages`. The encrypted shape is proven null by
  `scripts/poc-free/check-page-count.mjs:118`.

**b. No. The header-only failed shape does not carry `page_count`, before or after
#290.**
- **The key list.** `scanFailureHeader` at
  `tests/e2e/extraction.spec.ts:1447-1471` emits these keys, **count 16**:

      order_id, status, error_code, reason, supplier_name, order_ref, client_ref,
      order_date, currency, currency_raw, prices_include_vat, vat_rate, subtotal,
      vat_amount, document_total, document_source

- **The contract agrees on the count.** `docs/contracts/extraction-v2.md:210-216`,
  section 4.1a, lists "these **sixteen fields** and nothing else".
- **One name differs, a finding not fixed.** The contract's second name is
  `supplier`, while the fixture and the route read `supplier_name`. EXT-20's notes
  already record that three of the owner's sixteen names are not this contract's.
- **Where the model's count comes from.** `page_count` is read only from `_meta`,
  at `app/api/extraction/callback/route.ts:86` and `:583`, and this shape has no
  `_meta`.
- **What #290 added for this shape.** OUR count, `upload_page_count`, is shown on
  its review screen. It is not part of the payload.

**c. Not built.** `git grep -i partial_cause` finds nothing on `main`. It is not
read out, has no column, and is not in the UI. If a sender puts it in `_meta`, it
sits only in the stored blob: `app/api/extraction/callback/route.ts:561`,
`meta: body._meta ?? null,`.

**d. Both shipped.** From `docs/board/rc-board-phase3.json` at `50732f2`, unchanged
for these cards by #290:
- `:1908` `"id": "EXT-23"`, `:1913` `"status": "shipped"`.
- `:1994` `"id": "EXT-26"`, title "The sender's error_code is authoritative and ours
  is recorded beside it", `:1999` `"status": "shipped"`.
- **"The sender-code fix" is read as EXT-26.** The other candidate, P3-29a
  ("error_code stops being mandatory" on a partial): `:1124` `"id": "P3-29a"`,
  `:1129` `"status": "shipped"`.

**e. The enumerated list exists; no committed file records it as owed to the
counterparty.**
- **Where it lives.** `docs/contracts/extraction-v2.md` section 4.1a, `:210-216`,
  the sixteen names quoted in b. The owner's original sixteen names are in EXT-20's
  `defaults`, `docs/board/rc-board-phase3.json:1684`.
- **What was searched.** EXT-25, the card that owes Andre messages (`todo`), and the
  contract and rulings for a list recorded as owed, sent or to be delivered.
- **What was found.** Nothing names a header field list owed to him.

## STEP 6. Conditions on the ratified deviations

**Role record.** Ruling **R-196**, ruling **R-197** and card **P3-55** were authored
by EXECUTOR, outside the POC role (rulings) and the AUTHOR role (cards). **They
stand by the owner's ratification of 2026-09-14, not as precedent.** No later
EXECUTOR session may cite them as authority to write rulings or author cards.

**EXT-27 is amended**, notes only, at 2026-09-14T22:57:55Z. Its first clause
shipped in migration `0042`: merged in `53b49b0`, and live per `/api/health`
`"0043"` at 22:57:03Z. The amendment names what remains (clauses two to four) and
says in terms that a session working the card authors no migration for
`document_too_large`. No code changed.

## DEVIATIONS, FLAGGED AND NOT SELF-RATIFIED

1. **One interim print before the merge, against "report once at the end".** The
   boot status and the full SQL were printed before merging. CLAUDE.md section 1
   requires the boot status before any change, and step 1 asks for the SQL "before
   any merge".
2. **The service key was sourced from `/Users/ivan/rc-secrets/phase2.env`**, which
   CLAUDE.md section 7 puts out of bounds except for 8.3's migration applies. The
   dispatch ordered it. One earlier read printed only whether the two names were
   set. No value was printed, logged or committed.
3. **A terminal performed a production storage write** (one placeholder uploaded,
   then deleted) through a script that is not one of R-047's transactional,
   SQL-assertion scripts. The dispatch ordered it. The script writes the link only
   when the live response matches the contract, and exits 1 otherwise.
4. **The journal row went in after the write, not before.** CLAUDE.md 8.8 binds a
   pull request that performs a write. This was a terminal run with no pull request,
   and the row needs the run's outcome, so it rides in the close-out pull request.
5. **Merging #290 makes #293 (Max) stale.** #289 had already merged.
6. **#290's final head `44f083b` came from GitHub's update-branch, from the owner's
   account.** It was checked before merging, as step 2 says.
7. **Step 5d reads "the sender-code fix" as EXT-26**, and quotes P3-29a too.

## STATE AT THE END

- **`main`:** `53b49b0` before this report's pull request.
- **Production:** commit `53b49b0`, ledger `0043`.
- **Open pull requests:** #293 (Max), and this terminal's close-out pull request
  carrying the EXT-27 amendment, the journal row and this report.
- **Owner action left:** hand `/Users/ivan/rc-samples/EXT-30-TEST-LINKS.md` to the
  counterparty, and send the sentence in #290's description.
