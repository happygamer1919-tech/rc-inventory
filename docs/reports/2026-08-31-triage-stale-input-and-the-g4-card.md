# TRIAGE, run 20260831-040003: the input was a report already triaged, and G4 turns out to have been closeable for three days with no card

**Role:** TRIAGE. **Run:** `20260831-040003`, unattended, scheduled 04:00 local.
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, branched from `origin/main` = `1879be0`.
**Branch:** `triage/20260831-040003`. **Cap:** 30 minutes.
**Rubric:** `docs/DOCTRINE-TRIAGE.md`, read in full before any write.

---

## 0. Boot

The status report was printed before any write, per `CLAUDE.md` section 1.

**The worktree was checked out at `card/p3-13b` when this session booted**, which
is the branch this run's own EXECUTOR left behind, so the counts below are the
counts as read there. The `main` figures differ on one card and the difference is
itself a finding, in section 4.

| board | shipped | in_flight | todo | blocked | halted | launch gate |
|---|---|---|---|---|---|---|
| `rc-board-phase2.json` | 36 | 1 | 10 | 1 | 0 | 6/9 |
| `rc-board-phase3.json` (at `card/p3-13b`) | 12 | 1 | 15 | 3 | 0 | 0/9 |
| `rc-board-phase3.json` (at `main`) | 12 | 0 | 16 | 3 | 0 | 0/9 |

Next eligible card, taken from `scripts/poc/eligible.mjs` against `main` rather
than sorted by hand: **AUT-10** on the phase 2 board, **P3-13b** on the phase 3
board. Ids sort lexically, so `AUT-10` precedes `AUT-8`; the AUT lane ids are not
zero-padded, which is the exact reason `CLAUDE.md` section 2 says the P ids are.
TRIAGE takes no card; both are recorded because section 1 asks for them.

---

## 1. The input, which was not the one the harness named

**The dispatch named `docs/reports/2026-08-31-executor-p3-13-deviz-schema.md`.
That report had already been triaged in full**, by run `20260831-010005`, as
rulings R-068 to R-074, merged as PR #131 at 08:36:51Z, twenty minutes before
this step started. `docs/poc/triage-latest.json` on `main` names it by path as
the report that run consumed.

**The actually newest committed executor report is
`docs/reports/2026-08-31-executor-p3-13b-deviz-editor.md`**, written by this
run's own EXECUTOR, committed on branch `card/p3-13b` in open PR #133. That is
what this run triaged, and R-075 records both the choice and the defect that
caused it.

Following the dispatch literally would have produced a second set of rulings with
new ids over facts already ruled on, on a green pull request, with nothing
erroring. That is card **AUT-17**, and section 5 has the three defects in the
eleven lines of shell that select the input.

**This is the invitation in DOCTRINE-TRIAGE being taken, not a session going off
piste.** The rubric says that if TRIAGE needs something not in the report or in
the rubric, that is a defect and saying so is a legitimate output. R-067 already
found the same clause wrong in the rubric; this run found the same sentence a
second time, in `scripts/poc/run.sh`, in the text that actually reaches the
model.

---

## 2. Deviations ratified, individually, with the test that cleared each

Two, both flagged by the report itself rather than found. **R-076** carries both.

**DEVIATION 1: EXECUTOR RESOLVED AND THEN MERGED PR #126 AND PR #131, WHICH
TRIAGE OPENED. RATIFIED ON TEST 3**, with the authorising rulings cited by id.
R-052 assigns a conflicting pull request to EXECUTOR and R-070 applied that to
#126 by number three hours earlier. An assignment that hands a terminal the
resolution but withholds the merge hands it the ability to produce a green,
up-to-date, still-unmerged pull request, which is the state the assignment exists
to end. `quality` concluded success on head shas `cc99420` and `1bdbb12`, which is
the condition section 3.1 states.

**The general rule is now written down so it is not re-derived:** a conflicting
pull request assigned to EXECUTOR under R-052 is EXECUTOR's to merge, on green
`quality` on the sha it pushed. What does not follow, and R-076 says so: EXECUTOR
may not merge a TRIAGE pull request that is not conflicting, and TRIAGE still may
not merge a card pull request at all.

**DEVIATION 2: THE RUN DID RST-03'S WORK WITHOUT TAKING RST-03. RATIFIED ON TEST
4.** The alternative was to take a phase 2 card in a run whose queue was the phase
3 board, with P3-13b eligible and a 45 minute cap, leaving five rulings and three
cards outside `main` for another three hours while every board edit widened the
conflict.

