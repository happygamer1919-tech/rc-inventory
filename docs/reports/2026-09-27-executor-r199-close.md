# EXECUTOR (ORANGE), 2026-09-27: R-199 close, ruling R-213

**Role:** EXECUTOR (ORANGE)
**Branch:** `decisions/R-213-r199-close`, cut from `origin/main` `c89c1cc`
**Worktree:** `/Users/ivan/RC/rc-inv-r199close`

**NOTHING IN THIS SESSION TOUCHED PRODUCTION.** No database connection, no
credential sourced, no environment value read or printed. The evidence rows came
from the owner's SQL Editor exports, pasted into the dispatch.

## 1. BOOT

- Phase 2 board: 102 cards, 68 shipped, 32 todo, 2 blocked, 0 in flight, 0
  halted. Launch gate 6/9.
- Phase 3 board: 153 cards, 120 shipped, 32 todo, 1 blocked. Launch gate 0/9.
- Next eligible card: not determined. `scripts/poc/eligible.mjs` exited 0 and
  printed nothing. The dispatch names its own work.

## 2. THE FIRST DISPATCH HALTED, AND WHY

The morning dispatch asked for "R-199 CLOSED, both conditions met". It halted
before any write, for three reasons:

1. **R-199 condition (2) was unmet on the record.** Card `EXT-35` was `todo` and
   no ruling had waived it.
2. **No card was named as the R-199 close card.**
3. **The order_ids and timestamps were out of reach.** The only copies were the
   owner's SQL Editor exports on local disk, and the terminal's safety check
   refused the read. The refusal was not retried.

The resumed dispatch answered all three. The owner waived condition (2), named
the cards to consider, and pasted the rows.

## 3. VERIFY GATE

1. HEAD equals `origin/main` `c89c1cc` after fetch. `decisions/NEXT-RULING-ID`
   read `R-213`. `npm run id:free -- R-213` exit 0, with 0 open pull requests.
2. R-199 condition (2), quoted verbatim: *"(2) the EXT-35 fixture order exists
   in production, marked as fixture, excluded from real-data detection, every
   production step performed by Ivan."*
   - R-210 names **no report path**, so the report is
     `docs/extraction/r199-close-report.md`, the fallback the dispatch gave.
   - R-208 holds the sentence "that close happened on 2026-09-17".
   - The phase 3 board holds the same claim on P3-74, P3-75, P3-76, P3-80,
     P3-82 and P3-83.
3. **P2-08b acceptance** is one clause with seven parts, all read. **EXT-35
   status:** `todo`.
4. **Memory index**: restored from the scratchpad backup, then reduced by
   removing whole entries. See section 7.

## 4. WHAT CHANGED

| file | change |
|---|---|
| `decisions/inbox.md` | R-213 appended. A 9c correction added under R-208's false close-date sentence |
| `decisions/NEXT-RULING-ID` | `R-213` to `R-214` |
| `docs/board/rc-board-phase3.json` | a 9c correction appended to `defaults` on P3-74, P3-75, P3-76, P3-80, P3-82, P3-83. No status moves |
| `docs/extraction/r199-close-report.md` | new: the evidence report |
| `docs/reports/2026-09-27-executor-r199-close.md` | new: this report |

**Board deltas: none in status.** `P2-08b` stays `blocked`; the report names its
failing parts. `EXT-35` stays `todo`.

## 5. FINDINGS RECORDED

- **F26 confirmed**: MATNORD carries both `reconciliation_failed` and
  `unreadable_document`.
- **F27 stays open**: `platform_derived_partial` is false on all nine rows.
- **F29, new: R-211 was deployed and not triggered.**
  - Pull request #340 merged on 2026-09-21. `c89c1cc`, which contains it, was in
    Production from 13:15:48 UTC on 2026-09-27, 54 minutes before LUMICAST
    fired.
  - LUMICAST stored no platform verdict at all, so the `anchor_unknown` arm
    that R-211 keys on never fired.
  - The open question for Max: why a fixture built to miss a line total now
    arrives with every line carrying one.
- **F15 to F28** pass to Max under R-204, ids only.

## 6. CHECKS RUN LOCALLY, EACH EXIT CAPTURED ON ITS OWN LINE

`check:unique-ids`, `check:open-branch-ids`, `check:grant-revocation`,
`check:board-edit`, `check:card-ids`, `check:card-order`, `check:board-clock`,
`check:assertion-register`, `check:conflict-residue`, `check:board-app`, and
`validate-board.mjs` on both boards: **every one exit 0**.

## 7. DEVIATIONS

1. **F29 is recorded as neither option the dispatch offered.** "Not yet deployed"
   is disproven by the merge time and the deployment record. "Not honoured" is
   unsupported, because R-211's trigger (the `anchor_unknown` arm) is absent
   from the row.
2. **One owner sentence was corrected from the rows.** The first dispatch put
   Nordavex's code down to R-211. Its arm is `line_sum_missed`, so the rule is
   R-197. R-213 says so.
3. **No board artifact was republished.**
   - The phase 2 board is unchanged by this pull request: its render inputs match
     `main` exactly, so the rule "re-rendered after every board change" does not
     fire for it.
   - The phase 3 board, which did change, has never been published. Its
     `renders_to` says the first publish records its URL. Publishing it from an
     unmerged branch would show corrections not yet on `main`.
   - **Recommendation: first-publish phase 3 from `main` after this merges**, and
     record the URL in its `renders_to` in a board-only follow-up.
4. **Memory index**: 24,644 bytes restored, 16,934 bytes after removing whole
   entries (dated session logs whose topic files stay on disk, and retired
   items). No entry was truncated.
5. **The pull request number and the `quality` result are not in this file.** It
   is committed before the pull request is opened, per section 9b. Both are in
   the terminal report.

## 8. ADDENDUM, THE SAME DAY: THE PULL REQUEST, ITS CHECK AND THE BOARD ARTIFACT

Added by a later board-only pull request. Deviation 5 above said the pull request
number and the `quality` result were not in this file. They are recorded here:

- **The R-199 close pull request is #367**, branch `decisions/R-213-r199-close`,
  head `ba2235f`.
- **`quality` concluded success on that head.** `npm run checks:state 367`
  reported merge state `CLEAN`, and the docs-only fast path skipped only the
  steps it is built to skip.
- **The owner merged it as `7191704`**, at 2026-09-27 14:57:21 UTC. The terminal
  did not merge it.
- **Deviation 3's recommendation was carried out.** The phase 3 board was
  first-published as a claude.ai artifact, rendered from `main` at `7191704`, and
  its URL is recorded in `renders_to` in `docs/board/rc-board-phase3.json`.
