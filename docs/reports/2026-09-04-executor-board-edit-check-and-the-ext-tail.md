# EXECUTOR: the board-edit check, the queue-throughput card, and the EXT tail

**Run date (UTC):** 2026-09-04
**Role:** EXECUTOR
**Dispatch:** build the board-edit check ahead of EXT-17; author a queue-throughput
card without building it; then EXT-17, EXT-18, EXT-19 as reduced, EXT-20; merge
#198 and finish at zero open pull requests.

---

## 0. What was verified before anything was built

Nothing in the dispatch was taken as state. Every claim below was read from the
live repository first.

| Claim in the dispatch | Verified | Result |
|---|---|---|
| `#198` is open and must be merged | `gh pr view 198` | **ALREADY MERGED** at 2026-09-04T23:01:07Z, merge commit `b365c3f`. Step 4 was complete before this session started. |
| the queue must finish at zero open PRs | `gh pr list --state open` | **ZERO** open pull requests at session start. |
| `#195` merged EXT-16's code with the card still `todo` | `git show 53df12c:docs/board/rc-board-phase3.json` | **CONFIRMED.** EXT-16 `status` is `todo` in the merge commit itself. The phase 3 board WAS touched in that pull request, by exactly two lines, and they were EXT-19's `notes`. |
| `#192` left AUT-17 `in_flight` with no evidence | `git show a28548d` | The MERGE commit carries AUT-17 as `shipped` with evidence, and that evidence says in its own words that "THE BOARD FLIP WAS MISSING FROM THE PULL REQUEST AS AUTHORED". The defect was real and was corrected on the branch before the merge. |

`#195` is the sharper of the two, and it is the one that settles the design: a
check that asks "was a board file touched" would have reported that pull request
**green**. The board file was touched. The card that shipped was not.

---

## 1. RULE-06: the board-edit check

**Card:** `RULE-06`, phase 2 board, authored and shipped in the pull request that
carries its own code.
**Files:** `scripts/poc-free/check-board-edit.mjs`,
`scripts/poc-free/prove-board-edit.mjs`, wired into `quality` as
`check:board-edit` and `prove:board-edit`, **not path-filtered**.

### What it asks

1. Which card ids does this branch touch? From the branch name (`card/<id>`) and
   from every commit subject prefix on the branch, which is the shape
   CLAUDE.md 11 mandates and the shape `check-card-ids` already reads.
2. Does this pull request change any file that is **code**?
3. If it does, then for every one of those card ids: did that card's `status`
   change on the board set in this same pull request, and did it land on a
   status that means the work is finished?

**It asks per card id, never per file, and #195 is the whole reason.** That pull
request *did* modify `docs/board/rc-board-phase3.json`. Two lines, and they were
EXT-19's `notes`. Any check keyed on "was a board file touched" reports #195
green.

### The five refusals, named

| Refusal | Exit | What it closes |
|---|---|---|
| `status-unchanged` | 1 | #195 exactly. Code under a card whose `status` is identical at the merge base and at the head. |
| `not-terminal` | 1 | #192 exactly. A card left `todo` or `in_flight` at the head. **`status-unchanged` alone does NOT catch #192**, because #192 as authored *did* move the card, from `todo` to `in_flight`. |
| `code-with-no-card` | 1 | Code under no card id at all. CLAUDE.md 2: nothing is worked that is not a card. |
| `unresolved-card-id` | 2 | A token shaped like a card id that resolves to no card on any board. A card id it cannot resolve is a failure, never a pass. |
| `unclassified-path` | 2 | A changed path matching no rule in the classifier. Fail closed on a shape it cannot classify. |

`evidence: null`, which was #192's other half, is **not** re-checked here.
`docs/board/validate-board.mjs` already fails the build on `status: shipped` with
`evidence: null` and runs in the same job. Two checks asking one question is how
one of them stops being read. What the validator cannot see is that the card was
left short of `shipped` at all, and that is `not-terminal`.

### The three count ledgers

The dispatch required the input count asserted against the matched count. There
are three places that can silently drop something, so there are three ledgers,
and each one exits 2 rather than reporting clean:

- every changed path is classified or refused: `classified + unclassified === changed`
- every token shaped like a card id is skipped, resolved or refused:
  `skipped + resolved + unresolved === shaped`
- every resolved card id produces exactly one verdict: `verdicts === resolved`

### The failing half, proved

