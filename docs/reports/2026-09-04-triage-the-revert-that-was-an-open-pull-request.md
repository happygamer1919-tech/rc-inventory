# TRIAGE, run 20260904-010000. The revert that was an open pull request, a report triaged twice, and four branches holding fifteen ruling ids

**Role:** TRIAGE. **Date:** 2026-09-04 UTC. **Run id:** `20260904-010000`.
**Branch:** `triage/20260904-010000`.
**Input report, the only dispatch:**
`docs/reports/2026-09-03-executor-sample-ttl-and-document-source.md`.
**Rubric applied:** `docs/DOCTRINE-TRIAGE.md`, in force with R-050 and R-057.
**Ground truth:** committed repository files at `origin/main` = `e15e928`.

---

## 0. Boot, and a correction to it

The first status report this session printed was read from the worktree's
checked-out branch, `card/aut-16`, which is open pull request `#186` and not
`main`. It was corrected in the same session before any write. **Both are printed
here**, because a boot report that was wrong and was silently replaced is exactly
the shape this run spent its night finding.

| | first, from `card/aut-16` | corrected, from `origin/main` |
|---|---|---|
| phase 2 as_of | 2026-09-04T05:15:11Z | 2026-09-03T22:18:00Z |
| shipped | 45 | 44 |
| todo | 14 | 15 |
| in flight | 1, AUT-3 | 1, AUT-3 |
| blocked | 2 | 2, P2-08b on andre, P2-14 on client |
| halted | 0 | 0 |
| launch gate | 6 / 9 | 6 / 9, G4 G7 G9 fail |
| next eligible | AUT-17 | **AUT-16** |

Phase 3 at `origin/main`: 31 shipped, 34 todo, 0 blocked, gate 0 of 9, next
eligible `EXT-10`.

**The lesson is one line and it is not about this session.** A worktree left on a
card branch reads as the project. Every figure above was internally consistent and
five of the eight were wrong.

---

## 1. The finding of the run

**The report this run was dispatched had already been triaged in full, three hours
earlier, by run `20260903-220002` on open pull request `#184`.** That is the
second live instance of `AUT-17` and it is ruled as **R-102**.

So this run did not re-triage it in the ordinary way. It did what
`docs/DOCTRINE-TRIAGE.md` calls the role's whole job: it checked the previous
run's output against the repository. **That check did not come out the way a
confirming read would have, and it is R-103.**

### 1a. R-103: the revert did not happen

Pull request `#184` reports, as the central finding of its run, that the merge of
pull request `#183` reverted committed content from `main`: 317 lines of
`docs/migrations/APPLY-LOG.md`, ruling `R-098`, cards `MIG-01` and `RULE-04`,
three learnings, a contract section and a test fixture. It states
"`main` was `b25dc75` at that moment" and gives an inventory "verified with
`git diff b25dc75 origin/main`, nothing inferred".

**`b25dc75` was never `main`.** It is the tip of `board/dispatch-20260903`, open
as pull request `#181`, `DIRTY`, never merged.

```
$ git merge-base --is-ancestor b25dc75 origin/main && echo YES || echo NO
NO

$ git branch -a --contains b25dc75
  board/dispatch-20260903
  remotes/origin/board/dispatch-20260903

$ git diff --stat 29afb21^2 29afb21          # the merge, against the main it merged in
 docs/DOCTRINE-TRIAGE.md         | 18 +++++++++++++-----
 docs/board/rc-board-phase2.json |  6 +++---
 2 files changed, 16 insertions(+), 8 deletions(-)

$ git diff --stat e173fad^1 e173fad          # PR #183, against main
 5 files changed, 271 insertions(+), 11 deletions(-)
```

The third command is the decisive one. `29afb21^2` is the `origin/main` that
commit merged in, and the result differs from it by two files and eight deleted
lines, which are AUT-15's own doctrine paragraph rewrite and its own card's status
flip. The accused merge deleted nothing.

**What the inventory actually measured** is the difference between an unmerged
pull request's branch tip and `main`, and in that direction **everything the pull
request adds appears as a deletion**. The 317 lines, `R-098`, the two cards, the
learnings, the contract section and the fixture are the content of `#181`. Nothing
deleted them because nothing ever had them.

**Every command in that report ran and printed what it says it printed.** The
reasoning on top of them is the part that failed, and it is a reasoning failure
any of us would make: `git diff A B` is symmetric in appearance and asymmetric in
meaning, and it never says whether `A` was reachable from `B`. The check that
tells a revert from an unmerged branch is `git merge-base --is-ancestor`, it costs
one round trip, and no report in this repository has ever run it.

