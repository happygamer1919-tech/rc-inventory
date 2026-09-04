> **Note added 2026-09-04:** the rulings written by this run as `R-090` and `R-091` were renumbered to `R-125` and `R-126` before merging, because #157 had also written those two numbers on an open branch. See the renumber note on each ruling in `decisions/inbox.md`.

# TRIAGE, 2026-09-03: one allocator and not two, plus an apply nobody owns

Run `20260903-070005`. Branch `triage/20260903-070005`, cut from `main` at `3642d79`.
Dispatch report: `docs/reports/2026-09-02-executor-rule-02-id-allocation.md`, card RULE-02.

No migration applied, no database touched, no secret read, no production write, no
card shipped, no card pull request merged, no application code and no test written,
no existing ruling edited.

---

## 0. Boot, per CLAUDE.md section 1

Board `docs/board/rc-board-phase2.json`, `as_of` 2026-09-03T11:05:00Z at boot, 62 cards.

| status | count |
|---|---|
| shipped | 43 |
| todo | 15 |
| in_flight | 2, AUT-15 and AUT-3 |
| blocked | 2, P2-08b on `andre` and P2-14 on `client` |
| halted | 0 |

Launch gate **6 of 9**. Failing: G4, G7, G9.

Next eligible card: **AUT-16**. That answer is itself a defect and section 4 below
is about it.

---

## 1. Deviations flagged for ratification: NONE, and that is a finding rather than a formality

DOCTRINE-TRIAGE section 1 takes a report's "deviations flagged for ratification"
section as its input and gives every item a verdict.

**The RULE-02 report has no such section, and it needs none.** Read against the
four tests: it touched no unrecoverable data, it wrote no production anything, it
widened no rule, and every claim in it is re-verifiable from committed files. Its
one judgement call, a counter rather than a role prefix, is declared in its own
section 2 with its reasoning, and it landed in `CLAUDE.md` section 8b in the same
card, which is the opposite of a deviation: it is a rule change proposed, argued
and recorded in the place the next session reads.

**Nothing was ratified and nothing was overturned.** Recorded here rather than
left silent, because "no deviations" and "the section was not read" produce the
same empty output.

---

## 2. What the report is right about, and the one place the repository does not agree with it

The report's section 2 says the counter makes allocation atomic:

> It is one line, so two terminals allocating at the same time produce a **merge
> conflict on that line** - the loudest signal git has.

That is true of every allocator that reads the counter. **There is one in this
repository that does not.**

`scripts/poc/inbox.mjs` is the path by which Ivan's Telegram answer becomes a
committed ruling. Line 244 defines `nextRulingId(inboxText)` as the highest
`R-NNN` matched plus one. Line 430 calls it. Line 456 stages
`decisions/inbox.md` and the board, **and not the counter**. A tree-wide
`grep -rn NEXT-RULING-ID` returns `CLAUDE.md`, the RULE-02 report,
`check-unique-ids.mjs` and `prove-unique-ids.mjs`, and no caller in
`scripts/poc/`.

Two consequences. The first is the one RULE-02 was written to prevent: a terminal
holding R-087 from the counter and the responder computing R-087 from the inbox
produce two different R-087s **with no shared line to conflict on**, which is the
#143 shape with the new safeguard absent.

The second is live today and is worse in a smaller way.
`check-unique-ids.mjs` lines 259 to 263 refuse a counter that has not moved past
the highest ruling written. **A responder run that appends a ruling turns
`quality` red on the pull request that carries Ivan's own answer.** The channel
section 14 calls the thing that must never go quiet is the channel this breaks.

Ruled **R-087**. Card **RULE-03** authored.

---

## 3. This run had to disobey its own rubric to be correct

`docs/DOCTRINE-TRIAGE.md` opens by saying it is the whole of TRIAGE's rubric and
that a session which has not read it has not booted. Its section 2, requirement 1,
reads on `main` today:

> **The id is the next free one, and a collision is fixed by renumbering the NEW
> entry, never by touching the old one.** Ids are namespaced by author

All three clauses are now wrong. "The next free one" is `decisions/NEXT-RULING-ID`.
"Namespaced by author" is what the RULE-02 report's own first line calls doctrine
that was enforced by nothing. "Renumbering the new entry" is what
`check-unique-ids.mjs` prints a refusal against.

**A session that read its rubric and nothing else** would have scanned the inbox,
found R-086, written R-087 without touching the counter, and shipped a pull
request `quality` refuses. This run read `decisions/NEXT-RULING-ID` instead, which
is correct and is against the letter of its own rubric.

TRIAGE does not edit governing documents. Ruled **R-088**, card **AUT-19**
authored for AUTHOR. Until it lands, `CLAUDE.md` 8b governs and R-088 is the
pointer.

