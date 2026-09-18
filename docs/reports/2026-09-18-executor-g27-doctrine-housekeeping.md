# G27: four doctrine and housekeeping corrections (P3-78)

Date: 2026-09-18. Role AUTHOR (docs only, no application code), on the operator
factory's task 051, goal G27, Ivan's findings F10, F11, F13 and F14.
Card P3-78, branch `card/p3-78`, one pull request.

## Plain words for the owner

Nothing changes in the app Rapid Construct uses. This tidies the project's written
rules: they now point to the list of known failure patterns, they say where Ivan's
own working terminal (ORANGE) fits, two setup problems are written down so nobody
pays for them twice, and the newest planning board is confirmed to have no public
link yet.

## Boot

Phase 2 board: 68 shipped, 32 todo, 2 blocked; launch gate 6/9; next eligible AUT-3.
Phase 3 board: 93 shipped, 32 todo, 1 blocked; launch gate 0/9; next eligible CI-04.
The session worked the owner-assigned G27 as a new card, not the next eligible one.
`gh pr list --state open --author @me` was empty before starting.
`npm run id:free -- P3-78` answered FREE, lane highest P3-77, 0 open pull requests.

## F10: pointer to docs/DOCTRINE-PATTERNS.md

**Found:** `CLAUDE.md` did not mention `docs/DOCTRINE-PATTERNS.md` anywhere
(created 2026-09-15 by ruling R-198).
**Changed:** one short paragraph at the end of section 9c. That is where it fits:
the patterns file corrects its own text by section 9c's quoting rule and says so.

## F11: ORANGE and the four roles

**Found, and it differs from the task's premise.** The task expected an ORANGE
section in the repository's `CLAUDE.md` to point to, and asked for ORANGE to be
stated as a fifth role. Neither matches the repository:
- `grep -n -i orange CLAUDE.md` returns nothing. The ORANGE section the task
  describes is in the operator factory's own CLAUDE.md, outside this repository.
- Every ORANGE report in `docs/reports/` is signed `Role EXECUTOR (ORANGE)`, for
  example `2026-09-15-executor-orange-andre-fixtures.md`, and
  `docs/PRODUCTION-WRITES.md` lists it as "EXECUTOR terminal (ORANGE)". The phase 1
  board's doctrine also calls ORANGE "the executor terminal".

So ORANGE is a terminal that boots as EXECUTOR, not a fifth role. It is not retired
either: the task says Ivan's terminals still open pull requests on this repository.

**Changed:** under section 1, after the roles list, a paragraph written under
section 9c. It quotes "Four roles exist. A session is exactly one of them and says
so in its first message, by name: AUTHOR, EXECUTOR, CRITIC, POC." and keeps it
where it is. It marks the sentence as INCOMPLETE (not false) and gives the correction:
ORANGE is Ivan's terminal, it boots as EXECUTOR, and since 2026-09-14 its scope is
the extraction track, agreed between Ivan and the platform owner and not set by
`CLAUDE.md`. It also says `CLAUDE.md` has no separate ORANGE section. No other
section was rewritten.

## F13: two LEARNINGS entries

**Found:** neither was in `docs/LEARNINGS.md`. Both are in
`docs/reports/2026-09-16-executor-pr-300-repair-and-digital-failure-verification.md`
section 5, which left them out of LEARNINGS on purpose at the time.
**Changed:** two ERROR/SOLUTION entries were appended, in the file's format:
1. "A real node_modules copied with cp -a still breaks Turbopack when the source
   carries a self-loop" (tag tooling). The fix was to remove the copied
   `node_modules/node_modules` self-loop. The rule: prefer `npm ci`, or check the
   copy for that entry.
2. "check:board-edit counts docs/board/board-config.mjs as CODE, so the docs/ prefix
   does not mean record" (tag ci). The mechanism was read from
   `scripts/poc-free/check-board-edit.mjs`: the classifier is ordered and the first
   match wins. Every `docs/board/` path other than the three boards and the template
   is CODE, and that rule comes before the general `docs/` record rule. The fix
   quotes the report exactly: `TERMINAL_STATUSES` is `{shipped, blocked, halted}`,
   and a card absent at the merge base resolves as `new-card` rather than
   `status-unchanged`. A first draft said the check prints a class for each path.
   The script prints a count for each class, so the rule was corrected to match.

## F14: the phase 3 board's artifact URL

**Found:** `renders_to` already said "NO ARTIFACT URL EXISTS YET" and that the first
publish records its URL there. The phase 1 and phase 2 URLs are the only artifact
URLs anywhere in the repository. `docs/board/board-config.mjs` says the same for
phase 3. So the finding was already answered. One clause had gone stale: "This
board is authored ahead of its phase". Phase 3 is now the board cards are worked
from.
**Changed:** no URL was invented and nothing was removed. One dated sentence was
appended to `renders_to`. It says the check was made on 2026-09-18, that no URL
exists yet even though the phase has begun, and that this field is where the URL
will go.

## Acceptance, run locally on the branch

    grep -c 'docs/DOCTRINE-PATTERNS.md' CLAUDE.md                          1
    grep -c 'ORANGE IS A TERMINAL, NOT A FIFTH ROLE' CLAUDE.md             1
    grep -c 'Four roles exist. A session is exactly one of them' CLAUDE.md 2
    grep -c 'node_modules/node_modules' docs/LEARNINGS.md                  4
    grep -c 'board-config.mjs as CODE' docs/LEARNINGS.md                   1
    renders_to node check                                                  exit 0

Each of these exited 0: `npx tsc --noEmit`, `npm run build`, the validator on all
three boards, `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
`check:no-destructive-migration`, `check:conflict-residue`, `check:categories`,
`check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`,
`check:removal-safety` and `check:assertion-register`. `check:board-edit` ran after
the card was flipped to shipped. The pull request body records the result.

## Defects hit while working

None in the product. One slip of my own, caught before commit: the draft LEARNINGS
rule described `check:board-edit`'s output wrongly. It was checked against the
script and corrected. Nothing more to append.

## Merge

No migration. Docs only. Real client data is in production, so this session does
not merge. The pull request number, `quality` result and merge state are in the
final output of the session and in the owner's approval question.
