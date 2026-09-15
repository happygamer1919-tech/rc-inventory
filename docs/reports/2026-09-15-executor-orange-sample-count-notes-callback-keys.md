# ORANGE, EXECUTOR, 2026-09-15: #297 merged, every four-document passage noted, the counterparty's keys against our validator, final sample links

Owner dispatch received after `docs/reports/2026-09-15-executor-orange-r096-scope-buyer-block-lines-arm.md`.
Role EXECUTOR (ORANGE). **Ratified by the owner: deviations 1, 3, 4, 5, 6 and 7 of
that report. Refused: deviation 2, fixed here in step 1. Nothing new in this report
is self-ratified.**

**Outcome.**
- **Step 1.** #297 is merged as `de2cfaa`, on `quality` green for its exact head
  `42cc7af` with merge state CLEAN. Every remaining passage that puts the sample
  set or R-096 at four documents now carries the same dated note: **44 locations,
  36 in files and 8 card notes.** Nothing was removed. Card EXT-33.
- **Step 2.** The validator accepts every key the counterparty sends except in two
  shapes it refuses with 400, both listed below. Two of his keys reach us under a
  different name and are lost: `supplier` and his page count. Five of his keys are
  dropped outright, and five of his `_meta` keys are stored but never read.
- **Step 3.** Page count is read from `_meta.page_count` at
  `app/api/extraction/callback/route.ts:86`. He sends `pages` and `_meta.pages`,
  so his page count is stored as null.
- **Step 4.** Six links, `/Users/ivan/rc-samples/ANDRE-SAMPLES-FINAL.md`, mode
  600, 22 lines, expiring **`2026-09-16T16:01:17.891Z`**.

No key, token or signed URL appears here or in any commit.

---

## BOOT

`docs/board/rc-board-phase2.json` at `origin/main` `f4e0140`:
- **Cards:** todo 32, in_flight 0, blocked 2, halted 0, shipped 68.
- **Launch gate:** **6/9**.
- **Next eligible card:** **AUT-3**. Not worked, because this dispatch names its
  steps.

Phase 3 at the same commit: todo 37, shipped 65, gate 0/9.

## STEP 1. #297 merged, then every four-document passage noted

**The merge.** `quality` on `42cc7afebeae34b4ecac03f14a840820b714bb15`: completed,
success. `mergeStateStatus`: CLEAN. It was squash-merged with
`--match-head-commit` on that sha, merge commit
`de2cfaa4d7b4107a8ca1e48f199de8b6b1034479`.

**What was searched.** Every tracked text file, and every string of every card
on the three boards, was searched for: "four sample", "four permanent", "four
test", "four PDFs", "four documents", "four links", "the four `_samples/andre`",
"all four sample", "cele patru documente", "patru documente". A hit is in scope
when it states or presupposes that the sample set, or R-096's scope, is four
documents. "Four tests", "four checks", and "four fixtures" of a migration check
are other subjects and are out of scope.

**The note.** It is the same everywhere, in the language each file already uses:

> **Note 2026-09-15, card EXT-33:** the sample set under `_samples/andre` holds six
> documents since 2026-09-15, and R-096 as amended that day covers every document
> under that prefix, not a fixed count of four. The four named here are the
> original set; nothing above is changed.

It goes after the paragraph holding the hit, or after the table when the hit is in
a table or its paragraph introduces one. Two hits inside one paragraph or one
tight list share one note.

### The full list of locations changed, 44

**Code comments, 4.** Only comment lines changed; the non-comment lines of each
file are identical to `origin/main`.
1. `lib/data/extraction-types.ts:162`: "unul dintre cele patru documente de proba
   este un PDF fara strat de text"
2. `scripts/ext/serve-sample-documents.mjs:174`: the probe "fara sa atinga
   niciunul dintre cele patru documente", the comment the last report left
3. `scripts/poc-free/check-reconciliation.mjs:219`: "These are the four documents
   Andre was sent", which also covers the heading string it prints, "ALL FOUR
   sample documents"
4. `scripts/poc-free/check-reconciliation.mjs:251`: "Four documents that all
   landed at exactly zero"

**Rulings, `decisions/inbox.md`, 5.**
5. `:5969`: "handover file carrying four links at the old two hour TTL"
6. `:13080`: after the table whose row reads "the four `_samples/andre` fixtures
   only"
