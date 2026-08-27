# EXECUTOR: five rulings, the migration ledger, the P2-15 paste block, and plain language on every card

**Date:** 2026-08-27. **Role:** EXECUTOR. **Board:** `docs/board/rc-board-phase2.json`.

---

## 0. Boot

**Cards by status at boot, 30 total:** shipped 25, blocked 3 (P2-08b on Andre,
P2-15 on Ivan, AUT-3 on Ivan), todo 2 (P2-13, P2-14).
**Launch gates:** 6/9. Failing: G4, G7, G9.
**Next eligible card:** `no eligible card`. P2-13 waited on P2-15, which was
blocked on Ivan; P2-14 was blocked on the client.

**One deviation before the report was printed.** The dispatch's first
instruction was to release three stale claims, so three claim PRs were opened
before the status report. Flagged rather than hidden: CLAUDE.md section 1 says
no tool call that changes anything may precede the report.

---

## 1. Claims released

`AUT-1`, `P2-15` and `P2-18` all held leases expiring at 21:12Z on finished or
blocked work, which would have made the 22:00 run skip cards it should be free
to take.

`claim.sh release` opens one PR per card, each cut from the same `main`, so all
three rewrote the same object and the second and third would have conflicted.
**PR #69 removed all three in one diff**, so it was merged and #67 and #68 were
closed as superseded. `claims` on `main` is now `{}`.

---

## 2. Rulings committed: R-034 to R-038

PR **#72**, merged. Full text in `decisions/inbox.md`.

- **R-034** ratifies EXECUTOR deviations 1 to 7 from the previous report, each
  named individually rather than in bulk.
- **R-035** ratifies POC-BUILDER deviations 1 to 7, including the abandonment of
  PR #55. The standing rule: **green is not correct.** `quality` answers whether
  the tree builds and validates, never whether the diff reverts work other
  terminals landed while the branch was open. A branch that has fallen behind is
  rebuilt on current `main` under a new number.
- **R-036** takes AUT-3 off `blocked_on: ivan`.
- **R-037** adds `P2-08b` to `P2-13.depends_on`.
- **R-038** fixes the digest's audience: card ids, ruling ids, PR numbers, CI
  states, claim mechanics, branch names, file paths, migration numbers and role
  names are cut from it.

**A limit on R-035, stated in the ruling itself.** Six of the seven POC-BUILDER
deviations could not be quoted. That report is **not committed** under
`docs/reports/`, and POC-BUILDER's worktree is out of bounds for this terminal.
They are ratified on the owner's word, which is what a ruling is. The gap is a
finding in its own right: section 9b binds every role, and an uncommitted report
is one the next session cannot read.

### Board edits carried by those rulings

**AUT-3**: `blocked_on` cleared, `status` `blocked` to `in_flight`, `question`
cleared, `acceptance` rewritten to name the next scheduled run and its log.

**P2-13**: `depends_on` is now `["P2-15", "P2-08b"]`.

**Deviation flagged.** The dispatch said AUT-3 moves to `depends_on` the next
scheduled run. `depends_on` cannot hold it: the validator resolves every entry
to a card id on the same board, and a scheduled run is an event, not a card.
Inventing a placeholder card would put a fiction in the dependency graph. The
dependency is recorded in `acceptance` and `notes`, and the card sits at
`in_flight`, which is also the state that keeps it out of the eligible queue.
`todo` would have handed an unattended run a card whose code is already merged
and whose only open item is evidence that run itself produces.

---

## 3. Task 1: the migration ledger. REFUSED, AUTHORED, NOT VALIDATED

Card **P2-19**, PR **#75**.

### The refusal, verbatim

The connectivity probe was `select 1` on the session pooler, with the connection
derived per CLAUDE.md 8.4 and the password passed as `PGPASSWORD`:

```
Permission for this action was denied by the Claude Code auto mode classifier.
Reason: Blocked by classifier. If you have other tasks that don't depend on this
action, continue working on those. IMPORTANT: You *may* attempt to accomplish
this action using other tools that might naturally be used to accomplish this
goal, e.g. using head instead of cat. But you *should not* attempt to work around
this denial in malicious ways, e.g. do not use your ability to run tests to
execute non-test actions. You should only try to work around this restriction in
reasonable ways that do not attempt to bypass the intent behind this denial. If
you believe this capability is essential to complete the user's request, STOP and
explain to the user what you were trying to do and why you need this permission.
Let the user decide how to proceed. To allow this type of action in the future,
the user can add a Bash permission rule to their settings.
```

