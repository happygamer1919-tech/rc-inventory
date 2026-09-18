# Executor report, 2026-09-18: EXT-34, Ivan's finding F4 (factory goal G36)

Role: EXECUTOR, on branch `card/ext-34`, one pull request. The card already
existed on `docs/board/rc-board-phase3.json` (authored by ORANGE on 2026-09-15);
no id was allocated. It was blocked on `max`; the platform owner approved it on
2026-09-18 ("F4 approved"), relayed by POC, and it is unblocked inside this
same pull request as the dispatch asked.

## 1. What changes for Rapid Construct, in plain words

The document reader already sends, for each order, what kind of document it is
and the client's own reference, and for each line the supplier's product code,
a description, and whether the line total was printed on the page or worked
out. Until now the platform received all five and threw them away. From this
change they are kept, and the review screen shows them in Romanian, read only,
under the fields the operator already checks. Nothing is refused, matched or
recalculated because of them.

## 2. What was built

- **Migration `supabase/migrations/0053_extraction_inbound_fields.sql`.** Five
  `add column if not exists`, all `text`, nullable, no default, no check
  constraint: `extraction_drafts.document_type`, `extraction_drafts.client_ref`,
  `extraction_draft_lines.supplier_code`, `extraction_draft_lines.description`,
  `extraction_draft_lines.line_total_source`. Five comments and a verification
  select. No row is updated, nothing dropped or deleted. Listed as pending in
  `docs/migrations/APPLY-LOG.md` with card EXT-34.
- **Assertions `scripts/poc-free/local-db/assertions/0053_extraction_inbound_fields.sql`**,
  run by the CI step that applies every migration to a bare postgres: the five
  columns exist as nullable text with no default, a draft and four lines are
  written and read back, a `line_total_source` outside `printed`/`derived` is
  stored (no constraint judges it), and rows written without the columns come
  back NULL. All inside a rolled-back transaction.
- **Probe `hasExtractionInboundFields`** in `lib/data/schema-capability.ts`.
  **Decision: ONE probe for all five columns, not one per column.** They arrive
  in one migration file, so no state exists where some are present and others
  not; this is the same reasoning `hasExtractionLineMath` (P3-75) and
  `hasExtractionPlatformVerdict` (EXT-26) record. It asks both tables and says
  yes only when both answer, on the client the caller passes.
