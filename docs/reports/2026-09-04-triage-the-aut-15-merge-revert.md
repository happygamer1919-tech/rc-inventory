# TRIAGE, run 20260903-220002. The merge that deleted the fix, four rulings, two cards, and a gate audit that flips nothing

**Role:** TRIAGE. **Date:** 2026-09-04 UTC. **Run id:** `20260903-220002`.
**Branch:** `triage/20260903-220002`.
**Input report, the only dispatch:**
`docs/reports/2026-09-03-executor-sample-ttl-and-document-source.md`.
**Rubric applied:** `docs/DOCTRINE-TRIAGE.md`, in force with R-050, R-057.

---

## 0. Boot

    board            docs/board/rc-board-phase2.json, as_of 2026-09-03T22:18:00Z
    cards            62 total: shipped 44, todo 15, in_flight 1, blocked 2, halted 0
    launch gate      6 / 9
    next eligible    AUT-16

---

## 1. The finding of the run, and it is not in the report

**The report's own most important finding was fixed on `main` and then un-fixed
by the pull request that carries the report.** Nothing in `quality` noticed.

The report says, in its section 2:

> **The pending migration list said pending and production said applied.** [...]
> **This is the finding that matters most and it is not fixed here.**

Read against the tree, that sentence is no longer a description of `main`, and it
has not been since `8b09bde`. Between the report being written and this run, the
work it asked for was done: the four applies were reconstructed into
`docs/migrations/APPLY-LOG.md`, explicitly labelled RECONSTRUCTED AND NOT
JOURNALLED rather than dressed up as a journal, the mechanism was established by
**prediction with a control**, twice, and card `MIG-01` was authored to carry the
decision the mechanism forces.

**Then commit `29afb21` deleted all of it.** That commit is
`AUT-15: merge origin/main into the card branch, no rewrite, no force push`. It
merged `origin/main` into `card/aut-15` and resolved every conflicted file by
keeping the branch side. `main` was `b25dc75` at that moment. Pull request `#183`
merged the result as `e173fad`, which is `origin/main` today.

**The inventory. Every line verified with `git diff b25dc75 origin/main` on this
branch, nothing inferred:**

    docs/migrations/APPLY-LOG.md      -317  every APPLIED entry for 0028 to 0033,
                                            the reconstruction header, the
                                            observed-mechanism section. The six
                                            stale `pending` lines are BACK, so the
                                            file states again the exact falsehood
                                            the report flagged.
    docs/board/rc-board-phase2.json   -2 cards  MIG-01 and RULE-04. 64 -> 62.
    decisions/inbox.md                -81   ruling R-098.
    decisions/NEXT-RULING-ID          R-099 rolled BACKWARDS to R-098.
    docs/LEARNINGS.md                 -3 entries, including "A migration reaches
                                            production on merge, with no applier,
                                            no journal and no human".
    docs/contracts/extraction-v2.md   -54   section 5.2a, R-098's contract half.
    scripts/poc/test-ask-digest.sh    -36   the fixture neutralisation.

**Why no check caught it.** `quality` ran and was green, and every guard in it is
built for a different failure of the same files:

| guard | why it missed |
|---|---|
| `check:conflict-residue` | looks for the marker tails a bad resolution leaves. This one left none: it deleted whole hunks cleanly. |
| `check:unique-ids` | compares headings that exist on both sides. **It has no concept of an id that used to exist.** It also accepted a counter that went backwards, because it only requires the counter to be AHEAD of the highest WRITTEN, and deleting `R-098` lowered that too. |
| `tests/e2e/headers.spec.ts` | requires every migration file in **exactly one** of applied or pending. Moving all six back to pending keeps them in exactly one. The invariant held while its meaning inverted. |
| `validate-board.mjs` | validates the cards that are present. A deleted card is not an invalid card. |

**The generalisation, which is the same one `MIG-01` records about itself:** every
guard here checks that what is PRESENT is correct. None checks that what WAS
present is still there. **Absence is the one state a validator cannot be handed.**

---

## 2. Rulings written

| id | what it decides |
|---|---|
| **R-098** | **RESTORED VERBATIM, NOT WRITTEN.** The deleted ruling on new failure codes, copied word for word from `b25dc75`. Not renumbered, not summarised, not edited. |
| **R-099** | The merge reverted committed content on `main`. Full inventory, the test that produced the verdict, why every guard missed it. Authors `RESTORE-01` and `GUARD-02`. |
| **R-100** | The counter went backwards. `R-098` is restored here and is **not reallocated**; this run takes `R-099` onwards and the counter goes to `R-102`. |
| **R-101** | The gate audit and the section 3 board sweep. Nothing flips. `P2-13` gains a capability edge on `MIG-01`. |

