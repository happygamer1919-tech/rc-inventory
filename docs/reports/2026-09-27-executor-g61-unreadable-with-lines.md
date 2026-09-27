# EXECUTOR report: G61, card P3-104, ruling R-212

**Date:** 2026-09-27
**Role:** AUTHOR, then EXECUTOR, in one pull request
**Branch:** `card/p3-104`, cut from `origin/main` at `a10ec7f`
**Worktree:** `/Users/sm33xy/Projects/rc-inventory-worktrees/g61-unreadable-with-lines`
**Goal:** operator factory GOALS.md G61, Ivan's finding F24, decided by Max as
platform owner (R-207) on 2026-09-27, option (b), in
`mailbox/answers/q088-poc-f24-b-f25-supersede.md`

---

## In plain words, for the owner

The machine that reads supplier documents sometimes says "I could not read this"
and sends the goods and quantities it found anyway. Until today that document
landed in the failed pile and nobody could work with it, even though the
quantities were sitting right there.

From this card it goes to the person who checks documents instead. The quantities
are filled in, the prices are left empty, and a line on screen says the prices are
taken from the invoice. What the reading machine itself reported is still shown on
the row, so nobody loses the fact that it was unhappy with the document.

A document that really could not be read, one that comes back with nothing on it,
still lands in the failed pile exactly as before. So does any document that comes
back with a different complaint.

---

## The single condition that decides the new arm

**The sender's status is `failed`, the sender's `error_code` is
`unreadable_document`, and at least one line item carries a quantity above zero.**
That is the whole condition, and it is Max's sentence unchanged.

It is written once, as `isUnreadableWithReadQuantities` in
`lib/data/extraction-types.ts`, beside `isQuantitiesOnly` and in the one file both
the client and the server can import. A `lines` key that is absent, `null`, `""`
or an empty array does not qualify, because none of them carries a line; a line
whose quantity is `null`, zero, negative or not finite does not qualify either.

The condition deliberately does NOT also require the quantities-only shape,
because the owner did not write that. The consequence is recorded rather than left
to be discovered: a payload that matches the condition and nonetheless carries
prices or a header total lands in review as a `partial` WITHOUT the note, because
`isQuantitiesOnly` is false of it. That is the correct answer. The note says a
document has no prices, and that document has some.

---

## What is stored, and why `partial` was the only status available

| field | value | why |
|---|---|---|
| `status` | `partial` | see below |
| `error_code` | `unreadable_document`, as sent | R-190's recording half is untouched |
| `reason` | exactly as sent | R-208: the note is derived, never written into `reason` |
| every line | kept, with its quantity | the lines are the whole point of the card |
| `unit_price`, `line_total` | `null`, as sent | nothing is invented |
| `platform_error_code`, `platform_arm` | `null` | our classification does not run on a digital failure, and `null` means "did not run" |

**`partial` is not a preference.** Two things are required at once: the document
must land in review, and the sender's code must stay on the row.

- The review screen offers the "Verifică" button on `extracted` and on `partial`
  only (`components/orders/ExtractionReviewPanel.tsx`), so `failed` cannot reach
  review.
- Migration `0041` replaced `extraction_drafts_error_code_matches_status` so that
  `error_code` is required on `failed`, **forbidden on `extracted`** and optional
  on `partial`.

`extracted` would therefore have had to discard the sender's code, which is
exactly what R-190 exists to forbid, and keeping the code on `extracted` would
have been refused `23514` by the database and answered `500` to Make, which
retries on `5xx`. `partial` is what is left, and the chip on screen already reads
"Parțial" rather than "Eșuat".

---

## One condition, one code path, and the screen is not edited

R-208's own reasoning requires the reconciliation and the screen to decide with
the same single condition so the two cannot disagree. That property is kept, and
kept by doing less rather than more.

`quantitiesOnlyDraft` in `ExtractionReviewPanel.tsx` has admitted `extracted` and
`partial` since P3-82, and it reads `isQuantitiesOnly`. Routing this payload to
`partial` therefore makes the EXISTING condition true of the stored row, and the
note appears with **no edit to `ExtractionReviewPanel.tsx` at all**. No second
reader of the quantities-only shape was written.

