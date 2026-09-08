# TRIAGE, run 20260908-010002

**Role:** TRIAGE. **Date (UTC):** 2026-09-08. **Run id:** 20260908-010002.
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, branch `triage/20260908-010002`,
cut from `main` at `d22187a`. **Cap:** 30 minutes of wall clock.
**Input report:** `docs/reports/2026-09-08-executor-ext-11-the-red-that-was-the-test.md`.

---

## Status at boot

| Board | shipped | in_flight | blocked | halted | todo | launch gate |
|---|---|---|---|---|---|---|
| phase 2 | 65 | 1 | 3 | 0 | 16 | 6/9 |
| phase 3 | 47 | 0 | 0 | 0 | 26 | 0/9 |

**Next eligible card at boot: `GATE-01`**, first of 40 ids across both boards.
**At the end of this run it is `AUT-3`**, for the reason R-169 gives and states
in advance.

---

## 1. Deviations, ratified individually. R-163.

The report files no "deviations flagged for ratification" section, so the three
judgement calls it describes were enumerated and given a verdict each. **All three
ratify and none reached test 1 or test 3's widening branch**, so nothing from this
run is escalated and nothing is overturned.

| # | Deviation | Test that decided it | Verdict |
|---|---|---|---|
| 1 | Took `EXT-11` while it was under claim | **4.** The claim holder is `harness` and this run boots as `harness`. Section 13 bars taking a card claimed by ANOTHER actor. The alternative is a scheduled run barred from continuing its own unfinished work, on every card, for ever. | **RATIFY** |
| 2 | Worked one card, not two | **3, as an application.** "At most 2" is a ceiling. Nothing widened. | **RATIFY** |
| 3 | Merged `origin/main` into the card branch to clear `BEHIND` | **3, as an application.** Section 3 forbids force pushes, not merges. R-052 requires exactly this, locally, with the checks run first, and the report records `check:conflict-residue` run before the commit. | **RATIFY** |

**The substantive finding kept from the report:** the fifth run's red was one case
of 188 failing at its own last step, and the two cases the acceptance names had
**passed on that same head**. The feature was proven in both directions on the
head that reported failure. That fact is what `gh pr checks` cannot express, and
it is what R-170 authors a card about.

---

## 2. Findings converted. R-164 to R-170.

Nothing was left as a finding.

| Finding | Became |
|---|---|
| The phase 2 gate has three failing conditions whose `evidence` fields are EMPTY while six audits sit in `notes` | **R-164**, and the three fields are now written |
| The phase 3 gate's 0/9 rests on a blocker that P3-27 discharged | **R-165**, and all nine conditions carry the correction |
| R-101 ruled a `depends_on` edge on 2026-09-04 and the board never carried it | **R-166**, edge applied |
| RESTORE-01 asks for a restore that would undo EXT-14 and re-create a settled id collision | **R-166**, acceptance corrected |
| RST-04 asserts three ruling ids were never reused; they were, five days ago | **R-167**, acceptance changes sign |
| Six TRIAGE rulings pull requests are open and thirty-five ruling ids are off `main` | **R-168**, into RST-02's notes. **No new card**, per DOCTRINE-TRIAGE section 5 |
| AUT-3 has been `in_flight` with no branch for twelve days, unreachable by the loop | **R-169**, back to `todo` |
| Nothing prints WHICH STEP of `quality` failed | **R-170**, authors card **CI-03** |

### The finding of the run

**Six TRIAGE pull requests are open and nothing will ever come back for them.**

    #207 triage/20260904-220003  R-128 to R-134
    #210 triage/20260905-010004  R-135 to R-141
    #238 triage/20260906-220005  R-144 to R-148
    #242 triage/20260907-010004  R-149 to R-153
    #245 triage/20260907-040001  R-154 to R-157
    #248 triage/20260907-070002  R-158 to R-162

**Thirty-five ruling ids are written and not on `main`, so none of them binds
anything.** DOCTRINE-TRIAGE says a TRIAGE ratification is settled the moment it is
committed; ground truth here is committed files on `main`, and a fresh session
reads `main`. Three measured consequences:

1. `docs/poc/triage-latest.json` on `main` names run `20260904-071258`. **The
   digest has been carrying a four-day-old triage outcome to the owner on every
   fire since.**
2. `decisions/NEXT-RULING-ID` reads `R-144` while the open branches have consumed
   through `R-162`. `npm run id:free -- R-144` answers CLAIMED and names R-163,
   which is the id this run took. CLAUDE.md 8b step 2 is working, and it is
   working because RST-02 has not shipped.
3. The rate is one per run and the sweep fires four times a day, so the backlog
   grows faster than any single repair card can drain it.

**The half that was not previously written down**: RST-02 names the sweep
selector, `poc/state-` and `poc/ruling-` against TRIAGE's `triage/<run-id>`. The
second half is that **TRIAGE cannot merge its own pull request either.** Its cap
is 30 minutes and `quality` takes about 22, so a run that opens its pull request
at the end of its work is dead before the check goes green. CLAUDE.md 3.1 grants
TRIAGE the merge and the clock takes it away. **This report is being written into
the seventh such pull request and says so.**

