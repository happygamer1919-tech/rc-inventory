# EXECUTOR: the Andre regression verification is blocked on a production read, and what could be answered without one

**Role:** EXECUTOR
**Date:** 2026-09-18
**Branch:** `board/20260918-regression-verification-blocked`, cut from `origin/main` at `feb4655`
**Files changed:** this report, and nothing else.

**No production database read was attempted.** No row was queried, no credential
was sourced, and nothing was written anywhere. The measurement pass arrives as a
separate dispatch, with values pasted from Max.

---

## BOOT

`docs/board/rc-board-phase2.json` at `origin/main` `feb4655`:

- **Cards:** todo 32, in_flight 0, blocked 2 (`P2-08b` on andre, `P2-14` on client), halted 0, shipped 68
- **Launch gate:** **6/9**
- **Next eligible card:** **AUT-3**, "Add the TRIAGE role to the POC chain". Not worked, because this dispatch names its steps.

Phase 3 board, `as_of` 2026-09-18T15:37:51Z: todo 32, blocked 1, shipped 94, gate 0/9.

---

## PART 1. The rulings, and where a callback result is stored

### R-205, and the pass condition it sets, in its own words

> *"For the fixture runs, the regression passes only when the stored draft shows
> `supplier_name` and `_meta.page_count` populated; a 2xx status alone is not a
> pass."*

Its own reasoning for that clause:

> *"Both are exactly the fields Andre's build was sending under other names,
> `supplier` and `pages`/`_meta.pages`, and the route neither refuses nor stores
> either of those: a payload carrying them is answered `202` with both values
> recorded as null. A pass read off the status code would therefore report his
> field fixes as landed on the run that proves they did not."*

### R-199, condition one

> *"Andre's corrected build passes one regression against a fresh re-sign covering
> fixtures lumicast-5531 and nordavex-0002718, one digital failure, one scan
> failure, one digital invoice with line items and no printed grand total
> (supplied by Andre, confirmed not a Rapid Construct document), and his field
> fixes (supplier -> supplier_name, pages/_meta.pages -> _meta.page_count),
> verified against the validator only, never against a fixture or prose list"*

and, in the ruling body, **"EXT-34 (line_total_source storage) is excluded from
close."**

### R-202, the frozen failure shape

> *"Digital failure: lines must be a literal []. Scan failure: the lines key must
> be absent. null and "" stay refused on both paths. No change to what
> app/api/extraction/callback/route.ts accepts, refuses, or returns, including
> error texts, until close."*

### R-201, the measurements behind it

| case | payload | result |
|---|---|---|
| C1 | digital, valid `error_code`, `lines: []` | 202 accepted |
| C6 | digital, valid `error_code`, `lines: null` | 400 refused, `lines lipseste` |
| C7 | digital, valid `error_code`, `lines: ""` | 400 refused, `lines lipseste` |
| C8 | scan, valid `error_code`, `lines: null` | 400 refused, `lines interzis pe o scanare esuata: cheia nu are voie sa fie trimisa deloc` |

R-201 also says what those four are not: *"C6, C7 and C8 asserted only that the
status was one of a permitted set and logged the truth, so they cannot fail and
must never be cited as passing tests."*

### The stored table and columns, with file:line

`app/api/extraction/callback/route.ts` on `origin/main` `feb4655`, 800 lines.

**`extraction_drafts`**, updated at **`:684-686`**, from the `draftUpdate` object
built at **`:596-618`**:

| column | line |
|---|---|
| `status` | `route.ts:597` |
| `error_code` | `route.ts:598` |
| `reason` | `route.ts:599` |
| `supplier_name` | `route.ts:600` |
| `order_date` | `route.ts:601` |
| `subtotal`, `vat_amount`, `document_total` | `route.ts:602-604` |
| `prices_include_vat`, `vat_rate` | `route.ts:605-606` |
| `currency`, `currency_raw` | `route.ts:607-608` |
| **`meta`**, the whole `_meta` block stored verbatim | `route.ts:617` |
| **`callback_at`**, the timestamp a callback writes | `route.ts:618` |

Four more columns are written only when the database is known to have them, each
behind its own capability probe:

| column | line |
|---|---|
| `platform_error_code`, `platform_arm` | `route.ts:634-635` |
| `platform_line_math_failed` | `route.ts:643` |
| `page_count` | `route.ts:647` |
| `document_source` | `route.ts:659` |
| `order_ref`, `order_ref_series` | `route.ts:679-680` |