`npm run prove:board-edit` -> **45 of 45**, over 23 throwaway git repositories,
each with its own base commit, branch, board set and commit subjects. Every
refusing case is paired with a control that must pass on the same harness,
because a check that refuses everything satisfies every negative assertion while
proving nothing.

The two the dispatch named by hand:

- **The mutant.** A branch carrying `lib/data/thing.ts` under `EXT-16`, with the
  board edited on some other card, turns the check **red** with the
  `status-unchanged` verdict. The same fixture with the flip present **passes**.
- **The control.** A docs-and-doctrine pull request, a report-only pull request
  and a board-only pull request all pass, and the check says *why* it passed
  rather than passing silently.

### Replayed against the real merged history

The strongest evidence available is not a fixture. The check was run against the
**last 60 merge commits on `main`**, base `sha^1` to `sha`, with each pull
request's real branch name.

**Three refusals out of sixty.**

| Pull request | Refusal | Reading |
|---|---|---|
| **#195** | `status-unchanged` on EXT-16 | **The incident.** Exactly the pull request this card was written for. |
| #181 | `code-with-no-card` | `BOARD: RULE-04, R-098, ...` carried `scripts/poc/test-ask-digest.sh` under no card id. |
| #179 | `code-with-no-card` | `R-096, R-097: sample TTL becomes 24h` carried `scripts/ext/serve-sample-documents.mjs` under no card id. |

**The last two are not softened and no allow-list was added for them.** Both
changed code under no card. CLAUDE.md 2 says nothing is worked that is not a
card, so the honest reading is that the check would have been *right* to refuse
both. The fail-closed rule the dispatch asked for is what produces that answer,
and weakening it to make two old pull requests green would remove the property it
was asked for.

Everything else passed, including **#192 at its merge commit** (`todo -> shipped`,
`flipped`), #196, #186, #175, every TRIAGE pull request, every POC state and
report pull request, and #197's doctrine rewrite.

### The hole that is named rather than closed

A card that is **new** at the head satisfies the check: a card that does not
exist on `main` has no status to change, and its arrival on the board *is* the
board edit. RULE-06 itself is authored and shipped that way, and so was EXT-21 in
#196.

That means a pull request could author a card directly at `shipped` and satisfy
this check having never shown the work. Three things already stand in front of
that and none of them is this file: `validate-board.mjs` requires `evidence` on a
shipped card, `check-card-ids` requires the id to resolve, and section 6 requires
the acceptance to have been run. **This check exists to catch forgetting**, which
is what happened twice on 2026-09-04. A check aimed at a determined bypass would
have to be a different and much noisier thing. The proof harness asserts both
halves anyway: a new card at `shipped` passes, and a new card left at `todo` is
still refused.

### Gates run locally

    npx tsc --noEmit                                            exit 0
    node docs/board/validate-board.mjs <all three boards>        exit 0, 0 violations
    npm run check:card-ids                                       exit 0
    npm run check:unique-ids                                     exit 0, 163 card ids, 126 ruling ids
    npm run check:conflict-residue                               exit 0
    npm run check:board-edit  (against its own branch)            exit 0, RULE-06 (absent) -> shipped, new-card
    npm run prove:board-edit                                     exit 0, 45 of 45

---

## 2. AUT-23: the queue-throughput card, authored and not built

**Card:** `AUT-23`, phase 2 board, `status: todo`, `owner_terminal: poc-builder`.
Authored only, at the owner's instruction.

**What is NOT the defect, recorded first so the next reader does not re-open it.**
`required_status_checks.strict` is correct and does not change. Under strict, a
branch must be up to date with `main` before it merges, so a queue drains
serially by construction. That is the price of the property and the property is
worth it: it is what makes a green check mean the branch was tested against the
`main` it is about to join.

**The defect is the producer.** The harness opens pull requests on a
four-times-daily schedule regardless of queue depth, so the queue regrows faster
than a serial drain empties it. Two independent rates with no feedback between
them.

**The observed cost, recorded on the card:** thirteen pull requests, merged one
at a time, hours rather than minutes, and **eleven of thirteen behind `main` at
merge time**. Every one of those eleven needed `main` merged into it and a fresh
check run before it could go.

**What the card specifies:** the harness reads the open pull request count before
opening another, and above a threshold it **parks** its output. The work is
committed and the branch is pushed; only the pull request is withheld. The next
scheduled tick opens it when the count has fallen, without redoing the work.

**Threshold proposed: three.** Recommended rather than left open, on the reasoning
that three is roughly one drain cycle at the observed check cost, so a run that
finds three already open is a run whose output would land behind three rebases.
It is one named constant read from one place, and arguing it down is a one-line
diff.

