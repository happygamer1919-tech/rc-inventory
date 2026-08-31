# TRIAGE: the board's clock is a ratchet, the phase 3 gate is 0 of 9 behind one card, and two limitations stop being notes

**Date:** 2026-08-31 (UTC), run `20260830-220004`
**Role:** TRIAGE, unattended, stateless
**Input:** `docs/reports/2026-08-31-executor-p3-11-material-cost.md`
**Rubric:** `docs/DOCTRINE-TRIAGE.md`
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, branch `triage/20260830-220004`
**Pull request:** #126
**Rulings:** R-063, R-064, R-065, R-066, R-067
**Cards authored:** P3-28, BOARD-02, AUT-15
**Cards resequenced:** P3-04b, P3-05b
**Gates flipped:** none. Nine audited.
**Escalations:** one, P3-27, with its recommended default.

---

## 0. Boot

| board | todo | in_flight | blocked | halted | shipped | launch gate |
|---|---|---|---|---|---|---|
| `rc-board-phase2.json` | 10 | 1 | 1 | 0 | 36 | 6/9 |
| `rc-board-phase3.json` | 17 | 0 | 3 | 0 | 11 | 0/9 |

Next eligible card at boot: **P3-13**, the deviz schema, lowest-id eligible on the
phase 3 board. Lowest-id eligible on the phase 2 board is **AUT-8**. TRIAGE works
neither; it is recorded because section 1 requires it.

---

## 1. The three deviations, ruled one at a time

Two ratified, one overturned. Each names the test that decided it, per section 1
of the rubric. The full reasoning is in the rulings; this is the shape.

| deviation | test that fired | verdict |
|---|---|---|
| The two lowest-id eligible cards were skipped on an open pull request, which is not a claim | 4 | **RATIFY** (R-063) |
| A seed script and a fourth issue the card did not ask for | 4 | **RATIFY** (R-063) |
| `as_of` written nine hours ahead of the commit, knowingly | 4 | **OVERTURN** (R-064) |

Test 1 fired on none of the three: nothing touched a database, and the run opened
no connection and read no secret. Test 2 passed on all three, which is why they
could be ruled at all: PR #123 merged as `942b6bf`, PR #125 carries the script and
the spec, and the timestamps are in the board file at `612ca05`.

### Why the skip is ratified even though the rule it bent is real

`CLAUDE.md` section 2 says take the lowest-id eligible card. Section 13 permits
skipping a card another actor **holds**, and holding means a claim in
`docs/poc/state.json`. The claims map was empty. What the run acted on was an open
pull request, and **an open pull request is not a claim.**

It is ratified on test 4 because the alternative is concrete and worse: a second
pair of board edits to the same two cards, in a second pull request, conflicting
on the same lines with whichever merged first. This repository has paid three
times for bad conflict resolutions and `CLAUDE.md` names all three.

The rule is not widened to say an open pull request counts as a claim. The
measurement goes to **CLAIM-01**, which already names this exact failure in its
own title, so no card was authored for it. Section 5 forbids a second card for a
problem an open card covers, and the four second overlap is now evidence for the
latency half of CLAIM-01's own acceptance.

### Why the timestamp is overturned, and the finding still credited

The report found the drift, measured it, said it needed a card, and disclosed that
it followed the convention anyway. **Without that paragraph this ruling could not
have been written.** What is overturned is one sentence of it.

Test 4 asks whether the alternative would have been worse. The alternative is a
board carrying `as_of: 2026-08-31T02:31Z` with the report's own section 4b
explaining the apparent jump backwards. That is not worse. It is the correct board
plus a paragraph that had already been written.

**And the drift is not what the report thought it was.** The report reads it as a
fixed nine hour skew, which would be a timezone bug. Measured across the eleven
commits that touched the phase 3 board:

