# The extraction fire path, end to end: what a real run needs, and what stops one today

**Role:** EXECUTOR (ORANGE)
**Date:** 2026-09-21
**Branch:** `board/20260921-e2e-fire-path`, cut from `origin/main` at `9784cdc`
**Measured at:** `main` `9784cdc3c730de296e8f5292948293761f6e91f9`

**NOTHING IN THIS SESSION TOUCHED PRODUCTION.** No database connection, no
credential sourced, no Vercel or Supabase CLI call, no `.env` file opened, no
network request. Code, migrations, board and rulings only, read at the sha above.

**THE CITATION RULE THIS FILE IS WRITTEN UNDER.** Every claim carries a
`path:line` opened and read in this session, or the marker **UNMEASURED** with
what could not be reached and why. A claim sourced only from a document cites
that document and marks the underlying code claim UNMEASURED. **No environment
variable VALUE, secret, token or resolved URL appears anywhere below**, per
`CLAUDE.md` section 7; names only.

---

## WHY THIS FILE EXISTS

Andre's seven runs never reached our callback. His scenario posts to the
`callback_url` carried in the intake payload, and he has never received a fire
from RC, so every one of those runs went to his own capture URL. **End-to-end
delivery into our store is therefore untested.** A run that proves it must
originate from our fire path, with `order_id`s our platform created. This file
answers what such a run needs, and names what would stop it.

It is also the forward context for
`docs/reports/2026-09-18-executor-andre-regression-verification-blocked.md`,
whose Finding 4 is corrected in the same pull request for exactly this reason.

---

## THE SHORT ANSWER, FOR SOMEONE WHO WILL NOT READ THE CITATIONS

| | verdict |
|---|---|
| Can Ivan fire from the production UI with no code? | **Yes.** Sign in, open `Încarcă comandă`, pick a PDF under 10 MB. Picking the file fires it; there is no separate send button. |
| Does the counterparty have the right callback header? | **Almost certainly not, and this is the headline.** The route accepts `x-rc-callback-secret`. The only header name the contract ever wrote down is `X-RC-Secret`, which is the header WE send outbound. A callback sent with `X-RC-Secret` is answered 401 and nothing is stored. |
| Do seven documents need seven orders? | **No. Seven `order_id`s, zero orders.** The order is born at confirmation. A fired document that is never confirmed creates no order. |
| Can the test rows be cancelled afterwards? | **No. There is no cancelled state for an order in this system at all.** The convention's word does not exist in the schema. |
| Is there anything marking a row as a fixture? | **No. Nothing exists.** The card that would build it, `EXT-35`, is `todo`. |
| Is there a staging environment to run this in instead? | **No, on repo evidence.** One Supabase project ref exists in this repository and it is production. |

**THE ONE THING THAT MAKES THIS SAFE ANYWAY, AND IT IS THE REAL FINDING.** A fire
writes an `extraction_drafts` row and nothing else. No `inbound_orders` row, no
product, no client, no project is created until somebody presses confirm on the
review screen. **So a test run that is never confirmed leaves exactly seven draft
rows and seven storage objects, and touches no business table.** The cost is that
those seven drafts sit on the operator's review screen permanently, because
nothing can dismiss a draft either.

---

## Q1. WHAT TRIGGERS A FIRE

### The three call sites, and only three

`fireExtraction` is defined at `lib/data/extraction-fire.ts:170`. Three callers
exist, and the function's own header names the same three at
`lib/data/extraction-fire.ts:12-14`.

| # | server action | fires at | the screen |
|---|---|---|---|
| 1 | `startExtraction`, `lib/data/extraction-actions.ts:81` | `lib/data/extraction-actions.ts:107` | `/incarca-comanda`, the automatic-reading card |
| 2 | `refireExtraction`, `lib/data/extraction-actions.ts:143` | `lib/data/extraction-actions.ts:194` | the same screen, the `Retrimite` button |
| 3 | `uploadOrderDocument`, `lib/data/inbound-actions.ts:166` | `lib/data/inbound-actions.ts:208` | attaching a document to an order that already exists |

Both action modules are server actions: `"use server"` at
`lib/data/extraction-actions.ts:1` and `lib/data/inbound-actions.ts:1`.

### The UI action, exactly

**Choosing the file IS the fire. There is no separate send button.** The picker's
`onChange` is `onFile` (`components/orders/ExtractionReviewPanel.tsx:708`), and
`onFile` calls the server action directly at
`components/orders/ExtractionReviewPanel.tsx:678`. The button the operator
presses is the file picker's, labelled **`Alege fișierul`**
(`components/ui/FilePicker.tsx:31`), under the heading
**`Citire automată din document`**
(`components/orders/ExtractionReviewPanel.tsx:700`) and the instruction
*"Încarcă documentul furnizorului. Se citește automat, apoi verifici datele
extrase și confirmi. PDF, PNG sau JPG, până în 10 MB."*
(`components/orders/ExtractionReviewPanel.tsx:702-703`). The page is
`app/(app)/incarca-comanda/page.tsx:34`.

The refire button is rendered only for a draft whose status is `failed` or
`partial` (`components/orders/ExtractionReviewPanel.tsx:858`), with its click
handler at `components/orders/ExtractionReviewPanel.tsx:864` and its label
`Retrimite` at `components/orders/ExtractionReviewPanel.tsx:866`.

### Preconditions, in the order they are checked

**At the caller, before `fireExtraction` is entered:**

| precondition | file:line |
|---|---|
| a session with an ACTIVE profile row | `lib/data/extraction-actions.ts:82-83`, resolved by `lib/supabase/server.ts:43-57` |
| a non-empty `File` | `lib/data/extraction-actions.ts:86` |
| MIME in `ACCEPTED_MIME`, i.e. PDF, PNG, JPEG only | `lib/data/extraction-actions.ts:87-88`, set at `lib/data/inbound-types.ts:30` |
| at most 10 MB | `lib/data/extraction-actions.ts:89`, constant at `lib/data/inbound-types.ts:31` |
| the document is uploaded to storage FIRST | `lib/data/extraction-actions.ts:95-98`, before the fire at `:107` |
| refire only: the draft exists and is not confirmed | `lib/data/extraction-actions.ts:166` and `:170` |

**No order state is checked on any path, because on the upload path no order
exists.** `order_id` is minted with `randomUUID()` at
`lib/data/extraction-actions.ts:91` and the storage path is built from it at
`:92`. The file's own header says it: *"Un document intra in lane fara sa existe
o comanda ... comanda se naste abia la confirmare"*
(`lib/data/extraction-actions.ts:75-79`).

**Inside `fireExtraction`, every refusal before the POST:**

