# EXECUTOR report - unattended run 20260907-040001

**Role:** EXECUTOR
**Run:** 20260907-040001 (04:00 local, EDT), worktree `/Users/ivan/rc-inventory-poc-run`
**Base:** `origin/main` at `5aed3a3`
**Cap:** 45 minutes wall clock.

---

## 1. Boot status report, as printed before any write

```
BOARD docs/board/rc-board-phase2.json   as_of 2026-09-07T00:35:25Z
  shipped 64 | todo 13 | blocked 3 | in_flight 1 | halted 0
  launch gate: 6/9   (G4, G7, G9 fail)

BOARD docs/board/rc-board-phase3.json   as_of 2026-09-07T02:10:21Z
  shipped 40 | todo 32 | blocked 0 | in_flight 0 | halted 0
  launch gate: 0/9

NEXT ELIGIBLE CARD: EXT-11
```

42 cards were eligible across the two boards. `EXT-11` is the lowest id under
the tuple comparator in `scripts/poc/card-order.mjs`.

**The claim on EXT-11 was checked and was not a block.** `docs/poc/state.json`
held `EXT-11` claimed by `harness` at `2026-09-07T05:47:52Z`, two hours old and
inside the six hour window. `harness` is this actor, so it is this run's own
lease from the 01:00 run, not another actor's. `scripts/poc/eligible.mjs
--actor harness` agrees and lists the card. Nothing was taken from anybody.

## 2. Cards touched

### EXT-11 - todo/in_flight -> **shipped**

*The supplier's document series and number, stored as two facts.*

The 01:00 run had opened **PR #240** on branch `card/ext-11` carrying **only the
failing tests**, deliberately, and left an implementation plan in the card notes.
That plan was followed as written. This run built the implementation, flipped the
card to `shipped` with evidence, and pushed onto the same pull request.

**What it does for the product.** Every supplier invoice in Moldova carries a
letter code before its number. Until now the system threw both away, so two
different suppliers' invoices looked like the same document to it. It now records
the letter code and the number separately, shows both on the verification screen
where the operator can correct a misread, and carries them onto the order.

**The card's premise was false and this run recorded it rather than working
around it.** The acceptance says "wherever `order_ref` is stored, on orders and
on extraction drafts". `grep -rn order_ref supabase/migrations/` returns nothing:
it was stored nowhere. Contract section 4.1a said in terms that `order_ref`
arrives, is accepted and is IGNORED, and P3-31 assumes the same column and has
not shipped. Two cards each built on a field the other was assumed to have
landed. The card that needs the column created it: `order_ref` and
`order_ref_series` land together, because a series with nothing to qualify is not
an identifier. `client_ref` is untouched and stays P3-31's, per this card's own
defaults in the owner's words.

**Files.**

| path | what |
|---|---|
| `supabase/migrations/0036_supplier_document_series.sql` | **migration added.** Nullable `order_ref` and `order_ref_series` on `extraction_drafts` and on `inbound_orders`. No default, no unique constraint, nothing dropped, `inbound_orders.reference` untouched |
| `scripts/poc-free/local-db/assertions/0036_supplier_document_series.sql` | **assertions added.** Four columns exist and are nullable with no default; `reference` still NOT NULL and still unique; a row with a series, a row with none, and a second row with the same number under a different series all INSERT |
| `lib/data/schema-capability.ts` | `hasSupplierDocumentRef`, one gate for the file |
| `app/api/extraction/callback/route.ts` | reads both fields off the payload behind that gate; a payload omitting either is still 202 |
| `lib/data/extraction.ts`, `lib/data/extraction-types.ts` | the read path and the draft type |
| `lib/data/extraction-actions.ts` | the pair reaches the created order |
| `components/orders/ExtractionReviewPanel.tsx` | `review-order-ref-series` and `review-order-ref` inputs, in Romanian with diacritics |
| `docs/contracts/extraction-v2.md` | section 4.1, a quoted correction in 4.1a, a new 4.1b, sixteen fields corrected to seventeen |
| `docs/LEARNINGS.md` | three entries |
| `docs/board/rc-board-phase3.json` | EXT-11 shipped, evidence, `as_of` bumped |

**Acceptance, and what was actually run.**

| clause | run | result |
|---|---|---|
| `npx tsc --noEmit` exits 0 | locally | **exit 0** |
| `npm run build` | locally | **succeeds** |
| `npm run check:conflict-residue` | locally | **3 checks passed** |
| `npm run check:no-destructive-migration` | locally | **OK, no forbidden statement** |
| `npm run check:pending-schema-reads` | locally | **OK** |
| `node docs/board/validate-board.mjs` on both boards | locally, before every commit | **PASS, 0 violations** |
| `npm run check:migrations` (the assertions file) | **not run locally** | **Docker is not installed in this worktree.** The `quality` job runs it against a bare postgres and is the run of record |
| `npx playwright test tests/e2e/extraction.spec.ts` cases 25 and 26, and the named review.spec case | in `quality` | **the RED is run `34085557075` on sha `788e381`; the GREEN is the run on this head sha, which had not concluded when the cap arrived** |

**Two decisions taken under the board's wide defaults, logged in the card notes
and in the pull request rather than escalated.**

1. One capability gate for both columns instead of two. Every other gate in
   `schema-capability.ts` guards one column because those migrations are separate
   files that reach production separately. These two land in one transaction in
   one file, so no state exists in which one is present and the other is not.
2. The supplier reference reaches `inbound_orders` through an `update` after the
   RPC rather than through the RPC. `confirm_extraction_draft` has a fixed
   signature and a SQL function is recreated rather than altered, so adding two
   parameters means replacing the function every confirmed document passes
   through. The update is gated on the same probe and its failure cannot undo the
   confirmation.

**What was deliberately not done:** no uniqueness rule on the series and number
pair. Making the identifier complete is this card; deciding what happens when two
are equal is a decision nobody has made and is not made by a constraint written
in silence.

## 3. Pull requests

| PR | branch | state at cap |
|---|---|---|
| **#240** | `card/ext-11` | **open, NOT merged.** Head `4e23829`. Title and body rewritten to the full acceptance table. Merged `origin/main` in locally, so it is no longer `BEHIND`; branch protection is `strict: true` and would otherwise have refused. `quality` was running and had not concluded |
| this one | `report/20260907-040001` | this report |

**#240 WAS NOT MERGED AND THE REASON IS THE CAP, NOT A FAILURE.** `quality` takes
about 22 minutes. The implementation was pushed at roughly minute 36 of a 45
minute budget. A merge on a check that has not concluded is exactly what CLAUDE.md
section 3 forbids, and no green existed to merge on. Nothing about the change is
known to be wrong; it is unverified by CI, which is a different statement.

## 4. Escalations

**None.** No question was raised, nothing went to `ask.sh`, no card was blocked
on anybody. Both decisions above were inside the card's `defaults` and inside
this board's stated width, so per CLAUDE.md section 4b they were made, recorded,
and the run continued.

## 5. Second card

**None taken.** Section 13 allows two cards per run. The first consumed the
budget, and starting a second at minute 40 would have produced work that could
not be finished or merged, which section 13 forbids in terms.

## 6. What the next run should pick up first

1. **PR #240, before anything else.** Read the `quality` result for head sha
   `4e23829`. `npm run checks:state 240` prints the check result beside
   `mergeStateStatus`, which is the pairing CLAUDE.md section 3 requires: a green
   result attached to a sha nobody is proposing to merge is stale.
   - **Green:** merge it. EXT-11's board edit is already in the pull request, so
     the merge completes the card. **Merging applies `0036` to production within
     about two minutes, per CLAUDE.md 8.0.** The migration adds four nullable
     columns and drops nothing; `check:no-destructive-migration` passes on it.
   - **Red:** read the failing step. The two likely candidates are the
     `check:migrations` assertions against the bare postgres, and the three e2e
     cases against the local Supabase stack. Neither could be run in this
     worktree: Docker is absent.
2. **Release the claim on EXT-11** once #240 is merged.
3. **Then the next eligible card is `EXT-12`**, the extraction latency target,
   followed by `EXT-13` and `EXT-21`.
4. **Also open and untouched by this run:** #241 and #242 from the 01:00 run,
   #237 (EXT-10 outcome), #238, and #223 which is `DIRTY` and needs a local
   conflict resolution under R-052.
