# TRIAGE run 20260904-071258: the report that had already been read

**Role:** TRIAGE
**Run id:** 20260904-071258
**Date:** 2026-09-04
**Branch:** `triage/20260904-071258`, cut from `origin/main` at `d4915a8`
**Rubric:** `docs/DOCTRINE-TRIAGE.md`, read in full before any write
**Dispatched input:** `docs/reports/2026-09-04-executor-aut-16-board-set.md`
**Actual input:** `docs/reports/2026-09-04-executor-aut-17-triage-selector.md`

---

## 1. Boot status report, printed before any write

**`docs/board/rc-board-phase2.json`**, `as_of` 2026-09-04T11:47:00Z, 62 cards:
`shipped` 45, `todo` 13, `in_flight` 2, `blocked` 2, `halted` 0.
Launch gate **6/9**. G4, G7 and G9 fail; G7 is blocked on `ivan`.
Blocked: P2-08b on `andre`, P2-14 on `client`. In flight: AUT-3, AUT-17.
**Next eligible card: AUT-18.**

`docs/board/rc-board-phase3.json`, `as_of` 2026-09-03T21:05:00Z, 65 cards:
`shipped` 31, `todo` 34. Launch gate **0/9**.

## 2. THE DISPATCH PREMISE WAS FALSE IN BOTH HALVES, AND THAT IS THE RUN

The dispatch said the newest report was
`docs/reports/2026-09-04-executor-aut-16-board-set.md` and that this run needed
nothing else. Neither half held.

**It is not the newest.** `docs/reports/2026-09-04-executor-aut-17-triage-selector.md`
is newer by commit order and was written by **this run's own executor step**,
run id `20260904-071258`. It rides on `card/aut-17`, PR #192, unmerged, and the
old selector reads `origin/main` only.

**It had already been triaged in full, four hours earlier.** TRIAGE run
`20260904-040001` consumed exactly that file and wrote **ten rulings, R-108 to
R-117**, against it. Committed and re-checkable by a stranger:

```
$ git show origin/triage/20260904-040001:docs/poc/triage-latest.json
  "run_id": "20260904-040001",
  "report": "docs/reports/2026-09-04-executor-aut-16-board-set.md",
  "rulings_written": ["R-108" ... "R-117"]
```

PR **#190**, open, `mergeStateStatus CLEAN`.

**Nothing from that report was re-ruled.** Every finding this run derived
independently from it already carries an id, and R-118 names all eight mappings
in a table rather than asserting coverage. Writing a second block of ids saying
the same things is the RULE-02 failure arriving from the other direction: a
collision conflicts on the counter line and gets caught, a duplicate under a
fresh id merges cleanly and leaves two entries for every future reader to
reconcile.

**So this run re-aimed at the report that is genuinely newest and genuinely
untriaged**, which DOCTRINE-TRIAGE permits in terms: the report is the dispatch,
ground truth is committed repository files, and a run that finds a premise it
cannot verify says so and rules on what is there. R-119 to R-121 are that output.

## 3. Rulings written

| id | what it decides |
|---|---|
| **R-118** | The dispatched report had already been triaged; nothing in it is ruled twice, the coverage is named finding by finding, and the run re-aims. AUT-17's defect fires for a fourth time and this is its first duplicate-TRIAGE instance: two runs, four hours apart, one report. |
| **R-119** | AUT-20's cause is neither side of the fork R-112 posed. `test-chat-classify.sh` has no isolation: it reads the live answer spool, and running it **writes a forged owner instruction into it**. The card's scope is narrowed to that, the classifier is explicitly not to be changed, and the sibling test files get the same audit. |
| **R-120** | Merging PR #192 does not fix the selector, because `run.sh` is a deployed copy. This run's own dispatch carries the sentence AUT-17 deleted, which is the proof. The reinstall obligation and its two-digest evidence are written where they can be cited. |
| **R-121** | AUT-17's fix remembers exactly **one** consumed report, read from a file that has not reached `main` since 2026-08-31 while six TRIAGE runs have completed. Two defects follow and both are AUT-17's own defect 2 applied to the record instead of the reports. A concrete plural replacement is recommended. |

## 4. The finding worth reading if you read only one

**Running AUT-6's acceptance fabricates an instruction from Ivan.**