| # | refusal | file:line |
|---|---|---|
| 1 | `MAKE_WEBHOOK_URL` missing or blank; writes a failed draft, sends nothing | `lib/data/extraction-fire.ts:192-199`, reader at `:69` |
| 2 | the draft upsert errors | `lib/data/extraction-fire.ts:221-226` |
| 3 | 100 pages or more, AND the database knows the `document_too_large` label | `lib/data/extraction-fire.ts:247-265`, limit at `lib/data/page-count.mjs:30` |
| 4 | the signed URL could not be created | `lib/data/extraction-fire.ts:267-276` |
| 5 | `NEXT_PUBLIC_SITE_URL` missing or not an http(s) origin | `lib/data/extraction-fire.ts:298-308`, reader at `:79-81` |
| 6 | the signed URL is not the shape `toDocumentUrl` expects | `lib/data/extraction-fire.ts:310-316` |
| 7 | `MAKE_WEBHOOK_SECRET` missing or empty, deliberately with no `?? ""` fallback | `lib/data/extraction-fire.ts:318-325` |

Only then the POST, at `lib/data/extraction-fire.ts:331-350`.

### The role required

**Any authenticated account with an active profile. There is no owner gate on
this screen.** The owner-only route list holds exactly one entry, `/setari`
(`lib/routes.ts:13`), enforced at `proxy.ts:214`. `getSessionUser` returns a
`role` (`lib/supabase/server.ts:62`) and **no fire call site reads it**. The
database agrees: the `extraction_drafts` insert policy is
`to authenticated with check (true)`
(`supabase/migrations/0008_extraction_drafts.sql:203-204`).

Two further gates sit in the database rather than in the action, and they matter
because the upload must succeed before the fire: the `rc-docs` insert policy, as
narrowed to an active profile by
`supabase/migrations/0055_active_profile_table_reads.sql:105-110`, and the select
policy narrowed by `supabase/migrations/0050_rc_docs_select_active_profile.sql:62-67`.
**Whether those two are live in production is the APPLY-LOG question in Q9 below.**

### The direct answer to Q1c

**Yes, Ivan can fire from the production UI with no code change**, on the trace
above: `/incarca-comanda` (`app/(app)/incarca-comanda/page.tsx:34`), pick a PDF
under 10 MB, `startExtraction` runs
(`components/orders/ExtractionReviewPanel.tsx:678`), it uploads and fires
(`lib/data/extraction-actions.ts:95-107`), and the only identity gate in the
application layer is the session
(`lib/data/extraction-actions.ts:82-83`).

**Two conditions this session could not measure**, both environmental:

- whether Ivan's production account carries an active `profiles` row. A database
  read, forbidden by this dispatch. **UNMEASURED.**
- whether `MAKE_WEBHOOK_URL`, `NEXT_PUBLIC_SITE_URL` and `MAKE_WEBHOOK_SECRET`
  are set in the production environment. If any is absent the fire stops at
  `lib/data/extraction-fire.ts:193`, `:299` or `:323` and the draft shows as
  failed instead of sending. Env values may not be read. **UNMEASURED.**

### Q1d, non-UI triggers

**None.** A repository-wide grep for `fireExtraction` in this session returns the
definition, the three call sites listed above, and comment references only. No
script under `scripts/`, no cron, no API route calls it. The two machine routes
that exist on this path are the callback
(`app/api/extraction/callback/route.ts:128` and `:839`) and the document server
(`app/api/documents/[...path]/route.ts`), and neither fires.

---

## Q2. THE INTAKE PAYLOAD SENT TO MAKE

### a) The body: exactly seven fields, all scalar

The POST is the only `fetch` in the file, at `lib/data/extraction-fire.ts:331`;
the body is `lib/data/extraction-fire.ts:337-348`.

| # | field name | file:line |
|---|---|---|
| 1 | `order_id` | `lib/data/extraction-fire.ts:338` |
| 2 | `document_url` | `lib/data/extraction-fire.ts:339` |
| 3 | `document_filename` | `lib/data/extraction-fire.ts:340` |
| 4 | `mime_type` | `lib/data/extraction-fire.ts:341` |
| 5 | `page_count` | `lib/data/extraction-fire.ts:345` |
| 6 | `size_bytes` | `lib/data/extraction-fire.ts:346` |
| 7 | `callback_url` | `lib/data/extraction-fire.ts:347` |

**No nested objects and no arrays.** `page_count` is `number | null`
(`lib/data/extraction-fire.ts:98`) and is always present, never absent and never
zero, stated at `lib/data/extraction-fire.ts:342-344`. The comment above the body
says `EXACT sapte campuri` (`lib/data/extraction-fire.ts:330`), and the committed
test list agrees: `FIRE_FIELDS` at `tests/e2e/support/make.ts:19-27` holds the
same seven, with its own note that `page_count` was added by EXT-28 and there
were six before (`tests/e2e/support/make.ts:17-18`).

**Code and contract agree on the field names.** One stale comment does not:
`lib/data/extraction-budget.mjs:51-52` still says *"Corpul trimis catre Make
poarta exact sase campuri"* and lists six, omitting `page_count`. That is a comment in a module the fire path does not
consult for the body, so it misleads a reader and changes nothing at runtime.

Two headers accompany the body and are not body fields:
`Content-Type: application/json` (`lib/data/extraction-fire.ts:334`) and
`X-RC-Secret` (`lib/data/extraction-fire.ts:335`), whose value comes from
`MAKE_WEBHOOK_SECRET` (`lib/data/extraction-fire.ts:322`).

### b) How `callback_url` is built

`callbackUrl(origin)` at `lib/data/extraction-fire.ts:83-87`, and it has two
branches:

1. **If `RC_CALLBACK_URL` is set and non-blank, its value is sent verbatim**
   (`lib/data/extraction-fire.ts:84-85`). Nothing validates it.
2. otherwise `${origin}/api/extraction/callback`
   (`lib/data/extraction-fire.ts:86`), where `origin` comes from
   `siteOrigin()` (`lib/data/extraction-fire.ts:79-81`) reading
   `NEXT_PUBLIC_SITE_URL` through `resolveSiteOrigin`
   (`lib/data/site-origin.mjs`), which returns null for a missing, relative,
   non-http, path-bearing, query-bearing or credential-bearing value
   (`lib/data/site-origin.mjs:33-46`). A null origin refuses the fire at
   `lib/data/extraction-fire.ts:298-308`.

**`RC_CALLBACK_URL` is the lever that decides where a result lands, and nothing
guards it.** It is absent from both lists in `lib/env-required.ts` (the required
list and `EXPECTED_IN_PRODUCTION` at `lib/env-required.ts:37-52`), so no startup
check warns if it is set, and no check warns if it points somewhere that is not
us. Playwright sets it per project (`playwright.config.ts:204`, `:239`, `:264`).
**Whether it is set in the production environment is UNMEASURED** and it is the
first thing to confirm before a run, because a value there would send our own
result to the same kind of destination Andre's seven went to.

### c) How the document is exposed

**A signed URL, rewritten to our own host.** Three steps, each measured:

