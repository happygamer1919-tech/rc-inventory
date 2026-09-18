# Executor report, 2026-09-18: P3-80, Ivan's finding F6

Role: AUTHOR (card P3-80 written on the phase 3 board), then EXECUTOR, in one pull
request on branch `card/p3-80`. Id allocated with `npm run id:free -- P3-80`
(FREE, lane highest P3-79, zero open pull requests).

## 1. What changes for Rapid Construct, in plain words

When the document reader says it had to work out a line's total itself instead of
reading it off the paper, the order is no longer shown as read cleanly. It is
marked "Parțial" on the review screen, every line is still there, and one
sentence on the document row says why: that line's total was calculated, so
compare it with the paper. Nothing is refused, nothing is deleted, and documents
whose totals were all printed behave exactly as before.

## 2. The finding, read cold from the code

F6, quoted exactly: "F6 `line_total_source` = derived routes the document to
partial by itself, in our reconciliation."

Card EXT-34 (PR #334, migration 0053) stores `line_total_source` on every line
and, by its own defaults, interprets nothing. The counterparty's extractor, from
prompt version 2026-09-15b, fails a document on his side for one `derived` line
whatever the arithmetic says (decisions/inbox.md, the R-185 amendment, part g).
On our side a digital or scan payload marked `extracted` with a derived line was
stored `extracted` and shown as "De verificat", exactly like a document read
cleanly.

`reconcile()` never looks at a line's provenance: a derived total agrees with
the arithmetic by construction, so no sum check can catch it.

## 3. The fix

- **`derivedLineRoute`**, a new pure function at the end of
  `lib/data/reconciliation.ts`. It counts the lines whose total source is exactly
  `derived` and says `routeToPartial` exactly when the status our route would
  store is `extracted`, the sender supplied no `error_code`, and the count is
  above zero. `classifyScan`, `reconcile`, `headerConsistency` and the P3-75
  functions are byte-identical.
- **In the callback route** it runs AFTER `effectiveStatus`, `effectiveErrorCode`
  and `dropLines` are decided and feeds none of them. The only thing it can do is
  store `partial` instead of `extracted`. `error_code` stays null (partial with
  no code is legal since P3-29a, and no code is invented on the sender's field),
  every line is kept, a `failed` from our own reconciliation stays `failed`, and
  a payload carrying its own `error_code` is never touched (R-190).
- **Recorded, not only applied.** New column
  `extraction_drafts.platform_derived_partial boolean`, nullable, no default:
  `true` when this rule moved the status, `false` when it ran and did not, NULL
  when it did not run (every row before 0054).
- **Gated.** `hasExtractionDerivedPartial` in `lib/data/schema-capability.ts`
  probes the column on the service-role client. Until 0054 is applied the route
  writes exactly what it writes today AND the rule moves nothing: a status moved
  with no record of the move would be a substitution nobody can see.
- **Review screen.** `listReviewDrafts` selects the column behind the same probe;
  `ExtractionReviewPanel` shows `DERIVED_PARTIAL_NOTICE` on the document row when
  it is `true`: "Marcat parțial de platformă: totalul cel puțin unei poziții a
  fost calculat la citire, nu tipărit pe document. Comparați acea poziție cu
  hârtia." The per-line "Totalul liniei: calculat" label EXT-34 added already
  shows which line.

## 4. Decisions, and why

(a) **Scope: every source, scan and digital.** F6 names no source; the
counterparty's rule fails any derived line. The same amendment's doctrine
pattern (h) is about a control filed under the scanned-document heading only,
which is the reason not to narrow this one.

(b) **Only the exact string `derived` counts**, after the trim every stored
string gets. `Derived` or `estimated` is stored as sent and moves nothing: EXT-34
stores the field uninterpreted and a guess about an unknown value is a rule
nobody made. Case 2 of the spec proves `Derived` does not move a document.

(c) **Not `platform_arm`, and a migration after all.** The task expected no
migration and asked to record the verdict in `platform_error_code` /
`platform_arm`. Reading `0037_extraction_platform_verdict.sql` showed a check
constraint `extraction_drafts_platform_arm_known` listing exactly the six EXT-23
arms, with a header saying a seventh arm costs a migration deliberately. Writing
a seventh value without one returns 23514, the callback answers 500, and Make
retries (INC-05). Widening that constraint would still need a migration, could
not be probed by the select-based capability gates, and would put a
non-classifyScan verdict into a column whose comment defines it as "which arm of
the EXT-23 split". So the verdict got its own additive column, the shape P3-75
used for its separate check. This is the reason the pull request carries a
migration; it adds one nullable column and touches no row.

(d) **HTTP codes unchanged.** The code is chosen from `isRepeat` only: 202 on
the first callback, 200 on a repeat, both proven by case 1. The response BODY
reports the stored status, as the route already does for EXT-16 ("what was
written, not what arrived"), so a moved payload's body says `partial`. That is
not a change to what the route accepts or refuses. No `IVAN:` question was
needed: the task's stop condition was a change to what the response reports as
accepted, and every payload is still accepted with the same code.

(e) **Andre was not told.** Nothing he sends is refused that was accepted
before. The one visible difference to him is the body's `status` field reading
`partial` for a payload he sent as `extracted` with a derived line, which is his
own rule mirrored. This factory has no channel to him.

## 5. Tests

- **New** `tests/e2e/extraction-derived-line-routes-partial.spec.ts`:
  1. digital and scan, `extracted`, no code, one derived line: 202, body
     `partial`, stored `partial`, `error_code` null, both lines kept,
     `platform_derived_partial` true, the Romanian sentence on the row; a second
     callback answers 200 and stays `partial`;
  2. all `printed` (digital and scan), source absent, and the unknown value
     `Derived`: 202, `extracted` as before, flag false, no sentence on screen;
  3. `partial` with a code (digital and scan) and `failed` with a code (digital),
     each with a derived line: status and code exactly as sent, flag false;
  4. a scan whose line sum misses the subtotal, with a derived line: still
     `failed` / `reconciliation_failed` / `line_sum_missed` with lines dropped,
     flag false.
- **Changed** `tests/e2e/extraction.spec.ts` case 35. It asserted, under EXT-34's
  stored-not-interpreted scope, that a derived line does not move the status.
  This card changes that behaviour on purpose, so it now asserts `partial` and
  `error_code` null, and the old expectation is quoted in its comment. HTTP code
  still 202.
- **Assertions** `scripts/poc-free/local-db/assertions/0054_extraction_derived_partial.sql`:
  the column is boolean, nullable, no default; `true` and `false` write and read
  back; a draft written without it stays NULL.

## 6. Commands run on this machine, each exit 0

`npx tsc --noEmit`, `npm run build`, the board validator on all three boards
before every commit, `check:card-ids`, `check:unique-ids`,
`check:open-branch-ids`, `check:no-destructive-migration` (1 file, 5 statements,
no DROP TABLE, TRUNCATE or DELETE), `check:conflict-residue`, `check:categories`,
`check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`,
`check:removal-safety`, `check:assertion-register`, `check:reconciliation`,
`check:callback-keys`, `check:numeric-field`, `check:board-clock`.
`check:board-edit` is run after the shipped flip.

**Left for CI** (no Docker and no Supabase CLI here): the Playwright suite
including the new spec and case 35, `check:migrations` with the 0054 assertion
file, `prove:applier` and `prove:assertions`. The result is on the pull request's
`quality` run for the head sha.

## 7. What broke while working, in LEARNINGS

Two entries added to `docs/LEARNINGS.md`: `check:pending-schema-reads` refusing
a pure file for a column name written in a comment, and the brief's assumption
that `platform_arm` accepts any value.

## 8. Merge

Not performed by this session. Real client data is in production, so no pull
request self-merges, and this one carries migration
`supabase/migrations/0054_extraction_derived_partial.sql`. When `quality` is
green on the head sha, an `OWNER:` mailbox question in the factory asks Max to
approve the merge.