**No seventh card was authored for it.** RST-02 is the cause card, it is `todo`
and eligible, and the census plus the cap finding went into its notes. Authoring a
card about six stranded pull requests would be the same mistake at one remove.

---

## 3. Board sweep, all four checks, whole board. R-166, R-168, R-169.

172 cards across three boards.

1. **Dangling:** none. Every id in every `depends_on` names a card that exists.
2. **Satisfied but blocking:** three, and all three are correct.
   **P2-08b** blocked on `andre`, a third party who genuinely owes a live document
   run. **P2-14** blocked on `client`, and its dependency P2-13 has not shipped.
   **MIG-01** blocked on `ivan`, owing a vendor and console decision that is items
   4 and 7 of the closed escalation list. None is cleared.
3. **A capability edge missing:** one, and it had already been ruled and never
   applied. **`P2-13.depends_on` was `["P2-08b"]` and is now
   `["P2-08b", "MIG-01"]`**, per R-101 of 2026-09-04. P2-13 revokes the migration
   grant and rewrites CLAUDE.md section 8; MIG-01 decides what section 8 has to
   describe. **Consequence stated rather than discovered:** P2-13 now has two
   blocked dependencies, and P2-14 and gate G9 sit behind it.
4. **An edge on a split card:** none new. G4's clause was re-derived against the
   P2-08 split at R-046 and that derivation still holds.

**One thing explicitly checked and found NOT to be an edge**, recorded so the next
run does not re-derive it: the report worries that `GATE-01` runs before `GATE-02`
and proves one clause of a gate whose other eight have not been re-read. **There
is no dependency in either direction.** GATE-02 re-runs all nine and would simply
read a fresher G1 if GATE-01 landed first; if it lands second, G1's evidence is
rewritten twice. Both orders are correct and **no edge was invented to force
one.**

**One status corrected:** AUT-3, `in_flight` to `todo`. It has had no branch and
no pull request since 2026-08-27, and only `todo` is eligible, so at `in_flight` a
card is unreachable by the loop for ever. **This is not a claim the work has not
started** and the notes say so. `AUT` sorts before `GATE`, so **AUT-3 is now the
next card the loop takes, ahead of GATE-01.** That is deliberate, it is stated in
advance, and it is minutes of paperwork rather than a run.

---

## 4. Gate audits. R-164 and R-165. Nothing flipped.

### Phase 2: stays 6 of 9

**A procedural defect found while auditing.** G4, G7 and G9 each carried
`evidence: {ref: "", at: null}` while their `notes` carried six audits between
them. DOCTRINE-TRIAGE section 4 point 4 says write the audit into `evidence.ref`
whether or not it flips, and five TRIAGE runs wrote into `notes` instead. R-101's
audit of 2026-09-04 reached neither field and exists only in `decisions/inbox.md`.
**All three fields are now written.**

| Gate | Verdict | Measured today |
|---|---|---|
| **G4** | `fail`, **backlog with a card** | `grep -rn redirect lib/data/extraction-fire.ts app/api/extraction/callback/route.ts` exits 1, no output. `grep -niE "content-length\|maxbody\|bytelength\|too large\|413"` over the callback exits 1. **Redirect and oversize still absent**, exactly two cases short, and that is card **P2-20**, todo and eligible. |
| **G7** | `fail`, **unflippable by any terminal** | Three items, none moved: `RESEND_API_KEY` in production, `RESEND_FROM` set, a recipient not on a domain that does not exist. Two are panel actions. `blocked_on: ivan` retained. **No database read was performed and none is claimed.** |
| **G9** | `fail`, **unflippable by any terminal** | Needs Mihai to complete a cycle himself. No such report exists at this commit. Not backlog, and no card closes it. |

**One new fact on G4 that could be misread and so is written into the gate.**
`tests/e2e/extraction.spec.ts` has grown from 8 cases at R-080 to 14 at R-101 to
**35 today**, and two new lines assert a redirect. **It is a different redirect**:
they prove the callback answers 200 rather than being bounced to `/login` by our
own proxy. R-053's clause is about the FIRE refusing a redirecting webhook
address. A future auditor grepping for `redirect` will hit the new case first and
it does not satisfy the clause.

### Phase 3: stays 0 of 9, and the number is stale rather than measured

The report is right that 0/9 is a stale record. **The count does not move anyway**,
and both halves are true at once.

Every one of the nine carries the same sentence from the 2026-08-31 audit: *"no
phase 3 migration has been applied to the RC Supabase project. Twelve files, 0013
to 0024, are pending... every one naming P3-27, which is blocked on ivan."*
**P3-27 is shipped, and R-124 established that merging a migration applies it.**
The one cause that failed all nine at once is discharged.

**It still does not flip**, because every clause of every condition says "on
production", gates flip on committed evidence per clause, and **TRIAGE runs
nothing and holds no production connection.** A gate is not a percentage. The
false sentence is left in place per CLAUDE.md 9c, with today's audit appended
beneath it on each of the nine.