1. `supabase.storage.from(DOCS_BUCKET).createSignedUrl(input.documentPath, SIGNED_URL_TTL_SECONDS)`
   at `lib/data/extraction-fire.ts:267-269`. The bucket is `rc-docs`
   (`lib/data/inbound-types.ts:27`).
2. **TTL 900 seconds, 15 minutes**: `SIGNED_URL_TTL_SECONDS = 15 * 60` at
   `lib/data/extraction-fire.ts:41`.
3. The Supabase link is rewritten by `toDocumentUrl`
   (`lib/data/document-url.ts:54-69`):
   `/storage/v1/object/sign/<bucket>/<path>?token=<jwt>` becomes
   `<origin>/api/documents/<bucket>/<path>?token=<jwt>`, same bucket, same path,
   same token, same TTL, because the TTL is the token's own `exp` claim and
   nothing here touches it (`lib/data/document-url.ts:46-49`).

**Storage path PATTERN**, template not a real path: the extraction path is
`extractions/<order_id>/<safe file name>`
(`lib/data/extraction-actions.ts:92`); the order-attachment path is a different
prefix built in `lib/data/inbound-actions.ts:186-191`.

**A second, different exposure exists for samples and it is not this one.**
`scripts/ext/serve-sample-documents.mjs` serves documents under the Andre sample
prefix; its header records that the bucket, the path and the 15 minute TTL are
unchanged from `lib/data/extraction-fire.ts`
(`scripts/ext/serve-sample-documents.mjs:44`). It is an owner-run script under
R-206's closed grant, not part of the application's fire path.

### d) The clocks

| constant | value | file:line |
|---|---|---|
| `ACK_TIMEOUT_MS`, aliased `TIMEOUT_MS` on the POST | 15000 ms | `lib/data/extraction-budget.mjs:95`, aliased at `lib/data/extraction-fire.ts:53`, used at `:327` |
| `EXTRACTION_BUDGET_ABOVE_MS` | 120000 ms | `lib/data/extraction-budget.mjs:68` |
| `EXTRACTION_BUDGET_BELOW_MS` | 60000 ms | `lib/data/extraction-budget.mjs:71` |
| `EXTRACTION_LINE_THRESHOLD` | 20 lines | `lib/data/extraction-budget.mjs:65` |

**Only the first is ours to enforce.** The module says so in terms: the
extraction budget is Make's, *"Codul nostru nu are unde sa il impuna; il
declara"* (`lib/data/extraction-budget.mjs:38-40`). The three budget constants
are imported by no file under `app/` or `lib/`; their only importer is
`scripts/poc-free/prove-extraction-budget.mjs`.

---

## Q3. ENVIRONMENT VARIABLE NAMES ONLY

**No value is read or printed anywhere in this section. No `.env` file was
opened.**

| purpose | env var NAME | file:line |
|---|---|---|
| the Make webhook URL we POST to | `MAKE_WEBHOOK_URL` | `lib/data/extraction-fire.ts:69` |
| the callback base URL | `NEXT_PUBLIC_SITE_URL` | `lib/data/extraction-fire.ts:80` |
| an explicit callback URL override | `RC_CALLBACK_URL` | `lib/data/extraction-fire.ts:84` |
| the OUTBOUND shared secret, header `X-RC-Secret` | `MAKE_WEBHOOK_SECRET` | `lib/data/extraction-fire.ts:322` |
| the INBOUND shared secret, header `x-rc-callback-secret` | `MAKE_CALLBACK_SECRET` | `app/api/extraction/callback/route.ts:130` and `:840` |
| the callback's database client | `SUPABASE_SERVICE_ROLE_KEY` | named in `lib/env-required.ts:40` |

**THERE ARE TWO SECRETS, NOT ONE, AND THEY RUN IN OPPOSITE DIRECTIONS.** The
manifest states the pairing in its own comments: *"Antetul X-RC-Secret cu care
scenariul Make autentifica cererea NOASTRA. Perechea lui MAKE_CALLBACK_SECRET, si
in directia cealalta."* (`lib/env-required.ts:43-45`) and *"Antetul cu care se
verifica un callback venit de la Make."* (`lib/env-required.ts:46-47`). Q4 below
is where this becomes the headline.

### Q3e. Do any of these names appear beside a literal value in the repository?

**Two do, both in the same test-only file, and both literals name themselves as
fake.** `tests/e2e/support/make.ts:14` assigns a literal to
`MAKE_WEBHOOK_SECRET` and `tests/e2e/support/make.ts:15` assigns one to
`MAKE_CALLBACK_SECRET`. **Shape: self-labelled test dummy.** Each literal's own
text says it is not a credential, and the constant block is headed
*"Secrete false. Deschid exact nimic"* (`tests/e2e/support/make.ts:13`). **The
values are deliberately not reproduced here**, only their locations.

`MAKE_WEBHOOK_URL` is assigned a literal at `tests/e2e/support/make.ts:11`, built
from a loopback address and a mock port (`:9-10`): **shape: local mock target,
not a credential.** `playwright.config.ts:232` assigns it the empty string on
purpose, and the comment beside it says that empty string IS the case under test
(`playwright.config.ts:230-232`).

**No production value appears anywhere.** `.env*` is gitignored
(`.gitignore:8`), and no `.env` file is tracked. `.github/workflows/quality.yml`
carries none of these names beside a value: the check that enforces this is
`scripts/poc-free/check-no-prod-target.mjs:65`, which greps the workflow for
`secrets.*SUPABASE|DATABASE` shapes and fails on a hit, and it runs on every pull
request at `.github/workflows/quality.yml:377`.

### Q3f. `scripts/poc/secret-names.sh`

It is the harness's own list of names it must never carry into a child process,
and the proof that it does not is a CI step:
`.github/workflows/quality.yml:634`, *"Refuse a model child that carries a
credential"*, running `scripts/poc-free/check-executor-env.mjs`, whose header
states the purpose at `scripts/poc-free/check-executor-env.mjs:3`.

---

## Q4. CALLBACK AUTH. THE HEADLINE OF THIS WHOLE FILE

### a) and b) The header and the variable

| | value | file:line |
|---|---|---|
| header name the route reads | `x-rc-callback-secret` | `app/api/extraction/callback/route.ts:131` |
| env var compared against | `MAKE_CALLBACK_SECRET` | `app/api/extraction/callback/route.ts:130` |

It is the first work the handler does, under the banner
*"401 inainte de orice altceva"* at
`app/api/extraction/callback/route.ts:129`, immediately after the export at
`:128`.

### c) The comparison

- Plain `!==`, **not constant time**: `app/api/extraction/callback/route.ts:136`.
- The guards above it: `typeof expected !== "string"` (`:133`),
  `expected.trim().length === 0` (`:134`), `provided === null` (`:135`).
- **The emptiness guard TRIMS but the comparison does not.** `:134` trims,
  `:136` compares the untrimmed `expected`. A stored value carrying surrounding
  whitespace could therefore never match a header sent without it. Whether any
  production value carries such whitespace is **UNMEASURED**: env values may not
  be read.
