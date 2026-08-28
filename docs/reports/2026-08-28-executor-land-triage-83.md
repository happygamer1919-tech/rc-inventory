# EXECUTOR: landing the orphaned TRIAGE rulings from run 20260827-220052

**Date:** 2026-08-28 (UTC)
**Role:** EXECUTOR
**Card:** none. This is a dispatch to land PR #83, the orphaned TRIAGE output of
scheduled run `20260827-220052`.
**PR:** #83, branch `triage/20260827-220052`
**Base at landing:** `origin/main` at `7a3fffb`

---

## 1. What this pass was for

PR #83 is the only TRIAGE-role report in existence and it was not on `main`. It
carries `decisions/inbox.md` rulings R-039 to R-046, four new board cards, two
card edits, three launch gate note appends, `docs/poc/triage-latest.json`, and
`docs/reports/2026-08-28-triage-first-unassisted-pass.md`. The branch had fallen
behind `main` and could not merge.

Nothing in it is application code and nothing in it is a migration. The stop
condition in the dispatch was never reached.

---

## 2. The state the branch was actually in, which was not the state described

The dispatch described #83 as CONFLICTING and 7 commits behind `main`. That was
true of the local branch. It was not true of `origin`.

At `origin`, the branch head was `555b725`, a merge commit made at
`2026-08-28T18:05:58+03:00` titled "Merge branch 'main' into
triage/20260827-220052". Its second parent is `7a3fffb`, the head of `main`, so
the branch was 0 behind and 3 ahead, and GitHub reported it `MERGEABLE`.

**That merge was a broken resolution and is why the PR sat at `BLOCKED`.**
`docs/board/rc-board-phase2.json` at `555b725` does not parse as JSON. It carries
conflict markers whose leading characters had been stripped, leaving the marker
tails behind as literal lines inside the file:

```
  "phase": "phase-2-build",
 triage/20260827-220052
  "as_of": "2026-08-28T10:55:00Z",

  "as_of": "2026-08-28T11:35:00Z",
 main
```

A `grep` for `<<<<<<<` finds nothing there, which is exactly why it survived a
commit. The board validator would have caught it; it was not run.

The four files at `555b725` were the only files differing from `main`, so the
damage was confined to that one file.

---

## 3. Conflicts, and how each was resolved

The rebase of the two TRIAGE commits onto `7a3fffb` produced **one textual
conflict**, in one file. Everything else auto-merged.

### Conflict 1 of 1: `docs/board/rc-board-phase2.json`, the `as_of` field

```
<<<<<<< HEAD
  "as_of": "2026-08-28T11:35:00Z",
=======
  "as_of": "2026-08-28T10:55:00Z",
>>>>>>> e67c316 (TRIAGE: rulings R-039..R-046 ...)
```

`main` bumped `as_of` to `11:35:00Z` when CRIT-17 shipped. #83 bumped it to
`10:55:00Z`, which is the earlier of the two and is stale.

**Resolved to `2026-08-28T16:30:00Z`**, the moment this landing commit was made.
Neither side was taken: CLAUDE.md section 2 requires the PR that changes the
board to bump `as_of` to the commit moment, and this PR does change the board.

### Everything else merged without conflict, and each was verified by hand

The absence of a conflict is not proof of a correct merge, so every overlapping
edit was diffed structurally, card by card and field by field, against the merge
base `4569b53`, against `main`, and against the branch.

| Area | `main` since merge base | #83 since merge base | Outcome |
|---|---|---|---|
| `decisions/inbox.md` | untouched | appends R-039..R-046 | Pure append onto `main`'s text, byte-verified. Nothing on `main` edited. |
| Board card `CRIT-17` | added, shipped | untouched | **Kept, byte-identical to `main`.** |
| Board cards `AUT-8`, `AUT-9`, `AUT-10`, `AUT-11` | untouched | authored | Kept. Appended after `CRIT-15`. |
| Board card `P2-13` | untouched | `depends_on` gains `P2-19`, notes append, checkpoint bump | Kept. R-044. Notes verified a pure append. |
| Board card `AUT-3` | untouched | `status`, `notes`, `last_checkpoint` changed | **Reverted to `main`. See section 4.** |
| Launch gates `G4`, `G7`, `G9` | untouched | notes appends under R-046 | Kept. All three verified pure appends. **No gate `state` changed:** 6 of 9 pass, before and after. |
| `docs/poc/triage-latest.json` | did not exist | added | Kept, with one correction. See section 4. |
| `docs/reports/2026-08-28-triage-first-unassisted-pass.md` | did not exist | added | Kept, with a landing note appended. See section 4. |

**No board edit from #83 displaced a later board edit that shipped a card.** The
only card `main` shipped in the seven intervening merges is CRIT-17, and #83
does not touch it. The rule was checked and had nothing to bite on.

---

## 4. The three deliberate divergences from what #83 asked for

### 4.1 R-045's `AUT-3` flip was NOT applied

`AUT-3` on `main` is `status: in_flight`, `evidence: null`. #83 moved it to
`status: todo`, bumped `last_checkpoint` to `2026-08-28T10:55:00Z`, and appended
an R-045 block to `notes` reading "STATUS MOVES in_flight -> todo".

**All three were reverted. `AUT-3` is now byte-identical to the card on `main`.**

This is the dispatch's instruction, and the rationale it records is that TRIAGE's
own acceptance event is not TRIAGE's to certify: the card's acceptance IS the
existence of this PR, so a board flip authored inside this PR would be the role
attesting to itself. The card stays `in_flight` until a session that is not
TRIAGE reads the run logs and rules on them.