| commit | commit time (UTC) | `as_of` | ahead by |
|---|---|---|---|
| `b8910e5` | 21:06Z | 21:10Z | 3 min |
| `afe4f88` | 21:34Z | 21:55Z | 21 min |
| `f43f538` | 22:18Z | 23:20Z | 62 min |
| `1a18f04` | 22:50Z | 01:20Z | 150 min |
| `f0a99c1` | 23:23Z | 03:10Z | 226 min |
| `111a6a3` | 00:09Z | 05:10Z | 300 min |
| `8e2a78e` | 00:41Z | 07:20Z | 398 min |
| `0f26ea0` | 01:13Z | 09:00Z | 467 min |
| `1eab1d4` | 01:58Z | 10:40Z | 521 min |
| `942b6bf` | 02:13Z | 11:30Z | 557 min |
| `612ca05` | 02:31Z | 11:45Z | 554 min |

**It is a ratchet.** Each session read the previous `as_of` and wrote something
plausibly later than it, and the increment exceeded the real elapsed time. Nothing
in the repository stops it. At the observed rate the board claims tomorrow's date
within a week and `last_checkpoint` stops ordering anything.

The reasoning that produced it is sound at every single step, which is why a rule
cannot fix it and a check can. Nobody wants to be the session that moves the
number backwards. `CLAUDE.md` section 2 already required the commit moment and was
not enough.

**`as_of` on both boards is now read from the system clock and the phase 3 board
moves backwards by about nine hours. That is the ruling taking effect. It is not
an error and it is not to be corrected forward.** `last_checkpoint` is corrected on
the five cards this run touched. `evidence.at` is left alone everywhere, because it
belongs to the run that produced the proof and rewriting another session's record
of its own work is the worse fault. The sweep and the check are **BOARD-02**, whose
failing case is already in the history at `612ca05` and does not have to be
manufactured.

---

## 2. The gate audit: 0 of 9, and the number is not a backlog

All nine phase 3 conditions were audited clause by clause. **None flips.** The
audit is written into all nine `evidence` fields anyway, per section 4.4, because
an audit that flips nothing still tells the next session what is actually missing.

**One sentence carries the whole result: every clause of every condition says "on
production", and nothing is on production.** Twelve migration files, 0013 to 0024,
sit pending in `docs/migrations/APPLY-LOG.md`, every one naming P3-27.

**Eleven cards have shipped on this board and the readiness score has not moved
off 0 of 9 and cannot.** A reader who takes 0 of 9 as a measure of remaining build
work will go looking for cards that do not exist. It measures one unanswered
question.

Two clauses did gain evidence, and both come out of the report being triaged:

- **G2 clause 3** wanted the count of outbound issues with no project assigned,
  taken read-only and pasted. P3-11 shipped `public.unassigned_outbound_count()`,
  and the Cost tab prints it even when it is zero. The clause was written before
  anything could produce that number.
- **G5's arithmetic half** is fully evidenced: PR #125, seven cases, a total hand
  calculated at 1850.00 MDL asserted to the leu, a month boundary row that
  separates Chisinau bucketing from UTC, an unassigned issue carrying 10000 MDL so
  a leak would fail loudly rather than plausibly, and a deactivated product
  carrying 400 of the 1850. **The hand check against one real project is the other
  half and it cannot exist**, because there is no real project.

These nine are the third kind of unflippable gate in section 4, with one
difference worth naming: **a terminal does hold the capability.** R-001 is not
revoked, P2-13 has not run, section 8.7 has not fired. What withholds it is one
sentence of an owner dispatch. So it is not a structural limit, it is a question,
and it is escalated rather than recorded and left.

---

## 3. The resequence: Ivan was reading one question three times

Section 3's four checks were run over both boards, not only the cards the report
touched.

| check | phase 2 | phase 3 |
|---|---|---|
| 1, dangling ids | none | none |
| 2, satisfied but still blocking | P2-08b, correct, Andre genuinely owes it | **P3-04b, P3-05b, P3-27** |
| 3, missing capability edge | none found | **found, see below** |
| 4, edges on a split card | P2-08a/b re-derived, no dependents on the base id | P3-04b, P3-05b, P3-13b, P3-13c all re-derived against their halves, correct |