7. `:13088`: "R-096 RAISED IT TO TWENTY-FOUR, on 2026-09-03, for the four test
   documents only"
8. `:13186`: "ADOPTED WITHOUT CHANGE. ... The four sample documents are
   TWENTY-FOUR HOURS"
9. `:13198`: after the table whose row reads "the four sample fixtures only"

**Journal, `docs/PRODUCTION-WRITES.md`, 3.**
10. `:77`: "The script writes four objects and captures responses"
11. `:128`: "One run over all six would have rewritten the four existing objects"
12. `:132`: "The TTL is R-096's, and R-096's text names four documents"

**Contract, `docs/contracts/extraction-v2.md`, 5.** The first three are the
passages the owner named.
13. `:378`: "one of the four sample documents is a PDF with no text layer"
14. `:654`: "The four sample documents are synthetic and are already through"
15. `:1102`: under the heading "The four sample documents are the fixtures, and
    all four hold both checks"
16. `:1115`: after the table introduced by "`npm run check:reconciliation` carries
    all four sample documents' header figures"
17. `:1121`: "Four documents all landing at exactly zero would not have shown that
    the tolerance is reachable"

**Past reports, 15.**
18. `docs/reports/2026-09-02-executor-ext-08-deployed-captures.md:133`:
    "`--capture-only` to skip re-uploading the four documents"
19. `docs/reports/2026-09-02-executor-ext-08-deployed-captures.md:139`: "for any of
    the four documents"
20. `docs/reports/2026-09-02-executor-ext-08-sample-documents.md:3`: the title,
    "the four sample documents and the failure contract"
21. `docs/reports/2026-09-02-executor-ext-08-sample-documents.md:176`: "true for the
    four sample documents and false for every real one"
22. `docs/reports/2026-09-02-executor-ext-08-sample-documents.md:180`: heading "7.
    The four documents"
23. `docs/reports/2026-09-03-executor-ext-15-document-source.md:17`: "One of the
    four sample documents is a PDF with no text layer"
24. `docs/reports/2026-09-03-executor-sample-ttl-and-document-source.md:75`: "for
    the four permanent test documents only"
25. `docs/reports/2026-09-03-executor-sample-ttl-and-document-source.md:87`: "Scope
    is the four PDFs under `_samples/andre`"
26. `docs/reports/2026-09-03-executor-sample-ttl-and-document-source.md:134`: "live
    links for all four sample documents"
27. `docs/reports/2026-09-03-executor-sample-ttl-and-document-source.md:266`:
    "`--capture-only` skips re-uploading the four PDFs"
28. `docs/reports/2026-09-04-executor-board-edit-check-and-the-ext-tail.md:394`:
    heading "All four sample documents hold both checks"
29. `docs/reports/2026-09-04-executor-board-edit-check-and-the-ext-tail.md:415`:
    "Four documents all landing at exactly zero"
30. `docs/reports/2026-09-04-executor-dispatch-drain-and-doctrine.md:336`: "All four
    sample documents' header figures become fixtures"
31. `docs/reports/2026-09-11-executor-gate-07-the-host-that-was-there-all-along.md:125`:
    "for the four test fixtures only"
32. `docs/reports/2026-09-12-executor-orange-step-0-and-seven-cards.md:284`: "the
    four sample fixtures, `R-096` not reversed"

**The two 2026-09-15 reports, 4.**
33. `docs/reports/2026-09-15-executor-orange-andre-fixtures.md:209`: one note after
    the deviation list. It covers both "the four permanent test documents only"
    (deviation 1) and "the heading \"The four documents\"" (deviation 5), which sit
    in the same tight list.
34. `docs/reports/2026-09-15-executor-orange-r096-scope-buyer-block-lines-arm.md:91`:
    one note after the "Named as not edited" list. It covers "cele patru
    documente" and "four sample documents in three places".
35. `docs/reports/2026-09-15-executor-orange-r096-scope-buyer-block-lines-arm.md:117`:
    "The four PDFs are not in the repository"
36. `docs/reports/2026-09-15-executor-orange-r096-scope-buyer-block-lines-arm.md:130`:
    the quoted contract sentence "The four sample documents are synthetic"

