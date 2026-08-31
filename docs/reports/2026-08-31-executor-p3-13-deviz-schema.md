# EXECUTOR: P3-13, the deviz schema. Two tables, three triggers, and a price that stops following the catalogue.

**Date:** 2026-08-31 (UTC), run `20260831-010005`
**Role:** EXECUTOR, unattended scheduled run
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, detached at `origin/main` `7c38087`
**Cards touched:** P3-13 (shipped)
**Pull requests:** #128 (claim), #129 (P3-13, and this report rides in it)
**Migration files added:** `supabase/migrations/0025_deviz.sql`

---

## 0. Boot

| board | shipped | in_flight | todo | blocked | halted | launch gate |
|---|---|---|---|---|---|---|
| `rc-board-phase2.json` | 36 | 1 | 10 | 1 | 0 | 6/9 |
| `rc-board-phase3.json` | 11 | 0 | 17 | 3 | 0 | 0/9 |

Next eligible card at boot: **P3-13**, which is what the previous run's handoff
named and what the phase 3 eligibility check returns.

**Two boards exist and the harness only reads one of them.** `scripts/poc/run.sh`
has `POC_BOARD=docs/board/rc-board-phase2.json` hardcoded, so its own idea of the
next card was `AUT-10` and it wrote a claim on `AUT-10` into
`docs/poc/state.json` at the end of the 22:00 run, while the session that ran
inside it actually worked P3-11 off the phase 3 board. That is a live defect: the
claim lease is protecting a card nobody is working and is silent about the card
somebody is. Named in section 6.

---

## 1. P3-13, shipped in PR #129

> Schema: `public.devize` and `public.deviz_lines`, versioned, with the
> five-state pipeline and the unit price frozen on the line at the moment it is
> quoted.

Claimed as `executor` through **PR #128** before the first line was written, per
section 13.

### What landed

- **`supabase/migrations/0025_deviz.sql`.** The `public.deviz_status` enum, both
  tables, the RLS shape copied from `0016_projects.sql` rather than invented, the
  two unique constraints, two indexes, and five triggers.
- **`scripts/poc-free/local-db/assertions/0025_deviz.sql`**, 364 lines, which is
  the migration journal the acceptance asks for.
- **`docs/migrations/APPLY-LOG.md`**, one line added to the pending register.
  Thirteen files now wait on P3-27.
- **One learning** in `docs/LEARNINGS.md`.

### The three triggers, because that is where the card's argument lives

**`devize_require_draft_to_edit` and `deviz_lines_require_draft` are the no-edit
rule, and the card is explicit that it is a trigger and not a check in the
interface.** A client who received an estimate holds a copy of it, and a rule
that lives only in a form handler is a rule the next form handler does not have.
Past draft, only `status` and `approved_at` may change on a deviz. Everything the
client would have read on the page they were sent is frozen.

**`devize_sync_approved_at`** sets `approved_at` when the status becomes
`accepted` and clears it when it leaves, so it cannot depend on which of the two
screens that write the status remembered to.

### Two places where the build is wider than the card text

Both are deliberate and both are in the card `notes` as well as here.

**One. The card names "a before-update trigger on `deviz_lines`" and the trigger
fires on INSERT as well.** Adding a line to a sent deviz changes what was quoted
exactly as much as editing one does. A trigger catching only UPDATE would leave
the larger half of the hole open, and the rule the card states is the no-edit
rule, not the no-update rule.

**DELETE is deliberately NOT covered, and that is the same reasoning pointing the
other way.** Neither table has a delete policy, so no authenticated role can
reach a delete at all. The only delete that can touch a line is the cascade from
a `devize` row that RLS already forbids, and a trigger there would convert that
cascade into an error rather than a refusal.

**Two. `approved_at` is held by the database.** The card states the rule, "set
when status becomes accepted, and is null otherwise", and the card's own sentence
about the no-edit rule is that a rule the database does not hold is a rule the
next screen forgets.

### The acceptance, all three parts

1. `ls supabase/migrations/*_deviz.sql && npx tsc --noEmit` - **exit 0**, run
   locally on the branch.
2. `npm run check:migrations` - **runs in `quality` on the head sha.** It applies
   every migration unmodified to a throwaway `postgres:16` and then runs the new
   assertion file.
3. **The migration journal is that assertion file.** It raises rather than
   prints, so every clause is proven by the pull request instead of transcribed
   off a grid.

**`npm run check:migrations` COULD NOT BE RUN LOCALLY AND THAT IS STATED RATHER
THAN GLOSSED.** `docker info` fails in the scheduled run's environment. The check
is a hard step of the `quality` job, so it ran on the head sha and the merge
rests on it. What a local run would have added is a faster loop, not a different
verdict.

### What the behavioural half proves

Inside a transaction it rolls back:

- **The catalogue price moves to 999 and the quoted line stays at 100.** This is
  the single most important behaviour in the card, and it is asserted rather than
  argued in a comment.
- A draft is freely editable. A `sent` deviz refuses a line edit, refuses a line
  ADDED to it, refuses a margin change, refuses a notes change and refuses a
  version change, and still lets its status move, or the pipeline could not run.
- `approved_at` set on accept, cleared on the way out.
- Two versions on one project is the model; the same version twice is a unique
  violation; the same number on a different project is fine.
- **The current deviz and the current ACCEPTED deviz resolve to different rows**,
  which is exactly why the card asks for two queries and not one.
- A quoted product cannot be deleted, and neither can a project carrying a deviz.

### The structural half

