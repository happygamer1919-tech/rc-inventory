# EXECUTOR, 2026-09-03. Sample TTL to 24 hours, `document_source` into the contract, and a pending list that was wrong

**Role:** EXECUTOR. **Date:** 2026-09-03 UTC.
**Dispatch:** direct from the owner, seven steps, no board card authored for it.
**In force and applied:** R-059 (self-merge on green `quality`), R-082, R-085, R-086.
**PR:** `#179`.

---

## 1. The seven steps, and what each one actually found

### Step 1. The script exists. The working copy was lying.

`scripts/ext/serve-sample-documents.mjs` is the path, and the claim was correct.

It did not look correct. `/Users/ivan/rc-inventory` was sitting on a `main`
**sixteen commits behind `origin/main`**, where `scripts/ext/` does not exist and
`grep -r document_source` over the entire tree returns nothing. The script had
been merged in `#159`. Everything below was done in a fresh worktree at
`origin/main`. Appended to `docs/LEARNINGS.md` as **"A stale clone made a merged
file look like it had never existed"**, because the failure mode is worse than
staleness in general: an absent file reads as a fact about the project, and a
grep returning nothing is the one result a stale checkout can forge.

### Step 2. Andre's report matches the code, and the code is not in production

The validator is `app/api/extraction/callback/route.ts` with its helpers in
`lib/data/extraction-types.ts`, **on branch `card/ext-15`, open as PR `#177` and
not merged**. Verbatim:

```ts
export const DOCUMENT_SOURCES = ["scan", "digital"] as const;
export const SAFE_DOCUMENT_SOURCE: DocumentSource = "scan";

export function isDocumentSource(v: unknown): v is DocumentSource {
  return typeof v === "string" && (DOCUMENT_SOURCES as readonly string[]).includes(v);
}

export function effectiveSource(v: unknown): DocumentSource {
  return isDocumentSource(v) ? v : SAFE_DOCUMENT_SOURCE;
}
```

```ts
if (body.document_source !== undefined && body.document_source !== null
    && !isDocumentSource(body.document_source)) {
  return NextResponse.json(
    { error: "document_source in afara multimii" },
    { status: CALLBACK_CODES.rejected },
  );
}
```

`CALLBACK_CODES.rejected` is `400`.

**Accepted, exactly:** `"scan"`, `"digital"`, `null`, and the field absent.
**Everything else:** `400` with a JSON body carrying `error`.

**`unknown` is NOT accepted**, so the instruction to leave it accepting `unknown`
had nothing to act on. Nothing was changed either way.

**Andre's report is right about the code and wrong about where the code is.** He
described the merged behaviour of an unmerged branch. On `origin/main` there is no
`document_source` handling at all: today a payload carrying
`document_source: "unknown"` is accepted and the field ignored, per the contract's
own rule that an unknown field is ignored and never guessed at. His decision to
drop `unknown` from the emitter is still correct and costs nothing, because our
acceptance is wider than his emission in both the current and the pending state.

### Step 3. Ruling R-096, and an id that is not the one the counter handed out

Committed: the sample document signed URL TTL rises from two hours to
twenty-four, for the four permanent test documents only.

- `scripts/ext/serve-sample-documents.mjs`, `TTL_SECONDS`: `2 * 60 * 60` becomes
  `24 * 60 * 60`.
- Scope is the four PDFs under `_samples/andre` plus that script's own throwaway
  probe object. Test fixtures, no client data.
- **No other signing path changes.** `lib/data/inbound-actions.ts:238` and
  `lib/data/extraction-fire.ts:23` both still sign at fifteen minutes, and both
  were checked rather than assumed.
- Reason line, as dispatched: **a TTL shorter than the counterparty response
  cycle produces repeat handoffs through the owner.**

**The id is `R-096` and the committed counter said `R-087`.** `R-087` through
`R-095` are each already written as a **different** decision on an open PR: `#172`
claims `R-087` to `R-091`, `#157` claims through `R-095`. Section 8b exists to
stop one number naming two decisions; taking `R-087` would have produced that
knowingly rather than as the invisible race the counter converts into a conflict.
`R-096` is the first id no open branch has written. The counter advances to
`R-097`, then `R-098` after the second ruling. Nothing was renumbered.
`check:unique-ids` is green. Appended to `docs/LEARNINGS.md` as **"Three open PRs
and the committed counter all pointed at the same ruling id"**.

### Step 4. Three URLs, curled before anything was written

Regenerated from the repo at the new TTL. The token's own claims confirm it:
`exp - iat` = **86400**.

| | URL | status | content-type | body |
|---|---|---|---|---|
| a | Matnord scan, live | **200** | `application/pdf` | 270251 bytes, `%PDF-1.3` |
| b | same object, signature tampered | **401** | `application/json; charset=utf-8` | `"code":"INVALID_TOKEN"` |
| c | good signature, object removed | **404** | `application/json; charset=utf-8` | `"code":"OBJECT_NOT_FOUND"` |

All three match `docs/contracts/document-url.md` section 3. **No path returned
`text/html`**, checked on the bodies of b and c rather than inferred from the
content-type header.

The live one was fetched **four times**. All four returned 200 and 270251 bytes,
and the sha256 of every response equals the sha256 of the local sample:
`822caa0d5a81d754ef941d9b73de5f3cbc47b552ecbecf6ec2488a9896887d02`. That is the
evidence behind the repeat-runs line in the handover file; it was measured, not
reasoned from the TTL.

`cache-control: private, no-store` present on the success response.

### Step 5. The handover file

`/Users/ivan/rc-samples/ANDRE-LINKS.md` rewritten with the three labelled URLs,
the absolute expiry (**2026-09-04 19:58:37 UTC / 22:58:37 EEST, UTC+03:00**), the
observed status and code for b and c, and the repeat-runs line. No board ids, no
ruling ids, no internal file paths.