**Card notes, `docs/board/rc-board-phase3.json`, 8.** The note is appended to
`notes`. The card fields that say four stay as written and are named here:
37. `EXT-08`: title "The four sample documents are served...", plain "the four test
    documents", defaults twice, notes
38. `EXT-09`: notes, "ONE OF THE FOUR SAMPLE DOCUMENTS SERVED UNDER EXT-08"
39. `EXT-13`: defaults, "The four sample documents are synthetic"
40. `EXT-14`: notes, "One of the four sample documents has no text layer"
41. `EXT-15`: defaults, "one of the four sample documents is a PDF with no text
    layer"
42. `EXT-16`: notes, "the four sample documents"
43. `EXT-18`: acceptance, evidence twice, and notes, "ALL FOUR SAMPLE DOCUMENTS"
44. `EXT-32`: notes, which named the passages this step notes

### Hits deliberately not noted, 9, and why

| location | why |
|---|---|
| `decisions/inbox.md:4618`, `:4624` | R-096 itself. Its own dated clause, appended by EXT-32, already says six. |
| `decisions/inbox.md:4674`, `:4676`, `:4680` | the quotations inside that clause |
| `docs/contracts/extraction-v2.md:1201` | already the note dated 2026-09-15, quoting the old table row |
| `scripts/ext/serve-sample-documents.mjs:4`, `:5` | already the EXT-32 dated header note, quoting the old header |
| `supabase/migrations/0033_extraction_document_source.sql:15` | **an applied migration.** CLAUDE.md 8.1: "A migration file is never edited after it has been applied." The comment still says "One of the four sample documents is a PDF with no text layer". |

### Verification

| check | result |
|---|---|
| verifier below: in-scope hits covered / named exclusions / unresolved | **50 / 9 / 0**, exit 0 |
| same verifier: lines removed outside the phase 3 board | **0** |
| same verifier: card fields changed other than an appended note | **0** |
| negative control: one contract note stripped in a scratch copy | 5 unresolved, **exit 1** |
| non-comment lines of the three code files against `origin/main` | `diff` exit 0, three times |
| `node --check` on both `.mjs` files | exit 0, exit 0 |
| `validate-board.mjs` phase 2 and phase 3 | exit 0, exit 0 |
| `check:reconciliation`, `check:unique-ids`, `check:conflict-residue`, `check:document-url`, `check:grant-revocation` | all exit 0 |
| em or en dashes added | 0 |

**The verifier, in full, so it can be run again without asking anyone.** Save it
as `verify-notes.cjs` and run it from the repository root with `node`.

