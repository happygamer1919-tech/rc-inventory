# 2026-09-18 EXECUTOR report: G37, a quantity-only delivery note is accepted (card P3-82, Ivan F17, ruling R-208)

Role: AUTHOR (the card), then EXECUTOR (the code), in one pull request, branch `card/p3-82`.

## In plain words

A supplier delivery note that lists goods and quantities but no prices used to be thrown out as
"unreadable" when it came in as a scan. Now it is kept: every line and its quantity is saved, the
prices stay empty, and the screen says "Document fără prețuri: cantitățile sunt citite, prețurile
se completează din factură". A document that is only partly read (some prices there, some missing)
is still refused exactly as before.

One thing for the owner to know: Andre's reader itself marks a no-values goods note as failed
(ruling R-205). When it does that, its own verdict wins (R-190), so that document still shows as
failed. Our side no longer refuses it; whether the reader sends it as read is on Andre's side.

## Boot

Phase 2: 68 shipped, 32 todo, 2 blocked. Launch gate 6/9. Phase 3: 98 shipped, 32 todo. Launch
gate 0/9. Next eligible by board order: AUT-3. This run worked the task-assigned card.

## Ids

- `npm run id:free -- P3-82`: FREE, lane highest P3-81, zero open pull requests.
- `npm run id:free -- R-208`: FREE. `decisions/NEXT-RULING-ID` advanced to R-209 in the same commit
  as the ruling.

## What changed

- `lib/data/extraction-types.ts`: `QUANTITIES_ONLY_NOTICE` (Max's words, verbatim) and
  `isQuantitiesOnly`: at least one line, EVERY line total null, subtotal null AND document total
  null. Client-importable, so the screen and the reconciliation read one definition.
- `lib/data/reconciliation.ts`: `ReconcileVerdict` gains `{ ok: true, reason: "quantities_only" }`;
  `reconcile()` returns it before rule 3 (`line_total_missing`). `classifyScan` already maps any
  `ok` verdict to `{ refuse: false }`; its exhaustive switch over the refusing reasons and the
  `never` guard are untouched. No new arm: `platform_arm` stays constrained to six values by 0037.
- `components/orders/ExtractionReviewPanel.tsx`: the note on the document row
  (`data-testid="draft-quantities-only"`) for an extracted or partial draft whose stored lines and
  totals match the same predicate.
- `scripts/poc-free/check-reconciliation.mjs`: section 10 pins the predicate text, the note text,
  the order (asked before `line_total_missing`), that it is not an arm, and a six-row specification
  of which shapes qualify.
- `tests/e2e/extraction-quantity-only-delivery-note.spec.ts`: new, three cases (below).
- `decisions/inbox.md`: R-208. `decisions/NEXT-RULING-ID`: R-209.
- `docs/board/rc-board-phase3.json`: card P3-82, authored in_flight, flipped to shipped.
- `docs/LEARNINGS.md`: one entry (the panel's second import block).

## Decision stated, as the task asked: where the note lives

Neither `reason` nor a new column. `reason` is the sender's field, stored as sent; overwriting it
hides what the reader said. A new column needs a migration for a fact already in the stored lines
and totals. The note is derived at render from the stored draft through `isQuantitiesOnly`. Side
effect, intended: a DIGITAL priceless document (never judged, already accepted) shows the note too.

## Not changed

`app/api/extraction/callback/route.ts` (not edited), every other reconcile and classifyScan arm,
every HTTP code, `app/api/documents/**`, `docs/contracts/extraction*`. No migration.

## Acceptance

1. Scan, extracted, no code, three lines with quantities 12, 30, 4 and null prices, no header total:
   202, body `extracted`/3 lines, stored extracted, `error_code` null, platform verdict null,
   quantities kept, prices null, note shown verbatim on the review row.
2. Scan with one line priced and one not, no header total: failed, `unreadable_document`,
   `line_total_missing`, lines dropped, no note.
3. Scan with a sound header total and (a) one line without a total, (b) all lines without a total:
   same refusal, no note.
4. Every existing `tests/e2e/extraction*.spec.ts` runs unchanged in the same CI step. The existing
   cases that send null line totals (extraction.spec cases 3 and 8) declare `digital`, which
   classifyScan never judges, so they are unaffected.

## Commands run locally, each exit 0

`npx tsc --noEmit`, `npm run build`, board validator on all three boards before every commit,
`check:card-ids`, `check:board-edit` (after the shipped flip; before it, it refused as designed),
`check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`,
`check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`,
`check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`,
`check:reconciliation`, `check:callback-keys`, `check:numeric-field`, `check:board-clock`.

Left for CI: the Playwright suite (needs Supabase and Docker, which this machine lacks).

## Andre

His side must change nothing: our side stops refusing, and nothing accepted before is refused now.
This factory has no channel to him; the pull request body states it.

## Merge

Not self-merged: real client data is in production. The pull request number, CI result and merge
state are in the pull request itself and in the factory's close-out.
