# EXECUTOR, 2026-09-05: the review screen's silent 414, the producer gate, and the board-edit check's reach

**Role:** EXECUTOR. **Dispatch:** P3-38 ahead of everything, then AUT-23 at a
threshold of three, then the board-edit check question, then the board in order,
authoring no new scope.

**Ratifications quoted back, as the dispatch required:**

- no allow-list for #179 and #181 on the board-edit check, accepted
- AUT-23's threshold of three, accepted as specified, build it
- the fourth sum riding with EXT-18 as absorbed scope, accepted

**Rulings in force this run:** R-059, R-082, R-085, R-086, R-098, R-122, R-123,
R-124, R-127. All nine were verified to exist in `decisions/inbox.md` before
anything was built on them.

---

## Boot

| Board | as_of at boot | Cards | todo | in_flight | blocked | halted | shipped | Launch gate |
|---|---|---|---|---|---|---|---|---|
| phase 1 | 2026-08-27 | 13 | 0 | 0 | 0 | 0 | 13 | closed |
| phase 2 | 2026-09-05T08:06Z | 80 | 25 | 1 | 3 | 0 | 51 | 6/9 |
| phase 3 | 2026-09-05T01:08Z | 71 | 34 | 0 | 0 | 0 | 37 | 0/9 |

Next eligible by section 2's rule was `APPLY-02`. The dispatch overrode the pick
order for the first three steps.

**The local clone was 63 commits behind `origin/main` at boot.** The first grep
for R-098, R-122, R-123, R-124 and R-127 found none of them and reported them
missing; they were all present after the pull. Nothing was built on the wrong
answer, but it is recorded because the same stale-clone trap has produced a wrong
premise in this repository before: **pull before asserting anything about what
is or is not in the repository.**

---

## Step 1. P3-38: the review screen rendered every draft with no lines, silently

**Pull request #213.** Card `P3-38` shipped.

### What was wrong

`listReviewDrafts` asked PostgREST for every pending draft's lines in one URL,
`extraction_draft_lines?select=...&order_id=in.(<one uuid per pending draft>)`.
A uuid plus its comma costs 37 bytes of request line, so the URL grew with the
number of documents the client had waiting. Past a few hundred the gateway in
front of PostgREST refused it with `414 URI Too Long`.

The code destructured `const { data: lines }` and never looked at `error`. On a
refusal `lines` was undefined, the per-order map empty, and **every draft
rendered with zero line items with no error anywhere.** The screen could not tell
"this document has no lines" from "I could not read the lines", and neither could
the operator. That screen is where Mihai checks a scan against the paper, which
makes it the last control in the extraction chain.

**It is invisible in CI by construction.** Every run starts from
`supabase db reset`, so the pending count never leaves single digits.

### The measurements, taken this run rather than transcribed

The card recorded 208 accepted and 209 refused from 2026-09-04. Both figures were
re-derived on a stack built the same way, and the boundary was different:

| ids in the URL | URL bytes | status |
|---|---|---|
| 32 | 1267 | 200 |
| 64 | 2451 | 200 |
| 128 | 4819 | 200 |
| 256 | 9555 | **414** |

Same 8 KB shape, different boundary. **That is exactly why the test measures the
threshold instead of encoding either number.**

The sibling read against `inbound_orders`, at the pending count this run reached:

| ids | URL bytes | status |
|---|---|---|
| 336 | 12495 | **414** |
| 100 | 3763 | 200 |

100 is the batch size the fix uses, so the constant is proven and not assumed.

### The fix, and the two alternatives rejected

**Chosen: the embedded join.** `extraction_draft_lines.order_id` carries a real
foreign key to `extraction_drafts.order_id` (migration `0008`, line 140), so the
lines now arrive nested in the same request as the drafts. There is no id list
left to grow, so there is no threshold left to meet.

**Rejected 1: batch the lines id list.** Rejected on the card's own ground, that
a chosen batch size is a threshold somebody meets again, and on a measurement
taken for this decision:

    two drafts of 600 lines each, asked for FLAT      -> 1000 rows, 200 lost silently
    the same two drafts, asked for EMBEDDED           -> 600 and 600

`max_rows = 1000` caps a flat list **across the whole result** and caps an embed
**per parent**. Batching would have traded a loud 414 for a quiet truncation
spread across drafts, which is the same defect one level harder to see. **The
card did not anticipate this and it is the measurement that decided the choice.**