**Section 1 verdicts.** The input report flags no deviations for ratification and
its section 5 says so in terms: "Nothing. No `ask.sh` was raised and no step
stopped." **There was nothing to ratify or overturn**, and this is recorded rather
than left silent. The four tests were instead applied to the revert, which is what
the run actually found: test 1 does not fire, nothing unrecoverable was touched
because every deleted line is still in git; test 2 clears it, the evidence is two
shas and a `git diff`; test 4 answers itself.

**R-100 is the urgent half and it is done in this pull request rather than
carded.** The counter currently hands `R-098` to the next terminal that allocates,
which on this schedule is a run a few hours away. That terminal writes a second,
different `R-098`, and `check:unique-ids` passes it, because on `main` there is no
`R-098` to collide with. Two merged decisions would then wear one number, which is
exactly what CLAUDE.md 8b exists to make impossible.

---

## 3. Cards authored

### `RESTORE-01`, priority high, `todo`, no dependencies

Restore everything `29afb21` deleted, verbatim from `b25dc75`, **in one commit.**

Acceptance is four diffs and five commands: an exact `diff` against `b25dc75` for
`APPLY-LOG.md`, `extraction-v2.md` and `test-ask-digest.sh`; a missing-lines-only
check for `LEARNINGS.md`, which has legitimately moved on; the two cards identical
field for field; `P2-13.depends_on` exactly `["P2-08b", "MIG-01"]`; then
`validate-board`, `check:unique-ids`, `test-ask-digest.sh`, `headers.spec.ts` and
green `quality`.

**WHY TRIAGE DID NOT SIMPLY RESTORE THE TWO CARDS ITSELF, HAVING THE RIGHT TO EDIT
THE BOARD.** Restoring `MIG-01` without restoring the `scripts/poc/test-ask-digest.sh`
hunk turns three assertions in that script **red**. The fixture copies the LIVE
phase 2 board, and the digest counts a card that is `blocked` on `ivan` as an
outstanding question, correctly. That script runs in `quality` on every pull
request. So the board half and the test half land together or `main` goes red, and
**TRIAGE may not write a test file.** The card is the only shape this restoration
can legally take, and that is stated in its `defaults` so the next terminal does
not rediscover it at a red check.

### `GUARD-02`, priority high, `todo`, depends on `RESTORE-01`

A check, not path-filtered, that refuses a commit deleting a ruling id, a card id,
or an applied-migration heading present on `origin/main`, and refuses a counter
lower than `main`'s. Four failing fixtures plus one control that must pass.

**The dependency edge is deliberate.** Run today, this check goes red against
`origin/main`, because the deleted ids are absent right now. Building it first
means either a red `main` or an allow-list entry excusing the exact loss the check
exists to catch.

---

## 4. Board sweep, DOCTRINE-TRIAGE section 3, all four checks, all three boards, 140 cards

- **Dangling: none.** Every id in every `depends_on` resolves.
- **Satisfied but blocking: one, and it is correct.** `P2-08b`'s only dependency
  `P2-08a` is shipped and it stays `blocked_on: andre`. He genuinely owes the live
  scenario run. R-053 degated it and R-080 recorded that; neither made him owe
  less. **Not cleared.**
- **An edge on a split card: none outstanding.** The P2-08 split holds.
- **A capability edge missing: one, and it is the expensive kind.**

**`P2-13.depends_on` must become `["P2-08b", "MIG-01"]`.** Derived by the section 3
check 3 test rather than by feel: ask what the card takes away, list every card
that needs it. P2-13 revokes every terminal grant that writes production, and its
acceptance carries a box, added by R-072, that must be ticked **before** any
credential is rotated, confirming every migration file is recorded as applied in
`APPLY-LOG.md`. `MIG-01` establishes that a path exists which applies migrations to
production and journals nothing. **While that path is undescribed the box cannot be
honestly ticked, and P2-13 would revoke the controlled path while leaving the
uncontrolled one running.** That is check 3's failure mode with the sign flipped.

**The edge is ruled in R-101 and landed by `RESTORE-01`, not here.** `MIG-01` is not
on the board today, so writing the edge now produces a dangling `depends_on` and a
red validator, and a commit made while the validator is red is reverted rather than
patched forward.

---

## 5. Gate audit, DOCTRINE-TRIAGE section 4

**Phase 2 stays 6 of 9. Phase 3 stays 0 of 9. Nothing flips.** The audit is written
into each gate's `notes` whether or not it moved.

