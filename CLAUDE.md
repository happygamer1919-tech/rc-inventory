# RC Inventory - standing rules

Rapid Construct inventory system. Phase 1 (mock preview, 13 cards, 9/9 gates)
is shipped. Phase 2 makes it real: Supabase database and auth, AI extraction
through a Make.com webhook, Resend email, a client domain at launch.

These rules bind every terminal that works this repo, in every session, without
exception. They are not advice. A session that has not read this file has not
booted.

---

## 1. Identity and boot

Four roles exist. A session is exactly one of them and says so in its first
message, by name:

- **AUTHOR** - writes governing docs and boards. Writes zero application code.
- **EXECUTOR** - works the board, one card at a time, writes the application code.
- **CRITIC** - reviews shipped work against the acceptance lines. Writes no
  feature code, only findings and, when asked, fixes to what it found.
- **POC** - point of contact. Owns `decisions/inbox.md`, turns Ivan's Telegram
  answers into committed rulings, unblocks cards. Writes no feature code.

**Boot sequence, mandatory, before any other action:**

1. State the role name.
2. Read `docs/board/rc-board-phase2.json`.
3. Print a status report containing, at minimum:
   - a count of cards by status (`todo`, `in_flight`, `blocked`, `halted`, `shipped`)
   - the launch gate count in `passed/denominator` form
   - the next eligible card, by id and title, or the explicit words
     `no eligible card` when none exists
4. Only then act.

No tool call that changes anything may precede that status report. Reading is
allowed during boot; writing is not. A session that starts editing before it
has printed the report has violated this file.

---

## 2. Board loop

The board is the work queue. Nothing is worked that is not a card.

**Eligibility.** A card is eligible when all three hold:

- `status` is `todo`
- every id in `depends_on` belongs to a card whose `status` is `shipped`
- `blocked_on` is `null`

**Pick.** Take the **lowest-id eligible card**. Ids sort lexically
(`P2-01` before `P2-02` before `P2-10`), which is why they are zero-padded.
Never skip an eligible card because a later one looks easier or more
interesting.

**One card, one branch, one PR.**

- Branch name: `card/<id>`, lowercased, for example `card/p2-04`.
- Branch from the current `main`, never from another card branch.
- One PR per branch. A PR that carries two cards is rejected and split.

**Board update in the same PR.** The PR that carries the card's code also
carries the board edit for that card: `status`, `evidence`, `last_checkpoint`,
`notes`, and the top-level `as_of` bumped to the commit moment in ISO 8601.
A code PR with a stale board is incomplete. A board edit landed separately from
its code is a board that lies about a commit that does not exist yet.

**Validator gate.** `node docs/board/validate-board.mjs docs/board/rc-board-phase2.json`
must exit 0 **before every commit**, not before the PR, not before the merge.
A commit made while the validator is red is reverted, not patched forward.

**Every card carries `plain`, at authoring time, not afterwards.** Added
2026-08-27 by card AUT-7.

`plain` is the card in **ordinary business English**, one or two sentences,
saying what it means for the product and for Mihai. It contains **no card ids,
no file paths, no PR or ruling numbers, no test or migration names, and no
vocabulary from this file**. The `title` is written for whoever builds the card.
`plain` is written for whoever paid for it.

```
"plain": "Delete the fake products left over from testing, before Mihai sees
          the system."
```

The same rule binds **every launch gate condition**: one sentence naming the
condition the gate actually represents, in the terms of what the owner would see
or be able to do when it passes.

**The validator enforces it on both boards**, including the closed phase 1
board, and a card or gate without it is a hard failure. It is written **when the
card is authored**, in the same commit, because a field added in a later sweep
is a field written by someone reconstructing intent rather than stating it.

Why it is a rule: the owner does not read code, and he reads the board. A board
that speaks only the build's vocabulary forces every status question through a
translator, which is the dependency this project exists to remove. The digest
reads this field directly and reports any card missing one.

**Card lifecycle.** `todo` -> `in_flight` when work starts (commit that flip
first, so the board never shows a card being worked as untouched) -> `shipped`
or `blocked`. `halted` is reserved for the failure ceiling in section 10.

---

## 3. PR discipline

- **Never push to `main`.** `main` is protected. The required status check is
  named exactly `quality`. There is no second check and no other name.
- **Merge only on green `quality`.** A merge on a check that is pending, failed,
  skipped, or absent is a violation regardless of how obviously correct the
  change is. `gh pr checks` reporting all-pass on a conflicting PR is not green:
  a PR conflicting with `main` triggers zero workflows, so verify that the
  `quality` run exists for the head sha before merging.
- **No force pushes.** Not to `main`, not to a card branch, not with
  `--force-with-lease`. A branch whose history needs rewriting gets a new
  branch.
- **A GREEN CHECK ON A CONFLICTING PULL REQUEST IS STALE, AND THIS APPLIES TO
  WAITING AS WELL AS TO MERGING.** Added 2026-09-01 by card P3-11d. The rule above
  is written for the moment of merging. The same trap catches a terminal that is
  simply WAITING on a fix: a conflicting pull request triggers **zero workflows**,
  so a fix pushed onto it never runs, while the check result from the previous
  head sha stays attached and `gh pr checks` keeps reporting `quality pass`.
  During INC-06 the fix for a six-screen production outage sat in exactly that
  state for about an hour, pushed and reporting green, having never run.
  **Read `mergeStateStatus` beside the check result, always.**
  `npm run checks:state <pr>` prints both and exits non-zero when a green result
  belongs to a commit nobody is proposing to merge.
- **No self-invented scope.** The PR does what the card says and nothing else.
  A defect noticed in passing becomes a new card or a `docs/LEARNINGS.md` entry,
  not a quiet extra commit. Refactors that were not asked for are scope.
- The PR description names the card id, the acceptance line, the command run to
  prove it, and every migration file added.

### 3.1 Self-merge on green `quality`

**Added 2026-08-28 by ruling R-049, as a grant by role and by path. WIDENED TO
EVERY PATH ON 2026-08-30 BY RULING R-059**, on the owner's instruction, stated
twice. Everything in section 3 above still binds, this one included. Nothing
here permits a merge on a check that is pending, absent, skipped, or inherited
from an earlier sha.

**FOUR ROLES MERGE THEIR OWN PULL REQUESTS, WITHOUT WAITING FOR IVAN, ON ANY
PATH, WHEN THE `quality` CHECK IS GREEN ON THE HEAD SHA:**

