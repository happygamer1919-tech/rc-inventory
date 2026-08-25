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

- Migrations are **authored as files**: `supabase/migrations/NNNN_name.sql`,
  four-digit zero-padded, monotonically increasing, snake_case name.
- Every migration file added by a PR is **listed in the PR description**, by
  path.
- **Migrations are applied by Ivan only**, by hand, in the Supabase SQL editor.
  No terminal in this repo ever connects to a database. There is no
  `supabase db push`, no `psql`, no connection string, ever.
- A card whose acceptance requires an **applied** migration is set
  `blocked_on: ivan`, `status: blocked`, with the apply request written into
  `question` in the section 4 format, naming the exact file paths to run and
  the order to run them in.
- A migration file is never edited after Ivan has applied it. A correction is a
  new numbered file.

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
