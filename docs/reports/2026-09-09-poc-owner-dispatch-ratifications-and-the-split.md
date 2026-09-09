# POC, 2026-09-09: the owner dispatch. Ratifications, the misread that repeats, the delta that measures nothing, and a split the code does not implement

**Role:** POC. **Date:** 2026-09-09 UTC. **Input:** an owner dispatch of seven
numbered steps, delivered in chat. Not a report, not a scheduled run, and no
harness involved.

**Pull request:** `#272`, branch `poc/dispatch-20260909`, cut from `origin/main`
at `0bc71d0`.

**Output:** four rulings, two inline amendments, three authored cards, one
launchd change on the owner's machine. **No application code, no test, no
migration, no board status flipped, no gate touched, no existing ruling edited,
no production read, no secret read.**

---

## 1. STEP 0. Verification. Nothing in the dispatch was assumed

### The repository

`git fetch --all --prune` ran clean. **`origin/main` is
`0bc71d08501a6f8b895936d8d9cc85dbd682807f`**, `POC: run 20260908-070003 state
(#269)`, 2026-09-09T14:12:35Z. **Open pull requests: zero.** The local clone at
`~/rc-inventory` was 52 commits behind and was not used; all work happened in a
sibling worktree cut from `origin/main`.

**Zero open pull requests is itself worth recording.** R-183, merged four hours
before this session started, found eight stranded TRIAGE pull requests and
thirty-one ruling ids that had never reached `main`. **The drain closed all of
them.** `decisions/NEXT-RULING-ID` read `R-184` and `npm run id:free` confirmed
it free, which is the first time in days those two have agreed.

### The branch conditions that select the two codes, quoted from the code

**`app/api/extraction/callback/route.ts:339`:**

```
  const reconciliationFailed =
    ((verdict !== null && !verdict.ok) || (headerVerdict !== null && !headerVerdict.ok)) &&
    canFlagReconciliation;
  const effectiveStatus = reconciliationFailed ? "failed" : status;
  const effectiveErrorCode = reconciliationFailed ? "reconciliation_failed" : errorCodeRaw;
```

**There is no branch that selects `unreadable_document`.** The token exists at
`lib/data/extraction-types.ts:19`, it has a Romanian sentence at `:63`, and it is
in the contract's section 5.2 set. **Our validator never emits it.** It arrives
only from Make. Every refusal this platform generates, from either check, for any
reason, is `reconciliation_failed`.

The two checks feeding that boolean are gated identically at `route.ts:287` and
`:318`: `documentSource === "scan" && status === "extracted"`. A digital payload
is untouched by both.

### The header-only failed shape, enumerated from the code

The only place the shape is enumerated in code is the fixture
`scanFailureHeader` at `tests/e2e/extraction.spec.ts:1173`, written that way on
purpose: its own comment says a fixture that deletes a key from a larger object
does not show a reader what Andre actually sends. **Sixteen keys:**

```
order_id      status        error_code    reason
supplier_name order_ref     client_ref    order_date
currency      currency_raw  prices_include_vat
vat_rate      subtotal      vat_amount    document_total
document_source
```

**No `lines` key** (EXT-20's rule; a payload carrying it is answered `400` at
`route.ts:199`). **No `_meta`.** **No `order_ref_series`.**

### Is a page count among them? NO.

**`page_count` is absent, and so is the object it would have to live in.**
`page_count` is read at `route.ts:442` from `_meta.page_count` and from nowhere
else, through the guard at `:83`. The header-only shape carries no `_meta`, so on
this shape the page count is null by construction, every time, for every
document. That triggered step 6b and the card is authored.

### A discrepancy found while enumerating, flagged and not fixed

**The contract and the code disagree about this shape.**
`docs/contracts/extraction-v2.md` section 4.1a says **seventeen fields** and
lists `order_ref_series`, added by EXT-11 on 2026-09-07. **The fixture carries
sixteen and does not have it**, and its own comment still says *"Cele
saisprezece campuri"*. The fixture is what a reader checks a real payload
against, so the fixture is the one that is wrong. It is written into EXT-24's
`defaults` as work that card cannot avoid, rather than corrected here.

---

## 2. STEP 1. The producer stop is now persistent

```
launchctl disable gui/501/com.ai.rc-poc      exit 0
```

**Confirmed by reading the on-disk override database rather than by asserting
it:**

```
/var/db/com.apple.xpc.launchd/disabled.501.plist   modified 2026-09-09 12:28 EDT
  "com.ai.rc-poc" => true
```