**`extraction_draft_lines`**: cleared at **`:696-698`** and re-inserted at
**`:732`**, one row per line, shaped at **`:707-721`**: `order_id`, `line_no`,
`product_name`, `quantity`, `unit`, `unit_raw`, `unit_price`, `line_total`,
`currency`, `currency_raw`, `category`, `category_raw`, plus the P3-75 line-math
columns behind their own probe.

The read-only `GET` at **`:785-796`** returns a draft and its lines, and it is not
a public path: it requires the same `MAKE_CALLBACK_SECRET` header as the write.

---

## PART 2. What could be answered without touching the database

### Finding 1. There is no `received_at` column. The timestamp is `callback_at`

A grep for `received_at` across `supabase/migrations`, `lib`, `app` and
`docs/contracts` returns nothing. `extraction_drafts` carries four timestamps,
declared in `supabase/migrations/0008_extraction_drafts.sql:107-111`: `fired_at`,
`callback_at`, `created_at` and `updated_at`.

**The one a callback writes is `callback_at`**, at `route.ts:618`, and it is
written on every accepted callback. A measurement pass asking "when did this
arrive" reads `callback_at`.

### Finding 2. No column records a producer or scenario version

There is no `prompt_version`, `model`, `scenario_version` or `producer_version`
column on either table. What exists is `route.ts:617`, `meta: body._meta ?? null`,
which stores the sender's whole `_meta` block verbatim.

The contract documents `prompt_version` at `docs/contracts/extraction-v2.md:427`,
and `lib/data/extraction-types.ts:263` and `:341` read it back out of `_meta` for
display. So a version, if the sender supplied one, is recoverable **only from
inside `extraction_drafts.meta`**, and only with a database read. R-196's record
puts it the same way: the only key ever read out of `meta` by the route is
`page_count`.

### Finding 3. `line_total_source` is stored nowhere, so no access level answers it

`EXT-34` is `status: blocked`, `blocked_on: max`, `owner_terminal: max` on the
phase 3 board. No migration adds the column and the route writes no such field.
The single reference in the repository is
`lib/data/callback-keys.mjs:70`, which lists it among `EXT34_LINE_KEYS` precisely
so the validator's key allowlist tolerates it.

**R-199 excludes EXT-34 from close**, so this is not a gap in the regression. If
Andre's build sends `line_total_source`, P3-76's behaviour applies: an unknown key
is logged and warned, never refused, so it is accepted and dropped.

### Finding 4. Our route answers `200` only for a DUPLICATE. A first delivery is `202`

This one bears directly on the claim under verification and is stated here with
its evidence rather than as an inference.

**The code:**

| fact | file:line |
|---|---|
| `accepted: 202`, `duplicate: 200` | `lib/data/extraction-types.ts:184-185` |
| the response status is chosen by `isRepeat` | `route.ts:744` |
| `isRepeat` is true when the row already has a `callback_at` | `route.ts:576` |
| the row and its `callback_at` are read before any write | `route.ts:529-533` |

**The route's own header says it in the same terms**, at `route.ts:6-7`:

    202 acceptat      ciorna scrisa prima data
    200 duplicat      acelasi order_id, ciorna INLOCUITA

And the comment above `isRepeat` explains the choice of field: *"Duplicat inseamna
un AL DOILEA CALLBACK, deci se citeste din callback_at, care este scris numai de
un callback."*

**WHAT THIS DOES AND DOES NOT ESTABLISH.** It establishes what our handler returns
and why. It does not establish what the counterparty received, and this report
makes no claim about that: the reported statuses are prose, and prose is not
evidence. **It does mean that a run reported as seven `200`s cannot also be seven
first deliveries.** Either each of the seven rows already carried a `callback_at`
from an earlier run, or the reported statuses are not what our route emitted. The
stored `callback_at` values settle it in one query, and that query is the
measurement pass.

---

## PART 3. Why R-206 does not reach those tables

**R-206's grant is a closed list of five items**, quoted from the ruling:

> 1. sourcing `/Users/ivan/rc-secrets/phase2.env`, values never printed, CLAUDE.md
>    8.3 otherwise unchanged
> 2. listing objects under `rc-docs/_samples/andre`
> 3. uploading under that prefix **without overwrite**
> 4. creating signed URLs under that prefix at the TTL R-096 sets
> 5. writing the matching `docs/PRODUCTION-WRITES.md` row, which R-055 requires

**And its exclusion names the database explicitly:**

