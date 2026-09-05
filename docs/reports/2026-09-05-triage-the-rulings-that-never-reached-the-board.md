# TRIAGE, unattended run 20260904-220003

**Role:** TRIAGE
**Run:** `20260904-220003`, scheduled, unattended
**Branch:** `triage/20260904-220003`, cut from `origin/main` at `4b9a65b`
**Date:** 2026-09-05 UTC
**Input, the only dispatch:**
`docs/reports/2026-09-05-executor-pr-census-and-triage-id-allocation.md`
**Rulings written:** R-128 through R-134
**Cards authored:** GUARD-03, AUT-24, RULE-07
**Gates flipped:** none. Phase 2 stays 6 of 9.

---

## 1. Boot report, as printed before any write

Board `docs/board/rc-board-phase2.json`, `as_of` `2026-09-05T02:25:00Z`:

| status | count |
|---|---|
| shipped | 49 |
| todo | 27 |
| blocked | 3 |
| in_flight | 1 |
| **total** | **80** |

**Launch gate: 6 of 9.** G4, G7 and G9 at `fail`; G7 `blocked_on: ivan`.

**Next eligible card: AUT-19**, the DOCTRINE-TRIAGE id-allocation card, which is
the card the input report shipped onto pull request 205 and which has not merged.
The board on `main` therefore still shows it `todo`, correctly.

**Blocked at boot:** `P2-08b` on `andre`, `P2-14` on `client`, `MIG-01` on
`ivan`.

---

## 2. The input, and what it asked to be ruled on

The report covers two cards. **AUT-18**, the pull request census, shipped and
merged as #204. **AUT-19**, the id-allocation rewrite, shipped onto #205 and left
open when the run's cap arrived before a fresh `quality` run could conclude on the
new head sha.

**Verified before ruling, rather than taken from the report.** Both #205 and #206
are open, `MERGEABLE`, and their `quality` runs were still `in_progress` on their
current head shas at the time of this audit. The report's account of why neither
merged is consistent with what GitHub reports now. **TRIAGE merges nothing and
merged nothing.**

It flags **three deviations**. All three are ratified, individually, in R-128,
each naming the test from DOCTRINE-TRIAGE section 1 that fired.

---

## 3. What this run found, which is mostly not in the report

The rubric requires the board sweep and the gate audit on every run, over the
whole board, whatever the report contains. **That is where almost everything below
came from.**

### 3a. Five rulings declared a board edit and landed on `main` without making it

This is R-129 and it is the finding of the run.

| ruling | what it declared | the commit that carried it | what that commit's board diff actually touched |
|---|---|---|---|
| R-045, 2026-08-28 | AUT-3 moves `in_flight` to `todo` | `c97e48e` | AUT-8, AUT-9, AUT-10, AUT-11, G5, G8, P2-14. Not AUT-3. |
| R-105, 2026-09-04 | `P2-13.depends_on` gains GATE-03, acceptance corrected | `7ef263b` | AUT-18's acceptance, plus RST-05 added. Not P2-13. |
| R-101, 2026-09-04 | `P2-13.depends_on` gains MIG-01 | deferred on purpose to RESTORE-01 | the edge is still absent and RESTORE-01 is still `todo` |
| R-106 and R-126 | the gate audit written into G4, G7, G9 `evidence` | `7ef263b`, `2a5e0c1` | no gate line in either. All three were `evidence: null`. |
| R-111, 2026-09-04 | a card authored | `eebb7d9` | the id already belonged to another card. The card described exists nowhere. |

**AUT-3 IS THE ONE THAT COST.** Eligibility requires `status: todo`, so an
`in_flight` card is invisible to every selector. It sat outside the queue for
**seven days** while the event its acceptance names happened in every scheduled
window.

**No check in this repository can see this class.** `check:board-edit` asks
whether a pull request carrying a card's CODE carries that card's board edit and
derives its ids from the branch name and commit subjects, so a TRIAGE pull request
passes it green by design. `check:unique-ids` compares ids. **Nothing reads the
body of a ruling.** Card **GUARD-03** is authored for that check, with four
fixtures including the deferral case, because R-101's deferral was legitimate and
must stay legal.

**Why it is quieter than a contradiction.** A ruling is the authority here and
the board is what a run reads. When they disagree, later rulings reason from the
ruling and runs act on the board, and both are internally consistent. R-126 wrote
that P2-13's edges were settled, which was true of `decisions/inbox.md` and false
of the board.

