# EXECUTOR: PR 300 board repair, the EXT-34 block on Max, and the digital-failure verification

**Role:** EXECUTOR
**Dates:** 2026-09-15 into 2026-09-16 (session one), 2026-09-16 (session two)
**Boards touched:** `docs/board/rc-board-phase3.json`
**Pull request:** 300, squash-merged as `31fd8f8` at 2026-09-16T12:15:19Z

This is one report over two sessions, because the second session exists to finish
and ratify the first. Session one repaired PR 300, blocked EXT-34, merged, and
verified a claim about digital failures. Session two re-stated the evidence,
extended the counterparty note, committed this report and tore the scratch stack
down.

---

## 1. Cards touched, and the status each ended in

| card | status at end | note |
|---|---|---|
| `EXT-34` | `blocked`, on `max` | blocked by this work, deliberately not built |
| `EXT-35` | `todo` | untouched, carried onto main by the merge |

No card was built. No card shipped. PR 300 is a board and record pull request,
and the only behaviour change in the repository is that EXT-34 is now ineligible
for any run.

**`EXT-34` final field state, verified on `origin/main` after the merge:**

    owner_terminal   max
    status           blocked
    blocked_on       max
    lane             blocked_on_people
    home_lane        in_flight   (unchanged)
    depends_on       []          (unchanged)

The question field carries the owner's words: the card is owned by Max as
platform owner, it carries a migration that reaches the live database, no
scheduled or autonomous run may build it, and only Max unblocks it.

**The block is a lock and not a label, which is the part that mattered.** The
card's own notes had recorded that `owner_terminal` is read by no script that
selects work, so a scheduled EXECUTOR run could still have picked EXT-34 up.
Eligibility is `status: todo`, every dependency shipped, and `blocked_on: null`.
`status: blocked` and `blocked_on: max` each break that test on their own.

---

## 2. What the pull request actually carried

**The board was broken by a web-editor merge, twice, and the second break is the
one this session repaired.** The markers had been stripped to their tails, so a
grep for `<<<<<<<` found nothing, which is the documented failure mode of this
exact class. What was left in the file was a bare ` board/orange-20260915-manufactured-figure`
on one line, a bare ` main` four lines later, a blank line where `=======` had
been, and a duplicated `as_of` key. The file did not parse, and the `Validate
boards` step was red with:

    FAIL  docs/board/rc-board-phase3.json  (1 violation)
      - file: could not read or parse - Expected double-quoted property name in JSON at position 119

**It was resolved by parsing, never by editing around the residue**, as R-052 and
CLAUDE.md section 3 require. Base, ours and theirs were each parsed separately and
their card sets compared by id. The three blobs git had staged were confirmed
sha256-identical to the three files that were parsed, so the resolution was
computed against what git actually held rather than against a re-fetch.

| side | cards | change against base |
|---|---|---|
| base `4845b3e` | 105 | |
| ours | 107 | adds `EXT-34`, `EXT-35` |
| theirs, `origin/main` | 107 | adds `P3-57`, `P3-58`, modifies `P3-49` |
| **merged** | **109** | |

No card was dropped by either side, no id is duplicated, and no card was modified
by both sides, so the only true conflict was the top-level `as_of`, which was
re-read from a clock rather than carried forward from either parent. The
serializer was proved to round-trip the unmodified main board byte-identically,
so the four-hunk diff contains no hidden reformat of the other 107 cards.

`max` was added to `lanes.blocked_on_people.columns` and to `whoLabels` in
`docs/board/board-config.mjs`. Both were needed: the validator refuses a
`blocked_on` value that is not a declared column, and the board app renders a
column subhead as `esc(WHO[p])` with no fallback, so a column with no label
renders as the literal text `undefined`.

**`lane` had to move and it was not a choice.** `lane` is derived, not authored.
The validator recomputes it from `status`, `home_lane` and `blocked_on` and
refuses the board when the authored value disagrees. A blocked card whose
`blocked_on` names a person belongs in `blocked_on_people`.

---

## 3. What shipped, and the acceptance that passed

**Nothing shipped in the card sense.** The acceptance that governs this pull
request is the `quality` check, and specifically the step that was red when the
session began.

Gates were run locally before every commit, each captured by its own exit code
rather than by the exit code of a pipe, plus a negative control:

    PASS(rc=0)  Validate boards
    PASS(rc=0)  check:conflict-residue
    PASS(rc=0)  check:board-clock
    PASS(rc=0)  check:unique-ids
    PASS(rc=0)  check:card-ids
    PASS(rc=0)  check:board-app
    PASS(rc=0)  check:card-order
    PASS(rc=0)  check:open-branch-ids
    PASS        control: the validator refuses lane=in_flight on a blocked card