Both tables present; `rowsecurity` true on both; exactly three policies,
`INSERT SELECT UPDATE`, and **no delete policy** on either; `anon` holding
nothing; `deviz_status` carrying exactly `draft, sent, accepted, rejected,
expired` **in that declaration order**, because the card says the order is the
pipeline; the two unique indexes **matched by their columns rather than their
names**, so a rename cannot quietly satisfy the assertion; the three foreign keys
checked by `confdeltype` so the ON DELETE action is proven and not just the edge;
the MDL check; the `quantity > 0` check; **no `unit` column on the line**, which
is a requirement and not an omission; and an `updated_at` trigger on each table.

---

## 2. The migration was parsed before it went near anything

`pgsql-parser`, the real PostgreSQL grammar: **42 statements**, and the breakdown
is 2 `TransactionStmt`, 1 `CreateEnumStmt`, 2 `CreateStmt`, 9 `CommentStmt`,
2 `IndexStmt`, 5 `CreateTrigStmt`, 3 `CreateFunctionStmt`, 4 `GrantStmt`,
2 `AlterTableStmt`, 6 `CreatePolicyStmt`, 6 `SelectStmt`.

**No `DROP TABLE`, no `TRUNCATE`, no `DELETE`.** Nothing in this file is
destructive and nothing in it was applied to production. It joins the pending
register against P3-27, per R-062.

---

## 3. Two defects found in the tree, neither of them mine to fix

### 3a. PR #126 is green, mergeable and BEHIND, and it cannot merge itself

TRIAGE's rulings pull request carries R-063 to R-066, the phase 3 gate audit, and
new cards P3-28 and BOARD-02. `quality` is **green on its head sha**
`361d40e`. It is `MERGEABLE` but `BEHIND`, and this repository's branch
protection requires an up-to-date branch, so the merge is refused with "the head
branch is not up to date with the base branch".

**This run attempted that merge and was refused.** The attempt is recorded rather
than omitted: it touches `docs/board/rc-board-phase3.json`, which is the file this
card had to edit, and merging it first would have avoided manufacturing a conflict
for it. Updating its branch is a push to `triage/20260830-220004`, which is
TRIAGE's branch and not this card's scope, so it was left alone.

**Somebody has to update that branch and re-run `quality` on the new sha.** Until
then four rulings and two authored cards sit outside `main`, and every board edit
that lands ahead of it makes its eventual merge harder.

### 3b. The harness reads the phase 2 board and the work is on the phase 3 board

`POC_BOARD=docs/board/rc-board-phase2.json` in `scripts/poc/run.sh`, line 23. The
consequences are visible in `docs/poc/state.json` right now: a claim on `AUT-10`
by `harness`, taken at the end of a run that worked P3-11. The eligible-card line
in the harness log, the `$CLAIM_SKIPPED` set it interpolates into the prompt, and
the claim it writes at the end are all computed against a board nobody is
currently working.

**Nothing was lost to it today**, because the session reads both boards at boot
and the previous run's handoff named P3-13 explicitly. It is still a lease that
protects the wrong card, and the lease exists because a human terminal and the
harness collided once already.

---

## 4. R-064 was followed before it merged, and that is a choice worth naming

`as_of` and `last_checkpoint` on this board are **read from the system clock**, so
they move **backwards by about nine hours** against the previous value.

The last run measured that drift, said it needed a card, and followed the existing
forward-running convention anyway to keep the sequence monotonic. **R-064
overturned that specific choice**, credits the finding, and says in terms that the
backwards jump is the ruling taking effect and is not to be corrected forward.

**R-064 is in PR #126 and was not on `main` when this was written.** It was
followed anyway, because it settles the exact question this edit would otherwise
have had to decide for itself, it decides it the other way from the last run, and
writing a timestamp nobody read from a clock in full knowledge of a ruling that
forbids it would be the worse of the two.

---

## 5. Learnings appended

**One**, appended to `docs/LEARNINGS.md`: in a `before insert or update` plpgsql
trigger, `if tg_op = 'INSERT' or old.status is distinct from '...'` looks guarded
and is not. plpgsql raises `record "old" is not assigned yet` the moment the field
is read on an INSERT, and SQL does not promise to short-circuit an `OR` to stop it
happening. The same hazard hides in a `case when tg_op = 'INSERT' then new.x else
old.x end`. Both were written that way first, in this file, and both were
rewritten to read `OLD` only inside an explicit `tg_op = 'UPDATE'` branch. Caught
by reading, before the file reached the parser.

---

## 6. Escalations

**One**, appended to `docs/poc/state.json`: the harness reads
`docs/board/rc-board-phase2.json` while the work is on
`docs/board/rc-board-phase3.json`, so its claim lease protects the wrong card.
Section 3b has the detail.

**A second thing that is not an escalation and should not be lost:** PR #126 is
green and stuck behind branch protection, per section 3a. It needs its branch
updated, which is TRIAGE's push to make.

---

## 7. What the next run picks up first

1. **PR #126.** Update `triage/20260830-220004` from `main`, let `quality` run on
   the new sha, merge it. Four rulings and two authored cards are outside `main`
   and every board edit that lands first makes it harder. It is cheap now and
   expensive later.
2. **P3-13b**, the deviz line editor. P3-13 was its only unmet dependency and
   P3-09 shipped two runs ago, so it is eligible the moment this merges. It is
   also the widest unblock left: P3-13c, P3-12 and P3-18 all sit behind it, and
   the schema it needs is now proven.
3. **P3-27 is still blocked on Ivan and the pending register is now THIRTEEN
   files.** Nothing in CI needs it, because every acceptance runs against a local
   stack. Nothing the owner can SEE exists on the live site until it runs. It is
   the oldest unanswered question on this board and it has grown by one file in
   each of the last four runs.