**One consequence of "containing only" that the owner should see:** the previous
version of that file carried live links for all four sample documents plus the
failure-contract table. It now carries the Matnord scan alone. If the
counterparty needs the other three live, regenerating them is one command.

### Step 6. Ruling R-097, three amendments to a frozen contract

`docs/contracts/extraction-v2.md` section 8 becomes **four** prompt rules. New
8.4, citing R-097 amendments 1, 2 and 3:

1. the emitter carries `scan` and `digital`, nothing else
2. **the model declares `scan` whenever it is not certain** - a prompt rule, the
   first layer, which is why it sits in section 8 and not section 4
3. absent reads as `scan` on our side - the second layer, and explicitly not a
   replacement for 2, because a prompt rule enforced only by our default is one
   nobody can observe being broken

And the note that is not an amendment because it changes nothing: **our
validator's accepted set is not narrowed by any of the three.** Acceptance may be
wider than emission and is never narrower. Either deploy order is then safe, and
Andre can drop a value from his emitter without coordinating with us.

Placed in section 8 because no open branch touches it, checked across all five
open PR branches before writing. `#177` amends section 4 with 4.2c on the same
field; the two compose and do not overlap.

### Step 7. Andre's blank-category report: NOT currently true in production

**The mechanism he describes is real.** `app/api/extraction/callback/route.ts`
reads the category vocabulary from the live rows before any write:

```ts
const { data: categoryRows, error: categoryError } = await supabase
  .from("categories").select("name").eq("active", true);
```

and then, per line:

```ts
category: (() => {
  const mapped = str(l.category);
  return mapped !== null && knownCategories.has(mapped) ? mapped : null;
})(),
```

A correctly mapped category that is not a row **at callback time** is written as
`null`. It is discarded on arrival, not merely unrendered, which is worse than
"surfaces as blank": re-rendering will never recover it and only a re-fire after
the row lands will. `category_raw` survives, so the document's own words are not
lost.

**But the row is there.** Read against production (`bwhzatwwjqmyfesfnisa`) on
2026-09-03:

- `applied_ledger_version()` -> `"0031"`
- `categories`, `active = true` -> **19 rows**, including
  `Vopsele, lacuri și solvenți` at `sort_order` 19, name matching migration 0029
  byte for byte
- `units` -> `m2, lm, pcs, bag, kg, roll, m3, t, l`

So the condition cannot arise for the category he is waiting on. Reported, not
acted on, and the run continued.

---

## 2. Defects found

Three, all appended to `docs/LEARNINGS.md` in this PR.

1. **The pending migration list said pending and production said applied.**
   `docs/migrations/APPLY-LOG.md` lists `0028`, `0029`, `0030` and `0031` as
   pending with the card that will apply each. Production reports `0031` applied
   and has every object the four files create. **This is the finding that
   matters most and it is not fixed here.**
2. **A stale clone made a merged file look like it had never existed.**
3. **Three open PRs and the committed counter all pointed at the same ruling id.**

### Why the first one is not fixed in this PR

Writing the four journal entries requires the evidence of the apply that actually
ran: pre-check, the applier's output, the destructive-statement declaration,
post-check. `APPLY-LOG.md` is **append only** and its entries are the record a
stranger reads without database access. Reconstructing that from the outside,
after the fact, by whoever noticed the gap, would produce a plausible entry that
nobody ran, in the one file whose value is that its entries are real.
`tests/e2e/headers.spec.ts` requires every migration file to be in exactly one of
the two lists, so the fix is a card with the applying terminal's evidence, not an
edit.

**The live cost, today.** `/Users/ivan/rc-samples/ANDRE-STATUS.md`, written
2026-09-03, tells the extraction counterparty that the nineteenth category and the
two units "land when the pending migration batch is applied to production, which
is a separate owner-run step". That paragraph is false and it is pointed at
somebody outside this company. It should be corrected before the next message to
him, and correcting it is a two-line edit needing no card.

---

## 3. Cards touched

None. This dispatch authored no card and closed none. `EXT-08` supplied the
script and stays `shipped`. `P3-29c` and `EXT-16` were read and not touched.

## 4. What shipped

`#179`, two commits plus a merge of `origin/main`:

- `R-096`: TTL to 24 hours, scope stated, other signing paths verified untouched
- `R-097`: three amendments and the not-narrowed note, contract section 8.4
- learnings and this report

`quality` passed in **14m20s** on the pre-merge head, which is a full run rather
than the ~9s docs-only skip. Re-running on the merge commit, because the branch
was one commit behind `origin/main` at merge time and a green run on an
un-rebased branch tests a `main` that no longer exists. Updated by **merging
`origin/main` in**, not by rebasing: CLAUDE.md section 3 forbids force pushes on
every branch, `--force-with-lease` included.

## 5. What blocked

Nothing. No `ask.sh` was raised and no step stopped.

## 6. State at the end, for the next session

1. **`APPLY-LOG.md` owes four entries** for `0028` through `0031`, and the
   terminal that ran the apply has the evidence. Until then the repository says
   pending about four migrations production says are applied.
2. **`ANDRE-STATUS.md` carries the false paragraph** described in section 2.
3. **`#177` (`EXT-15`) is still open**, so `document_source` is contract and code
   on a branch, not behaviour in production. Andre has dropped `unknown` from his
   emitter already, which is safe in both states.
4. **The live sample link expires 2026-09-04 19:58:37 UTC.** Re-running
   `scripts/ext/serve-sample-documents.mjs` issues fresh ones at the new 24 hour
   TTL; `--capture-only` skips re-uploading the four PDFs.