- A mismatch is 401: `app/api/extraction/callback/route.ts:138`, with
  `badSecret: 401` at `lib/data/extraction-types.ts:187`. The contract's table
  agrees at `docs/contracts/extraction-v2.md:1216`.
- The repository pins both failure shapes with a test covering a wrong value and
  an absent header: `tests/e2e/extraction.spec.ts:415`, asserting 401 at `:421`
  and `:424` and no write at `:428`. **Whether that test passes today is
  UNMEASURED**; no suite was run in this read-only session.

### d) THE DIRECT QUESTION: does it match `X-RC-Secret` exactly?

**NO.** The literal in the callback route is `"x-rc-callback-secret"`
(`app/api/extraction/callback/route.ts:131`). It differs from `X-RC-Secret` in
both letters and case: it carries the extra word `callback`, and it is entirely
lowercase.

**`X-RC-Secret` does exist in this repository, on the OTHER leg.** It is the
header our fire sends TO Make: `lib/data/extraction-fire.ts:335`, carrying
`MAKE_WEBHOOK_SECRET` (`lib/data/extraction-fire.ts:322`).

**AND THE FROZEN CONTRACT NEVER WRITES THE INBOUND HEADER NAME DOWN AT ALL.**
This is the part no earlier report stated and it is the most load-bearing fact
in this file.

- The contract's callback clause names a VARIABLE, not a header:
  `docs/contracts/extraction-v2.md:26-27`, *"Make POSTs the result to our
  callback endpoint with `MAKE_CALLBACK_SECRET`"*.
- The only literal header LINE in the contract is the fire leg's:
  `docs/contracts/extraction-v2.md:96`, `Header: X-RC-Secret: <...>`.
- A repository-wide grep for `x-rc-callback` across `*.md` and `*.json` returns
  **zero** hits. The string exists only in
  `app/api/extraction/callback/route.ts` and in the e2e specs.

**So the only header name Andre has ever been handed in writing is
`X-RC-Secret`, and the one our route accepts appears in no document he was
given.** A callback sent with `X-RC-Secret` is answered 401, nothing is stored,
and Make does not retry a 4xx
(`app/api/extraction/callback/route.ts:12-14`). At his end that is
indistinguishable from any other 401. **This is the single most likely
explanation for a callback that never lands, and confirming which header name his
scenario sends is the cheapest thing to do before any run.**

**Case-folding of the inbound header NAME: UNMEASURED.** Whether `Headers.get`
folds `X-RC-Callback-Secret` to the lowercase literal is a runtime property of
the Fetch implementation, stated nowhere in this repository, and nothing was
executed. There is no in-repo evidence in either direction. **The Make mock is
not evidence**: it reads a lowercased key off a `node:http` server
(`tests/e2e/support/make-mock.mjs:62`, server at `:15` and `:40`), a different
implementation from the Fetch `Headers` object at `route.ts:131`. Every inbound
spec sends the exact lowercase spelling, enumerated at 20 occurrences over 11
spec files, so **no repository test covers a differently-cased inbound name**.
What is certainly not folded is the header VALUE, compared byte-exact at
`app/api/extraction/callback/route.ts:136`.

### e) Every other auth path on that route

- The file exports exactly three symbols: `dynamic` (`:57`), `POST` (`:128`),
  `GET` (`:839`). No PUT, PATCH, DELETE or OPTIONS handler exists.
- **The GET handler uses the SAME auth, not a weaker one**:
  `app/api/extraction/callback/route.ts:840-841`, identical guard at `:842-847`,
  same 401 at `:848`. Its docstring says why: *"NU ESTE PUBLICA ... Un uuid
  ghicit nu are voie sa fie de ajuns."* (`:831-833`).
- **No bearer token and no query-param secret.** The only `searchParams` read in
  the file is `order_id` at `:851`.
- The proxy exempts this route from the login redirect (`proxy.ts:52`, consumed
  at `proxy.ts:135`), and that exemption is load-bearing rather than decorative
  because the matcher does cover `/api` (`proxy.ts:233-238`). The reason is
  written beside it: *"Ruta refuza singura orice cerere fara antetul corect, si o
  face pe primul rand."* (`proxy.ts:50-51`).

### f) A bad or unknown `order_id`, RE-MEASURED at this sha

**The prior report's `route.ts:538` and `:541` are stale**: that file was 800
lines at `feb4655` and is 880 at `9784cdc`. Do not reuse them.

**The gates are ordered, never simultaneous.** A wrong secret returns 401 at
`:138`, before the body is even parsed at `:142-147`, so everything below is
reachable only after the secret matched.

Two distinct 400s exist on the POST path:

1. **Malformed or missing** `order_id`: `app/api/extraction/callback/route.ts:158`
   is the test, `:159` returns `order_id lipseste sau nu este uuid`.
2. **Well-formed uuid with no draft row**: the lookup is
   `app/api/extraction/callback/route.ts:568-572`, the branch is `:577`, and
   `:580` returns `order_id necunoscut`.

`rejected` is 400 (`lib/data/extraction-types.ts:186`), and Make does not retry
4xx (`app/api/extraction/callback/route.ts:12-14`), so such a callback is dropped
once.

**What "unknown" actually means, and why it decides the whole dispatch.** The
lookup at `:569` is against `extraction_drafts`, not against orders. The fire
pre-creates that row BEFORE it posts to Make
(`lib/data/extraction-fire.ts:221-223`, with the outbound `fetch` later at
`:331`). So `order_id necunoscut` means precisely *"our app never fired this
document"*. **A callback whose `order_id` our platform never created cannot be
stored under any circumstances**, which is why the run must originate from our
fire path, exactly as the dispatch says.

---

## Q5. DRAFT CARDINALITY

### a) `order_id` is the primary key

`supabase/migrations/0008_extraction_drafts.sql:79`,
`order_id uuid primary key,` inside the table at `:76`. The migration states the
intent above it at `:77-78`: *"The idempotency key. Primary key, so a repeat
callback for the same order_id upserts by definition and cannot append a second
draft."*

**It carries no foreign key to `inbound_orders`, deliberately**
(`supabase/migrations/0008_extraction_drafts.sql:26` and the table comment at
`:128`).

