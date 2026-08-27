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
- **No self-invented scope.** The PR does what the card says and nothing else.
  A defect noticed in passing becomes a new card or a `docs/LEARNINGS.md` entry,
  not a quiet extra commit. Refactors that were not asked for are scope.
- The PR description names the card id, the acceptance line, the command run to
  prove it, and every migration file added.

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
- **rotating `SUPABASE_DB_PASSWORD`**
- **rotating `SUPABASE_SERVICE_ROLE_KEY`**
- **confirming no terminal-held copies remain** of either

P2-13 is not complete until section 8 has been reverted. A grant that outlives
the condition it was granted under is how a temporary permission becomes a
permanent one.

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
  run date in UTC. `<role>` is `executor`, `critic`, `poc-builder` or `triage`.
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

**A run never starts if `/Users/ivan/rc-poc-logs/run.lock` exists.** It logs the
refusal and exits 0. Two runs sharing the run worktree would corrupt each
other's work.

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