That file is root-owned, on disk, and read by `launchd` at user-session start.
**The disable survives logout and reboot.** Before this, `com.ai.rc-poc` had been
bootout'd but was absent from the disabled list entirely, so it would have
returned on the next login.

**The responder and the digest were not touched and are unchanged:**

```
com.ai.rc-poc-digest   loaded, last exit 1
com.ai.rc-poc-chat     loaded, last exit 0
```

Nothing was reloaded.

---

## 3. STEPS 2 to 5. What was recorded, and where

| ruling | what it settles |
|---|---|
| **R-184** | The four drain deviations, ratified. |
| **R-185** | The failure is deterministic, not variance. Multi-pass voting ruled out permanently. |
| **R-186** | The delta is not a quality measure. Tolerance fixed at `0.07`. |
| **R-187** | Four of the five ruled arms diverge from the shipped code. |

### R-184, and the part that matters more than the ratification

All four are ratified on the owner's authority. **Two of the four are not
verifiable in this repository and the ruling says so in its own headings rather
than burying it.**

- **VERIFIED:** `#270` FIXTURE-02 and `#271` GATE-06 as load-bearing
  prerequisites. Both cards say so in their own committed evidence, written
  before this session existed, and the merge order on `main` is the second half
  of the proof: FIXTURE-02 lands, then `#207` becomes the first stranded pull
  request to merge; GATE-06 lands, then `#210` becomes the second.
- **VERIFIED IN PART:** the `#262` hand-authored acceptance fields. Both edits
  are real and both carry rulings on `main` (R-166, R-167). **The conflict is
  not**: that those two fields collided, and that no mechanical resolution was
  correct, happened in a working tree and only the result merged.
- **NOT VERIFIABLE:** the `#248` judged override. `git grep` over `main` returns
  nothing for "judged override" or "single invocation", and `#248`'s own body
  describes no override. **Ratified, and fixed by the owner's own words as
  single-invocation and not a standing allow-list.**
- **NOT VERIFIABLE:** the resolver and its seven conflict classes. **No resolver
  is committed.** The method is ratified and the residue is named: the next drain
  starts from zero, because nothing in this repository knows what the seven
  classes were.

### R-185, and why it is more than a correction

The record said the machine invents a different set of numbers on every pass.
**Andre's four-run measurement, at the line level rather than the total level,
says the opposite: three lines byte-identical and correct every pass, one line
byte-identical and wrong every pass, one unit price moving.** One moving field
produces four distinct totals, and four distinct totals is what the old finding
saw.

**The consequence is permanent and is the reason this needed a ruling rather than
an edit: multi-pass comparison and majority voting across passes are ruled out.**
Three passes over the byte-identical wrong line return the same wrong value three
times and a vote reports it unanimous. **It does not fail to catch the line, it
certifies it**, with the strongest signal a voting scheme has.

**This is the third control of the same shape to fall on this project.**
`confidence` returned `1.0` on four invented lines and was removed by EXT-14. The
instruction not to construct a self-consistent total was ignored on four runs of
four. Voting looked like an escape because no single pass is asked to notice
anything; it is not, because it asks the aggregate to notice and the aggregate
knows what one pass knows.

**Amended inline, originals quoted and kept, per CLAUDE.md section 9c:**
`docs/LEARNINGS.md` and `docs/contracts/extraction-v2.md` section 5.3.

**NOT amended, and named in the ruling rather than left to be found:**
`lib/data/reconciliation.ts` lines 10 to 21 and
`scripts/poc-free/check-reconciliation.mjs` lines 26 to 28 still carry the
superseded inference. **The reason is mechanical.** Both are CODE paths in
`check-board-edit`'s classifier, so a pull request touching either must name a
card whose status moves to terminal or be refused as `code-with-no-card`. This
pull request carries no card's code. Editing a comment would have forced either a
red `quality` or a card authored at `shipped` having run nothing.

### R-186, and a measurement that makes it cheap

The owner's case: two lines wrong by 4920 under and 5240 over, residue 342,
tolerance 0.07. **The delta measures how badly two errors failed to cancel.**

**The three figures as dictated do not close: 5240 minus 4920 is 320, not 342.**
At least one is rounded. This session did not measure any of them and did not
invent a reconciliation between them; the numbers are recorded verbatim and the
ruling states that it holds identically at either value, because both are four
orders of magnitude below the errors and four above the tolerance.

