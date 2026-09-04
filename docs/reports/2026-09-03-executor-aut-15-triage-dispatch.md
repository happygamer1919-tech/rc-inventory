# EXECUTOR, 2026-09-03. AUT-15 shipped, and a finished card the board reported as never started

**Role:** EXECUTOR. **Date:** 2026-09-03 UTC.
**Dispatch:** unattended scheduled run `20260903-220002`, CLAUDE.md section 13.
**Cap:** 45 minutes of wall clock, at most 2 cards.
**Board:** `docs/board/rc-board-phase2.json`, which is `POC_BOARD` in `scripts/poc/run.sh`.
**In force and applied:** R-059 (self-merge on green `quality`), R-067 (the source of AUT-15), R-050 and R-057 (both left untouched by the change).
**PR:** `#183`.

---

## 1. Boot

| status | count |
|---|---|
| shipped | 43 |
| todo | 16 |
| in_flight | 1 |
| blocked | 2 |
| halted | 0 |

**Launch gate 6 of 9.** G4, G7 and G9 fail.

**Next eligible card: `AUT-15`.** The full eligible set was fifteen cards:
`AUT-15, AUT-16, AUT-17, AUT-18, AUT-8, AUT-9, BOARD-01, BOARD-02, CLAIM-01,
DIG-01, GATE-03, LEARN-01, P2-20, RST-02, RST-03`.

**No card in that set was claimed by another actor.** The one live claim in
`docs/poc/state.json` was `EXT-09` by `executor` at `2026-09-03T19:55:32Z`, inside
its six hour window. `EXT-09` is already shipped on the phase 3 board, so it
blocked nothing here and nothing was skipped for it.

## 2. AUT-15, and the thing that was already done

The card corrects one paragraph of `docs/DOCTRINE-TRIAGE.md`. The old text said:

> If it needs to know something that is not in that report or in this file,
> **that is a defect in this file**, and saying so is a legitimate TRIAGE output.

Sections 2 through 5 of the same document then require, by their own words, the
next free ruling id from `decisions/inbox.md`, both board files, committed
artefacts by name, and the board again. A session obeying the clause literally
performs none of its four jobs and reports a clean run.

**The work was already on `origin` and nothing on `main` knew.** Branch
`card/aut-15` existed at `f5c5066`, carrying the corrected paragraph, the board
flip to `in_flight`, and a commit message quoting its own failing acceptance run.
**No pull request had ever been opened for it.** `gh pr list --head card/aut-15`
returned `[]`. The board on `main` said `todo`, which is why `eligible.mjs` handed
this run the card as unstarted.

The harness had in fact noticed. Run `20260903-070005` wrote the escalation
`AUT-15:branch:in_flight` into `docs/poc/state.json`. **That was not enough**, and
that is the part worth keeping: the two things a later run actually reads to
decide what to work, the board's `status` field and `gh pr list`, both still
asserted the opposite. A correct record in a third place did not stop the wrong
record in the first two from being acted on.

**Nothing was redone.** This run read the branch, confirmed its acceptance, and
finished from there. It **merged `origin/main` into `card/aut-15`** rather than
rebasing: CLAUDE.md section 3 forbids rewriting a card branch's history and names
`--force-with-lease` by name, so the branch got a merge commit and kept its
history. The three-dot diff against `main` is the two files the card touches.

Appended to `docs/LEARNINGS.md` as **"A card branch pushed with no pull request is
work that the board reports as never started"**, with the durable rule: a
leftover-work sweep must look at BRANCHES and not only at open pull requests, and
the run that leaves work on a branch must open the pull request before it ends.

## 3. The change

The paragraph now draws the distinction the card's `defaults` asked for: **the
report is the only DISPATCH, and it is not the only file TRIAGE may read.** Ground
truth is what section 6 of the same document already calls **committed repository
files only**.

Two things were kept, deliberately:

- **R-050 is not weakened by one word.** The new paragraph names *four* things
  TRIAGE receives none of, where the old one named three: no dispatch text, no
  summary, **no chat message** and **no verbal ratification**. A human handing
  TRIAGE context is still the failure the clause exists to stop.
- **The defect sentence survives**, rescoped from READING a committed file to the
  rubric being silent: "If this file does not say how to decide something, that is
  a defect in this file, and saying so is a legitimate TRIAGE output." R-067 was
  written under that sentence and it still authorises the next one.

Untouched: the four tests, the escalation list, R-057, R-050.

**Written by EXECUTOR, not by TRIAGE.** The card's `defaults` reserve this from
TRIAGE because a role that edits the document constraining it has removed the
constraint whatever the edit says. EXECUTOR is not TRIAGE, so that constraint
holds. The card's `owner_terminal` is `author`; section 2's eligibility rule does
not filter on `owner_terminal`, and a scheduled run boots as EXECUTOR under
section 13.

## 4. Acceptance, run

```
node -e "const s=require('fs').readFileSync('docs/DOCTRINE-TRIAGE.md','utf8').replace(/\s+/g,' '); const head=s.split('### What TRIAGE may do')[0]; const bad=head.includes('is not in that report or in this file'); const good=head.includes('committed repository files'); process.exit(bad || !good ? 1 : 0)"
```

