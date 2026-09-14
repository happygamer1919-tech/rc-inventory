# EXECUTOR report: P3-39, the review screen past the row cap

**Role:** EXECUTOR. **Date:** 2026-09-14 UTC (started 2026-09-13 local). **Branch:** `card/p3-39-fix`, cut from `origin/main` at `8372d39`. **Pull request:** #285.

## Boot status, phase 2 board

- Cards by status: 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted.
- Launch gate: 6/9.
- Next eligible card: AUT-3. This run was dispatched to P3-39 on the phase 3 board (RULE-05 defect: section 1 names only phase 2). P3-39 was eligible there: todo, not blocked, and its one dependency P3-38 reads `shipped`, checked on the board rather than taken from the dispatch.

One deviation from section 1, stated rather than buried: the worktree was created before the status report was printed, because the dispatch orders that step first. No file in the repository changed before the report, and the first board edit came after it.

## Why the branch is not `card/p3-39`

`origin/card/p3-39` exists and is unrelated: it carried PR #226, merged 2026-09-06, the AUTHOR work that carded this defect, and was never deleted. This work is on `card/p3-39-fix`, fresh from `origin/main`.

## Cards touched

| Card | Status at end |
|---|---|
| P3-39 | shipped (pending merge of #285 at the time of writing) |

## The defect, as found on main

`lib/data/extraction.ts` read the pending drafts with no range and no count, ordered `fired_at` descending, nulls last. PostgREST caps a flat list at its row limit and says nothing, so past the cap the tail vanished, and the tail is the documents waiting longest. A capped answer and a complete one were the same value to every line below the read.

## What changed

- `lib/data/id-list.ts`: `ROW_PAGE_SIZE`, one named constant beside `ID_LIST_BATCH_SIZE`, and `readAllPages(what, fetchPage, size)`. Each page asks for the total in the same request. The next page starts after the rows that came back, not after the rows asked for, so a server capping below the page size costs more requests and loses no rows: the page size is not a threshold. It throws on a server error, a missing total, a total that changes between pages, an empty page before the total, and more rows than the total.
- `lib/data/extraction.ts`: `listReviewDrafts` reads through `readAllPages` with `{ count: "exact" }` and `.range(from, to)`, ordered `fired_at` descending nulls last, then `order_id`, so pages join by position. The embedded lines are untouched (P3-38 measured that the cap applies per parent on an embed). The P3-38 error read now lives inside the pager with the same message.
- `tests/e2e/review.spec.ts`: two cases (below), their helpers, and one sentence on the P3-38 probe constant whose comment this fix made untrue.

No migration. No new dependency. No leads files touched.

## The choice, and the rejected alternative

**Chosen: paging until exhausted, with the count in the same request.**

**Rejected: a server-side read that cannot exceed the limit.** The pending set has no server-side bound that is not itself a cut; it grows with unreviewed documents, and showing part of it is the defect. The only single-response shape is a function returning everything as one JSON row. That is a migration, and it moves the limit from row count to response size instead of removing it. Raising `max_rows` was rejected by the card's own defaults. No on-screen notice about the ordering was added, because the fix removes the cap instead of living with it.

Both are recorded on the card's `evidence`.

## Acceptance, clause by clause

| clause | how it is met |
|---|---|
| named test, oldest draft beyond the row limit, fails first | "P3-39: ciorna cea mai veche in asteptare se vede si cand lista trece de limita de randuri", the last case in `review.spec.ts`. Red on run 34797686347, output below |
| count compared in the same request, short answer is a visible failure | `readAllPages`; proved by "P3-39: citirea pe pagini aduna tot sub o limita mai mica decat pagina, iar un raspuns scurt este un esec vizibil" against fake servers |
| limit measured by the test, never a literal | `measureRowLimit`: one unlimited read with `Prefer: count=exact`, rows returned against the content-range total, doubling sent drafts until they differ. Printed to the run log as `P3-39 limita masurata: ...` |
| choice and rejected alternative on the card | P3-39 `evidence` |
| `npx playwright test tests/e2e/review.spec.ts` exits 0 | inside the `quality` End to end step on the implementation head |
| `npx tsc --noEmit` exits 0 | locally on both heads, and in `quality` |

### How the screen case places a draft past the cap

It counts only drafts WITH `fired_at`. P3-38's filler has none, and nulls sort last, so those rows never push the oldest draft down. It tops up sent drafts to the measured limit plus a margin, inserts one draft a day older than the oldest sent draft, asserts that the number of sent drafts ahead of it is at least the limit, then reads `/incarca-comanda` for that draft's card. It is the last case in the file on purpose: it leaves more pending drafts than the limit behind, and nothing is deleted or marked confirmed.

## Red first

Quality run **34797686347** on `7100533`, the head carrying the case with no application change, concluded **failure at End to end only**. Every step in front of it passed; both applier proof steps were skipped, correctly, with no migration.

- **1 failed, 218 passed (23.7m).** The one failure was the new case, at `review.spec.ts:1495`:

```
Error: documentul care asteapta de cel mai mult timp este pe ecran
expect(locator).toHaveCount(expected) failed
Locator:  locator('[data-testid="draft-card"][data-order-id="e82d76a9-bdcf-405e-a31a-007f3a29c546"]')
Expected: 1
Received: 0
Timeout:  60000ms
```

- Every other `review.spec.ts` case passed on that run, including P3-38's case 15 and EXT-11, which run before it.

The screen rendered and the oldest draft was not on it: the defect exactly as carded. The implementation was pushed only after this run concluded, because `quality` cancels an in-progress run on a new push.

## Green after

The quality run on the implementation head, the commit that carries this report. Its id and result are recorded in pull request #285, not here, because writing them into this file would move the head away from the run that proved it.

## Local commands

No Docker and no Supabase CLI on this machine, so the end to end suite and the applier proofs ran only in CI.

- `npx tsc --noEmit`: exit 0 on the red-arm head and on the implementation.
- `npm run build`: exit 0 on both.
- Board validator on all three boards: 0 violations before every commit.
- `check:card-ids`, `check:board-edit`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`, `check:conflict-residue` (after staging), `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`: all exit 0 on both heads.
- `readAllPages` was also exercised locally with Node 22 type stripping against the same fake servers the case uses: all five behaviours as expected.

## What broke along the way

- `check:board-edit` refuses a head with the card `in_flight`, and it runs before End to end, so a red arm at `in_flight` never reaches its proof. Handled with the known shape (`shipped` plus an evidence ref starting "RED ARM ONLY"), already in `docs/LEARNINGS.md`, so no new entry.
- One design trap, recorded as a new `docs/LEARNINGS.md` entry: a seeded row that sorts last cannot push anything past a row cap, and offset paging needs a unique tiebreaker.
- A local `tsc` error from a missing import, fixed before any commit.

## Left for the owner

Nothing on this card. The hosted project's own row limit is still unmeasured, because production holds no extraction drafts to page, and the fix no longer depends on it. The sibling list reads in `lib/data` without a range, which the card names as out of scope, are untouched.
