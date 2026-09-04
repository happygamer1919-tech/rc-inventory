# EXECUTOR, 2026-09-03: EXT-14, confidence removed

Card **EXT-14**, resolved by the owner as **DROP** on Andre's scan result. Branch `card/ext-14`. No migration, no database write, no secret read.

---

## 1. What decided it

The scan path returned **four wrong lines in seven**, every one arithmetically self-consistent, with `status` reported as `extracted` and `confidence` reported as **`1.0`**.

The owner's words: *"Not decorative, actively misleading to whoever does the review."*

The card's own default already said remove. What changed is that it is no longer a judgement about an asymmetry - it is a measurement.

## 2. It was never on the review screen, and that is reported rather than papered over

The card's acceptance asked for a case asserting **no confidence value is rendered**. A grep over `components/` and `app/` found **zero renderings**. It was stored and typed and never displayed.

**So that case would have been true before the change.** That is exactly the class PROVE-01 named this week: an assertion whose passing path is reachable without the condition being true. It is **not written**.

The acceptance rests instead on two cases that **can** fail:

| case | what would break it |
|---|---|
| a payload that **sends** confidence is accepted and the field is **not stored** | an implementation that still writes it |
| a payload that **omits** confidence is accepted identically | an implementation that requires it |

**Both are necessary and neither implies the other.** One that refused the payload *without* the field would pass the first and break the extractor the day Andre removes it. One that refused the payload *with* it would pass the second and break everything until then.

**The fixture still sends it, deliberately.** `callbackBody` still carries `confidence: 0.94` and a line carries `0.91`. That is what makes the first case a real assertion: it proves the value arrived and did not land.

## 3. What was removed

- `app/api/extraction/callback/route.ts` - both writes.
- `lib/data/extraction-types.ts` - both fields.
- `lib/data/extraction.ts` - both selects and both mappers.
- `docs/contracts/extraction-v2.md` - both rows and both example payloads, with a new **4.2b** recording why, that a callback still sending it is still accepted, and that the columns remain.

## 4. What was deliberately not removed

**The database columns.** `extraction_drafts.confidence` and `extraction_draft_lines.confidence` are nullable and are simply never written now.

Dropping a column is a **REMOVAL migration**, and under P3-11c and P3-11e that carries the merged-half proof and the deployed-half proof with it. Folding that into a payload change would put a removal migration inside a screen card.

**A callback that still carries confidence is still accepted.** Andre's side and ours do not deploy in the same second, and a contract change that invalidates the previous version's payload is an outage scheduled for whenever he ships first.

## 5. Acceptance, run

```
$ npx playwright test extraction.spec.ts --project=chromium
  ✓ 1.  trimiterea poarta exact cele sase campuri si antetul secret
  ✓ 1b. EXT-14: un payload FARA confidence este acceptat la fel
  ✓ 2.  un callback extracted scrie fiecare camp al contractului
  ...
  9 passed (33.2s)

$ npx playwright test review.spec.ts --project=chromium
  9 passed (21.8s)        unchanged, and unchanged is the claim

$ npx tsc --noEmit        exit 0
```

## 6. The rule this belongs to

Already in `docs/LEARNINGS.md`, and the scan result is the second approach to the same wall: **any control that depends on a model noticing its own uncertainty is not a control.** `confidence` returned `1.0` on the document with four invented lines.