**Measured today: the delta has zero readers.** `reconcile()` returns `sum`,
`target` and `tolerance`; `headerConsistency()` returns two `diff` values; the
only thing read off either anywhere in this repository is `.ok`, at
`route.ts:340`. `grep` for `tolerance` across `app/`, `components/` and `lib/`
outside `reconciliation.ts` returns nothing. **The prohibition was written while
it costs nothing to obey**, which is the only time a rule like this is written
cheaply.

### R-187, the split, arm by arm

| # | ruled arm | ruled code | shipped code | |
|---|---|---|---|---|
| a | zero lines | `unreadable_document` | no zero-line branch; `sum` is `0`, tolerance `0.05`; `out_of_tolerance` or `target_missing` | **DIVERGES** |
| b | null selected total under `prices_include_vat` | `unreadable_document` | `targets: []` at `:178`/`:181`, `target_missing` at `:187` | **DIVERGES** |
| c | null flag, neither total matches | `unreadable_document` | `out_of_tolerance` at `:195` | **DIVERGES** |
| d | header fails its own arithmetic | `unreadable_document` | `headerVerdict.ok` false folds into the same boolean at `route.ts:340` | **DIVERGES** |
| e | sound totals, line sum missed | `reconciliation_failed` | `out_of_tolerance` with a non-null target and a passing header | **MATCHES** |

**Two findings the dispatch did not anticipate, both in the ruling:**

1. **A third outcome on arm (a).** A zero-line payload whose selected total is
   itself `0` **reconciles** at `:191`, because `|0 - 0| <= 0.05`. It is not
   refused at all: it is stored `extracted`, no lines, as a clean read.
2. **An arm the ruling does not classify.** `reconcile()` refuses at `:167` when
   any line carries a null `line_total`. The printed totals may be sound, so it
   is not "no trustworthy anchor"; the check did not run, so it is not "the line
   sum missed". It stays `reconciliation_failed` and the question goes on the
   card rather than being guessed.

**The route argues for its own behaviour in writing and the argument does not
survive.** `route.ts:313` says the failure carries `reconciliation_failed` and not
a new code because a new code must be told to the other party first, per R-098.
**Correct, and it does not apply: `unreadable_document` is not a new code.** It
has been in the section 5.2 set since v2 was frozen under R-014.

**The Andre-facing question is a different one and it is real.** Section 5.2a
sorts the codes by who produces them and `unreadable_document` sits in Make's
group. Our validator emitting it changes what a reader may infer from seeing it.
That is a contract-semantics change, item 6 of the closed escalation list, and it
belongs to the card.

---

## 4. STEP 6. Cards authored, none worked

| card | status | board |
|---|---|---|
| **EXT-23** | `todo` | phase 3, `in_flight` |
| **EXT-24** | `blocked` on **andre** | phase 3, `blocked_on_people` |
| **CI-04** | `todo` | phase 3, `loose_ends` |

**EXT-23** widens the `unreadable_document` sentence to the self-contradicting
document, where the action is the supplier and not a better scan. Its `defaults`
pre-answer the real tension: **EXT-19's finding is that each code carries ONE
instruction**, and widening one code to cover two situations with different
actions cannot leave that shape untouched. Three shapes are laid out and the
third is pre-authorized: one sentence naming both situations, with the action
that is correct for either, and a third named action constant if it needs one.

**EXT-24** is **blocked at authoring rather than after a session discovers it.**
Every option that delivers a page count on that shape changes what Andre sends
(item 6); the one option that avoids him needs a PDF library this repository does
not have (item 4, vendor). A card reading `todo` would have cost somebody a
session to reach the same wall. The question names three options and recommends
one.

**CI-04** cards the flake. **Verified here:** `retries: 0`, `workers: 1`,
`fullyParallel: false` at `playwright.config.ts:102` to `:105`; both named specs
exist; both assert a URL-driven panel by `data-testid` after a navigation, several
with explicit 15 and 20 second timeouts, which is the shape of a race already
papered over once. **Not verified here:** the three re-runs across the drain. No
run log for them is in this repository and the count is recorded as the owner's
observation.

Its acceptance refuses the two easy fixes by name: **a green run is not
acceptance** (twenty consecutive runs, failure rate before and after), and
**`retries` stays at 0** unless raising it is argued as a ruling, because a retry
turns this defect invisible rather than fixing it.

---

## 5. Deviations, flagged and not self-ratified

