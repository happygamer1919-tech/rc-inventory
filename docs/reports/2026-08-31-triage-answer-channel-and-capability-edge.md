# TRIAGE: the P3-13 report. Two ratified deviations, a broken answer channel, and a credential flip that would strand the board it cannot see.

**Date:** 2026-08-31 (UTC), run `20260831-010005`
**Role:** TRIAGE, unattended, stateless
**Rubric:** `docs/DOCTRINE-TRIAGE.md`
**Input report:** `docs/reports/2026-08-31-executor-p3-13-deviz-schema.md`
**Branch:** `triage/20260831-010005`, cut from `origin/main` at `c124529`
**Migration files added:** none. TRIAGE writes no code, no test and no migration.

---

## 0. Boot

| board | shipped | in_flight | todo | blocked | halted | launch gate |
|---|---|---|---|---|---|---|
| `rc-board-phase2.json` at boot | 36 | 1 | 10 | 1 | 0 | 6/9 |
| `rc-board-phase2.json` after this run | 36 | 1 | 11 | 2 | 0 | 6/9 |
| `rc-board-phase3.json`, untouched | 12 | 0 | 16 | 3 | 0 | 0/9 |

Next eligible card, phase 2: **AUT-10**. Next eligible card, phase 3: **P3-13b**,
which is what the input report's handoff names.

**The input report exists in two lengths and this run read both.** On `main` it is
241 lines and ends at section 7. On `card/p3-13-learnings`, open as PR #130, it is
288 lines and carries a section 8 addendum recording two `quality` failures and
their fixes. R-073 is about that.

---

## 1. Rulings written: R-068 to R-074

**The ids start at R-068 and the shift is stated rather than left to be
reconstructed**, per DOCTRINE-TRIAGE section 2 requirement 1. `main` ends at
R-062. PR #126 holds **R-063 to R-067**, committed on
`triage/20260830-220004` across two commits, and the input report undercounted
that set as R-063 to R-066 because it read the pull request title rather than the
branch. Renumbering the new entries around the old ones is the rule; touching the
old ones is never.

| id | what it settles |
|---|---|
| **R-068** | The two P3-13 build deviations, ratified individually, each with the test that cleared it. |
| **R-069** | Following R-064 before it merged is ratified, and a ruling committed on an OPEN pull request is in force under two conditions and no others. |
| **R-070** | PR #126 is now CONFLICTING, so it belongs to EXECUTOR under R-052 and not to TRIAGE. RST-03 authored. |
| **R-071** | The harness resolves a card id against one board while every unattended run works the other. The harness half of R-061 is superseded. AUT-16 authored. |
| **R-072** | The section 3 board sweep. P2-13's capability edge cannot be authored across boards and becomes an acceptance clause. P2-14's status corrected. |
| **R-073** | A report committed before its acceptance ran is corrected by a dated addendum, never by a rewrite. |
| **R-074** | The gate audit. Phase 2 stays 6 of 9, phase 3 stays 0 of 9, nothing flips, and phase 3 is deliberately not re-audited. |

---

## 2. The deviations, ratified one at a time

The report flagged two, under "Two places where the build is wider than the card
text". Both are RATIFIED, both on **test 4**, and neither on a shrug.

**One, the `deviz_lines` trigger fires on INSERT as well as UPDATE.** Test 1 does
not fire: `0025_deviz.sql` is a file in a repository and has been applied to no
database. Test 2 is satisfied by
`scripts/poc-free/local-db/assertions/0025_deviz.sql`, whose clause "refuses a
line ADDED to it" ran green in `quality` on head sha `f44fd5c`. Test 3 says
applying, not widening: the card states the no-edit rule and an INSERT into a sent
deviz is inside it. Test 4 decides: an UPDATE-only trigger ships a no-edit rule
that any caller walks around by adding a line instead of editing one, on a
document the client is already holding a copy of.

**Two, `approved_at` is held by the database.** Same first three tests, same
assertion file, and test 4 again: two screens write the status, and the
alternative is a rule that holds only on whichever of them remembered it.

**The uncovered DELETE is not a third deviation and R-068 says so on the
record**, so nobody audits it twice. Neither table carries a delete policy, and
the structural half of the assertion file proves that absence, so the premise the
argument rests on is asserted rather than claimed.

---

## 3. The finding the report made and did not price: the owner cannot answer

The report found that `scripts/poc/run.sh` line 23 hardcodes the phase 2 board
while the work is on the phase 3 board, and priced it as a claim lease protecting
the wrong card. That is true and it is the smallest of three.

