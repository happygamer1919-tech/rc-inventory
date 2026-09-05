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

## (narrative continues; this file is written as the work proceeds)
