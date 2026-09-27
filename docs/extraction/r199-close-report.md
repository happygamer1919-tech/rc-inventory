# R-199 close: the evidence report

**Role:** EXECUTOR (ORANGE)
**Date:** 2026-09-27
**Ruling:** R-213, `decisions/inbox.md`
**Measured at:** `main` `c89c1cc`
**Runbook followed:** `docs/extraction/r199-e2e-runbook.md` (click path in Part A,
query in Part C, pass condition in Part D)

**NOTHING IN THIS SESSION TOUCHED PRODUCTION.** No database connection, no
credential sourced, no environment value read. The rows below come from the
owner's own SQL Editor exports of the runbook's Part C query, pasted into the
dispatch of 2026-09-27. The only other outside source is GitHub's
deployment record, read for finding F29.

---

## 1. PROVENANCE OF THE ROWS

- **Who ran it:** the owner uploaded the seven staged files through the production
  screen `Încarcă comandă` (runbook Part A) and ran the Part C query in the
  Supabase SQL Editor himself.
- **When:** fires on 2026-09-24 between 20:00 and 21:54 UTC, and on 2026-09-27
  between 14:09 and 14:11 UTC.
- **Against what:** the counterparty's scenario version 79. The owner states it is
  a header-only change from 78, with extraction, routing and payload shape
  identical.
- **Anchor:** `document_filename ilike 'TEST-R199-%'` (runbook Part B). The
  `order_id`s were minted by `startExtraction` (`lib/data/extraction-actions.ts`),
  so every row originated from our own fire path, as R-210(b) requires.
- **THE NINE DRAFTS WERE DISMISSED AFTER THE EXPORT.** The owner dismissed all nine
  with **Renunță la document** on 2026-09-27, before this report. The exports
  predate the dismissal, and nothing was re-queried. `cancelExtractionDraft`
  (`lib/data/extraction-actions.ts:362`) writes only `cancelled_at`,
  `cancelled_by` and `cancel_reason`. It deletes nothing and leaves `status` and
  `error_code` as they were, so the rows below still exist in the same state
  apart from those three columns.

## 2. TABLE ONE: THE COUNT THAT DECIDES THE RUN (Part C, query 3)

| documents_found | distinct files | delivered | never_answered | supplier_name populated | meta page_count populated | extracted | partial | failed | still pending |
|---|---|---|---|---|---|---|---|---|---|
| 9 | 7 | 9 | 0 | 9 | 9 | 4 | 3 | 2 | 0 |

**Cross-checked against table two:** 9 rows; 4 `extracted` (MPC twice, BETONMIX,
TEHNOCOM), 3 `partial` (NORDAVEX twice, LUMICAST), 2 `failed` (SILVAMAT,
MATNORD); `callback_at` non-null on all nine; `supplier_name` non-null on all
nine. Every count agrees.

## 3. TABLE TWO: ONE ROW PER FIRED DOCUMENT (Part C, queries 1 and 2)

Times UTC. Latency is `callback_at` minus `fired_at`, computed for this report.
`source` is `document_source`; `pages` is `meta -> 'page_count'`; `printed` and
`derived` count lines by `line_total_source`. Empty means null.