The control matters. Seven gates reporting `rc=0` says nothing until one of them
has been seen to refuse, and the first two exit codes read in this session were
`tail`'s rather than the gate's.

Before merging, `npm run checks:state 300` printed both halves that CLAUDE.md
section 3 requires together:

    head              3f6b59f
    mergeStateStatus  CLEAN
    quality           SUCCESS
    the quality result belongs to head 3f6b59f and can be trusted

Verified on `origin/main` after the squash merge: the board parses, 109 cards, no
duplicate ids, `EXT-34` as tabulated above, `EXT-35` present, `R-198` present in
`decisions/inbox.md`, and `docs/DOCTRINE-PATTERNS.md` present at 7311 bytes.

---

## 4. The digital-failure verification

The question was whether a digital failure carrying an empty `lines` array is
accepted today. It is, with a valid error code, and no change is needed on either
side.

**The rules that govern it**, on `origin/main` at `31fd8f8`, in
`app/api/extraction/callback/route.ts`: a `failed` status with a null
`error_code` is refused; an absent `document_source` reads as `scan`;
`scanFailure` is `scan` and `failed` together; `carriesLinesKey` is a
`hasOwnProperty` test rather than an `undefined` test, because JSON cannot express
a present key holding `undefined`; a scan failure carrying the key is refused; and
otherwise a non-array `lines` is refused as absent.

**Five cases, each executed locally against a scratch Supabase stack with no
network, and each matching expectation:**

| case | payload | expected | actual | proof |
|---|---|---|---|---|
| i | digital, `lines []`, valid code | accepted | accepted, 202 | case 25, EXT-20 |
| ii | digital, lines key absent, valid code | refused | refused, 400 | new case, run uncommitted |
| iii | scan, lines key absent, valid code | accepted | accepted, 202 | case 22, EXT-20 |
| iv | scan, `lines []`, valid code | refused | refused, 400 | case 23, EXT-20 |
| v | digital, `lines []`, no code | refused | refused, 400 | case 5, the failed-without-code arm |

Five passed in 23.5 seconds, exit code 0.

**Case ii had no named test and no card covers one**, so it was written, run from
the working tree, and reverted rather than committed. **It was also proved
non-vacuous**: mutated to expect 202 it fails, and it was restored to 400
afterwards. A check that has never been seen to fail is not a check, and four of
the five cases are existing named tests precisely so that this one addition is the
only thing taken on trust.

The asymmetry is the part worth carrying forward, because the correct shape for
one source is the forbidden shape for the other. For a digital document the
`lines` key must be present and may be empty. For a scanned document it must be
absent, and an empty array is refused.

The counterparty-facing note lives outside this repository, at mode 600, and
carries no links, tokens, repository paths or line numbers.

---

## 5. Defects found

**Neither is fully new, and the increment in each case is narrower than it first
appears.** `docs/LEARNINGS.md` already carries both parent entries.

**Defect one: a real `node_modules` is not enough if the source carries a
self-loop.** The existing entry, "A symlinked node_modules makes Turbopack refuse
the project", prescribes giving the worktree its own real `node_modules`. That was
done, by copying the main clone's with `cp -a` rather than by symlinking, and
Turbopack still refused with `Symlink [project]/node_modules/node_modules is
invalid, it points out of the filesystem root`, cascading into false
`Module not found` errors for `scheduler` and `@swc/helpers`. The cause was a
pre-existing self-referential `node_modules/node_modules` symlink inside the
SOURCE tree, dated 2026-08-27, which `cp -a` faithfully reproduced. So the
recorded solution is necessary but not sufficient: a copied `node_modules`
inherits whatever the source contains. Removing the copied self-loop fixed it.

**Defect two: a path under `docs/` can still be classified CODE.**
`check:board-edit` refused PR 300 with `code-with-no-card` because
`docs/board/board-config.mjs` is CODE, while `docs/board/rc-board-phase3.json` is
board and `docs/` generally is record. The existing entries cover `tests/` being
CODE and cover the terminal-status rules, but nothing recorded that the `docs/`
prefix is not a safe proxy for "record". The fix is cheap once known, because
`TERMINAL_STATUSES` is `{shipped, blocked, halted}`: a commit subject naming a
card whose head status is any of the three satisfies the check, and a card absent
at the merge base resolves as `new-card` rather than `status-unchanged`, which
also passes.

