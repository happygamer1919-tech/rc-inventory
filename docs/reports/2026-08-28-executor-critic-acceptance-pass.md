# EXECUTOR report, run 20260827-220052

**Role:** EXECUTOR
**Run id:** 20260827-220052
**Lock taken:** 2026-08-28T02:00:52Z
**Report written:** 2026-08-28T09:53Z
**Worktree:** /Users/ivan/rc-inventory-poc-run, detached from origin/main at 2fe7f90
**Cap:** 2700s declared by the harness. See finding 3: it did not hold.

---

## 1. Boot report, as printed

```
BOARD: docs/board/rc-board-phase2.json   as_of 2026-08-27T18:40:00Z

CARDS BY STATUS (32 total)
  shipped     26
  in_flight    1   AUT-3
  blocked      3   P2-08b (andre), P2-15 (ivan), P2-19 (ivan)
  todo         2   P2-13 (deps blocked), P2-14 (blocked_on client)
  halted       0

LAUNCH GATE: 6/9 passed
  G1 pass  G2 pass  G3 pass  G4 fail  G5 pass
  G6 pass  G7 fail (ivan)  G8 pass  G9 fail

CLAIMS (docs/poc/state.json): none held by any actor

NEXT ELIGIBLE CARD: no eligible card
```

No card was eligible, and no claim blocked one. The queue is genuinely dry:

- **P2-13** is `todo` with `blocked_on: null`, but `depends_on` names P2-15 and
  P2-08b, both `blocked`. Eligibility needs every dependency `shipped`.
- **P2-14** is `todo` with `blocked_on: client`.
- **AUT-3** is `in_flight`, and by its own R-036 note it is closed by a
  scheduled run producing a TRIAGE rulings PR. That is this run's TRIAGE step,
  which fires after me. Not mine to close, and not mine to claim.

Per CLAUDE.md section 13 the run therefore invoked **CRITIC against the
acceptance lines** rather than idling or inventing work.

---

## 2. Cards touched

**None.** No board edit, no application code, no migration, no card status
change. The only files this PR adds are this report and the LEARNINGS entries
section 9 requires.

---

## 3. PRs

| PR | What | Outcome |
|---|---|---|
| #78 | The previous run's CRITIC report, `poc/critic-pass-20260827-160337` | **Merged** by this run as `10011d0` |
| this one | This report plus two LEARNINGS entries | Opened and merged, number in section 8 |

**Why this run merged #78, which is another run's PR.** It was open, docs-only,
and its `quality` check was green, but its branch was BEHIND `main` and the
branch protection requires an up-to-date head, so it could never merge itself.
The file it carries is a section 9b report, and section 9b exists so the next
role can read the previous role's output. TRIAGE reads the newest file in
`docs/reports/` **on origin/main**. A report parked on an unmerged branch is
invisible to exactly the role it was written for.

The merge was done to the letter of section 3: `gh pr update-branch` (a merge
from base into head, **not** a force push and not a history rewrite), then the
`quality` run was confirmed to **exist and be green for the new head sha**
`3f8b4a0` before merging, not inferred from the stale rollup on the old sha.

---

## 4. The acceptance pass

Re-run against `2fe7f90`, four commits ahead of the `3420435` the previous pass
covered. Everything below was executed in this run. Nothing is reported from an
older report.

### Green

| Check | Command | Result |
|---|---|---|
| Board validator | `node docs/board/validate-board.mjs docs/board/rc-board-phase2.json` | **PASS**, 0 violations, exit 0 |
| P2-06 clause 1, no mock fallback | `grep -rn "@/lib/mock" app components lib` | exit 1, and `lib/mock` does not exist |
| P2-01 / typecheck | `npx tsc --noEmit` | no output, exit 0 |
| P2-16, build leaves no dirt | `npm run build && git status --porcelain` | build exit 0, porcelain printed **nothing** |
| P2-11 | `docs/migrations/APPLY-LOG.md` present | present, 30849 bytes |
| AUT-1 | `docs/reports/README.md` present | present |
| AUT-2 | `docs/DOCTRINE-TRIAGE.md` present, 8 sections | present |
| AUT-7 | validator enforces `plain` on **both** cards and gates | enforced at `validate-board.mjs:175` (gates) and `:245` (cards), and the board passes |

### Not run, and not claimed

**The nine Playwright specs** in `tests/e2e/`. They are **not** reported as
passing. This is finding 4 and it is now proven rather than argued: the guard
was executed in this run and refused.

---

## 5. Findings

### Finding 1, HIGH. The executor step still runs with the whole secrets file in its environment. Carried from the previous pass, re-confirmed, and now verified by direct observation.

`scripts/poc/run.sh` sources `$POC_SECRETS_FILE` under `set -o allexport` at
lines 85-88, and invokes `claude -p` at line 380 with no environment stripping.
Every scheduled EXECUTOR run therefore holds every credential in that file.