Check 2 fired on three phase 3 cards. On P3-27 the block is right: Ivan owes the
apply. On the other two it is a **duplicated ask**. Their `question` fields open
with the same sentence P3-27's does, "apply the wave 1 migrations to production",
so the owner reads one question three times and any of the three answers could be
missed.

- **P3-04b**: `[P3-04, P3-10]` becomes `[P3-04, P3-10, P3-27]`.
- **P3-05b**: `[P3-05, P3-10]` becomes `[P3-05, P3-10, P3-27]`.

**Both stay blocked on Ivan, and that is not an oversight.** After the apply there
is still a reconciliation list to read with Mihai before a column is dropped, and
on P3-05b that list may not exist at all, because the supplier backfill refuses
above twenty distinct names. Anything reaching Mihai is item 6 of the closed
escalation list. The edge removes the duplicated question, not the real one.

Recorded and not fixed: **P3-27's title says wave 1 and its register holds twelve
files across three waves.** TRIAGE does not edit titles. It is in the card's
`notes` so a reader taking "wave 1" literally does not conclude that 0020 to 0024
have no apply card.

---

## 4. Three cards authored

**P3-28, phase 3.** `unit_value_at_issue_mdl` on `outbound_lines`, written at
issue time, so a project cost total stops moving when somebody edits a product
price. The AUTHOR left this on P3-11's notes "for Ivan" and the report left it
there too. **It is not on the closed ten-item list**, so under R-050 it is
TRIAGE's, and a limitation parked in a notes field is rediscovered by whoever
first notices that two printouts of the same month disagree. The important default
is negative: **not null with a backfill, never nullable with a fallback**, because
`coalesce(unit_value_at_issue_mdl, p.unit_value_mdl)` is a default-and-override
rather than a snapshot, and R-058 rejected exactly that shape on the deviz price
three days ago. The card also removes the Romanian footnote, because a caveat that
has stopped being true teaches the reader to distrust a number that is now right.
P3-11 is not reopened: it was given `unit_value_mdl`, implemented it, and put the
limitation on the screen instead of hiding it.

**BOARD-02, phase 2.** `npm run check:board-clock`, wired into `quality` by name.
Ahead-only, not a window: a board written twenty minutes before its commit is
normal, a board timestamped after its own commit is a value nobody read from a
clock. Sixty minutes on `as_of`, zero on `last_checkpoint`.

**AUT-15, phase 2.** A defect in `docs/DOCTRINE-TRIAGE.md`, found by applying it,
which that document explicitly invites. Its input clause says needing anything
beyond the report is a defect in the rubric. **Sections 2 through 5 of the same
document then require the inbox, both board files, committed artefacts by name,
and the board again.** This run read all of them and had to: R-064's drift table is
git history and R-065's audit is the board plus the migration register. The
intended distinction is dispatch versus repository, and section 6 already words it
correctly. **TRIAGE did not fix it**, because a role that edits the document
constraining it has removed the constraint whatever the edit says. AUTHOR writes
the sentence; the card carries what it must satisfy.

One thing found while authoring that card, worth having in the open: **the first
version of its acceptance tested a substring that spans a line break in the target
file, so it matched nothing and would have passed vacuously forever.** It was
caught by running the command instead of reading it, which is the only way that
class of defect is ever caught. The committed acceptance normalises whitespace
first, was run, and exits 1 today for both of its reasons.

---

## 5. The escalation, with its recommended default

