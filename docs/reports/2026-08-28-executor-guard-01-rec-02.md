# EXECUTOR: GUARD-01 and REC-02, the conflict residue guard and four unwritten rulings

**Date:** 2026-08-28 (UTC)
**Role:** EXECUTOR
**Cards:** GUARD-01 and REC-02, both authored in this PR
**Base:** `origin/main` at `5ac1055`
**Scope:** documents, board, one new check script. No application code, no
migration, **no database connection was opened.**

---

## 0. Boot

39 cards on entry: 30 shipped, 6 todo, 2 blocked, 1 in_flight. Launch gate 6 of
9. Next eligible by lexical id: AUT-10. Both cards were dispatched.

---

## 1. Two premises in the dispatch, checked first

**"Self-merge under R-049 applies to this PR." R-049 is not on `main`.**
`decisions/inbox.md` on `main` ends at **R-048**. R-049 is real and authored, and
it is on PR #94's branch, **open and unmerged**. So this PR does not self-merge
under R-049. It self-merges under **CLAUDE.md 5b**, which has carried
`green_self_merge` for every card except P2-14 since 2026-08-25 and needs no new
ruling. The outcome is the same; the authority cited was not the one available.

**The rulings are numbered R-052 to R-055, not R-049 to R-052, deliberately.**
R-049 to R-051 are unclaimed on `main` but **PR #94 authors exactly those three**.
Taking them would force another lane to renumber, which is the collision R-012
already ruled on when it shifted four rulings rather than edit an existing one.
The gap closes when #94 lands. If #94 is ever abandoned the gap is permanent and
harmless, which is the cheaper of the two failures.

---

## 2. GUARD-01: the guard caught live residue on `main` as its first act

**The card's third incident list was accurate, and one of the three was still
in the tree.**

`docs/LEARNINGS.md` on `main` carried:

- line **1536**: ` poc/19-harness-caps`
- line **1636**: ` main`