### 3b. A card blocked on an answer it already had

**MIG-01** was `blocked_on: ivan` asking whether the Supabase integration keeps
applying merged migrations. **R-124 records the owner answering it on 2026-09-04**,
option (b) verbatim from the card's own OPTIONS field, and CLAUDE.md section 8.0
is that answer written into doctrine. The condition on the card's own
recommendation, a pre-merge check refusing row-destroying statements, is met on
`main`: `check:no-destructive-migration` and `prove:no-destructive-migration` run
in `quality` with no step-level `if:` and no workflow `paths:` key.

Cleared to `todo` by R-131. **Not shipped.** The acceptance run, including four
fixtures each proved failing first and `npx tsc --noEmit`, has not been performed
and is not claimed.

### 3c. A card authored to do work that was already done

**APPLY-02** on the phase 3 board exists to apply six migrations "that have never
been applied". Its own notes reason from the sentence R-124 disproved the same
day. Today the pending register in `docs/migrations/APPLY-LOG.md` is **empty** and
`0028` through `0034` all carry APPLIED headings, four of them marked
RECONSTRUCTED rather than journalled.

R-133 rewrites the acceptance from an apply into a verification that branches on
the register, derives its numbers from the tree instead of pinning `0033`, and
requires the journal to say which kind of record it is producing. **The card is
not retired** and neither is P3-35, whose overlap is now named on the card rather
than left for whoever picks one first.

### 3d. Two acceptance clauses that could only be passed by undoing later work

Both on **RESTORE-01**, both found by running them:

- `P2-13.depends_on` "is exactly `["P2-08b", "MIG-01"]`" became unsatisfiable when
  R-105 added a third entry the next day. Now requires containment.
- Three clauses demanding byte identity with `b25dc75`. Measured:
  `APPLY-LOG.md` **+37 lines, 0 missing**; `test-ask-digest.sh` identical;
  `extraction-v2.md` **+246, 6 missing**. The first two move to the
  `grep -c '^<'` form the card's own LEARNINGS clause already uses.
  **extraction-v2 is called out separately**, because at least one of its six
  missing lines is the one EXT-20 deliberately superseded, and restoring it would
  be a revert wearing a restoration's name.

### 3e. A card that was authored twice and exists once

**R-111 declared AUT-19 authored** for the Telegram answer channel. AUT-19 was
already a different card, merged to `main` about ninety minutes earlier. The board
kept the card that landed first, correctly, and the card R-111 described was never
written anywhere.

**The defect is live, re-verified today rather than inherited.**
`scripts/poc/inbox.mjs` line 56 reads
`/^R\s+([A-Za-z0-9]+-[0-9]+)\s+default$/`, anchored and stopping at the digits, so
every id ending in a letter is refused: P2-08a, P2-08b, P3-04b, P3-05b, P3-11a to
P3-11e, P3-13b, P3-13c, P3-27a. Card **AUT-24** is authored, with R-111's limits
carried into its `defaults` unchanged.

---

## 4. The board sweep, DOCTRINE-TRIAGE section 3: four checks, three boards, 164 cards

Counted at the sweep. The three cards this run authored take the board set to 167.

1. **Dangling: zero.**
2. **Satisfied but blocking: three, with three different answers.** P2-08b on
   `andre` RETAINED, he genuinely owes the live document run. P2-14 on `client`
   RETAINED, and its dependency is not shipped so the check does not fire.
   MIG-01 on `ivan` CLEARED, per 3b.
3. **A capability edge missing: two, both already ruled and neither landed.**
   `P2-13.depends_on` was `["P2-08b"]` and is now
   `["P2-08b", "GATE-03", "MIG-01"]`. Nothing is newly blocked: P2-13 already
   waits on P2-08b. No card authored since needs a capability P2-13 removes, and
   no unshipped phase 3 card removes one.
4. **An edge on a split card: none, and one lookalike named.** P3-11a through
   P3-11e are **not** halves of P3-11; they are unrelated harness cards that
   borrowed the suffix. `P3-28 -> P3-11` is correct.

---

## 5. The gate audit, DOCTRINE-TRIAGE section 4

**Phase 2 stays 6 of 9. Nothing flipped.** R-134.

