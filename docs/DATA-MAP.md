# The data map. Where supplier document content and client data come to rest.

**Card EXT-13, 2026-09-07.** This file exists because the map that mattered was
never written down, and a second data location was therefore discovered by the
person who had put data in it rather than by us.

**It is a map of RESTING PLACES, not of traffic.** Data in flight between two
rows below is not a row of its own; a row is somewhere a copy stays after the
request that carried it has finished.

**Read the retention column as a claim about what we KNOW.** Where the answer is
not known, the row says so and names who owes it. A map that guesses is worse
than no map, because it is consulted.

---

## 1. Supplier document CONTENT

The document a supplier sends: a delivery note, an invoice, an order
confirmation. It carries the supplier's name and identifiers, the client's
project, product names, quantities and prices.

| # | where | what rests there | retention | who owns the answer |
|---|---|---|---|---|
| 1 | **Supabase Storage**, bucket `rc-docs` | the uploaded file itself, byte for byte | **kept indefinitely.** Nothing in this repository deletes an uploaded document. The only `storage.remove` call anywhere is in `scripts/ext/serve-sample-documents.mjs`, deleting a probe object it created seconds earlier. | Ivan |
| 2 | **Supabase Postgres**, `extraction_drafts` and its lines | the EXTRACTED content: supplier name, document reference, dates, product names, quantities, unit prices, totals | **kept indefinitely.** A draft is accepted or rejected; neither deletes it. | Ivan |
| 3 | **Supabase Postgres**, `orders`, `order_lines`, `products`, `suppliers`, `batches` | the ACCEPTED content, which is the point of the system | kept indefinitely, deliberately. This is the inventory record. | Ivan |
| 4 | **Make.com**, Andre's scenario | the six-field payload we POST, the document BYTES the scenario fetches from the signed URL, and the callback payload it composes | **NOT KNOWN.** Make retains execution history per scenario and the window is an account setting. We have never been told which setting is in force. | **Andre**, relayed by Ivan |
| 5 | **OpenAI**, on Andre's account | the extracted CONTENT of the document, plus a conversation object per request | **NOT KNOWN, AND IT IS THE ROW THIS FILE WAS WRITTEN FOR.** It persists after the run unless retention is turned off. EXT-13 makes retention-off a REQUIRED CONDITION of the integration; until Andre confirms the flag, assume it persists. | **Andre**, relayed by Ivan |
| 6 | **GitHub**, this repository | `tests/fixtures/confirmare-comanda-bilka-BLK-2026-14507.pdf` and `tests/fixtures/confirmare-comanda-roben-RK-2026-88134.pdf` | **for ever, in git history**, where a deletion does not remove them. The content is SYNTHETIC, authored for the suite, and no real supplier document is in this repository. | Ivan |
| 7 | **Vercel**, request logs | the URL of every request our routes serve. `/api/documents/...` carries a signed token in the query string. The document BYTES stream through the function and are not logged. | a Vercel plan setting. **NOT KNOWN to this repository.** Ruling R-003 already treats the log retention window as an exposure period rather than assuming a fix unwrites a line. | Ivan |

**Row 5 is the one that was missing.** It was not on any map when the contract
was frozen, and the map it was missing from was the one everybody consulted.

---

## 2. Client data that is NOT document content

| # | where | what rests there | retention | who owns the answer |
|---|---|---|---|---|
| 8 | **Resend** | threshold reminder emails: product name, SKU, quantity, threshold, and the recipient address | Resend stores sent messages and their content for a period set by the account. **NOT KNOWN to this repository.** | Ivan |
| 9 | **Telegram** | the overnight digest sent to the owner's chat: card ids, titles and their plain-English lines. It carries no product, supplier, price or client row, and `scripts/poc/notify.mjs` asserts the absence of internal references before sending. It DOES carry the first names of the people the board names. | **for ever**, on Telegram's servers and on the owner's device. Neither is under our control. | Ivan |
| 10 | **Supabase Auth** | the account email addresses and password hashes for everyone who signs in | kept while the account exists | Ivan |
| 11 | **Anthropic**, the model behind every terminal in this repository | whatever a session reads: this repository's contents, board text, and command output. It never holds a credential value, because `scripts/poc/secret-names.sh` strips every name from the model child and `npm run check:executor-env` proves it. | an Anthropic account setting. **NOT KNOWN to this repository.** | Ivan |

---

## 3. What this map says about the sweep the card asked for

**Every third party that receives document content or client data is listed
above.** The sweep found no other. Specifically, and stated so that a later
reader does not have to re-derive the absence:

- **We hold no OpenAI credential.** There is no `OPENAI_*` name anywhere in the
  repository, in `lib/env-required.ts`, or on the strip list in
  `scripts/poc/secret-names.sh`. OpenAI is reached only from inside Andre's Make
  scenario, which is exactly why row 5 was invisible to us.
- **No analytics, error-reporting or session-replay service is installed.** No
  Sentry, no PostHog, no Google tag, no third-party script of any kind reaches
  the browser.
- **No payment processor exists**, because nothing is sold through this system.
- **The principle was already written down and pointed at the wrong party.**
  Section 9 of `docs/contracts/extraction-v2.md`, under ruling R-015, refuses a
  third-party conversion sub-processor on the grounds that *"a converter sees
  every supplier invoice in full, so adding one is a data-sharing decision about
  the client's commercial information"*. The model sees the same thing. The
  argument was applied to a service we might have ADDED while the one already in
  the path went unexamined, because it arrived with the extractor rather than as
  a choice of ours. That is a fact about how the integration was assembled, not
  about who ends up holding the data.

**Five of the eleven rows have an unknown retention answer**: 4, 5, 7, 8 and 11.
Two of them, 4 and 5, are owed by **Andre** through Ivan and are the subject of
EXT-13. The other three are Vercel, Resend and Anthropic account settings that
only **Ivan** can read. Each is named here rather than guessed, because a map
that guesses is worse than no map: it is consulted.

---

## 4. How this file stays true

**It is updated by the card that adds the location, in the same pull request.**
A map maintained by a later sweep is a map written by somebody reconstructing
what happened, which is how row 5 came to be missing in the first place.