> **"WHAT IS NOT COVERED IS EVERYTHING ELSE**, whether or not it is named here:
> the production database, any other bucket, any other prefix of `rc-docs`, any
> migration, and any credential act. Those stop for Ivan, exactly as they did
> before this ruling."

`extraction_drafts` and `extraction_draft_lines` are the production database.
Item 1 permits sourcing the environment file, but for the acts on the list it
belongs to; it is not a general key grant.

**No wider grant survives.** R-012's board-wide secrets read was conditioned on
the environment holding zero real client data; R-192(c) held every terminal grant
live only on that same condition, and **R-200 records that the condition is
spent**: *"card evidence records that real client data IS in production."*
CLAUDE.md 8.2 says the same about the delegation: *"The moment real data exists
the grant is gone."*

**Both routes to the data need a credential outside that list.** A direct query
needs `SUPABASE_SERVICE_ROLE_KEY`; the route's own `GET` reader needs
`MAKE_CALLBACK_SECRET` and then builds the same service-role client
(`route.ts:785-796`).

**The grant now sits with Max.** R-207, dated 2026-09-18, records that as of
2026-09-17 Max is the platform owner, and that in `P2-13` and the rotation runbook
every "Ivan" reads "Max": who executes, who ticks, who approves.

**A third obstacle, independent of permission: the seven `order_id`s are not in
the repository.** A grep for a uuid in an `order_id` position across `docs`
returns nothing committed. A draft row exists only for a document this system
itself sent: `route.ts:538` guards on the row being absent and `route.ts:541`
answers `400 order_id necunoscut` when it is. A measurement pass therefore needs either the seven ids or a query
keyed on `document_filename`.

---

## PART 4. Two errors in the dispatch, recorded as strategy chat errors

**Neither is a terminal deviation.** They are recorded here because a dispatch
written against a field that does not exist is the kind of thing that is cheaper
to find in a record than to rediscover.

1. **The dispatch asked for `received_at`.** No such column exists on either
   table. The column that answers the question is `callback_at`.
2. **The dispatch asked whether per-line `line_total_source` is present.** It
   cannot be, at any access level: the column does not exist, `EXT-34` is blocked
   on Max, and R-199 excludes EXT-34 from close. **That check is dropped by the
   owner**, and this paragraph records why rather than leaving a silently skipped
   step.

---

## VERIFICATION

Each exit code captured on its own line, no pipe between a command and its
status, on `feb4655` with this report present, which is the tree this pull
request proposes:

    node docs/board/validate-board.mjs (all three boards)   rc=0
    npm run check:unique-ids                                rc=0
    npm run check:open-branch-ids                           rc=0
    npm run check:conflict-residue                          rc=0
    npm run check:board-edit                                rc=0
    npm run check:card-ids                                  rc=0
    npm run check:board-clock                               rc=0
    control: validate-board.mjs on a file that is not a board   rc=1

`check-card-ids: OK, every card id on the record resolves to a card.`

`check-open-branch-ids: OK. No id added by this branch is claimed on another open
branch`, and it reports this branch pointing at `R-208`, the counter untouched:
**this pull request writes no ruling and allocates no id.**

**The control is why the seven greens mean anything.** Seven checks reporting
`rc=0` says nothing until one of them has been seen to refuse, and the control run
refuses a file that is not a board.

**Every file:line in this report was measured against `feb4655` in this session**,
not carried forward from an earlier read of the same file. The route is 800 lines
at this commit and has moved twice this week.

---

## DEVIATIONS, every one flagged

**D1. Parts 2 and 3 of the original verification dispatch were not performed, and
that is the dispatch's own STOP clause working as written.** It said to stop and
report what was needed if reading the rows required anything beyond R-206. It did,
on three counts set out in Part 3 above. The stop was ratified by the owner.

**D2. No measured table appears in this report**, because no row was read. This
report is the access analysis and the code-level findings only. The measurement
pass is a separate dispatch and will carry values pasted from Max.

---

## STATE AT THE END

- **Nothing was read from production and nothing was written anywhere.** No
  credential was sourced in this session.
- **What unblocks the measurement pass:** the seven `order_id`s or a query keyed
  on `document_filename`, plus either a ruling granting a SELECT-only read of the
  two tables scoped to those documents and expiring at close under R-199, or
  Max running the query and pasting the output.
- **The first thing those values settle** is Finding 4: whether the reported
  statuses are consistent with rows that had no prior `callback_at`.
- Next eligible card is unchanged: **AUT-3**.