---

## 3. The gate audit, which is where this run earned its time

**Phase 2 stays at 6 of 9. Phase 3 stays at 0 of 9. Nothing flipped.** Every
failing condition was audited and the audit is written into its `notes` whether
or not it moved, per section 4. **R-080** carries it.

### G4 has been closeable by a terminal since 2026-08-28 and has had no card

R-053 replaced G4's deciding clause on 2026-08-28. It is no longer one real
document through Andre's live scenario. It is **the ingest endpoint asserted
against a fixture document plus four named failure cases: redirect, malformed
payload, oversize, auth rejection.** That ruling's `Also changes` line ordered two
board edits, and **neither was ever made**: P2-08b was not rescoped, and no card
was authored for the half that was left over. The gate's notes carry the rescope;
the board carries no card.

So a gate that a terminal has been able to close for three days was audited twice
since as one that no terminal can close. R-046 said "no terminal can close this
gate"; R-074 repeated it this morning.

**Measured against the tree rather than against the cards, three of the five
clauses are already green and nobody had recorded it.**
`tests/e2e/extraction.spec.ts` runs in the `End to end` step of `quality` on every
push:

| clause | state | where |
|---|---|---|
| the fixture document | **GREEN** | case 2, `un callback extracted scrie fiecare camp al contractului` |
| auth rejection | **GREEN** | case 4, `secret gresit sau lipsa este 401 si nu scrie nimic` |
| malformed payload | **GREEN** | case 5, `un payload in afara contractului este 400 si nu scrie nimic` |
| redirect | **ABSENT** | nothing in `lib/data/extraction-fire.ts` sets a redirect policy |
| oversize | **ABSENT** | `app/api/extraction/callback/route.ts` bounds nothing |

**Two cases short, and those two cases are card P2-20**, authored on the phase 2
board, depending on P2-08a which is shipped, so eligible today. **G4 has a card
for the first time in this repository's history.**

**R-074's premise is corrected by a new ruling, not by an edit.** It wrote
"P2-08a is unshipped". P2-08a is shipped, and R-046 had already re-derived it as
shipped on 2026-08-28. R-074's conclusion is confirmed; the sentence it rested on
is not.

**The ids are assigned the opposite way round from R-053's sentence and the swap
is recorded.** R-053 said rescope P2-08b and author a new card for the round trip.
Done that way, P2-08b's title, acceptance, `defaults` and the preserved Andre
question would all have to mean something else, and TRIAGE does not edit titles.
So P2-08b keeps the round trip and P2-20 carries the assertions. Substance
identical, ids swapped, written down so nobody hunts for a card matching R-053's
words.

**P2-08b is degated and its `question` says so in an appended dated paragraph.**
Its `IMPACT IF UNANSWERED` line read "gate G4 stays fail", false since 2026-08-28
and the sentence most likely to be read off that card by whoever next asks what
Andre is holding up. Corrected underneath, never rewritten. It stays `blocked` on
`andre`: nothing new is asked of him, and the wording of the ask is untouched.

### G7 and G9

**G7 stays `fail`, `blocked_on: ivan` retained.** The three things in front of it
are the three the 2026-08-27 audit named and none has moved. No database read was
performed and none is claimed. **What is new is that the first two are put in
front of the owner for the first time**, as this run's second escalation, with the
honest caveat that setting them does not close the gate on its own.

**G9 stays `fail`.** P2-14 is `blocked` on `client`. The one gate no terminal can
close.

### The phase 3 gate is not re-audited, and the reason is no longer R-074's

R-074 declined because R-065's audit was outside `main`. It is on `main` now. It
is not repeated because nothing could have moved any of the nine: no migration
has been applied, the pending register stands at thirteen files, and the one card
this run's report touched is `in_flight` with a red acceptance.

---

## 4. Two pull requests are stuck and nothing in the system can see either

**R-078**, and this is the finding the input report could not have had, because
both facts moved after it was written.

**PR #133 is `CONFLICTING` and `DIRTY`, and there is no `quality` check run on its
head sha `f377fb9` at all.** The checks on that commit are Vercel and a skipped
Supabase preview. `CLAUDE.md` section 3 names the cause: a pull request
conflicting with `main` triggers zero workflows. **The diacritic fix in that head
commit has therefore never been tested**, and the report's red table was measured
on an earlier sha. The report handed it to the next run as BEHIND, needing a merge
from `main`; it is now a conflict resolution under R-052.