| Role | Its path set |
|---|---|
| EXECUTOR | any path in the repository |
| AUTHOR | any path in the repository |
| POC-BUILDER | any path in the repository |
| TRIAGE | any path in the repository |

**Green on the head sha means a run exists for that exact sha and concluded
success.** Not a run on the previous sha, not an inherited context, not a
`gh pr checks` summary on a pull request that conflicts with `main` and
therefore triggered no workflow at all. That last one has happened here and
section 3 names it.

**THE PATH COLUMN IS NOW ONE VALUE AND IT IS KEPT ANYWAY.** Four rows saying
"any path" is a table that could be one sentence. It stays a table because the
previous version of this section was a table of DIFFERENT sets, the whole grant
turned on which set a path fell into, and a reader arriving from a report or a
ruling that cites "the EXECUTOR path set" needs to land somewhere that tells
them the distinction is gone rather than somewhere the phrase has quietly
stopped existing.

#### THE ONE EXCLUSION, AND IT IS ABOUT EXECUTION, NOT ABOUT FILES

**APPLYING a migration, or any destructive statement, against the PRODUCTION
database is not covered by this grant and never was.** It is gated by section
8.6 and by ruling R-047, both unchanged, and it is gated whether or not a
`quality` check is green, because a green check says nothing about a database.

**MERGING THE FILE IS NOT APPLYING IT.** A pull request that ADDS
`supabase/migrations/0013_something.sql` changes one text file in a git
repository and changes nothing in any database. It merges under this grant like
any other pull request. The apply is a separate act with its own three phases in
8.5, its own journal in 8.8, and its own stop in 8.6. Those two things were run
together in the old wording, which is why a migration card used to be
un-mergeable until the owner was available to run something the pull request
never asked him to run.

That is the whole exclusion. There is no second one.

#### WHAT THIS DOES NOT TOUCH: SECTION 5b'S ACCEPTANCE HALF

**A card still does not ship without its named acceptance having been run and
passed.** Section 5b is two conditions, green `quality` and the card's
acceptance, and this section is about the first one only: it removes the WAIT
FOR IVAN, not the proof.

R-049 removed the acceptance half as well, and only for documentation-shaped
paths, on the reasoning that a docs-only pull request has no acceptance to run.
**That narrow removal is not extended here**, because the paths this widening
adds are exactly the paths that do have one. A pull request carrying application
code merges on green `quality` plus its card's acceptance passing, decided by the
terminal instead of by the owner. The dispatch that widened this grant says the
same thing in its own per-card line: "machine-checkable acceptance, committed
report, self-merge on green".

#### THE CONDITION THIS RESTS ON, WHICH IS A PROPERTY OF THE WORKFLOW

`.github/workflows/quality.yml` triggers on `pull_request` with **no path
filter**, so every pull request runs every step of the job: typecheck, build,
all three board validators, the reset SQL parser, the conflict residue check,
the category vocabulary check, the ledger row check, the production-target
check, the migration apply against a bare postgres, the harness cap proof, the
production guard refusal, and the end to end suite against a local Supabase
stack. A green here is work that actually ran.

**IF A `paths:` FILTER IS EVER ADDED TO THAT WORKFLOW, THIS SECTION DIES WITH
IT**, because it would then authorise merging on a check that never executed.
Whoever adds the filter removes this section in the same pull request.

##### ONE STEP IS NOW PATH-FILTERED, AND THIS SECTION SURVIVES IT. Added 2026-09-01 by ruling R-084.

**There is still NO `paths:` key on the workflow, and the sentence above is
unchanged and still binds.** What was added is a filter on ONE STEP, expressed as
a step-level `if:`, and the distinction is the whole reason the grant survives:

| | what it skips | what the required check reports |
|---|---|---|
| a workflow `paths:` key | the **entire** `quality` job | **success**, on a job that never ran |
| a step-level `if:` | **one step** | the real result of the other twenty-one |

The path-filtered step is **Prove the migration applier against the Docker shim**
(`npm run prove:applier`). It builds five throwaway postgres containers and takes
minutes, so it runs only when `scripts/apply-pending-migrations.*`,
`supabase/migrations/**` or `scripts/poc-free/local-db/**` changed. **It fails
open**: when the base commit cannot be resolved, the proof runs rather than
concluding that nothing changed.

**WHAT SELF-MERGE REQUIRES IS UNCHANGED AND IS RESTATED HERE SO IT CANNOT BE READ
LOOSELY:**

1. **the full, unfiltered suite green.** Every other step in the job runs on every
   pull request, exactly as before. That is the green this section has always
   meant and it is still the only green that authorises a merge.
2. **and additionally**, a pull request touching any of the three applier paths
   above requires the applier proof step to have RUN and PASSED, not skipped. A
   pull request that changes a migration file and shows that step as skipped has
   not met this section, whatever the overall check says.

A second path-filtered step is a change to this section, not an application of
it. The exemption is for this one step and does not generalise.

###### THERE IS NOW A SECOND, AND THIS SECTION WAS AMENDED TO ADD IT. Added 2026-09-02 by card PROVE-01.

The sentence above is why this paragraph exists rather than a quiet second `if:`.

The step is **Prove every applier assertion can fail** (`npm run prove:assertions`).
It builds a postgres container, brings it to the state the applier leaves behind,
and then runs every one of the applier's SQL assertions twice: once against a
correct database, where it must hold, and once against a database perturbed to
violate it, where it must raise.

**It shares the existing filter rather than adding one.** Both steps are gated by
the same `applier_scope` decision, on the same paths plus the new proof's own
file, so there are two filtered steps and still **one** filter. Whoever adds a
third reads this paragraph and amends it again.

**Why it is filtered at all:** it costs a container and minutes, and it is about
`scripts/apply-pending-migrations.mjs`. A pull request that does not touch the
applier, its migrations, the shim or the proof cannot change what it proves.

**WHAT SELF-MERGE REQUIRES IS UNCHANGED.** A pull request touching any of those
paths requires BOTH filtered steps to have RUN and PASSED, not skipped. The rest
of the job is unfiltered and runs on every pull request, and that is still the
green this section means.

**`npm run check:assertion-register` is NOT filtered and must never be.** It is
the step that notices an assertion arriving with no failing case, it needs no
container and no database, and filtering it would let exactly the gap it exists
to catch through on a pull request that touched something else.

#### THE HISTORY, KEPT SHORT AND KEPT

- **R-049, 2026-08-28.** Granted EXECUTOR and POC-BUILDER self-merge on
  documentation-shaped paths only, and said in terms that application code and
  migrations were excluded and that widening was an owner decision rather than
  an inference from the table.