```
ESCALATION: twelve merged migration files have never been applied to the live
  Supabase project, and all nine phase 3 launch gate conditions are behind that
  one action.
WHY IT IS ESCALATED: item 5 or item 7 of the closed list, depending on which
  option is taken. Option (b) lifts a restriction on a terminal's use of an
  environment; option (a) is a click in the Supabase console. Either way it is
  not TRIAGE's.
CONTEXT: 0013 to 0024 are authored, merged, and proven to apply unmodified to a
  real PostgreSQL. Nothing in CI needs them, because every acceptance runs
  against the local stack. Nothing the owner can SEE exists on the live site
  until they run. Eleven shipped cards are invisible. P3-04b and P3-05b are
  parked behind it. CLAUDE.md section 8 has NOT been revoked: R-001 still grants
  EXECUTOR the apply while the project holds zero real client data, and P2-13
  has not run. What blocks it is one sentence of the 2026-08-30 dispatch.
OPTIONS:
  (a) Ivan applies all twelve by hand in the Supabase SQL editor, in file order,
      pasting the verification grids at the foot of each file back onto P3-27.
      Slowest, and it is what section 8 was originally written for.
  (b) Ivan lifts the no-connection sentence for these files and EXECUTOR applies
      them under the three-phase apply in CLAUDE.md 8.5, journalling all three
      phases into docs/migrations/APPLY-LOG.md. Fastest, already authorised by
      R-001, and none of the twelve contains DROP TABLE, TRUNCATE or DELETE, so
      8.6 stops none of them.
  (c) Keep waiting for more of the wave. This was the original recommendation
      and its condition has been met: wave 1 is complete and wave 2 has shipped
      on top of it.
RECOMMENDATION: (b). The reason to wait has already been satisfied, the grant
  already exists, and every additional day adds files to a register that is
  applied in one sitting either way. (a) closes the same gap if he would rather
  do it himself.
IF UNANSWERED: nothing breaks and nothing gets worse, which is exactly why this
  has gone unanswered longer than anything else on the board. The phase 3
  readiness score stays at 0 of 9 no matter what ships, the two drop cards stay
  parked, and the client sees none of the eleven cards that have shipped.
```

---

## 6. What was NOT done, listed because a boundary is only real if it is visible

- **No card shipped.** TRIAGE runs nothing, so it can prove nothing.
- **No card pull request merged.** #126 is TRIAGE's own rulings pull request and
  the only one it may merge.
- **No migration applied**, no database connection opened, no secret read, nothing
  under `/Users/ivan/rc-secrets` touched.
- **No application code, no test, no migration file written.**
- **No existing ruling edited.** R-063 through R-067 are new entries. R-046's
  phase 2 gate audit stands untouched: nothing in this report bears on G4, G7 or
  G9 of that board.
- **`docs/DOCTRINE-TRIAGE.md` not edited**, for the reason in R-067.
- **P3-11 not reopened.** It shipped on a green check plus its named spec.
- **No third party written to.**

---

## 7. Checks

| check | result |
|---|---|
| `node docs/board/validate-board.mjs` on all three boards | PASS, 0 violations, run before every commit |
| `npm run check:conflict-residue` | 3 checks passed, 261 files |
| `docs/poc/triage-latest.json` | valid JSON, every key present |
| AUT-15's acceptance command, run as written | exits 1 today, both halves, as the card claims |
| em dash or en dash in any file touched | zero |
| secret staged | none, `git diff --cached` read and scanned |

---

## 8. What the next session picks up first

1. **P3-13**, the deviz schema, still the lowest-id eligible card on the phase 3
   board and still the widest unblock: P3-13b, P3-13c, P3-12 and P3-18 sit behind
   it. Unchanged by this run.
2. **P3-28** is eligible immediately, since P3-11 is shipped. It sorts last, so it
   will not compete with wave 2.
3. **BOARD-02 and AUT-15** are eligible on the phase 2 board, which is still the
   harness queue per R-061. BOARD-02 first if a board is edited before it runs,
   because every edit until then adds another timestamp to its sweep.
4. **P3-27 is the escalation.** Everything in section 2 is behind it.
