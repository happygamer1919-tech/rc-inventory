# 2026-09-21 EXECUTOR report: G38, a digital partial with an unknown VAT flag stores an error code (card P3-83, Ivan F8, ruling R-211)

Role: AUTHOR (the card), then EXECUTOR (the code and the doctrine correction), in one pull
request, branch `card/p3-83`. The file name carries 2026-09-20 because the task named that path;
the run itself happened on 2026-09-21 UTC (the 2026-09-20 run did nothing, see the factory's q064).

## In plain words

When a supplier invoice arrives only partly read, and the reader cannot tell whether the prices
include VAT, and the line amounts match neither total on the page, the system already knew why it
was a problem but kept that reason in a background field only. Now the draft itself carries the
reason, and the review screen shows it in Romanian ("check the document" sentence), so whoever
opens the draft sees at once why it needs checking. Nothing else moves: the draft stays "partial",
its lines are kept, and nothing is refused that was accepted before.

Andre does not need to be told anything: this changes only what we store and show, not what the
connection accepts, refuses or answers.

## Boot

Phase 2: 68 shipped, 32 todo, 2 blocked. Launch gate 6/9. Next eligible: AUT-3. Phase 3: 99
shipped, 32 todo. Launch gate 0/9. Next eligible: P3-14. This run worked the task-assigned card.

## Ids

- `npm run id:free -- P3-83`: FREE, lane highest P3-82, zero open pull requests.
- `npm run id:free -- R-211`: FREE. `decisions/NEXT-RULING-ID` advanced to R-212 in the same commit
  as the ruling.

## What was confirmed in the code before changing it

- `classifyScan` in `lib/data/reconciliation.ts` returns `{ code: "unreadable_document", arm:
  "anchor_unknown" }` for `out_of_tolerance` with `pricesIncludeVat === null`.
- `platformCode` in `app/api/extraction/callback/route.ts` nulls only `reconciliation_failed`
  (the 0034 gate); `unreadable_document` passes through, so on this arm `platformCode` is always
  `unreadable_document`.
- The gap was exactly the `suppliedCode` ternary: on a code-less digital partial it surfaced
  `platformCode` only when it was `reconciliation_failed`.
- `effectiveStatus` carries `!digitalPartialWithoutCode`, so a code-less digital partial can never
  become `failed`, whatever `suppliedCode` holds.
- The HTTP code is decided only by `isRepeat`, and the response body is `{ order_id, status, lines }`
  with no `error_code`. So no status code or body changes for any payload.
- `platform_error_code` and `platform_arm` are written from `platformCode` and `platformArm`,
  untouched by this change.

## What changed

- `app/api/extraction/callback/route.ts`: the `suppliedCode` ternary gains
  `|| platformArm === "anchor_unknown"`, with a Romanian comment in the file's own idiom that marks
  the earlier comment's "error_code ramane null" as incomplete. The ARM is tested, not the code,
  because `unreadable_document` is carried by five arms and Max's decision names one.
- `scripts/poc-free/check-reconciliation.mjs`: the pin on the `suppliedCode` expression moved to the
  new rule, with the old pin quoted and kept under CLAUDE.md 9c. It pins the arm and nothing wider.
- `decisions/inbox.md`: new ruling R-211. R-197 part (a) gets the new rule first and its sentence
  "`error_code` stays null in that case." quoted, marked superseded for the `anchor_unknown` arm,
  and kept. R-197 part (c) item 2's "could only ever hold `reconciliation_failed`" is marked
  incomplete in place too, since it stops being true of what we store.
- `tests/e2e/extraction-digital-partial-vat-error-code.spec.ts`: new, three cases (below).
- `docs/board/rc-board-phase3.json`: card P3-83 authored, in_flight, then shipped with evidence.

## Acceptance: the named spec

1. Digital partial, no `error_code` key, `prices_include_vat` null, header 80 + 16 = 96 (16 is 20%
   of 80), lines 30 + 40 = 70: expects 202, body `{ status: "partial", lines: 2 }`, stored
   `error_code` `unreadable_document`, status `partial`, `platform_error_code`
   `unreadable_document`, `platform_arm` `anchor_unknown`, both lines kept, and the review row's
   error sentence equal to `EXTRACTION_ERROR_LABEL.unreadable_document`.
2. Control, known flag: the same with `prices_include_vat` false: `error_code`
   `reconciliation_failed`, arm `line_sum_missed`, status `partial`, lines kept, as before.
3. Control, nothing invented: unknown flag, lines 30 + 50 = 80: `error_code` null, no verdict, no
   sentence on screen.

Acceptance points 4 and 5 of the task (the known-flag case unaffected, every existing extraction
test unchanged): case 2 covers point 4. For point 5, every existing partial payload in
`tests/e2e/extraction*.spec.ts` and `tests/e2e/review.spec.ts` was read. None posts a code-less
digital partial with a null VAT flag and non-matching totals (the shared `callbackBody` fixture
carries `prices_include_vat: false`), so none reaches the changed branch. No existing test was
edited.

## Local gates, each exit 0

`npx tsc --noEmit`, `npm run build`, the board validator on all three boards before every commit,
`check:card-ids`, `check:board-edit`, `check:unique-ids`, `check:open-branch-ids`,
`check:no-destructive-migration`, `check:conflict-residue`, `check:categories`, `check:ledger-rows`,
`check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`,
`check:assertion-register`, `check:reconciliation`, `check:callback-keys`, `check:numeric-field`,
`check:board-clock`.

Left for CI: the Playwright end to end suite, including the new spec. This machine has no Docker
and no Supabase CLI.

## No migration

`unreadable_document` has been in the `error_code` enum since 0008. No file under
`supabase/migrations/` is added or changed.

## Left for a follow-up, named

`docs/contracts/extraction-v2.md` section 5.3a says that when our classification says anything
other than `reconciliation_failed` on such a payload "it is recorded and no code is stored". For
the `anchor_unknown` arm that is now incomplete. The task kept the contract documents read-only, so
it is not edited here; R-211 names it for the next card allowed to touch that file.

## Learnings

Nothing broke while working this card, so `docs/LEARNINGS.md` is left untouched.

## Merge

Real client data is in production, so this pull request is not self-merged. The pull request
number, CI result and merge state are recorded in the pull request itself and in the operator
factory's owner approval question.