**Rejected 2: filter server-side from the lines table.** The same PostgREST
relationship reached from the weaker side: a flat list under the whole-set cap
above, which the application must then regroup by `order_id` - the exact step
where the old code lost the ability to tell "no lines" from "could not read".

### The silence, which the card calls the actual defect

All three reads on the path now read `error` and throw. `linesOf()` refuses a
draft row that arrived **without the embedded key at all**: an empty array is a
document with no lines, an absent key is a select that did not ask, and those two
must never render the same.

### The acceptance, and the failure before it

`review.spec` case 15 measures the refusal threshold by probing the same
PostgREST the application uses, doubling from 32 to a ceiling of 400, then seeds
above whatever it found. It **tops up to a target rather than adding a quantity**,
so a persistent lane does not accumulate past `max_rows` on run two.

Before the fix, at 288 pending drafts:

    Error: expect(locator).toHaveValue(expected) failed
    Locator: getByTestId('review-line-name-0')
    Expected: "Tigla metalica Bilka Classic 0.45mm visiniu mtojto9t"
    Error: element(s) not found

The review form opened and rendered with no line inputs at all. After the fix,
passed.

| command | result |
|---|---|
| baseline on `origin/main` before any change | `review.spec` 14 of 14 |
| case 15 before the fix | **FAILED**, output above |
| case 15 after the fix | passed |
| `review.spec` + `extraction.spec` | 44 of 44 |
| `npx playwright test` (whole suite) | **160 of 160, exit 0**, at 336 pending drafts |
| `npx tsc --noEmit`, `npm run build` | exit 0 |
| twelve `check:*` gates, three boards | exit 0 |

Every command ran against a **persistent** local Supabase stack, never reset
between runs, on ports 54721/54722 in a scratch workdir so it could not collide
with the two OsteoJP stacks already on 54321 and 54322. That persistence is the
condition CI cannot reproduce and the reason this defect survived.

### The audit the dispatch asked for: count checked against count found

**Five `.in()` call sites exist in the repository. All five were read.** Two are
on `listReviewDrafts` and both are fixed. The other three each build a URL from
an id list unbounded in principle and each ignores its error the same way:

| site | the list | exposure |
|---|---|---|
| `lib/data/inbound-actions.ts:92` | product ids of one inbound order's lines | bounded by the line count of ONE document |
| `lib/data/extraction-actions.ts:338` | product ids of one draft's resolved lines | same bound |
| `lib/reminders/notify.ts:111` | product ids of one stock movement | same bound; the caller already swallows failures by design |

Reaching a refusal on any of the three needs a single order of roughly two
hundred lines. The review screen's list grew with the **age of the installation**,
which is why it was the one that broke. Recorded in `docs/LEARNINGS.md` and here
rather than fixed, under CLAUDE.md 3, and no card is authored for them because
the dispatch says not to author new scope.

**One further exposure of the same class, found and not fixed:** the drafts query
itself is capped at `max_rows = 1000` and orders by `fired_at` descending, so an
installation with more than a thousand pending drafts silently drops the oldest
from the review screen. Different threshold, outside this card, named here so it
is not discovered twice.

### One unrequested change reverted rather than committed

The `.next-prod` production build that Playwright starts causes Next to write two
`include` paths into `tsconfig.json`. It is not this card's change and it was
reverted before staging. CI never commits, so nothing depends on it.

---

## Step 2. AUT-23: the producer gate, at a threshold of three

**Pull request #214.** Card `AUT-23` shipped.

### Which pull request the gate actually holds, because the card says "its"

`run.sh` opens exactly **one** pull request of its own: the state pull request at
step 5. The card pull requests and the triage pull request are opened by the
EXECUTOR and TRIAGE model sessions inside the run, not by the shell, and a gate
placed there would have to reach inside a model session. The state pull request is
the one produced four times a day regardless of queue depth, which is the defect
the card names.

### The design, and the two decisions inside it

**Park, never discard.** `run.sh` commits and pushes the branch *before* it asks
the gate anything. Whatever the gate decides, the work is on the remote with its
commit on it. Only the pull request is withheld.

**The spool lives outside the repository**, at `/Users/ivan/rc-poc-logs/parked`,
and that is the design rather than a shortcut. A park withholds the pull request
that **carries** `docs/poc/state.json`, so a park recorded in that file would ride
on the branch that was parked and reach `main` only once the park ended. **The one
fact that must survive a park is the one a state field would seal inside it.**

