# R-199 end-to-end run: the click path, the filename, the query and the pass condition

**Role:** EXECUTOR (ORANGE)
**Date:** 2026-09-21
**Measured at:** `main` `a7aeb2b`

**NOTHING IN THIS SESSION TOUCHED PRODUCTION.** No database connection, no
credential sourced, no Vercel or Supabase CLI call, no `.env` file opened. Code,
migrations and rulings read at the sha above. Every claim below carries a
`path:line` opened and read in that session, or the marker **UNMEASURED**.

**WHO DOES WHAT.** Ivan uploads the seven staged files through the production UI
and runs the query in the Supabase SQL Editor himself. This file is the
instruction sheet, not a record of a run.

---

## PART A. THE CLICK PATH

### A0. THE DISPATCH NAMED THE WRONG ACTION, AND THIS IS THE CORRECTION

The dispatch asked for *"the upload flow that fires with no order
(`uploadOrderDocument`)"*. **Those are two different flows and
`uploadOrderDocument` is not the one that fires with no order.**

| | `startExtraction` | `uploadOrderDocument` |
|---|---|---|
| signature | `(formData)` — `lib/data/extraction-actions.ts:81` | `(orderId, formData)` — `lib/data/inbound-actions.ts:166-169` |
| needs an existing order? | **no** | **yes** |
| where `order_id` comes from | minted, `randomUUID()` at `lib/data/extraction-actions.ts:91` | passed in by the caller |
| touches `inbound_orders`? | no | **yes**, updates the row at `lib/data/inbound-actions.ts:193-196` |
| storage path | `extractions/<order_id>/<name>` (`:92`) | `inbound/<order_id>/<name>` (`lib/data/inbound-actions.ts:183`) |

**USE `startExtraction`. It is the flow for a supplier document that has no order
yet**, and the page's own header says so: *"Un document intra in lane fara sa
existe o comanda ... comanda se naste abia la confirmare"*
(`lib/data/extraction-actions.ts:75-79`). The second flow is the
P2-08a lane, where the operator types the order first and attaches the document
to it, described at `app/(app)/incarca-comanda/page.tsx:12-15`.

**WHY IT MATTERS FOR THIS RUN, AND IT IS NOT A STYLE POINT.**
`uploadOrderDocument` would require seven `inbound_orders` rows to exist first and
would WRITE to each of them. `startExtraction` creates no order and touches no
business table, so an unconfirmed run leaves drafts and storage objects and
nothing else.

### A1. THE STEPS, ONE PER CLICK

**Precondition for every step: signed in with an account whose `profiles` row is
active.** The session gate is `lib/data/extraction-actions.ts:82-83`, resolved by
`lib/supabase/server.ts:43-57`, which refuses a missing or inactive profile at
`:57`. **No owner role is required**: the owner-only route list holds exactly one
entry, `/setari` (`lib/routes.ts:13`), enforced at `proxy.ts:214`.

---

**STEP 1. Open the upload screen.**

- In the left sidebar, under the group **`Intrări`** (`lib/nav.ts:69`), click
  **`Încarcă comandă`** (`lib/nav.ts:73`, route `/incarca-comanda` at `:72`).
- **Expected:** the page renders with a card headed
  **`Citire automată din document`**
  (`components/orders/ExtractionReviewPanel.tsx:700`) and the instruction
  *"Încarcă documentul furnizorului. Se citește automat, apoi verifici datele
  extrase și confirmi. PDF, PNG sau JPG, până în 10 MB."* (`:702-703`).
  The page is `app/(app)/incarca-comanda/page.tsx:34`.
- **STOP IF:** the card is absent, or the screen shows a Romanian forbidden
  message. Do not proceed; the account or the deploy is wrong.

---

**STEP 2. Pick the first file. THIS CLICK IS THE FIRE.**

- Click the button labelled **`Alege fișierul`**
  (`components/ui/FilePicker.tsx:31`) and choose
  `/Users/ivan/rc-samples/e2e/TEST-R199-MPC.pdf`.
- **THERE IS NO SEND BUTTON AND NO CONFIRMATION STEP.** The picker's `onChange`
  is `onFile` (`components/orders/ExtractionReviewPanel.tsx:708`), and `onFile`
  calls the server action directly at `:678`. Choosing the file uploads it and
  fires it.