**Checked against AUT-15 before authoring**, per section 5's do-not-duplicate
rule. AUT-15 is `in_flight` on branch `card/aut-15` at `f5c5066` and corrects the
INPUT clause in "What TRIAGE is". It does not touch section 2. Different sections,
different defects.

---

## 4. The next eligible card is the wrong card, and it always will be

CLAUDE.md section 2 is honest about its own precondition:

> Take the **lowest-id eligible card**. Ids sort lexically (`P2-01` before
> `P2-02` before `P2-10`), which is why they are zero-padded.

The AUT lane is not padded. `AUT-1` to `AUT-9` are one digit and `AUT-15` to
`AUT-18` are two, so `AUT-16` sorts above `AUT-8`:

```
$ node scripts/poc/eligible.mjs --board docs/board/rc-board-phase2.json --ids
AUT-16,AUT-17,AUT-18,AUT-8,AUT-9,BOARD-01,BOARD-02,CLAIM-01,DIG-01,GATE-03,LEARN-01,P2-20,RST-02,RST-03
```

`scripts/poc/eligible.mjs` line 101 sorts with a bare `a.id.localeCompare(b.id)`,
faithfully to the rule as written.

**What it costs, named.** AUT-8 strips credentials the scheduled run does not need
out of the model process. AUT-9 makes the wall clock cap actually stop a run,
which is the defect that cost nine hours and three scheduled windows on
2026-08-27. Both were authored 2026-08-28, both are eligible, and both sit behind
three cards authored 2026-08-31 because of string comparison. Nobody decided that.

**The fix is the sort, not the ids.** Padding new ids and tolerating the old ones
fixes future lanes and leaves AUT-8 and AUT-9 stuck for ever, because
`CLAUDE.md` 8b forbids renumbering and every one of those ids is cited somewhere.
A `(prefix, number, suffix)` key fixes today and every future lane, and it
preserves the property P3-04b depends on by name.

Ruled **R-125**. Card **BOARD-03** authored. **No `depends_on` was edited**:
adding edges to force an order would encode a workaround as a dependency.

---

## 5. A merged migration whose apply card has already shipped

From `docs/migrations/APPLY-LOG.md` line 42:

```
- `0028_applied_ledger_version.sql`, card de aplicare P3-11e
```

P3-11e is **shipped**, correctly, on an acceptance about a health route and a
deployed-commit check that says nothing about applying anything. Its own notes
read "0028 IS AUTHORED AND MERGED, NOT APPLIED". `grep -c 0028` over all three
boards returns 2, both inside P3-11e. **No open card carries this apply.**

Nothing here lied. `tests/e2e/headers.spec.ts` is satisfied because 0028 is in
exactly one of the two places, and R-062 split "merged" from "applied" on purpose.
**What has no liveness is the `card de aplicare` field**: it names a card and
nothing anywhere asks whether that card is still open. P3-27 existed because
thirteen files reached this state at once and were reachable by nobody; one night
after P3-27 cleared the register, a fourteenth entered it and its named card
closed.

`grep -inE "drop table|truncate|delete"` over the file matches nothing, so it is in
scope for the R-082 applier and does not go to Ivan under 8.6. **TRIAGE applied
nothing and decided nothing about a destructive run.** Ruled **R-089**, card
**P3-37** authored carrying both the apply and the check that would have caught it.

---

## 6. Gate audit, DOCTRINE-TRIAGE section 4. Phase 2 stays 6 of 9, nothing flipped

Ruled as **R-126**. The full audit is written into each gate's `notes`.

| gate | verdict | the clause that decides it |
|---|---|---|
| G4 extraction | stays `fail` | `tests/e2e/extraction.spec.ts` carries eight cases; fixture, auth and malformed are green; **redirect and oversize grep to zero matches** in the spec, the fire and the callback route. Two short. **Backlog, and P2-20 is the card.** |
| G7 reminders | stays `fail`, `blocked_on: ivan` | one real delivered email. The three blockers named on 2026-08-27 are unmoved. **No database read performed and none claimed.** Two are panel actions, escalated again below. |
| G9 Mihai's cycle | stays `fail` | P2-14 recording Ivan reporting Mihai's own full cycle. No such report exists. **Section 4's unflippable kind: the client must act himself.** |

**The phase 3 gate is not audited here, and that is a decision.** All nine read
`fail` at 0 of 9 against a premise P3-27 discharged on 2026-08-31. Re-running it is
real and overdue work, and it is **already an open card**: GATE-02, whose
acceptance is a committed report re-running all nine and rewriting every evidence
field. Doing that card's work inside a ruling would land it without the report its
acceptance requires and leave it half-done by two hands. **The old escalation
saying all nine sit behind P3-27 is retired**: P3-27 shipped.