**There are three hardcoded paths, not one.**

- **`scripts/poc/run.sh:23`.** The report's finding. `docs/poc/state.json` carries
  a claim on `AUT-10` by `harness` at `2026-08-31T02:48:59Z`, written at the end
  of a run that spent its time on P3-11.
- **`scripts/poc/inbox.mjs:38`, and this is the one that costs.** The Telegram
  reader builds `knownCardIds` from that one board and refuses everything else
  with `"no card " + cardId + " on the board"`. **`R P3-27 default` is refused.**
  So is every other phase 3 id. `CLAUDE.md` section 13 names Telegram as the
  owner's answer channel and names the two forms it accepts; both are unusable for
  the entire board where the work is. **P3-27 is the oldest unanswered question in
  this repository, it has been escalated twice, and the owner could not have
  answered it from his phone if he had tried.**
- **`scripts/poc/notify.mjs:27`.** `plain-digest.mjs` reads
  `launch_gate.readiness_passed` and counts shipped cards off that one board. The
  digest reports 36 done and 6 of 9 and cannot see the twelve phase 3 cards
  shipped since 2026-08-30. It does not under-report phase 3. It cannot see it.

**R-071 supersedes the harness half of R-061 and nothing else of it.** R-061 said
"the phase 2 board is still the queue for every unattended run", and kept a "what
does not change" paragraph whose first item was the claim lease. The premise did
not hold: runs `20260830-220004` and `20260831-010005` shipped P3-11 and P3-13,
both filed as unattended scheduled runs in their own committed reports. A rule
whose stated protection is the first thing to fail under it has been overtaken.

**The replacement is a board LIST, not a repoint**, which is written into AUT-16's
`defaults` with the reason: pointing `POC_BOARD` at the phase 3 board moves the
blindness rather than removing it.

**Measured against the closed ten-item escalation list, item by item, this is
none of them.** It is which file a script reads. Under R-050 that is TRIAGE's, and
it is recorded with an id rather than left in a report nobody has to obey.

---

## 4. The sweep, and the edge the validator will not let anybody author

DOCTRINE-TRIAGE section 3 requires all four checks over the whole board, every
time. Three found nothing worth changing.

- **Dangling: none.** Every `depends_on` id on both boards resolves on its own
  board. No cross-board edge exists anywhere today, which turns out to matter.
- **Satisfied but blocking: four fire, three are correct.** P2-08b genuinely owes
  Andre now. P3-27 genuinely owes Ivan now. P3-04b and P3-05b fire and **R-065
  already resequenced both**, in PR #126, so repeating it here would collide with
  that work and most likely delete it.
- **Split-card edges: all re-derived.** P3-13b on `[P3-13, P3-09]`, P3-13c on
  `[P3-13b, P3-04]`, P3-12 on `[P3-11, P3-13b]`, P3-18 on `[P3-13c]`. Nothing
  depends on the schema half where it needs the editor half.
- **P2-14 was a fourth kind of defect:** `status: todo` with `blocked_on: client`,
  which `CLAUDE.md` section 4 does not permit, against a card whose own notes said
  BLOCKED ON CLIENT AT AUTHORING TIME. Corrected to `blocked`. It now shows in the
  BLOCKED ON PEOPLE lane under the client column.

**Check 3, the capability edge, fired on P2-13 and it is the expensive one.**

Ask what P2-13 takes away: the ability of any terminal to open a database
connection or apply a migration, the single permitted secrets read, and, per
section 8.7 and R-059, the self-merge grant on every path. Now list what needs
those. **P3-27 is nothing but the apply of thirteen pending migration files.** The
sixteen unshipped phase 3 cards are being built under the self-merge grant, and
section 8.7 says what its removal does in one line: "Deleting section 3.1 returns
every PR to Ivan."

**P2-13's `depends_on` is `["P2-08b"]` and that is the whole set.** R-044 applied
this identical test on 2026-08-28 and added P2-19. R-054 removed P2-19 because it
was retired, correctly, and the reasoning did not survive the removal. Then the
board split in two and the cards that need the capability landed on the far side.

**The edge cannot be authored, and that is a constraint rather than a
preference.** `docs/board/validate-board.mjs` resolves `depends_on` against the
cards of the board being validated and fails with "is not a card id on this
board". Adding `P3-27` to P2-13 makes the validator red, and `CLAUDE.md` section 2
makes a commit on a red validator a commit that gets reverted. **The doctrine's
check 3 assumes one board and there are two.**