- **Route `app/api/extraction/callback/route.ts`.** Reads `body.document_type`,
  `body.client_ref`, and per line `l.supplier_code`, `l.description`,
  `l.line_total_source`, each through `str()`, written only when the probe says
  yes, on the service-role client, exactly the shape `order_ref` uses. No new
  400, no change to any response code or body, and no reconciliation rule reads
  `line_total_source` (that is G28's F6, a separate card).
- **Review screen.** `lib/data/extraction.ts` selects the two draft columns and
  the three line columns behind the same probe; `ExtractionDraft` gains
  `documentType` and `clientRef`, `ExtractionLine` gains `supplierCode`,
  `lineDescription` and `lineTotalSource`. `components/orders/ExtractionReviewPanel.tsx`
  shows "Tipul documentului" and "Referința clientului" as one small read-only
  line under the header fields, and "Cod furnizor", "Descriere" and "Totalul
  liniei" (`tipărit pe document` / `calculat`, any other value shown as sent)
  as one small muted line under each product line. Each line appears only when
  something was sent, so the reconciliation view does not grow for documents
  without them.
- **`lib/data/callback-keys.mjs` and `scripts/poc-free/check-callback-keys.mjs`.**
  The keys check said, in its own failure text, "if EXT-34 shipped, move the
  keys into the route lists". They are moved; the known-key set is unchanged,
  so no warning changes. The case that asserted "no EXT-34 key is read yet" is
  turned into "all five are read and listed", which is stricter.

## 3. Acceptance, clause by clause

1. **COMMAND ONE, THE SCHEMA.** One new numbered migration, five nullable text
   columns, no default. `npm run check:no-destructive-migration` locally:
   `1 file(s) parsed, 13 statement(s), no DROP TABLE, no TRUNCATE, no DELETE`,
   exit 0. The file is listed by path in the pull request.
2. **COMMAND TWO, THE ROUTE.** As in section 2. Behind `hasExtractionInboundFields`
   on the service-role client, so a database without the columns is answered
   exactly as today.
3. **COMMAND THREE, THE PROOF.** Two new cases in `tests/e2e/extraction.spec.ts`:
   - `35. EXT-34: cele cinci campuri trimise se stocheaza asa cum au sosit si se citesc inapoi`:
     a digital `extracted` payload with all five keys, `printed` on line 1 and
     `derived` on line 2; asserts 202, the unchanged response body, and all five
     stored values read back.
   - `36. EXT-34: un payload FARA cele cinci campuri este acceptat, 202, si toate cinci sunt null`:
     the shared fixture, verified to carry none of the five; asserts 202, the
     unchanged body, and five nulls.
   **FAILING BEFORE THE CHANGE, UNDER RULING R-150.** A tests-only push cannot
   produce a red end to end run in this repository: `check:board-edit` refuses
   any code push while the card is `in_flight`, and it runs before the
   Playwright step (R-150 records the 29-second refusal that proved it). R-150
   makes the before-half a named commit on the branch plus the command a
   stranger runs at it: **commit `b81d0b001d8b694af1e88efa7155267e91987ea5`**
   carries both cases without the migration or the route change, and at that
   sha `npx playwright test tests/e2e/extraction.spec.ts -g "EXT-34"` fails both,
   because the columns do not exist and the GET returns `undefined` for every
   field, which is neither the sent value nor `null`. **It was not run on this
   machine**: there is no Docker and no Supabase CLI here, so no failing output
   could be captured locally, and this report says so rather than quoting output
   that does not exist. The green half is the End to end step of `quality` on
   the pull request head.

   **THE FIRST CI RUN WAS RED, AND ON A DEFECT IN MY OWN FIXTURE.** Run
   35368299734 on head `7d139f6`: 340 passed, 1 failed. Case 36 passed. Case 35
   failed at its first assertion:

   ```
   Error: un payload cu cele cinci campuri este acceptat
   Expected: 202
   Received: 500
   ```

   Its hand-built second line sent `unit: "buc"`, and `extraction_draft_lines.unit`
   is the enum `public.unit_code`, so the insert was refused. The fixture now
   sends `unit: "pcs"` with `unit_raw: "buc"`. Consequence for the before-half,
   stated plainly: at `b81d0b0` case 35 still fails, but it fails at that same
   status line for the unit reason, not at the five stored values. With the
   corrected fixture and no migration it would reach the read-back and fail on
   `undefined`; that last sentence is reasoning from the code, not a run. Case 36
   at `b81d0b0` fails on the missing columns exactly as described.
4. **PLUS `npx tsc --noEmit`** exit 0 locally, and `npm run build` exit 0.

## 4. Local gates, each run alone, each exit 0

`npx tsc --noEmit`, `npm run build`, the board validator on all three boards
before every commit, `check:card-ids`, `check:unique-ids`,
`check:open-branch-ids`, `check:no-destructive-migration`,
`check:conflict-residue`, `check:categories`, `check:ledger-rows`,
`check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`,
`check:assertion-register`, `check:callback-keys`, `prove:schema-direction`.
`check:board-edit` refused while the card was `in_flight`, as designed, and is
rerun after the flip to `shipped`. The Playwright suite, `check:migrations`,
`prove:applier` and `prove:assertions` run only in CI.

## 5. What broke, and the learning

`check:pending-schema-reads` refused four files that read no table, because
`description` is an ordinary word (page metadata, menu text). The column name
is the card's and was kept. The check gained a narrow `TOLERATED_WORDS` map
(file plus word, each with a reason, refused when stale); whole-file exemption
was refused because it would blind the check for those files forever. Both new
refusal paths were watched firing locally, then reverted. The app-side field
was named `lineDescription` to avoid the same collision.

Second, the red first CI run described in section 3: a unit outside the
`unit_code` enum in my own fixture. Fixed in the fixture; signature added to the
factory's `KNOWN-FAILURES.md`.

Two entries appended to `docs/LEARNINGS.md`.

**Observed and not changed (outside this card):** a real payload whose line
`unit` is outside the enum also gets a 500 from the callback route today, and
Make retries a 5xx. That is existing behaviour; if wanted, it is a separate card.

## 6. Counterparty and contract

This change does not alter what the callback route accepts or refuses: the
columns are nullable, no new 400 exists, and an absent field stays absent.
Andre already sends all five fields, per the card's own defaults, so nothing new
is asked of him. **Andre was not told**, and nothing needs telling. No contract
text changed.

## 7. Left for the owner

- **The merge is yours.** It carries migration 0053, which reaches the live
  database about two minutes after merging. This session does not merge.
- `document_type` is shown verbatim (for example `invoice`), because the card
  forbids giving it a value set and the sender's values are not documented. If
  you want it in Romanian words, that is a small follow-up card once the list of
  values the reader sends is known.
- F6 (using `line_total_source` in our own checks) can be built once this merges.