`scripts/poc/ask.mjs:49` defaults `ASK_DIR` to `/Users/ivan/rc-poc-logs/asks`
when `POC_ASK_DIR` is unset. `scripts/poc/test-chat-classify.sh` writes its
fixture to a `mktemp -d` and never sets `POC_ASK_DIR`, so the classifier it
invokes reads and writes the **live** spool. There is a real unanswered question
in there, `open/P3-11C.json`, asked 2026-09-01. The fifth fixture message is
therefore routed to it as an answer, which is the failing assertion, and the
route is also **persisted**:

```
/Users/ivan/rc-poc-logs/asks/answers/P3-11C.json
  {"card_id":"P3-11C","verdict":"instruction",
   "text":"what is left to do before launch",
   "route":"only_open","from_id":999,"update_id":5,
   "at":"2026-09-04T11:38:30.102Z"}
```

**This run created that file, at 11:38:30Z, by running the test once to verify
the report's finding.** It is stated plainly rather than buried: `from_id` 999 is
the fixture's invented owner id and Ivan did not write any of it. Per CLAUDE.md
section 14 a role calling `ask.sh` on card P3-11c would consume it and exit 11,
`instruction`, and be told to do "what is left to do before launch".

**The standing risk is bounded and is not minimised.** That question's deadline
passed on 2026-09-01 and nothing is waiting on it, so nothing consumes the file
until a future `ask.sh` names that card. It is not an active incident. It is a
loaded one, placed there by a shipped card's own acceptance line.

**It is removed with `rm /Users/ivan/rc-poc-logs/asks/answers/P3-11C.json`, and
TRIAGE did not run it.** This role writes text into this repository and does not
touch live machine state, so the path and the command are recorded in R-119 for
whoever works AUT-20, who does it before running the test again. Running the test
again re-creates it.

## 5. Cards

