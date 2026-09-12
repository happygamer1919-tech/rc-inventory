# ORANGE, EXECUTOR, 2026-09-12: step 0 measured, nine ratifications recorded with a gap, seven cards authored, nothing built

Dispatch of 2026-09-12, which supersedes the previous one and carries its steps
forward. Role EXECUTOR. Worktree `/Users/ivan/rc-inv-orange`, detached from
`origin/main` at `404c5ab`, then branch `board/dispatch-20260912`.

**Nothing in this pass was built. No application code, no script, no migration.**

---

## BOOT

| board | cards | todo | in_flight | blocked | halted | shipped |
|---|---|---|---|---|---|---|
| phase 2 | 101 | 31 | 0 | 2 | 0 | 68 |
| phase 3 | 85 | 33 | 0 | 0 | 0 | 52 |

Phase 2 launch gate **6 of 9** (`readiness_passed` 6, denominator 9, three
conditions at `fail`). Next eligible card, by `scripts/poc/card-order.mjs` across
both boards: **CI-04**, "Two end-to-end specs fail intermittently with `retries`
at 0", 62 eligible in total. **Not worked**, per the dispatch's step 6.

---

## STEP 0. VERIFY. Eight questions, eight answers, each from source or from a
## live read.

### 1. `main` sha and open pull request count

`git fetch --all --prune` reached the network and reported every ref up to date;
`.git/FETCH_HEAD` timestamped `2026-09-12T22:43:26Z`.