- **G4** stays `fail`, exactly two clauses short for the fifth consecutive audit.
  `tests/e2e/extraction.spec.ts` holds 29 cases; a grep for redirect, oversize,
  `maxBodySize`, 301, 302, content-length and body size across the spec, the fire
  and the callback route returns one comment line containing `1301.00` and no
  code. **Backlog with a card: P2-20, `todo`, eligible.**
- **G7** stays `fail`, `blocked_on: ivan` retained. Same three items as
  2026-08-27. **No database read and no panel read was performed and neither is
  claimed.** Two are console actions and are escalated again.
- **G9** stays `fail` and no card can close it. It needs Mihai himself.

**The audit is written into `evidence.ref` on all three, which is new.** Five
rulings declared that write and none performed it; all three fields were `null`
and the newest ruling named in any of their notes was R-080, dated 2026-09-01.
Each entry opens by saying the gate stays `fail`, so evidence on a failing gate
cannot be misread as proof of passing.

**The phase 3 gate is deliberately not audited.** GATE-02 owns it, all nine
conditions say "on production", and this run read no production.

---

## 6. Escalations, all three carrying a recommended default

Written in plain language in `docs/poc/triage-latest.json` so the digest carries
them verbatim.

1. **The deployed harness copy is stale, so last night's census does not run.**
   Recommendation: run the installer on the machine. This is the report's own
   section 6 item 4 and it is the single most consequential item in it: until it
   is done, every scheduled run behaves as though AUT-18 never shipped.
2. **The two email settings, fifth raise.** Recommendation: set them, with the
   unchanged caveat that it does not flip G7 on its own.
3. **The supplier's live document run, ninth day.** Recommendation: set a date
   for the credential lockdown and do it, rather than waiting.

**Nothing was escalated that the rubric gives TRIAGE.** Every board edit in this
pull request was decided under R-050 and DOCTRINE-TRIAGE section 6's closing
paragraph, and none of the ten items was touched.

---

## 7. One rubric defect, which the dispatch says is a legitimate output

**DOCTRINE-TRIAGE section 1's test 3 has two answers and this run needed a
third.** It asks whether a deviation WIDENED a standing rule or APPLIED one.
AUT-19's deviation did neither: it EXCEPTED one, carving a narrow case out of
CLAUDE.md 9c. Decided by analogy with section 6 item 5, where narrowing is
TRIAGE's and widening escalates, and the analogy holds. **But two runs could
reasonably have split on it**, and the rubric's own first promise is that they do
not.

The repair is one row, and it is carried by card **RULE-07** alongside the 9c
half, because both are one-paragraph doctrine corrections produced by the same
deviation.

---

## 8. What was deliberately not done

- **Nothing was merged.** #205 and #206 were open with `quality` in progress and
  are the next run's first item, exactly as the input report says.
- **No card was shipped**, including MIG-01, whose acceptance is largely present
  on `main` and was not run here.
- **No ruling was edited.** R-045, R-101, R-105, R-106, R-111 and R-126 are
  quoted and carried out, never rewritten.
- **No gate was flipped**, and no gate `state` changed.
- **The phase 3 gate was not audited** and no production read was performed.
- **Neither APPLY-02 nor P3-35 was retired.** Choosing between them is a phase 3
  sequencing judgement made on evidence this run did not gather.

---

## 9. What the next run should pick up first

1. **Merge #205 and #206**, per the input report, reading `mergeStateStatus`
   beside the check result and confirming a run exists for the head sha.
2. **AUT-3 is eligible again after seven days out of the queue.** It needs its
   evidence recorded and the flip, not the work: the TRIAGE step has run every
   scheduled window since 2026-08-28. **It is not at the front of the queue**, and
   that is a property of lexical id order rather than a judgement: `AUT-3` sorts
   after `AUT-24` and before `AUT-8`, which is the same padding defect R-125
   recorded and RULE-05 owns.
3. **MIG-01 is now eligible** and most of what its acceptance names is already on
   `main`. What is missing is the four fixtures proved failing first, the CONTROL
   fixture among them, and `npx tsc --noEmit`.
4. **The board after this run:** 49 shipped, 32 todo, 2 blocked, 0 in flight, 83
   cards on the phase 2 board. **30 cards are eligible**, the lowest by lexical id
   being AUT-19, whose `shipped` flip is on #205 and not on `main`. Launch gate
   unchanged at 6 of 9.

Note that AUT-19's `shipped` flip rides on #205 and is not on `main`, so a run
reading the board before that merges will still see it `todo`. That is correct
and is not a defect.