**So it went where the board can carry it: P2-13's own acceptance.** That
acceptance already counts unticked boxes in
`docs/RUNBOOK-CREDENTIAL-ROTATION.md`, so the precondition is another box rather
than a new mechanism: before any credential is rotated, every migration file under
`supabase/migrations/` is recorded as applied in `docs/migrations/APPLY-LOG.md`.
`defaults` was NOT edited, because DOCTRINE-TRIAGE's list of fields TRIAGE may
edit does not include it.

**This is ordering, not a grant**, in R-037's own words for the same distinction:
the grant still dies at P2-13, and the ruling fixes when P2-13 runs, not whether
it does.

---

## 5. PR #126 changed hands while the report was being written

The report asked TRIAGE to update `triage/20260830-220004`. At the time it was
`MERGEABLE` and `BEHIND`, which is a branch update. **Read today it is
`CONFLICTING` and `DIRTY`**, conflicting on `docs/board/rc-board-phase3.json`,
because P3-13's own board edit landed on `main` as `c124529` in the hour between.
**R-052 assigns a conflicting pull request to EXECUTOR**, resolved locally against
the full tree with the validator run before the commit. TRIAGE writes no code and
runs no acceptance, so it is the wrong hands for a resolution that has to be
proved by running things.

**What is actually outside `main` is five rulings and three cards, not four and
two:** R-063 to R-067, cards P3-28, BOARD-02 and AUT-15, and the committed report
`docs/reports/2026-08-31-triage-board-clock-and-gate-audit.md`. The branch carries
a second commit, `361d40e`, that the pull request title does not mention.

**This run made the conflict worse and says so.** These seven rulings append to
`decisions/inbox.md` at exactly the point R-063 to R-067 append. It is
unavoidable: writing rulings into that file is the only output this role has.
**What was avoidable was avoided, and RST-03's `defaults` tell the resolver where
the overlap is not:** this run **edits no field of
`docs/board/rc-board-phase3.json`**, and does not re-audit the phase 3 gate R-065
already audited.

**RST-02 gets the class and RST-03 gets the instance.** A sweep that merges cannot
merge a pull request that conflicts, and today it passes over one in silence. That
finding went into RST-02's notes rather than into a second card, per
DOCTRINE-TRIAGE section 5.

---

## 6. Gates: 6 of 9 and 0 of 9, nothing flipped

**Phase 2, the three open conditions, each with its deciding clause, written into
each gate's `notes`.**

- **G4.** Deciding clause as re-derived by R-053. P2-08a unshipped, P2-08b blocked
  on Andre. **Needs a third party.**
- **G7.** One real email delivered on production. The same three things as the
  2026-08-27 audit: `RESEND_API_KEY` in production, `RESEND_FROM` set, and a
  recipient not on `rc-inventory.local`. **Two are panel actions, the third lands
  at P2-13.**
- **G9.** P2-14 recording it. **Needs the client to do it himself.**

**None of the three is backlog** and section 4 says to say so, because a gate
count a reader mistakes for remaining work sends the next session hunting for a
card that does not exist.

**No database read was performed for this audit and none is claimed.**

**Phase 3 is deliberately not re-audited.** R-065 audited all nine on 2026-08-31
and wrote the audit into all nine `evidence` fields, and that work is in PR #126.
A second audit into the same nine fields would conflict with it and, on
resolution, would likely delete it, which is the opposite of what section 4 is
for. Nothing since could have flipped any of them: `0025_deviz.sql` is authored,
parsed, proven against a bare `postgres:16` and merged, and has been applied to
nothing.

**One divergence from the rubric, stated so the next run reaches the same
answer.** Section 4.4 says write the audit into `evidence.ref`. On this board a
failing condition carries `evidence: null` and both prior audits live in `notes`.
This one goes to `notes` too, because three audits of one gate in two fields is a
record a stranger has to assemble. Correcting the rubric is AUT-15's business, and
AUT-15 is in PR #126.

---

## 7. Escalation: one, and it is the same one

**ESCALATION: thirteen finished migration files have never been applied to the
live Supabase project, and all nine phase 3 readiness conditions sit behind that
one action.**

**WHY IT IS ESCALATED:** item 7, panel actions, and item 8's neighbourhood. The
apply is a click in a console or a permission only the owner can lift.

**CONTEXT:** this is the second time it has been raised. The first was written by
TRIAGE run `20260830-220004` into `docs/poc/triage-latest.json`, and that file is
in PR #126, so **the digest never carried it**. It is carried forward here for
that reason.

