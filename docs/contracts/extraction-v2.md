# Extraction contract v2

**Status: FROZEN.** Accepted by owner ruling R-014, 2026-08-26.
**Parties:** Rapid Construct inventory application (ours) and the Make.com
extraction scenario (Andre's).
**Supersedes:** the v1 webhook contract sent to Andre on 2026-08-25.

A frozen contract is one that changes by ruling, not by preference. Either side
may propose a change; neither side implements one until a ruling records it and
this file carries it. A field that appears in a payload and not in this document
is ignored by the receiver, never guessed at.

Cards bound by this document: **P2-08** (the pipeline) and **P2-09** (the review
and confirm flow).

---

## 1. The shape of the exchange

Three messages, in order.

1. **Fire.** Our app POSTs to `MAKE_WEBHOOK_URL` with `X-RC-Secret`, carrying a
   short-lived signed URL for the document plus the four identity fields below.
2. **Work.** Make downloads the document, extracts it, and does not talk to us
   while it works. There is no polling endpoint and no progress channel.
3. **Callback.** Make POSTs the result to our callback endpoint with
   `MAKE_CALLBACK_SECRET`. We answer with one of five status codes in section 6.

Secrets are referenced by name only, here and everywhere. `MAKE_WEBHOOK_URL`,
`X-RC-Secret` and `MAKE_CALLBACK_SECRET` are names. Their values appear in the
environment and nowhere else.

---

## 2. Two global rules that override every field description below

### 2.1 Absent is `null`. Never an empty string, never zero.

A field the document did not contain is `null`.

- An **empty string** says the field was present and blank. That is a different
  fact, and downstream it is indistinguishable from a real blank.
- A **zero** in a quantity or a price field is a real value. A document with no
  stated unit price and a document stating a unit price of zero must not arrive
  looking the same, because one is missing data and the other is a free item.

This rule is absolute and applies to every nullable field in the schemas below.

### 2.2 `order_id` is the idempotency key. Upsert, never append.

Every callback carries the `order_id` we sent in the fire. A callback that
arrives twice for the same `order_id` **replaces** the stored extraction. It
never creates a second one.

Retries are expected: Make retries on `5xx`, networks drop responses after the
work is done, and the re-fire control in section 7 exists precisely to send the
same document again. Without an idempotency key every one of those becomes a
duplicate draft order that a human has to notice and delete.

---

## 3. Inbound payload, ours to Make

```json
{
  "order_id": "uuid",
  "document_url": "https://<signed-url>",
  "document_filename": "confirmare-comanda-bilka-BLK-2026-14507.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 184320,
  "callback_url": "https://www.rapidconstructmd.com/api/extraction/callback"
}
```

| field | type | null? | notes |
|---|---|---|---|
| `order_id` | uuid | no | The idempotency key. Ours. Echoed back unchanged. |
| `document_url` | string | no | Short-lived signed URL into the private `rc-docs` bucket. Expires; see `url_expired`. |
| `document_filename` | string | no | The operator's own filename, sanitised. Carried so a human-readable name appears in Make's logs and in ours. |
| `mime_type` | string | no | One of `application/pdf`, `image/png`, `image/jpeg`. The bucket constraint in migration 0002 allows nothing else. |
| `size_bytes` | integer | no | Actual byte size. The bucket cap is 10 MB. |
| `callback_url` | string | no | Where the result goes. Sent rather than configured, so a change of host does not need a change in Make. |

Header: `X-RC-Secret: <MAKE_WEBHOOK_URL secret>`.

---

## 4. Callback payload, Make to ours

```json
{
  "order_id": "uuid",
  "status": "extracted",
  "error_code": null,
  "reason": null,
  "supplier_name": "Bilka Steel SRL",
  "order_date": "2026-08-14",
  "subtotal": 18450.00,
  "vat_amount": 3690.00,
  "document_total": 22140.00,
  "prices_include_vat": false,
  "vat_rate": 20.0,
  "currency": "MDL",
  "currency_raw": "lei",
  "lines": [
    {
      "product_name": "Tigla metalica Bilka Classic 0.45mm visiniu",
      "quantity": 240.5,
      "unit": "m2",
      "unit_raw": "mp",
      "unit_price": 76.72,
      "line_total": 18452.36,
      "currency": "MDL",
      "currency_raw": "lei",
      "category": null,
      "category_raw": "Invelitori",
    }
  ],
  "_meta": {
    "model": "gpt-4o-mini",
    "prompt_version": "v2.0",
    "page_count": 2,
    "duration_ms": 8140
  }
}
```

### 4.1 Document level

| field | type | null? | notes |
|---|---|---|---|
| `order_id` | uuid | no | Echoed from the fire. The idempotency key. |
| `status` | enum | no | `extracted`, `partial`, `failed`. Section 5. |
| `error_code` | enum or null | yes | Non-null when `status` is `failed` or `partial`. Fixed set, section 5.2. |
| `reason` | string or null | yes | Free text, human-readable, shown to the operator. Never parsed by us. |
| `supplier_name` | string or null | yes | As the document names it. |
| `order_date` | date or null | yes | **The document's own date, not the delivery date.** See section 8.2. |
| `subtotal` | number or null | yes | Before VAT. |
| `vat_amount` | number or null | yes | The VAT figure as stated. |
| `document_total` | number or null | yes | The total as stated on the document. |
| `prices_include_vat` | boolean or null | yes | Whether the line prices already carry VAT. Decides whether `subtotal` or `document_total` reconciles against the lines. |
| `vat_rate` | number or null | yes | Percentage, as a number. `20.0`, not `"20%"`, not `0.2`. |
| `currency` | enum or null | yes | Mapped to `currency_code`: `USD`, `EUR`, `RON`, `MDL`. Null when the document's currency is not one of the four. **Ruling R-192, 2026-09-11.** See 4.2d. |
| `currency_raw` | string or null | yes | Verbatim, as printed. `lei`, `MDL`, `EUR`, whatever it said. |
| `document_source` | enum or null | yes | `scan` or `digital`. **Declared by the extractor.** Null is accepted and read as `scan`. See section 4.2c. |
| `order_ref` | string or null | yes | The **number** of the supplier's own document, verbatim as printed. Ours is the order reference we generate and is a different thing. Card EXT-11. |
| `order_ref_series` | string or null | yes | The **series** of the supplier's own document: the letter code printed before the number. `TG`, `AV`. **Part of the identifier**, because two suppliers can both issue `0009312`. Null is accepted and is not an error: not every document carries one. Card EXT-11. |
| `lines` | array | no | May be empty on `failed`. Never null. **One exception, and only one: a scan-sourced `failed` payload must not carry this key at all. Section 4.1a.** |
| `_meta` | object | no | Section 4.3. |

### 4.2d Currency: four values, ONE PER DOCUMENT, and no FX anywhere. Ruling R-192, 2026-09-11.

**THE SET IS `USD`, `EUR`, `RON`, `MDL`. FOUR, NOT THREE. `RON` STAYS**, said
explicitly because the obvious reading of "add USD" is that something was traded
for it. Nothing was removed.

**THIS TABLE SAID THREE UNTIL 2026-09-11 AND THE SUPERSEDED TEXT IS QUOTED RATHER
THAN DELETED**, per CLAUDE.md section 9c, because the code, the enum in migration
`0001` and a card's defaults were all written on top of it. Section 4.1 read:

> *"| `currency` | enum or null | yes | Mapped to `currency_code`: `EUR`, `RON`,
> `MDL`. Null when the document's currency is not one of the three. |"*

**THE ENUM IN THE DATABASE STILL HOLDS THREE LABELS AS THIS IS WRITTEN.**
`supabase/migrations/0001_phase2_schema.sql` created `public.currency_code` with
`EUR`, `RON`, `MDL`, and a migration file is never edited after it has been
applied. `USD` arrives as a new numbered file, in its own card. **Until that card
ships, a `USD` document is a document whose `currency` we map to null** and whose
`currency_raw` still carries what it printed. That is the existing behaviour for
an unrecognised currency and it is not a new failure.

#### ONE CURRENCY PER DOCUMENT, AND ANY CROSS-CURRENCY TOTAL IS A DEFECT

**A document carries exactly one currency.** Lines in a second currency on one
document are not a shape to support; they are a document to refuse.

**Totals sum only within one currency.** A figure that adds `MDL` to `EUR` is
wrong whatever the arithmetic says.

**NO FX SOURCE EXISTS AND NONE IS BEING ADDED.** Not a table, not an API, not a
hard-coded rate, and not a rate "just for display". This is not a gap waiting to
be filled; it is a decision.

**The reason is already written in this repository twice and was never a rule
anybody could cite.** Migration `0001` says at the type: *"No FX rates and no
runtime conversion: a stored total in a stored currency, exactly as phase 1 did
it."* Migration `0016` says a project budget is `MDL` only *"because a second
currency changes every computation."*

**THE TEST TO APPLY BEFORE WRITING ANY TOTAL, one question:** *could the rows
being added carry different `currency` values?* If yes, the total is grouped by
currency or it is not produced. **An "approximate" total is the forbidden thing**,
because approximate is the shape an FX rate arrives in.

### 4.1a A scan-sourced `failed` payload: the header, and NO `lines` key. Card EXT-20, 2026-09-04.

When `document_source` is `scan` (or absent, which reads as `scan`) **and**
`status` is `failed`, the payload is these **sixteen fields** and nothing else:

    order_id      status        error_code    reason
    supplier      order_ref     client_ref
    order_date    currency      currency_raw  prices_include_vat
    vat_rate      subtotal      vat_amount    document_total
    document_source

The count is stated rather than left implicit because this list is what a reader
checks a real payload against, and a list whose stated count disagrees with its
own rows is a list nobody trusts.

**THIS LIST SAID SEVENTEEN FROM 2026-09-07 TO 2026-09-11 AND IT WAS WRONG ABOUT
WHAT ANDRE SENDS**, corrected by ruling **R-191** under CLAUDE.md section 9c and
quoted here rather than deleted, because the shipped fixture, card EXT-24's
question and a session report were all written on top of it. It read:

> *"the payload is these **seventeen fields** and nothing else:*
>
>     order_id      status        error_code    reason
>     supplier      order_ref     order_ref_series     client_ref
>     order_date    currency      currency_raw  prices_include_vat
>     vat_rate      subtotal      vat_amount    document_total
>     document_source
>
> *"**IT WAS SIXTEEN UNTIL 2026-09-07** and `order_ref_series` is the one card
> EXT-11 added."*

**THE EVIDENCE THAT SETTLED IT, FROM ANDRE.** `order_ref` is **series-inclusive
by design**: the extractor returns the series and the number as one printed
string, deliberately. **Five Matnord runs return `DN 0021884` as one string.** The
single Tehnocom counter-example, `TG 0009312` split into two, **predates the
prompt revision** that added `document_source` and removed `confidence`, so it is
evidence about a prompt that no longer runs.

**THE DISAGREEMENT WAS FOUND BY A FIXTURE, AND THE FIXTURE WAS RIGHT.**
`scanFailureHeader` in `tests/e2e/extraction.spec.ts` has enumerated sixteen keys
since card EXT-20 wrote it, and it has never carried `order_ref_series`. Card
EXT-24 asked which record bound. This one did not.

**WHAT IS NOT REVERSED.** Card EXT-11 is untouched and migration `0036` keeps
both columns on `extraction_drafts` and on `inbound_orders`. `order_ref_series`
is still a field of the **full** payload in section 4.1 and is still stored when
it arrives. What was wrong was the claim that **this one narrowed shape** carries
it as a separate field.

**There is no `lines` key. Not an empty array. The key is absent.**

#### The rejection rule is ours, not only Andre's

**Our validator answers `400` to a scan-sourced `failed` payload that carries a
`lines` key, empty or not.** A shape enforced only by the sender is enforced by
nobody the day the sender is rebuilt, which is the same reason section 5.3 exists.

#### Why an empty array is not good enough, said plainly because it will look pedantic

An empty array is a thing a screen can iterate, append to, and grow a form
around. An absent key is not. Accepting `[]` costs nothing today and means that
on the day somebody adds a line-rendering loop to the header-only review screen,
the loop **has something to iterate and renders nothing**, which reads as *"this
document had no lines"* rather than *"this document was not read"*.

#### This narrows ONE case. Everywhere else the 4.1 rule is unchanged.

A **digital** `failed` payload still carries `lines`, empty or not, and is
accepted. A scan-sourced **`partial`** still carries its read lines and keeps
them. Only `scan` + `failed` is narrowed.

#### Three of the sixteen names, reconciled against this document

| in the shape above | in this contract | note |
|---|---|---|
| `supplier` | `supplier_name` | same field, section 4.1's name is the one we read |
| `order_ref` | **in 4.1 since 2026-09-07** | **stored.** Card EXT-11 landed it, together with `order_ref_series`. **On THIS shape it is series-inclusive**: Andre returns the series and the number as one printed string, `DN 0021884`, and there is no separate `order_ref_series` field here. Ruling R-191. |
| `client_ref` | **not in 4.1** | accepted and ignored today. `P3-31` is the card that would give it a shape, and it has not shipped. |

**THIS TABLE SAID SOMETHING ELSE UNTIL 2026-09-07 AND IT IS QUOTED RATHER THAN
DELETED**, per CLAUDE.md section 9c, because the sixteen-field list above and
card P3-31's own acceptance line were both written on top of it. It read:

> *"`order_ref` | not in 4.1 | accepted and **ignored**, per the global rule in
> section 2 that a field not in this document is never guessed. `EXT-11` and
> `P3-31` are the cards that give it a shape."*
>
> *"Sending them is harmless and is what happens in production. **We do not store
> them**, and this table exists so that nobody reads the sixteen-field list as a
> promise that we do."*

It was accurate when written and EXT-11 is the card that changed it. `order_ref`
is now stored, on `extraction_drafts` and on `inbound_orders`, alongside the new
`order_ref_series`. `client_ref` is untouched and the paragraph above still
describes it exactly.

### 4.1b The supplier's reference is TWO fields. Card EXT-11, 2026-09-07.

`TG 0009312` is a series and a number, and it arrives as two fields and is stored
in two columns. **It is never concatenated**, in the payload or in the database.

Two facts glued together at write time cannot be pulled apart at read time: a
screen that wants them together can join two columns, and a lookup by number
cannot unglue a string somebody joined before storing it.

**Neither field is required and neither absence is an error.** A payload that
omits `order_ref_series`, or omits both, is accepted with the same `202` as one
that carries them. Not every document carries a series, and a document without
one is not a malformed document. This also means the previous version of the
sender's payload, which does not know the field at all, keeps working: our side
accepts the field before Andre emits it, and the landing is confirmed to him
live.

**There is no uniqueness rule on the pair.** Making the supplier's identifier
complete is what this card does. Deciding what happens when two documents carry
the same series and number is a different decision and is not made here by a
constraint nobody wrote down.

**Ours and theirs stay separate.** `inbound_orders.reference` is the reference
this system generates and keeps its own unique constraint. `order_ref` and
`order_ref_series` are what the supplier printed.

### 4.2 Line level

| field | type | null? | notes |
|---|---|---|---|
| `product_name` | string | no | **Verbatim, untranslated.** Section 8.3. |
| `quantity` | number or null | yes | |
| `unit` | enum or null | yes | Mapped to `unit_code`: `m2`, `lm`, `pcs`, `bag`, `kg`, `roll`, `m3`. Null when unmappable. |
| `unit_raw` | string or null | yes | Verbatim. `mp`, `buc`, `ml`, `sac`. |
| `unit_price` | number or null | yes | Per unit, as stated. |
| `line_total` | number or null | yes | As stated. Not computed by Make: if the document does not state it, it is null. |
| `currency` | enum or null | yes | Per line, because a document can mix. Falls back to the document currency when the line does not state one. |
| `currency_raw` | string or null | yes | Verbatim. |
| `category` | string or null | yes | Mapped. **See section 4.4, this one has a caveat.** |
| `category_raw` | string or null | yes | Verbatim, as the document grouped it. |

### 4.2b `confidence` was removed. Card EXT-14, 2026-09-03.

**It is gone from both levels and it is not coming back as a display field.**

It returned `1.0` on a scan where **four of seven lines were wrong**, every one
arithmetically self-consistent, with `status` reported as `extracted`. A number
that says "certain" on that document is not a weak signal, it is a **misleading**
one: the person reviewing reads `1.0` as "the machine is sure" at exactly the
moment it is not.

**A callback that still sends it is still accepted and the field is ignored.**
Andre's side and ours do not deploy in the same second, and a contract change that
invalidates the previous version's payload is an outage scheduled for whenever he
ships first.

**The database columns are still there and are simply never written.**
`extraction_drafts.confidence` and `extraction_draft_lines.confidence` are
nullable. Dropping a column is a REMOVAL migration and carries the P3-11c and
P3-11e proofs with it, which is its own card and its own apply.

**The general rule this belongs to** is in `docs/LEARNINGS.md`: any control that
depends on a model noticing its own uncertainty is not a control.

### 4.2c `document_source`, and why this self-report is accepted when others were not

**Card EXT-15, 2026-09-03.** `scan` when the model read an image, `digital` when
it read a text layer. Null is accepted and **read as `scan`**.

**Nothing else in the payload answers this question.** `mime_type` does not: one
of the four sample documents is a **PDF with no text layer**, so
`application/pdf` covers both cases. `_meta.characters_extracted` was the only
proxy and card EXT-09 removes it, because with the file handed straight to the
model that number could only ever be null. Only the extractor knows.

**Null is read as `scan`, and the asymmetry is the reason.** Guessing `digital`
on a scanned document costs invented stock in a real warehouse. Guessing `scan`
on a digital one costs somebody keying a document in by hand.

**A value outside the set is REJECTED, not ignored.** A stray third value would
otherwise fall through into the safe branch, which is correct by accident today
and silent on the day somebody adds a third source and forgets a branch.

#### This is a self-report, and it is accepted on a narrower basis than the self-reports this contract rejected

`confidence` was removed by card EXT-14 because it returned `1.0` on a scan where
four of seven lines were wrong. `status: extracted` was equally wrong on the same
payload. Both are the model **judging its own output**, and the rule this
repository keeps is that any control depending on a model noticing its own
uncertainty is not a control.

**`document_source` is a different kind of claim, and the difference is not a
matter of degree.**

| the report | what it requires of the model |
|---|---|
| "I am confident in this line" | knowing that it misread a digit - **knowing what it does not know** |
| "this page was a photograph, not rendered text" | **perception**, not introspection |

The scan failure was the model being asked whether it had misread something. It
cannot answer that, because a misreading it is aware of is one it would have
corrected. Whether the input was an image or a text layer is a property of the
input that is **present in the input**, and reporting it is description rather
than self-assessment.

**This is stated so that a future reader does not treat it as licence for the
other kind.** The test to apply before accepting any new self-reported field is
not "does the model sound sure", it is: **would answering this correctly require
the model to know something it does not know?** If yes, it is `confidence`
wearing a new name.

**And it is still not load-bearing on its own.** `document_source` decides which
of two rules applies; it is not trusted to decide whether a document is correct.
An extractor that reported `digital` on every scan would put those payloads back
on the digital path, which is why EXT-17 refuses to auto-accept **either** source
and EXT-16 reconciles **before** the source is consulted.

### 4.3 `_meta`

| field | type | notes |
|---|---|---|
| `model` | string | The model that did the extraction. |
| `prompt_version` | string | Bumped whenever the prompt changes. Lets a bad batch be traced to a prompt. |
| `page_count` | integer or null | **Pages in the source document AS THE MODEL REPORTS THEM.** Null when it reports none, which is not an error. See 4.3a. |
| `duration_ms` | integer | Wall clock for the extraction. |

`_meta` is stored verbatim and never shown to the operator. It exists so that a
wrong extraction can be explained rather than argued about.

**`page_count` is the one field in `_meta` that is also read out of it**, into a
column of its own. Everything else here is diagnostic only.

### 4.3a `page_count`, and `characters_extracted` which is gone

**Added 2026-09-03 by card EXT-09.**

**`characters_extracted` IS REMOVED FROM THIS CONTRACT.** It was specified when
the plan involved extracting text on our side. We hand the file to the model, so
no character count exists anywhere in the chain and the field could only ever
have been null. A number that is null by construction is not a weak signal, it is
a field that reads like coverage and provides none.

**IT IS REMOVED FROM WHAT WE EXPECT, NOT FROM WHAT WE TOLERATE.** A callback that
still carries `characters_extracted` is **accepted**, and the field is **ignored**:
nothing reads it and nothing requires it. It is not stripped either, because
`_meta` is the diagnostic block and throwing away what the sender chose to send
loses the thing the block exists for.

That tolerance is not politeness. The extraction side and this side do not deploy
in the same second, and a contract change that makes the previous version's
payload invalid is an outage scheduled for whichever side ships first. Make
retries on 5xx, so it would be a loop rather than a single failure.

**WHAT `page_count` IS FOR, WHICH IS THE REASON FOR THE SWAP.** A model reporting
one page on a three-page document has silently read a third of it and returned a
result that is consistent with itself. **Nothing else in the chain catches that.**
A totals check does not: the totals of page one reconcile against the lines of
page one, and every number on the screen looks right.

| | |
|---|---|
| **type** | integer, or null |
| **null means** | no page count was reported. **Not an error.** |
| **minimum** | 1. A document has at least one page, so 0 is a broken report and not a smaller reading. |
| **stored as** | a column, `extraction_drafts.page_count`, added by `0032_extraction_draft_page_count.sql` |
| **broken report** | 0, negative, fractional, a string, a boolean: all read as null, and none of them rejects the document |

**A broken report is null, never a 400.** A diagnostic field that cannot be
trusted says exactly what an absent one says, and throwing away a whole document
over it would cost a manual entry to gain nothing.

**IT IS A COLUMN AND NOT ONLY A KEY IN `_meta`, DELIBERATELY.** The value already
arrived inside `_meta`, which is stored verbatim, so nothing had to be built for
it to be present. `_meta` is unvalidated jsonb that is documented as never shown,
and a signal no query can reach is not a signal.

**COMPARING IT AGAINST THE REAL PAGE COUNT IS NOT PART OF THIS CONTRACT.** What
happens when the model's number and the file's number disagree, and whether that
blocks or flags, is separate work: it needs a page counter on our side, and there
is not one. This contract carries the reported number and says where it is
stored.

### 4.4 The `category` caveat, recorded rather than hidden

Ruling R-014 says `category` follows the `unit` and `currency` pattern: a
verbatim `category_raw` plus a nullable `category` mapped **against our
controlled list**.

**RESOLVED 2026-08-26 by ruling R-018 and card P2-17. The list now exists.**

When this contract was frozen there was no controlled category list: `categories`
was a rows table with a unique name and no seed, holding one row of e2e residue.
Exporting that as the client's vocabulary would have committed a test string.
The halt was ratified as correct, and the list was authored as a schema decision
instead.

**The controlled list is `docs/contracts/categories.json`**, 18 Romanian
entries, exported read-only from the live schema after migration
`0007_seed_categories.sql` applied. That file is a record of what the database
holds, not a second hand-maintained copy: `npm run check:categories` compares it
against the migration in both directions on every push, and fails if either side
gains an entry the other does not have.

**It is a WORKING DEFAULT, not a specification.** These are rows and not an
enum, deliberately, so Mihai may rename an entry at P2-14 with no code change
and no migration. A `category` value must therefore be validated against the
`categories` rows **present at extraction time** rather than against a constant
compiled into anything, and `categories.json` is the snapshot of that list, not
its authority.

`category_raw` always carries the document's own words, so nothing is lost when
the mapping finds nothing and `category` comes back null.

`TEST-Categorie` is excluded from the vocabulary and stays in the table: it is
CRIT-11 residue and belongs to P2-15.

---

### 4.4a The latency budget, and the three clocks it is not. Card EXT-12, 2026-09-07.

**120 seconds above 20 lines, 60 seconds at or below.** The owner's numbers,
relayed from Andre and confirmed by him: *"49.7 of 51 seconds is the model call,
which neither side controls."* Almost the whole budget is the model, so this is a
target the scenario is configured to meet and not a number either side can
engineer down.

**THE COUNT IS NOT KNOWABLE WHEN WE FIRE.** Section 3's payload carries exactly
six fields and none of them is a line count: the count is the *result* of the
extraction. So **in practice the longer budget applies to every document**, and
this is written down rather than inferred. `size_bytes` is deliberately **not**
used as a proxy: a one-page scan can be heavier than a three-page digital
document, and a proxy invented here would become "the threshold" within six
months without anybody having decided it.

**THREE CLOCKS, AND ONLY THE SECOND ONE IS THIS BUDGET.**

| clock | where | value | what it measures |
|---|---|---|---|
| acknowledgement | `lib/data/extraction-budget.ts`, `ACK_TIMEOUT_MS`, read by `lib/data/extraction-fire.ts` | 15s | whether Make **accepted** the job. The operator's screen waits on this one, so it stays short. |
| **extraction** | `lib/data/extraction-budget.ts`, `extractionBudgetMs()` | **120s / 60s** | how long the model may take. **Make's own limit**, which is why `timeout` in section 5.2 reads "exceeded Make's own limit". Our code declares it; the scenario enforces it. |
| document serving | `app/api/documents/[...path]/route.ts`, `UPSTREAM_TIMEOUT_MS` | 20s | how long **we** wait on storage when Make fetches the file. A third question, and it does not move to the budget module because it is not an extraction budget. |

Raising the first clock to 120 seconds would hold an operator's screen for two
minutes and would measure nothing about the model. The two numbers live in one
file so that they cannot drift apart, and `npm run prove:extraction-budget`
asserts both, the boundary at exactly 20, and that the acknowledgement clock is
still a different number.

---

## 4b. The state endpoint. THE AUTHORITATIVE ANSWER TO "WHAT DO YOU ACCEPT NOW". Card EXT-21, 2026-09-07.

    GET https://<host>/api/state

**No credential. No session. No header.** It is public and unauthenticated on
purpose: what it returns is a controlled vocabulary and an enum, both of which
already reach you through this document, and a key would put the answer back
behind the human step this endpoint exists to remove.

### The shape

```json
{
  "categories": ["Cimenturi și mortare", "Zidărie și cărămidă", "..."],
  "units": [{ "code": "pcs", "label": "buc" }, { "code": "t", "label": "t" }],
  "ledger_version": "0033",
  "at": "2026-09-07T18:40:00.000Z"
}
```

| field | what it is |
|---|---|
| `categories` | the **active** category names, in display order. This is the list section 4.4's `category` field is validated against, read live. |
| `units` | the **active** unit codes with their Romanian labels, in display order. **You emit the `code`.** The label is ours and is presentational. |
| `ledger_version` | the highest APPLIED migration version, read from the database and never from our repository. It answers *is the schema you are talking about the schema I am looking at*. `null` reads as **I do not know**, never as *none*. |
| `at` | when this answer was produced. |

**`503` with `{"error": "state_unavailable"}` when the endpoint cannot read.** It
never answers `200` with empty lists, because a poller cannot tell *we accept
nothing* from *I could not look*, and the first reading is the one that makes you
hold back values that are already safe.

**`cache-control: no-store`.** A cached answer to *what do you accept now* is the
whole failure this endpoint removes, served with a success code.

### It SUPERSEDES every hand-written status document

**This endpoint wins.** Where it and any document disagree, including
`ANDRE-STATUS.md` and including the snapshot in `docs/contracts/categories.json`,
the endpoint is right and the document is commentary.

**Why this section exists, stated rather than left as a preference.** On
2026-09-03 our own migration register listed `0028` to `0031` as pending while
production had already applied all four. The status document written for you was
composed from that register, and it said the nineteenth category and the units
`t` and `l` *"will land when the pending migration batch is applied to
production, which is a separate owner-run step"*. That was false at the moment it
was written, and it cost a day of holding back three values that were already
safe to send.

**Nothing went red.** No check failed, and both sides behaved correctly against
the information they had. A rule saying *keep the status document accurate* would
have been obeyed by everyone involved and would have changed nothing, because the
person writing it believed it was accurate. The only thing that removes this
class of failure is your being able to **ask production** rather than read what
we wrote about it.

### What it deliberately does not carry

**No client data of any kind**, and that is enforced rather than reviewed:
`npm run check:state-endpoint` refuses any query in the route that names a table
other than `categories` and `units`, refuses a lost `active` filter, and refuses
a cacheable or statically rendered response. `npm run prove:state-endpoint`
shows every one of those refusals firing.

**Not the error-code set.** Section 5.2a already requires a new code to be
announced before it can be emitted or received, in both directions, which is a
stronger guarantee than polling. Two answers to one question is worse than one.

**Not a webhook.** You poll. A push needs a URL from you, a retry policy and a
failure mode, and none of that is needed to answer a question whose answer
changes about once a month.

---

## 4c. RETENTION OFF IS A REQUIRED CONDITION OF THIS INTEGRATION. Card EXT-13, 2026-09-07.

**This is a condition, not a preference, and it is written here rather than only
agreed in conversation.** A scenario rebuilt from scratch in six months restores
the BEHAVIOUR and not the SETTING. The behaviour is what a test exercises; the
setting is what nobody looks at again. So it is in the contract, where a rebuild
reads.

### The condition

**The model provider's retention must be OFF for every request that carries a
document from this integration**, and it must be off before the first REAL
supplier document goes through. The four sample documents are synthetic and are
already through; a real document is the line.

**The owner has ruled: OFF.** This section does not weigh it again.

### What is retained without it, and whose data it is

Without retention off, the model provider keeps, on the extractor's account:

- **the extracted CONTENT of the document** - supplier name, document reference,
  dates, product names, quantities, unit prices and totals, and
- **a conversation object per request**.

**That is Mihai's commercial data and his suppliers'.** It is what he buys, from
whom, in what quantity and at what price, which is the whole of a construction
merchant's commercial position. It is not ours to leave sitting on a third
account by default, and it reached that account because our own map did not have
a row for it.

### Who does what

| | |
|---|---|
| **Andre** | sets the flag on his side. It is his account and his scenario, and nothing on our side can set it or read it. |
| **Us** | record it HERE, as a required condition, and carry the row in `docs/DATA-MAP.md`. |
| **Confirmation** | Andre confirms the flag is off. Until he does, `docs/DATA-MAP.md` row 5 reads **NOT KNOWN** and assumes it persists. |

**We cannot verify this and we do not pretend to.** There is no `OPENAI_*` name
anywhere in this repository, in `lib/env-required.ts` or on the strip list in
`scripts/poc/secret-names.sh`: we hold no credential for that provider and reach
it only from inside Andre's scenario. This section is a stated condition backed
by his confirmation, which is exactly as strong as it sounds and is why it is
written down instead of remembered.

### The reasoning already existed in this document, one row along, and did not reach the model

Section 9 has said since this contract was frozen, under ruling R-015:

> *"No third-party conversion sub-processor. If Make's OpenAI file input cannot
> read a format, the conversion is built inside our own application. A converter
> sees every supplier invoice in full, so adding one is a data-sharing decision
> about the client's commercial information and needs an owner ruling naming the
> service."*

**That is the same argument, and it was applied to a service we might have added
while the service already in the path went unexamined.** A converter would see
every supplier invoice in full. So does the model. The difference the reasoning
turned on was that one was a NEW party and the other arrived with the extractor,
which is a fact about how the integration was assembled and not about who ends up
holding the data.

Nothing in R-015 is retracted. It is quoted here because a reader who finds this
section is owed the fact that the principle was already written down.

### It is a SECOND DATA LOCATION and that is the part worth more than the flag

When this contract was frozen the data map had one row for the extractor: Make.
The model provider was not on it. **A map that is wrong about where data rests is
worse than no map, because it is consulted**, and this one was.

`docs/DATA-MAP.md` now lists every place supplier document content and client
data come to rest, this one marked as **the location that was missing**. It also
records, for every third party, what is retained and who owes the answer where we
do not know it.

## 5. Status and error codes

### 5.1 `status`

| value | meaning | `lines` | operator sees |
|---|---|---|---|
| `extracted` | The document was read and every line was understood. | populated | a draft ready to review |
| `partial` | The document was read and some of it was not understood. | **populated with what succeeded** | the draft, plus the reason and a re-fire control |
| `failed` | Nothing usable came back. | may be empty | the reason, the error code, and a re-fire control |

**`partial` retains the lines that did extract.** It never discards the document
because part of it was unreadable. A document with nine good lines and one
unreadable one is nine lines of typing the operator does not have to redo.

### 5.2 `error_code`, fixed set

Non-null whenever `status` is `failed` or `partial`. Any value outside this set
is a rejected payload, `400`.

| code | meaning |
|---|---|
| `download_failed` | The signed URL could not be fetched. Network, DNS, 5xx from storage. |
| `url_expired` | The signed URL had expired by the time Make used it. Distinct from `download_failed` because the fix is different: re-fire, do not investigate. |
| `unsupported_format` | The file is not a format the extractor can read. |
| `unreadable_document` | The format is supported and the content is not legible. A photographed page at an angle, a scan with no text layer. |
| `extraction_failed` | The model ran and produced nothing usable. |
| `invalid_output` | The model produced output that does not satisfy this schema. |
| `timeout` | The extraction exceeded Make's own limit. |
| `reconciliation_failed` | **Ours, not Make's.** The payload arrived well-formed and OUR arithmetic refused it: the line sum does not reconcile against the total printed on the document, or the header does not agree with itself. Sections 5.3 and 5.3a. |

**The eighth row was a table of its own until 2026-09-04.** A blank line above it
split the markdown, so it rendered as a separate headerless one-row table under
the seven. It is joined here by card EXT-19, whose acceptance asks that the code
be documented **beside** the existing ones rather than after them.

`reason` stays free text alongside the code. The code is what we branch on; the
reason is what the operator reads.

#### `reconciliation_failed` and `unreadable_document` send the operator to do DIFFERENT things. Card EXT-19, 2026-09-04.

The two are adjacent in the set and are the pair most easily confused, because
both mean "we did not get usable line items out of this document". They mean
opposite things about **what to do next**:

| code | what happened | what the operator does |
|---|---|---|
| `unreadable_document` | the content could not be read | upload a better scan |
| `reconciliation_failed` | the content was read and the figures do not agree | enter the document by hand |

**Telling a person the wrong one wastes their time**, in both directions: they
re-upload a perfectly legible scan whose numbers will never add up, or they type
out by hand a document a better photograph would have fixed.

**So the two Romanian sentences carry their own instruction and never the
other's.** Each instruction is a single named string in
`lib/data/extraction-types.ts`, composed into the label rather than copied, and
`tests/e2e/review.spec.ts` asserts on screen that each code's rendered sentence
contains its own and not the other's. That case fails against a version that
collapses the two.

### 5.2a The set is named in two halves, and a new code is announced before it exists

**Ruling R-123, amendment 1. Added 2026-09-03, renumbered from R-098 on 2026-09-04 before merging, because #184 held that id.**

**A FAILURE CODE THAT IS NEW ON ANY SURFACE IS COMMUNICATED TO THE COUNTERPARTY
BEFORE IT CAN BE EMITTED OR RECEIVED, IN BOTH DIRECTIONS.**

The seven codes above are one enum spanning **two surfaces**, and they are named
here as two groups so that the eighth code is added to a **stated** set rather
than to an assumed one.

| group | what the code is about | members |
|---|---|---|
| **download path** | failures BEFORE the model runs. The subject is our signed URL and our storage. | `download_failed`, `url_expired` |
| **payload path** | failures OF the extraction. The subject is the document and the model. | `unsupported_format`, `unreadable_document`, `extraction_failed`, `invalid_output`, `timeout` |

**`unreadable_document` IS EMITTED BY BOTH SIDES SINCE 2026-09-10, and this note
is here because the table above would otherwise say it is Andre's alone.** Card
EXT-23 gave our own validator four conditions under which it emits that code, all
of them "no trustworthy anchor exists": section 5.3b has the six arms. **It is
not a new code and this is not an addition under the four requirements below.**
It is a value that now has two emitters and therefore two meanings on the wire,
and a reader of this table who assumed one emitter would be wrong.

**A THIRD SURFACE EXISTS AND HAS NO MEMBERS YET, AND IT IS DECLARED HERE SO IT IS
NOT DISCOVERED LATER.** Our own validator can refuse a payload that is
well-formed. That is neither a download failure nor an extraction failure: the
download succeeded and the model returned. **`reconciliation_failed` will be the
first member of that group**, emitted by US and not by Make, and it does not
exist in the enum on the day this paragraph is written.

**Why the rule, in the two ways it goes wrong.** Section 5.2 says any value
outside the set is a rejected payload, `400`. So:

- **He emits a new code first and we reject it.** Our `400` reads
  `error_code in afara multimii`, **Make does not retry a `4xx`**, and a document
  is dropped once and quietly.
- **We emit or accept one first and he has not been told.** Whatever his side
  does with it, it was not designed for this one.

Neither is a bug in anybody's code. Both are the two sides holding different
copies of a set this section calls **fixed**.

**What adding a code requires, all four:**

1. **Both directions.** His new code reaches us before he emits it; ours reaches
   him before we emit **or accept** it. The asymmetry to guard against is
   thinking of his codes as "the contract" and ours as "our behaviour". They are
   one set.
2. **Before it can be emitted OR RECEIVED.** Accepting an unknown code is as much
   a change as sending one, because acceptance is exactly what the `400` decides.
3. **Named group.** The pull request adding a code says which group it joins, or
   declares a new group as this amendment declares the third.
4. **This file is the record, not the message.** Telling him is not enough. The
   code and its group land here in the same pull request that makes it
   emittable.

**It does not require his agreement, only his knowledge before the fact.** A
control on our side is ours; waiting on a counterparty to approve our own
refusals would put a third party in front of them. What it forbids is surprising
him.

### 5.3 Reconciliation, and the tolerance is Andre's

**Card EXT-16. The tolerance in this section is ANDRE'S, given by him, copied
here verbatim and never re-derived.**

**A SCAN-SOURCED PAYLOAD IS RECONCILED ON OUR SIDE BEFORE IT IS ACCEPTED.** The
same check exists inside the extraction scenario. A control that lives only there
is bypassed by a scenario rebuild, a second ingest path, or a manual upload, and
it is the only thing standing between a scan and invented stock.

#### The formula

    pass when abs(sum_of_line_totals - target) <= max(0.05, 0.01 * line_count)

| | |
|---|---|
| **rounding** | **both sides to two decimals BEFORE the comparison.** Rounding after subtracting gives a different answer exactly at the boundary, and the boundary is the only place a tolerance is ever consulted. |
| **target** | selected by `prices_include_vat`: `false` -> `subtotal`, `true` -> `document_total` |
| **floor** | `0.05`. It binds below 5 lines: a 3-line document tolerates `0.05`, a 7-line one `0.07`, a 54-line one `0.54`. |
| **source** | **Andre.** Two checks that disagree on the interesting cases are worse than one check, and at the boundary the looser one wins by accident. |

#### The three conditions where the check cannot run. NONE is a free pass.

| condition | answer |
|---|---|
| `target` is null, because the document does not print it | **REJECT** |
| `prices_include_vat` is null | reconcile against **BOTH** `subtotal` and `document_total`, and accept only if **ONE** matches |
| any line has a null `line_total` | **REJECT.** The sum is incomplete by construction. |

#### What a failure looks like on the wire

The payload is **accepted** with the contract's success code: it satisfies this
contract, and what failed is its arithmetic. The stored draft becomes:

    status        failed
    error_code    unreadable_document  OR  reconciliation_failed, section 5.3b
    lines         none stored
    header        supplier, dates and printed totals all KEPT

The lines are dropped under EXT-15's rule, because line values that do not add up
to the printed total are exactly the values that must not reach a confirmation
screen. The header is kept because the document now has to be entered by hand and
whoever enters it needs it.

**THE `error_code` LINE READ `reconciliation_failed` AND NOTHING ELSE UNTIL
2026-09-10, AND THAT WAS THE WHOLE BEHAVIOUR**, corrected by card EXT-23 under
ruling R-187 and quoted here rather than deleted:

> *"`error_code`    `reconciliation_failed`"*

It was an accurate description of the code, which emitted that one value for
every refusal it could produce. **Section 5.3b below is which code a refusal now
carries, and it is not a free choice: the two codes send a person to do different
things.**

### 5.3b Which code the refusal carries. Card EXT-23, 2026-09-10, ruling R-187.

**THE PRINCIPLE, IN ONE LINE: `reconciliation_failed` means the numbers did not
add up TO SOMETHING. If there was nothing trustworthy to add up to, the document
is `unreadable_document` instead.**

The two codes send the operator to do different things, which is card EXT-19's
finding and the reason this distinction is worth a section:

| code | what it means | what the operator does |
|---|---|---|
| `unreadable_document` | **no trustworthy anchor exists.** The document cannot be used as it stands. | check the paper: a better scan if the text will not read, the supplier if the document's own totals disagree |
| `reconciliation_failed` | the check **ran**, against printed totals that are sound among themselves, and the line sum **missed** | enter it by hand against the printed total |

#### The six arms, and each is its own case

| # | condition | code |
|---|---|---|
| 1 | the header fails its own arithmetic, section 5.3a check A or B | `unreadable_document` |
| 2 | **zero lines returned**, whatever the printed totals say | `unreadable_document` |
| 3 | any line has a null `line_total` | `unreadable_document` |
| 4 | `prices_include_vat` selects a total and that total is null, or no total is printed at all | `unreadable_document` |
| 5 | `prices_include_vat` is null and **neither** total matches | `unreadable_document` |
| 6 | anchor known, header sound, lines complete, and the sum **missed** | `reconciliation_failed` |

**ARM 1 IS EVALUATED FIRST AND DOMINATES.** A document whose header does not add
up AND whose line sum missed is `unreadable_document`. Without a fixed order the
same document would get different codes depending on which check happened to run
first.

**ARM 2 INCLUDES THE CASE WHERE THE PRINTED TOTAL IS ITSELF `0`.** Until EXT-23 a
zero-line payload against a printed total of `0` **reconciled and was not refused
at all**, because `|0 - 0|` is inside the floor of `0.05`. It was stored
`extracted`, with no lines, as a clean read. **The sum of nothing agreeing with
zero is not evidence of anything.**

**ARM 5 IS NOT ARM 6 WITH A NULL FLAG.** With the flag absent, nobody knows which
of the two printed totals was the anchor. When neither matches, it cannot be said
that the sum missed an anchor, because no anchor was ever established.

**A `not_run` HEADER CHECK IS NOT ARM 1.** Section 5.3a already says a missing
figure means the check DID NOT RUN and does not reject on its own. Such a payload
falls through to the anchor test exactly as before this card.

#### This changes what a code MEANS on the wire, and Andre is told before his next delivery

**`unreadable_document` was a payload-path code in section 5.2a, emitted by the
extractor.** After this card **our validator emits it too**. Seeing it no longer
implies the extractor could not read the document; it may equally mean the
platform found no trustworthy anchor in a payload the extractor delivered
happily.

**NO NEW CODE IS ADDED, so section 5.2a's four requirements for adding one do not
bind here.** What does bind is its reasoning: the two sides must not hold
different copies of what a value means. The group table in 5.2a carries this as a
note in the same pull request, and it is a communication item on EXT-23 rather
than an assumption.

**A DIGITAL-SOURCED PAYLOAD IS NOT TOUCHED BY THIS SECTION.** There the numbers
come from text rather than from a reading, and a mismatch means something else.

**WHY IT IS ARITHMETIC AND NOT AN INSTRUCTION TO THE MODEL.** One 7-line document
with a printed total of `50336.40` excluding VAT returned four different line
sums across four runs: `49035.40`, `48060.40`, `39242.00`, `38429.40`, every one
of them with `status: extracted` and `reason: null`. A control that depends on the
model noticing it has misread is not a layer.

**AMENDED 2026-09-09 BY RULING R-185, AND THE ORIGINAL SENTENCE IS QUOTED BELOW
RATHER THAN DELETED.** The spread between those sums was read here as the
justification, and **the spread is not the failure**. Andre measured the same
document at the LINE level across four passes: **one unit price moves, three lines
are byte-identical and correct every pass, and one line is byte-identical and
wrong every pass.** One field walking produces four distinct totals, so the
totals moved while the reading did not. **The failure is a deterministic misread,
not variance.**

**THIS IS A CONTRACT-LEVEL PROHIBITION AND NOT ONLY A CORRECTION.** Because the
wrong line is byte-identical on every pass, **multi-pass comparison and majority
voting across passes are ruled out permanently**: a vote agrees with itself on a
deterministically wrong line and reports it as unanimous. No amendment to this
contract may propose running the extraction more than once and comparing the
results.

**The superseded sentence, kept verbatim:**

> *"One 7-line document with a printed total of `50336.40` excluding VAT returned
> three different line sums across three runs: `49035.40`, `39242.00`, `38429.40`,
> every one of them with `status: extracted` and `reason: null`. They disagree
> with **each other** by `10606.00`, against a tolerance of `0.07`."*

It was accurate about what had been measured when it was written. The fourth run
and the line-level comparison are what changed it.

**`reconciliation_failed` IS NEW AND ANDRE IS TOLD BEFORE IT IS EMITTED**, which
is ruling **R-123** and not a courtesy: section 5.2 makes any value outside the
set a rejected payload, `400`, and Make does not retry a `4xx`.

**IT IS THE FIRST MEMBER OF THE THIRD GROUP DECLARED IN 5.2a**, which landed
separately and is now directly above this section. That group is our own
validator refusing a well-formed payload: the download succeeded and the model
returned, so it belongs to neither of the other two.

### 5.3a Header self-consistency. Card EXT-18, 2026-09-04.

Two further arithmetic checks, on the figures the document prints **about
itself**, run on the same payloads and with the **same tolerance** as 5.3.

| | check | what it asks |
|---|---|---|
| **A** | `subtotal + vat_amount` against `document_total` | do the document's own three totals agree |
| **B** | `subtotal * vat_rate` against `vat_amount` | is the VAT the stated rate of the stated base |

#### The tolerance is 5.3's, called and not restated

    tolerance = max(0.05, 0.01 * line_count)

**The same named expression, read from one place.** This is not a style
preference: two tolerances that disagree at the boundary are worse than one, and
the boundary is the only place a tolerance is ever consulted. Both sides are
rounded to two decimals **before** subtracting, exactly as in 5.3, for the same
reason.

`line_count` is the **document's** line count. On a header-only payload it is
zero and the floor of `0.05` wins. That is correct rather than a special case: a
header check does not become stricter because the lines are missing.

#### A missing figure means the check DID NOT RUN. It does not mean it passed.

`subtotal`, `vat_amount`, `document_total` and `vat_rate` are all nullable by
section 4.1. Check A needs three of them and check B needs three of them; when
one is absent, that check is recorded as **not run**, and a not-run check never
rejects on its own. What rejects a document whose totals are absent entirely is
5.3's `target_missing` rule, which is unchanged.

#### Same scope as 5.3: scan-sourced payloads only

A digital-sourced payload is **not touched** by this section either, and that is
a decision rather than an omission. 5.3 left the digital path alone deliberately;
a new refusal there would change, silently, the behaviour of documents Andre
delivers today, and section 5.2a requires a new failure on a surface to be
announced before it can appear.

#### A failure carries `reconciliation_failed`, not a new code

Same wire shape as 5.3: `status: failed`, `error_code: reconciliation_failed`, no
lines stored, header kept. **No ninth code was added**, because section 5.2a
requires a new code to be communicated in both directions before it can be
emitted or received, and this check needed none: its Romanian sentence already
says the figures do not agree, which is true here too.

#### WHAT THESE TWO CHECKS DO NOT DO, AND THIS PARAGRAPH IS THE POINT OF THE SECTION

**They do not detect a fabrication, and they do not close the gap 5.3 left open.**

Andre confirmed the asymmetry with evidence. On the Matnord scan **whose line
table contained four fabricated lines**, the header was read correctly, so:

    A:  subtotal + vat_amount  vs  document_total     misses by exactly 0.00
    B:  subtotal * vat_rate    vs  vat_amount         misses by exactly 0.00

Both checks **pass** that document. The line-sum check in 5.3 is what refused it,
missing by `1301.00` against a tolerance of `0.07`.

What these checks do is raise the **cost** of a fabrication that survives: it now
has to be coordinated across the header **and** the line table rather than only
inside the line table. That is a real gain and it is a different claim.

**The last control is a person looking at the scan.** Neither this section, nor
5.3, nor the review screen's per-line marking replaces that, and none of them
reduces the risk to zero.

#### The four sample documents are the fixtures, and all four hold both checks

A guard that has only ever run against documents it rejects has not been shown to
accept a correct one. `npm run check:reconciliation` carries all four sample
documents' header figures, read from the files themselves:

| document | lines | tolerance | A misses by | B misses by |
|---|---|---|---|---|
| `aviz-scan-matnord-0021884` | 7 | 0.07 | 0.00 | 0.00 |
| `confirmare-comanda-mpc-8842` | 6 | 0.06 | 0.00 | 0.00 |
| `factura-betonmix-4417` | 5 | 0.05 | 0.00 | **0.01** |
| `factura-tehnocom-0009312` | 54 | 0.54 | 0.00 | 0.00 |

Betonmix's `0.01` is the one that matters: `89609.38 * 0.20` is `17921.876` and
the document prints `17921.87`. Four documents all landing at exactly zero would
not have shown that the tolerance is reachable at all.

---

## 6. Callback response codes

Our callback endpoint answers with exactly one of these. Make retries on `5xx`
and does not retry on `4xx`, so this table decides whether a bad payload is
retried forever or dropped once.

| code | meaning | Make's behaviour |
|---|---|---|
| `202` | Accepted. Stored as a draft. | done |
| `200` | Duplicate. This `order_id` already carries an extraction; the payload replaced it per section 2.2. | done |
| `400` | Rejected. The payload does not satisfy this schema. | do not retry |
| `401` | Bad secret. `MAKE_CALLBACK_SECRET` missing or wrong. | do not retry |
| `5xx` | Our side failed. Nothing was stored. | retry |

`202` and `200` are both success. They are split so that our logs can tell a
first delivery from a retry without inspecting the database.

**A `5xx` must mean nothing was stored.** If we half-store and then fail, the
retry arrives against a partially written row. The write is one transaction or
it is not a write.

---

## 7. The visible failure surface

Ruling R-014, amendment 3. Bound to **P2-09**.

`failed` and `partial` are both visible document states. For each, the operator
sees:

- the document, in the list, in a state that is not "pending" and not silence
- the `reason`, in full
- the `error_code`, rendered as a Romanian sentence rather than as the token
- a **re-fire control** that re-posts the same document **with the same
  `order_id`**

The same `order_id` is what makes the re-fire safe: per section 2.2 the result
replaces the previous extraction instead of adding a second one.

A failure the operator cannot see is a document that sits in the system looking
pending forever, and the operator learns to distrust the whole screen because of
it.

---

## 8. Four prompt rules

These bind Andre's prompt, not our code. They are here because every one of them
produces silently wrong numbers rather than an error, which means our side
cannot detect a violation and a human will not notice until the stock is wrong.

### 8.1 Comma is the decimal separator. Dot is the thousands separator.

Romanian and Moldovan invoices write `1.234,56` for one thousand two hundred
thirty four and fifty six hundredths. Parsed as an English number that is
`1.23456`, or `1234.56`, or a parse error, depending on the library.

`18.450,00` is `18450.00`. `240,5` is `240.5`. The output JSON always carries a
JSON number with a dot, whatever the document used.

### 8.2 Dates are day-first for RO and MD suppliers, and `order_date` is the document's date.

`03/04/2026` on a Romanian or Moldovan invoice is **3 April 2026**, never 4
March. Output is always ISO `YYYY-MM-DD`.

`order_date` is the date the document itself carries: the invoice date, the
order confirmation date. **It is not the delivery date, not the expected arrival
date, and not the date the file was uploaded.** A document carrying both dates
supplies its own date to this field and the other one is not sent at all.

### 8.3 Product names are verbatim and untranslated.

`Tigla metalica Bilka Classic 0.45mm visiniu` stays exactly that. Not
translated to English, not normalised, not title-cased, not stripped of the
manufacturer or the colour or the thickness.

The name is how the operator matches an extracted line against the catalogue,
and a translated or tidied name matches nothing. Diacritics are preserved as
printed; when the document prints none, none are added.

### 8.4 `document_source` is declared, and `scan` is the answer under any doubt.

Ruling R-097, amendments 1, 2 and 3.

**Amendment 1. The emitter carries `scan` and `digital`, and nothing else.** No
`unknown`, no `photo`, no `mixed`, no empty string. Every consumer of this field
has exactly two arms, and a third value is not a richer signal, it is a branch
nobody wrote.

**Amendment 2. The model declares `scan` whenever it is not certain.** This is a
prompt rule, which is why it is in this section and not in section 4. Uncertainty
about the source is not reported as uncertainty; it is reported as `scan`.

The asymmetry is the reason and it is not generic caution. Calling a scanned
document `digital` puts invented stock into a real warehouse. Calling a digital
one `scan` costs somebody reading a document with their own eyes. Those two errors
are not the same size, so the tie is not broken in the middle.

**This is not `confidence` under a new name.** `confidence`, removed by EXT-14,
asked the model to know that it had misread something, which is knowledge it does
not have. This asks it to break a tie in a stated direction when it cannot tell an
image from a text layer. The first is introspection. The second is a default.

**Amendment 3. Absent reads as `scan` on our side, and that is the SECOND layer.**
A payload omitting the field, or sending it null, is read as `scan`. Amendment 2 is
not made redundant by this, and the order matters: a prompt rule enforced only by
our default is one nobody can observe being broken, because every violation arrives
looking exactly like a payload that obeyed it. The default catches the emitter that
has not shipped the rule yet. It is not the rule.

**Our accepted set is not narrowed by any of the three.** These amendments bind
what the scenario EMITS. What our validator ACCEPTS is a separate set, it is wider,
and it stays wider deliberately: an acceptance set that tracks the emitter's
exactly turns either ordering of two deploys into an outage. **Acceptance may be
wider than emission and is never narrower.** Dropping a value from the emitter is
therefore safe to do at any time and needs no coordination with us.

---

## 9. What this contract deliberately does not cover

- **No polling endpoint and no progress channel.** Fire, work, callback.
- **No partial callbacks.** One callback per `order_id` per attempt, carrying
  the whole result. A `partial` status is not a partial message.
- **No third-party conversion sub-processor**, per ruling R-015. If Make's
  OpenAI file input cannot read a format, the conversion is built inside our own
  application. A converter sees every supplier invoice in full, so adding one is
  a data-sharing decision about the client's commercial information and needs an
  owner ruling naming the service.
- **No automatic product creation.** An extracted line naming a product the
  catalogue does not have creates a flagged product with `needs_review` set. It
  never silently merges onto a similar SKU. That behaviour belongs to P2-09.
