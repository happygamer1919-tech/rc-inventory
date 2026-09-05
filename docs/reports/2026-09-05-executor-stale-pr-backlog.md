# EXECUTOR - unattended run 20260905-010004

**Role:** EXECUTOR
**Run id:** 20260905-010004
**Date (UTC):** 2026-09-05
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, detached at `origin/main` (`de1046b`)
**Cap:** 45 minutes. Run started 05:00 UTC, cap fires about 05:45 UTC.

---

## 1. Boot report

Read `docs/board/rc-board-phase2.json`, and `docs/board/rc-board-phase3.json`
through `scripts/poc/boards.mjs`, which is the board set the harness itself uses.

**Phase 2 board**, `as_of 2026-09-05T02:25:00Z`:

| status | count |
|---|---|
| shipped | 49 |
| todo | 27 |
| blocked | 3 |
| in_flight | 1 |

**Launch gate: 0/9.**

**Phase 3 board**, `as_of 2026-09-05T01:08:57Z`: 37 shipped, 34 todo.

**Next eligible card:** `AUT-19`, *DOCTRINE-TRIAGE section 2's id-allocation
requirement is rewritten to match CLAUDE.md 8b, because a role whose rubric must
be disobeyed to be correct has a rubric defect.* 58 cards are eligible across the
two boards.

**Blocked:** `P2-08b` on andre, `P2-14` on client, `MIG-01` on ivan.
**In flight:** `AUT-3`.
**Claims:** `APPLY-02`, held by `harness` since 2026-09-05T03:00:13Z, inside its
six hour window.

---

## 2. What this run found, and why it did not start a new card

**Three pull requests were already open, and all three were stale.**

`npm run checks:state` on each:

```
#205  card/aut-19                   head 291ac41  BEHIND  quality SUCCESS
#206  poc/report-20260904-220003    head 3237c84  BEHIND  quality SUCCESS
#207  triage/20260904-220003        head 2857ee1  BEHIND  quality SUCCESS
```

Every one of them reported `quality SUCCESS` against a `mergeStateStatus` of
`BEHIND`. That is exactly the trap CLAUDE.md section 3 names: the recorded run
does not belong to the commit anybody is proposing to merge, and `main` requires
branches to be up to date, so none of the three was mergeable and none of the
three was going to become mergeable on its own.

**The lowest-id eligible card, `AUT-19`, is the card on #205.** Starting it as
new work would have duplicated a finished branch. The correct action was to
finish it.

**No new card was started, deliberately.** `quality` costs about 20.5 minutes
here, measured on the four most recent completed runs (20.8, 20.6, 20.2 minutes
plus one cancelled). Against a 45 minute cap that leaves room for one check
cycle. `AUT-22` is a card about exactly this arithmetic, and the escalation from
run `20260903-220002` is about the failure it produces: a stranded `in_flight`
card on a half-finished branch. This run had three ready pull requests and a
one-merge budget, so it spent the budget rather than opening a fourth.

---

## 3. What this run did

**Updated all three branches from `main` first, at 05:02.** `gh pr update-branch`
on #205, #206 and #207, all three clean, no conflicts, no force push. This is the
part worth copying: the three `quality` runs then executed CONCURRENTLY rather
than one after another, and a run exists for each exact head sha:

```
#205  head 291ac41  run 33946165159  started 05:02:51
#206  head 3237c84  run 33946167138  started 05:02:54
#207  head 05f2f93  run 33946169025  started 05:02:57
```

Updating a stale branch costs seconds. Waiting for its check costs twenty
minutes. Doing all the cheap half up front is the only thing that turns three
serial waits into one.

---

## 4. THE FINDING THAT MATTERS MOST: APPLY-02 IS BUILT ON THE SENTENCE R-124 DISPROVED

**This is the first card `scripts/poc/eligible.mjs` names, so the next run will
reach for it, and it should not apply it as written.**

`APPLY-02` says: *"Apply the six merged migrations 0028 to 0033 to the production
Supabase project through the assertion-bearing applier, and journal all three
phases."* Its acceptance requires `node scripts/apply-pending-migrations.mjs` to
exit 0 having COMMITTED, with the applied ledger ending at 33 rows.

**Its stated reason is a sentence CLAUDE.md no longer contains.** The card's
`notes` read:

> *"WHY IT REACHED NOBODY AGAIN. Merging a migration file changes one text file
> and changes no database, which is correct and is what CLAUDE.md 3.1 says in
> terms."*

Section 3.1 now says the opposite, under ruling **R-124**, and CLAUDE.md section
8.0 leads with it: **MERGE IS APPLY.** A Supabase GitHub integration applies
merged migrations to production within about two minutes, with no terminal
involved. `APPLY-02` was authored 2026-09-04 by TRIAGE under R-115 against the
old belief.

