# EXECUTOR: the board-edit check, the queue-throughput card, and the EXT tail

**Run date (UTC):** 2026-09-04
**Role:** EXECUTOR
**Dispatch:** build the board-edit check ahead of EXT-17; author a queue-throughput
card without building it; then EXT-17, EXT-18, EXT-19 as reduced, EXT-20; merge
#198 and finish at zero open pull requests.

---

## 0. What was verified before anything was built

Nothing in the dispatch was taken as state. Every claim below was read from the
live repository first.

| Claim in the dispatch | Verified | Result |
|---|---|---|
| `#198` is open and must be merged | `gh pr view 198` | **ALREADY MERGED** at 2026-09-04T23:01:07Z, merge commit `b365c3f`. Step 4 was complete before this session started. |
| the queue must finish at zero open PRs | `gh pr list --state open` | **ZERO** open pull requests at session start. |
| `#195` merged EXT-16's code with the card still `todo` | `git show 53df12c:docs/board/rc-board-phase3.json` | **CONFIRMED.** EXT-16 `status` is `todo` in the merge commit itself. The phase 3 board WAS touched in that pull request, by exactly two lines, and they were EXT-19's `notes`. |
| `#192` left AUT-17 `in_flight` with no evidence | `git show a28548d` | The MERGE commit carries AUT-17 as `shipped` with evidence, and that evidence says in its own words that "THE BOARD FLIP WAS MISSING FROM THE PULL REQUEST AS AUTHORED". The defect was real and was corrected on the branch before the merge. |

`#195` is the sharper of the two, and it is the one that settles the design: a
check that asks "was a board file touched" would have reported that pull request
**green**. The board file was touched. The card that shipped was not.

---

## (narrative continues; this file is written as the work proceeds)