**PR #130 is stuck too and nothing has named it for a full run.** It carries the
R-073 addendum to the P3-13 report and two learnings. It is `MERGEABLE` and
`BEHIND`, and its `quality` run on head sha `5631e6e` **failed at the `End to end`
step** at 05:34:45Z. `main` was green at `c124529` one minute earlier and green
again at `f036f1b`, so this is not `main` being red: it is a documentation-only
branch failing the end to end suite, a flake or an intermittent, and either way a
red check no merge may rest on.

**Neither is covered by an open card, and the reason is that RST-02 is correct.**
Its `defaults` forbid the sweep from ever taking a `card/` branch and its
acceptance asserts the exclusion, for the reason written on it: a sweep that
merged card branches would ship unproven cards at four in the morning. R-070 added
that a **selected** pull request the sweep cannot merge is escalated. A card
branch is never selected, so it is never escalated either. **Two correct rules
compose into a blind spot exactly the width of the pull requests that carry the
product.**

So the missing piece is visibility, not recovery, and it is card **AUT-18**: every
run lists every open pull request it did not merge and escalates the two shapes no
merge could rest on, `CONFLICTING`, or a head commit older than this run with
`quality` not green on it. **It merges nothing and its acceptance asserts that it
cannot.**

### The board on `main` says P3-13b is untouched

`CLAUDE.md` section 2 requires the flip to `in_flight` to be committed before the
work starts, "so the board never shows a card being worked as untouched". **That
flip is inside PR #133.** On `main` today P3-13b reads `status: todo`,
`scripts/poc/eligible.mjs` returns it as the first eligible card on the phase 3
board, `docs/poc/state.json` holds no claim on it, and its `notes` on `main`
mention no branch. A run reading only `main` sees a clean card and a red branch it
has no reason to look for.

**It is recorded on CLAIM-01, whose title already names the general defect, and
not as a new card.** It was not fixed by editing the board either, and the reason
is on that card: flipping the status on `main` would collide with #133 on the one
card #133 exists to change, and would ALSO remove P3-13b from the eligible list,
sending the next run to P3-14 instead of to the branch that needs finishing. Both
readings are wrong, which is what makes it a mechanism defect rather than a board
edit somebody forgot. R-063 measured the four second version of this; this is the
three hour version.

**P3-13b is deliberately not edited by this run.** Its `notes` on branch
`card/p3-13b` already record the red acceptance, the eight failed cases, the
diacritic root cause and the three undiagnosed failure shapes, in the exact fields
TRIAGE would write to. A second copy on `main` would collide with PR #133 on the
same card and would most likely delete the executor's own account of its run. That
is the call R-074 made for the same reason, applied consistently.

---

## 5. The harness hands the review step the wrong file, in three ways

**R-075**, card **AUT-17**. `scripts/poc/run.sh` lines 734 to 735:

```
TRIAGE_REPORT=$(git ls-tree -r --name-only origin/main -- docs/reports/ \
  | grep -E "^docs/reports/[0-9]{4}-[0-9]{2}-[0-9]{2}-executor-[a-z0-9-]+\.md$" \
  | sort | tail -1)
```

- **It sorts filenames, not commits.** Within one date the slug decides which
  report is newest. Today that was harmless by luck: `p3-13b-deviz-editor` sorts
  after `p3-13-deviz-schema` because `b` is greater than `-`. No inversion has
  occurred yet, which is exactly why the defect has never fired and why AUT-17's
  fixture has to be constructed rather than replayed.
- **It reads `origin/main` only.** An executor report rides in the pull request
  carrying its card. A card that does not ship leaves its report on an unmerged
  branch, and **a run whose card fails is the run whose report most needs
  triaging**. It is the one shape this selector cannot see.
- **It never asks whether that report was already consumed**, though the answer
  is committed, on `main`, in the file the harness itself requires TRIAGE to
  write.

The fourth acceptance half is the dispatch sentence itself. "You get nothing else
and you need nothing else" is the clause R-067 overturned in the rubric, and
AUT-15 corrects it there and not in `run.sh`. Correcting one and not the other
leaves the false half in the only copy a session is guaranteed to read.

---

## 6. The board sweep, and the one edit it produced elsewhere

**R-081.** All four section 3 checks run over both open boards.

- **Check 1, dangling:** none. Every `depends_on` id resolves on its own board,
  including the three cards authored today.
- **Check 2, satisfied but blocking:** four cards fire, all four correct.
  P2-08b genuinely waits on Andre, though what it waits for has changed meaning.
  P3-27 genuinely waits on Ivan. P3-04b and P3-05b were resequenced onto P3-27 by
  R-065, which is on `main` now.