**Verified inside this run, names only, no value read, printed, logged or
committed:**

```
SUPABASE_SERVICE_ROLE_KEY: PRESENT in executor process env
SUPABASE_DB_PASSWORD:      PRESENT in executor process env
NEXT_PUBLIC_SUPABASE_URL:  PRESENT in executor process env
RESEND_API_KEY:            PRESENT in executor process env
TELEGRAM_BOT_TOKEN:        PRESENT in executor process env
```

This is no longer an inference from reading the script. It is the state of the
process writing this sentence.

**Why it matters.** CLAUDE.md 8.2 scopes the secret-read grant to *applying
migrations*, and this run applied none and needed none. 8.7 makes P2-13
responsible for confirming **no terminal-held copies remain**, and under the
current harness every scheduled run is a terminal holding a copy, four times a
day, whether or not it touches the database.

**The fix already exists in this repository.** AUT-6's responder solves the
identical problem at `scripts/poc/responder.sh:190` with `env -u`, and its own
comment at line 183 states the reason. The executor step did not get the same
treatment.

**Recommendation.** Give `claude -p` at run.sh:380 the same `env -u` treatment
responder.sh already uses, stripping everything the executor does not need, and
re-source only inside the migration step that CLAUDE.md 8.3 actually authorises.
That is a POC-BUILDER change to a POC-BUILDER file, so it belongs in a card, not
in this PR. See "what this run deliberately did not do" below.

### Finding 2, HIGH, NEW. Code shipped to main under card ids that exist on no board.

**AUT-5** and **AUT-6** are not cards. They are not on
`docs/board/rc-board-phase2.json`, not on `docs/board/rc-board.json`, and
`git log -S` over `docs/board/` returns **nothing** for either id, so they were
never on a board and later removed either. They never existed.

Three merged PRs claim them:

| Commit | PR | Title | Files |
|---|---|---|---|
| `801e794` | #70 | AUT-5: the digest Ivan can act on, and a full one he never sees | harness |
| `3420435` | #71 | AUT-6: a conversational responder, read-only by construction | 6 files, 558 insertions |
| `0400cdb` | #77 | AUT-6: the per message timeout was guessed too low, and measured | 2 files |

That is real executable code, including a Telegram responder that reads the repo
and answers the owner, landed on `main` under an id with no card, no `plain`
field, no `acceptance`, no `defaults`, no `evidence`.

**Why it matters.** CLAUDE.md section 2: "The board is the work queue. Nothing
is worked that is not a card." Section 6: "No acceptance, no ship." AUT-7 made
`plain` mandatory precisely so the owner can read the board, and the validator
now enforces it. None of that reaches AUT-5 or AUT-6, because the validator
checks cards that exist, not commits that assert an id. The board says 32 cards
and the owner reads 32 cards; the repository contains work from at least 34.

There is also a live consequence beyond bookkeeping: the previous pass's finding
3 recorded that AUT-4's four triage sections no longer reach the digest Ivan
receives, "AUT-5 working as designed". A shipped card's behaviour was changed by
a non-card, and the only record of that is a sentence in a report.

**Recommendation.** AUTHOR retro-authors AUT-5 and AUT-6 as cards carrying
`plain`, `acceptance` and `evidence` pointing at the commits that already
landed, marked shipped, so the board matches the repository. Then add the
cheap guard that would have caught it: a CI step asserting every commit-message
card id prefix on `main` resolves to a card on a board. This is AUTHOR work and
a new card, not something EXECUTOR invents into this PR.

### Finding 3, HIGH, NEW. The 45-minute cap did not fire. This run has been alive for nearly 8 hours and is still holding the lock.

Observed, not inferred:

- `run.lock` created `2026-08-28T02:00:52Z`. The launchd log records
  `invoking EXECUTOR, cap 2700s, cards 2` at the same second.
- This report is being written at **09:53Z**, and PR #78 was merged by this
  session at `2026-08-28T09:51:03Z`, both timestamps from outside the session.
- Elapsed: **~7h52m against a 2700s cap.** The watchdog never fired.
- `ps` shows the `sleep 2700` watchdog process still resident with an elapsed
  time of over 7 hours, alongside three live `run.sh` processes.

**Likely mechanism, offered as a hypothesis rather than a claim.** The watchdog
at run.sh:389 is a single `sleep "$POC_MAX_SECONDS"`. On macOS a sleeping timer
does not advance while the system itself is suspended, so the cap measures
**awake** time, not wall clock. The clock jumps observed between adjacent tool
calls in this session are consistent with the machine suspending and resuming
repeatedly overnight. I did not prove the mechanism and am not asserting it.

**What is certain regardless of mechanism.** CLAUDE.md section 13 states the cap
"is enforced by the harness, not by the session's own sense of time." Tonight it
was enforced by neither. And section 13's other rule compounds it: "A run never
starts if run.lock exists." This run has held that lock for eight hours across
the **01:00 and 04:00 scheduled slots**, so those runs either refused or never
got a turn. One overrunning run silently consumed the rest of the night.

