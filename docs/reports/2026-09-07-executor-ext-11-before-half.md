# EXECUTOR, run 20260907-010004

**Role:** EXECUTOR, unattended scheduled run, CLAUDE.md section 13.
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, detached at `origin/main` (`5428c2e`).
**Window:** 01:00 local, 45 minute cap.

---

## Boot status report

| | |
|---|---|
| phase 2 board | shipped 64, blocked 3, todo 13, in_flight 1 |
| phase 2 launch gate | 6/9 |
| next eligible card | **EXT-11**, "order_ref carries the supplier's document series, not only its number, because two suppliers can both issue 0009312." |

Blocked, phase 2: P2-08b on `andre`, P2-14 on `client`, MIG-01 on `ivan`.
In flight, phase 2: AUT-3.

Eligible across both boards at start, in card-order:
`EXT-11, EXT-12, EXT-13, EXT-21, GATE-01, GATE-02, P3-13c, P3-14, P3-15, P3-16, P3-17, P3-19, P3-20, P3-21, P3-22, P3-23, P3-24, P3-25, P3-26, P3-28, P3-29, P3-29a, P3-29b, P3-29c, P3-30, P3-31, P3-32, P3-35, P3-36, P3-37, P3-39, GATE-03, LEARN-01, MIG-02, P2-20, RESTORE-01, RST-02, RST-03, RST-04, RST-05, RULE-03, RULE-05`

No card was claimed by another actor. `docs/poc/state.json` still holds a claim on
**EXT-10**, taken by `harness` at 2026-09-07T03:29:08Z, and EXT-10 shipped in
`#236`. It is a stale claim on a finished card and it blocked nothing this run,
because a shipped card is not eligible. It expires on its own six hour lease.

---

## Cards touched

### EXT-11, moved `todo` -> `in_flight`. NOT shipped.

**PR #240 opened**, branch `card/ext-11`, one commit: `0211239`.

What is on it: the three new acceptance cases and nothing else.

- `tests/e2e/extraction.spec.ts`, cases 25 and 26: a callback carrying
  `order_ref: "0009312"` with `order_ref_series: "TG"`, read back as two separate
  values, and the same callback with no series at all, accepted, with the series
  reading back NULL.
- `tests/e2e/review.spec.ts`, one named EXT-11 case: the series visible on the
  review form, edited by the operator, and the edited value read back off the
  created inbound order.

All three fail today. That is the point of the commit.

**Why the implementation is not on it.** The acceptance line requires the case
*failing before the change and the pull request showing both results*. `quality`
runs about 22 minutes, and `.github/workflows/quality.yml` sets
`concurrency.cancel-in-progress: true` on `quality-${{ github.ref }}`, so a second
push inside that window CANCELS the first run. A 45 minute harness window cannot
hold two concluded runs on one ref. The tests are therefore pushed alone and left
to record the red; the implementation is the next commit and records the green.
Both results are then readable from #240, which is exactly what the card asks.

**The finding that changes the card's shape, and it is the substantive result of
this run.** `order_ref` is stored **nowhere in this schema**:

- `extraction_drafts` has no such column. `grep -rn "order_ref" supabase/migrations/`
  returns nothing.
- `inbound_orders.reference` is OUR reference, under
  `inbound_orders_reference_unique`. It is not the supplier's.
- `docs/contracts/extraction-v2.md` section 4.1a says in terms that `order_ref`
  arrives from Andre, is accepted, and is **ignored**, and names EXT-11 and P3-31
  as the cards that will give it a shape.
- **P3-31 is still `todo`**, and its own acceptance line reads "a nullable
  `client_ref` column alongside the EXISTING `order_ref`". It assumes the column
  as well.

Two cards each built on a field the other was assumed to have landed. EXT-11's
own defaults settle which one creates it: "This card touches the SUPPLIER's
identifier only." So EXT-11 lands `order_ref` and `order_ref_series` together, a
series with nothing to qualify not being an identifier, and `client_ref` stays
untouched and stays P3-31's. This was decided under the card's defaults and
recorded in its notes rather than escalated: section 4b, a choice the card's own
defaults already answer.

### No second card

The run's remaining wall clock after opening #240 was under ten minutes, which is
less than a single `quality` cycle. Starting EXT-12 would have produced a second
branch nobody could take to green, and section 13's directive is not to start
work that cannot be finished and merged.

---

## Escalations

None written. Nothing this run needed a decision outside the executor's
authority, and the one ambiguity that could have been escalated (which card owns
`order_ref`) is answered by EXT-11's own `defaults` field.

---

## Learnings appended

Two entries in `docs/LEARNINGS.md`, on the `card/ext-11` branch:

1. *A card whose acceptance names a column that no migration ever created.*
2. *The before-and-after proof does not fit in one harness window.*

---

## What the next run picks up first

**EXT-11, on the existing branch `card/ext-11` and the existing PR #240. Do not
open a second branch and do not re-derive the plan: it is written out in the
card's `notes` on the phase 3 board.**

1. **Read the `quality` result on `0211239` first.** It is expected RED, with
   cases 25, 26 and the named EXT-11 review case failing. That red is the
   acceptance's "before" half and it must be recorded in the PR body before the
   next push, because pushing replaces it.
2. Then build, in this order:
   - `supabase/migrations/0036_supplier_document_series.sql`: nullable
     `order_ref` and `order_ref_series` text on `public.extraction_drafts`, and
     the same pair on `public.inbound_orders`. No default, no NOT NULL, nothing
     dropped, `inbound_orders.reference` and its unique constraint untouched.
     **Merging this file applies it to production** (CLAUDE.md 8.0, R-124), so
     `npm run check:no-destructive-migration` must run and pass, not skip.
   - `scripts/poc-free/local-db/assertions/0036_supplier_document_series.sql`: a
     row with a series and a row without both INSERT, both columns nullable,
     neither carries a default.
   - `lib/data/schema-capability.ts`: a `hasExtractionOrderRef` gate of its own.
     Not folded into the `page_count` or `document_source` gates, for the reason
     the callback route already writes down: two migrations reach production
     separately, so each write asks about its own column.
   - `app/api/extraction/callback/route.ts`: read both fields behind that gate. A
     payload omitting either is still 202.
   - the confirm path, so both values reach the created inbound order.
   - `components/orders/ExtractionReviewPanel.tsx`: `review-order-ref-series` and
     `review-order-ref` inputs.
   - `docs/contracts/extraction-v2.md`: move `order_ref` and `order_ref_series`
     out of 4.1a's accepted-and-ignored table into section 4.1 proper.
3. Merge on green `quality` for the head sha, with `npm run checks:state 240`
   read beside it.

After EXT-11, the next eligible card is **EXT-12**, the extraction latency
target. It needs no migration and no Docker and fits a single window.

---

## Housekeeping

This report is on branch `report/20260907-010004`, not on `card/ext-11`, and that
is deliberate: a second push to `card/ext-11` would cancel the in-progress
`quality` run whose red result the card's acceptance depends on. The report PR
carries no code and merges on its own green.

`npx tsc --noEmit` exit 0. `node docs/board/validate-board.mjs
docs/board/rc-board-phase3.json` PASS, 0 violations. No secret value was read,
printed, logged or committed. Nothing was pushed to `main`, nothing was force
pushed, and nothing was merged.