**It fails OPEN into opening the pull request.** If the open count cannot be
obtained, the harness opens as it does today. An unopened pull request is
invisible work; a queue that is one too long is merely slow.

**It is not AUT-22 and it is not AUT-18.** AUT-22 stops a run *starting* a card it
cannot finish. AUT-18 makes a run *report* the pull requests it did not merge.
This is the third question: whether to add to the queue at all. All three can
hold at once and none subsumes another.

**Not verified, and stated rather than implied:** the thirteen and the
eleven-of-thirteen are the owner's figures from the drain he watched. They are on
the card as the motivating cost, with an instruction to re-derive them from the
merge history before quoting them anywhere the number matters.

---

## 3. The local acceptance lane, because the first attempt to run it failed

The EXT cards' acceptance lines are Playwright specs, and the specs need a
Supabase stack. `supabase start` in this repository **refused**: the
`supabase_db_rc-inventory` container was `Created` and could not start, because
ports 54321 and 54322 were held by an OsteoJP stack that another session had
restarted two minutes earlier.

**That stack was not touched.** A scratch workdir was built instead, under the
session scratchpad, holding a copy of `supabase/config.toml` with `project_id`
`rc-inv-e17` and the ports shifted to 55321, 55322 and 55320, plus a symlink to
this worktree's `supabase/migrations`. `supabase --workdir` brought up a second,
independent stack, `supabase db reset` replayed all 34 migrations unmodified, and
the four CI seed scripts ran against it. **No repository file was edited to make
this work**, which is the point: a port number committed to `config.toml` to
unblock one session is a port number every other session then inherits.

**Baseline first, on the unchanged tree:** `extraction.spec.ts` and
`review.spec.ts`, **30 of 30 green in 1.4 minutes**. Anything red after that is
this session's diff and not the lane.

**Two things the lane dirties, recorded so the next session does not commit
them.** The Next production build writes `.next-prod` include paths into
`tsconfig.json` on every run, and `npm ci` is required in a fresh worktree
because a symlinked `node_modules` makes Turbopack panic with
`Symlink [project]/node_modules is invalid, it points out of the filesystem
root`. `tsconfig.json` was reverted before every commit.

---

## 4. EXT-17: a scan-sourced document never auto-accepts, and its lines say so

**Card:** `EXT-17`, phase 3. **Files:** `lib/data/extraction-types.ts`,
`components/orders/ExtractionReviewPanel.tsx`, plus four new e2e cases.

### The change

One named constant and one named predicate, each in one place:

    SCAN_LINE_NOTICE = "Citita de masina dintr-o imagine."   (with diacritics in the source)
    scanReadLines(draft) -> effectiveSource(draft.documentSource) === "scan"

The review form renders the notice **inside each line's own container**, with
`data-scan-read` on the line. It is keyed on the **source** and never on the
reconciliation result, which is the card's whole rationale: reconciliation caught
the observed failure only because the model read the totals correctly and the
lines wrong. A set of fabricated lines that happens to sum to the printed total
passes the arithmetic.

### The four cases, and which failed before

| Case | Before the change | After |
|---|---|---|
| review 12: a **reconciling** scan marks every line, inside the line element | **FAILED**, `data-scan-read` resolved to `null` | pass |
| review 13: the same lines marked `digital` carry no notice anywhere on the page | **FAILED**, same assertion | pass |
| extraction 16: a reconciling scan lands in review, `confirmed_at` null, inbound count unchanged | **passed** | pass |
| extraction 17: the same payload marked `digital`, identical | **passed** | pass |

**Cases 16 and 17 passing before the change is the correct result, and the card
says so in its own defaults:** *"NO AUTO-ACCEPT EXISTS FOR ANY SOURCE TODAY, AS
FAR AS THE REPOSITORY SHOWS, AND THIS CARD MUST PROVE THAT RATHER THAN ASSUME
IT."* They are a proof of an invariant, not a change to one, so there was nothing
for them to fail against.

**They were therefore driven against a mutant instead.** One line added to the
callback route, `confirmed_at: new Date().toISOString()`, and **both cases went
red**, on the assertion that matters:

    Error: nici calea digitala nu se confirma singura
    Received: "2026-09-04T23:37:51.338+00:00"
    > 1000 |  expect(d.confirmed_at, ...).toBeNull();

The mutant was reverted. An assertion nobody has watched fail is not an
assertion, and that is this repository's own rule rather than an invention here.