**Recommendation.** Replace the `sleep`-based sleeper with a deadline: store
`date +%s` at start, and have the watchdog poll on a short interval comparing
`date +%s` against `start + POC_MAX_SECONDS`, which is immune to suspension
because it reads the clock rather than counting down against it. Add a
staleness rule to the lock so a lock older than the cap plus a margin is treated
as abandoned rather than honoured forever. POC-BUILDER file, so: a card.

### Finding 4, MEDIUM. No card whose acceptance is a named spec can be shipped by a scheduled run. Now proven by execution, not argued.

The previous pass reasoned this from the code. This run ran it:

```
$ node scripts/assert-not-prod.mjs
GUARD_EXIT=2
assert-not-prod: NEXT_PUBLIC_SUPABASE_URL arata catre proiectul Supabase de
PRODUCTIE. Suita de teste scrie date, deci refuza sa porneasca.
```

The guard is **correct and must not be weakened**. CRIT-11 exists because the
end-to-end suite was writing into the production Supabase project, and the guard
checking both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL` is the right shape.

The defect is upstream: the production URL is only in the environment because of
finding 1. Fix finding 1 and this resolves with it. Until then, section 6 says
no acceptance no ship, so an unattended run can ship documentation and board
edits and nothing whose acceptance is a Playwright spec. That is a ceiling on
what four runs a day can actually deliver, and it should be stated plainly
rather than discovered card by card.

### Finding 5, LOW. Carried forward, still unresolved: the harness cuts its state branch from an unrefreshed origin/main.

Recorded by the previous pass as its finding 4, and the reason both that pass
and this one put findings in the committed report rather than in
`docs/poc/state.json`. Writing escalations into that file from an executor
branch risks colliding with the harness's own state PR, which is written after
the digest is sent from a base that predates this branch.

No escalation was owed this run in any case: section 13 requires one when an
**eligible** card ships nothing, and there was no eligible card. The findings
above travel in this committed report, whose path the digest carries.

---

## 6. What this run deliberately did not do

**It did not edit `scripts/poc/run.sh`,** although findings 1 and 3 both live
there and both have obvious fixes. AUT-3's `defaults` are explicit: the harness
files belong to POC-BUILDER, and "coordination is through committed files only,
never directly." Section 3 forbids self-invented scope, and a defect noticed in
passing becomes a card or a LEARNINGS entry, not a quiet extra commit. This
report and the LEARNINGS entries are that committed file.

**It did not author cards for AUT-5, AUT-6, or the two harness defects.** Card
authoring is AUTHOR's role, and EXECUTOR writing cards for itself is how a queue
stops being a queue.

**It did not touch AUT-3.** Its acceptance is produced by this run's TRIAGE
step, downstream of me.

**It did not run the Playwright specs,** and does not claim them. See finding 4.

---

## 7. LEARNINGS

Two entries appended to `docs/LEARNINGS.md` in this PR, for finding 2 (a card
id in a commit message that resolves to no card) and finding 3 (a `sleep`-based
watchdog measuring awake time rather than wall clock).

---

## 8. What the next run should pick up first

1. **Expect the board to still be dry.** Nothing this run did makes a card
   eligible. P2-13 needs P2-15 and P2-08b, and both are blocked on people.
2. **Check whether AUT-3 closed.** If this run's TRIAGE step produced a rulings
   PR with no human input, AUT-3 ships with this run log as evidence. If it did
   not, R-036 says the failure is a harness defect and becomes a card of its own,
   not a question for the owner.
3. **Findings 1 and 3 are the highest-value unblocked work in the repository**
   and neither is a card yet. Finding 3 in particular is self-limiting for the
   whole schedule: while a run can hold the lock for eight hours, the other three
   slots of the night do not exist. Whoever authors next should author these two
   before anything else.
4. **Verify the merge state of this PR before assuming the report is on main.**
   #78 sat unmerged and BEHIND for hours and TRIAGE could not see it. That is now
   a known failure mode of this chain, not a one-off.

## 9. Owner-facing summary, plain

Nothing on the build list could be worked tonight: everything left is waiting on
Andre, on the client, or on Ivan. So the session spent its time re-checking that
the finished work still works, and it does: the site builds clean, the catalogue
is real with no leftover fake data path, and the product list the owner reads is
intact.

Three problems were found in the machinery that runs these overnight sessions,
none of them in the product itself. The overnight session carries the system
passwords when it does not need them. Two pieces of work were built without
being written on the list first, so the list undercounts what exists. And
tonight's session was supposed to stop after 45 minutes and instead ran for
nearly 8 hours, which quietly cancelled the other two sessions scheduled for the
night. None of this touches what Mihai will see. All of it slows down how fast
the rest gets built.