**OPTIONS:** (a) Ivan applies each file by hand in the Supabase SQL editor and
pastes the verification grids back onto P3-27. (b) He lifts the one sentence of
the 2026-08-30 dispatch that says no terminal opens a database connection, and
EXECUTOR applies all thirteen in file order under the three-phase apply in
`CLAUDE.md` 8.5, journalling every phase into `docs/migrations/APPLY-LOG.md`.

**RECOMMENDATION: (b).** Wave 1 is complete, so the reason to wait has been met.
R-001 already authorises it and has not been revoked. **None of the thirteen
contains `DROP TABLE`, `TRUNCATE` or `DELETE`**, so section 8.6 stops none of
them. (a) closes the same gap and costs a sitting.

**ONE PRACTICAL NOTE BEFORE HE REPLIES:** `R P3-27 default` will be **refused** by
the Telegram reader as an unknown card, per section 3 of this report. Until AUT-16
ships, the answer has to arrive through a channel that reaches a terminal which
can commit it.

**IF UNANSWERED:** twelve shipped cards stay invisible on the live site, phase 3
readiness stays 0 of 9 whatever ships next, and P3-04b and P3-05b stay parked
behind it. Nothing breaks and nothing gets worse, which is exactly why it has gone
unanswered longer than anything else on either board.

---

## 8. Cards authored and cards edited

**Authored, both on the phase 2 board, both with machine-checkable acceptance and
`defaults` that answer the ambiguities they will hit.**

- **AUT-16**, under R-071. The harness resolves a card id against every open
  board. Three-part acceptance, each part proved to FAIL first against the current
  files, wired into `quality` by name. In the AUT lane per R-041.
- **RST-03**, under R-070. Land the content of PR #126. Four-part acceptance
  against `origin/main`, including `check:conflict-residue`, because this card's
  whole subject is a conflict resolution and R-052 exists because three of them
  landed carrying residue.

**Edited.**

- **P2-13**: `acceptance` gains the capability precondition, `notes` gain the
  reasoning. R-072.
- **P2-14**: `status` corrected to `blocked`. R-072.
- **RST-02**: `notes` gain the systemic half. R-070.
- **G4, G7, G9**: `notes` gain the 2026-08-31 audit. R-074.
- **`as_of`** read from the system clock, per R-064, which this run followed for
  the same reason and under the same disclosure R-069 ratifies.

**Nothing on `docs/board/rc-board-phase3.json` was touched.** That is a decision
and section 5 explains it.

---

## 9. Is the rubric enough? One gap, and it is already AUT-15's

DOCTRINE-TRIAGE invites this role to say when it needed something the input report
and the rubric did not give it. This run needed the inbox, both board files, the
validator source, three harness scripts, `docs/poc/state.json` and the GitHub
state of two pull requests. **That gap is already R-067 and card AUT-15, in
PR #126**, so it is not raised again here.

**Two smaller ones found by applying the document, recorded for whoever works
AUT-15 rather than as new cards:**

1. **Section 4.4 says `evidence.ref`; the board puts gate audits in `notes` and
   carries `evidence: null` on a failing condition.** Two prior audits already
   follow the board.
2. **Section 3 check 3 assumes one board.** Its instruction, make those cards the
   dependencies, is not executable across two boards because the validator rejects
   the edge. The rubric needs to say what to do instead, which today is what R-072
   improvised.

---

## 10. What the next run picks up first

1. **RST-03.** PR #126 has gone from BEHIND to CONFLICTING in one hour and every
   board edit widens it. The repository is currently acting on R-064, a ruling
   that is not in it.
2. **P3-13b**, the deviz line editor, still the widest unblock on the phase 3
   board: P3-13c, P3-12 and P3-18 sit behind it.
3. **AUT-16**, because until it ships the escalation in section 7 cannot be
   answered through the channel it is supposed to be answered through.

---

## 11. The checks this run is held to

TRIAGE has no card and runs nothing that ships.

| check | result |
|---|---|
| `node docs/board/validate-board.mjs` on all three boards | PASS, 0 violations, run before the commit |
| `npm run check:conflict-residue` | 3 checks passed |
| em dash or en dash in any file touched | zero, verified by codepoint |
| secret staged | none, `git diff --cached` read |
| `docs/poc/triage-latest.json` | valid JSON, every required key present, the escalation carries a recommendation |

**No card is shipped, no card pull request is merged, no migration is applied, no
application code or test is written, and no existing ruling is edited.**