### 1b. What R-103 does to `#184`, named so whoever lands it knows

- **`R-099` is overturned as to its premise.** Its generalisation, that every
  guard in `quality` checks that what is PRESENT is correct and none checks that
  what WAS present is still there, is true and is kept. It has no live instance.
- **`RESTORE-01` restores nothing.** Its work is real and unowned: it is landing
  `#181`. That is now `RST-05`.
- **`GUARD-02` survives on its own merits**, with its justification corrected
  rather than its content.
- **`R-100` is moot.** The counter did not go backwards.
  `decisions/NEXT-RULING-ID` has read `R-098` on `main` since `a446655`. `R-098`
  is not restored, it is **allocated**, twice, differently, on `#181` and `#184`.

**Nothing on `#184` was edited.** A ruling is never edited; R-103 is the
superseding entry and names them.

---

## 2. Rulings written

| id | what it decides |
|---|---|
| **R-102** | This run was handed an already-triaged report. Second instance of `AUT-17`, and the clause `AUT-17` was missing: the consumed-report check must read `docs/poc/triage-latest.json` on open pull request heads, not only on `main`. |
| **R-103** | `#184`'s central finding is false. The four commands, what the inventory measured, and what `#184` should carry when somebody lands it. |
| **R-104** | The six deviations in the input report, ratified individually with the test that fired, because `#184` recorded that there were none. |
| **R-105** | `P2-13`'s acceptance names thirteen pending migrations that are applied. Corrected, and the capability edge on `GATE-03` added. |
| **R-106** | The gate audit. Phase 2 stays 6 of 9, all three failures re-derived against the tree. Phase 3 is not audited because `GATE-02` owns it. |
| **R-107** | Four stranded pull requests, their id collisions, and the rule: a ruling that has never been on `main` may be re-allocated before it lands, decided by merge order. Authors `RST-05`. |

`decisions/NEXT-RULING-ID` advances to `R-108` in the same commit, per section 8b.
**The ids skip `R-098` to `R-101`**, which are written on `#181` and `#184` and
would otherwise have been given a third and fourth meaning. That is the same
allocation the input report made for `R-096` under section 8b, and it is not a
renumbering: nothing was renumbered and nothing on `main` was touched.

---

## 3. Section 1: the six deviations, individually

`#184` recorded that the input report flagged none, reading its section 5,
"Nothing. No `ask.sh` was raised and no step stopped." **That answers what
BLOCKED, not what was DEVIATED.** A run that stopped for nothing can still take
six decisions outside the written procedure, and this one did. Full text in
**R-104**; the verdicts and the tests that fired:

| # | deviation | test that fired | verdict |
|---|---|---|---|
| D1 | `R-096` and `R-097` taken while the counter read `R-087` | 4, alternative named | **RATIFY** |
| D2 | Three amendments to the frozen contract, binding Andre's emitter | 3, widening authorised by a cited ruling | **RATIFY** |
| D3 | The handover file cut from four live links to one | 4, alternative named | **RATIFY**, consequence escalated |
| D4 | A read against the production project | 4, alternative named | **RATIFY** |
| D5 | `origin/main` merged in rather than the branch rebased | 4, and it is applying section 3 | **RATIFY** |
| D6 | The whole seven-step dispatch worked with no board card | 4, alternative named | **RATIFY**, cost recorded on `AUT-18` |

**D2 is the one that came closest to an escalation and it is recorded as such.**
Amendments 1 and 2 change what is asked of the extraction vendor, which is
escalation item 6. It clears on test 3 only because `R-097` itself records
`**Decided by:** the owner on 2026-09-03, in his own dispatch`. Had it not, this
was an escalation and not a ratification.

---

## 4. Section 3: the dependency sweep, four checks, three boards

140 cards read across `rc-board.json`, `rc-board-phase2.json` and
`rc-board-phase3.json`.

1. **Dangling: none.** Every id in every `depends_on` belongs to a card that
   exists.
2. **Satisfied but blocking: two, both correct.** `P2-08b` has `P2-08a` shipped
   and is blocked on `andre`, who genuinely owes his own live run. `P2-14` is
   blocked on `client` and its dependency `P2-13` is also unmet. **Neither was
   cleared**, and that is a decision rather than an omission: clearing a
   `blocked_on` that a person genuinely owes makes the board read better and the
   project move slower.