The new arm asks a differently shaped question, about what the SENDER said rather
than about what was stored, so it is a second function and not a widening of
`isQuantitiesOnly`. It lives in the same file, for the same reason that file exists.

---

## Both R-190 and R-208 were narrowed, by one ruling

Ruling **R-212** is in `decisions/inbox.md`, allocated with
`npm run id:free -- R-212`, with `decisions/NEXT-RULING-ID` advanced to `R-213` in
the same commit. It states the surviving rule first, as CLAUDE.md section 9c
requires, and quotes, marks and keeps both narrowed sentences, in the ruling and
also in place where each stands.

**Sentence one, R-190:**

> *"when the payload carries an error_code, it is authoritative. Our
> classification runs anyway and is recorded, never substituted."*

**Sentence two, R-208:**

> *"A payload that carries its own `error_code` is authoritative under R-190, so
> such a payload stays failed on our side after this ruling too, and R-205's
> regression expectation still holds."*

**Both, and by ONE ruling, on purpose.** R-208 is not a citation of R-190; it is a
second assertion of the same claim, in its own words, about this exact payload. A
ruling that narrowed R-190 and left R-208 standing would have left the doctrine
contradicting itself, which is the defect Ivan's finding F19 was raised for and
which card P3-79 had to correct in CLAUDE.md section 3.1.

**The surviving rule, stated first in R-212:** the sender's `error_code` remains
authoritative in every case except `unreadable_document` accompanied by at least
one line item with a quantity above zero. `unreadable_document` itself still wins
on every payload that carries no such line, no other code is ever overridden, and
our classification still substitutes itself for nothing.

---

## R-205 was CHECKED and is unaffected

R-205 fixes the R-199 regression file and its expected shape, quoted from the
ruling:

> *"failed, error_code unreadable_document, document_source digital, **lines []**."*

**That payload carries no lines at all, so R-212's condition cannot fire on it and
it still stores as failed. R-205's regression expectation survives untouched**,
and its pass condition (the stored draft must show `supplier_name` and
`_meta.page_count` populated; a `2xx` alone is not a pass) is not relaxed.

**How it was checked rather than assumed.** The regression file is a PDF in
production storage at `rc-docs/_samples/andre/aviz-silvamat-0044213.pdf`. **No
payload fixture for it exists anywhere in this repository**, so the repository's
only statement of its shape is R-205's own sentence, repeated in
`docs/reports/2026-09-17-executor-andre-resign-and-signing-scope.md` line 129.
Both say `lines []`, so there is nothing here that contradicts the ruling and no
mailbox question was needed.

The nearest shape this repository actually executes is **case 25 of
`tests/e2e/extraction.spec.ts`**, which posts `document_source: "digital"`,
`status: "failed"`, `error_code: "unreadable_document"` and `lines: []` and
asserts the draft stores `failed` with zero lines. That case is untouched by this
card and still passes. The new spec asserts the same shape again, in its own case
2(a), so the expectation is pinned by this card as well as inherited.

---

## The arm is digital by construction, and nothing new enforces that

EXT-20 answers `400` to a SCAN failure that carries the `lines` key at all
(`app/api/extraction/callback/route.ts`, the `scanFailure && carriesLinesKey`
refusal), and a scan failure that omits the key has no lines. So no scan-sourced
payload can ever satisfy R-212's condition.

That refusal is **not touched and not restated**. Writing a `document_source`
clause into the new condition would have been a second enforcement of a rule
already enforced upstream, which is the thing that silently reverses the day
somebody changes the upstream rule. Where it is enforced is written down instead:
in the ruling, in the function's comment and in the spec's header.

---

## What did not change

- **What the route accepts, refuses and answers.** Same status codes, same error
  texts, same `202` against `200` duplicate decision, still read from `callback_at`
  alone. `callback_at` is not cleared anywhere and the idempotency key is still
  `order_id`.
- **The `status` field of the accepted body mirrors the STORED status**, as it has
  since EXT-16, so on this one payload shape it reads `partial` where it read
  `failed`. That is this card's change to our storage showing through a mirror, not
  a change to the contract, and the pull request body says so in one line.
