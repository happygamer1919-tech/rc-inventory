# Uploads that were never read, 14 to 21 September 2026, and what to do with each

Role AUTHOR. Card P3-87. Ivan's finding F21, part 2, as changed by his addendum of 2026-09-21.
Branch `card/p3-87`. This file is the card's report; there is no second one.

## (a) In plain words, for Max

1. Between 14 and 21 September some uploaded documents were stored but never read, because one setting was missing. Nobody was told at the time.
2. Ivan says these were uploaded to add materials, not as supplier deliveries. They are **not** sent for reading again.
3. You can see the list yourself: paste one file into Supabase and press Run (steps in section (d)). No terminal does this for you.
4. For each document on the list: if it shows on the "Încarcă comandă" screen, press **"Renunță la document"**. That hides it and keeps it on record.
5. Some documents were attached to an order someone had already typed in. The screen cannot reach those, so just note them for a follow-up card.
6. Nothing in these documents created an order or changed stock. The system refuses to confirm a document that was never read.
7. **Do NOT** press "Retrimite" (send again). **Do NOT** remove anything in the SQL editor. **Do NOT** run anything except the two files named below.
8. If any row says `was_confirmed = true`, change nothing. Tell Ivan. That is a question, not a task.

Everything below is the detail behind those eight lines.

## (b) Which path an upload takes, by lane

Only three places in the code start a document reading. All three call `fireExtraction` in
`lib/data/extraction-fire.ts`. Proof: `git grep -n "fireExtraction" -- app lib components` shows
exactly three callers and no fourth:

| Lane | Where the person clicks | Code | File stored at | Draft row key |
|---|---|---|---|---|
| **Review lane** | Menu "Intrări", then "Încarcă comandă" (`/incarca-comanda`), the upload box | `startExtraction` in `lib/data/extraction-actions.ts`, called from `ExtractionReviewPanel` | bucket `rc-docs`, folder `extractions/<id>/` | a new id made at upload; no order exists yet |
| Review lane, second press | the "Retrimite" button on a card on that same screen | `refireExtraction` in `lib/data/extraction-actions.ts` | same file as before | the same id |
| **Order lane** | an existing inbound order on "Comenzi", the box "Nu există document atașat" | `uploadOrderDocument` in `lib/data/inbound-actions.ts`, from `components/orders/OrderDocumentUpload.tsx` | bucket `rc-docs`, folder `inbound/<order id>/` | the id of the order that already exists |

**The Documente tab never reads anything.** The "Documente" tab on a client or a project
(`components/documents/DocumentsPanel.tsx`, server side `lib/data/document-actions.ts`, table
`documents`, the same bucket `rc-docs` under `client/` or `project/` folders) stores the file and
lists it. It does not call `fireExtraction`, so a file put there was never going to be read and
cannot be on this list. Nothing about it failed.

**What went wrong in the window.** With the setting `MAKE_WEBHOOK_URL` missing, `fireExtraction`
refuses to send. What that refusal left behind depends on the date:

- **Before card P3-71** (merged 2026-09-17 15:30 US Eastern, 19:30 UTC, PR #321): the refusal
  returned before any draft row was written. `startExtraction` then tried to mark a row failed and
  matched nothing; `uploadOrderDocument` did not even read the result. **No draft row exists for
  those uploads.** The one exception is a "Retrimite" press on a draft that already existed: that
  row WAS marked `failed`, with `error_code = download_failed` and the reason
  "Variabila de mediu MAKE_WEBHOOK_URL lipseste."
- **From P3-71 onward**: `fireExtraction` writes the failed row itself (`recordConfigRefusal`) with
  `error_code = config_error` (label added by migration `0051_error_code_config_error.sql`) and the
  reason "Variabila de mediu MAKE_WEBHOOK_URL lipsește. Documentul a fost încărcat și păstrat, dar
  nu a fost trimis la extragere." In the roughly two minutes between the merge and 0051 reaching
  the database, the same refusal was written as `download_failed` with that reason.
- **From card P3-85** (merged 2026-09-21 18:46 US Eastern, PR #343): the person who uploads is
  also told on screen, at once, that reading did not start.

The list file catches all three row shapes: `config_error`, and `download_failed` whose reason
starts with "Variabila de mediu MAKE_WEBHOOK_URL".

**Which lane Ivan's "add materials" uploads most probably took.** From the code, most probably
the **review lane**, "Încarcă comandă". It is the only screen that takes a document without an
order existing first, and its menu line reads "Încarcă o confirmare și lasă sistemul să o
citească". The order lane needs someone to have typed the order on "Adăugare manuală" first. This
is a probability read from the screens, not a fact. The `lane` column of the list answers it for
every row.

## (c) What confirming one would do, and how a confirmed one is recognised

**A document that failed like these cannot be confirmed at all.** There are two barriers:

1. **The screen.** In `ExtractionReviewPanel.tsx` the "Verifică" button, the only way into the
   confirmation form, is shown only for status `extracted` or `partial`. A `failed` card shows its
   reason, "Retrimite" and, for the owner, "Renunță la document". It has no form.
2. **The database.** `confirm_extraction_draft` (migration 0010, replaced whole by 0011, never
   changed since) refuses with "Documentul nu are date extrase de confirmat." when
   `status is null or status = 'failed'`. This check runs inside the database, so no screen can
   get around it.

So on every row of this list, `was_confirmed` should read `false`. A `true` would mean the row was
confirmed while it was readable and failed later. The code prevents that too: `refireExtraction`
refuses a confirmed draft. That is why section (d) makes it a question for Max and Ivan.

**What a confirmation does, for a document that WAS read** (`confirmExtractionDraft` in
`lib/data/extraction-actions.ts`, then `confirm_extraction_draft` in migration 0011), as one
database transaction:

- makes a **new inbound order** with status `pending_arrival` ("waiting for delivery"), the
  supplier, currency and dates typed on screen, and the stored document attached;
- writes its **order lines** (product, quantity, price);
- writes the first **status history** row, "Comandă creată din document extras automat, verificat
  de operator.";
- marks the draft used: `confirmed_at` (when) and `confirmed_inbound_order_id` (which order), plus
  `confirmed_by`.

Before that transaction, for any line where nobody picked an existing catalog product,
`confirmExtractionDraft` **adds a new catalog product** marked `needs_review`, with an `EXT-` code.

**Stock does not move at confirmation.** Stock goes up only when someone receives the order
(`receiveInboundOrder` in `lib/data/inbound-actions.ts`, database function `receive_inbound_order`).
That creates the stock batches, reported back as `createdBatches`, with `alreadyArrived` meaning it
was received before.

**Against the owner's mental model, "an inbound order plus stock movements, not catalog
materials":**
- "an inbound order": **true**, waiting for delivery.
- "plus stock movements": **not at confirmation**. They happen later, when the delivery is received.
- "not catalog materials": **not always true**. A line with no catalog product picked becomes a new
  catalog product marked for review.

None of this applies to the documents on this list, because none of them could be confirmed.

**How a confirmed draft is recognised:** `confirmed_at` is set. That column is the fact; only a
confirmation writes it (0011, correction 2). `confirmed_inbound_order_id` points at the order, but
it can go back to empty if that order is ever removed, so it is only a pointer. In the list these
are `was_confirmed`, `confirmed_at`, `confirmed_into_order_id` and `confirmed_into_order`.

## (d) Step by step for Max

**Get the numbers first (optional).**

1. Open https://supabase.com and sign in.
2. Open the project **RC_inventory**.
3. In the left bar, click **SQL Editor**, then **New query**.
4. Open `scripts/poc-free/count-config-error-drafts.sql` on GitHub (repo `rc-inventory`, branch
   `main`), click **Raw**, copy everything, and paste it into the editor.
5. Click **Run**. You get one row:
   - `total`: how many documents were stored and never read (for those that left a row).
   - `review_lane` / `order_lane`: how many came from "Încarcă comandă" and how many from an
     existing order.
   - `confirmed`: should be 0. If not, see outcome 4 below.
   - `dismissed`: already hidden with "Renunță la document".
   - `review_lane_still_open` / `order_lane_still_open`: what is left to deal with.
   - `first_uploaded_at` / `last_uploaded_at`: the date range.

**Then the list.**

6. Click **New query** again. Paste `scripts/poc-free/list-config-error-drafts.sql` the same way.
7. Click **Run**. One row per document, oldest first. The columns:
   - `draft_id`: the document's internal number. You do not need it except to quote it.
   - `file_name`: the name of the file as uploaded.
   - `uploaded_at`: when (UTC; add 3 hours for Chișinău time).
   - `uploaded_by`: expected EMPTY on every row. No upload path in the code fills this column, so
     it cannot tell you who uploaded.
   - `stored_at_path`: where the file sits in storage (`extractions/...` = review lane,
     `inbound/...` = order lane).
   - `status`, `error_code`, `reason`: always `failed`, the code, and the Romanian reason.
   - `lane`: REVIEW LANE or ORDER LANE, see section (b).
   - `attached_to_order`: for the order lane, the order's reference (for example `INT-2026-...`), so you
     can find it on "Comenzi".
   - `was_confirmed`, `confirmed_at`, `confirmed_into_order_id`, `confirmed_into_order`: whether an
     order was made from it. Expected `false` and empty.
   - `is_dismissed`, `dismissed_at`, `dismiss_reason`: whether it was already hidden.

**The four outcomes, row by row.**

1. **Review lane, not confirmed, not dismissed.** Open https://app.rapidconstruct.md, menu
   "Intrări", "Încarcă comandă". Find the card with that file name. Press **"Renunță la
   document"**, optionally type a reason (for example "Încărcat pentru materiale, nu livrare"),
   then **"Da, renunț la document"**. It moves to the collapsed "Renunțat" section below the list.
   Only the owner account sees the button. It went live with card P3-84 on 2026-09-21; if you do
   not see it, stop and tell Ivan. **Do not press "Retrimite" on the same card.**
2. **Order lane, not confirmed, not dismissed.** These are **not** on the review screen, so they
   cannot be dismissed from any screen today. Leave them. Copy `attached_to_order` and `file_name`
   into a note for the follow-up card below. They do no harm meanwhile: nothing lists them and
   nothing can confirm them. The order and its attached document are unaffected.
3. **Already dismissed** (`is_dismissed = true`). Nothing to do.
4. **Confirmed** (`was_confirmed = true`). **Do nothing** in the app or in Supabase. Send Ivan the
   `draft_id` and `confirmed_into_order`. It is a question for the two of you, not an action.

**Proposed follow-up card (a sentence, not code):** put "Renunță la document", owner only, on an
inbound order's screen next to its attached document when that document's reading failed, using
the same guarded dismiss action as the review screen, so order-lane drafts can be cleared without
anyone touching the database.

## (e) What NOT to do

- **No refire.** Do not press "Retrimite" on any of these. Ivan's ruling: they were uploads to add
  materials, not supplier deliveries.
- **Remove nothing in the SQL editor.** No row, no file in storage. Test and junk data is
  cancelled, never removed. "Renunță la document" is how it is cancelled.
- **Run only the two read-only files** named above, as they are. Do not edit them, and do not
  paste anything else from any chat or terminal into the SQL editor.
- Do not re-upload the same documents on "Încarcă comandă" to "see if they read now". That makes
  new drafts, not a fix.

## (f) What this report could not establish

- **Uploads before P3-71 (before 2026-09-17 19:30 UTC) left no draft row**, unless someone later
  pressed "Retrimite" on them. No query on drafts can find them. The files themselves are still
  there: in Supabase, left bar **Storage**, bucket **rc-docs**, folder **extractions/** (review
  lane, one sub-folder per upload) and folder **inbound/** (order lane, one sub-folder per order).
  A sub-folder of `extractions/` dated in the window, with no matching row on the list, is such
  an upload. Order-lane files also show on the order itself as its attached document.
- **Whether `MAKE_WEBHOOK_URL` was really missing in production for the whole window.** The code
  only says what happens when it is. The list shows when it happened.
- **Who uploaded each document.** `extraction_drafts.created_by` exists (0008) but no upload path
  writes it.
- **Which lane Ivan's uploads took**, except as the probability in section (b). The `lane` column
  answers it.
- **No production data was read** to write this. This machine has no production access and the
  numbers exist only when Max runs the files.

## Evidence

Commands run in the worktree, each exit 0 unless marked:

- `npm run id:free -- P3-87`: "P3-87 is FREE", lane highest P3-86, 0 open pull requests.
- `node scratchpad/p3-87-parse.mjs` (local, untracked; the pgsql-parser that `check:reset-sql`
  uses): each file is 1 statement, kind `SelectStmt`, tables only `public.extraction_drafts` and
  `public.inbound_orders`, functions only `count`, `min`, `max` (count file) and none (list file),
  no SELECT INTO, no row lock, no WITH, no `meta`.
- `grep -inwE "insert|update|delete|drop|truncate|alter|grant|create|set"` on both files: no
  match (grep exit 1, meaning nothing found). No file contains two semicolons on a line; neither
  contains a semicolon outside a comment.
- The brief's form without `-w` matched only lines naming the required columns `created_at` and
  `created_by`, never a comment. See the learning below.
- `npm run check:reset-sql`: 9 checks passed. `npm run check:no-prod-target`: 5 checks passed.
  Neither script reads `scripts/poc-free/*.sql`, so the new files cannot trip them.
- Board validator on all three boards: PASS before every commit.
- The close-out gate set and CI results are in the pull request body.

Learnings: one entry appended to `docs/LEARNINGS.md` (the text guard matching column names).
Nothing else broke.