**All six migrations are already recorded as applied**, in this repository's own
`docs/migrations/APPLY-LOG.md`:

| migration | how it is recorded |
|---|---|
| `0028_applied_ledger_version` | APPLIED (RECONSTRUCTED, NOT JOURNALLED) |
| `0029_category_paints` | APPLIED (RECONSTRUCTED, NOT JOURNALLED) |
| `0030_units_tonne_litre` | APPLIED (RECONSTRUCTED, NOT JOURNALLED) |
| `0031_units_tonne_litre_rows` | APPLIED (RECONSTRUCTED, NOT JOURNALLED) |
| `0032_extraction_draft_page_count` | APPLIED, OBSERVED PROSPECTIVELY |
| `0033_extraction_document_source` | APPLIED, OBSERVED PROSPECTIVELY, THIRD CONFIRMATION |

CLAUDE.md 8.0 point 3 names this state in advance: *"THE PENDING REGISTER IS NOT
A STATEMENT ABOUT PRODUCTION. It says what a TERMINAL has applied. A file can be
listed pending and be live. That is exactly what happened to `0028` through
`0031`."*

**So what `APPLY-02` is actually about is the LEDGER, not the SCHEMA.** The
schema changes are live. What is missing is the ledger rows and the journal. That
is a materially different and much smaller job than the card describes, and the
difference decides whether a terminal runs an applier against production
believing six changes are absent when they are present.

**This run did NOT edit `APPLY-02`.** Two reasons, both deliberate. It is not
this run's card, and section 3 forbids self-invented scope. And a board edit needs
its own pull request and its own twenty minute check, which this run did not have
after spending its merge window. It also sits under a claim held by `harness`
since 05:00, inside the six hour window.

**Not a DELETE-class stop.** Checked directly: none of `0028` through `0033`
contains `DROP TABLE`, `TRUNCATE` or `DELETE`, and `0032` says so in its own
header comment. Section 13's unattended prohibition is not what stands in the
way here. The premise is.

**`MIG-01` is the card that decides this**, and it is `blocked_on: ivan`:
*"MERGE IS APPLY on this repository, and the migration doctrine does not know it.
Decide whether the integration keeps writing production."* `APPLY-02` carries no
`depends_on` and so reads as eligible, but it cannot be worked honestly until
`MIG-01` is answered.

---

## 5. Defects and learnings

One entry appended to `docs/LEARNINGS.md` in this run's pull request:

- **A strict required check plus a 45 minute cap means one merge per run,
  whatever the backlog.** `quality` costs about 20.5 minutes, `main` requires
  branches to be up to date, and the first merge of a round puts every sibling
  pull request back to `BEHIND`. A scheduled run can land exactly one pull
  request per run no matter how many are ready.

**A second observation, reported rather than fixed**, per CLAUDE.md section 4b.
Eleven shipped cards across the two boards carry an `evidence.ref` beginning
`#PENDING`, including `AUT-19` on #205 (`#PENDING-AUT19`) and `RULE-02` on the
phase 2 board. Section 6 requires a ref that *"must let a stranger re-verify
without asking anyone: a PR number"*. `#PENDING` is a placeholder for a number
that is unknowable at commit time and knowable immediately afterwards, and
nothing goes back to fill it in. The rest of each ref does carry the real
acceptance evidence, so this is a traceability gap rather than a false claim.
It was not fixed here: it is repo-wide, it is not `AUT-19`'s defect, and pushing
a fix to #205 would have spent this run's only check cycle on it.

---

## 6. SECOND FINDING: AUT-3 HAS BEEN SHIPPABLE FOR DAYS AND NOTHING REVISITS IT

`AUT-3` is the one `in_flight` card on the phase 2 board. Its
`last_checkpoint` is **2026-08-27T17:45:00Z**, nine days ago.

Its code is already merged, as **PR #62**. It was left `in_flight` on purpose,
and the card says why in its own `notes`:

> *"in_flight is also the state that keeps this card out of the eligible queue,
> which todo would not: an unattended run would otherwise pick up a card whose
> code is already merged and whose only outstanding item is evidence that run
> itself produces."*
>
> *"WHAT CLOSES IT. The next scheduled run, unassisted. If that run produces the
> TRIAGE PR, this card is shipped with the run log as evidence."*

**That condition has been met, and more than once.** PR **#207**, open right now,
is titled *"TRIAGE 20260904-220003: R-128 to R-134"*: a TRIAGE pull request,
produced unassisted by a scheduled run, which is exactly the evidence `AUT-3`
named. The chain has been working for days.