```js
const fs = require("fs"); const { execSync } = require("child_process");
const RE = /four (sample|permanent|tests?|pdf|fixtures?|documents?|links|_samples|`_samples)|the four (sample|document|pdf|fixture|permanent)|all four sample|cele patru documente|patru documente|four supplier documents|patru pdf/gi;
const outOfScope = (m, line) => /^four tests$/i.test(m) || (/^(the )?four fixtures?$/i.test(m) && !/sample/i.test(line)) || (/^the four fixture$/i.test(m) && !/sample/i.test(line));
const files = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter((f) => f && !f.startsWith("node_modules") && /\.(md|mjs|js|ts|tsx|sql|sh|json)$/.test(f) && !/rc-board.*\.json$/.test(f));
const unresolved = [], covered = [], excluded = [];
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  let inR096 = false;
  lines.forEach((l, i) => {
    if (/^### R-096$/.test(l)) inR096 = true; else if (/^### R-/.test(l)) inR096 = false;
    RE.lastIndex = 0; let m; const ms = [];
    while ((m = RE.exec(l))) ms.push(m[0]);
    const inScope = ms.filter((x) => !outOfScope(x, l));
    if (!inScope.length) return;
    const where = `${f}:${i + 1}`;
    if (l.includes("EXT-33")) return;
    if (f === "decisions/inbox.md" && inR096) { excluded.push(`${where} (R-096 itself, carries the 2026-09-15 clause)`); return; }
    if (f === "docs/contracts/extraction-v2.md" && /column read \*"the four/.test(l)) { excluded.push(`${where} (already the 2026-09-15 dated note)`); return; }
    if (f === "scripts/ext/serve-sample-documents.mjs" && /EXT-32, 2026-09-15|cele patru documente" PANA LA 2026-09-15/.test(l)) { excluded.push(`${where} (already the EXT-32 dated header note)`); return; }
    if (f.startsWith("supabase/migrations/")) { excluded.push(`${where} (applied migration, CLAUDE.md 8.1)`); return; }
    if (/^\s*(\/\/|\*|\/\*\*)/.test(l) || /console\.log/.test(l)) {
      if (lines.slice(i, i + 40).some((x) => x.includes("EXT-33"))) covered.push(where); else unresolved.push(where + " :: " + l.trim().slice(0, 90)); return; }
    if (f === "docs/reports/2026-09-15-executor-orange-sample-count-notes-callback-keys.md") return;
    if (lines.slice(i, i + 40).some((x) => x.includes("card EXT-33:**"))) covered.push(where); else unresolved.push(where + " :: " + l.trim().slice(0, 90));
  });
}
for (const p of ["docs/board/rc-board-phase2.json", "docs/board/rc-board-phase3.json", "docs/board/rc-board.json"]) {
  const b = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const c of b.cards) for (const [k, v] of Object.entries(c)) {
    const s = typeof v === "string" ? v : JSON.stringify(v); RE.lastIndex = 0; let m; let hit = false;
    while ((m = RE.exec(s))) if (!outOfScope(m[0], s.slice(Math.max(0, m.index - 40), m.index + 40))) hit = true;
    if (!hit || c.id === "EXT-33") continue;
    if (String(c.notes || "").includes("CARD EXT-33")) covered.push(`${p} ${c.id}.${k}`); else unresolved.push(`${p} ${c.id}.${k}`);
  }
}
console.log("covered:", covered.length, "| excluded:", excluded.length, "| unresolved:", unresolved.length);
excluded.forEach((x) => console.log("  EXCLUDED", x)); unresolved.forEach((x) => console.log("  UNRESOLVED", x));
const numstat = execSync("git diff --numstat origin/main", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
let removedOutsideBoard = 0; for (const r of numstat) { const [a, d, f] = r.split("\t"); if (!/rc-board-phase3\.json$/.test(f)) removedOutsideBoard += Number(d); }
const base = JSON.parse(execSync("git show origin/main:docs/board/rc-board-phase3.json", { encoding: "utf8", maxBuffer: 1e8 }));
const head = JSON.parse(fs.readFileSync("docs/board/rc-board-phase3.json", "utf8"));
let boardBad = 0; for (const bc of base.cards) { const hc = head.cards.find((x) => x.id === bc.id); if (!hc) { boardBad++; continue; }
  for (const k of Object.keys(bc)) { if (k === "notes") { if (!String(hc.notes).startsWith(String(bc.notes))) boardBad++; } else if (JSON.stringify(bc[k]) !== JSON.stringify(hc[k])) boardBad++; } }
console.log("files changed:", numstat.length, "| lines removed outside the board:", removedOutsideBoard, "| board fields changed other than an appended note:", boardBad);
process.exit(unresolved.length === 0 && removedOutsideBoard === 0 && boardBad === 0 ? 0 : 1);
```

The diff-based halves compare against `origin/main`, so they mean something only
on the branch before it merges. The coverage half holds at any commit.

## STEP 2. The counterparty's emitted keys, against the validator on origin/main

**Source.** `app/api/extraction/callback/route.ts` on `origin/main` `de2cfaa`.
Nothing under `app/` or `lib/` differs from `b9059ee`, the commit that
`/Users/ivan/rc-samples/ANDRE-VALIDATOR-KEYS.md` is pinned to. Line numbers below
are on `de2cfaa`. `400` is `CALLBACK_CODES.rejected`
(`lib/data/extraction-types.ts:138`).

**The three verdicts.**
- **reads**: a line takes the value and stores or uses it.
- **ignores**: accepted, and no line reads it. There is no allowlist; an unknown
  key never answers 400.
- **400**: its presence, absence or value can refuse the whole payload.

### Success shape, top level

| his key | verdict | where, and what matters |
|---|---|---|
| `order_id` | **reads; 400** | `:120-123` must be 36 hex digits and hyphens; `:485` 400 when we sent no such document |
| `status` | **reads; 400** | `:125-128` must be `extracted`, `partial` or `failed`; `:235` 400 on `partial` with no `error_code` and no lines |
| `document_type` | **ignores** | no line reads it |
| `document_source` | **reads; 400** | `:166-172` 400 for any non-null value other than `scan` or `digital`; `:173` absent or null reads as `scan` |
| `supplier` | **ignores** | **we read `supplier_name`** (`:544`), so his value is lost and `supplier_name` is stored null |
| `order_ref` | **reads** | `:615`, written when the column exists |
| `client_ref` | **ignores** | no line reads it |
| `order_date` | **reads** | `:545`, a trimmed string, not checked as a date |
| `currency` | **reads** | `:551` |
| `currency_raw` | **reads** | `:552` |
| `prices_include_vat` | **reads** | `:373` for our classifier, `:549` stored; a non-boolean is stored null |
| `vat_rate` | **reads** | `:378`, `:550` |
| `subtotal` | **reads** | `:371`, `:375`, `:546` |
| `vat_amount` | **reads** | `:376`, `:547` |
| `document_total` | **reads** | `:372`, `:377`, `:548` |
| `reason` | **reads** | `:543` |
| `pages` | **ignores** | no line reads a top-level `pages`; see step 3 |
| `lines` | **reads; 400** | `:222-226` must be an array, else 400 `lines lipseste`; `:211-218` 400 when present on a scan failure |
| `_meta` | **reads** | `:561` stored verbatim; `:583` reads `page_count` from it and nothing else |

### Per line

| his key | verdict | where, and what matters |
|---|---|---|
| `product_name` | **reads; 400** | `:255-257` every line needs a non-empty string, else 400 for the whole payload; `:645` |
| `supplier_code` | **ignores** | no line reads it |
| `category` | **reads** | `:653-656`, stored only when it equals an active category name, otherwise null |
| `category_raw` | **reads** | `:657` |
| `description` | **ignores** | no line reads it |
| `quantity` | **reads** | `:646` |
| `unit` | **reads** | `:647`, a trimmed string; the route does not check it against the unit set |
| `unit_raw` | **reads** | `:648` |
| `unit_price` | **reads** | `:649` |
| `line_total` | **reads** | `:369` for our classifier, `:650` stored |

### Success `_meta`

| his key | verdict | where |
|---|---|---|
| `model` | **ignores**, kept inside the stored `_meta` | `:561` |
| `prompt_version` | **ignores**, kept inside the stored `_meta` | `:561` |
| `pages` | **ignores**, kept inside the stored `_meta` | `:561`; `:86` reads `page_count`, not `pages` |
| `duration_ms` | **ignores**, kept inside the stored `_meta` | `:561` |
| `partial_cause` | **ignores**, kept inside the stored `_meta` | `:561` |

### Failure shape

The seventeen scalars, `error_code` and `_meta`, with no `lines`. His description
says "the same seventeen scalars plus error_code and pages and _meta". `pages` is
already one of the seventeen, so this reads as 19 keys, not 20.

| his key | verdict | where, and what matters |
|---|---|---|
| the scalars | as in the success table | `document_type`, `supplier`, `client_ref` and `pages` ignored as above |
| `error_code` | **reads; 400** | `:130-133` must be one of the nine codes; `:150` 400 when absent on `failed` |
| `lines` absent | **accepted, or 400, by source** | `:210`, `:220`: accepted when the effective source is `scan`, which includes `document_source` absent or null. **400 `lines lipseste` at `:222-226` when he sends `document_source: "digital"` with `status: "failed"` and no `lines`**, because a digital failure keeps the lines shape |
| `_meta`: `model`, `prompt_version`, `pages`, `duration_ms` | **ignores**, kept inside the stored `_meta` | `:561` |

### Plainly

**Read under a different name, so the value is lost:**
- **`supplier`**: we read `supplier_name`. The supplier arrives blank.
- **his page count**: he sends `pages` and `_meta.pages`; we read `_meta.page_count`.
  The page count arrives as null.

**Dropped silently, stored nowhere:** `document_type`, `client_ref`, top-level
`pages`, and per line `supplier_code` and `description`. `supplier` is lost too,
as above.

**Kept but never read:** `_meta.model`, `_meta.prompt_version`, `_meta.pages`,
`_meta.duration_ms` and `_meta.partial_cause`, all inside the stored `_meta` blob.

**Accepted by us, never sent by him:** top-level `supplier_name` and
`order_ref_series`; per line `currency` and `currency_raw`; `_meta.page_count`.
`error_code` on a `partial`, where it is optional, is also never sent, because his
success shape carries no `error_code`.

**Refused with 400 against his list as written:**
- a digital failure: `document_source: "digital"`, `status: "failed"`, no `lines`
- a `partial` with no `error_code` and an empty `lines`

Neither is visible from the key list alone. Both depend on the values he sends.

## STEP 3. Where page count is read on an inbound payload

`app/api/extraction/callback/route.ts` on `origin/main` `de2cfaa`:

```
84:function pageCount(meta: unknown): number | null {
86:  const raw = (meta as Record<string, unknown>).page_count;
583:    draftUpdate.page_count = pageCount(body._meta);
```

- **Key path:** `_meta.page_count`. It must be an integer of 1 or more, otherwise
  null (`:87`), and it is written only when the column exists (`:582`).
- **Nothing else is read for it.** Neither a top-level `pages` nor `_meta.pages`
  is read anywhere in the route.

## STEP 4. Six links at TTL_SECONDS

The committed `scripts/ext/serve-sample-documents.mjs` (sha256
`052039be199b79096bcb4c9f08ce6ab114ad86d3e3e599fe4b180d5385ccdfb8`, identical to
`origin/main` after #297) ran with `--capture-only` over all six, 2026-09-15T16:01:17Z
to 16:01:31Z, exit 0. `TTL_SECONDS` is 86400.

- Path: `/Users/ivan/rc-samples/ANDRE-SAMPLES-FINAL.md`
- Mode: `-rw-------`
- Lines: **22**
- Expiry: **`2026-09-16T16:01:17.891Z`**

Checked afterwards, reads only, no link printed:
- prefix: 6 objects, 0 probe objects, 0 objects updated since run A's upload
- all six links through `/api/documents/`: HTTP 200, `application/pdf`, body
  sha256 equal to local, **6 of 6**
- failure contract through the route, unchanged: expired 400, invalid 401, missing
  404, no token 401

The run wrote and deleted one probe object, so `docs/PRODUCTION-WRITES.md` carries
a row for run C.

## DEVIATIONS, for ratification. None is self-ratified.

1. **A card was authored and shipped inside the dispatch again.** EXT-33 exists
   because comments under `lib/` and `scripts/` are code to `check:board-edit`.
2. **Applied migration 0033 is not noted.** Its comment still says "one of the four
   sample documents". CLAUDE.md 8.1 forbids editing an applied migration, and
   merging the file is what applies it.
3. **Card fields that say four stay as written.** The note is appended to each
   card's `notes`, not beside each title, plain, defaults, acceptance or evidence
   string; location 37 to 43 name them.
4. **Six hits share notes.** Two notes each cover two hits in one tight list
   (locations 33 and 34). One note covers the printed check heading together with
   its comment (location 3). The table-row hits get their note after the table
   (locations 6, 9, 16).
5. **A journal row was added that the dispatch did not ask for.** Run C wrote and
   deleted a probe object, and CLAUDE.md 8.8 requires a row for every terminal
   production write.
6. **Step 4 ran before the step 1 pull request.** It ran from the `card/ext-32`
   worktree at `42cc7af`, whose script is byte-identical to `origin/main` after
   #297 (the same sha256), so the row names the merged script.
7. **The verifier is in this report, not in `scripts/`.** Committing it as a
   script would have been scope. Its first run flagged four false positives, "the
   four fixtures" of a migration check twice and the EXT-32 header note twice, and
   those rules were narrowed in the verifier itself. No note was added to silence
   them.
8. **I merged #297 myself**, on the owner's instruction, with `quality` green on
   the exact head. The new pull request is left for the owner.

## STATE AT THE END

- **Pull request #298**, branch `card/ext-33`, carries the 44 notes, card EXT-33,
  the run C journal row and this report. Locally, before the pull request's
  `quality` run: the verifier exits 0 on the final tree (50 covered, 9 excluded,
  0 unresolved), and `check:board-edit` says "satisfied 1 of 1 card id(s)".
- Nothing blocked. Nothing sent to the counterparty.
- The final links expire `2026-09-16T16:01:17.891Z`.
- No `docs/LEARNINGS.md` entry: no defect was found in the repository.