**Proved to exit 1 on the pre-change file first, for the right reason on each
half**, as the card requires. Both halves of that failing run:

```
--- FULL ACCEPTANCE, CURRENT FILE ---
exit=1
--- HALF 1: clause still present (bad) ---
bad (clause present) = true
--- HALF 2: ground truth phrase in head ---
good (phrase present in head) = false
```

After the change: `acceptance exit=0`.

```
node docs/board/validate-board.mjs docs/board/rc-board-phase2.json
PASS  docs/board/rc-board-phase2.json  (0 violations)
```

**The whitespace normalisation is load-bearing and was confirmed rather than
assumed.** `grep -n "committed repository files" docs/DOCTRINE-TRIAGE.md` returns
nothing on the unchanged file, because section 6 wraps the phrase across two lines
as `committed repository` / `files only`. That is why the test normalises
whitespace, and it is also why the test is scoped above `### What TRIAGE may do`:
unscoped, half (2) would have passed vacuously against section 6's existing
wording from the first day the card was authored.

**Migrations:** none. This PR adds no file under `supabase/migrations/`.

## 5. AUT-16 was not started, and that is a decision, not an omission

AUT-16 is the next lowest-id eligible card. It is not blocked and it was not
claimed. **This run did not start it, and did not substitute an easier card for
it either.**

It does not fit a 45 minute cap. Its acceptance is a new `quality` check with
three halves, each proved to fail first against the current files, and it replaces
the single hardcoded board path in six places:

- `scripts/poc/run.sh:23`
- `scripts/poc/inbox.mjs:39` for the read, **and lines 418 to 457 for the
  write-back**, which must target whichever board holds the card rather than a
  fixed file
- `scripts/poc/notify.mjs:27`
- `scripts/poc/digest.sh:147`
- `scripts/poc/eligible.mjs`
- `scripts/poc/claim.sh`

Starting it in the remaining thirty minutes would have produced a stranded
`in_flight` card on a half-finished branch, which is precisely the failure section
2 of this report documents and this run added to `docs/LEARNINGS.md`. An
`in_flight` card is not eligible, so it would also have parked itself against the
next run.

**Escalated** to `docs/poc/state.json` naming the card, the reason and the
recommendation: give AUT-16 a dedicated run or a foreground session as its first
card, and do not let a capped run pick it up. Nothing on the board is blocked
behind it, but until it lands the daily digest and the Telegram answer channel
stay blind to every phase 3 card id, and P3-27 remains an unanswerable question
from the owner's phone.

**CLAUDE.md section 2 forbids skipping an eligible card because a later one looks
easier.** This is not that: the reason is the harness cap, which section 13 names
as one of the four legitimate reasons a run ships less than it found, and the run
is saying so rather than being quiet about it.

## 6. Reported, not blocked, per section 4b

**`AUT-3` has been `in_flight` on the board since 2026-08-27 and its pull request
`#62` merged on `2026-08-27T16:55:21Z`.** The card is finished and the board says
it is being worked. It is not eligible in that state, so it is invisible to every
selector, and it has sat there for a week.

This is the mirror of the AUT-15 defect: one card was done and read as `todo`, the
other is done and reads as `in_flight`. Both are the same class, a board field
that outlived the work it described.

**No board field was touched for it.** AUT-3 is not this run's card and flipping
another card's status without its acceptance is the one failure CLAUDE.md section
6 says has no recovery path. It is reported here so a role with the authority to
act on it can, which is what section 4b asks for.

**Every remote `card/*` branch now has a pull request.** That was checked
explicitly after `#183` was opened, because the AUT-15 finding made it a live
question rather than an assumption. Twenty-nine branches, twenty-nine pull
requests, none missing.

## 7. Cards touched

| card | before | after | what happened |
|---|---|---|---|
| `AUT-15` | `todo` on `main`, `in_flight` on an unmerged branch | `shipped` | acceptance proved failing first then passing, PR `#183` |
| `AUT-16` | `todo` | `todo` | not started, escalated with the reason. Untouched on the board. |

## 8. What the next run should pick up first

1. **`AUT-16`, in a run that can finish it.** It is the lowest-id eligible card
   and it is the one that makes the digest and the Telegram answer channel see the
   phase 3 board at all. A 45 minute capped run should not take it.
2. **`AUT-3`'s stale `in_flight`**, by whoever may set it. `#62` merged a week ago.
3. Then the queue as it stands: `AUT-17`, `AUT-18`, `AUT-8`, `AUT-9`, `BOARD-01`,
   `BOARD-02`, `CLAIM-01`, `DIG-01`, `GATE-03`, `LEARN-01`, `P2-20`, `RST-02`,
   `RST-03`.

**Defects hit while working AUT-15:** one, and it is in `docs/LEARNINGS.md`. The
doctrine change itself hit none: the acceptance failed first for the right reason
on each half, then passed, on the first attempt.

**No secret was read, printed, logged or committed by this run.**