- **Expected, immediately:** the line **`Se trimite spre citire...`** appears
  under the picker (`components/orders/ExtractionReviewPanel.tsx:715-718`) and
  the picker is disabled while it runs (`:709`).
- **Expected, on completion:** the pending line disappears and the screen
  refreshes (`components/orders/ExtractionReviewPanel.tsx:685`). The chosen file
  name stays displayed (`:673`, and the reason at `:670-672`).
- **STOP IF:** a red box appears under the picker
  (`components/orders/ExtractionReviewPanel.tsx:720-728`). That is the only
  user-visible refusal and it comes from `startExtraction`'s own guards: not a
  file (`lib/data/extraction-actions.ts:86`), wrong type (`:87-88`), over 10 MB
  (`:89`), or a storage failure (`:98`). Read the sentence and stop.

---

**STEP 3. Confirm the draft appeared.**

- **Expected:** a row appears in the list below the upload card, headed with the
  **file name** (`components/orders/ExtractionReviewPanel.tsx:775-777`).
  Before this run the list reads **`Niciun document în așteptare.`** (`:757-758`).
- The row carries `data-status` (`:770`), which is `pending` until a callback
  arrives (`:770`, `draft.status ?? "pending"`).
- **STOP IF:** no row appears at all. The upload succeeded but no draft row was
  written, which is a different failure from a failed draft.

---

**STEP 4. Repeat steps 2 and 3 for the remaining six files, ONE AT A TIME.**

`TEST-R199-SILVAMAT.pdf`, `TEST-R199-NORDAVEX.pdf`, `TEST-R199-LUMICAST.pdf`,
`TEST-R199-MATNORD.pdf`, `TEST-R199-BETONMIX.pdf`, `TEST-R199-TEHNOCOM.pdf`.

**One at a time, and wait for `Se trimite spre citire...` to clear between
files.** The picker is disabled while a send is in flight (`:709`), and each
upload mints its own `order_id` (`lib/data/extraction-actions.ts:91`), so seven
files produce seven independent drafts.

- **STOP IF:** any file produces a red box. Record which one and its sentence.

---

**STEP 5. Wait for the callbacks, then re-read the screen.**

- Reload `/incarca-comanda`. Each row's status comes from the stored draft.
- **Expected within the extraction budget:** rows move off `pending`. The budget
  is the counterparty's, declared at `lib/data/extraction-budget.mjs:68` (120000
  ms above 20 lines) and `:71` (60000 ms below), and our own clock is only the
  15 second acknowledgement at `lib/data/extraction-budget.mjs:95`.
- A row with a stored `error_code` shows that code's Romanian sentence
  (`components/orders/ExtractionReviewPanel.tsx:782-789`); a `partial` row shows
  how many lines were kept (`:796-800`).
- **STOP IF:** every row is still `pending` after a few minutes. That means no
  callback reached us, and the first thing to check is the header name, which is
  the subject of ruling R-209.

---

**STEP 6. DO NOT PRESS CONFIRM ON ANY ROW.**

Confirming a draft creates a real `inbound_order` and its lines. An unconfirmed
draft touches no business table. **The run is finished at step 5**; everything
after that is the query in Part C.

---

### A2. WHAT THIS RUN LEAVES BEHIND

| | where |
|---|---|
| 7 `extraction_drafts` rows | written by the fire at `lib/data/extraction-fire.ts:221-223` |
| `extraction_draft_lines` rows, one per extracted line | written by the callback at `app/api/extraction/callback/route.ts:824`, previous batch cleared at `:779-782` |
| 7 objects under `rc-docs`, prefix `extractions/<order_id>/` | `lib/data/extraction-actions.ts:92`, bucket at `lib/data/inbound-types.ts:27` |
| **0 rows in any business table**, as long as step 6 is honoured | `lib/data/extraction-actions.ts:75-79` |

No screen and no server action deletes a draft: the extraction module exports
exactly three actions, `startExtraction` (`lib/data/extraction-actions.ts:81`),
`refireExtraction` (`:143`) and `confirmExtractionDraft` (`:237`). An
owner-authenticated DELETE can, under
`supabase/migrations/0008_extraction_drafts.sql:209-210`.

---

## PART B. THE FILENAME, AND WHETHER THE ANCHOR HOLDS

### B1. THE VALUE IS THE RAW FILE NAME. NOTHING SANITISES THE COLUMN.