- **R-056, 2026-08-28.** Added AUTHOR on the EXECUTOR path set, by the owner, in
  his own words.
- **R-059, 2026-08-30.** Widened all of it to every path and added TRIAGE, by
  the owner, stated twice. The clause reserving the decision to him is what made
  both widenings his to make, and both times it worked as written.

**TRIAGE IS NOW IN THE TABLE.** Until R-059 it was granted nothing here and its
only pull request was its own rulings pull request, under
`docs/DOCTRINE-TRIAGE.md`. That document's authority over what TRIAGE may DECIDE
is unchanged: its section 6 is a closed list of ten items that go to Ivan, and a
merge grant does not touch a decision grant. TRIAGE may now merge a pull request
it could always have opened.

**REVOKED BY P2-13**, with every other terminal grant, as a checklist item in
section 8.7.

### Conflicts, added 2026-08-28 by ruling R-052

**A merge conflict is resolved LOCALLY, by EXECUTOR, against the full tree, with
the validator run before the commit. Never in the GitHub web editor, and never by
the owner.** A conflicting PR is assigned to EXECUTOR.

Three resolutions have reached this repository carrying residue and **nothing
caught any of them**. In all three the resolver deleted the marker CHARACTERS and
left the tails behind as file content:

- `555b725` committed a `docs/board/rc-board-phase2.json` that did not parse.
  The board validator would have caught it and was not run.
- `d66a28e` put ` poc/19-harness-caps` and ` main` into `docs/LEARNINGS.md`.
  Markdown has no parser to offend, so it sat on `main` through four merges.
- PR #94 produced the same residue four times across two files, in the web
  editor.

**The web editor is the common factor and the rule names it.** It shows one file
at a time, out of the tree, and no check in this repository can be run from it.
Every safeguard here is a command, and that is the one place none of them exist.
A resolution made there is made blind.

**It names the owner too, and that is not a criticism.** He does not read code,
which is the standing condition this project is built around. Resolving a
conflict is the one task that requires reading both sides of a diff and choosing
which lines survive, and it is the task with the least visible failure: a bad
resolution produces a file that looks finished.

**A grep for the markers is not the check.** `grep '<<<<<<<'` finds nothing in
any of the three incidents, because the characters it looks for are exactly the
ones the bad resolution deleted. `npm run check:conflict-residue` is the check,
and it runs in `quality` on every push.

---

## 4. Skip-not-halt

**The run never halts for a question.** This rule exists because the operator
answers in batch, on his own schedule, and an executor sitting idle waiting for
an answer burns a session for nothing.

When a card cannot proceed because a decision is genuinely outside the
executor's authority:

1. Fill the card's `question` field with a **structured decision-needed text**:

   ```
   DECISION NEEDED: <one line naming the decision>
   CONTEXT: <what is blocked and why it cannot be self-decided>
   OPTIONS: <the viable paths, with the tradeoff of each>
   RECOMMENDATION: <the one path the executor would take, and why>
   IMPACT IF UNANSWERED: <what stays blocked and for how long>
   ```

   The recommendation is mandatory. A question without one is an unfinished
   question and does not satisfy this rule.

2. Set `blocked_on` to the **person** who owes the answer: `ivan`, `andre`, or
   `client`. Never a team, never a system, never `infra` when a human owes it.
3. Set `status` to `blocked`.
4. Commit the board.
5. **Move to the next eligible card immediately.**

The run ends only when no eligible card remains. At that point the session
writes what is blocked, on whom, and since when, and stops.

---

## 4b. Stopping

**Added 2026-09-01 by ruling R-086, on the owner's instruction. THIS BINDS EVERY
ROLE, not only EXECUTOR.**

**STOPPING IS ONLY CORRECT WHEN WORK CANNOT CONTINUE.**

A terminal that stops to tell the owner something has confused *reporting* with
*blocking*. A finding is not a block. A defect already fixed is not a block. A
pattern noticed in passing is not a block. Each of those goes in the report and
the digest **while the run keeps going**.

| what you have | what to do |
|---|---|
| a doctrine finding, a defect you already fixed, a pattern you noticed | **report and continue** |
| a choice you could make yourself under the card's wide defaults | **make it, record it, continue** |
| something on the R-057 escalation list, or a genuine fork where being wrong is expensive | **`scripts/poc/ask.sh` with your recommendation and what happens on silence**, then claim another card while it waits |
| every eligible card blocked or shipped | **send the Telegram message saying the board is dry**, then stop |

**THE ASK PATH BLOCKS ONE CARD, NOT THE RUN.** That is the whole reason it
exists. A question asked through `ask.sh` parks the card it belongs to, carries a
recommendation and a stated default for silence, and leaves every other eligible
card claimable. A question asked by stopping and printing parks **everything**,
including work that had nothing to do with the question.

**THE DRY-BOARD MESSAGE IS A SIGNAL, NOT A COURTESY.** When nothing is left to
work, the owner needs to know so he can author more. Stopping silently looks
identical to stopping because the terminal broke.

**WHY THIS IS A RULE AND NOT A PREFERENCE.** On 2026-09-01 three pauses in one
session were notes rather than blocks: a doctrine finding about applier guards, a
defect that had already been fixed, and a recommendation the terminal was
authorised to act on. Each cost the rest of the session's momentum and none of
them needed an answer to proceed. Section 4 already said the run never halts for a
question; this section says the same thing about halting for an ANSWER nobody was
waiting on.

---

## 5. Defaults rule

Every card carries a `defaults` field. It is the pre-authorized answer to the
ambiguities that card is expected to hit.

**When a card's `defaults` covers an ambiguity, apply it and log the
application in the card `notes`. Do not ask.** Asking a question the board has
already answered is the halt that this field exists to prevent.

The log line in `notes` names the ambiguity and the default applied, so a
reviewer can see which decisions were taken on authority rather than judgement.

`defaults` never overrides an explicit instruction in the card title or body.
It fills silence, it does not contradict speech. An ambiguity that `defaults`
does not cover, and that the executor cannot self-decide within the card's
stated scope, goes to section 4.

---

## 5b. Gates