The whole card was reverted rather than only the `status` field, because keeping
the `notes` block while holding `status` at `in_flight` would have left the board
carrying a sentence that says a move happened when it did not. The board is the
source of truth and it does not get to contain a false claim about itself.

**R-045 itself is landed unedited** in `decisions/inbox.md`. The ruling is the
record of what TRIAGE decided. Only its effect on the card is withheld.

### 4.2 `docs/poc/triage-latest.json` had its `AUT-3` entry corrected

That file is a machine handoff read by `scripts/poc/notify.mjs` and reported to
the owner in the Telegram digest. Its `cards_resequenced` array claimed
`"AUT-3": status in_flight to todo under R-045`. Landing that unchanged would
have shipped a digest input that contradicts the board.

The entry was rewritten to state that the change was proposed under R-045 and
**not applied at landing**, and to point at this report. The file's shape is
unchanged, every key is still present, and `notify.mjs` reads it defensively.

### 4.3 A landing note was appended to the TRIAGE report

Sections 6 and 11 of `2026-08-28-triage-first-unassisted-pass.md` describe
`AUT-3` as having moved to `todo` and name it as the next eligible card. That is
now false.

TRIAGE's text was **not edited**. A clearly attributed
`## EXECUTOR LANDING NOTE` block was appended at the end saying which board
effect was withheld and where to read about it. CLAUDE.md section 9b requires a
report to be committed verbatim; an appended, attributed note is not a rewrite of
the report, and the alternative was landing a document that misdescribes the
board it is filed against.

---

## 5. Rulings renumbered: none

The binding rule was that any of R-039..R-046 colliding with a ruling landed by
#84, #87, #88 or #90 gets the **new** entry renumbered, never the existing one.

**No collision existed and nothing was renumbered.** `decisions/inbox.md` on
`main` at `7a3fffb` ends at **R-038**. The seven merges between the merge base
and `main` (#82, #84, #85, #87, #88, #89, #90) landed code, harness files,
reports and POC state, and **none of them touched `decisions/inbox.md`.** The
file merged as a pure append, verified byte-for-byte: `main`'s inbox is an exact
prefix of the landed one, and the 21,909 appended bytes contain exactly the eight
headings R-039 through R-046.

R-039..R-046 are landed with the ids TRIAGE gave them.

---

## 6. Why this landed as a forward commit and not as a force push

The dispatch said rebase, push, merge. **CLAUDE.md section 3 forbids force
pushes** to any branch, `--force-with-lease` included, and says a branch whose
history needs rewriting gets a new branch. A rebase of `triage/20260827-220052`
cannot reach `origin` without one, because `origin`'s head `555b725` would not be
an ancestor of the rebased head.

The rebase was performed and its conflict resolved, but the result was landed as
**one ordinary commit on top of `555b725`**, pushed fast-forward. The tree is
identical to the rebase result and was verified as such. The alternative,
abandoning the branch for a new one, was rejected because **PR #83 is itself the
evidence artefact**: R-045, `AUT-3`'s pending evidence and the TRIAGE report all
name "PR #83" as the output that proves the unassisted run happened. Landing the
content through a different PR number would have broken the only reference that
proof has.

The cost is that `555b725`, with its unparseable board, stays in the branch
history. Nothing reads a merged branch's intermediate trees, and `main` never
sees it.

---

## 7. Verification

- `node docs/board/validate-board.mjs docs/board/rc-board-phase2.json` exits 0,
  0 violations. Run before the commit, per CLAUDE.md section 2.
- `node docs/board/validate-board.mjs docs/board/rc-board.json` exits 0, the
  phase 1 board untouched.
- Both changed JSON files parse.
- No conflict markers, and no stripped-marker residue, in any of the four files.
- Board card count 37: `main`'s 33 plus `AUT-8`, `AUT-9`, `AUT-10`, `AUT-11`.
- `AUT-3` compares equal to `main`'s `AUT-3` as parsed objects.
- `CRIT-17` compares equal to `main`'s `CRIT-17` as parsed objects.
- Launch gate states unchanged: G1, G2, G3, G5, G6, G8 pass; G4, G7, G9 fail.
- No em dash or en dash in any added line.
- No secret value in the diff.

The `quality` check result on the pushed head sha is recorded in the PR before
the merge, per CLAUDE.md section 3.

---

## 8. What a reader should carry forward

**`AUT-3` is still `in_flight` and still unshipped.** The acceptance event it
was waiting for did occur, and the artefacts that prove it are now on `main`:
this PR, `docs/reports/2026-08-28-triage-first-unassisted-pass.md`,
`docs/poc/triage-latest.json`, and the run logs at
`/Users/ivan/rc-poc-logs/20260827-220052.log` and `20260827-220052.triage.log`.
Whether that is enough to ship the card is the open question, and it belongs to a
session that is not TRIAGE.

**The board damage came from a merge nobody validated.** `555b725` committed a
board that did not parse, and the strip-the-markers edit that produced it hid
itself from the obvious `grep`. The validator gate in CLAUDE.md section 2 exists
for exactly this and is cheap; it was skipped.

**Four escalations for Ivan are now on `main`**, carried in
`docs/poc/triage-latest.json`: the leftover test data in the client's live
system, the migration ledger three versions behind the schema, whether to install
Docker so unattended runs can finish features, and putting a date on Andre for
the one real document that three launch conditions are frozen behind.