Landed by `d66a28e` (PR #91) and sitting on `main` **through four subsequent
merges**. Introduced by a resolution that deleted the marker characters and left
the tails as file content. Markdown has no parser to offend, so nothing caught
it.

Both lines are removed in this PR. The guard **exits 1 on `main` before that
removal and 0 after**, which is the acceptance.

### 2.1 The three checks, one per stage of how the residue degrades

| check | catches | the incident that motivates it |
|---|---|---|
| 1 | `^<<<<<<< `, `^=======$`, `^>>>>>>> ` | the easy case nobody has actually hit |
| 2 | a line whose entire content is whitespace plus a bare git ref | `555b725`, `d66a28e`, PR #94 |
| 3 | JSON under `docs/`: strict parse, and duplicate keys in one object | PR #94's board, and anything cleaned up naively |

**The signature in check 2 is precise rather than heuristic.** `<<<<<<< branch`
is seven markers, a space, then the ref. Delete the seven markers and exactly
` branch` remains: leading whitespace, a bare ref, nothing else. So the thing to
look for is not a branch name, which appears in prose constantly, but a **line
whose entire content is** whitespace plus a ref token.

### 2.2 Fenced code blocks are skipped, and that is load-bearing

Every report in `docs/reports/` that describes one of these incidents **quotes
the residue**. `2026-08-28-executor-land-triage-83.md` quotes both the stripped
form and the intact form. A guard that cannot tell a quotation from the real
thing is a guard that **forbids writing about the bug it exists to catch**.

This was measured before the rule was chosen, not assumed. Across the whole tree:

```
docs/LEARNINGS.md:1536: poc/19-harness-caps                    <- real, unfenced
docs/LEARNINGS.md:1636: main                                   <- real, unfenced
docs/reports/2026-08-28-executor-land-triage-83.md:42          <- quoted, fenced
docs/reports/2026-08-28-executor-land-triage-83.md:46          <- quoted, fenced
```

All three incidents occurred outside a fence. Every quotation of them is inside
one. The split is clean.

### 2.3 One deliberate deviation from the card, recorded rather than quietly made

**The card scopes check 2 to lines "inside a JSON object or between two adjacent
identical JSON keys". That condition cannot catch incident 2**, which is markdown
and has no JSON object to be inside, and incident 2 is one of the three the card
requires the guard to fail on.

So the rule is applied to every text file, and the JSON context is **reported as
an additional detail** when it applies rather than used as a precondition. The
false-positive cost of the wider rule on this repository is **zero, measured**:
185 text files scanned, and outside fenced blocks the only matching lines were
the two real residues.

### 2.4 The fixtures, reconstructed as real files in real git trees

Not asserted. Each is a directory with the residue in it, `git init`ed, with the
guard run against it.

### FIXTURE f1  exit=1  expected=1  PASS
    CHECK 1 conflict markers: OK, 1 text files scanned outside fenced blocks
    CHECK 2 stripped markers: FAIL, same 1 files, bare-ref-token lines
    CHECK 3 JSON under docs/: FAIL, 1 files parsed strictly, duplicate keys rejected
      - CHECK 2 stripped conflict marker: docs/board/rc-board-phase2.json:5: " triage/20260827-220052", inside a JSON object. A bare git ref alone on a line is what "<<<<<<< triage/20260827-220052" becomes when the marker characters are deleted and the tail is left behind.
      - CHECK 2 stripped conflict marker: docs/board/rc-board-phase2.json:9: " main", inside a JSON object. A bare git ref alone on a line is what "<<<<<<< main" becomes when the marker characters are deleted and the tail is left behind.
      - CHECK 3 JSON parse: docs/board/rc-board-phase2.json: expected a string at line 5

### FIXTURE f2  exit=1  expected=1  PASS
    CHECK 1 conflict markers: OK, 1 text files scanned outside fenced blocks
    CHECK 2 stripped markers: FAIL, same 1 files, bare-ref-token lines
    CHECK 3 JSON under docs/: OK, 0 files parsed strictly, duplicate keys rejected
      - CHECK 2 stripped conflict marker: docs/LEARNINGS.md:8: " poc/19-harness-caps". A bare git ref alone on a line is what "<<<<<<< poc/19-harness-caps" becomes when the marker characters are deleted and the tail is left behind.
      - CHECK 2 stripped conflict marker: docs/LEARNINGS.md:18: " main". A bare git ref alone on a line is what "<<<<<<< main" becomes when the marker characters are deleted and the tail is left behind.

### FIXTURE f3  exit=1  expected=1  PASS
    CHECK 1 conflict markers: OK, 2 text files scanned outside fenced blocks
    CHECK 2 stripped markers: FAIL, same 2 files, bare-ref-token lines
    CHECK 3 JSON under docs/: FAIL, 1 files parsed strictly, duplicate keys rejected
      - CHECK 2 stripped conflict marker: docs/LEARNINGS.md:7: " board/aut-12-14-authorization-grants". A bare git ref alone on a line is what "<<<<<<< board/aut-12-14-authorization-grants" becomes when the marker characters are deleted and the tail is left behind.
      - CHECK 2 stripped conflict marker: docs/LEARNINGS.md:13: " main". A bare git ref alone on a line is what "<<<<<<< main" becomes when the marker characters are deleted and the tail is left behind.
      - CHECK 2 stripped conflict marker: docs/board/rc-board-phase2.json:5: " board/aut-12-14-authorization-grants", inside a JSON object. A bare git ref alone on a line is what "<<<<<<< board/aut-12-14-authorization-grants" becomes when the marker characters are deleted and the tail is left behind.
      - CHECK 2 stripped conflict marker: docs/board/rc-board-phase2.json:9: " main", inside a JSON object. A bare git ref alone on a line is what "<<<<<<< main" becomes when the marker characters are deleted and the tail is left behind.
      - CHECK 3 JSON parse: docs/board/rc-board-phase2.json: expected a string at line 5

### FIXTURE f4  exit=1  expected=1  PASS
    CHECK 1 conflict markers: OK, 1 text files scanned outside fenced blocks
    CHECK 2 stripped markers: OK, same 1 files, bare-ref-token lines
    CHECK 3 JSON under docs/: FAIL, 1 files parsed strictly, duplicate keys rejected
      - CHECK 3 duplicate JSON key: docs/board/rc-board-phase2.json:6: "as_of" was already declared at line 5. JSON.parse accepts this silently and keeps the LAST one, so a half-resolved conflict can leave the file valid and quietly wrong.

### FIXTURE f5  exit=0  expected=0  PASS
    CHECK 1 conflict markers: OK, 1 text files scanned outside fenced blocks
    CHECK 2 stripped markers: OK, same 1 files, bare-ref-token lines
    CHECK 3 JSON under docs/: OK, 0 files parsed strictly, duplicate keys rejected


**f4 is the fixture nobody asks for and it is the reason check 3 exists.** Take
the same conflict, delete the marker tails by hand, keep both sides, and the JSON
**parses clean** while carrying `as_of` twice. `JSON.parse` takes the last one
silently, so the file is valid, the board validator is green, and the board is
quietly reporting whichever half of the conflict happened to be second. PR #94's
board carries exactly that. Checks 1 and 2 both pass on it. Only check 3 sees it.

**f5 is the false-positive test.** A report quoting the residue inside a fence
must pass, and does.

### 2.5 A grep is not the check, and that is worth stating

`grep '<<<<<<<'` finds **nothing** in any of the three incidents, because the
characters it looks for are exactly the characters the bad resolution deleted.
That is the whole reason this guard is a script and not a line in a checklist.

---

## 3. REC-02: the four rulings

**R-052, conflicts are resolved locally by EXECUTOR.** Never in the GitHub web
editor, never by the owner. The web editor is the common factor in the three
incidents: it shows one file at a time, out of the tree, and **no check in this
repository can be run from it**. Every safeguard here is a command. It names the
owner too, and that is not a criticism: he does not read code, which is the
standing condition this project is built around, and resolving a conflict is the
one task that requires reading both sides of a diff and choosing which lines
survive. It is also the task with the least visible failure, because a bad
resolution produces a file that looks finished. Written into `CLAUDE.md` 3.

**R-053, G4 decoupled from Andre.** The deciding clause is no longer "one real
document through the live scenario". It is the ingest endpoint asserted against a
fixture plus four failure cases: redirect, malformed payload, oversize, auth
rejection.

The rationale is a property of machine endpoints, not an accommodation: **an
endpoint behind a redirect returns 200 while doing nothing.** The caller sees
success, the payload goes nowhere, and every happy-path test passes. The happy
path was always the case least able to tell a working endpoint from a broken one.

**This is strictly stronger, and that is the point.** One document through a live
scenario proves one document worked once, on a day, through a third party's
configuration. It is not re-runnable and cannot fail in CI. Four failure
assertions run on every push, for ever. What is removed is a dependency on a
person, not a standard: G4 has been `fail` since the board opened, always for the
same reason, and R-046 recorded that no terminal could close it and no card
existed that moved it. Andre's live scenario is **degated, not cancelled**.

**R-054, P2-19 retired.** The card existed because the ledger says 0009 while the
schema is at 0012 **and** because only Ivan could correct it. The second half of
that premise is gone: `Bash(psql:*)` is permitted, `psql` is on the machine, and
R-047 governs what a terminal may execute.

**P2-13's `depends_on` is now exactly `["P2-08b"]`**, stated in full on the card
because it has carried three different dependency sets in two days. `P2-15`
removed, shipped under R-048. `P2-19` removed, retired here. `P2-08b` remains.

**R-044 was not wrong and is not being overruled on its reasoning.** Its
capability argument was correct: P2-13 removes the connection permanently, P2-19
needed it, so P2-19 had to land first or become an owner action for ever. The
edge is deleted because **the work it protected is no longer blocked**, not
because the argument failed. And retiring the card does not fix the ledger: that
write is now an ordinary card on the migration path.

**R-055, the production write journal.** `docs/PRODUCTION-WRITES.md` created as
`APPLY-LOG.md`'s sibling, backfilled with both 2026-08-28 runs, mandated in
`CLAUDE.md` 8.8.

**This exists because the terminal that used R-047 reported the hole it opened**
and declined to invent a fix, since choosing between widening `APPLY-LOG.md` and
adding a sibling is an owner decision. The two backfilled rows are the argument
for R-047 in one line:

| actor | assertions | rows | what decided it |
|---|---|---|---|
| the owner, by hand | **none** | 1221 | a human read a grid |
| the EXECUTOR terminal | **20 of 20** | 20 | the script's own gate |

The first run's grid carried a number that was not what the operator had been
told to expect, and it committed anyway. It committed correctly, but correctness
by judgement reads identically to the case where the judgement was wrong.

**The sha256 column is the field most likely to be dropped as pedantry and it is
the one carrying the weight.** `scripts/reset-test-data.sql` meant two materially
different files eleven hours apart: `6887402…` and `542e7bc…`. The difference
between them is three products and a category. A log carrying only the path
cannot tell them apart.

---

## 4. CLAUDE.md 9b gains two roles, not one

The card asked for `author`, which was missing. `owner` was added with it:
`docs/reports/2026-08-28-owner-p2-15-reset-run.md` records a production run **no
terminal performed**, and filing it under a terminal's role would make the record
say something false about who ran it. The list now reads `author`, `executor`,
`critic`, `poc-builder`, `triage`, `owner`, with a line saying `author` was a
defect in the list rather than a statement that AUTHOR files no reports.

---

## 5. Acceptance

```
npm run check:conflict-residue   exit 0  (exit 1 before the LEARNINGS.md fix)
npm run check:reset-sql          exit 0
npm run check:categories         exit 0
npm run check:ledger-rows        exit 0
npm run check:no-prod-target     exit 0
npx tsc --noEmit                 exit 0
npm run build                    exit 0
validate-board.mjs, both boards  PASS, 0 violations
fixtures f1 f2 f3 f4             exit 1, each naming the right check
fixture f5                       exit 0, no false positive
```

Board after: 41 cards, 33 shipped, 6 todo, **1 blocked**, 1 in_flight. Launch
gate unchanged at 6 of 9: R-053 makes G4 closeable by a terminal for the first
time but does not flip it, because gates flip on committed evidence only under
R-023 and the assertions do not exist yet.

**Only P2-08b is blocked now.** It was three cards this morning.

---

## 6. What was not done, and is flagged rather than quietly fixed

`docs/LEARNINGS.md` carries an entry titled **"Supabase migrations run on plain
postgres with a five-object shim"**. The count is wrong. Enumerating the objects
gives **ten**: three roles, two schemas, `auth.users`, `auth.uid()`,
`auth.role()`, `storage.buckets`, `storage.objects`. A report of mine says
**nine**. So the number is wrong in two places and right in none.

`CLAUDE.md` 3 says a defect noticed in passing becomes a card or a learnings
entry, **not a quiet extra commit**. It is one word in a heading and I am already
editing that file for the residue, which is exactly the reasoning that makes
scope creep feel reasonable. Named here, left alone.

---

## 7. What a reader should carry forward

**The guard's first act was to catch something real that four merges had walked
past.** That is the argument for writing checks rather than resolutions to be
careful: the residue was on `main` for a day, in the file everyone reads, and
three sessions including mine looked straight through it.

**Four dispatches in one day, four absent premises**, all the same shape: the
thing had happened, the record had not been committed. Today that was a stale PR
state, a nonexistent ruling, a merged PR described as open, and now a self-merge
authority sitting on an unmerged branch. Verifying first has cost one `grep` each
time and caught all four.

**R-053 is the one to actually read.** It is the only change here that moves what
has to be true before this thing launches, and it moves it in the direction of
something a machine can check every day rather than something a third party does
once.