| order_id | document_filename | fired_at | callback_at | latency s | status | error_code | supplier_name | source | pages | lines | printed | derived | platform_error_code | platform_arm |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `767634be-3e4b-4db2-b501-64476f63120d` | TEST-R199-MPC.pdf | 2026-09-24 20:00:46.463 | 2026-09-24 20:01:06.837 | 20.374 | extracted | | MATERIALE PRO CONSTRUCT S.R.L. | digital | 1 | 6 | 6 | 0 | | |
| `6ad30df7-b672-4e0b-966d-071564b7c9b6` | TEST-R199-SILVAMAT.pdf | 2026-09-24 20:02:35.174 | 2026-09-24 20:02:46.108 | 10.934 | failed | unreadable_document | SILVAMAT DISTRIBUTIE S.R.L. | digital | 1 | 0 | 0 | 0 | | |
| `d1642ae4-6f16-4875-b889-0255a4de4021` | TEST-R199-NORDAVEX.pdf | 2026-09-24 20:03:43.692 | 2026-09-24 20:03:54.590 | 10.898 | partial | reconciliation_failed | NORDAVEX MATERIALE S.R.L. | digital | 1 | 7 | 7 | 0 | reconciliation_failed | line_sum_missed |
| `eb77c7f5-7fe4-4812-858b-d06e629bfce2` | TEST-R199-MPC.pdf (resend) | 2026-09-24 21:52:49.421 | 2026-09-24 21:53:00.203 | 10.782 | extracted | | MATERIALE PRO CONSTRUCT S.R.L. | digital | 1 | 6 | 6 | 0 | | |
| `58c2b4aa-fa2e-493e-beec-17dcd986e7c7` | TEST-R199-NORDAVEX.pdf (resend) | 2026-09-24 21:53:52.895 | 2026-09-24 21:54:02.968 | 10.073 | partial | reconciliation_failed | NORDAVEX MATERIALE S.R.L. | digital | 1 | 7 | 7 | 0 | reconciliation_failed | line_sum_missed |
| `d6feecef-3cbc-49db-9ef4-681f65257cba` | TEST-R199-LUMICAST.pdf | 2026-09-27 14:09:57.504 | 2026-09-27 14:10:08.213 | 10.709 | partial | | LUMICAST INTERIOR S.R.L. | digital | 1 | 8 | 7 | 1 | | |
| `4164defa-f527-4e6f-8d91-4e1c068a9503` | TEST-R199-MATNORD.pdf | 2026-09-27 14:10:26.193 | 2026-09-27 14:10:35.172 | 8.979 | failed | reconciliation_failed | DEPOZIT MATERIALE NORD S.R.L. | scan | 1 | 0 | 0 | 0 | unreadable_document | no_lines |
| `f06ddc97-168d-4223-af41-f35522b5bb8e` | TEST-R199-BETONMIX.pdf | 2026-09-27 14:10:34.134 | 2026-09-27 14:10:41.210 | 7.076 | extracted | | BETONMIX CONSTRUCT SRL | digital | 1 | 5 | 5 | 0 | | |
| `3ee63b9a-31e6-4446-8a2b-8a41a6f9cb22` | TEST-R199-TEHNOCOM.pdf | 2026-09-27 14:10:39.968 | 2026-09-27 14:11:06.838 | 26.870 | extracted | | TEHNOCOM GRUP S.R.L. | digital | 3 | 54 | 54 | 0 | | |

Also reported in the export: `callback_arrived` true on all nine;
`upload_page_count` equals `meta_page_count` on all nine;
`platform_derived_partial` false on all nine.

**FIRE-TO-CALLBACK LATENCY: 7.076 s to 26.870 s, median 10.782 s, over nine
rows.** The two longest are the two largest reads: TEHNOCOM (54 lines, 3 pages)
at 26.870 s and the first MPC at 20.374 s. Every latency is inside the
counterparty budget the runbook cites (`lib/data/extraction-budget.mjs`, 60000 ms
below 20 lines, 120000 ms above).

## 4. THE PASS CONDITION, READ AGAINST THE ROWS

The runbook's Part D5 thresholds were written for seven fires. This run made
nine, because two files were resent:

| Part D5 condition | needed | measured | holds |
|---|---|---|---|
| `documents_found` | 7 | 9 rows, 7 distinct files | yes, every file present |
| `delivered` | every row | 9 of 9 | yes |
| `supplier_name_populated` (R-205) | every row | 9 of 9 | yes |
| `meta_page_count_populated` (R-205) | every row | 9 of 9 | yes |

**R-205's shape for Silvamat** (`failed`, `unreadable_document`, `digital`,
`lines []`) matches its row exactly.

**Against the runbook's D3 expectations, triaged by D4:**

| document | Andre's claim (D3) | stored | reading |
|---|---|---|---|
| Silvamat | `failed`, `unreadable_document`, `digital` | same | matches (M-d) |
| Matnord | `failed`, `reconciliation_failed`, `scan` | same, our verdict `unreadable_document` / `no_lines` beside it | matches (M-d); finding F26 |
| Nordavex | `partial`, no code | `partial`, `reconciliation_failed`, arm `line_sum_missed` | our code supplied by R-197 (P3-55), or sent by him under R-190; the row cannot tell which |
| Lumicast | `partial`, no code | `partial`, no code, no platform verdict | matches; finding F29 |
| MPC | `extracted`, 6 lines | same, twice | matches; no derived line, so M-c does not apply |
| Betonmix | `extracted`, 5 lines | same | matches |
| Tehnocom | `extracted`, 54 lines, `meta.page_count` 3 | same | matches |