3. **A capability edge missing: one, and it is the one that costs.** `P2-13`
   removes capabilities and must depend on every card the removal needs.
   `GATE-03` exists because `P2-13`'s checklist covers `R-082`'s applier grant
   only through a blanket phrase. **`P2-13.depends_on` becomes
   `["P2-08b", "GATE-03"]`**, under R-105. Nothing is newly blocked: `P2-13` is
   already ineligible behind `P2-08b`, and `GATE-03` is `todo` and eligible.
4. **An edge on a split card: none new.** `G4`'s clause was re-derived against the
   `P2-08` split by R-046 and R-053 and needs no further derivation.

**Also corrected, and it is a stale acceptance line rather than an edge.**
`P2-13`'s acceptance says "THIRTEEN FILES ARE PENDING TODAY, 0013 to 0025, and
P3-27 is the card that applies them." Both halves are false: `0013` to `0025` are
recorded APPLIED under the heading `WAVE 1 BATCH, 0013 to 0025 - APPLIED`, and
`P3-27` is shipped. Six files are pending, `0028` to `0033`, and **every card
named as their applier is already shipped**, so no open card owns any of the six.
Corrected under R-105, with the box kept as a precondition rather than converted
into a statement of fact, which is what `GATE-03`'s own defaults require.

---

## 5. Section 4: the gate audit

**Nothing flips. Phase 2 stays 6 of 9, phase 3 stays 0 of 9.** Full text in
**R-106**; the audit is written into each condition's `evidence.ref` whether or
not it flipped, per section 4.

**G4, extraction end to end. `fail`, two cases short, and this was measured in the
files rather than inherited.**

```
$ grep -n "redirect" lib/data/extraction-fire.ts app/api/extraction/callback/route.ts
(no output)
$ grep -niE "content-length|maxsize|max_size|too large|413|oversize" \
    app/api/extraction/callback/route.ts lib/data/extraction-fire.ts
(no output)
```

`tests/e2e/extraction.spec.ts` has grown from eight cases to fourteen since the
2026-08-31 audit, and **neither missing clause is among the six added.** Fixture,
auth rejection and malformed payload are green. Redirect and oversize are absent
from the code and from the suite. `P2-20` is the card and it is eligible.

**G7, the reminder email. `fail`, `blocked_on: ivan`, unflippable.** Two of three
clauses are panel actions no terminal holds. **What this audit adds is about the
channel and not the gate:** the two settings were escalated on 2026-08-31,
2026-09-02 and 2026-09-03, and every one of those three escalations sits on a
pull request that never merged. `docs/poc/triage-latest.json` on `main` still
names run `20260831-040003`, so the digest has been rendering a four-day-old
outcome and **the request has never once reached him from `main`.** The delivery
failure is the finding.

**G9, Mihai's cycle. `fail`, unflippable, and not backlog.** It needs the client.

**Phase 3 is deliberately not audited.** All nine are `fail` and `GATE-02` exists
to re-run every one against the premise `P3-27` discharged, with an acceptance
requiring each condition's `evidence` rewritten. Section 5 forbids a second card
for one problem, and writing a partial audit into the nine fields `GATE-02` must
rewrite would collide with it. **Recorded instead, because it is the cheapest
item on either board:** `GATE-01` is a read-only proof that an unauthorised write
is refused by Postgres, it needs nothing from anyone, and it is unpicked.

**No database read was performed for any of this and none is claimed.**

---

## 6. Section 5: the card authored

**`RST-05`**, one card, four pull requests.

| pull request | branch | merge state | on it and nowhere else |
|---|---|---|---|
| `#157` | `triage/20260902-070904` | `DIRTY` | `R-090` to `R-095`, cards `P3-35`, `P3-36`, `RST-04` |
| `#172` | `triage/20260903-070005` | `DIRTY` | `R-087` to `R-091`, cards `RULE-03`, `AUT-19`, `P3-37`, `BOARD-03` |
| `#181` | `board/dispatch-20260903` | `DIRTY` | `R-098`, `MIG-01`, `RULE-04`, the `0028` to `0033` reconstruction |
| `#184` | `triage/20260903-220002` | `BEHIND` | `R-098` to `R-101`, `RESTORE-01`, `GUARD-02` |

**Three conflict, so per `CLAUDE.md` section 3 they trigger zero workflows** and
any check result on them belongs to a commit nobody proposes to merge.