| gate | verdict | deciding clause, measured today |
|---|---|---|
| **G4** | `fail`, **backlog** | `tests/e2e/extraction.spec.ts` now carries **fourteen** cases, four more than at the R-080 audit, and the four new ones are EXT-09's page-count trio and EXT-15's document-source trio. **Neither missing case is among them.** `grep -n redirect lib/data/extraction-fire.ts app/api/extraction/callback/route.ts` returns nothing; nothing bounds a body size. Redirect ABSENT, oversize ABSENT. `P2-20` is still the card, still `todo`, still eligible. |
| **G7** | `fail`, `blocked_on: ivan`, **not backlog** | The same three items since 2026-08-27: `RESEND_API_KEY` in production, `RESEND_FROM` set, a recipient not on `rc-inventory.local`. Two are panel actions. **No database read was performed and none is claimed.** |
| **G9** | `fail`, **not backlog** | `P2-14` is `blocked_on: client`; no report of Mihai completing a cycle exists. Upstream is unchanged: G4 is still two cases short. |

**The phase 3 gate is not re-audited here and the reason is stated rather than
omitted.** All nine are `fail`, every one says "on production", card `GATE-02` on
the phase 3 board exists to re-run that audit and is `todo`, and nothing in the
input report touches a phase 3 screen. A second audit written by a role that ran no
check would be a copy of R-065's with a newer date.

---

## 6. Escalations, each with its recommended default

All three are in `docs/poc/triage-latest.json` in the plain register, so the digest
carries them. **`ask.sh` was deliberately not called:** this is an unattended run
under CLAUDE.md section 13, where section 14 says skip-not-halt governs and a six
hour deadline inside a 30 minute cap loses the run.

1. **Merge is apply, and it has never reached the owner.** Item 4 and item 7 of the
   closed list. `MIG-01` carried it and `MIG-01` was deleted from the board, and
   **the board is what the digest reads**, so this decision has been invisible since
   `e173fad`. Recommendation carried forward from the card, unchanged in substance:
   keep the integration and rewrite section 8 to describe it, **after** a pre-merge
   check refuses a row-destroying statement.
2. **The stale register reached Andre.** Item 6.
   `/Users/ivan/rc-samples/ANDRE-STATUS.md` tells the extraction vendor that four
   database changes are pending which production applied days ago. Recommendation:
   correct the paragraph before the next message, with the 2026-09-04 19:58 UTC
   sample-link expiry noted in the same breath. **TRIAGE never writes to a third
   party**, which is why this is an escalation and not an edit.
3. **G7's two panel actions, raised again.** Item 7. Escalated on 2026-08-31 by run
   `20260831-040003` and never answered. Repeated with the same honest caveat: they
   do not close the gate on their own.

---

## 7. What TRIAGE did NOT do

- **Shipped nothing, merged no card pull request, applied no migration, wrote no
  application code and no test.**
- **Edited no existing ruling.** `R-098` is restored verbatim, which is the opposite
  of an edit, and `R-099` and `R-101` supersede nothing.
- **Flipped no gate.** Six of nine was six of nine before this run and after it.
- **Did not clear `P2-08b`'s block**, though the mechanical check flagged it. The
  person still owes the thing.
- **Did not re-author `MIG-01` or `RULE-04` from memory.** Both exist in full at
  `b25dc75`, and re-authoring would have produced a second card for one problem and
  silently dropped whatever the original said that the re-author did not think of.

## 8. One correction to the input report, for the record

Its section 6 item 3 says "**`#177` (`EXT-15`) is still open**, so `document_source`
is contract and code on a branch, not behaviour in production." **It merged**, as
`c3f5bb3`, with its migration renumbered to `0033`, and `EXT-15` is `shipped` on the
phase 3 board. The report was accurate when written; this is what changed under it,
and it matters because `0033` is one of the six files the revert put back on the
pending list.

## 9. Defects for `docs/LEARNINGS.md`

None appended by this run. The one defect it found is `R-099` and `GUARD-02`, and
its `LEARNINGS.md` entry is one of the three `29afb21` deleted. **Writing a fourth
entry now, while the three are missing, would land a near-duplicate the moment
`RESTORE-01` puts the originals back.** The generalisation is recorded in
`GUARD-02`'s `notes` instead, and the restore is what makes the file whole.

## 10. State for the next session

1. **`RESTORE-01` is the highest-value card on either board** and has no
   dependencies. Until it lands, the repository tells its reader that six
   migrations are pending which production applied, and the largest open decision
   in it is invisible.
2. **`GUARD-02` is blocked behind it by design**, not by a person.
3. `decisions/inbox.md` and `decisions/NEXT-RULING-ID` are **already repaired** by
   this pull request and are out of `RESTORE-01`'s scope. Do not touch them there.
4. **`P2-20` is `todo` and eligible** and is the only card standing between G4 and
   `pass`.
