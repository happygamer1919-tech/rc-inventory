# Executor report, 2026-09-18: P3-75, Ivan's finding F7

Role: AUTHOR (card P3-75 written on the phase 3 board), then EXECUTOR, in one pull
request on branch `card/p3-75`. Id allocated with `npm run id:free -- P3-75`
(FREE, lane highest P3-74, zero open pull requests).

## 1. What changes for Rapid Construct, in plain words

When the document reader returns an order line whose quantity times unit price
does not equal that line's own total, the system now notes it on that line. It
does so even when the order's grand total still adds up because two wrong lines
cancel each other out, which is the case nothing caught before. Nothing is
refused, moved or hidden because of it: it is a note kept for whoever checks the
order. No screen shows it yet; that is a separate card if the owner wants it.

## 2. The finding, read cold from the code

F7, quoted exactly: "F7 a line whose line_total is right but quantity x unit
price disagrees is caught, on every shape."

`reconcile()` in `lib/data/reconciliation.ts` adds up every line's `line_total`
and compares the SUM with the printed subtotal or total. `headerConsistency()`
checks the header against itself. Nothing compared one line's
`quantity * unit_price` with its own `line_total`. A scan with lines
`3 x 10 = 40` and `2 x 25 = 40` sums to 80, matches a printed subtotal of 80,
passes both header checks, and was stored `extracted` with both wrong lines.

And `classifyScan` only runs on scans (plus one digital exception, R-197), so
even a per-line arm added there would not have run "on every shape".

## 3. The fix

- **`lineMathConsistency`**, a new pure function in `lib/data/reconciliation.ts`,
  separate from `classifyScan`, `reconcile` and `headerConsistency`, which are
  byte-identical. For one line it returns `passed` or `failed` with the
  difference, or `not_run` when quantity, unit price or line total is missing.
  **`lineMathFailedCount`** turns a payload's verdicts into the count of failed
  lines, or null when no line could be checked; its switch is exhaustive and a
  fourth outcome refuses to compile, the same guard `classifyScan` uses.
- **The tolerance** is `round2(max(toleranceFor(1), 0.005 * abs(quantity)))`.
  The floor is the reconciliation's own per-line figure called rather than
  restated (0.05). The second term is the largest error a unit price printed to
  whole bani can carry: half a ban per unit. A supplier computes the line total
  from the unrounded price, so 1000 units at 1.2345 printed as 1.23 show 1234.50
  against 1230.00, a 4.50 gap on a correct line. A fixed cent amount would flag
  every large-quantity line with a rounded price. Both sides are rounded to two
  decimals before subtracting, as `round2`'s header requires; the boundary is
  inclusive, as in `reconcile`.
- **"Not checkable" is distinct from both results.** `not_run` is stored when a
  figure is missing, with a null difference. NULL in the column means our check
  did not run at all (every row written before 0052). On the document, the count
  is NULL when no line could be checked, because zero would claim "checked, all
  fine" about a document where nothing was checked.
- **In the route**, the check runs on every line of every payload that carries
  lines, whatever `document_source` or `status`, and it runs AFTER
  `effectiveStatus`, `effectiveErrorCode` and `dropLines` are decided and feeds
  none of them. It is only written.
- **Storage**, migration `supabase/migrations/0052_extraction_line_math.sql`,
  three `add column if not exists`, each nullable with no default and its own
  check constraint:
  - `extraction_draft_lines.platform_math_outcome` text, `passed | failed | not_run`
  - `extraction_draft_lines.platform_math_diff` numeric, never negative
  - `extraction_drafts.platform_line_math_failed` integer, never negative
  The document-level count exists because a scan our reconciliation stores
  `failed` has its lines dropped under EXT-15; without it, a disagreement on that
  shape would be recorded nowhere (spec case 3).
- **Why it cannot be read as the document's own verdict.** It is not a value of
  `error_code` and not a status. `error_code` is one document-level field that
  R-190 makes the sender's, and a per-line disagreement is a different
  granularity. The `platform_` prefix is the one EXT-26 gave our own verdict
  (`platform_error_code`, `platform_arm`), and the column comments say "OUR
  check ... never substituted, ruling R-190".