**GATE-02 is the card that re-derives them** and it already exists, so none was
authored. Two per-condition findings worth naming: **G1 is three of its four
clauses away from one command and GATE-01 is that command**; **G9's second clause
is the only clause on this board a terminal could evidence without a live probe**,
because it is about the localisation check being seen to fail in CI.

---

## 5. Cards authored: one.

**CI-03** on the phase 2 board, under R-170. *The pull request state reporter
prints WHICH STEP of `quality` failed, so a job that stopped early is never again
mistaken for a test that failed.*

It extends `npm run checks:state` rather than adding a second tool, because that
command already resolves the head sha and the run and stops one field short of the
step list, and because a second command is a second thing to remember. The
acceptance uses the fixture harness that already exists,
`scripts/poc-free/prove-pr-state.mjs` and `scripts/poc-free/pr-state-fixtures`,
and **fails if two fixtures of opposite shape produce the same verdict**. The exit
code is unchanged: the card adds output, not a refusal.

**Nothing else was authored.** Three findings that looked like cards were not,
because open cards already cover them: RST-02 for the stranded pull requests,
GATE-02 for the phase 3 re-audit, P2-20 for G4's two clauses.

---

## 6. Escalations: two, both re-raised rather than new.

Both carry a recommended default. Both are on the closed list in DOCTRINE-TRIAGE
section 6, item 7 and items 4 and 7.

**ESCALATION 1: the two email settings in the production console.**
**WHY IT IS ESCALATED:** item 7, panel actions.
**CONTEXT:** G7 is one of the three phase 2 launch conditions still open. Two of
its three blockers are `RESEND_API_KEY` and `RESEND_FROM` in the production
environment. They were escalated on 2026-08-31 by run `20260831-040003` and have
gone eight days unanswered.
**OPTIONS:** set them now, or wait until the credential lockdown and do it in one
sitting with the real client accounts.
**RECOMMENDATION:** set them now. It is ten minutes and it removes two of three
blockers from a launch condition. **The honest caveat is stated on the gate:** it
does not close G7 by itself, because the only recipient the system knows is on
`rc-inventory.local`, a domain that does not exist, and that lands at P2-13.
**IF UNANSWERED:** nothing breaks and the reminders keep addressing nobody, as
they have for thirteen days.

**ESCALATION 2: MIG-01, and it is newly urgent because of an edge applied today.**
**WHY IT IS ESCALATED:** items 4 and 7, vendor and panel.
**CONTEXT:** the question of whether the Supabase integration keeps applying
merged migrations has been `blocked_on: ivan` since 2026-09-03. **As of R-166 the
credential lockdown P2-13 now formally waits behind it**, and P2-14 and gate G9
wait behind that. It stopped being one blocked card today.
**OPTIONS:** keep the integration and rewrite section 8 to describe it, or turn it
off so the applier is the only path.
**RECOMMENDATION:** keep it and rewrite section 8. It is already how the system
behaves, and the pre-merge control it needs is built, unfiltered, running on every
pull request and proven to refuse. Turning it off makes every future migration a
hand-run step, which is slower with more ways to fail.
**IF UNANSWERED:** the lockdown cannot proceed, and it is the single action that
closes off every temporary permission the overnight sessions hold.

---

## 7. What this run did not do

- **Shipped nothing, merged nothing, applied nothing, wrote no application code
  and no test, and edited no existing ruling.** RST-03 and RST-05 were measured
  clause by clause and found already satisfied on `main`; **the measurement went
  into their notes and neither was shipped**, because TRIAGE runs no acceptance
  and the choice between closing such a card and shipping it belongs to whoever
  works it.
- **No gate flipped.** Phase 2 stays 6/9, phase 3 stays 0/9, `readiness_passed`
  is untouched on both boards.
- **No id was renumbered**, on either side of the R-087 to R-089 collision.
  CLAUDE.md 8b: history is not rewritten.

## 8. One note on the rubric, which is a legitimate output under DOCTRINE-TRIAGE

**`DOCTRINE-TRIAGE.md` tells TRIAGE to open a rulings pull request and says its own
rulings pull request is the only one it merges. It does not say what happens when
the cap expires before `quality` goes green, which is every time.** The cap is 30
minutes and the check takes about 22, so TRIAGE opens its pull request at the end
of its work and dies before it could lawfully merge. Six runs have now produced
six pull requests nothing came back for, and this is the seventh.

**This is reported and not raised as a block**, per CLAUDE.md section 4b. It is
recorded as a rubric gap rather than only as a harness defect, because RST-02 is
about the sweep and this is about the document that tells the role to expect
something the clock forbids.

---

## Pre-commit checks, run before the commit and quoted

    node docs/board/validate-board.mjs (all three boards)   PASS, 0 violations
    npm run check:unique-ids                                 OK, 172 card ids, 137 ruling ids
    npm run check:conflict-residue                           3 checks passed
    npm run id:free -- R-163                                 FREE
    npm run id:free -- CI-03                                 FREE
