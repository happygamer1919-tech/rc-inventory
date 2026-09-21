# P3-85: an upload whose automatic reading cannot start says so at once (Ivan F21, part 1)

Role AUTHOR (the card), then EXECUTOR (the build), in one pull request. Run date 2026-09-21.
Operator factory goal G40.

## In plain words

Until now, when a document was uploaded but the automatic reading could not start (for example the
connection address was missing, or the document had 100 pages or more), the screen showed a normal,
successful upload. Nothing said that nothing would be read. Now the upload screen says it right away,
in Romanian: "Citirea automată nu a pornit." followed by the reason. The document itself stays saved,
and the failed entry still appears on the list at once.

## Boot report

- Phase 2 board: 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted. Launch gate 6/9. Lowest
  eligible card AUT-3.
- Phase 3 board (read too, RULE-05): 101 shipped, 32 todo. Launch gate 0/9. Lowest eligible card
  P3-14.
- This card was assigned directly by the owner's goal G40. Id from `npm run id:free -- P3-85`:
  FREE, lane highest P3-84, zero open pull requests.

## What changed

- `lib/data/extraction-types.ts`: new constant `EXTRACTION_NOT_STARTED = "Citirea automată nu a pornit. "`.
  It lives here because a "use server" file may export only async functions, and the tests import it.
- `lib/data/inbound-types.ts`: `ActionResult`'s failure arm gains an optional
  `saved?: { orderId?: string }`. Additive; no existing consumer changes.
- `lib/data/extraction-actions.ts` `startExtraction`: on `!fired.ok` the row write is exactly as
  before, then it returns `ok:false`, message = prefix + `fired.reason` unchanged, `saved: { orderId }`.
  Every other return unchanged.
- `lib/data/inbound-actions.ts` `uploadOrderDocument`: the fire result is captured. On `!fired.ok` it
  returns the same message and `saved: { orderId }`. The stored file and `document_path` are not
  undone. The old comment that the action "nu poate face actiunea sa para esuata" is replaced by the
  new rule and why.
- `components/orders/ExtractionReviewPanel.tsx` `onFile`: with `saved`, the banner
  (`extraction-error`) shows AND `router.refresh()` runs, so the failed draft card appears.
- `components/orders/OrderDocumentUpload.tsx` `onChange`: with `saved`, the banner (`doc-error`)
  shows, "Document atașat." is NOT shown, `onUploaded(message)` and `router.refresh()` run.
- `components/orders/InboundPanel.tsx` (the order panel on /comenzi): its `onUploaded` reloads the
  order, which unmounts the upload box and would hide the banner. The panel now keeps the message
  (keyed by order id) and shows it as `doc-warning` beside the document link. This file was not named
  in the task; it is the smallest change that keeps the rule "the message is not cleared" true on the
  third screen that hosts the upload box. Recorded in `docs/LEARNINGS.md`.

Not touched: `refireExtraction`, the cancel action, the callback route, `app/api/documents/**`,
`docs/contracts/extraction*`, the reasons and codes in `lib/data/extraction-fire.ts`,
`EXTRACTION_ERROR_LABEL`, the review list ordering. No migration.

Andre told: no, the route and the wire contract are unchanged.

## Tests

- `tests/e2e/extraction-webhook-missing.spec.ts` (project `fara-webhook`, server without
  `MAKE_WEBHOOK_URL`), wiring unchanged, cases 1 and 2 unchanged (only the import line grew by one name):
  - Case A = test 3 "G40 F21": owner uploads on /incarca-comanda; the failed `draft-card` appears with
    no navigation (proves the refresh); zero fires; row `failed` / `config_error`; `extraction-error`
    text is exactly `EXTRACTION_NOT_STARTED` + the reason read back through the callback GET; role alert.
  - Case B = test 4 "G40 F21": a product and an order are created through the UI (same helpers as
    `inbound.spec.ts`), the document is attached on the created-order screen; `doc-error` shows the
    prefix + the P3-71 reason, `doc-done` absent, and /comenzi still shows "document atașat" on the
    order. Driven end to end on the third server; no unit test fallback was needed. (There is no unit
    test runner in this repository in any case.)
- Case C = `tests/e2e/extraction.spec.ts` test 37 "G40 F21" on the normal server: a sent upload shows
  no `extraction-error`, the draft is in progress; a 100 page upload shows the banner with its stored
  `document_too_large` reason. Existing coverage of the order-lane success path: `inbound.spec.ts`
  "documentul se încarcă..." and `romanian-file-date.spec.ts` still expect `doc-done`.

## Spec inventory (step 6)

Grep of `tests/e2e` for `extraction-error`, `doc-error`, `doc-done`, `startExtraction`,
`uploadOrderDocument` before this change: `extraction-error` appeared in no spec; `doc-error` only in
`inbound.spec.ts` (wrong file type, nothing saved, unchanged path); `doc-done` in `extraction.spec.ts`
`orderWithDocument`, `inbound.spec.ts` and `romanian-file-date.spec.ts`, all on the normal server where
the fake transport always accepts, so the fire succeeds and `doc-done` still shows. Neither action name
appears in any spec.

Specs that exercise a refused fire, and what they still expect:
- `extraction-webhook-missing.spec.ts` case 1: waits for the draft card after upload, row failed /
  config_error, reason on the card. Still true: the screen refreshes after a saved failure.
- `extraction.spec.ts` case 33 (100 pages): waits for the draft card with zero fires, row
  `document_too_large`, label on the card, refire refused. Still true for the same reason.
- No spec asserts the ABSENCE of a banner on a refused fire, so no POC question was needed.
- The fake transport (`tests/e2e/support/make-mock.mjs`) never refuses, so no spec drives a
  "Make returned an error" upload.

## Commands run locally, each exit 0

`npx tsc --noEmit`, `npm run build`, the board validator on all three boards before every commit,
`check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`,
`check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`,
`check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`, `check:action-pins`,
`check:page-count`, `check:document-url`, `check:callback-keys`. `check:board-edit` refused while the
card was in_flight (expected) and is rerun after the flip to shipped. There is no lint script and no
eslint config in the repository, so no lint was run.

Left for CI: the whole Playwright suite (cases 3, 4 and 37 and every existing spec) and
`check:migrations`, because this machine has no Docker and no Supabase CLI.

## Observed, not fixed (scope)

- `uploadOrderDocument` does not write `status failed` on the draft row when a fire fails AFTER the
  row exists (signed URL failure, missing site origin, the other side answering an error, timeout);
  `startExtraction` does. On the order lane such a draft can stay "in lucru". The person now sees the
  message at upload, but the row does not say it. A follow-up card if wanted.
- Several reasons in `extraction-fire.ts` have no diacritics ("lipseste", "raspuns", "semnata"). They
  now reach the upload banner verbatim. Left unchanged because the task forbids rewriting the reasons
  and specs assert them. A follow-up card if wanted.

## Learnings

One entry appended to `docs/LEARNINGS.md`: a banner inside a box the parent reloads away dies with
the box.

## Merge

No self-merge: real client data is in production. The merge approval goes to the owner through the
factory mailbox once `quality` is green on the head sha and `checks:state` exits 0.