- **Every other sender `error_code`.** One code, one extra condition. Our
  classification starts overriding the sender nowhere else.
- **`ExtractionReviewPanel.tsx`, `lib/data/reconciliation.ts`, every contract
  document and every existing test.** Not one line.
- **No migration.** `git diff --name-only origin/main...HEAD` lists no file under
  `supabase/migrations/`. `unreadable_document` has been in the enum since `0008`
  and `partial` with a code has been permitted since `0041`.

---

## Files changed

| file | what |
|---|---|
| `decisions/inbox.md` | ruling R-212; the narrowing marks in place at R-190 and at R-208 |
| `decisions/NEXT-RULING-ID` | `R-212` to `R-213`, same commit as the ruling |
| `docs/board/rc-board-phase3.json` | card P3-104 authored, then flipped to `shipped` |
| `lib/data/extraction-types.ts` | `isUnreadableWithReadQuantities`, the one condition |
| `app/api/extraction/callback/route.ts` | that condition routes `effectiveStatus` to `partial` |
| `tests/e2e/extraction-unreadable-with-lines.spec.ts` | the acceptance, four cases |
| `docs/LEARNINGS.md` | three ERROR and SOLUTION pairs |
| `docs/reports/2026-09-27-executor-g61-unreadable-with-lines.md` | this report |

---

## The acceptance

`npx playwright test tests/e2e/extraction-unreadable-with-lines.spec.ts`, run by
the End to end step of the `quality` check on the head sha. Four cases named
"G61 F24":

1. **The new arm.** A value-less aviz with `status: failed`,
   `error_code: unreadable_document`, `document_source: digital` and three lines
   carrying quantities above zero and no prices: answered `202`, body reports
   `status: partial` with three lines, the stored draft reads `partial` and never
   `failed`, the sender's code is still on the row, every line is kept with its
   quantity, every `unit_price` and `line_total` reads `null`, and the screen shows
   the chip "Parțial", the "Verifică" button, and the sentence "Document fără
   prețuri: cantitățile sunt citite, prețurile se completează din factură", read
   both literally and from `QUANTITIES_ONLY_NOTICE` so the screen and the proof
   cannot diverge.
2. **The two controls that keep R-205.** `lines: []` stores `failed` with zero
   lines; a payload whose every line carries quantity `0` also stores `failed`.
   Neither shows the note and neither offers the "Verifică" button.
3. **R-190 for every other code.** The same shape with
   `error_code: download_failed` and three lines with quantities above zero stores
   `failed` with `download_failed`, no note, no review button.
4. **The sender's fields as sent.** `reason` reads back byte for byte, does not
   contain the derived note, and `error_code` reads back `unreadable_document` on
   the row that landed in review.

Fixture values carry both the run id and a per-case tag, per the P3-101 learning:
every row a case writes is visible to every case after it, because test data is
never deleted here.

---

## Commands run locally, each alone, each exit 0

`npx tsc --noEmit`, `npm run build`, the board validator on all three boards before
every commit, `npm run check:card-ids`, `npm run check:unique-ids`,
`npm run check:open-branch-ids`, `npm run check:no-destructive-migration` (0 files),
`npm run check:conflict-residue` (run after `git add`),
`npm run check:categories`, `npm run check:ledger-rows`,
`npm run check:no-prod-target`, `npm run check:pending-schema-reads`,
`npm run check:removal-safety`, `npm run check:assertion-register`,
`npm run check:board-clock`, `npm run check:board-edit` re-run after the board flip,
and `npx playwright test --list`, which collects all four cases.

**This machine has no Docker and no Supabase CLI**, so the bare-postgres apply,
both applier proofs and the End to end suite run only in CI, and nothing here
claims otherwise.

---

## No production access

No production row was read, no live site was opened, and no credential was
sourced. The R-205 fixture was reasoned about from the ruling and from committed
reports, never from storage. Every assertion in this card is proved in CI against
the local stack.

## No merge from this terminal

Real client data has been in production since 2026-09-14. This pull request is not
self-merged whatever it touches. The owner question is filed with the pull request
number and the head sha when `quality` concludes green.