A **second, narrower attempt** was refused with the same text: a probe that ran
no SQL at all and only asked which postgres client binaries exist on the
machine. That is what settles it as a blanket refusal rather than a rule about
the statement being run, and it is why it was not attempted a third time.

**This is a sandbox limit, not a doctrine limit.** CLAUDE.md 8.2 still
authorises EXECUTOR to apply while the project holds zero real client data, and
that grant runs until P2-13. The authorisation exists and the capability does
not.

### What was built instead

- **`scripts/ledger-rows-0010-0012.sql`**, generated and committed. One
  transaction, opened and deliberately never closed: pre-check, three
  `insert ... on conflict (version) do nothing ... returning`, post-check. The
  owner reads both grids and sends `COMMIT;` or `ROLLBACK;` himself.
- **`scripts/poc-free/build-ledger-rows.mjs`**, the generator, plus `--check`.
- **`npm run check:ledger-rows`**, wired into the `quality` workflow.
- **`docs/runbooks/ledger-rows-0010-0012.md`**, marked **NOT VALIDATED**,
  superseding `docs/runbooks/apply-0011.md`, which keeps a pointer at the top.
- The **APPLY-LOG** entry, three phases, each marked not run.

### Three phases, and why the parse mattered

The file embeds three migrations as string literals, so its own text contains
`DROP`, `DELETE`, `ALTER TABLE` and `on delete set null`. A grep finds those and
a grep is the wrong tool. `pgsql-parser`, the real PostgreSQL grammar:

```
CHECK 1 generated: OK, matches the three migration files it is generated from.
CHECK 2 parse: OK, 8 statements, PostgreSQL grammar 180004
CHECK 3 statement kinds: OK, only TransactionStmt, SelectStmt, InsertStmt
CHECK 4 insert count: OK, 3
CHECK 5 insert targets: OK, all 3 into supabase_migrations.schema_migrations
CHECK 6 transaction: OK, one BEGIN and no COMMIT, so the owner decides
PASS      exit 0
```

**Checks 3 and 6 were proved to fail before they were trusted.** Mutating the
committed file only trips check 1, which runs first, so the parse checks never
executed at all. Mutating the **generator** makes generator and file agree,
check 1 passes, and appending a real `delete` plus a `commit;` makes check 3
report `DeleteStmt` outside the allowed set and check 6 report
`["TRANS_STMT_BEGIN","TRANS_STMT_COMMIT"]`, exit 1.

### One assumption nobody here can check

The `version` format. The rows are written `'0010'`, `'0011'`, `'0012'`, which
matches this repo's file naming and what the earlier applies recorded. The
Supabase CLI's own default is a timestamp. **If the pre-check comes back showing
timestamps rather than `0001` through `0009`, the answer is `ROLLBACK;`**: rows
in a format the CLI does not read produce a ledger that looks repaired and is
not. The pre-check prints the existing rows before the first insert precisely so
that this is checkable in one second by whoever runs it.

### The recommendation

**One Bash permission rule removes this class of card permanently.** Allowing
the derived pooler connection would let the next scheduled run do this, and
every future ledger repair, unattended. Every migration applied under the
section 8 grant will otherwise leave the same gap.

---

## 4. Task 2: the P2-15 paste-ready execution block

**NOT VALIDATED. NOT EXECUTED BY THIS TERMINAL.** Nothing below has been run
against any database. `scripts/reset-test-data.sql` deletes rows and CLAUDE.md
8.6 is absolute: no terminal executes it, including one holding the migration
grant.

### What it does and does not do

The committed file ends with `commit;` on its last line, so running it whole
commits without a pause. **The block below strips exactly that one line into a
separate working copy**, so the transaction stays open after the post-check and
the decision to keep or discard is Ivan's, made after reading the numbers.

Absolute paths only. One command per line. Nothing is destroyed by any command
before the psql session, and nothing is committed by the session itself.

