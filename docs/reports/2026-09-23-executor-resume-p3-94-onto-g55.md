# Resume P3-94 onto the P3-95 CI fix

**Role:** EXECUTOR
**Date:** 2026-09-23 (UTC)
**Card:** P3-94, already `shipped` on `card/p3-94`. No new card, no new id, no new
application code, no AUTHOR step.
**Pull request:** #353, opened 2026-09-23T03:22:01Z from `card/p3-94`.
**Branch worked:** `card/p3-94-resumed`, cut from `origin/card/p3-94`, pushed back
onto `card/p3-94` so that #353 carries this merge.

## What this run was for

PR #353 carries the half filled intake position fix. It failed its fourth end to end
run on yet another unrelated case, and by the time that run finished it was also
CONFLICTING with `main`. P3-95 (goal G55, PR #354 and the follow up #355) had
meanwhile landed the real cause and the real fix: the main Playwright project was
served by a Next DEVELOPMENT server, which restarts itself once its used heap passes
80 per cent of the limit, killing whatever request is in flight. It fires once per
process, late in a long serial suite, which is exactly one lost case per run.

So this run does one thing: merge `origin/main` into #353's branch, resolve the
conflict by hand, prove the gates, push, and WATCH the `quality` run to completion in
the foreground, to confirm on a real commit that the G55 fix holds. That commit is
the fairest possible test of it: it failed this signature three times in a row before
P3-95 merged.

## Setup

The four commits already on `card/p3-94` are the finished, reviewed work and none of
them was redone, rewritten, squashed or reset:

```
6c393f9 P3-94: flip the card to shipped, with the report and the learning
e4ae674 P3-94: four named G50 cases for the half filled intake position
e4d5c6a P3-94: name a half filled intake position instead of dropping it
9796696 P3-94: author the card for a half filled intake position refused by name
```

`card/p3-94` was already checked out in an older worktree, so this resume took the
branch name the task named, `card/p3-94-resumed`, cut from `origin/card/p3-94`
explicitly. The merge is then pushed onto the branch #353 actually tracks, confirmed
with `gh pr view 353 --json headRefName`, so no second pull request is opened.

Preconditions, both checked before anything else: `gh pr view 353` reported OPEN with
`mergeable` CONFLICTING, and `gh pr list --state open --author @me` listed #353 and
nothing else.

## The merge

`git merge origin/main` conflicted in exactly the two files the task predicted, and
in no others. No code file conflicted: `InboundOrderForm.tsx` and
`tests/e2e/inbound.spec.ts` (ours) do not overlap `playwright.config.ts` and
`.gitignore` (theirs).

### docs/LEARNINGS.md, union merged

An append only log, so both sides are kept and only the marker characters are
dropped. Order is chronological: P3-94's entry on a new per position guard being
refused by a spec in a different file, then P3-95's two entries, on the suite losing
one random test per run to its own web server and on the rerun allowance being the
wrong instrument for a failure that recurs by design. Nothing from either side is
dropped, reworded or reordered within itself.

### docs/board/rc-board-phase3.json, rebuilt from both parents, never union merged

Git had interleaved the two appended cards into ONE object: our `id`, `title` and
`plain` against theirs, then a run of keys that happen to be identical on both cards,
then our `acceptance` through `notes` against theirs. Resolving that by editing
around the markers would have produced a single card wearing half of each, which is
precisely the failure mode the repository's conflict doctrine names, and it would
have parsed.

It was resolved instead by a script that read all three merge stages with
`git show :1:`, `:2:` and `:3:`, parsed each as JSON, and:

- listed what each side ADDED against the merge base: ours `P3-94`, theirs `P3-95`
- reported every top level key that differed between the two sides: only `as_of`
- rebuilt the card list as ours plus every card theirs added that we do not carry
- proved CARD BY CARD that each card in the result equals the side that last wrote
  it, and refused to write at all if any card had been changed by both sides beyond
  the base, or matched neither parent. Mismatches: 0.

The file round trips exactly through two space JSON, verified before writing, so the
rebuild introduces no formatting noise: the whole diff against our side is the
`as_of` line plus P3-95 appended whole.

`as_of` was set to the resolve moment, `2026-09-23T15:55:43Z`, read from
`new Date().toISOString()` at that instant, which is later than both sides
(ours `2026-09-23T03:21:30Z`, theirs `2026-09-23T15:41:52Z`) so neither clock moves
backwards. `check:board-clock` was run after the commit and passed.

The result was then READ, not merely checked for absent markers: 144 cards, every id
unique, `P3-94` and `P3-95` each present as its own complete object with its own 17
keys and its own title, status `shipped` and lane `shipped` on both, no duplicated
key and no truncated object.

No conflict was reported anywhere other than these two files.

## Gates, from the worktree, each exit 0

Board validator on all three boards, before the commit:

```
node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json
PASS docs/board/rc-board.json (0 violations)
PASS docs/board/rc-board-phase2.json (0 violations)
PASS docs/board/rc-board-phase3.json (0 violations)
```

Then, each run alone and each exit code read from that command and nothing else:
`npx tsc --noEmit`, `npm run build`, `check:card-ids`, `check:board-edit`,
`check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`,
`check:conflict-residue`, `check:categories`, `check:ledger-rows`,
`check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`,
`check:assertion-register`, and after the commit `check:board-clock`.

`check:board-edit` reported `P3-94 (absent) -> shipped, new-card`, satisfied 1 of 1.
`check:no-destructive-migration` parsed 0 files: this branch adds and changes no file
under `supabase/migrations/`, so nothing here reaches the production database.
`check:conflict-residue` passed all three of its checks over 664 text files,
including its strict JSON parse of the boards with duplicate keys rejected.

`package.json` and `package-lock.json` are not touched by the merge, so no reinstall
was needed. The end to end suite itself runs only in CI: this machine has no Docker
and no Supabase CLI.

## What was deliberately NOT touched

- The four commits already on `card/p3-94`. Not rewritten, not squashed, not reset.
  The merge is a real merge commit with two parents, `6c393f9` and `69eed41`.
- `playwright.config.ts`, `.gitignore` and everything else P3-95 built. They arrive
  from `origin/main` unchanged and are not re-touched here. A second, uncoordinated
  attempt at the CI fix from this branch would collide with the card that already
  owns it.
- `components/orders/InboundOrderForm.tsx` and `tests/e2e/inbound.spec.ts`, which
  carry P3-94's own finished work.
- The `lead=` prop on `PageHeader`. Nothing here renames or sweeps on that word.
- Production. No database access from this machine, and none is possible here.

## Learnings

No new defect was met. The merge conflicted in the two files the task predicted, in
the shape it predicted, and the resolution followed doctrine that `docs/LEARNINGS.md`
and `KNOWN-FAILURES.md` already carry. Nothing is appended to `docs/LEARNINGS.md` by
this run, and that is said here rather than left to be inferred.

## The quality run

This run's whole purpose is to watch `quality` conclude on a commit that failed the
memory threshold signature three times before P3-95 landed. The run id, its result
and its duration are reported in the session's printed report and on the pull
request.

The run id is deliberately NOT written into this committed file. A commit adding it
would be a new head sha, and `quality.yml` carries
`concurrency: cancel-in-progress: true` on the branch ref, so that commit would
cancel the very run it names and start another. The evidence lives where it can be
read without destroying itself: the pull request and the run's own log.

If the run had come back red on the same random unrelated signature, this task's
instruction was to file an `OWNER:` mailbox question with the run id, the failing
test and the server log excerpt, and to attempt no retry and no fix, because a second
uncoordinated attempt at G55's territory is worse than a wait. If it had come back
red on an assertion connected to P3-94's own change, that would be a real latent
defect and this branch would carry its fix.

## Merge

NOT self merged. Real client data has been in production since 2026-09-14, so the
close-out block's step 8 revokes the section 3.1 grant on every path, whatever the
pull request touches. This branch adds no migration, so nothing here changes the live
database in any case. The owner's auto-merger takes #353 from a green `quality`.