### What the first draft of those cases got wrong

Cases 16 and 17 were first written on `orderWithDocument`, which attaches a
document to an inbound order **that already exists**. `listReviewDrafts` excludes
exactly that shape, deliberately and with the reason in its own header, so the
draft could never have appeared in the review list, and "is not booked" could not
have been measured because the order was already there. The case caught it:

    Locator: [data-testid="draft-card"][data-order-id="ca7ac6fd-..."]
    Expected: 1   Received: 0

Both were rebuilt on the **extraction band**, where no inbound order exists until
somebody confirms one. That is what makes the count assertion mean anything.

### The grep-proof: every path from a draft to a booked inbound order

The card requires this enumerated, with the scan case named.

**1. The booking is one RPC, `public.confirm_extraction_draft`, and it has
exactly one caller in application code.**

    lib/data/extraction-actions.ts:345   supabase.rpc("confirm_extraction_draft", {...})

Every other hit in the repository is the migration that defines it (0010, 0011),
the generated ledger rows, the applier's expected-function list, or the
schema-direction proof. None of them is a call site.

**2. That caller has exactly one caller.**

    components/orders/ExtractionReviewPanel.tsx:112   await confirmExtractionDraft(draft.orderId, {...})

which is the body of `confirm()`, behind the `review-confirm` button labelled
"Confirma si creeaza comanda". `confirmExtractionDraft` opens with
`getSessionUser()` and refuses without a session.

**3. `confirmed_at` is written by nothing else.** Application code only ever
*reads* it: `extraction-actions.ts:128,136` and `extraction.ts:27,30,118`. The
column is set inside the RPC.

**4. The callback route reaches none of it.** `inbound_orders`, `confirmed_at`
and `confirm_extraction` appear **nowhere** in
`app/api/extraction/callback/route.ts`. It writes `extraction_drafts` and
`extraction_draft_lines` and nothing else.

**5. The other two order-creating RPCs take no draft.** `create_inbound_order` is
the manual form (`InboundOrderForm.tsx:123`) and `receive_inbound_order` is the
operator's receive button (`InboundPanel.tsx:57`). Neither reads an extraction
draft.

**The scan case, named as the card requires.** For a scan-sourced draft the only
route to a booked order is the same `confirmExtractionDraft`. It carries an
additional refusal for a `failed` scan, added by EXT-15 and read **from the
database rather than from the caller**, and for an `extracted` scan it requires
the operator's confirm exactly as a digital document does, with every line now
carrying the notice.

**No auto-accept path was found**, and the card's defaults say that if one had
been found, that path would have been the card and the marking the smaller half.

### What was deliberately not built

**No server-side guard was added for a reconciling scan.** A reconciling scan is
a document the operator *is* allowed to accept; the card asks that the acceptance
be his, informed, and never automatic. A refusal inside `confirmExtractionDraft`
would have removed the operator's own path, which is the opposite of the card.

### Commands

    npx tsc --noEmit                                                exit 0
    node docs/board/validate-board.mjs <all three>                   exit 0, 0 violations
    npx playwright test extraction.spec.ts review.spec.ts           exit 0, 34 of 34
    npm run check:board-edit                                         exit 0, EXT-17 todo -> shipped
    npm run prove:board-edit                                         exit 0, 45 of 45

---

## 5. EXT-18: header self-consistency, on the same tolerance, claiming no more than it does

**Card:** `EXT-18`, phase 3. **Files:** `lib/data/reconciliation.ts`,
`app/api/extraction/callback/route.ts`, `scripts/poc-free/check-reconciliation.mjs`,
`docs/contracts/extraction-v2.md`, plus three new e2e cases.

### The expression is extended, never duplicated

`headerConsistency()` **calls** `toleranceFor(input.lineCount)` and `round2()`.
It does not restate either. The check asserts that in a way a regex on the first
occurrence would have missed:

    Math.max(0.05, ...) appears EXACTLY ONCE in the source

Both checks round to two decimals **before** subtracting, and both are inclusive
at the boundary, exactly as `reconcile()` is.

### The two checks and the third outcome

| | check |
|---|---|
| A | `subtotal + vat_amount` against `document_total` |
| B | `subtotal * vat_rate` against `vat_amount` |

A missing figure is `not_run`, never `passed`. `ok` is false **exactly when one
of the two FAILED**, so a check that could not run does not reject on its own.
What still rejects a document with no totals at all is EXT-16's `target_missing`,
unchanged.

### The three cases, each breaking one figure only