### Step 1: local checks, no database touched

    /usr/bin/test -f /Users/ivan/rc-inventory/scripts/reset-test-data.sql
    /usr/bin/grep -c '^delete from' /Users/ivan/rc-inventory/scripts/reset-test-data.sql
    /usr/bin/env npm --prefix /Users/ivan/rc-inventory run check:reset-sql

Expected: the first line prints nothing and exits 0, the second prints
**11**, the third prints its eight checks green and exits 0.

If the second line prints anything other than 11, **stop**. The acceptance
literal moved from 9 to 11 under ruling R-033 and a different number means the
file is not the file this block was written against.

### Step 2: build the inspectable copy

    /usr/bin/grep -vx 'commit;' /Users/ivan/rc-inventory/scripts/reset-test-data.sql > /Users/ivan/rc-reset-inspect.sql
    /usr/bin/grep -c '^commit;' /Users/ivan/rc-reset-inspect.sql
    /usr/bin/grep -c '^delete from' /Users/ivan/rc-reset-inspect.sql
    /usr/bin/grep -c '^begin;' /Users/ivan/rc-reset-inspect.sql

Expected: **0**, then **11**, then **1**. A commit line count of anything but 0
means the strip did not work and the file would commit on its own; **stop**.

Note that `grep -c` exits 1 when it counts zero, which is expected on the second
line and is not an error.

### Step 3: the connection

    set -o allexport
    . /Users/ivan/rc-secrets/phase2.env
    set +o allexport
    export PGPASSWORD="$SUPABASE_DB_PASSWORD"
    export PGHOST=aws-1-eu-west-1.pooler.supabase.com
    export PGPORT=5432
    export PGDATABASE=postgres
    export PGUSER=postgres.bwhzatwwjqmyfesfnisa

`aws-1` and not `aws-0`: `aws-0` resolves and then rejects the tenant, which is
recorded in the 0001 journal. Port 5432 and not 6543: the transaction pooler
cannot hold a multi-statement transaction, and this whole block is one
transaction.

The project ref is written literally because it is not a secret:
`NEXT_PUBLIC_SUPABASE_URL` ships it to every browser that opens the login
screen, and `scripts/production-refs.mjs` already commits it for that reason.
**No credential value appears anywhere in this block.**

### Step 4: connectivity, on its own, before anything else

    /usr/bin/env psql -v ON_ERROR_STOP=1 -c 'select 1 as connectivity;'

Expected: one row, `connectivity = 1`. **Any error here stops the whole thing.**
Do not adjust a hostname and retry: report the error text.

### Step 5: the run, inspected before it commits

    /usr/bin/env psql -v ON_ERROR_STOP=1

Then, inside the psql session, one line at a time:

    \i /Users/ivan/rc-reset-inspect.sql

Read both grids. Then, and only then, one of:

    commit;

or

    rollback;

Then:

    \q

**Ivan decides between those two lines after reading the numbers.** The file
cannot commit on its own; that is the entire point of step 2.

**Fallback surface, identical behaviour:** open the Supabase SQL editor, paste
the contents of `/Users/ivan/rc-reset-inspect.sql`, read the grids, then send
`commit;` or `rollback;` in the same editor session. The temporary tables are
`on commit drop`, so the session must be the same one.

### Step 6: clean up the working copy

    /bin/rm /Users/ivan/rc-reset-inspect.sql

### Expected pre-check output

The first grid, twelve rows. Exact counts are not predicted here because nobody
has read this database today, and a made-up number is worse than none. What must
hold is stated instead, and any of these failing is a `rollback;`:

| Row | Expected |
|---|---|
| `PRE products` | greater than 0, and equal to the two rows in the second grid added together |
| `PRE inbound_orders` | greater than 0 |
| `PRE outbound_issues` | 0 or more |
| `PRE order_lines` | 0 or more |
| `PRE outbound_lines` | 0 or more |
| `PRE batches` | 0 or more |
| `PRE reminders` | 0 or more |
| `PRE status_history` | 0 or more |
| `PRE extraction_drafts` | 0 or more |
| `PRE extraction_draft_lines` | 0 or more |
| `PRE categories TEST` | 0 or more |
| `PRE MIXED left alone` | **expected 0** |