- **Gate**: `hasExtractionLineMath` in `lib/data/schema-capability.ts` probes both
  tables. Until 0052 is applied the route writes exactly what it wrote before, so
  the two-minute window between merge and apply cannot produce a 42703 and a 500.
- **Assertions**: `scripts/poc-free/local-db/assertions/0052_extraction_line_math.sql`
  checks the three columns are nullable with no default, can be written and read
  back, that each constraint refuses a bad value, and that a draft written
  without the column stays NULL.
- `docs/migrations/APPLY-LOG.md` gains the pending register line for 0052.

## 4. Does this change what the route accepts or refuses at the HTTP level, and was Andre told

**No.** The route has no new return statement. The new code sits after every
400, reads nothing that decides a code, and the probe swallows its own errors
into "no" rather than throwing. Status, error_code, the kept or dropped lines and
the response body `{order_id, status, lines}` are computed before the check
runs and are not touched by it. Every case in the named spec asserts the HTTP
code and body by value.

**Andre was not told.** This factory has no channel to him, and nothing he sends
or receives changes.

## 5. Acceptance, and what is left for CI

Named spec `tests/e2e/extraction-line-math-consistency.spec.ts`, five cases:

1. scan, `extracted`, two lines each wrong by 10.00 that cancel out, header and
   line sum sound: 202 `{status: extracted, lines: 2}`, both lines `failed` with
   difference 10, count 2, `platform_error_code` null.
2. the same wrong line on digital `extracted`, digital `partial` with
   `extraction_failed`, digital `failed` with `extraction_failed`: flagged in
   each, status and error_code stored exactly as sent, 202 with the sent status.
3. scan whose line sum misses: stored `failed` / `reconciliation_failed` /
   `line_sum_missed` with no lines, exactly as before, and the count 1 survives
   on the draft.
4. control: every line consistent, one of them inside the rounding tolerance
   (1000 x 1.23 against 1234.50, difference 4.50 under 5.00): all `passed`, count 0.
5. a line with no unit price: `not_run`, null difference, count null.

A scan with status `failed` cannot carry lines at all (EXT-20, a 400 before
anything is computed), so on that shape there is nothing to check; this is
stated rather than tested.

Local, on the owner machine, each exit 0: `npx tsc --noEmit`, `npm run build`,
the board validator on all three boards before every commit, `check:card-ids`,
`check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`
(1 file, 10 statements, no DROP TABLE, TRUNCATE or DELETE), `check:conflict-residue`,
`check:categories`, `check:ledger-rows`, `check:no-prod-target`,
`check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`,
`check:board-clock`, `check:reconciliation`, `check:numeric-field`.
`check:board-edit` refused while the card was `in_flight`, which is its job, and
passes after the shipped flip. `npx playwright test --list` finds the five cases.

**Left for CI** (no Docker and no Supabase CLI on this machine): the Playwright
suite including the new spec, `check:migrations` with the new assertion file,
`prove:applier` and `prove:assertions`.

## 6. Learnings

Nothing broke while working this card, so `docs/LEARNINGS.md` is unchanged.

## 7. Things noticed and not done

- The unit price column is `numeric(14,2)`, so a price sent as 1.2345 is stored
  1.23. The check reads the payload value, which is what the sender said; a
  person recomputing from the stored columns can see a slightly different
  difference on such a line.
- A quantity printed rounded (for example 12.345 printed 12.35) is not covered
  by the tolerance, only a rounded price is. Such a line would be flagged. It is
  a note, not a refusal, so the cost is a false note.
- The review screen does not show the flag. That is its own card if wanted.

## 8. Anything left for the owner

The pull request carries a migration (0052, three new empty columns, no row
touched). Merging it changes the live database within about two minutes. Per the
task, the merge is left to the auto-merge script; this session does not merge.
