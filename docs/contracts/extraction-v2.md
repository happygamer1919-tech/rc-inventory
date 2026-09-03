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
  "confidence": 0.94,
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
      "confidence": 0.91
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
| `currency` | enum or null | yes | Mapped to `currency_code`: `EUR`, `RON`, `MDL`. Null when the document's currency is not one of the three. |
| `currency_raw` | string or null | yes | Verbatim, as printed. `lei`, `MDL`, `EUR`, whatever it said. |
| `confidence` | number or null | yes | 0 to 1, for the document as a whole. |
| `lines` | array | no | May be empty on `failed`. Never null. |
| `_meta` | object | no | Section 4.3. |

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
| `confidence` | number or null | yes | 0 to 1, for this line. |

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
| **stored as** | a column, `extraction_drafts.page_count`, added by `0033_extraction_draft_page_count.sql` |
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

`reason` stays free text alongside the code. The code is what we branch on; the
reason is what the operator reads.

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

## 8. Three prompt rules

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