**CORRECTION TO THE DISPATCH TEXT.** The dispatch put Nordavex's code down to
R-211. R-211 fires only on the `anchor_unknown` arm, and Nordavex's stored arm is
`line_sum_missed`. The rule that applies is R-197.

## 5. FINDINGS

- **F26 CONFIRMED.** MATNORD carries both `reconciliation_failed` (the sender's,
  stored as `error_code` under R-190) and `unreadable_document` (ours, in
  `platform_error_code`, arm `no_lines`).
- **F27 STAYS OPEN.** `platform_derived_partial` is false on all nine rows.
- **F29, NEW: R-211 WAS DEPLOYED AND NOT TRIGGERED ON LUMICAST.**
  - R-211's implementation is card P3-83, pull request #340, merge commit
    `a7aeb2b`, merged 2026-09-21 19:42:07 UTC.
  - LUMICAST fired 2026-09-27 14:09:57.504 UTC. The latest `main` commit before
    that is `c89c1cc`, which contains `a7aeb2b` (`git merge-base --is-ancestor`
    exit 0). GitHub's deployment record shows `c89c1cc` in Production since
    13:15:48 UTC that day.
  - **So "not yet deployed" is disproven.**
  - **"Not honoured" is not supported either.** R-211 stores a code on a
    code-less digital partial only when our classification returns the
    `anchor_unknown` arm (`app/api/extraction/callback/route.ts:505-509`).
    LUMICAST's `platform_error_code` and `platform_arm` are both null, so our
    classification ran and refused nothing. The platform columns were being
    written in production at that hour, as MATNORD's callback 27 seconds
    after LUMICAST's shows.
  - **The open question passed to Max:** LUMICAST was fixtured as the
    `line_total_missing` arm, with one line that has no total
    (`docs/reports/2026-09-15-executor-orange-andre-fixtures.md`). It now arrives
    with every line carrying a total, one of them marked `derived`, and
    reconciles clean.
- **F15 to F28 pass to Max under R-204.** Ids only, no fix in this pull request.

## 6. CARD P2-08b: NOT SHIPPED, AND WHICH CLAUSES FAIL

Its acceptance, clause by clause, against this evidence:

| clause | satisfied by this report? |
|---|---|
| one **real supplier document** uploaded on production | **no.** Every file is from the test sample set; Nordavex, Lumicast and Silvamat are recorded as synthetic, and none of the seven is recorded as real |
| reaches the private `rc-docs` bucket | not measured here (the upload path writes it, runbook A2, but no object was listed) |
| the fire carries the six inbound fields to the real webhook with `X-RC-Secret` | not measured here |
| the callback arrives with a valid secret and is answered `202` | **inferred, not observed.** Each row has exactly one `callback_at` and a distinct `order_id`, and a first delivery answers `202`. No status code was recorded |
| the stored draft matches the document, **checked by a human against the paper** for supplier, `order_date`, `document_total`, every line quantity, unit and price | **no.** No comparison was made or recorded |
| the three prompt rules hold on that document | **no.** Not checked |
| evidence: the `order_id`, **the stored draft as JSON**, and the human confirmation | **no.** `order_id`s are here; the draft JSON and the confirmation are not |

`P2-08b` stays `blocked`. `EXT-35` stays `todo`: R-199(2) was waived, not met.

## 7. WHAT THIS REPORT DOES NOT CLAIM

- It does not claim the EXT-35 fixture order exists. It does not.
- It does not claim the three pre-model bodies were exercised. R-210(a) accepts
  them on Andre's written confirmation.
- It does not cite "all five emittable contract shapes" to the contract. That is
  the owner's statement, recorded in R-213 as his.
- It does not cover rotation or `P2-13`. R-200 governs, and the owner performs
  it outside R-213.