**One named constant.** `POC_PR_DEPTH_THRESHOLD`, assigned on one line of the
fenced block, read in five places. The test asserts the assignment count, asserts
that no comparison uses a bare literal, and asserts the name is read as well as
written, so a second copy at another call site fails the build.

**It fails open into opening, twice over.** An empty answer from the counting seam
and a non-numeric one - which is what a `gh` error printed to stdout looks like -
both read as cannot-tell and open.

### A default taken and recorded: which digest carries the branch name

The card says the parked branch is named "in the run report and in the digest".
There are two digests and **CLAUDE.md 15 forbids branch names, pull request
numbers and mechanics in the one the owner receives.**

| | carries |
|---|---|
| the run report (the run log) | branch, count, threshold |
| the **full** digest, written for POC-BUILDER | branch, count, threshold |
| the **plain** digest, sent to Telegram | that finished work is held and why, with no branch, no number, no path |

The test asserts the absence by running `plain-digest`'s own `assertPlain` over
the rendered text and requiring zero violations, and asserts the plain digest says
**nothing at all** when nothing is parked. Writing a branch name into the plain
digest would have satisfied the card's sentence and broken section 15 of the file
the card is written under.

### A consequence of the run order, stated rather than hidden

The digest is sent at step 4 and the park decision is taken at step 5, so **a run
never reports its own park.** It reports every park still outstanding, and that
repeats until the queue clears. The repetition is the property: a held pull
request that went quiet would look exactly like one that was never held. It is
written into the header of `readParked()` so the next reader does not file it as a
bug.

### The acceptance

`bash scripts/poc/test-producer-gate.sh` exits 0, **29 assertions**, wired into
`quality` unfiltered in the same pull request as `# AUT-23-PRODUCER-GATE-PROOF`,
because `docs/LEARNINGS.md` already records that a proof script nothing invokes is
indistinguishable in every report from a proof that passes.

It lifts the real `run.sh` by its `EXTRACT-BEGIN/EXTRACT-END producer-gate`
fences, and shadows `git`, `gh` and `gh_bounded` as tripwires so **"without
redoing the work" is an assertion rather than a claim.**

**Each clause fails first, proven by a mutant of the post-change file** rather
than by the missing fence, which fails all four at once and proves only that the
file changed:

| mutant | clause | first failure |
|---|---|---|
| `gate_decision` forced to park always | 1, below the threshold opens | `FAIL no pull request was created below the threshold` (4 red) |
| `-ge` changed to `-gt` | 2, **at** the threshold parks | `FAIL a pull request was created at the threshold` (2 red) |
| `open_count` dropped from the record | 3, named with its count | `FAIL the park record is missing the branch or the count` |
| `gate_release_parked` short-circuited | 4, the next tick releases | `FAIL tick two did not open the parked branch` (4 red) |
| unobtainable count made to park | fail open | `FAIL the gate did not fail open` |
| `parkedCount` branch disabled in `plain-digest.mjs` | the digest half | `FAIL the plain digest does not mention held work` |

The sixth is on the other file, so both are load bearing and neither is
decoration.

### What was deliberately not done

**The card's motivating figures were not re-derived, and they are quoted nowhere
in this build.** The card asks whoever builds it to re-derive the thirteen pull
requests and the eleven-of-thirteen behind main before quoting them where the
number matters. The threshold is three because the owner ratified three, not
because of an arithmetic on those figures, and the gate's behaviour does not
depend on them. They stay on the card as the owner's account of the drain he
watched.

### Owner action after merge

**Merging this does not deploy it.** `run.sh` is a deployed copy under
`/Users/ivan/rc-poc-bin`, and R-120 records that merging a change to it does not
reach the scheduled runs. `scripts/poc/install.sh` must be re-run on the machine
before the gate is live.

---

## Step 3. Does the board-edit check gate new pull requests only?

**Answer: yes as CI wires it, and it CAN refuse against commits already on
`main` if somebody points it at them by hand. Nothing was weakened to get that
answer.**

Everything below was run, not read off the source.

### The two exits that make it a pull-request-only gate, both verified

**1. The event guard, before any ref is resolved.**

    $ GITHUB_EVENT_NAME=push npm run check:board-edit
    check-board-edit
      event       push
    check-board-edit: NOT A PULL REQUEST. The push event carries no branch and no
    card to ask about. Nothing was checked.
    exit 0