Breaking one figure at a time is deliberate: a case that broke both would pass on
a build that shipped only one of the two checks.

| Case | Before | After |
|---|---|---|
| 18: `document_total` moved to 60410.00, 6.32 over the 0.07 tolerance | **FAILED**, `Expected: "failed"  Received: "extracted"` | pass, refused |
| 19: `vat_rate` moved to 25, putting VAT 2516.82 out, **check A still exact** | **FAILED**, same shape | pass, refused |
| 20: untouched payload unaffected; null `vat_rate` neither passes nor refuses; digital path unchanged | **passed** | pass |

Case 20 passing before is what a control is for.

### All four sample documents hold both checks

Their header figures were **not recorded anywhere in the repository**, so they
were read from the documents themselves with `pdftotext -layout` on 2026-09-04
rather than transcribed from anybody's summary. The Matnord file is the one
exception and the reason is the card's own subject: it is a scan with no text
layer, `pdftotext` returns one byte, so its header comes from the record, where
`50336.40` has been the printed subtotal since EXT-16.

| document | lines | tolerance | A misses by | B misses by |
|---|---|---|---|---|
| `aviz-scan-matnord-0021884` | 7 | 0.07 | 0.00 | 0.00 |
| `confirmare-comanda-mpc-8842` | 6 | 0.06 | 0.00 | 0.00 |
| `factura-betonmix-4417` | 5 | 0.05 | 0.00 | **0.01** |
| `factura-tehnocom-0009312` | 54 | 0.54 | 0.00 | 0.00 |

**Betonmix's 0.01 is the one that matters**: `89609.38 * 0.20` is `17921.876` and
the document prints `17921.87`. Four documents all landing at exactly zero would
not have shown the tolerance is reachable at all, and the check asserts that at
least one is.

**A note on where those figures now live.** The EXT-08 report says, deliberately,
that no total for any sample document appears in the repository, in the board or
in anything sent to Andre, because an expected value sent alongside the file
cannot be taken back. EXT-18's acceptance requires all four header figures as
fixtures, so they are now in `check-reconciliation.mjs`. **The two are not in
conflict**: the EXT-08 concern is about contaminating Andre's extraction test by
telling him the answer, and nothing here goes to him. Line counts and line sums
are still absent.

### The claim, corrected as the dispatch required

The card must not say header self-consistency closes the fabrication gap, and
Andre has now confirmed the asymmetry with evidence.

**On the Matnord scan whose line table contained four fabricated lines, both
header checks land at exactly zero.** The document passes them. What refused that
run was EXT-16's line sum, missing by `1301.00` against a `0.07` tolerance.

So: **the check forces a fabrication to be coordinated across the header and the
line table to survive. It does not detect one. Mihai looking at the scan stays
the last control.** That sentence is now in three places somebody would read
before quoting the card: the contract's 5.3a, the source header of
`reconciliation.ts`, and the card's notes.

**And it is a check case, not only a sentence.** `check:reconciliation` section 8
runs the fabricated-line header through both checks and **requires** the answer
to be zero on both, then requires the same run's line sum to miss by more than
the tolerance. If somebody later "improves" the header checks into something that
would have caught that document, that case goes red and the claim gets
re-examined rather than drifting.

### Three defaults taken, each recorded

1. **Scope is the scan path**, the same gate as EXT-16. The card names no source.
   Extending to digital would silently change the behaviour of documents Andre
   delivers today, on a path EXT-16 deliberately left alone and case 14 asserts,
   and R-098 requires a new failure on a surface to be announced first. Case 20's
   third block asserts the digital path is untouched.
2. **A failure carries `reconciliation_failed`, not a new code**, from the same
   ruling: a ninth code would have to be communicated to Andre in both directions
   before it could be emitted or received, and it has not been.
3. **`line_count` is the payload's own line count**, so the header check and the
   line check use one number on one document.

### The fourth Matnord sum, and which card it rode with

`48060.40`, which is the printed `50336.40` less the `2276.00` Andre's fourth run
came in short. The check asserts that arithmetic rather than storing the number
bare, so a transcription slip in either figure fails here.

**It is EXT-16 scope absorbed by the owner's dispatch, and that is recorded
rather than dressed up.** EXT-16 is shipped, and CLAUDE.md 2 says follow-up work
on a shipped card is a new card. The dispatch put this fixture in the same step
as EXT-18, and EXT-18 is the card whose acceptance already extends
`check-reconciliation.mjs`, so a separate pull request for one fixture would have
cost a full serialised drain cycle to touch the same file. The precedent is
EXT-19's notes, where EXT-16 absorbing EXT-19's migration was recorded the same
way and accepted.