`startExtraction` passes `file.name` **unmodified** to the fire
(`lib/data/extraction-actions.ts:110`), and the fire writes it to the column
(`lib/data/extraction-fire.ts:212`).

**`safeFileName` is applied to the STORAGE PATH ONLY**, not to the column:
`lib/data/extraction-actions.ts:92` wraps the name for the path while `:110`
passes the raw name for the row. The function itself is
`lib/data/row.ts:33-42`: it strips diacritics, replaces every run of characters
outside `A-Za-z0-9._-` with `-`, trims leading and trailing hyphens, and
truncates to 120 characters.

**NOTHING OVERWRITES `document_filename` AFTER THE FIRE.** The column is written
in exactly three places, all in `lib/data/extraction-fire.ts` and all from the
same input: the configuration-refusal upsert at `:136`, the main upsert at
`:212`, and the outbound payload at `:340`. The callback's `draftUpdate` object
does not carry the column at all, so no inbound payload can change it.

### B2. THE ANCHOR HOLDS. MEASURED, NOT ASSUMED.

Running `safeFileName`'s exact body from `lib/data/row.ts:33-42` over the seven
staged names:

| file name, and the stored `document_filename` | path segment | changed by sanitising? | matches `ilike 'TEST-R199-%'` |
|---|---|---|---|
| `TEST-R199-MPC.pdf` | `TEST-R199-MPC.pdf` | no | **yes** |
| `TEST-R199-SILVAMAT.pdf` | `TEST-R199-SILVAMAT.pdf` | no | **yes** |
| `TEST-R199-NORDAVEX.pdf` | `TEST-R199-NORDAVEX.pdf` | no | **yes** |
| `TEST-R199-LUMICAST.pdf` | `TEST-R199-LUMICAST.pdf` | no | **yes** |
| `TEST-R199-MATNORD.pdf` | `TEST-R199-MATNORD.pdf` | no | **yes** |
| `TEST-R199-BETONMIX.pdf` | `TEST-R199-BETONMIX.pdf` | no | **yes** |
| `TEST-R199-TEHNOCOM.pdf` | `TEST-R199-TEHNOCOM.pdf` | no | **yes** |

Every name is already inside `A-Za-z0-9._-`, so sanitising is a no-op even on the
path, and all seven are far under the 120-character truncation.

**NO SUBSTITUTE ANCHOR IS NEEDED.** `document_filename ilike 'TEST-R199-%'` is
the anchor.

**ONE THING THE UPLOADER MUST NOT DO:** rename the files, or upload them from a
different directory under different names. The anchor is the name the browser
sends, which is the file's basename on disk.

**UNMEASURED:** whether the browser sends the basename only. That is a browser
property, not a repository one. Every mainstream browser does; nothing was
executed to confirm it.

---

## PART C. THE QUERY

Read only. Three `SELECT` statements, no write, no DDL, no function call. **No
document content, no prices and no customer fields are returned.** Paste into the
Supabase SQL Editor and run. There is no placeholder to fill in.

```sql
-- R-199 end-to-end verification. Read only. Anchored on the filename the
-- upload writes: lib/data/extraction-actions.ts:110 -> extraction-fire.ts:212.

-- PART 1. One row per fired document.
select
  d.order_id,
  d.document_filename,
  d.created_at,
  d.fired_at,
  d.callback_at,
  (d.callback_at is not null)          as callback_arrived,
  d.status,
  d.error_code,
  d.supplier_name,
  d.document_source,
  d.page_count,
  d.upload_page_count,
  d.meta -> 'page_count'               as meta_page_count,
  d.platform_error_code,
  d.platform_arm,
  d.platform_derived_partial
from public.extraction_drafts d
where d.document_filename ilike 'TEST-R199-%'
order by d.document_filename;

-- PART 2. Line rollup per document.
select
  d.document_filename,
  d.status,
  d.created_at,
  d.callback_at,
  count(l.*)                                                as line_count,
  count(*) filter (where l.line_total_source = 'printed')    as lines_printed,
  count(*) filter (where l.line_total_source = 'derived')    as lines_derived,
  count(*) filter (where l.line_total_source is null)        as lines_source_null
from public.extraction_drafts d
left join public.extraction_draft_lines l on l.order_id = d.order_id
where d.document_filename ilike 'TEST-R199-%'
group by d.document_filename, d.status, d.created_at, d.callback_at
order by d.document_filename;

-- PART 3. The count that decides the run.
select
  count(*)                                                  as documents_found,
  count(*) filter (where callback_at is not null)           as delivered,
  count(*) filter (where callback_at is null)               as never_answered,
  count(*) filter (where supplier_name is not null)         as supplier_name_populated,
  count(*) filter (where meta -> 'page_count' is not null)  as meta_page_count_populated,
  count(*) filter (where status = 'extracted')              as status_extracted,
  count(*) filter (where status = 'partial')                as status_partial,
  count(*) filter (where status = 'failed')                 as status_failed,
  count(*) filter (where status is null)                    as status_null_still_pending
from public.extraction_drafts
where document_filename ilike 'TEST-R199-%';
```