**1. STEP 5 AND STEP 7 CONFLICT, AND THE CONFLICT FIRED.** Step 5: *"if the code
diverges from that, card the fix."* Step 7: *"do not author scope beyond step
6"*, and step 6 names three cards of which the router fix is not one. **The
divergence is real on four arms.** This session obeyed the narrower instruction,
authored three cards and no fourth, and left the decision to the owner rather
than resolving it on its own authority. **R-187 carries the complete arm-by-arm
derivation** so the card is an hour of writing rather than a re-investigation,
and it recommends `depends_on: ["EXT-23"]`, because the sentence has to be able
to carry the meaning before the router starts producing it.

**2. THE BOOT REPORT CAME AFTER A CHANGE.** CLAUDE.md section 1 says no tool call
that changes anything may precede the status report. **`launchctl disable` ran
before it**, because it was step 1 of the dispatch. It changes nothing in this
repository. Recorded rather than argued.

**3. THE ROLE IS DECLARED AS POC AND THE DISPATCH SPANS TWO.** Rulings from an
owner answer are POC's; authoring cards is AUTHOR's. Both were done, on explicit
instruction, in one session. Section 1 says a session is exactly one role, so
this is a deviation and not a reading.

**4. TWO SOURCE FILES STILL CARRY THE SUPERSEDED INFERENCE**, for the mechanical
reason in section 3 above. Named in R-185 rather than left to be found.

**Nothing in this section is ratified here.** Ratifying one's own deviations is
what DOCTRINE-TRIAGE forbids and what the dispatch's last line repeated.

---

## 5a. One red run, and what it was

**`#272`'s first `quality` run failed in 1m33s at `Refuse a grant no revocation
checklist names`.** The job log was read before anything was changed, per the
standing rule that a red is diagnosed and not guessed at.

**It was a false positive and R-184 was the ruling it flagged.** R-184 quoted
GATE-06's committed card evidence, and that evidence quotes the
`check-grant-revocation` refusal that stopped `#210` **verbatim**. The refusal
text contains the literal phrase the check scans rulings for, so quoting it made
the check read R-184 as a grant claiming P2-13 as its revoker. **The words were
inside a quotation of an error message about a different ruling entirely.**

**This is GATE-06's own class arriving one level further out.** GATE-06 narrowed
the `X revokes` pattern on 2026-09-08 because it had zero true positives and six
false ones, all of them prose ABOUT a revocation. **This one is prose about a
refusal about a revocation**, and the matched text is the check's own output
quoted back at it.

**Fixed without touching code, which was the constraint worth respecting.** The
quotation now stops before the phrase and the ruling carries a paragraph saying
why it is truncated. **No entry was added to the check's `NOT_A_GRANT` list**,
because that file is a CODE path and softening a guard to make one's own prose
pass is the wrong direction on a check built to stop exactly that.

**Nothing else in the run had executed**, because the job runs under `bash -e`
and stops at the first failure. Every gate after that step was therefore run
locally before the second push, and the four that reported `ERR_MODULE_NOT_FOUND`
did so because the worktree had no `node_modules`; with the dependencies present
all four pass.

**A LEARNINGS ENTRY WAS NOT APPENDED FOR THIS AND THAT IS DELIBERATE.** The
paragraph inside R-184 is the record, because the next person to hit it will be
writing a ruling that quotes a check's output and will be reading rulings, not
`docs/LEARNINGS.md`. If it happens a second time it is a card against the check
rather than a third paragraph.

---

## 6. State at the end

**The pick order is unchanged by this session.** Phase 2: 6 of 9 gate, 29
eligible, next is **AUT-3**. Phase 3: 0 of 9 gate, now 30 eligible, next is
**P3-14**. The three new cards are authored, not queued ahead of anything:
`EXT-23` and `CI-04` join the tail of the phase 3 lane and `EXT-24` is blocked.

**What the next session should know first:**

1. **The router card is not authored and R-187 is why.** It is the highest-value
   unauthored work on either board and it is waiting on one owner sentence.
2. **`EXT-24` is owed by Andre** and is the second thing he owes, alongside
   `P2-08b`.
3. **Multi-pass voting is closed. Permanently.** If a card, a report or a
   contract amendment proposes reading a document more than once and comparing,
   R-185 is the refusal and no further discussion is needed.
4. **The tolerance is `0.07` and no card or ruling may widen it.** R-186. The
   pressure will arrive as a real document refused for a reason that looks
   spurious, with a delta that looks small.

**Gates, all exit 0 before the commit:** `validate-board.mjs` on all three boards
(0 violations), `check:unique-ids`, `check:open-branch-ids`, `check:card-ids`,
`check:board-edit`, `check:board-clock`, `check:conflict-residue`,
`check:card-order`, `check:reconciliation`. **No migration was added.**