**`owner_merge` is retired on this board as of 2026-08-25 by owner ruling
(R-001's sibling, recorded in `decisions/inbox.md` as R-002).**

Cards ship on **green_self_merge discipline**, which is two things and not one:

1. the **green `quality` check**, and
2. the card's **named acceptance spec passing**

A green check with no acceptance run is not a ship. An acceptance run on a red
check is not a ship either.

**Visual and behavioural defect review is not a merge gate.** It belongs to:

- the **CRITIC**, at wave boundaries, and
- an **optional owner batch review** before the client demo

Neither blocks a merge. This is the change: review still happens, it just stops
sitting in front of every card.

**Gates in use on the phase 2 board:**

| Gate | Meaning |
|---|---|
| `green_self_merge` | Every card except P2-14. Executor self-decides and merges on green quality plus passing acceptance. |
| `stakeholder` | P2-14 only. Mihai accepts on production. |

`owner_merge`, `cyan_clear` and `owner_authorizo` are unused here. `owner_merge`
remains a legal value in the validator only because the closed phase 1 board
carries it on nine shipped cards, and a closed board is not rewritten.

**A `blocked_on` naming Ivan is an owner ACTION, not a review.** Applying a DNS
record, rotating a credential, ticking a checklist: those are things only he can
do. Retiring `owner_merge` does not touch them, and P2-12 and P2-13 keep theirs.

**Launch gate conditions still flip to `pass` only on their named proof.** For a
screen condition that proof is now the named spec green in CI **plus EXECUTOR's
own deployed-screen verification**, both recorded as evidence. The proof got
reassigned, it did not get weaker.

---

## 6. Evidence rule

**`status: shipped` requires `evidence` and a passing acceptance line.**

- Every card names its `acceptance` on the card itself. Acceptance is
  **machine-checkable**: a command with an expected exit code, a URL with
  expected content, or a named test file. "Looks right" is not acceptance.
- The acceptance must have been run, and passed, in the PR that ships the card.
- `evidence` carries the proof: `{kind, ref, at}` where `kind` is one of
  `pr`, `journal`, `sha256`, `e2e`, `screenshot`. `ref` must let a stranger
  re-verify without asking anyone: a PR number, a commit sha, a test name plus
  its run, or a named owner confirmation.
- **No acceptance, no ship.** A card whose acceptance line cannot be run yet is
  not shipped. It is `blocked`, per section 4, on whoever can make it runnable.

The validator enforces the shape. It cannot enforce that the command was
actually run. That part is on the executor, and lying about it is the one
failure this project has no recovery path for.

---

## 7. Secrets

- Secrets live at `/Users/ivan/rc-secrets/phase2.env`. **That directory is out
  of bounds for reads.** No terminal opens it, cats it, greps it, sources it,
  or passes it to a script.
- **Reference environment variable names only.** `SUPABASE_SERVICE_ROLE_KEY` is
  a name and may be written anywhere. Its value may not appear in chat, in the
  board, in a commit, in a log, in a test fixture, or in tool output.
- If a value is ever seen, it is treated as leaked: say so immediately, name
  the variable, and the credential is rotated before anything else proceeds.
- `.env.local` may reference names and is gitignored. `.env*` is already in
  `.gitignore`; that line is never removed or narrowed.
- Verify before every commit that no secret is staged. `git diff --cached` is
  read, not assumed.

---

## 8. Migrations

**This section was replaced on 2026-08-25 by an owner ruling recorded in
`decisions/inbox.md` as R-001. The previous doctrine was Ivan-only applies with
no database connection from any terminal. The grant below is temporary, narrow,
and expires at P2-13.**

### 8.1 Authoring, unchanged

- Migrations are **authored as files**: `supabase/migrations/NNNN_name.sql`,
  four-digit zero-padded, monotonically increasing, snake_case name.
- Every migration file added by a PR is **listed in the PR description**, by
  path.
- A migration file is never edited after it has been applied. A correction is a
  new numbered file.

### 8.2 The delegation, and its limit

EXECUTOR is authorized to apply migrations to the RC Supabase project **while it
contains zero real client data**. That condition is the whole basis of the
grant. The moment real data exists the grant is gone, and P2-13 is where that
happens.

### 8.3 The single permitted secret read

- EXECUTOR sources `/Users/ivan/rc-secrets/phase2.env` with
  `set -o allexport`. **This is the only permitted read anywhere under
  `/Users/ivan/rc-secrets`.** Nothing else in that directory is opened, for any
  reason.
- **Values are never echoed, printed, logged, written to a committed file,
  pasted into a board field, or included in tool output.** Variable names may be
  written freely. Values may exist only in process environment.
- A command whose output could contain a value is filtered before it is
  displayed. Prefer `PGPASSWORD` and the other `PG*` environment variables over
  embedding a password in a connection string, because a connection string
  appears in error messages and a `PG*` variable does not.
- Section 7 otherwise stands unchanged.

### 8.4 Deriving the connection, and proving it

The connection is **derived at runtime**, never stored:

- project ref: extracted from `NEXT_PUBLIC_SUPABASE_URL`
- host: the session pooler for eu-west-1
- port: `5432`, the session pooler. `6543` is the transaction pooler and is not
  used for migrations, because a transaction pooler cannot hold a
  multi-statement transaction
- user: `postgres.<ref>`
- password: `SUPABASE_DB_PASSWORD`

**Connectivity is proven with `SELECT 1` before any migration work.** Not
assumed, not inferred from a later success.

**On derivation failure or connection failure: stop.** Write the exact error
into the card `question` and block. Never guess a hostname, never try
credentials that were not derived as above, never proceed on the assumption that
the connection probably works.

### 8.5 The three phases of an apply

Every apply is three phases, and all three are journalled:

1. **Pre-check.** List the pending migration files with **literal counts**: how
   many files are pending, and for the file being applied, what it claims to
   create.
2. **Apply**, inside **one transaction**. A partial apply is never acceptable.
3. **Post-check.** Query and record the table list, `rls_enabled` per table, the
   policy count per table, and the enum list.

**The full journal of all three phases goes into the card `evidence.ref`**, so a
stranger can read what was actually applied without database access.

### 8.6 The destructive-statement stop

**Widened by ruling R-031 on 2026-08-27.** The line is now drawn where it was
always meant to be: at operations that DESTROY ROWS.

**A migration containing `DROP TABLE`, `TRUNCATE` or `DELETE` is never
auto-applied.** No exceptions, no judgement call, no "it is obviously safe
here".

That card goes `blocked_on: ivan` with **the offending statement quoted in
`question`**. Ivan applies it himself or rules otherwise.

#### The one exception, added 2026-08-28 by ruling R-047: a script that proves its own outcome

**The sentence above is unchanged and still binds every migration, and every
script that does not have the property below.** Read that first. What follows is
narrow, it is attached to a property of the file rather than to a person, a card
or a session, and it does not touch migrations at all.

**A terminal may EXECUTE a DELETE-class SCRIPT against the phase 2 database when,
and only when, all four of these hold:**

1. the script runs inside an **explicit transaction**,
2. it **evaluates its own pass and fail conditions in SQL**, inside that
   transaction, after the mutations and before the commit,
3. it **commits only on all-pass**, and otherwise **rolls back and exits
   non-zero**, and
4. **the terminal never chooses.** It does not read a grid and decide, it does
   not judge whether a count looks close enough, and it does not continue past a
   deviation because the deviation is explainable. The script decides. The
   terminal reports what the script decided and nothing else.

**NO SCRIPT WITHOUT EMBEDDED ASSERTIONS QUALIFIES.** A script that prints grids
for a human to read has exactly the shape this section was written to stop,
whoever is running it and however obviously safe it looks. For that class, which
is every script in this repository except `scripts/reset-test-data.sql`, the "no
exceptions, no judgement call" wording above applies verbatim and there is
nothing here to argue with.

**MIGRATIONS ARE NOT IN SCOPE.** A migration containing `DROP TABLE`, `TRUNCATE`
or `DELETE` is still never auto-applied, full stop. Migrations have their own
path, the three-phase apply in 8.5, and this exception does not reach it.

**WHY THE PROPERTY AND NOT THE PERSON.** This section exists because the failure
mode of a destructive run is a human being told in advance what the numbers
should be, at the end of a long transaction, deciding that what they are seeing
is close enough. Trusting the operator more does not reduce that. Taking the
decision away from whoever is at the keyboard removes it, which is what
conditions 2, 3 and 4 do. A script that cannot commit a wrong outcome is safer
in a terminal's hands than a script that can is in anyone's.

**THE GRANT DIES THREE WAYS, and the first that happens ends it:**

- **P2-13 revokes it**, with every other terminal credential grant, when section
  8 reverts to Ivan-only applies with no connection from any terminal. It needs
  no separate line in the checklist; it dies with the section.
- **First real client data ends it**, whether or not P2-13 has run. An assertion
  proves a script did what it meant to. It never proves that what it meant to do
  was right about somebody's real data.
- **Phase 2 database only.** No other project and no other environment.

**The full ruling, including its bounded conflict with R-044, is R-047 in
`decisions/inbox.md`.**

#### The second exception, added 2026-08-31 by ruling R-082: a migration applied under assertion

**The exception above is about SCRIPTS and says in terms that MIGRATIONS ARE NOT
IN SCOPE. This one is about migrations, and it is the only thing that reaches
them.** Read the absolute exclusion below before reading the grant.

**WHY IT WAS NEEDED.** Thirteen migrations were merged and unapplied, and no
ruling let any terminal apply them. R-047 excluded migrations by name. R-049,
R-056 and R-059 widened the SELF-MERGE grant and touched none of this, because
merging a migration file changes one text file and changes nothing in any
database. The apply was reachable by nobody.

**A TERMINAL MAY APPLY MERGED MIGRATIONS TO PRODUCTION ONLY THROUGH AN APPLIER
THAT:**

1. runs the whole batch inside **one transaction**,
2. records the **pending register** and the **applied ledger** before and after,
3. evaluates its assertions **in SQL**, inside that transaction, after the
   mutations and before the commit,
4. **commits only on all-pass**, and otherwise rolls back whole and exits
   non-zero naming every failure, and
5. **never chooses.** The script decides; the terminal reports what the script
   decided and nothing else.

`scripts/apply-pending-migrations.mjs` is that applier. A hand-run `psql` against
production, or any file that prints a grid for a human to read, is not covered by
this and never was.

**THE ABSOLUTE EXCLUSION IS UNCHANGED AND SITS ABOVE THIS GRANT.** `DROP TABLE`,
`TRUNCATE` and `DELETE` are never auto-applied. The applier refuses with
**nothing executed**, quotes the statement, and the card goes `blocked_on: ivan`.

**`DROP FUNCTION` IS PERMITTED UNDER ONE ADDITIONAL ASSERTION**, evaluated BEFORE
the drop executes: the target has **zero dependent objects**, and no deployed
route names it outside the phase 3 probe. Any dependent rolls the whole batch
back. The exact statement is printed to stdout whatever the outcome, so it can be
quoted to the owner from the run output alone. This is the same class 8.6 already
permits, and the three conditions above the fold still apply: quoted verbatim,
parsed with `pgsql-parser` first, journalled.

**THE ONE BOUNDED DEVIATION FROM "ONE TRANSACTION", AND IT IS THE SERVER'S RULE
RATHER THAN A PREFERENCE.** PostgreSQL refuses to let a newly added enum label be
USED in the transaction that added it. The applier therefore commits
`ALTER TYPE ... ADD VALUE` statements in a pre-phase of their own and **refuses to
put anything else in it**: a file joins the pre-phase only if it contains an enum
addition, may contain nothing but `AlterEnumStmt` and `SelectStmt`, and every
addition must carry `IF NOT EXISTS`. What can survive a rollback of the main batch
is therefore exactly one thing, an unused idempotent enum label, which references
nothing and is re-added as a no-op. That is not the partial apply 8.5 forbids, and
the applier says so in its own header.

**REVOKED BY P2-13**, with every other terminal grant, per 8.7.

#### What is NOT in the forbidden set

`ALTER TABLE ... DROP CONSTRAINT` is **permitted** and may be auto-applied. It
removes a CHECK or a key and no row, and it is the only way a constraint can be
relaxed: a constraint is replaced, never edited. A rule that forbade it would
make a wrong constraint permanent, which is how a schema defect outlives the
migration that introduced it.

Three conditions, all of them, every time:

1. **The statement is quoted verbatim in the report**, exactly as it appears in
   the file, so a reader sees what ran rather than a description of it.
2. **The file is parsed with `pgsql-parser` before it goes near the database**,
   and the parse is reported: statement count, the kind of each statement, and
   the explicit finding that no forbidden statement is present. The parser is
   the real PostgreSQL grammar, so a parse here is the parse the server does.
3. **The apply is journalled in `docs/migrations/APPLY-LOG.md`** like any other,
   with the near-miss named in the destructive-statements line rather than
   omitted from it.

The same applies to any other operation that changes a schema object without
removing a row: `DROP INDEX`, `DROP POLICY`, `DROP TRIGGER`, `DROP DEFAULT`. If
a statement removes rows, it stops. If it removes a rule about rows, it is
declared, parsed, quoted and applied.

**The test to apply when a new case appears:** does executing this statement
reduce the number of rows in any table? If yes, it stops and goes to Ivan. If
no, it is in scope, under the three conditions above. When the answer is
genuinely unclear, it stops - the cost of stopping is a delay and the cost of
being wrong is data.

### 8.7 Expiry at P2-13

**This grant expires at P2-13.** The rotation checklist authored by that card
must include, as checkable items:

- **revoking this read permission in `CLAUDE.md`**, reverting section 8 to
  Ivan-only applies with no database connection from any terminal
- **revoking the self-merge grant in section 3.1**, added by R-049, extended by
  R-056 and widened to every path by R-059. It is a terminal grant like any
  other and it dies here with the rest. Deleting section
  3.1 returns every PR to Ivan.
- **rotating `SUPABASE_DB_PASSWORD`**
- **rotating `SUPABASE_SERVICE_ROLE_KEY`**
- **confirming no terminal-held copies remain** of either

P2-13 is not complete until section 8 has been reverted. A grant that outlives
the condition it was granted under is how a temporary permission becomes a
permanent one.

### 8.8 Every production write is journalled, and there are two journals

**Added 2026-08-28 by ruling R-055.**

There are now two ways to write to the production database, so there are two
logs, and **a write with no row in one of them is a violation**:

| the write | the journal |
|---|---|
| a migration, applied per 8.5 | `docs/migrations/APPLY-LOG.md` |
| anything else, including an assertion-bearing script run under 8.6 | `docs/PRODUCTION-WRITES.md` |

**The row goes in BEFORE the PR that performs the write is merged.** Not after,
not in a follow-up card.

Each row in `docs/PRODUCTION-WRITES.md` carries **date, actor, script path,
script sha256, assertion pass count, rows affected, and the report path.** The
sha256 is not optional and it is not decoration: a file name identifies a path,
not a version, and `scripts/reset-test-data.sql` meant two materially different
files eleven hours apart on 2026-08-28.

**Why this rule exists at all.** Until 8.6's exception there was one write path
and one log. The exception created a second path, and its first run was recorded
in a report and a board field and nowhere a reader looking for "what has been
done to production" would think to look. This repository has already paid once
for a production run whose record was not committed: it was ratified in chat, and
two later dispatches were written against a record that did not exist.

---

## 9. Learnings

**Before reporting any card done, append every ERROR/SOLUTION pair discovered
while working it to `docs/LEARNINGS.md`.**

Format, one entry per defect:

```
### <short title>
**Tag:** frontend | backend | data | infra | auth | ci
**ERROR:** what broke, concretely, including what it looked like on screen or
in the output.
**SOLUTION:** what fixed it, and the rule that prevents the next instance.
```

A card that hit no defects appends nothing and says so. A card that hit three
appends three. This file is the reason the same bug is not paid for twice.

---

## 9b. Reports are committed artefacts

**Added 2026-08-27 by card AUT-1. This binds EVERY role, not only EXECUTOR.**

**A terminal's final act is to commit its full report to
`docs/reports/<YYYY-MM-DD>-<role>-<slug>.md`.** The file is the original. What
is printed to the terminal is a copy of it.

The order is not decoration. **Commit first, then print.** A session that prints
a report and then fails to commit it has produced nothing that survives the
window closing, and every downstream role in the chain reads the previous role's
report as its input.

- **Naming:** `YYYY-MM-DD-<role>-<slug>.md`, lowercase, hyphens. The date is the
  run date in UTC. `<role>` is `author`, `executor`, `critic`, `poc-builder`,
  `triage` or `owner`. **`author` was missing from this list until 2026-08-28**
  and section 1 has named the role since the file was written, so the omission
  was a defect in this list and not a statement that AUTHOR files no reports.
  `owner` is here because a report can describe work no terminal performed:
  `docs/reports/2026-08-28-owner-p2-15-reset-run.md` records a production run
  Ivan executed by hand, and filing it under a terminal's role would have made
  the record say something false about who ran it.
  The slug names the work, not the outcome.
- **Content is the full report, verbatim**, the same text the terminal prints.
  Not a summary of it, not a link to it, not "see the PR".
- **No credential values, ever.** Section 7 applies here exactly as everywhere
  else: variable names only.
- **It rides in a PR like everything else.** Never pushed to `main`. Usually the
  last commit of the session's last PR.
- `docs/reports/README.md` holds the shape a report takes and is the place to
  change it.

**Why this is a rule and not a habit.** A report that exists only in a terminal
is a report the next session cannot read. The chain is built on each role acting
on the previous role's output; if the only copy of that output was printed to a
scrollback nobody kept, the chain has a hole exactly where its input should be.
That is also why the two pre-existing files in `docs/reports/` are not renamed:
a link that worked yesterday still works, and the README says which convention
each file follows.

---

## 10. Failure ceiling

After **three distinct failed fix attempts** on the same card, stop working it.
Write the failure state and everything tried into `notes`, set `status: halted`,
set `blocked_on` to the person who can break the tie, fill `question` per
section 4, and move to the next eligible card.

Three attempts means three different approaches, not the same approach three
times.

---

## 11. Language and style

- **UI language is Romanian**, with proper diacritics, on every screen, in every
  label, error, empty state and toast. No English string reaches the UI.
- **Desktop-first.** Responsive and mobile layouts are out of scope unless a
  card says otherwise.
- **Plain hyphens only.** Never an em dash, never an en dash, anywhere: not in
  code, not in comments, not in docs, not in the board JSON, not in commit
  messages, not in PR descriptions, not in chat output.
- Commit messages are lowercase-prefixed by card id: `P2-04: <what changed>`.
  Body explains why, and names the acceptance command and its result.
- Code identifiers, table names and columns are `snake_case` in SQL,
  `camelCase` in TypeScript.

---

## 12. Rehydrate

A fresh session needs exactly two lines:

```
You are <ROLE>. Boot per CLAUDE.md.
Work the board.
```

Everything else is in this file and in the board. If a session needs a third
line to function, that is a defect in this file, and fixing it is a card.

---

## 13. POC: unattended scheduled runs

Four scheduled runs a day work this board with no human in the terminal, at
22:00, 01:00, 04:00 and 07:00 local. The harness is `scripts/poc/run.sh`; the
design of record is `docs/poc/DESIGN.md`; the authorising rulings are R-005 and
R-006.

These rules bind the headless run. They are restated here, rather than left in
`docs/poc/DESIGN.md`, so that a session which never opens that file still obeys
them. Where the two disagree, this file wins.

**A headless run boots as EXECUTOR.** It is not a fifth role and it holds no
authority the interactive EXECUTOR does not hold. Sections 1 through 12 apply to
it without exception or softening.

**At most 2 cards per run.** The third eligible card waits for the next run.

**Hard cap of 45 minutes of wall clock per run.** The cap is enforced by the
harness, not by the session's own sense of time. When it fires the run stops
where it is, reports that it was cut off, and merges nothing that is
half-finished.

**Wall clock means the clock, and the harness proves which one it read.** A cap
is a deadline the harness compares `date +%s` against, never a countdown it
sleeps through: `sleep` on macOS does not advance while the machine is
suspended, so an overnight countdown measures awake time. The run reports the
elapsed seconds beside the cap on every run, and a run whose elapsed exceeds its
cap says `capped yes` whether or not the watchdog managed to stop it. When those
two disagree the run names it a harness defect in its own log, because a cap
that silently did not fire is the failure that hides every other one.

**TRIAGE has its own cap of 30 minutes**, raised from 15 on 2026-08-28 after a
TRIAGE that had already opened its rulings PR was killed 27 seconds later and
lost the report explaining it.

**When every unblocked card is shipped, the run invokes CRITIC** against the
acceptance lines instead of idling. A dry board means the next useful action is
review, not a fifth pass over finished work.

**A card question that `defaults` does not answer writes an escalation and the
run moves to the next card.** This is section 4 and section 5 applied to an
unattended run: apply the default and log it when one covers the ambiguity;
otherwise write the structured decision-needed text with its mandatory
recommendation, append the escalation to `docs/poc/state.json` so the digest
carries it to Telegram, and take the next eligible card. The run never waits for
an answer.

**A DELETE-class migration is never applied by a headless run.** Section 8.6
already forbids auto-applying `DROP TABLE`, `TRUNCATE` and `DELETE` with a human
watching. Unattended, there is no additional care to apply and no judgement call
to make: the card blocks on Ivan with the offending statement quoted, and the
run moves on.

**P2-08 and P2-09 are untouched while P2-08 is parked on `andre`.** P2-08 waits
on a third party and P2-09 depends on it. A headless run must not settle the
webhook contract on Andre's behalf, and must not build P2-09 against a contract
nobody has agreed. Both are skipped by id until a ruling clears the
`blocked_on`.

**A run never starts if `/Users/ivan/rc-poc-logs/run.lock` exists, unless that
lock is stale.** It logs the refusal and exits 0. Two runs sharing the run
worktree would corrupt each other's work.

The refusal is only correct while the holder is inside the budget it declared.
The lock records the holder's own `cap_seconds`, and a lock older than that plus
a fifteen minute margin is wreckage rather than a running peer: the next run
reclaims it, says so loudly in its log, and takes it. Amended 2026-08-28, after
run `20260827-220052` held the lock for nine hours and the 01:00, 04:00 and
07:00 windows silently did not happen.

Reclaiming stops the holder before taking the lock, process group included, so
the model process the dead run started does not carry on unsupervised. **It
checks identity before it signals anything**: a pid recorded hours ago may since
have been recycled, and killing whatever now answers to that number would be a
worse fault than the one being repaired. A pid that is alive but is not this
harness is left alone and the lock is reclaimed around it.

**POC state lives in `docs/poc/state.json`, never on the board.** The board
carries the product's work. The harness's own bookkeeping is not the product's
work, and a run that quietly edits a board file it has no card for is the exact
write the board rules exist to prevent.

**A card is claimed before it is worked, and a claim is honoured for 6 hours.**
The harness and a human terminal cannot see each other. On 2026-08-27 EXECUTOR
worked P2-09 by hand in `/Users/ivan/rc-inventory` while the scheduled harness
picked up the same card in its own worktree, four times a day, with neither able
to tell. The lease is how they agree without talking.

- Claims live in `docs/poc/state.json` under `claims`, as
  `{"<card-id>": {"claimed_by": "<actor>", "claimed_at": "<ISO 8601>"}}`.
- **A run never takes a card claimed by another actor inside the window**, even
  if it is the only eligible card. It logs the skip, escalates it, and moves on.
  Skipping is correct; skipping quietly is not.
- **A claim expires after 6 hours** and expired claims are dropped whenever the
  file is written. A lease that outlived the terminal that took it would park a
  card forever, which is worse than the collision it prevents.
- A human terminal claims and releases with `scripts/poc/claim.sh`:

  ```
  scripts/poc/claim.sh claim   P2-09 executor
  scripts/poc/claim.sh release P2-09 executor
  scripts/poc/claim.sh check   P2-09
  scripts/poc/claim.sh list
  ```

  `claim` and `release` land through a PR like every other change to that file.
  `check` and `list` write nothing. `check` exits 3 when the card is claimed.
- **Claim before you start, not after.** A claim only protects a card once it is
  on `main`, so a claim taken after the work begins protects nothing.

**A run that finds an eligible card and ships nothing writes an escalation**
naming the card and the reason. Three runs on 2026-08-26 and 2026-08-27 each
named P2-09 as next eligible and each reported nothing, while in fact building a
migration, a seven case spec and a draft PR. Silence about an eligible card is a
defect, never a normal outcome, and the four reasons are distinguished: work left
on a branch, the wall clock cap, a non-zero executor exit, and an executor that
finished clean with nothing to show.

**A run reports what it did, not only what landed.** Work on a card branch is
reported as such. A run that wrote code must never look identical to a run that
idled.

**Telegram is a report and a narrow answer channel, not a command line.** The
inbox reader accepts messages only from `TELEGRAM_OWNER_ID`, and only in the two
exact forms `R <card-id> default` and `R <card-id>: <text>`. Every other message
is logged and never acted on, whatever it says. Free text in a chat group is not
an instruction, because group membership is not authentication. While
`TELEGRAM_OWNER_ID` is unset the reader accepts nothing at all.

---

## 14. Asking Ivan, and blocking on the answer. Added 2026-09-01 by ASK-01.

**A role facing an item on the escalation list calls `scripts/poc/ask.sh`.
Printing a question to a terminal and stopping is a DEFECT, not an escalation.**

That is what this section exists to make unrepeatable. A foreground EXECUTOR hit
a decision it was not allowed to make, wrote the question to a terminal nobody
was watching, and stopped. The question would have taken ten seconds to answer.
Nothing was red, nothing was blocked on the board, nothing reached Telegram, and
the run was simply gone. A question nobody can see is worse than no question,
because it consumes a run and looks like a hang.

**The escalation list is unchanged and is still the closed ten items in section
6 of `docs/DOCTRINE-TRIAGE.md`, under R-057.** This section changes HOW an
escalation is delivered, and changes nothing about WHAT gets escalated.
Everything not on that list, the terminal still decides and records.

### How

```
scripts/poc/ask.sh <card-id> \
  --question       "one line, plain language, no jargon" \
  --recommendation "one line, what you would do" \
  --if-silent      "what happens if he says nothing" \
  [--deadline-seconds 21600] [--role executor] [--run-id <id>]
```

**All four payload fields are required and the script refuses without them.** A
question with no recommendation hands the decision back with no work done on it,
which section 4 has refused since it was written. A question that does not say
what silence costs cannot be prioritised by the person reading it.

It sends ONE message, in the plain register of section 13's digest: no card ids,
no pull request numbers, no CI, no claim mechanics. The one exempt line is a
copy-paste reply line, printed only when more than one question is outstanding
and `go` on its own could not be routed.

### The exit codes ARE the interface

| exit | meaning | what the caller does |
|---|---|---|
| 0 | `go` | take the recommendation |
| 10 | `stop` | halt the card |
| 11 | `instruction` | do what stdout says, from line 2, verbatim |
| 12 | `expired` | the question is on the card, blocked on Ivan, and committed. **Move to another card.** |
| 2 | usage | the payload is incomplete. Fix it and ask again. |
| 3 | infrastructure | nothing was sent, so nothing may be assumed answered |

**Exit 0 means `go` and nothing else means `go`.** The codes are arranged so the
LAZY reading is the SAFE one: a caller that writes `if ask.sh ...; then take the
recommendation; fi` takes it only on a real approval.

**EXIT 12 IS DELIBERATELY NOT 0.** "Exits clean" means it terminates promptly
with the board committed and the harness free to move on. It does not mean it
reports success, because a run that cannot tell an expiry from an approval is
the exact failure the deadline exists to prevent.

### Silence is not consent

**On expiry the recommendation is NOT taken.** An owner who never saw the
message and an owner who read it and approved it produce the same empty inbox,
and a channel that cannot tell them apart must choose the outcome that is
recoverable. The question goes onto the card as `blocked_on: ivan`, with the
full payload in the structured decision-needed text of section 4, `status` set
to `blocked`, the validator run, and the board COMMITTED on the current branch.
It is not pushed: the caller's own pull request carries it.

The default deadline is **six hours**.

### The deadline is a wall clock, never an elapsed sleep

`nanosleep` does not advance while the machine is suspended. On 2026-08-27 that
let a run outrun a 2700 second cap by 28600 seconds, with the guard sitting
inside a `sleep`. Every wait in `ask.sh` compares `date +%s` against a deadline
computed once, and `scripts/poc/test-ask-digest.sh` reproduces a suspend and
requires the sleep-counter version to FAIL on the same input.

**This binds any future wait added anywhere in `scripts/poc/`.** A cap, a
timeout or a deadline expressed as a countdown is a defect on this machine,
which sleeps every night.

### Who may answer

**`TELEGRAM_OWNER_ID` only.** Identity is checked before the text is read, every
other sender is logged and ignored whatever the message says, and an unset owner
id accepts nothing at all. That is section 13's rule and this channel does not
widen it by one sender.

Three forms are accepted: `go` or `default` takes the recommendation, `no` or
`stop` halts the card, and anything else is passed to the role verbatim as an
instruction. A Telegram reply to the question's own message routes exactly; with
two or more questions outstanding and no reply and no card id, **nothing is
routed**, because a channel that guesses which decision was approved is worse
than one that asks again.

### WHERE THIS DOES NOT APPLY: the unattended scheduled run

**An unattended run under section 13 does NOT block on a question. Skip-not-halt
still governs there, unchanged, and `run.sh` says so in its own words: write the
structured decision-needed text, set `blocked_on`, commit the board, append the
escalation, and take the next eligible card.**

This is stated because the two rules would otherwise read as a contradiction, and
the wrong resolution is expensive. A scheduled run has a 45 minute wall clock cap
that the harness enforces by killing it. A six hour `ask.sh` inside that cap is
killed mid-wait, and a killed wait leaves an open question on the spool with
nothing written to the card, which is a worse outcome than the escalation
skip-not-halt would have produced.

**`ask.sh` is for a role that can afford to wait**: a foreground terminal, or an
unattended step whose budget genuinely exceeds the deadline it sets. That is the
case this section was written for, because that is the case that had no channel:
the escalation path already existed for a run that moves on, and did not exist
for a role that cannot.

A role in doubt about which it is applies skip-not-halt. Its failure mode is a
card that waits for the next digest; the other one loses a whole run.

### One process reads Telegram, and it is the responder

`getUpdates` is destructive: acknowledging an offset deletes every update below
it, so two pollers do not share a queue, they race for it and the loser never
sees the message. `ask.sh` therefore does NOT poll Telegram. The 60 second
responder already reads every message; `scripts/poc/chat-classify.mjs` writes
answers to a spool under `/Users/ivan/rc-poc-logs/asks/` and `ask.sh` reads that.
**Anything that adds a second reader of that bot breaks this and breaks the
responder with it.**

---

## 15. The scheduled digest. Added 2026-09-01 by DIGEST-01.

**A third launchd agent, `com.ai.rc-poc-digest`, sends the plain digest at 08:00
and 19:00 local.** It renders from the `plain` field only, under the same rules
as section 2's `plain` contract and AUT-5: what got done, what needs you, what is
waiting on other people, what has not started, progress. No card ids except in
the copy-paste reply line, no pull request numbers, no CI, no claim mechanics.

**It is silent unless one of four things is true**: a card shipped, a card
became blocked, a question is outstanding, or a run failed. A digest that arrives
every day saying the same thing gets skimmed, then ignored, and the one that
mattered is ignored with it. Silence here is a feature and removing it is a
change to this section, not an improvement to the digest.

**Staleness is decided by CONTENT, never by date.** Two digests on the same day
with different content are two different digests.

**A question outstanding from `ask.sh` LEADS the digest and repeats in every
subsequent one until it is answered.** That is deliberate nagging. An unanswered
question is the one thing in this system that must never go quiet, because a
role is stopped behind it.

**`scripts/poc/install.sh` must be re-run after any change to `run.sh`,
`responder.sh` or `digest.sh`.** Those three are deployed copies under
`/Users/ivan/rc-poc-bin`; the repository is the source of truth and the deployed
copy is never edited in place. The `.mjs` files are read from a worktree at
`origin/main` and need no reinstall.