**WHY `reason` IS NOT SELECTED.** `reason` is the sender's free text, stored as
sent (`app/api/extraction/callback/route.ts:651`), and it can quote the document.
It is left out so the result carries no document content. If a row needs
diagnosing, read it separately and deliberately.

**EVERY COLUMN ABOVE WAS CHECKED AGAINST THE MIGRATIONS BEFORE THIS FILE WAS
WRITTEN**, which is the trap PR #332 recorded when a dispatch asked for a
`received_at` column that does not exist. The timestamp a callback writes is
`callback_at` (`supabase/migrations/0008_extraction_drafts.sql:107-111`).

---

## PART D. THE PASS CONDITION

### D1. R-205, VERBATIM

> *"For the fixture runs, the regression passes only when the stored draft shows
> supplier_name and _meta.page_count populated; a 2xx status alone is not a
> pass."*

And its expected shape for the Silvamat file, verbatim from the same block:

> *"Expected: status failed, error_code unreadable_document, document_source
> digital, lines []."*

### D2. R-210, THE CLOSE EVIDENCE STANDARD

> *"(a) the three pre-model bodies (rejected file, download failure, oversized
> document) are accepted on Andre's written confirmation and are not proven
> inside the R-205 regression; (b) end-to-end delivery into stored
> `extraction_drafts` rows is required before close. Andre's seven runs of
> 2026-09-18 went to his own capture URL, never to RC, and are not close
> evidence."*

### D3. THE EXPECTED TABLE, AND WHERE OUR ROUTE COULD STORE SOMETHING ELSE

**These are ANDRE'S CLAIMS about what his reader sends. Our route can store a
different status or code than he sends, by four named mechanisms. A divergence is
a FINDING TO TRIAGE, not an automatic failure. R-205 decides the pass.**

| # | document | Andre's claim | could our route store something different? |
|---|---|---|---|
| 1 | Silvamat | `failed`, `unreadable_document`, `digital` | **No.** A sender code always wins: `effectiveErrorCode = errorCodeRaw` and `effectiveStatus = status` when `errorCodeRaw !== null` (`app/api/extraction/callback/route.ts:513-517`). This is R-190's precedence. |
| 2 | Matnord | `failed`, `reconciliation_failed`, `scan` | **No, for the same reason** (`:513-517`). But see M-a below: on the scan path our own classification could have produced a code had he sent none. |
| 3 | Nordavex | `partial`, no `error_code` | **YES, the code can change. Ruling R-211, merged today.** |
| 4 | Lumicast | `partial`, no `error_code` | **YES, same as Nordavex.** |
| 5 | MPC | `extracted`, 6 lines | **YES, the status can change. Migration 0054 / P3-80.** |
| 6 | Betonmix | `extracted`, 5 lines | **YES, same as MPC.** |
| 7 | Tehnocom | `extracted`, 54 lines, `meta.page_count` 3 | **YES, same as MPC.** |

Plus, on all seven: **`supplier_name` and `meta.page_count` non-null.** Both are
written unconditionally in `draftUpdate`, whatever the status —
`supplier_name` at `app/api/extraction/callback/route.ts:652` and `meta` at
`:669` — so a `failed` row can still satisfy R-205's pass condition.

### D4. THE FOUR MECHANISMS, EACH CITED