**The file's own sentence forbidding a fourth sum was about fabricating one, and
it still binds.** It read: *"a fabricated fourth value would make the set look
tidier and would be evidence of nothing."* Andre's fourth run **happened**, so it
is evidence. The comment is rewritten to say which of the two it forbids rather
than deleted. The check now also asserts the four readings are distinct from each
other and that none equals the printed total: **five distinct numbers on one
unchanged file**, spread across `10606.00` against a tolerance of `0.07`.

### Commands

    npx tsc --noEmit                                                exit 0
    node docs/board/validate-board.mjs <all three>                   exit 0, 0 violations
    npm run check:reconciliation                                     exit 0
    npx playwright test extraction.spec.ts review.spec.ts           exit 0, 33 of 33
    npm run check:board-edit                                         exit 0, EXT-18 todo -> shipped

---

## 5b. A production defect the lane found, verified, and carded: P3-38

**Not part of the dispatch. Found while running EXT-18's acceptance, confirmed by
a probe with a control, authored as a card and NOT built**, per CLAUDE.md 3: a
defect noticed in passing becomes a card, not a quiet extra commit.

### How it surfaced

After eight full runs of `extraction.spec` and `review.spec` against **one
persistent local stack**, `review.spec` case 1 went red:

    Locator: getByTestId('review-line-name-0')
    Error: element(s) not found

The review **form** rendered. It had **no line inputs**. The database then held
**252 unconfirmed drafts and 451 lines**.

### The cause, probed rather than guessed

`lib/data/extraction.ts` asks PostgREST for the lines of every pending draft in
one request: `.in("order_id", pending.map(...))`. Three requests to the local
PostgREST, same endpoint, same key, only the id-list length changing:

| ids | response |
|---|---|
| 50 | `200` |
| 150 | `200` |
| 252 | **`414 URI Too Long`** |

Bisected: **208 returns `200`, 209 returns `414`.** About 7.7 KB of request line,
the shape of an 8 KB limit in the gateway in front of PostgREST.

### The url length is the trigger. The discarded error is the defect.

    const { data: lines } = await supabase.from("extraction_draft_lines")...

`error` is never read. The `414` produces `lines === undefined`, an empty
per-order map, and **every draft on the review screen renders with zero line
items**. Nothing is red. The operator sees a screen saying, in effect, that none
of these documents had anything written on them.

**A screen that cannot tell "no lines" from "I could not read the lines" will
find another way to say the wrong one.** Fixing the batching alone would leave
the next unread error just as quiet, which is why `P3-38`'s acceptance requires
both halves and why its defaults refuse the obvious wrong fix, capping the draft
list.

**The sibling is on the same function.** `.in("id", ids)` against `inbound_orders`
a few lines above has the same unbounded shape. Less exposed today, because a
`414` there would show *more* drafts rather than fewer, but the card names it so
a fix cannot land half of it.

### It is invisible in CI by construction

Every CI run starts from `supabase db reset`, so the pending-draft count never
leaves single digits. This needs an installation that has been running for a
while, which is the only kind the client will ever have. A `docs/LEARNINGS.md`
entry records that, and records the other half: the failure looked at first like
a regression in this session's diff, and it was not.

---

## 6. EXT-19 as reduced: one code says re-scan, the other says type it out

**Card:** `EXT-19`, phase 3, worked **as reduced**. **Files:**
`lib/data/extraction-types.ts`, `docs/contracts/extraction-v2.md`, plus two new
e2e cases.

### What the reduction is

The card's acceptance opens with *"MIGRATION: a new numbered file adds
`reconciliation_failed` to the extraction error code enum"*. **EXT-16 already did
that**, as `0034`, with its assertions file, the TypeScript constant, the
Romanian label and a capability gate, because the owner's dispatch required
EXT-16 to assert the failing shape including that code. The overlap was recorded
in EXT-19's notes on `main` before this session started. That half was **not
rebuilt**.

### The remainder was a real gap, not a formality

`unreadable_document`'s sentence carried **no instruction at all**:

    "Documentul este într-un format acceptat, dar conținutul nu este lizibil."

It said what had happened and left the operator to work out what to do.
`reconciliation_failed`'s already ended with *"Documentul trebuie introdus
manual."* So the two did **not** send the owner to do different things: one sent
him somewhere and the other sent him nowhere.

    unreadable_document      the content could not be read        -> upload a better scan
    reconciliation_failed    it was read and the figures disagree -> enter it by hand

