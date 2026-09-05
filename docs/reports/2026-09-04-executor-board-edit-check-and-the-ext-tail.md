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
| 22: the sixteen-field header, **no** `lines` key, accepted | **FAILED** — `Expected: 202  Received: 400`, the shape was rejected outright | pass, 202, every header figure read back |
| 23: the same header with an **empty array**, rejected | **FAILED** — `Expected: 400  Received: 202` | pass, 400, draft still unwritten |
| 24: the same header with **one line**, rejected | **FAILED** — same | pass, 400, unwritten |
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

## (narrative continues; this file is written as the work proceeds)