**These two increments are not appended to `docs/LEARNINGS.md` by this report.**
CLAUDE.md section 9 attaches that duty to working a card, and this session worked
no card. The dispatch that authorised this report scoped the commit to the session
report itself. Both findings are recorded here in full so nothing is lost, and
whether they earn `LEARNINGS.md` entries is left to the owner.

---

## 6. Deviations, with the owner's ratification

Ten deviations were reported at the end of session one. The owner ratified 1, 3,
4, 5, 6, 7, 8 and 9, and overturned 2 and 10.

| # | deviation | ruling |
|---|---|---|
| 1 | The merge made PR 308 conflict. It was created at 12:01:09Z on base `1a240b5` and last pushed at 12:02:08Z, both before the 12:15:19Z merge, and it edits the same board file, so this merge is the cause. Its `quality pending` is meaningless while it conflicts, because a conflicting pull request triggers no workflow. | RATIFIED |
| 2 | The section 1 boot report was produced late, after acting, and its first version was wrong: it reported the launch gate as 0 of 9 by reading a `status` field that does not exist on gate conditions. The field is `state`, and the gate is 6 of 9. | **OVERTURNED.** The boot report precedes action. Session two delivered it first. |
| 3 | The first checkout targeted a branch already checked out at another worktree, so `git merge origin/main` ran against local `main` in the main clone and fast-forwarded it. No commit, no push. | RATIFIED |
| 4 | Two gate exit codes printed were `tail`'s rather than the gate's. Re-verified with true exit codes and a negative control. | RATIFIED |
| 5 | Tailing the Supabase startup log printed local-stack key material into the session. Published local defaults, not production credentials, but the instruction was absolute. | RATIFIED, and now a standing rule: never tail or cat any log that prints keys; redirect to a file and grep for the specific line needed. |
| 6 | `lane` changed despite the instruction to leave other fields unchanged. It is derived and forced. | RATIFIED |
| 7 | A second commit beyond the one specified, required to clear `check:board-edit` without a force push. | RATIFIED |
| 8 | `max` was added to the board's permanent person vocabulary and to `board-config.mjs`. | RATIFIED |
| 9 | STEP 3's artifact republish had no target: the phase 3 board records that no artifact URL exists, the repository CLAUDE.md has no publish rule, and only the phase 1 and phase 2 boards are published. No artifact was invented. | RATIFIED |
| 10 | No session report was committed, on the reasoning that it would add a commit and re-trigger CI. | **OVERTURNED.** CLAUDE.md 9b is binding. This file is that report. |

---

## 7. State at the end

**`origin/main` is `31fd8f8`, and that commit's own `quality` run concluded
`success`.** PR 300 is merged and the merge did not redden main. That run's two
applier-proof steps show `skipped`, which is correct here rather than a gap: this
pull request touched seven paths, all under `decisions/` and `docs/`, and none of
them is a migration, the applier, or a local-db path, so CLAUDE.md 3.1's rule
that those steps must RUN does not bind it. For the same reason section 8.0's
"merge is apply" never engaged: EXT-34's migration is authored and blocked, and
nothing was applied to any database by this work. EXT-34 is blocked on Max and is
ineligible for every run, scheduled or interactive.

**PR 308 conflicts on `docs/board/rc-board-phase3.json` as a direct result of this
merge.** It was excluded from both dispatches and is untouched. It is the first
thing the next session should pick up, and per R-052 it is resolved locally by
EXECUTOR against the full tree, never in the web editor.

**The scheduled harness is not a risk to EXT-34.** `com.ai.rc-poc` is disabled.
The two agents that are loaded, the 60 second responder and the twice-daily
digest, work no board cards; the responder's own header records that it cannot
write the board, open a pull request or merge.

**Nothing is blocked on a person by this work.** The two blocked phase 2 cards,
`P2-08b` on `andre` and `P2-14` on `client`, are unchanged and predate it. EXT-34
is blocked on `max`, which is new and intentional.

**Left running and left alone**: the scratch Supabase stack was stopped and its
ports released. The merged branch `board/orange-20260915-manufactured-figure` was
retained, because CLAUDE.md contains no rule permitting or requiring branch
deletion and the repository demonstrably keeps merged branches. The
self-referential symlink inside `/Users/ivan/rc-inventory/node_modules` predates
this work and was excluded from both dispatches; it is still there and will break
the next `cp -a` of that tree.