Both instructions are now **named strings** (`ACTION_RESCAN`,
`ACTION_ENTER_BY_HAND`), composed into the labels rather than copied, and read by
the proof, so the sentence on the screen and the sentence the test checks cannot
drift apart. Same doctrine as EXT-17's `SCAN_LINE_NOTICE`.

### The two cases, and all three failure proofs

| Case | Driven against | Result |
|---|---|---|
| review 14 | the **pre-card label text** | **FAILED**, `Expected substring: "Încarcă o scanare mai bună."` |
| review 14 | a **collapsed** version, `reconciliation_failed` given `unreadable_document`'s sentence | **FAILED**, this is the case the card requires by name |
| extraction 21 | a **mutant** callback writing `unreadable_document` for a reconciliation failure | **FAILED**, `Expected: "reconciliation_failed"  Received: "unreadable_document"` |

Review 14 asserts at the **source** and again on the **rendered screen** that each
code's sentence contains its own instruction and not the other's, that the two
rendered sentences differ, and that the two instructions are themselves distinct.
The screen half is kept even though the source half fails first under the
collapse, because a label that is correct in the module and never rendered would
satisfy the first and fail the operator.

### A defect fixed inside the acceptance, not beside it

The `reconciliation_failed` row in contract section 5.2 was separated from the
other seven by a **blank line**, so markdown rendered it as its own headerless
one-row table underneath them. The acceptance says the code is documented
**beside** the existing ones; it was documented *below* them, in a different
table. The blank line is gone and the reason is recorded in the contract itself.

**Nothing was renamed or reordered.** The eight enum members are untouched, in
order, and `review.spec` case 7 still iterates all eight and still passes.

### Commands

    npx tsc --noEmit                                                exit 0
    node docs/board/validate-board.mjs <all three>                   exit 0, 0 violations
    npx playwright test extraction.spec.ts review.spec.ts           exit 0, 32 of 32
    npm run check:board-edit                                         exit 0, EXT-19 todo -> shipped

---

## 7. EXT-20: the header, and no `lines` key at all

**Card:** `EXT-20`, phase 3. **Files:** `app/api/extraction/callback/route.ts`,
`docs/contracts/extraction-v2.md`, plus four new e2e cases and three existing
ones moved.

### The rule

When `document_source` resolves to `scan` **and** `status` is `failed`, a payload
carrying the `lines` key is answered `400` and **nothing is written**. Everywhere
else section 4.1's rule is untouched.

The key's presence is asked with `Object.prototype.hasOwnProperty`, once and
exactly, because JSON cannot express a present key holding `undefined`.

### The four cases

| Case | Before | After |
|---|---|---|
| 22: the sixteen-field header, **no** `lines` key, accepted | **FAILED**, `Expected: 202  Received: 400`, the shape was rejected outright | pass, 202, every header figure read back |
| 23: the same header with an **empty array**, rejected | **FAILED**, `Expected: 400  Received: 202` | pass, 400, draft still unwritten |
| 24: the same header with **one line**, rejected | **FAILED**, same | pass, 400, unwritten |
| 25: control, a **digital** failure with a `lines` key still accepted; a scan-sourced **`partial`** still keeps its read lines | **passed** | pass |

The fixture enumerates the sixteen fields **explicitly** rather than deleting a
key from a larger object, so a reader can see the shape Andre sends instead of
inferring it from a mutation.

### Three shipped tests were narrowed out of their own shape, and moved rather than deleted

`extraction.spec` 1c and 1e and `review.spec` 11 each posted a scan-sourced
`failed` payload **with** a `lines` key and expected `202`. Under this card that
is `400`. All three now delete the key; the screens and stored rows they assert
are unchanged.

**EXT-15's other half did not go with them.** Case 1c used to prove that lines
which *arrive* are dropped at write time. That is now proved on the EXT-16 path
instead, by case 12: a scan-sourced `extracted` payload with seven lines that
fails reconciliation is stored `failed` with **zero** lines. Nothing about EXT-15
stopped being tested; the case that tested it moved to the only shape that still
reaches the writer.

### Three of the owner's sixteen names are not this contract's

Recorded rather than quietly resolved:

| in the owner's shape | in the contract | what happens today |
|---|---|---|
| `supplier` | `supplier_name` | same field |
| `order_ref` | **not in 4.1** | arrives, is **ignored**, is not stored. `EXT-11` and `P3-31` own its shape |
| `client_ref` | **not in 4.1** | arrives, is ignored, is not stored. **No card claims it** |