- **Check 3, missing capability edge:** P2-13 still, still unauthorable across two
  boards, still carried as an acceptance clause under R-072 rather than an edge.
  Nothing authored today removes a capability.
- **Check 4, split-card edges:** the P3-13 family is unchanged. **The P2-08 split
  is where check 4 earned its place**: R-053 split P2-08b's subject in two and the
  second half was never authored, so for three days the split existed in a ruling
  and not on the board.

**R-079** is the one card edit outside those checks. `DEVIZ_STATUS_LABEL` shipped
`Ciorna` without its diacritic and was caught by P3-13b's own spec, by the
accident of that spec asserting the label text, and by nothing that would catch
the next one. P3-21's `defaults` have said "DIACRITICS ARE PART OF THIS" since it
was authored; its `acceptance` never proved it. It does now, as a committed
denylist of pairs seeded with `Ciornă`/`Ciorna`, explicitly not a heuristic over
strings with no diacritics, because Romanian is full of correctly spelled words
that have none and a heuristic would be suppressed within a week.

---

## 7. What was written

**Seven rulings**, R-075 to R-081, in `decisions/inbox.md`.

**Three cards authored**, each with a machine-checkable acceptance and `defaults`:

| card | board | what it is |
|---|---|---|
| **P2-20** | phase 2 | G4's last two clauses, redirect and oversize |
| **AUT-17** | phase 2 | the review step's input selector, four halves |
| **AUT-18** | phase 2 | the open pull request census, which merges nothing |

**Card edits:** RST-03 `notes` (acceptance met, recorded not shipped), RST-02
`notes` (the AUT-18 boundary), AUT-16 `notes` (today's instance), CLAIM-01 `notes`
(the three hour version of its own defect), P2-08b `question` and `notes`
(degated, corrected underneath), P3-21 `acceptance` and `notes` (the diacritic
half), and the `notes` of G4, G7 and G9.

**No gate flipped**, and both counts are recorded rather than skipped.

**No card was shipped, no pull request was merged, no migration was applied, no
application code and no test was written, and no existing ruling was edited.**

**Validator run before the commit, on all three boards:**

```
node docs/board/validate-board.mjs docs/board/rc-board-phase2.json  -> PASS, 0 violations
node docs/board/validate-board.mjs docs/board/rc-board-phase3.json  -> PASS, 0 violations
node docs/board/validate-board.mjs docs/board/rc-board.json         -> PASS, 0 violations
```

---

## 8. Escalations, each with its recommended default

**1. P3-27, thirteen migration files, third night raised, fifth run named.**
Recommendation: option (b), let the overnight builder apply all thirteen in order
under the existing three-phase procedure, journalled. The permission exists and
has never been revoked, and not one of the thirteen deletes anything. Option (a),
running them himself in the Supabase editor, closes the same gap. **The answer
channel still cannot resolve a phase 3 id**, so `R P3-27 default` will be refused
until AUT-16 ships. If unanswered: twelve shipped cards stay invisible on the live
site and the phase 3 score stays at 0 of 9 whatever ships next.

**2. `RESEND_API_KEY` and `RESEND_FROM` in the production environment**, item 7,
panel actions. Recorded inside G7's notes since 2026-08-26 and never once put in
front of him. Recommendation: set both now, by name only, and reply that they are
set; they are already required items on the rotation checklist, so doing them now
removes two items from that day. **The caveat is stated rather than buried: this
does not close G7.** A third item is needed, a recipient that is not on a domain
that does not exist, and that lands at P2-13. If unanswered: nothing breaks, the
reminder keeps recording its reason on screen and not sending, which is the
designed degradation.

---

## 9. What the next run picks up first

1. **PR #133.** It is `CONFLICTING` with no `quality` run on its head sha, so the
   diacritic fix is untested and the pull request cannot merge. Resolve locally
   against the full tree per R-052, push, and read the `quality` run on the new
   sha before touching the seven undiagnosed cases. The failure ceiling stands at
   one attempt of three.
2. **PR #130.** Merge `main` in, push, and re-read the `End to end` step. If it
   fails again on a documentation-only branch, that is a flaky suite and it is a
   finding of its own, because every card on both boards ships on that check.
3. **RST-03.** Four read-only commands and one status field. Its acceptance is met
   in full and R-077 has the evidence assembled. The cheapest card on either board.
4. **P2-20.** G4's two missing cases. It is the only card on either board that
   moves a launch gate, and until today it did not exist.