**No card was authored, and that is the correct outcome.** DOCTRINE-TRIAGE
section 5 forbids authoring a card for something an open card already covers.
Every piece of work this run found maps onto a card that already exists: AUT-20
(R-112, on PR #190), AUT-21 (R-113, on PR #190), AUT-17 (in flight, PR #192).

**One card edited: AUT-6.** Its `notes` now carry the acceptance audit: the test
is red today, why it is red, that it writes to live state, and why the card is
**not** flipped back to `todo`. CLAUDE.md section 6 is about the behaviour an
acceptance describes, and that behaviour is intact, shipped and deployed:
identity is still checked before text, the two exact ruling forms are still the
only ones accepted, an unset `TELEGRAM_OWNER_ID` still accepts nothing, and four
of the six assertions pass untouched. Putting a working responder back in the
queue over a directory default would be the wrong reading.

**AUT-17's card fields were deliberately not edited, and DOCTRINE-TRIAGE has a
gap here.** Section 5 says a finding about an existing card goes into that card's
`notes`. AUT-17 is `in_flight` with PR #192 open, editing the same card object in
the same JSON file. A `notes` edit from this branch would put a conflict between
a rulings pull request and the card pull request it is trying to help, resolvable
only by EXECUTOR against the full tree under R-052. **The rubric gives no
guidance for a card whose pull request is open.** The answer taken, and recorded
in R-120 so it can be cited: the ruling is the delivery and the card is left
alone. Saying so is a legitimate TRIAGE output and this is it.

## 6. Board sweep, DOCTRINE-TRIAGE section 3

Four checks, run over **140 cards on all three boards** and not only the cards
the report touched.

1. **Dangling edges: none.** Every id in every `depends_on` resolves to a card.
2. **Satisfied but blocking: one, and it is correct.** P2-08b is `blocked` on
   `andre` with P2-08a `shipped`. Andre genuinely owes the live document run, so
   the block stands. No other card carries a `blocked_on` with no dependency, and
   no card's `status` disagrees with its `blocked_on` in either direction.
3. **Capability edges.** The one this repository has, P2-13 removing grants that
   phase 3 cards still need, cannot be expressed: `depends_on` does not cross the
   board set. **Already ruled, R-116, card BOARD-03 on PR #190.** Not re-ruled.
4. **Edges on split cards: thirteen found, none actionable.** Every one points at
   a parent (P3-04, P3-05, P3-11, P3-13, P3-27) that is `shipped`, so the edge is
   satisfied whichever half was meant and re-deriving it moves nothing.

**Nothing was resequenced.** A sweep that changes nothing is still the most
useful thing the next session can read, which is why it is written out.

## 7. Gate audit, DOCTRINE-TRIAGE section 4

**Phase 2 stays 6/9. Phase 3 stays 0/9. Nothing flipped, and the eighteen
conditions were deliberately NOT re-derived.**

R-117 audited all eighteen four hours ago. Its branch is cut from
`d4915a8`, which is `origin/main`'s exact head right now, so that audit saw
everything `main` has and nothing has landed since. **R-074's precedent applies
literally**: a gate already audited whose audit is not yet on `main` is not
re-audited, because a second derivation of the same evidence produces a second
`evidence.ref` paragraph and no new fact.

The three phase 2 failures, and what each is waiting on:

- **G4** is closeable by a terminal and has had a card since R-080: **P2-20**,
  `todo`, eligible now.
- **G7** is `blocked_on: ivan`. Two production environment settings, escalated
  below for the fourth time.
- **G9** needs the client to complete a cycle himself. **No terminal can ever
  close it**, it is recorded as such in its own `notes` across four audits, and it
  is not backlog. A reader counting 3 of 9 as remaining work will go hunting for
  cards that do not exist.

## 8. Escalations

**Two, both carried forward rather than newly found, and both with a recommended
default.** They are in `docs/poc/triage-latest.json` in full, in plain language.

1. **The credential lockdown is waiting on the extraction supplier, since
   2026-08-27.** Recommendation: set a date and do it rather than waiting, since
   the only thing his answer buys is one live document test.
2. **`RESEND_API_KEY` and `RESEND_FROM` are not confirmed set in production,
   since 2026-08-26.** Recommendation: set them by name and reply, noting
   honestly that it does not by itself make the condition pass.

**WHY THEY ARE REPEATED RATHER THAN LEFT TO PR #190.** They were raised by run
`20260904-040001` and its pull request has not merged. The digest reads the
merged `triage-latest.json`, so an escalation stranded on an open branch reaches
nobody. CLAUDE.md section 15 settles the principle: an outstanding question
repeats in every digest until it is answered, and that is deliberate nagging
rather than duplication. **Nothing this run found is itself on the closed ten of
DOCTRINE-TRIAGE section 6.** The forged spool file is a terminal action under
AUT-20, and the harness reinstall is a terminal action too, named in R-120 as
explicitly not an escalation.

## 9. The counter, and the conflict this pull request will have

`decisions/NEXT-RULING-ID` on `origin/main` holds `R-098`. **It was not taken**,
for the reason R-096 recorded when it did the same thing. Ruling ids R-087 to
R-117 are already written on open branches:

| branch | pull request | ids written |
|---|---|---|
| `triage/20260903-070005` | #172 | R-087 to R-091 |
| `triage/20260902-070904` | #157 | through R-095 |
| `board/dispatch-20260903` | #181 | R-098 |
| `triage/20260903-220002` | #184 | R-098 to R-101 |
| `triage/20260904-010000` | #187 | R-102 to R-107 |
| `triage/20260904-040001` | #190 | R-108 to R-117 |

**R-118 is the first id no open branch has written.** The counter advances to
`R-122`. Nothing is renumbered.

**This pull request will conflict with #190 and that is by design, not by
accident.** Section 8b built the counter to be one line precisely so two
allocators collide loudly. The resolution is mechanical and belongs to EXECUTOR
under R-052, locally and never in the web editor: take the higher counter, keep
both blocks of rulings, keep both card sets, take either `as_of`. The board diff
here is deliberately **two lines** (`as_of` and AUT-6's `notes`) to keep that
resolution as small as it can be.

## 10. Learnings

**Nothing appended to `docs/LEARNINGS.md`.** Every defect this run found is
already a ruling and a card, and the two candidate entries (a test defaulting to
live state, a deployed copy that a merge does not update) are each the substance
of R-119 and R-120 rather than a fact with no decision attached. Section 2 of the
rubric: a learning is what is left when there is neither a decision nor work, and
here there is both.

## 11. What the next run picks up first

1. **PR #192, card AUT-17.** Read `npm run checks:state 192`. Merge on green
   `quality` for the head sha, **then run `bash scripts/poc/install.sh`** and
   record the two matching digests, per R-120. The merge alone changes nothing.
2. **PR #190**, ten rulings and six cards, `CLEAN` as of this run. It carries
   AUT-19 to AUT-22, BOARD-03 and RULE-05 and both escalations above.
3. **This pull request.** It conflicts with #190 on the counter by design;
   whichever merges second is resolved locally under R-052.
4. **AUT-20**, once #190 lands. R-119 tells it what is actually wrong, and the
   forged spool file is deleted before the test is run again.
5. **AUT-18**, the next eligible card by id, which is the pull request census.
   Eleven pull requests were open when this run started and five are `DIRTY`.