**No later migration changes the key**, measured by enumeration rather than
sampling: every `alter table` naming either draft table is a column add, a check
constraint change or a comment, and the only two `primary key` declarations
touching drafts are `:79` (drafts) and `:139` (the lines table's own `id`).

The lines table hangs off it: `order_id uuid not null references
public.extraction_drafts (order_id) on delete cascade`
(`supabase/migrations/0008_extraction_drafts.sql:140`), unique per line number
(`:170`).

### b) Do seven documents need seven orders?

**Seven distinct `order_id`s: yes, necessarily, because it is the primary key.
Seven ORDERS: no, and this is the distinction that matters.**

An `order_id` on the upload path is a fresh uuid minted in the action
(`lib/data/extraction-actions.ts:91`), not the id of any order row. The order is
created only when a draft is confirmed, and `confirmed_at` is the fact that
records it (`supabase/migrations/0011_extraction_confirm_corrections.sql:100`,
*"THIS is the fact that a draft has been confirmed, and nothing but a confirm
ever writes it"*). **Seven fired documents that are never confirmed produce seven
draft rows and zero orders.**

### c) A second document fired on an order that already has a draft

**Neither refused nor duplicated: the existing draft row is overwritten in
place.**

- `fireExtraction` performs no pre-existing-draft check. Its write is
  `.upsert(draft, { onConflict: "order_id" })`
  (`lib/data/extraction-fire.ts:221-223`), which on the primary key replaces the
  row's listed columns.
- The upsert payload is the six fields at `lib/data/extraction-fire.ts:209-216`
  plus `upload_page_count` when the column exists (`:217-219`). **It does not
  carry `status`, `error_code` or `reason`**, so a second fire over a draft that
  already answered leaves the previous verdict standing on the row until a
  callback overwrites it.
- On the callback side a second delivery REPLACES rather than appends: the lines
  are deleted as a batch and rewritten
  (`app/api/extraction/callback/route.ts:766-769`, with the reason at
  `:763-765`, *"acesta este singurul delete din tot fluxul si el sterge liniile
  unei CIORNE, niciodata date reale"*), and the status code becomes 200 instead
  of 202 because `isRepeat` is true (`:615` and `:824`).
- **The refire button is the supported way to do this**, and it reuses the same
  `order_id` on purpose (`lib/data/extraction-actions.ts:136-141`), refusing only
  a draft that no longer exists (`:166`) or one already confirmed (`:170`).

**Firing a NEW document on an order that already has a draft is a different
thing and the upload path cannot do it**, because that path always mints a new
`order_id` (`lib/data/extraction-actions.ts:91`). Only the order-attachment path
reaches an existing order, and re-uploading there passes `upsert: true`
(`lib/data/inbound-actions.ts:188`), so the same filename on the same order
silently replaces the stored bytes the first fire pointed at.

### d) What migration 0053 adds, with lines

Five columns, each `text`, nullable, no default, no check constraint, the three
choices all stated at
`supabase/migrations/0053_extraction_inbound_fields.sql:15-29`:

| column | table | file:line |
|---|---|---|
| `document_type` | `extraction_drafts` | `supabase/migrations/0053_extraction_inbound_fields.sql:40-41` |
| `client_ref` | `extraction_drafts` | `supabase/migrations/0053_extraction_inbound_fields.sql:43-44` |
| `supplier_code` | `extraction_draft_lines` | `supabase/migrations/0053_extraction_inbound_fields.sql:46-47` |
| `description` | `extraction_draft_lines` | `supabase/migrations/0053_extraction_inbound_fields.sql:49-50` |
| `line_total_source` | `extraction_draft_lines` | `supabase/migrations/0053_extraction_inbound_fields.sql:52-53` |

**The route writes all five behind one capability probe**: the probe at
`lib/data/schema-capability.ts:550-570`, the gate at
`app/api/extraction/callback/route.ts:748-749`, the two document columns at
`:750-751`, the three line columns at `:802-808`, and the per-line value read
from the payload through `str()` at `:561`. The review screen selects them behind
the same probe (`lib/data/extraction.ts:102-104` and `:113-116`).

**`line_total_source` is additionally read by our own reconciliation** since
P3-80: a `derived` line moves an `extracted` document to `partial`
(`app/api/extraction/callback/route.ts:531-565`, rule in
`lib/data/reconciliation.ts`), and that move is itself gated on migration 0054's
column existing (`app/api/extraction/callback/route.ts:553-556`).

---

## Q6. REAL-DATA DETECTION AND FIXTURE MARKING

**This section reports what exists. It designs nothing, per the dispatch.**

### a) What decides that an environment holds real client data

**Nothing does.** What exists is a guard that decides whether an environment IS
the production Supabase PROJECT, by project ref parsed out of a URL. That is an
identity test against a hand-maintained list, not a data test.

| # | candidate | what it actually tests | file:line |
|---|---|---|---|
| 1 | `PRODUCTION_REFS` | a hardcoded list of Supabase project refs, exactly one entry. "Holds real client data" is asserted in a COMMENT by a human | `scripts/production-refs.mjs:16-19`, header at `:1` |
| 2 | `assert-not-prod.mjs` | the URL VALUE of two env var names, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`; exits 2 on a hit | `scripts/assert-not-prod.mjs:28`, `:42`, `:65-67`, `:74` |
| 3 | its degenerate paths | an empty blocklist exits 3, a wholly empty environment exits 4 | `scripts/assert-not-prod.mjs:44-48`, `:55-62` |
| 4 | `check:no-prod-target` | greps WORKFLOW YAML TEXT for a production ref and for secret-shaped names; asserts the guard is still wired | `scripts/poc-free/check-no-prod-target.mjs:41-57`, `:65`, `:84`, `:89`; run at `.github/workflows/quality.yml:377` |
| 5 | the runtime half | hands the guard the production ref and asserts exit 2 | `.github/workflows/quality.yml:874-888` |
| 6 | `check:live-fixtures` | NOT data detection: it refuses a TEST FIXTURE copied from a live board or decisions artefact | `scripts/poc-free/check-live-fixtures.mjs:36-38`, `:84`; run at `.github/workflows/quality.yml:728-729` |
| 7 | `reset-test-data.sql` | not a detector: a naming-convention heuristic, `TEST-` SKU prefixes and a `TEST-%` document filename, run once by hand and it DELETES | `scripts/reset-test-data.sql:188-195`, `:205-211`, `:233`, header at `:4` |

**Not one of them reads a row and judges it.** The only statement that the
question is already settled lives in a ruling, not in code: R-200's record that
real client data IS in production (`decisions/inbox.md:13774-13775`). **As code,
UNMEASURED, because there is no code.**

### b) Is there any field that marks a row as a fixture?

**No such field exists. Say it plainly: there is no fixture-marking field on an
order, a document, a draft, a client or a project, and no filter anywhere
excludes such rows.**

The nearest things, and why each is not it:

- **A naming convention, not a field.** `scripts/seed-test-accounts.mjs:10-13`:
  the marking is the `TEST-` prefix in a product's SKU and name, plus the
  `.local` domain on accounts. It binds PRODUCTS and ACCOUNTS. Nothing on an
  order, a document or a draft.
- **`products.active` is a business flag, not a fixture flag**
  (`lib/data/products.ts:53`), and it does not exist on orders or drafts.
- **`extraction_drafts` has no such column.** Its columns are the table at
  `supabase/migrations/0008_extraction_drafts.sql:76-127` plus the additive
  columns of the later migrations; none is a fixture or test marker.

### c) EXT-35, and it is decisive here

**`EXT-35` is `status: todo`, `blocked_on: null`, `depends_on: []`, owner
terminal `executor`, on `docs/board/rc-board-phase3.json`.** It is the card that
would build exactly this mechanism, titled *"A dedicated fixture draft receives
the counterparty's test callbacks ... marked as fixture data in the row, on
screen and in the repository, and registered as ours so no real-data detector
counts it."*

**Its own notes settle part (a) with a committed sentence:** *"NO REAL-DATA
DETECTOR EXISTS ON main TODAY. Card P2-21 is the one authored, and it classifies
by exclusion: a row not in its committed definition of ours is real."*

`P2-21` is `status: todo` on `docs/board/rc-board-phase2.json`. **So both the
detector and the fixture marker are authored and neither is built.** A planned
card is not a field.

EXT-35's notes also leave one thing open for the owner and it bears on a test
run: *"A person who confirms the fixture draft on the review screen would create
a real inbound order from it. Whether confirming it is refused is a product
decision this card does not take."*

### d) What the production guard actually guards

**It guards the TEST SUITE, not the application.** `assert-not-prod.mjs` runs as
Playwright's `globalSetup`, and `check-no-prod-target.mjs:84` and `:89` exist to
prove that wiring is still in place and that `global-setup.ts` throws on a
non-zero exit. It stops the e2e suite pointing at production. **It does not and
cannot stop a person firing a document from the production UI.**

---

## Q7. CANCELLATION

**Headline: there is no cancelled status for an order in this system.** The
premise *"test data is cancelled, never deleted"* is a written convention in docs
and comments. It is not a mechanism in the schema or in the application.

### a) The status values that exist

| enum | values | file:line |
|---|---|---|
| `inbound_status` | `pending_arrival`, `arrived` | `supabase/migrations/0001_phase2_schema.sql:58` |
| `outbound_status` | `awaiting_shipment`, `shipped` | `supabase/migrations/0001_phase2_schema.sql:59` |

The design note above them says it: *"Whole-order statuses only. Partial arrivals
and partial shipments are out of scope for phase 2"*
(`supabase/migrations/0001_phase2_schema.sql:56-57`). The columns are at `:187`
and `:243`, and a CHECK ties `arrived` to `arrived_at`
(`supabase/migrations/0001_phase2_schema.sql:199-202`).

**No migration ever adds a value to either enum.** Every `alter type ... add
value` in the tree touches `status_entity`, `unit_code` or
`extraction_error_code`, never an order status. **A repository-wide grep for
`cancel` over `supabase/migrations/*.sql` returns zero files.**

**Where the word comes from.** `scripts/reset-test-data.sql:22-23` says *"The
P2-07 and P2-13 convention is that test data is marked cancelled, never
deleted"*, and the convention it points at
(`scripts/seed-test-accounts.mjs:10-18`) actually says *marked at creation*, by
naming prefix, with cleanup that *"MARCHEAZA, nu sterge"*. **So "cancelled" is
loose prose for "marked", and the marking is a naming convention on products and
accounts.** This is a doctrine-versus-code gap of exactly the shape `CLAUDE.md`
section 9c exists for, and it is recorded here rather than corrected, because
correcting `CLAUDE.md` or that script is outside this dispatch's two files.

### b) Role and preconditions to cancel

**Not applicable: there is no cancel action, so there is no role for it.** No
server action and no API route writes an order's status to a cancelled value,
because no such value exists to write.

### c) Does a cancelled order's draft stay readable?

**The question does not arise as asked, and the answer to the question behind it
is the one that matters: a draft's readability does not depend on any order
status at all.**

- The review screen's query filters on ONE thing, `confirmed_at is null`
  (`lib/data/extraction.ts:273`), with the reason written beside it at
  `lib/data/extraction.ts:269-272`: the foreign key to the order carries
  `on delete set null` and could become null again, so `confirmed_at` is the
  column that decides.
- **There is no order-status term in that query anywhere**
  (`lib/data/extraction.ts:263-279`).
- The machine read path, the route's `GET`, filters on `order_id` alone
  (`app/api/extraction/callback/route.ts:864-868`) and returns 404 only when the
  row is absent (`:871`).

**So an unconfirmed test draft stays readable, and stays ON THE OPERATOR'S REVIEW
SCREEN, indefinitely.** Nothing dismisses it: the extraction module exports
exactly three actions, `startExtraction`
(`lib/data/extraction-actions.ts:81`), `refireExtraction` (`:143`) and
`confirmExtractionDraft` (`:237`). **There is no discard, no dismiss and no
cancel.** This is the real residue of a production test run: seven permanent rows
on a screen the daily operator uses.

### d) Does anything hard-delete an order or a draft?

**No application code does.** Three `.delete()` call sites exist in the
application:

| call site | what it deletes |
|---|---|
| `app/api/extraction/callback/route.ts:766-769` | a draft's LINES, as a batch, before rewriting them; the comment at `:763-765` says it is the only delete in the whole flow |
| `lib/data/deviz-actions.ts:299` | one estimate line |
| `lib/data/document-actions.ts:362` | one document row |

**SQL that deletes an inbound ORDER exists in exactly one place and it is
owner-run, not application code**: `scripts/reset-test-data.sql:464`. Its header
states it is not a migration, is not auto-applied by any terminal, and is run by
Ivan by hand (`scripts/reset-test-data.sql:3-14`), and `CLAUDE.md:914-917` names
it as the single script in this repository exempted from the no-destructive-run
rule.

**At the RLS layer an owner MAY delete an order, a draft and draft lines.** The
one table nothing may ever delete from is `status_history`, which carries no
update and no delete policy for any role, deliberately.

---

## Q8. IS THERE A NON-PRODUCTION PLACE TO RUN THIS INSTEAD?

**Answer: NO, on repository evidence. And two facts the repository does record
make a preview deployment worse than merely unproven.**

### a) What deployment config exists in the repository

- **`vercel.json` does not exist.** `ls vercel.json` returned
  `No such file or directory` this session, and no tracked file carries "vercel"
  in its path. An absence has no line to quote; it is a shell measurement.
- **Exactly one workflow file exists**, `.github/workflows/quality.yml`. It
  triggers on `pull_request` and on `push` to `main`
  (`.github/workflows/quality.yml:3-6`) and defines one job, `quality`
  (`:16-17`). **There is no deploy job and no second workflow.**
- `next.config.ts` carries no `env` key and no per-environment branch; its only
  environment read is the build directory (`next.config.ts:30`).
- **`supabase/config.toml` describes the LOCAL stack only**, stated in its own
  header at `supabase/config.toml:3-4`: *"Configuratia stivei Supabase LOCALE,
  folosita numai de CI si de dezvoltarea pe masina proprie. Nu descrie si nu
  atinge proiectul din eu-west-1."* Its `project_id` is a local name, not a cloud
  ref (`supabase/config.toml:19`).

### b) The specific things checked, and the absences

- **No Ignored Build Step, no branch-deploy config, no `git.deploymentEnabled`.**
  None can exist: there is no `vercel.json`.
- **No committed preview env override.** `.env*` is gitignored
  (`.gitignore:8`) and no `.env` file is tracked.
- **ONE Supabase project ref exists in this repository and it is production.**
  `scripts/production-refs.mjs:16-19` holds exactly one entry, annotated at
  `:17-18` as Rapid Construct, eu-west-1, the project serving the live site. A
  repository-wide grep for a `<ref>.supabase.co` shape hits that same single ref
  and nothing else. **There is no second project ref anywhere.**

### c) Two recorded facts that make the preview option worse than unproven

1. **The Supabase GitHub integration on this repository points at the PRODUCTION
   project.** That is the whole basis of R-124 and of `CLAUDE.md` section 3.1's
   *"MERGING THE FILE IS APPLYING IT"* (`CLAUDE.md:219-220` and the evidence
   block following it). A preview branch is therefore not insulated from the
   production schema by anything in this repository.
2. **Vercel Deployment Protection is enabled**, recorded by ruling R-004
   (`decisions/inbox.md:262-269`), so no `vercel.app` host answers an anonymous
   request. Make's download of `document_url` is an anonymous request. A preview
   deployment would hand Make an authentication page instead of the document.

### d) The local stack, which is the honest alternative

**The fire path IS already exercised end to end locally, with a real `fetch`,
against a mock Make.** The mock's header states the design and why:
*"APLICATIA FACE FETCH-UL REAL. MAKE_WEBHOOK_URL arata catre 127.0.0.1, deci
cererea, antetele si tratarea unui raspuns non-2xx sunt exercitate exact ca in
productie"*, and *"Serverul NU trimite singur callback-ul. Testul il trimite"*
(`tests/e2e/support/make-mock.mjs:4-13`). CI starts a real local Supabase and
replays every migration from empty
(`.github/workflows/quality.yml:948` `Start local Supabase`, running
`supabase start` at `:959`, and `:961` `Apply migrations to the local stack`,
running `supabase db reset` at `:966`, which replays `supabase/migrations` from
empty in file order, `.github/workflows/quality.yml:931`).

**What the local stack cannot prove, and it is exactly the untested part:** that
ANDRE'S scenario, with his HTTP client and his header spelling, reaches our route
and is accepted. The mock is ours; his scenario is not.

### e) The conclusion, plainly

**There is no non-production environment with zero real data where this e2e run
could happen instead of production, on repository evidence.** The one genuinely
open question is which Supabase project a Vercel Preview deployment's environment
variables point at, and **that lives in the Vercel dashboard, not in this
repository: UNMEASURED.** Given (c)(2), even a preview pointed at a separate
project would still fail the document download for Make.

---

## Q9. EVERY OTHER PRECONDITION FOR A FIRE THAT WORKS END TO END

### a) Feature flags or kill switches

**None exist.** No `EXTRACTION_ENABLED`, no killswitch, no feature flag anywhere
in `app/` or `lib/` on this path. The complete set of `process.env` reads in
`lib/data/extraction-fire.ts` is four names: `MAKE_WEBHOOK_URL` (`:69`),
`NEXT_PUBLIC_SITE_URL` (`:80`), `RC_CALLBACK_URL` (`:84`) and
`MAKE_WEBHOOK_SECRET` (`:322`).

**The de-facto kill switch is unsetting `MAKE_WEBHOOK_URL`**: the fire refuses
before sending anything and still writes a failed draft row
(`lib/data/extraction-fire.ts:192-199`, writer at `:122-160`).

### b) Allowed suppliers or an allow-list

**None exists.** The supplier is not a field of the intake payload at all: the
body is the seven fields at `lib/data/extraction-fire.ts:337-348`. The supplier
name arrives only on the callback and is stored as free text with no lookup
(`app/api/extraction/callback/route.ts:639`). Supplier resolution happens only at
confirmation, and it CREATES a supplier when the folded name is not found rather
than refusing (`lib/data/extraction-actions.ts:340`,
`lib/data/suppliers.ts:80-84`). **Any counterparty on any document passes.**

### c) Rate limits and budgets

**No per-day cap, no per-order cap, no token or cost budget, and no concurrency
limit exists.** The only limit the application enforces is the 15 second
acknowledgement clock (`lib/data/extraction-budget.mjs:95`, used at
`lib/data/extraction-fire.ts:327`): on abort the catch returns
*"Make nu a raspuns in ${TIMEOUT_MS / 1000} secunde"*, which renders as 15
(`lib/data/extraction-fire.ts:364-366`) and the two callers that read the
result write a failed draft (`lib/data/extraction-actions.ts:119-126` and
`:206-214`). **The third caller, `uploadOrderDocument`, does not read the result
at all** (`lib/data/inbound-actions.ts:208`), so on that path the row is left as
`fireExtraction` wrote it. The extraction budget itself is Make's and arrives
back as a callback carrying `error_code: "timeout"`
(`lib/data/extraction-types.ts:22`).

### d) Idempotency and replay

**The key is `order_id`, and it makes a repeat a REPLACEMENT rather than a
no-op.** `isRepeat` is true when the row already carries a `callback_at`
(`app/api/extraction/callback/route.ts:615`); the status becomes 200 instead of
202 (`:824`, codes at `lib/data/extraction-types.ts:184-185`); the lines are
deleted as a batch and rewritten (`:766-769`). **There is no nonce and no request
id.** The route cannot tell a platform re-delivery from a genuine second
extraction.

### e) Document preconditions

| precondition | enforced at |
|---|---|
| PDF, PNG or JPEG only | `lib/data/extraction-actions.ts:87-88`, set at `lib/data/inbound-types.ts:30` |
| at most 10 MB | `lib/data/extraction-actions.ts:89`, `lib/data/inbound-types.ts:31` |
| fewer than 100 pages | `lib/data/extraction-fire.ts:247-265`, limit at `lib/data/page-count.mjs:30` |
| page count computed from the bytes at upload | `lib/data/extraction-actions.ts:103` |

- **HEIC is refused by exclusion, not by a named rule**: there is no HEIC line
  anywhere; `ACCEPTED_MIME` simply does not contain it
  (`lib/data/inbound-types.ts:30`).
- **There is NO magic-byte check on this path.** The check reads `file.type`, the
  browser-supplied value (`lib/data/extraction-actions.ts:87`). A byte-signature
  checker exists at `lib/data/documents-types.ts:92-99` and
  `extraction-actions.ts` does not import it.
- **An unknown page count never refuses**: `null` means "could not count with
  certainty", and the test requires a number (`lib/data/page-count.mjs:34`).
  PNG and JPG count as one page (`:44`); any non-PDF returns null (`:45`).
- **Upload OVERWRITES**: both callers pass `upsert: true`
  (`lib/data/extraction-actions.ts:97`, `lib/data/inbound-actions.ts:188`). On
  the extraction path the path carries a fresh `order_id` so a collision is
  unlikely; on the order-attachment path re-uploading the same filename to the
  same order silently replaces the bytes the first fire pointed at.

### f) Contract preconditions the code does not enforce

1. **Retention OFF on the counterparty's account.**
   `docs/contracts/extraction-v2.md:649` states it as a required condition before
   the first real supplier document. **No code reads or enforces it**; the
   contract assigns the flag to Andre's account. For a run with a real document
   this is an unenforceable precondition.
2. **Automatic retry refused if the platform re-runs the scenario**
   (`docs/contracts/extraction-v2.md:1152`). Our code cannot tell a re-delivery
   from a second extraction: any second payload for a known `order_id` is
   accepted and replaces the draft
   (`app/api/extraction/callback/route.ts:615`, `:766-772`).
3. **A stale module path in the contract.** It names
   `lib/data/extraction-budget.ts` twice
   (`docs/contracts/extraction-v2.md:552-553`); the file is
   `lib/data/extraction-budget.mjs`.

### g) The catch-all

- **`RC_CALLBACK_URL` silently replaces the callback URL**
  (`lib/data/extraction-fire.ts:84-86`) and is in neither list in
  `lib/env-required.ts` (`:34`, `:37-52`), so nothing warns and nothing fails if
  it points elsewhere. **This is exactly the shape of "the result went somewhere
  that is not us".** Confirm it is unset in production before any run.
- **Two secrets in opposite directions**, Q4 above. Swapping them is 401 with no
  row written.
- **`SUPABASE_SERVICE_ROLE_KEY` missing turns every delivery into a 5xx loop**:
  `app/api/extraction/callback/route.ts:298-305` returns 500, and Make retries on
  5xx.
- **Only two machine paths are exempt from the login redirect**: the callback
  (`proxy.ts:52`) and the document server (`proxy.ts:69`). If
  `NEXT_PUBLIC_SITE_URL` names a host that is not this deployment, Make receives
  HTML instead of a document.
- **The signed URL lives 15 minutes** (`lib/data/extraction-fire.ts:41`). A Make
  retry that re-downloads later gets an expired link. Our document route waits at
  most 20 seconds on storage
  (`app/api/documents/[...path]/route.ts`, `UPSTREAM_TIMEOUT_MS`).
- **Schema-capability probes cache**, so for the cache window after a migration
  lands an instance still behaves as though the column were absent
  (`lib/data/schema-capability.ts:37`, `:552`).
- **The callback route is FROZEN by ruling R-202** while the Andre link is open
  (`lib/data/extraction-types.ts:46`). An e2e run must not change what the route
  accepts, refuses or answers.
- **Applying a migration to the RC project is authorized only while it holds zero
  real client data** (`CLAUDE.md:820-823`), and **first real client data ends the
  grant** (`CLAUDE.md:935-937`). R-200 already records that condition as spent.
  **A run using a real supplier document is not a neutral act with respect to
  that grant.**

### g2. THE APPLY-LOG CONTRADICTION, NAMED RATHER THAN RESOLVED IN PASSING

`docs/migrations/APPLY-LOG.md:42-53` lists twelve migrations, `0044` through
`0055`, as **pending**, which that file defines at `:29-32` as merged but *"NOT
run against the RC Supabase project"*. Among them are `0053` (the EXT-34
columns), `0050` and `0055` (the active-profile storage policies) and `0051` (the
`config_error` label).

**That pending list rests, at `docs/migrations/APPLY-LOG.md:25-27`, on this
sentence:**

> *"merging a migration file changes one text file in a git repository and
> changes nothing in any database"*

**That is word for word the sentence `CLAUDE.md` section 3.1 quotes and marks
FALSE under ruling R-124**, with a controlled measurement recorded beside it: two
migrations both numbered `0032`, the merged one live in production within about
two minutes, the unmerged twin as the control.

**So the pending list is stale doctrine that outlived the ruling which disproved
its premise, not a second measurement.** Under R-124 those twelve are applied.

**WHAT THIS TERMINAL MEASURED AND WHAT IT DID NOT.** Measured: the files are on
`main`, and every consumer of their columns sits behind a live capability probe,
so the application is correct either way
(`lib/data/schema-capability.ts:550-570`,
`app/api/extraction/callback/route.ts:748-749`). **Not measured: the production
schema.** No database was read. **One query settles it, and correcting the
APPLY-LOG entries belongs to whoever runs that query**, in the pull request that
also adds their applied entries, because
`tests/e2e/headers.spec.ts` requires every migration file to be in exactly one of
the two places (`docs/migrations/APPLY-LOG.md:34-38`).

---

## WHAT THIS FILE COULD NOT MEASURE, COLLECTED

Every one of these is environmental or runtime, and none of them is answerable
from the repository:

1. Whether Ivan's production account carries an active `profiles` row.
2. Whether `MAKE_WEBHOOK_URL`, `NEXT_PUBLIC_SITE_URL` and `MAKE_WEBHOOK_SECRET`
   are set in the production environment.
3. **Whether `RC_CALLBACK_URL` is set in the production environment.** The
   highest-value of the three, because a value there sends our result somewhere
   that is not us.
4. Whether the production `MAKE_CALLBACK_SECRET` value carries surrounding
   whitespace, which would never match at
   `app/api/extraction/callback/route.ts:136` because `expected` is untrimmed
   there.
5. Whether `Headers.get` folds the inbound header name's case. No in-repo
   evidence in either direction.
6. Which header name Andre's scenario actually sends on the callback.
7. Whether the twelve APPLY-LOG entries are live in the production schema.
8. Which Supabase project a Vercel Preview deployment's environment variables
   point at.
9. Whether the e2e specs cited pass today. No suite was run in this session.

---

## WHAT A RUN WOULD COST, STATED SO THE DECISION IS THE OWNER'S

This file does not recommend a run and does not design a safer one. It records
what a run would leave behind, from the measurements above:

- **Seven `extraction_drafts` rows and seven `rc-docs` storage objects**, on the
  production project.
- **Seven entries on the operator's review screen, permanently**, because the
  screen lists every draft whose `confirmed_at` is null
  (`lib/data/extraction.ts:273`) and no action dismisses one.
- **Zero rows in any business table**, as long as nobody presses confirm
  (`lib/data/extraction-actions.ts:75-79`).
- **No way to mark any of it as a fixture**, because no such field exists (Q6b),
  and **no way to cancel it**, because no such status exists (Q7a).
- **The only cleanup that exists is a DELETE**, in an owner-run script
  (`scripts/reset-test-data.sql:464`), which is what the dispatch's own standing
  convention says not to do.
- If the document is a real supplier document, the run is also the event that
  `CLAUDE.md:935-937` names as ending the migration grant.

**The cheapest thing to do before any of that is Q4: confirm which header name
Andre's scenario sends on the callback.** If it is `X-RC-Secret`, no run of any
size will ever store a row, and no other precondition in this file matters.
