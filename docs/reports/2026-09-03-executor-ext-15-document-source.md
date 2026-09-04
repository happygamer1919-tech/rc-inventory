# EXECUTOR, 2026-09-03: EXT-15, the source of the text, and what an unread scan shows

Card **EXT-15**. Branch `card/ext-15`.
**Migration added:** `0032_extraction_document_source.sql` - **authored and merged, NOT applied**.

---

## 1. Nothing in the system could tell a scan from a digital document

The rules the owner set after the scan result all turn on one distinction: a document the model **read as text** is treated differently from one it **looked at as an image**.

There was no way to know which:

- **`mime_type` does not answer it.** One of the four sample documents is a **PDF with no text layer**, so `application/pdf` covers both cases.
- **`_meta.characters_extracted` was the only proxy**, and EXT-09 removes it - with the file handed straight to the model, that number could only ever be null.

Only the extractor knows, so the extractor declares it. `document_source`, `scan` or `digital`, **null read as `scan`**.

**The asymmetry is the reason for that default.** Guessing `digital` on a scan costs invented stock in a real warehouse. Guessing `scan` on a digital document costs somebody keying it in by hand.

**A value outside the set is rejected, not ignored.** A stray third value would fall through into the safe branch - correct by accident today, silent on the day somebody adds a third source and forgets a branch.

## 2. A failed draft had no route to its own header, and the test found it

The upload screen showed a `failed` document its error code and a **Retrimite** button and nothing else. The supplier, the document number, the date and the printed totals - which **read correctly** on the observed scan - were not visible anywhere.

The card asked for a screen that shows them, so the card had to add the way in.

**The control is called `Vezi antetul`, not `Verifică`.** A button named like the other one promises an accept path that does not exist and must not.

## 3. The hard requirement, and where it is enforced

> no accept path, no pre-populated line fields, and the screen must say the contents were not read

The panel returns **before** rendering the form. The test asserts, individually rather than as one container check, that `review-form`, `review-confirm`, `review-line`, `review-supplier`, `review-currency`, `review-ordered-at`, `review-expected-at` and the three line inputs all have **count 0** - and that `draft-review` is absent from the card, so the path is not hidden, it does not exist.

**The refusal is also in the server action.** `confirmExtractionDraft` reads the status and source **back from the database** and refuses. A server action is an execution path of its own: anyone can call it, and **a guard proven on one execution path is not a guard**. Same doctrine EXT-16 carries about reconciliation, applied to an edge instead of a number.

**The predicate is defined once** and used by both the card list and the panel. Two copies could disagree, and the disagreement that matters is the one where the list offers a button to a panel that renders the form.

## 4. A text column with a check, not an enum, and the reason is measured

P3-33 added two labels to `unit_code` **the day before**, and that migration had to be **split in two**: a new enum label cannot be used in the transaction that added it, and `supabase db reset` wraps each file in one.

A third source value here would cost the same split. Widening a check constraint costs one migration with no transaction hazard on any of the three runners this repository applies migrations with.

**No column default, and the assertion file checks for its absence.** A default of `'scan'` would have rewritten every draft stored before this migration into a claim nobody made. Rows that predate it stay null; only the **application** reads null as `scan`, and only for new payloads.

## 5. The contract records why this self-report is accepted when others were not

New §4.2c, at the owner's instruction, so a future reader does not read it as licence:

| the report | what it requires of the model |
|---|---|
| "I am confident in this line" | knowing it misread a digit - **knowing what it does not know** |
| "this page was a photograph, not rendered text" | **perception**, not introspection |

`confidence` and `status: extracted` were the model judging its own output, and both were wrong on the same payload. Whether the input was an image or a text layer is a property **present in the input**, and reporting it is description rather than self-assessment.

**The test to apply to any future self-reported field** is not "does the model sound sure" but: *would answering this correctly require the model to know something it does not know?* If yes, it is `confidence` wearing a new name.

**And it is still not load-bearing on its own.** An extractor reporting `digital` on every scan would put those payloads back on the digital path - which is why EXT-17 refuses to auto-accept **either** source and EXT-16 reconciles **before** the source is consulted.

## 6. Acceptance, run

```
$ npx playwright test extraction.spec.ts --project=chromium      11 passed
  ✓ 1c. EXT-15: o scanare esuata NU pastreaza nicio linie, iar antetul ramane
  ✓ 1d. EXT-15: acelasi payload marcat DIGITAL isi pastreaza liniile
  ✓ 1e. EXT-15: o sursa absenta se citeste ca scan, si una necunoscuta este 400

$ npx playwright test review.spec.ts --project=chromium          10 passed
  ✓ 11. EXT-15: o scanare necitita arata antetul, spune ca nu a fost citita,
        si nu ofera nicio cale de acceptare

$ npm run check:migrations   30 applied to a bare postgres:16, 14 assertion files
$ npx tsc --noEmit           exit 0
$ npm run build              Compiled successfully
```

**Case 1d is the control and without it 1c proves nothing.** An implementation that dropped the lines of *any* failure would pass 1c and break the digital path. **The distinction is the source, not the failure.**

## 7. Not in this PR

**The apply.** `0032` is pending alongside `0028`, `0029`, `0030` and `0031`.

**Rejecting a `lines` key on a scan-sourced failure** is EXT-20. This card **drops** the lines at storage; EXT-20 makes Andre stop sending them and makes us refuse the payload if he does.

**Deciding reconciliation** is EXT-16. Today the failure verdict is Andre's; this card is what happens to the payload once it arrives.