The card's defaults anticipated this for `order_ref` and said not to wait,
because the field's *shape* is EXT-11's problem and its *presence* is this card's.
The fixture sends both, which is what production does, and the contract's new
table says in terms that sending them is not a promise that we store them.

### OPEN ITEM FOR THE OWNER: Andre must be told before his next delivery

**A payload shape Andre may be emitting today now receives a `400`, and Make does
not retry a `4xx`: a document would be dropped once, quietly.**

The failure is not a new `error_code`, so ruling R-098's letter does not bind, but
its reasoning applies exactly. This is flagged rather than assumed handled, and it
is the one thing in this session's work that needs a message to a person rather
than a commit. The change is small to state: *on a scanned document that failed,
send the header and omit `lines` entirely; do not send an empty array.*

### Commands

    npx tsc --noEmit                                                exit 0
    node docs/board/validate-board.mjs <all three>                   exit 0, 0 violations
    npx playwright test extraction.spec.ts review.spec.ts           exit 0, 34 of 34
    npm run check:board-edit                                         exit 0, EXT-20 todo -> shipped
---

## 8. Ratifications, quoted

The dispatch names four and asks that they be quoted. They are recorded here
verbatim, and the one that is a standing practice is also written into
`decisions/inbox.md` as a ruling, because a practice that lives only in a report
is a practice the next session cannot cite.

> **"#191 and #182 closed rather than merged, both accepted."**

> **"#195 ahead of the doctrine branch, accepted."**

> **"The false sentence quoted rather than deleted, accepted and now standing
> practice."**

**Only the third creates a rule**, and it is the one that needed a home. The
first two ratify decisions already taken and already recorded: #191's closure is
in the 2026-09-04 drain report, and #195's ordering is in the same file. The
third says a practice is now standing, and a standing practice belongs where it
can be cited by id.

**What it ratifies, concretely.** CLAUDE.md 3.1 used to contain this sentence,
and it was false:

> *"A pull request that ADDS `supabase/migrations/0013_something.sql` changes one
> text file in a git repository and changes nothing in any database."*

R-124 disproved it. The section now **quotes it, marks it false, and keeps it**,
rather than deleting it. That is what is ratified, and `R-127` makes it the rule
for the next one.

---

## 9. What was done, what was not, and what the owner has to decide

### Shipped

| card | what it does |
|---|---|
| `RULE-06` | CI refuses a pull request carrying a card's code while that card's board status does not move. Replayed against 60 merge commits: **3 refusals, all three real**, including `#195`, the incident it was written for. |
| `EXT-17` | A scan never auto-accepts, and every line of its review sheet says it was machine-read from an image. The no-auto-accept path is proved by a grep enumeration, not assumed. |
| `EXT-18` | The header must agree with itself, on EXT-16's tolerance, extended and not duplicated. It does **not** close the fabrication gap, and that limit is now a check case. |
| `EXT-19` | One rejection says re-scan, the other says type it out, and neither carries the other's instruction. |
| `EXT-20` | A failed scan sends the header and **no** `lines` key, and our validator refuses one that carries it. |

### Authored, not built

| card | why |
|---|---|
| `AUT-23` | The queue-throughput producer gate. The dispatch says author, do not build. |
| `P3-38` | A production defect this session found and probed. Outside the dispatch, so it is a card rather than a quiet extra commit. |
| `R-127` | Ratifies the quote-don't-delete practice and gives it CLAUDE.md section 9c. |

### The one thing that needs a person

**`EXT-20` changes a payload shape Andre may be emitting today.** A scan-sourced
`failed` payload carrying a `lines` key now receives `400`, and Make does not
retry a `4xx`, so a document would be dropped once and quietly. The sentence he
needs is one line: *on a scanned document that failed, send the header and omit
`lines` entirely; do not send an empty array.* Nothing in this session can send
that message.

### The cost of the drain, measured on this session rather than quoted

Five pull requests, merged one at a time under `required_status_checks.strict`.
Each `quality` run took **18 to 20 minutes**, and each of the four after the
first needed `main` merged in and a **fresh full run** before it could go, plus a
local re-run of the acceptance suite to prove the merge had not broken anything.
Four of the five conflicted on the same two files, because five cards appending
cases to one spec file is five edits at one line.

That is the shape `AUT-23` describes, observed from the consumer side this time.
It is recorded here because the card's own figures are the owner's, and this is
an independent measurement of the same thing.