**The ids collide with each other, not with `main`, which is why no check sees
it.** `R-090` and `R-091` mean different things on `#157` and `#172`. `R-098`
means different things on `#181` and `#184`. Within each branch every id is
unique, and `check:unique-ids` compares against `origin/main` where none of them
exists, so **all four pass today** and any two landing makes the ambiguity
permanent.

**The rule, R-107, is the part worth keeping.** Section 8b's "no id is ever
renumbered" protects `main`. **A ruling that has never been on `main` is not
history and may be re-allocated a fresh id before it lands**, and **which side
keeps the id is decided by merge order, never by merit**, so no terminal has to
weigh two texts at 2am.

One card and not four, as section 5 requires argued: two pairs collide, so a
resolution taken alone must be redone against the next, and `#184` cannot be
disposed of correctly without `#181` open beside it. `RST-03` is the precedent for
an instance card, `RST-02` and `AUT-18` remain the class fixes, and all three are
still `todo`.

---

## 7. Findings that became something else

Per section 2, nothing is left as a finding.

| finding, from the input report | disposition |
|---|---|
| The pending list says pending, production says applied | **card `RST-05`** under R-107, plus the acceptance correction in R-105. Not fixed here, for the report's own reason: a journal entry reconstructed after the fact by whoever noticed the gap is a plausible record of a run nobody made. |
| `ANDRE-STATUS.md` carries a false paragraph | **escalation 2**, item 6. It reaches a third party and TRIAGE never writes to one. |
| The handover file now carries one link, not four | **escalation 2**, same item, folded in because they go in the same message. |
| A stale clone made a merged file look absent | already a `docs/LEARNINGS.md` entry on `main`. Nothing to add. |
| Three open pull requests and the counter pointed at one id | already a learning; **ratified as D1** and generalised into R-107. |
| `#177` still open, so `document_source` is code on a branch | **closed.** It merged as `c3f5bb3`. |
| A mapped category absent from the rows at callback time is written as `null` | **noted, no card.** The mechanism is real and the report proves the condition cannot arise for the category in question: production holds nineteen active categories including the one Andre is waiting on. Authoring a card against a mechanism with no live instance is what R-103 just found `#184` doing. |

**Two new entries appended to `docs/LEARNINGS.md`:** the diff-read-as-revert, and
the four stranded pull requests with their invisible id collisions.

---

## 8. Escalations, three, each with a recommended default

Full text in `docs/poc/triage-latest.json`. In one line each:

1. **Six database changes are recorded as waiting and at least four are live, with
   no record of anyone applying them.** Item 7, a console only he can open.
   **Default:** check whether the database provider is connected to the repository
   with automatic publishing on, and either way let the builder land the four
   stranded pieces, because one of them holds the correction. If it is on, keep it
   and add the guard rather than switch it off. **Verified and not verified, stated
   plainly:** this run confirmed nothing in our own automation applies a migration,
   and it cannot see inside the provider's console.
2. **The extraction supplier has been told four database changes are pending; they
   are live.** Item 6. **Default:** correct the paragraph before the next message
   and send the other three sample links with it, since they now last a day each.
3. **The two reminder-email settings, asked for on four nights and never
   answered.** Item 7. **Default:** set them and reply. **The new part is why he
   never saw them**: every previous ask was written into work that never merged.

---

## 9. What this run did not do

- **It merged nothing.** Not `#184`, not `#181`, not its own.
- **It edited no existing ruling.** `R-099` and `R-100` stand unedited on their
  branch and are superseded by id.
- **It authored no card for `RESTORE-01`'s subject under that name**, because the
  work is real and the name is wrong.
- **It flipped no gate**, and it says which clause is missing for each of the
  three that fail.
- **It read no database.**

## 10. State at the end, for the next session

1. **`RST-05` is the largest unowned item on either board** and it is `todo` and
   eligible.
2. **`AUT-17` is still unbuilt and this run is its second live instance.** The
   third will happen on the next night a triage pull request does not merge.
3. **`docs/poc/triage-latest.json` on `main` was four days stale until this run**,
   which is why three escalations never reached the owner.
4. **`GATE-01` is the cheapest unpicked card on either board**: read-only, needs
   nothing from anyone, and it is one of the nine phase 3 conditions.
5. **This run's own pull request is the fifth on the pile if it does not merge.**
   That is stated rather than left for the next run to discover.