The `quality` workflow triggers on `pull_request` **and** on `push` to `main`.
This is the branch that answers the push run, and it answers it before resolving
`origin/main`, so a shallow checkout cannot turn `main` red for a reason that is
not about anybody's board.

**2. The ancestry guard.**

    $ RC_BOARD_EDIT_BASE=origin/main RC_BOARD_EDIT_HEAD=origin/main npm run check:board-edit
      base        origin/main (eff79ed)
      head        origin/main (eff79ed)
      merge base  eff79ed
    check-board-edit: NOT A PULL REQUEST. The head is already contained in the base,
    so there is no branch and no card to ask about. Nothing was checked.
    exit 0

Both are `exit 0`. On a push to `main` the check answers twice over.

### It reads only the branch side, and that was tested rather than reasoned

Every input is scoped to the branch: `git diff --name-only mergeBase...headSha`
for the paths, `git log mergeBase..headSha` for the commit subjects. Main's
commits are excluded from both because they are ancestors of the merge base.

**The case worth testing is a branch that merges `main` in**, because this
repository forbids force pushes, so that is how a branch gets up to date. A probe
branch was cut from `a5522da` (#175), given one card commit, then `origin/main`
was merged into it, bringing in **eleven** commits including **#179 and #181** -
the two that refuse when replayed directly. The board conflict was resolved by
rewriting the file from parsed JSON, never by editing markers.

    base        origin/main (eff79ed)
    head        HEAD (cf05cef)
    merge base  eff79ed
    changed     2 path(s)
    commits     2
    id tokens   2 of 2 candidate(s) are shaped like a card id
      resolved  2 token(s) -> 1 distinct card id(s): P3-14
    P3-14   rc-board-phase3.json   todo -> shipped   flipped
    check-board-edit: OK.
    exit 0

**Two paths and two commits.** The eleven commits main brought in contributed
zero tokens and zero paths. A branch carrying old refusing history in its
ancestry passes.

### It CAN refuse against history, and here is the count

Pointed at merged history by hand, it refuses. The last **60** first-parent
commits on `main` were replayed, base `sha^1` to `sha`:

    replayed=60  pass=57  refused(exit 1)=3  fail-closed(exit 2)=0

The three:

| commit | refusal |
|---|---|
| `53df12c65` EXT-16 (#195) | `carries code under a card whose board edit is missing` |
| `d3a847441` BOARD: RULE-04, R-098 ... (#181) | `changes code and names no card id anywhere` |
| `a44665502` R-096, R-097: sample TTL ... (#179) | `changes code and names no card id anywhere` |

**This is an independent re-derivation.** The earlier report of 2026-09-04 named
the same three; `main` has moved 63 commits since, and the answer is unchanged.
The first replay attempt used `git log --merges` and found only 30 ancient merge
commits, because this repository squash-merges: **the squash commit is the pull
request**, and `--first-parent` is the right window.

### What that blocks, precisely

**Nothing today.** The workflow never points the check at history: on `push` to
`main` it exits at the event guard, and on a pull request the merge base excludes
`main`'s commits from both the diff and the subject harvest.

It would block exactly one thing: **a future attempt to run the check over
`main`'s history as a gate** - an audit job, a `push`-triggered run with
`RC_BOARD_EDIT_BASE`/`HEAD` set, or a bisect. #179 and #181 would go red there.
Both changed code under no card, and CLAUDE.md 2 says nothing is worked that is
not a card, so the honest reading is that the check would be **right** to refuse
both. The owner has ratified no allow-list for them and none was added. It does
not block any new pull request.

---

## Step 4. The board in order, authoring no new scope

Section 2's pick is the lowest-id eligible card across the board set, ids sorting
lexically. That gave `APPLY-02`, then `AUT-21`, then `AUT-22`.

### APPLY-02: blocked on ivan, because production had already done the work

**Pull request #215.** Card moved `todo` -> `blocked`, `blocked_on: ivan`. Board
only, no code, no migration, **nothing written to production**.

The card says six merged migrations `0028` to `0033` have never been applied.
Before opening any write path, production was asked, read-only, under CLAUDE.md
8.3's single permitted secrets read:

| reader | answer |
|---|---|
| `applied_ledger_version()` over PostgREST | `"0034"` |
| `https://www.rapidconstructmd.com/api/health` | `{"commit":"b7e51f0...","ledger_version":"0034"}` |
| the pending register in `APPLY-LOG.md` | **empty** |

Two independent readers agree, which is the card's own clause 4 passing. The
deployed commit is `b7e51f0`, this session's own P3-38 merge, so the deployment is
current as well as the schema.

**The cause is R-124, which landed the same day the card was authored.** A
Supabase GitHub integration applies merged migrations within about two minutes,
with no terminal involved. The card's notes rest on the sentence that ruling
disproved, and under CLAUDE.md 9c it is left standing with the correction beside
it rather than edited away.

The applier was **run**, targeting production, and exited 0 having connected to
nothing: *"zero pending migrations. The register is empty, so production is
already current. Nothing was executed and nothing was written."* It cannot exit 0
**having committed**, which is what clause 1 asks, because there is no batch.

Three of four clauses cannot be run and none of them because anything is broken.
CLAUDE.md 6 says a card whose acceptance cannot be run is blocked, not shipped.
Rewriting an acceptance line is a board decision, so it is blocked on the owner
with the full evidence and a mandatory recommendation on the card: **re-author the
acceptance as a verification, same card id**, because every clause of that
verification is already proven above.

**No journal entry was added.** `APPLY-LOG.md` is append-only and its entries
carry real apply evidence; there is none, and inventing one is what that file's
own reconstruction header forbids in terms.

**A second finding, reported and not acted on:** the gap R-115 authored the card
to close - that nobody owns the apply - is not open any more, because the
integration owns it. What *is* open is that nothing notices when the integration
applies something, which is why `0028` to `0031` had to be reconstructed after the
fact. That is a different card and this session authored none, because the
dispatch says not to author new scope.

### AUT-21: a run compares its own deployed copies against the repository

**Pull request #216.** Card shipped.

Three scripts run from copies under `/Users/ivan/rc-poc-bin`; the `.mjs` modules
beside them are read from a worktree at `origin/main`. The two halves do not
upgrade together and nothing noticed. R-120 is the instance: merging a fix to the
selector did not fix the selector.

`install.sh` gains **one flag**, `--manifest`, printing its existing manifest with
absolute paths resolved and exiting before anything is created. `run.sh` takes the
`755` rows from it, so a fourth agent joins the check with no second edit. The
card's defaults forbade a typed list in terms.

`test-install.sh` gains section 6, fourteen assertions, all against the temporary
prefix that file already asserts is not `/Users/ivan`. It is already wired into
`quality` by name, so the new cases run with no workflow change.

**Both halves fail first, four ways rather than one:** the missing fence against
`origin/main`'s `run.sh`, then three mutants that each kill one half alone
(comparison forced false, forced true, and the escalation short-circuited).

The drift line carries twelve characters of each sha256, and the test asserts they
**differ from each other**, which is what makes the line evidence rather than
decoration. Two cases the card did not name and the defaults did: the drifted copy
is asserted **untouched** afterwards, and a missing deployed copy is reported
rather than skipped.

**A finding, reported and not built:** the three plists are deployed copies too,
in the same manifest, and drift the same way. They are the `644` rows and this
check skips them, because the card names three files and CLAUDE.md 3 forbids the
quiet extra.

### AUT-22: a run does not start work it cannot finish and merge

**Pull request #217.** Card shipped.

The required check costs between forty and fifty five percent of the forty five
minute budget. A run that builds a card from scratch cannot also merge it; a run
that inherits a pushed branch can. **The cap is not touched and the test asserts
`POC_MAX_SECONDS` is still 2700.**

`work_selection`, one named function behind an EXTRACT fence, called by the test
rather than copied. Refuses below the requirement with return code 3 and a line
naming the remaining seconds and the estimate; proceeds above it with the
lowest-id eligible card; and prefers an inherited `BEHIND`, `CONFLICTING` or
`DIRTY` pull request on a branch this harness opened over any new card, on a
scarce clock and on a plentiful one, with the test asserting **which of the two**
was chosen.

**`DIRTY` is accepted alongside `CONFLICTING`, and that is not defensive coding.**
The documentation names the field `CONFLICTING`; the API returns `DIRTY`, which
this session saw directly on PR #214. Matching only the documented name would have
passed a test written from the same documentation and never fired in production.

**A fix this card carries that it was not asked for and the test needed:**
`extract` is called through `$(...)`, so its own `exit 1` on a missing fence never
reached the caller and a deleted fence produced seventeen soft failures against an
empty file instead of one hard one. `test-pr-census.sh` already carried that
warning in its own header.

**Two constants and not one, a default applied and logged.** The estimate is
measured and the margin is chosen; folding them into a single 1800 would make
raising one look like raising the other. Each is written once and the test asserts
the count.

### AUT-8: the model process stops carrying credentials it does not need

**Pull request #218.** Card shipped.

The run sources the secrets file into its own process, because it genuinely needs
the Telegram names. Every child then inherited all of it, `claude -p` included, on
every run, whether or not that run went near a database.

`responder.sh` had already solved this with `env -u` and carried its own copy of
the list. **Copying that line into `run.sh` would have been two lists agreeing on
the day they were written and drifting apart every day after.**
`scripts/poc/secret-names.sh` holds it once; both scripts source it; the
responder's inline copy is **deleted**, and the check refuses to pass if either
file grows one back.

**The check runs the strip rather than reading it.** Every name is set to a dummy
value, `printenv` is spawned as the child in place of `claude` through the same
`env -u` arguments, and what comes back is what the model would have carried.
Three assertions close the ways it could pass while measuring nothing: the child
must be non-empty, the argument count must be two per name, and the check drops
one name from its own arguments and requires it to **reach** the child.

Clause (c) is proved three ways, each red before the change: a mutated list file,
`run.sh` reverted, `responder.sh` reverted.

**`NEXT_PUBLIC_SUPABASE_URL` is measured and stripped**, as the defaults require:
`npm run build` with it and the anon key absent exits 0. It is public by
construction, so it is stripped for not being *needed* rather than for being
secret, and the file records which of the two reasons applies. No secret stays on
that basis.

**TRIAGE is not stripped by this card and it is the same shape.** `run.sh` invokes
a model a second time and that child still inherits everything. The card names the
EXECUTOR invocation, so it is reported rather than done. After this card the
harness strips two of its three model children, and the third is TRIAGE.

### AUT-9: blocked on ivan, on a contradiction rather than a failure

**Pull request #219.** Card moved `todo` -> `blocked`, board only.

Three of the four cases are **already implemented and already proved**, verified by
running the proof rather than reading `run.sh`: the deadline watchdog (with the
2026-08-27 sleep-based control required to fail on the same input), the stale-lock
reclaim with its identity check, and the TRIAGE watchdog the defaults require in
the same pass.

**Case 4 contradicts CLAUDE.md 13, and both were written on 2026-08-28 about the
same incident.** The card would have a lock whose pid is alive honoured *whatever
its age*; section 13 reclaims a lock past its declared cap plus a margin, stopping
the holder first, and leaves a live *foreign* pid alone. Building case 4 would undo
the fix for the nine hour outage that produced both, and would turn two currently
green assertions red.

**The card's own title agrees with section 13** - "a lock whose owner is gone is
not honoured forever" - and CLAUDE.md 5 says a `defaults` field fills silence
rather than contradicting speech.

The recommendation is to rewrite case 4 to match section 13 and point the
acceptance at `test-harness-caps.sh`, where cases 1 and 3 already live, rather than
author a duplicate harness under a `check:run-cap` that does not exist. The only
genuinely missing piece is case 2's SIGSTOP, one case in an existing file, and it
is deliberately not built: three quarters of an acceptance whose fourth clause is
under question is work that gets rewritten when the answer arrives.

**Nothing regressed.** All three implemented behaviours are live on `main` and
proved on every pull request.

### BOARD-01: the portal shows `plain`, and saving a card stops deleting five fields

**Pull request #220.** Card shipped.

The card modal built its saved card as a fresh object listing the eleven fields it
edits, so every other field was **deleted on save**: `plain`, `depends_on`,
`acceptance`, `defaults`, `question`. Saving one card and pasting the export back
produced a board the repository validator rejects, and **the in-app validator
reported it clean**, because it did not check those five either. That validator
exists so Export can say whether a paste-back would pass; it was answering about a
card it had just emptied.

The fix **merges**: `nextCardFrom(existing, edits)`. Listing the five missing today
fixes today and breaks again the next time the contract grows a field, which is
exactly how this happened.

**The write half fails first and names all five** against `origin/main`'s file.
Those six named failures are why the check reads the source before it tries to
load: the pre-change file has no seam and boots on load, so it cannot be *driven*
at all, and a check that only failed to load would have proved the file changed and
nothing else. The source assertion reads one assignment.

The check **loads the real file**, which `render-board.mjs` inlines verbatim into
the artifact. Its last statement branches on `typeof module`: node gets exports, a
browser gets the boot it always had.

The property that matters is asserted against a **real** card: `P2-01` goes through
the save path, back into `rc-board-phase2.json`, and `validate-board.mjs` accepts
the whole board. The fixture is deliberately not used there, because it fails three
board-level rules that have nothing to do with the save path.

Also: the New card button emitted `owner_merge`, retired by R-002 and a hard
failure in the repository validator, so **it produced a card that could not be
committed**; it is now `green_self_merge` with the five contract fields present and
empty. The in-app validator checks all five. Em and en dashes in `board-app.js`
went 18 to 0, and the count is asserted so the next one cannot land quietly.

### BOARD-02: the board's own clock, and the check that caught this session twice

**Pull request #221.** Card shipped.

The phase 3 board's `as_of` ran 3, 21, 62, 150, 226, 300, 398, 467, 521, 557 and
554 minutes ahead of its own commit across eleven consecutive commits. Every
session set it by reading the **previous** `as_of` and moving it forward, because
correcting it makes the number jump backwards on a board whose purpose is to say
when it last told the truth. Nobody wanted to be the one who moved it back.

**Ahead only, not a window**, because a board written before its own commit is the
normal case. Sixty minutes of slack on `as_of`, which catches the measured series
on its third commit; **zero** on every per-card timestamp, because a checkpoint in
the future has no honest reading.

The failure was **already in the history and was not manufactured**: at `612ca05`
the check reports `as_of ... is 554 minutes AHEAD of the commit`, at `942b6bf` 557
minutes, and at `b8910e5` the `as_of` half **passes** at 3 minutes ahead. So it
separates the two cases rather than rejecting everything.

**One correction to the card from re-deriving its figures:** `b8910e5`'s `as_of` is
three minutes *ahead*, not behind. Same magnitude, wrong direction, same outcome.

### The finding this session owes plainly

**The check caught this session twice, and that is worth more than the history it
was built from.**

- Its first run against `main` found **exactly one** violation:
  `AUT-9.last_checkpoint = 2026-09-05T19:10:00Z`, written two hours earlier by this
  session as a round number, **30 minutes ahead of its own commit**.
- The second was on the then-open BOARD-01 pull request: three timestamps at
  `2026-09-05T20:30:00Z`, **109 minutes ahead**, corrected on that branch before it
  merged.

Both were hand-chosen round numbers. Both were written by a session that had
already read the card describing this exact failure. Neither was noticed until a
check asked. The rule it produced is in `docs/LEARNINGS.md`: **a round number in a
timestamp field is a number nobody read.** `19:10:00Z` and `20:30:00Z` are not
clock readings.

The repair is derived rather than guessed, per the card: the historical value is
set to the commit time of the commit that wrote it, read with `git`; the in-flight
one to a real clock. Each carries a note saying it was corrected and from what,
because a corrected value that presents itself as always having been right teaches
the next reader nothing. Git history is not rewritten.

### BOARD-03: the pick counts numbers as numbers, and the rule that hid it

**Pull request #222.** Card shipped.

`localeCompare` on the raw id puts `AUT-16` before `AUT-8`, because it compares the
characters `1` and `8`. The pick takes the head of that list, so `AUT-8` and
`AUT-9` queued behind every `AUT-1x` card authored days later and **would never
have come out**: a lane only ever grows, so nothing removes the newer ids from in
front of them.

**The defect picked this session's own work order.** On the phase 2 board as it
stood at `eff79ed`, this session's starting `main`, the pre-change selector answers
`AUT-21,AUT-22,AUT-23,AUT-8,AUT-9` - and this session worked AUT-21, then AUT-22,
then AUT-8, then AUT-9, following the documented rule exactly. The card's own cited
ids had shipped since it was authored, so the case was re-derived rather than
transcribed.

The fix is one comparator on a tuple of `(prefix, number, suffix)`, imported by
`eligible.mjs` and `boards.mjs`, with the raw string as a fallback so nothing is
dropped. The check drives the **selector as a process**, because the defect was
never in a comparator: it was in what the selector returned.

**One clause of the acceptance is answered honestly rather than satisfied
literally.** The card asks each of three cases to fail first against the current
`eligible.mjs`. Case 1 does. Cases 2 and 3 **cannot**: they are preservation
properties and `localeCompare` happens to hold both. The card itself calls case 2
"the half most likely to be broken *by the fix*", so what makes them load-bearing
is a mutant of the **new** comparator, and both were run and quoted. Claiming they
failed first would have been false.

**The artefact half, and it is the interesting half.** CLAUDE.md section 2 said:

> *"Ids sort lexically (`P2-01` before `P2-02` before `P2-10`), which is why they
> are zero-padded."*

**That sentence was true about the code.** It named the sort correctly and its
example was correct. What it did not draw was the consequence: an id that is *not*
padded sorts by its characters, and this board has `AUT-8` next to `AUT-16`. Every
session read the rule, saw it matched the behaviour, and worked the list. It is now
kept in quotes under CLAUDE.md 9c with the consequence written beneath it. The rule
that produced it is in `docs/LEARNINGS.md`: **a rule that describes the mechanism
is not the same as a rule that states the guarantee.** "Ids sort lexically"
describes; "AUT-8 comes before AUT-16" guarantees, and only the second is
falsifiable by reading the board.

---

## What this session shipped, blocked and found

| card | outcome | pull request |
|---|---|---|
| P3-38 | shipped | #213 |
| AUT-23 | shipped | #214 |
| APPLY-02 | **blocked on ivan** | #215 |
| AUT-21 | shipped | #216 |
| AUT-22 | shipped | #217 |
| AUT-8 | shipped | #218 |
| AUT-9 | **blocked on ivan** | #219 |
| BOARD-01 | shipped | #220 |
| BOARD-02 | shipped | #221 |
| BOARD-03 | shipped | #222 |

Eight shipped, two blocked, every one of the ten merged or open with a green
`quality` on its own head sha, verified with `npm run checks:state` before each
merge. **No merge was taken on a stale green**: #214 reported `quality SUCCESS`
while `DIRTY`, and `checks:state` refused it in exactly the words CLAUDE.md 3
predicts.

### Five new checks now run on every pull request, none path-filtered

| step | refuses |
|---|---|
| `AUT-23-PRODUCER-GATE-PROOF` | a harness that adds to a queue it has not drained |
| `AUT-8-EXECUTOR-ENV-PROOF` | a model child that carries a credential it does not need |
| `BOARD-01-BOARD-APP-PROOF` | a portal save that deletes fields |
| `BOARD-02-BOARD-CLOCK-PROOF` | a board timestamp from the future |
| `BOARD-03-CARD-ORDER-PROOF` | a card pick that sorts numbers as text |

Plus new cases inside two existing proofs: `test-install.sh` gains the
deployed-copy drift check (AUT-21) and `test-harness-caps.sh` gains the
work-selection decision (AUT-22).

### Two things the owner has to do

1. **`scripts/poc/install.sh` must be re-run on the machine.** AUT-21, AUT-22,
   AUT-8 and BOARD-03 all change `scripts/poc/run.sh`, which is a deployed copy
   under `/Users/ivan/rc-poc-bin`. R-120 records that merging does not deploy it.
   Until the reinstall, the scheduled runs execute the old harness - and AUT-21,
   shipped today, is what will now say so in the run log.
2. **Two blocked cards want one decision each**, both with the evidence and a
   recommendation on the card: APPLY-02's acceptance describes a production state
   that no longer exists, and AUT-9's case 4 contradicts CLAUDE.md 13.

### Findings reported and not acted on, under CLAUDE.md 3

- **Three other `.in()` call sites** build a URL from an unbounded id list and
  ignore their error, in `inbound-actions.ts`, `extraction-actions.ts` and
  `notify.ts`. Each is bounded by one document's line count, which is why the
  review screen was the one that broke.
- **The drafts query is capped at `max_rows = 1000`** and orders newest first, so
  an installation with more than a thousand pending drafts silently drops the
  oldest from the review screen.
- **The three launchd plists are deployed copies too** and drift exactly like the
  three scripts; AUT-21's check skips them because the card names three files.
- **TRIAGE is the third model child and is not stripped.** After AUT-8 the harness
  strips two of its three.
- **Nothing notices when the Supabase integration applies a migration**, which is
  why `0028` to `0031` had to be reconstructed after the fact rather than
  journalled.
- **Four older pull requests are open** from the scheduled runs: #206, #207, #209
  and #210. They belong to POC and TRIAGE and this dispatch did not touch them.

No new scope was authored, per the dispatch.