---

## 7. Board sweep, DOCTRINE-TRIAGE section 3. Four checks, three boards, 134 cards, no edge changed

1. **Dangling: zero.** Every id in every `depends_on` resolves.
2. **Satisfied but blocking: one.** P2-08b, dependency shipped, `blocked_on: andre`.
   The check asks whether that person genuinely owes something now. **He does**, and
   the ask on the card is specific and unchanged. `blocked_on` retained; escalated
   instead.
3. **Capability edge missing: none new.** P2-13's edges are settled by R-037 and
   R-072, and GATE-03 is the open card that puts R-082 into its checklist by id.
   RULE-02 added a counter and a check; neither is a credential.
4. **Edge on a split card: none.** No split since the last sweep.

**The four cards authored today carry no edges**, derived rather than defaulted:
each touches a file that exists on `main` now and none needs a capability another
card grants or removes.

---

## 8. Added to an open card instead of authoring a duplicate

AUT-16's acceptance already requires "THE BOARD SET IS READ FROM ONE PLACE, so a
fourth board is a one-line change and not a fourth hardcoded path". Two more
copies exist outside `scripts/poc/`: `check-unique-ids.mjs` `BOARDS` at line 57,
and `check-card-ids.mjs` `DEFAULT_BOARDS` at line 63. Both correctly exclude
`BOARD-TEMPLATE.json`, whose placeholder id `CARD-ID` a naive glob would count as
real. Recorded in AUT-16's `notes` under R-126. **No new card**, per section 5.

---

## 9. Escalations, both carrying a recommended default

1. **The whole remaining tail of phase 2 waits on Andre.** Item 6 of the closed
   ten. P2-08b blocked on him, P2-13 depends on P2-08b, P2-14 depends on P2-13,
   G9 closes on P2-14. **Recommendation:** send the two-line ask this week and set
   a date to decide without him; the alternative is to rule that the credential
   lock-down may proceed without the live round trip, which is his call because it
   changes what is asked of a third party. **No edge was edited on his behalf:**
   R-037 put P2-13's dependency there deliberately.
2. **`RESEND_API_KEY` and `RESEND_FROM` in the production environment.** Item 7,
   panel actions. First recorded 2026-08-26, first escalated 2026-08-31, still
   unset. **Recommendation:** set both now, by name only. **The caveat is repeated
   rather than dropped:** it does not close G7 on its own. Repetition is
   deliberate under DIGEST-01.

Both are in `docs/poc/triage-latest.json`.

---

## 10. What this run did not do, stated so nobody looks for it

- **Shipped nothing and merged no card pull request.** RST-03's acceptance is
  still met on committed evidence and still not shipped, for the reason R-077 gave.
- **Read no database and claims no database fact.** Every G7 and G9 statement above
  is derived from committed files and previous audits, and says so.
- **Edited no existing ruling.** R-088 and R-125 correct doctrine and code, not
  decisions, and neither supersedes anything.
- **Did not audit the phase 3 gate.** GATE-02 owns it. Section 6 says why.

## 11. Defects found by this run, for `docs/LEARNINGS.md`

Not appended by this run, because TRIAGE writing to `LEARNINGS.md` was not needed:
each of the four findings became a card with an acceptance line, which is the
stronger of the two outcomes DOCTRINE-TRIAGE section 2 offers. The pattern worth
carrying forward is one sentence and it is in R-087 and R-089 both:

**A rule enforced in one code path and stated as universal is a rule with a hole,
and the hole is always the automated path, because that is the one nobody reads
before they act.** The counter had one honest allocator and one that predated it.
The pending register had one honest apply card and one that had closed.


---

## Renumbered from P3-35 to P3-37 on the merge, 2026-09-03, by EXECUTOR

**Two open TRIAGE pull requests each allocated `P3-35`, for different work.**

| pull request | what its P3-35 was |
|---|---|
| #157, cut 2026-09-02 | the phase 3 schema verified on production read-only |
| this one, cut 2026-09-03 | migration 0028 applied, and the pending-register check |

**Neither branch could see the other**, which is the exact collision class RULE-02
was built for. It was caught here on the merge rather than after both had landed,
which is the whole point of the check reading `origin/main`: it would have gone
red on whichever landed second.

**This one moved and #157 kept `P3-35`**, on the older-branch-wins rule: #157 was
cut first and is the one whose id other text already cites. Only the identifier
changed. Every reference to it in this branch's own report, rulings and run state
moved with it in the same commit, so nothing is left pointing at a number that now
means something else - which is precisely the failure the R-083 collision caused.