The second grid, two rows:

| Row | Expected |
|---|---|
| `PRE products TEST- sku` | greater than 0, and in the region of 128, which is what the client's screen showed |
| `PRE products EXT- from a test document` | 0 or more, and this is the number ruling R-033 added the selector for |

**`PRE MIXED left alone` is the one to read hardest.** Anything above 0 means an
order mixes test products with real ones. Those orders are **deliberately never
deleted**, and they are listed by reference at the very end of the run so they
can be dealt with by hand. A non-zero number is not a failure; it is a list of
things this script will correctly refuse to touch.

### Expected post-check output

The second grid, eleven rows. **Every count is 0 except the last two:**

| Row | Expected |
|---|---|
| `POST products TEST-` | **0** |
| `POST products EXT- in scope` | **0** |
| `POST extraction_drafts in scope` | **0** |
| `POST orphan extraction_draft_lines` | **0** |
| `POST categories TEST-` | **0** |
| `POST orphan batches` | **0** |
| `POST orphan order_lines` | **0** |
| `POST orphan outbound_lines` | **0** |
| `POST orphan status_history` | **0** |
| `POST products remaining` | the real catalogue only: `products before` minus `PRE products` |
| `POST MIXED left alone` | **the same number as `PRE MIXED left alone`**, unchanged |

Then a final list of the mixed orders by kind and reference. **An empty result is
the expected outcome.**

**Any non-zero in the first nine rows is a `rollback;`.** So is a
`POST MIXED left alone` that differs from the pre-check value, because that
would mean the run touched something it promised not to.

### What ships the card

The post-check grid pasted back, as `evidence.ref`, kind journal. Nothing else
closes P2-15, and P2-13 sits behind it.

---

## 5. Task 3: AUT-7, plain language on every card

Card **AUT-7**, authored and worked in one PR. It is the board half of R-038:
that ruling fixed the audience of the digest, this card fixes the audience of
the board.

### What landed

- **A `plain` field on every card and every launch gate condition on both
  boards.** It sits immediately after `title`, so a reader looking for the human
  sentence finds it without scrolling.
- **The validator rejects a card or gate without one**, on both boards.
- **CLAUDE.md section 2** now requires `plain` at authoring time.
- **`BOARD-TEMPLATE.json`** carries a `plain` placeholder on its card and all
  nine gates, because a template that cannot pass the validator is a trap set
  for whoever copies it next.

### Three sample plain fields, quoted

**P2-15**, the example from the dispatch, kept verbatim:

> Delete the fake products left over from testing, before Mihai sees the system.

**P2-09**, the extraction review lane:

> Once a document has been read, the office sees the details already filled in,
> corrects anything wrong, and confirms, which creates the real order. When a
> document cannot be read, the screen says why and offers to try again instead
> of failing quietly.

**CRIT-13**, a defect card, written as the problem rather than the fix:

> Fixed: the sign-in was missing a standard protection that stops it being read
> while travelling over the network.

And one launch gate, G7 on the phase 2 board:

> A warning email actually arrives when a product falls below the level set for
> it.

### Acceptance, proved four ways

```
plain removed from a phase 2 card (P2-15)         FAIL, 1 violation, exit 1
plain removed from a phase 1 card (RC-03)         FAIL, 1 violation, exit 1
plain removed from a gate (G4)                    FAIL, 1 violation, exit 1
plain present but whitespace only                 FAIL, 1 violation, exit 1
all three boards with the field present           PASS, 0 violations, exit 0
```

**Coverage counted, not assumed:** 45 cards and 18 gates, **63 plain fields, 0
missing**, every one of them one or two sentences, and a vocabulary sweep over
all 63 finds no card id, file path, ruling id, PR number or build term.

### Deviations flagged on this card

1. **The rule sits in the base card contract, not the phase 2 planning
   contract, so it binds the closed phase 1 board.** Everything else added since
   phase 1 was deliberately name-keyed to the phase 2 board so a finished
   historical record is never turned red for a rule it was never authored under.
   `plain` is the exception and it earns it: it does not describe how a card was
   worked, it describes what the card **means**, which is as true of finished
   work as of work in flight. The owner reads both boards, and a board he cannot
   read is not made acceptable by being finished.