- **`origin/main` is `404c5abdabbcd38ecb35b33da982b8eedb2cfa36`**, "GATE-07: the
  deployed-commit guard targets the host that actually serves this application
  (#275)", 2026-09-11.
- **Open pull requests: 0.** `gh pr list --state open --limit 300` returns an
  empty list against `happygamer1919-tech/rc-inventory`.
- Incidental: the shared clone at `/Users/ivan/rc-inventory` sits on `main` at
  `af9f592`, **56 commits behind**. Nothing in this report was read from it.

### 2. Does a document download route exist, and does it serve on `app.rapidconstruct.md`?

**Yes to both. The path is `app/api/documents/[...path]/route.ts`**, shipped by
card EXT-08, with the failure contract in `lib/data/document-url-contract.mjs`
and the public-path exception at `proxy.ts:69`.

Measured live on 2026-09-12, read-only, no credential:

| request | status | content-type | body |
|---|---|---|---|
| `GET app.rapidconstruct.md/api/health` | 200 | `application/json` | `{"commit":"404c5ab...","ledger_version":"0037","at":"2026-09-12T22:45:19.948Z"}` |
| `GET app.rapidconstruct.md/api/documents/order-documents/<absent>` no token | **401** | `application/json` | `{"code":"INVALID_TOKEN","error":"Jeton absent."}` |
| same with a non-token probe string | **401** | `application/json` | `{"code":"INVALID_TOKEN","error":"Jeton invalid. Legatura este stricata, nu expirata."}` |
| `POST` the same path | **405** | `application/json` | `{"code":"METHOD_NOT_ALLOWED","error":"Numai GET."}` |
| `GET www.rapidconstructmd.com` same path | 404 | **`text/html`** | GitHub Pages "Site not found" |

**The deployed commit equals `origin/main`.** No signed URL and no token value was
generated, printed or echoed at any point, per step 6.

**`OBJECT_NOT_FOUND` could not be exercised**: it needs a VALID signature over an
absent path, which needs a credential this session may not read. Stated rather
than inferred.

**AND THE ORIGIN THE APPLICATION WOULD USE IS A DEFECT.** `siteOrigin()` in
`lib/data/extraction-fire.ts:51` falls back to the literal
`https://www.rapidconstructmd.com` when `NEXT_PUBLIC_SITE_URL` is empty or
absent. That is the host that answers with a GitHub Pages 404 above, and card
GATE-07 already moved the deployed-commit guard off it. `callbackUrl()` reads the
same function, so the address Make is told to post results back to carries the
same fallback. **Whether production is running on the fallback today cannot be
read from outside**: `NEXT_PUBLIC_SITE_URL` is referenced in exactly one place in
the application and no public endpoint exposes it. Carded as `EXT-30`, not fixed.

### 3. The `error_code` enum, verbatim, from every migration

Two migrations touch the type. Verbatim from `0008_extraction_drafts.sql`:

```sql
create type public.extraction_error_code as enum (
  'download_failed',
  'url_expired',
  'unsupported_format',
  'unreadable_document',
  'extraction_failed',
  'invalid_output',
  'timeout'
);
```

Verbatim from `0034_error_code_reconciliation_failed.sql`:

```sql
alter type public.extraction_error_code add value if not exists 'reconciliation_failed';
```

`0037_extraction_platform_verdict.sql` adds a COLUMN of that type,
`platform_error_code`, and adds no label. No other migration touches it.

**ACCEPTED VALUES, EIGHT:** `download_failed`, `url_expired`,
`unsupported_format`, `unreadable_document`, `extraction_failed`,
`invalid_output`, `timeout`, `reconciliation_failed`. The application's copy of
the same set is `EXTRACTION_ERROR_CODES` in `lib/data/extraction-types.ts` and it
agrees.

### 4. Are `expired_token`, `invalid_token`, `object_not_found` among them?

**No. None of the three is in the enum, and none ever was.** They are not missing
by oversight: they belong to a **different namespace**. They are the failure codes
of our own download route, defined as `EXPIRED_TOKEN`, `INVALID_TOKEN` and
`OBJECT_NOT_FOUND` in `lib/data/document-url-contract.mjs`, each paired with an
HTTP status of 400, 401 and 404, and read by the extractor at download time
rather than stored on a draft.

**Two of the three already have a meaning inside the extraction enum:**
`url_expired` is the signed link expiring, which is what `EXPIRED_TOKEN` reports,
and `download_failed` covers a download that produced no document, which is where
`INVALID_TOKEN` lands today. `OBJECT_NOT_FOUND` has no equivalent. **This is
carried into card EXT-27 as an open question with both readings and no
recommendation**, because whether the extractor should relay our route's code
verbatim or translate it is a product decision.

### 5. Where does the failure screen take its text from, `error_code` or `reason`?

**Both, on two separate lines, and the instruction comes from `error_code`.**
`components/orders/ExtractionReviewPanel.tsx`, in the draft list, lines 570 to 583:

```tsx
{draft.errorCode ? (
  <p
    className="text-[12.5px] text-rc-black mt-2"
    data-testid="draft-error-sentence"
    data-error-code={draft.errorCode}
  >
    {EXTRACTION_ERROR_LABEL[draft.errorCode]}
  </p>
) : null}
{draft.reason ? (
  <p className="text-[12.5px] text-rc-muted mt-1" data-testid="draft-reason">
    {draft.reason}
  </p>
) : null}
```

The sentence Mihai reads comes from `EXTRACTION_ERROR_LABEL`, keyed on
`error_code`, in `lib/data/extraction-types.ts`. `reason` is the sender's free
text and renders beneath it as an unlabelled muted line. **The two conditions are
independent**, so a draft with a `reason` and no `error_code` shows the free text
alone. The header-only scan screen at line 196 of the same file shows `reason`
and no code at all.

### 6. Does a repeated `order_id` return 200 as a duplicate?

**Yes, and the flag is read from `callback_at`, not from `status`.**
`app/api/extraction/callback/route.ts`:

```ts
const isRepeat = existing.callback_at != null;
```

```ts
return NextResponse.json(
  { order_id: orderId, status: effectiveStatus, lines: dropLines ? 0 : rawLines.length },
  { status: isRepeat ? CALLBACK_CODES.duplicate : CALLBACK_CODES.accepted },
);
```

`CALLBACK_CODES.duplicate` is `200` and `accepted` is `202`, in
`lib/data/extraction-types.ts`. A payload for an `order_id` that has no draft row
at all is `400`, "order_id necunoscut", not 200. `refireExtraction` deliberately
does NOT clear `callback_at`, and its comment says why: clearing it would let a
re-fire reset the contract's idempotency counter silently.

### 7. Is `prompt_version` parsed, constrained or length-limited anywhere?

**No, in all three senses, and nothing bounds the object that carries it.**
The whole `_meta` object is stored verbatim as `jsonb`:

```ts
meta: body._meta ?? null,
```

The only key ever read out of it is `page_count`, through the `pageCount()`
guard. `prompt_version` appears in this repository in exactly two places: the
contract document `docs/contracts/extraction-v2.md`, which describes it, and the
end-to-end fixtures that send `"v2.0"`. **No validation, no allowed set, no
length cap, no size limit on the request body**: `next.config.ts` sets no body
size limit and the route calls `request.json()` directly. The only gate in front
of it is the shared-secret header check.

### 8. PAGE COUNT. Can the upload path count PDF pages before the webhook fires?

**YES. All three parts answer yes, and the answer is measured rather than
reasoned.**

**(a) Are the bytes available at that point?** Yes. `startExtraction` in
`lib/data/extraction-actions.ts` receives the uploaded `File` from the form,
already reads `file.size` and `file.type` off it, and hands the object itself to
Supabase Storage, all before `fireExtraction` is called. Nothing has to be
downloaded back.

**(b) Would the count run server side?** Yes. `startExtraction` is in a
`"use server"` module, so it already runs on the server and nothing new is
exposed to a browser.

**(c) What libraries already in the dependency tree can do it?** **None, and none
is needed.** The direct dependencies are `@supabase/ssr`, `@supabase/supabase-js`,
`next`, `react`, `react-dom` and `server-only`. The only PDF-adjacent package
anywhere in `package-lock.json` is `sharp`, which is an OPTIONAL dependency of
`next` and whose prebuilt libvips has no PDF support. **The counter needs no
package at all**: a PDF page count is the `/Count` on the page-tree root, and on
a modern file that object lives inside a `FlateDecode` object stream, which Node's
built-in `node:zlib` inflates.

**MEASURED, 2026-09-12, with `pdfinfo` as ground truth, on 1535 real PDF files
totalling 423 MB:**

| corpus | correct | no answer | wrong |
|---|---|---|---|
| all 1535 files | **1526** | 2 | 7 |
| the 137 using compressed object streams, plain text scan only | 52 | 85 | 0 |
| the same 137, with the `zlib` inflate fallback | **136** | 1 | 0 |

About forty lines, **0.2ms per file** on average. **The seven wrong answers are
all UNDERCOUNTS** and the cause is known: the probe took the LARGEST `/Count` it
could see, which on a nested page tree is a subtree rather than the root.
Resolving the trailer's `/Root` to its `/Pages` is the fix. The probe is not the
deliverable; its numbers are the floor.

**SO THE DISPATCH'S CONDITIONAL DOES NOT FIRE.** Step 2 said to card only (c) if
step 0 found we cannot count at upload. We can, so **(a), (b) and (c) are all
carded**, as `EXT-28`.

**AND THIS CORRECTS A PREMISE ALREADY IN THE RECORD.** Card `EXT-24`'s question
field rules out counting the pages ourselves because it "needs a PDF library this
repository does not have, which is a vendor decision under item 4 of the closed
escalation list. NOT recommended on those grounds alone." **The necessity is
false; the caution was not.** The sentence stays where it is, per CLAUDE.md
section 9c, and `docs/LEARNINGS.md` gains the general form.

**One more thing the count needs, found the same way:** `refireExtraction` reads
only the draft row and never holds the file bytes, so a count computed at upload
has to be STORED or it is unavailable on every re-fire. And it must NOT be
written into `page_count`, whose own column comment in migration 0032 says the
value is "Pages in the source document AS THE MODEL REPORTS THEM, not as counted
by us". Two facts, two columns; comparing them is the whole signal.

---

## STEP 1. RATIFICATIONS. Recorded as ruling R-195, with one gap named.

`decisions/inbox.md` gains **R-195** and `decisions/NEXT-RULING-ID` advances to
`R-196` in the same commit, per CLAUDE.md section 8b.

**(a) Deviation 1 is the owner's and records as his.** It is item 1 of section 6
of `docs/reports/2026-09-11-executor-ext-26-...md`: the dispatch's rationale for
its step 2 was false about the shipped code, and the card shipped on a corrected
premise. Second time; `R-188` set the precedent.

**(b) R-193's third instance is replaced, and the original stays with both
readings**, per the owner's instruction and CLAUDE.md section 9c. The amendment
is written INTO R-193, below the original, under the heading "INSTANCE 3 IS
REPLACED, 2026-09-12, BY RULING R-195".

**The replacement was measured before it was written, and one clause of the
dispatch needed pinning down.** The window is real: `www.rapidconstructmd.com`
stopped serving this application on **2026-09-07** and the guard's default origin
was repointed on **2026-09-11**. **Four days.** But
`check-deployed-commit.mjs` cannot be green about anything: it never runs in
`quality`, and its own header says **EVERY FAILURE IS A REFUSAL**. What WAS green
on every pull request for those four days is **`prove:deployed-commit`**, which
drives the check against a fake health route on `127.0.0.1` and therefore
overrides the origin on all eleven refusals and all eleven controls. **The proof
was green about the refusal logic and was structurally incapable of seeing the
host.** Had the check itself run, it would have REFUSED, which is what `R-178`
predicted on 2026-09-08: "its next refusal will be spurious and will invite a
workaround". The instance is true; the subject is the proof, not the check.

**(c) The TTL does not move.** Fifteen minutes in production, twenty-four hours on
the four sample fixtures, `R-096` not reversed, `R-194(c)`'s security position
unchanged. **The two-hour figure is recorded as matching nothing in this
repository**, re-read at `404c5ab`, which is the owner's own instruction and which
`R-194(c)` could report but not ratify.

**(d) "All nine" is recorded as GRANTED and is NOT enumerated, and that is a
flagged gap.** The superseded dispatch carrying the numbered list was never
committed, and **the two 2026-09-11 reports flag twelve deviations between them,
not nine** (seven and five). Nine is reachable from twelve by more than one
deduplication. **This terminal picked none of them**, per CLAUDE.md section 4.
R-195 carries the full table of twelve so a reader has the superset, and says
that every item in it is ratified.

---

## STEPS 2 TO 5. Seven cards authored. None built.

| id | board | step | what it is |
|---|---|---|---|
| `EXT-27` | 3 | 5b | Two new error codes, one Romanian sentence and one instruction each, plus a check that refuses two codes sharing a sentence |
| `EXT-28` | 3 | 2 | The page count, computed by us at upload with no new dependency, feeding all three consumers |
| `EXT-29` | 3 | 3 | The 3,500,000 byte threshold, matched exactly, with its origin recorded as unknown |
| `EXT-30` | 3 | 4 | The download route contract on the right host, and three failure test links for the counterparty |
| `EXT-31` | 3 | 5a | The extracted-payload concern gap |
| `P3-44` | 3 | 5c | Reproduce the owner's 2 to 4 seconds from a real client, or state that it could not be |
| `P2-21` | 2 | 5d | A detector that fires when a row appears that is not one of ours |

Two existing cards gain one edge and one note each, and nothing else about either
changes:

- **`P3-40` now depends on `P3-44`.** Its first acceptance clause already said
  reproduction comes before any change; the edge is what makes that a queue
  position rather than an intention.
- **`P2-13` gains a note** pointing at `P2-21`. Its parking, and every terminal
  grant, are untouched.

### What each card says that the dispatch did not, and why

**`EXT-27`.** `download_failed` **is not a new code**: it has been in the enum
since `0008` and the application already emits it on both the upload and re-fire
paths. What it lacks is an INSTRUCTION, which is a real defect against card
EXT-19's rule, so it stays in the card as copy work rather than as an addition.
The three route codes are carried as an open question with both readings, for the
namespace reason in step 0 answer 4.

**`EXT-28`.** All three consumers, because step 0 says we can count. It also
requires a SECOND column rather than writing `page_count`, and requires the
outbound webhook change to be flagged as a contract amendment reaching Andre, with
the other three clauses shipping without him if he blocks it.

**`EXT-29`.** The origin claim was checked, not transcribed: `3500000`,
`3_500_000` and `3,500,000` appear in no file at `404c5ab` and in **no commit on
any branch** under `git log -S`. The card also refuses to invent a behaviour for
the threshold, because the dispatch gave a predicate and no consequence, and a
number acquires a derivation the moment somebody uses it in a second place.

**`EXT-30`.** The route and its three codes are already built and already correct;
the defect is the fallback origin. The card also names `callbackUrl()` as the
second consumer of the same function, and states up front that the
`OBJECT_NOT_FOUND` test link needs a signature and therefore an owner action.

**`EXT-31`.** The dispatch's sentence is true, and one nuance narrows it:
**`reason` is accepted, stored and rendered on an `extracted` payload today**. So
the closed channel is the MACHINE-READABLE one. Three options with their costs,
**no recommendation**, and a first acceptance clause that proves the gap with a
failing case before anybody rules.

**`P3-44`.** The dispatch's arithmetic is right: 32 times 0.05 is 1.6 and 32 times
0.08 is 2.56. **What it assumes is the multiplier.** `P3-40`'s own committed
measurement says the 32 round trips are function-to-database, that the
client-to-edge leg is common and subtracts out, and warns in terms against
multiplying 32 by a single figure. **Both readings are in the acceptance as things
to settle with evidence and neither is adopted.** `eu-west-1` is not asserted
anywhere in this repository that step 0 could find, and the card does not need it
to be true.

**`P2-21`.** `P2-13`'s note says such a check "would have to decide what `real`
means about a row", and that is true of a detector that recognises real data. The
card builds the **complement**: our rows are enumerable from committed seed
migrations and fixtures, and anything else is the alarm. Allow-list from committed
sources only, because `check:live-fixtures` refuses a fixture built from live
state. Read-only connection, no column value ever printed, four mutants against
the local postgres shim so the whole proof runs with no credential, and NOT wired
into `quality`, because `check:no-prod-target` is correct.

---

## GATES RUN

```
node docs/board/validate-board.mjs <all three boards>   PASS 0 violations
npm run check:unique-ids        OK   206 card ids, 195 ruling ids, R-195 new, NEXT-RULING-ID R-196
npm run check:open-branch-ids   OK   no id claimed elsewhere
npm run check:card-ids          OK
npm run check:card-order        OK
npm run check:board-clock       OK
npm run check:board-app         OK
npm run check:conflict-residue  OK
npm run check:document-url      OK
npm run check:reconciliation    OK
npm run check:assertion-register OK
npm run check:board-edit        NOT A PULL REQUEST at author time; this pull request carries no code file
```

`npm run id:free` answered FREE for `EXT-27`, `EXT-28`, `EXT-29`, `EXT-30`,
`EXT-31`, `P3-44` and `P2-21` against main, all 0 open pull requests and this
working tree.

**Not run, and each for a stated reason:** `npm run check:migrations` and
`prove:applier` need Docker and this pass adds no migration; `npx playwright test`
and `npm run build` are code gates and this pass changes no code file. The
authority remains the `quality` run on the head sha.

---

## DEVIATIONS, FLAGGED AND NOT SELF-RATIFIED

1. **An EXECUTOR authored seven board cards and one ruling.** Both are AUTHOR's
   and POC's work under CLAUDE.md section 1. Instructed by the dispatch, which
   says "CARD, do not work" throughout. **This is the fifth consecutive session in
   which a terminal writes rulings outside its role**, and the previous four each
   flagged it. Recorded inside R-195 as well as here, because a deviation that
   only ever appears in the reports of the sessions committing it is a deviation
   whose frequency nobody can see from the decisions.

2. **The nine ratifications could not be enumerated and were recorded as a grant
   over a superset of twelve.** Step 1 above and R-195(d). **This is the one
   thing in this pass that a reader should treat as incomplete.**

3. **The dispatch's replacement instance for R-193 was, as written, false about
   the shipped code**, in the same way the instance it replaces was. A check whose
   every failure is a refusal cannot be "green about something other than what it
   claimed". The true subject is `prove:deployed-commit`, and the ruling says so.
   **Second consecutive dispatch in which this happens**, and the pattern is the
   finding rather than either instance.

4. **`download_failed` was dispatched as a new error code and is not one.** It has
   been in the enum since `0008` and is already emitted twice in
   `lib/data/extraction-actions.ts`. `EXT-27` treats it as copy work instead, and
   says so in its own notes rather than quietly adding a label that exists.

5. **Two existing cards were edited by a pass that was told not to build
   anything.** `P3-40` gains a `depends_on` edge and a note; `P2-13` gains a note.
   The dispatch said "P3-40 must reproduce before it optimises", and "before" is a
   queue position, which on this board is an edge. Both edits are additive, both
   are described above, and neither changes an acceptance, a status or a grant.

6. **The board artifacts were not regenerated.** `docs/board/*.rendered.html` has
   not been regenerated by any of the last several board commits and is already
   stale against the JSON. Regenerating it was not asked for and is not this
   pass's scope; it is noted so the next reader does not take the HTML for the
   board.

7. **`OBJECT_NOT_FOUND` could not be exercised on the live route** and
   **the production value of `NEXT_PUBLIC_SITE_URL` could not be read.** Both need
   a credential. Neither is inferred anywhere above.

**Nothing in this section is ratified here.**

---

## STATE AT THE END

Phase 2: **6 of 9**. Phase 3: **0 of 9**. Boards now carry 102 and 91 cards.

**What the next session should know first:**

1. **We can count PDF pages with no new dependency and it is measured.** 1526 of
   1535 correct with `node:zlib` alone. `EXT-28` carries it. The premise in
   `EXT-24` that said otherwise is corrected in `docs/LEARNINGS.md` and left where
   it stands.
2. **`lib/data/extraction-fire.ts` still falls back to the host that left**, and
   `callbackUrl()` reads the same function. `EXT-30`. Whether production is on the
   fallback today is unknown from outside.
3. **The nine ratifications are a gap in the record.** R-195(d) is where somebody
   would look for the enumeration and it is not there.
4. **`EXT-25` is still the highest-value unworked extraction card**, and this pass
   adds to what it owes Andre: the outbound field in `EXT-28` clause 1, and
   whichever option `EXT-31` takes.
5. **`P2-13`'s parking now has a carded detector and still has no built one.**
   The condition is enforced by nothing until `P2-21` ships.