**The card was never closed because the mechanism that protects it also hides
it.** `in_flight` keeps it out of the eligible queue, which is what the author
wanted, but nothing in the loop ever looks at `in_flight` cards again. Section 2
defines eligibility over `todo` only, so a card parked in `in_flight` waiting for
an external condition is waiting for a reader who never arrives. Its closing
condition is satisfied and its status does not know.

**This is the cheapest ship on the board:** a board edit and an evidence ref, no
code. It was not taken this run because this run had no second check cycle, and
because starting it would have stranded it exactly the way `AUT-22` describes.

---

## 7. Cards touched, and what happened to each

| card | started as | ended as | what happened |
|---|---|---|---|
| `AUT-19` | todo (lowest-id eligible) | **shipped** | finished the pull request a previous run left stale. Merged as **#205**. |
| `APPLY-02` | todo, claimed | todo, untouched | premise disproved by R-124. Reported in section 4, not edited. |
| `AUT-3` | in_flight | in_flight, untouched | closing condition already met. Reported in section 6, not edited. |

**Nothing else was started.** No card was moved to `in_flight`, so this run
strands nothing.

### What shipped

**PR #205, `AUT-19`**, merged 05:24 UTC as squash commit `68f3f90`.

*DOCTRINE-TRIAGE section 2's id allocation is rewritten to CLAUDE.md 8b, and the
supersession is stated rather than dropped.*

**The gate, checked in the order CLAUDE.md section 3 requires**, not on a
`gh pr checks` summary:

```
pull request      #205
head              291ac41
mergeStateStatus  CLEAN
quality           SUCCESS

the quality result belongs to head 291ac41 and can be trusted
```

`npm run checks:state 205` exit 0. Branch protection on `main` confirmed
directly: `{"checks":["quality"],"contexts":["quality"],"strict":true}`. The
`quality` run for head `291ac41` is `33946165159`, started 05:02:51 and concluded
`success` at 05:23:47. Merged under the section 3.1 self-merge grant.

**The card's acceptance**, four clauses plus two validators, was run on the head
sha and is recorded in the card's own `evidence.ref` on the board.

---

## 8. State at the end, and what the next run should pick up first

**Board after this run.** Phase 2: 50 shipped, 26 todo, 3 blocked, 1 in_flight.
Phase 3: 37 shipped, 34 todo. **Launch gate 0/9, unchanged.**

**Two pull requests are still open**, and their state is not the same:

| PR | branch | state at 05:24 UTC |
|---|---|---|
| #206 | `poc/report-20260904-220003` | updated onto the new `main` (`d06f60b`), `quality` queued. Should be green and CLEAN well before the next run. |
| #207 | `triage/20260904-220003` | **CONFLICTS with `main`.** `gh pr update-branch` refused. |

**#207 conflicts because #205 landed.** Both touch the same doctrine surface.
Under CLAUDE.md section 3 and ruling R-052 that conflict is EXECUTOR's to resolve
LOCALLY, against the full tree, with the validator run before the commit, and
never in the GitHub web editor. This run attempted it after securing the report.

### The order for the next run

1. **`AUT-3`.** The cheapest ship on either board and nine days overdue. Its
   closing condition is already satisfied by PR #207. Board edit and evidence
   ref, no code. See section 6.
2. **#206 and #207.** One of them, not both, and expect to spend the whole merge
   budget on it. See the learnings entry: one merge per run is structural here.
3. **DO NOT work `APPLY-02` as written**, even though `eligible.mjs` names it
   first. It asks a terminal to apply six migrations this repository's own
   `APPLY-LOG.md` already records as applied. It needs re-authoring against
   R-124, and `MIG-01` (`blocked_on: ivan`) is the card that decides it. See
   section 4.
4. Only then the next lowest-id eligible card, which is **`AUT-20`**.

### Escalations

**None raised through `scripts/poc/ask.sh`.** Correct under CLAUDE.md section 14:
an unattended run under section 13 does not block on a question, and a six hour
deadline inside a 45 minute cap is killed mid-wait. Everything found here is a
finding, not a block, and section 4b says a finding is reported and the run
continues.

`docs/poc/state.json` is left to the harness, per section 13: POC state is the
harness's bookkeeping and a session that hand-edits it is writing a board file it
has no card for.

### Nothing was applied to any database

No migration was applied. No connection was opened to the production project. No
value from `/Users/ivan/rc-secrets` was read, echoed or written. `git diff
--cached` was scanned for credential shapes before the commit and was clean.

---

## 9. Cap

Run started 05:00 UTC, cap 45 minutes, fires about 05:45 UTC. This report was
committed before the cap, as its final act, per CLAUDE.md section 9b.