**M-a. Our scan reconciliation can turn his status into `failed`.** When
`document_source` is `scan`, `classifyScan` runs
(`app/api/extraction/callback/route.ts:402-404`). If it refuses and he sent no
code, `effectiveStatus` becomes `"failed"` and our code is stored
(`:514-517`). The refusing arms are
`header_inconsistent`, `no_lines`, `line_total_missing`, `target_missing`
(`lib/data/reconciliation.ts:328`, `:336`, `:351`, `:353`) and the pair
`anchor_unknown` / `line_sum_missed` (`:365-366`). **Applies to Matnord only, and
only if he sends no code.** He claims he sends one, so this should not fire.

**M-b. R-211: a digital `partial` with no code can GAIN a code, with the status
unchanged.** `suppliedCode` is non-null for a digital partial without a code when
our verdict is `reconciliation_failed` **or** the arm is `anchor_unknown`
(`app/api/extraction/callback/route.ts:508-512`), and it is then stored as
`error_code` (`:513`). **The status stays `partial`**, because
`!digitalPartialWithoutCode` is false at `:515`. Ruling R-211, merged as
`a7aeb2b` today. **Applies to Nordavex and Lumicast.** A stored
`unreadable_document` on either is R-211 working, not a regression.

**M-c. Migration 0054 / P3-80: a `derived` line moves `extracted` to `partial`.**
`derivedLineRoute` returns `routeToPartial` when the status is `extracted`, the
sender sent no code, and at least one line carries
`line_total_source: "derived"` (`lib/data/reconciliation.ts:556-562`), and the
stored status becomes `partial` (`app/api/extraction/callback/route.ts:577-578`).
**Applies to MPC, Betonmix and Tehnocom.** It is gated on 0054 existing
(`:569`), and `platform_derived_partial` records that we did it, which is why
Part 1 of the query selects that column.

**M-d. R-190 precedence: a sender code is never overridden.** `effectiveErrorCode`
takes `errorCodeRaw` whenever it is non-null (`:513`). **Applies to Silvamat and
Matnord**, and is why neither can diverge.

### D5. HOW TO READ THE RESULT

**PASS**, under R-205 and R-210(b), needs all four of:

- `documents_found` = 7
- `delivered` = 7 (every `callback_at` non-null)
- `supplier_name_populated` = 7
- `meta_page_count_populated` = 7

**A status or code that differs from the table in D3 is a FINDING, to be
triaged against D4 first.** If it is explained by M-b or M-c it is our own
documented behaviour and not a defect. If it is explained by neither, it is a
divergence between Andre's claim and what his reader actually sent, and it goes
to triage.

**WHAT IS NOT PART OF THIS RUN.** R-210(a): the rejected file, the download
failure and the oversized document close on Andre's written confirmation and are
not exercised here.

**ONE READING NOTE ON THE STATUS CODE, WHICH IS NOT IN THE QUERY.** Our route
answers `202` on a first delivery and `200` only when `callback_at` was already
set (`app/api/extraction/callback/route.ts:628` and `:837`, codes at
`lib/data/extraction-types.ts:184-185`). Seven first deliveries are seven `202`s.
The stored `callback_at` values in Part 1 settle it without trusting a reported
status.

---

## WHAT THIS FILE COULD NOT MEASURE

1. Whether the production account's `profiles` row is active.
2. Whether `MAKE_WEBHOOK_URL`, `MAKE_WEBHOOK_SECRET` and `MAKE_CALLBACK_SECRET`
   hold the values the counterparty expects. The dispatch states they are set;
   no value may be read.
3. **Whether `RC_CALLBACK_URL` is set in production.** If it is, it replaces the
   callback URL verbatim (`lib/data/extraction-fire.ts:84-86`) and it is in
   neither list in `lib/env-required.ts`, so nothing warns. **Confirm it is unset
   before the run.**
4. Whether `NEXT_PUBLIC_SITE_URL` was set before the last build. It is inlined at
   compile time, so a change to it needs a redeploy and not just an env edit
   (`lib/supabase/env.ts:3-4`, read literally at
   `lib/data/extraction-fire.ts:80`).
5. Which header name Andre's scenario sends on the callback. Ruling R-209 records
   that the contract only ever wrote down the outbound one.
6. Whether migrations `0053`, `0054` and `0055` are live in the production
   schema. The owner observed them listed as applied on 2026-09-21
   (`docs/migrations/APPLY-LOG.md`, forward fix); no terminal measured it. **M-b
   and M-c both depend on that, so a run that shows neither may simply be a run
   against a schema without those columns.**