2. **The board portal does not display `plain` yet, and that was deliberate.**
   Its card face, list view, timeline, detail modal, editor and export diff all
   read `title`, and wiring a new field through all six is a change to the
   portal application rather than to this card. **It is worth its own card and is
   the recommended next one.** In the meantime the field is not stranded: the
   plain digest already reads `card.plain`, treats it as authoritative, and
   reports a missing one as a gap, so this card's output reaches Ivan through
   the message he already receives.
3. **This report rides in the AUT-7 PR**, which is a session artefact in a card
   PR. Section 9b says a report usually lands in the session's last PR, so this
   is the intended shape rather than an exception, and it is named here anyway.

---

## 6. Other deviations, flagged

1. **Claim releases preceded the boot status report.** Section 1 forbids a
   changing tool call before the report; the dispatch put the releases first and
   they were time-critical against the 22:00 run.
2. **`docs/LEARNINGS.md` on `main` carried six committed merge-conflict marker
   lines**, one pair nested inside another. All three entries were intact; only
   the markers were left behind, and nothing in `quality` reads a markdown file.
   Section 9 obliges P2-19 to append to that file, and appending under a
   dangling `>>>>>>>` compounds it, so the markers were stripped in that PR as a
   prerequisite rather than filed as a separate card. Six lines deleted, no
   content changed, all three entries verified intact by name.
3. **Two em dashes survive at `docs/LEARNINGS.md` lines 1177 and 1178**, which
   section 11 forbids. They predate this session and are outside every card
   worked in it. Noticed, deliberately not swept up, flagged here for a later
   card.
4. **Neither card worked this session ended up holding a lease, and none was
   minted after the fact.** Claims were taken for both, as PRs #73 and #74. They
   conflicted with each other by construction, because `claim.sh` cuts every
   branch from `origin/main`, so two claims taken seconds apart both rewrite the
   same object and the second cannot merge. By the time either could have landed
   the position had changed: **P2-19 and AUT-7 did not exist on `main` until
   their own PRs merged**, so no run could have taken them, and P2-19 shipped
   `blocked_on: ivan`, which makes it permanently ineligible. Both claim PRs were
   closed rather than merged. Minting a lease after the work it would have
   covered is the exact thing R-034 deviation 6 settled: a claim taken after the
   work begins protects nothing, and taking one to look compliant is the worse
   act.
   **Worth a harness card either way:** the claim branch should be cut from
   `origin/main` at merge time, or the merge should retry on conflict, because
   two claims in one session currently cost a closed PR every time.
5. **AUT-7's plain fields were written in one sweep rather than at authoring
   time**, which is the rule the same card introduces. Unavoidable for the 61
   fields that already existed, and it is exactly why the rule is written as
   "at authoring time" for every card after it.

---

## 7. Discipline

**No suite was run against production, and the guard was confirmed active
rather than assumed.** `npm run check:no-prod-target` passes five checks: the
blocklist lists one production ref, no workflow points a Supabase URL at it, no
workflow reads a Supabase or database secret, `playwright.config.ts` still
declares `globalSetup`, and `global-setup` still runs the guard and throws on a
non-zero exit. The runtime half is exercised in CI on every push, where the
guard is handed a production ref and must refuse with exit 2.

**`scripts/reset-test-data.sql` was not executed**, and no terminal ever will.

**No credential value appears in this report, in any commit, or in any tool
output.** Variable names only. The one production project ref that does appear
is already committed in `scripts/production-refs.mjs` with the reasoning for why
it is not a secret.

**Every branch deleted this session was deleted by `gh pr merge --delete-branch`
or `gh pr close --delete-branch` after `mergedAt` or the closed state was read
back**, never by hand and never before.

---

## 8. State at the end

**Nothing here is a backlog a terminal can pick up.** P2-08b waits on Andre,
P2-14 on the client, P2-15 and P2-19 on Ivan, and AUT-3 on the next scheduled
run.

The one action that unlocks the most: **P2-15**. P2-13 sits behind it, P2-14
behind that, and gate G9 behind that.

The one action that removes the most future friction: **a Bash permission rule
for the derived pooler connection**, which retires P2-19 and every ledger card
after it.
