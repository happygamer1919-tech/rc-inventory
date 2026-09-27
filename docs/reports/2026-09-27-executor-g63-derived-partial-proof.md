# Card P3-106. Is the derived-partial gate really unproven? Goal G63, Ivan's finding F27

Role AUTHOR, then EXECUTOR, one pull request, branch `card/p3-106`, cut from
`origin/main` at `9b109f6`. Date 2026-09-27.

## In plain words, for the owner

The platform has a rule: if the machine that reads a supplier document says the
document was read completely, but it CALCULATED the total of at least one line
instead of reading it off the paper, the platform does not trust that line and
puts the document in "Parțial" for a human to check. Ivan's finding F27 says this
rule is unproven.

**It is proven in the test suite, and it has never once run on a real document.**
Those are two different statements and F27 is only true about the second. The test
suite has proved the rule on every shape since 2026-09-18. What has not happened
is Andre sending a real document that triggers it, so nobody has watched it work
in production. That waits on Andre, not on us.

This card therefore did NOT write the test G63 asked for, because writing it a
second time would have been a duplicate. It added the one case that was genuinely
missing, added a no-database proof of the rule itself, and wrote down for Ivan and
for Max exactly what a production proof needs and how it will be visible.

## STEP 0. The finding, settled

**G63 asked for: "a fixture where the sender declares `extracted` with at least
one line whose `line_total_source` is derived, and a named e2e test that our gate
moves it to partial and sets `platform_derived_partial = true`."**

**That test already existed on `9b109f6`, and it is the acceptance line of card
P3-80 (Ivan's finding F6, shipped 2026-09-18, pull request #335).** File
`tests/e2e/extraction-derived-line-routes-partial.spec.ts`. Named by case, at the
line numbers this branch's head carries:

| Case | Line | What it asserts |
|---|---|---|
| 1 | 164 | A DIGITAL payload and a SCAN payload, `status: "extracted"`, `error_code: null`, header sound, line sum matching exactly, one of two lines carrying `line_total_source: "derived"`. Stored `partial` (line 189), `error_code` still null (188), **`platform_derived_partial` true (190)**, both lines kept (193), the derived line still reads `derived` (194), the Romanian sentence on that document's row on the review screen (199). |
| 2 | 208 | The control. Every line `printed`, the key absent altogether, and the unknown value `Derived`: stored `extracted` exactly as before, flag false (235), no sentence on screen. |
| 3 | 244 | R-190. A payload carrying its OWN `error_code` is untouched even with a derived line: status and code exactly as sent, flag false (266). |
| 4 | 273 | One of OUR OWN `failed` verdicts is not softened into partial by a derived line: still `failed`, `reconciliation_failed`, arm `line_sum_missed`, flag false (294). |

**The run, and no case was skipped.** `quality` run **35380235203** on P3-80's head
sha `54a99b4f4ecb33abbb780e6e09bbe38989daa39d` (pull request #335), step **End to
end**, at 2026-09-18T18:41:43Z to 18:42:05Z:

```
✓  108 [chromium] › extraction-derived-line-routes-partial.spec.ts:139:7 › 1. F6: DIGITAL si SCANARE ... (6.9s)
✓  109 [chromium] › extraction-derived-line-routes-partial.spec.ts:183:7 › 2. CONTROLUL ...            (9.8s)
✓  110 [chromium] › extraction-derived-line-routes-partial.spec.ts:219:7 › 3. R-190 ...                (8.4s)
✓  111 [chromium] › extraction-derived-line-routes-partial.spec.ts:248:7 › 4. un failed ...            (3.9s)
```

(The line numbers in that log are the ones the file carried on 2026-09-18, before
this card appended case 5.)

**VERDICT: F27's word "unproven" is true about PRODUCTION and false about the
suite.** No second copy of that spec was written. `ls tests/e2e/` carries exactly
one file covering this acceptance line, and it is the P3-80 file, extended. A
duplicated acceptance spec is the defect F14 and goal G56 existed to clean up:
two files drift, and then neither is the truth.

**The spec was not run on this machine.** It cannot be: there is no Docker and no
Supabase CLI here, so the Playwright suite runs only in CI. What was run here is
recorded under "Commands run" below. The proof that the four cases pass is the CI
run quoted above, plus this card's own run on this branch's head sha.

## What was genuinely missing, and what was added

The card named three candidates. Each was checked against the existing spec
before anything was written.

### 1. The mixed payload: ADDED, as case 5, line 308

**Why it was genuinely missing.** The rule is **at least one** derived line, and
case 1 proves it on a document of exactly TWO lines, where "at least one of them"
and "one of two" look identical. An implementation that read only the first and
last line, or that required EVERY line to be derived, would pass case 1 on the
two-line fixture and be wrong.

Case 5 sends five lines, only the fourth `derived` and the other four `printed`,
neither first nor last. `status: "extracted"`, no sender code, printed subtotal
127.50 equal to the exact sum of the five lines, so our reconciliation passes and
has nothing to say about the status. It asserts 202, a body of
`{status: "partial", lines: 5}`, stored `partial`, `error_code` null,
`platform_derived_partial` **true**, all five lines kept, the source array read
back as exactly `["printed","printed","printed","derived","printed"]`, and the
Romanian sentence on the row.

It was added **to the P3-80 file**, not to a file of its own, and the file's
header says so in terms. The helper `body()` now takes a `Source[]` rather than a
fixed pair, and the first two entries of `LINE_SHAPES` are the same numbers cases
1 to 4 always used (3 x 10 = 30 and 2 x 25 = 50, summing to 80), so those four
cases send byte-identical payloads to the ones run 35380235203 proved. Case 4
still passes its printed subtotal of 100 against a line sum of 80 on purpose.

### 2. The HTTP code: ALREADY COVERED, nothing added

Case 1 asserts it by value, twice, in the shape the card asked for: **202 on the
first arrival** (line 180) with a body naming `partial` (181 to 185), and **200 on
the repeat** (line 203) with the same body. Cases 2, 3 and 4 assert 202 by value
as well. Nothing was added, because a second assertion of the same value in the
same file is noise, not coverage. Case 5 asserts the 202 and the body for its own
five-line payload and deliberately does not repeat the duplicate-arrival check.

### 3. The unwritable-column branch: CANNOT BE EXERCISED IN CI. A source guard was added instead, and it is labelled as the weaker thing it is

**The branch.** In `app/api/extraction/callback/route.ts`:
`const routedToPartial = canRecordDerivedPartial && derivedRoute.routeToPartial;`
When the 0054 column is absent the gate deliberately does NOT move the document,
in the route's own words, because "o substitutie nescrisa este exact ce interzice
R-190": with nowhere to record that the sender said `extracted` and we stored
`partial`, the substitution would be invisible.

**THE ONE-LINE LIMIT: that branch cannot be exercised by any test in CI.**
Migration 0054 has merged, so `extraction_drafts.platform_derived_partial` exists
in every CI stack, `hasExtractionDerivedPartial` answers true on every one of
them, and `routedToPartial` is computed inline in the route rather than behind an
injectable function, so nothing can make the guard answer false. Faking it would
mean editing the route to accept an override, which is a change to production
behaviour to satisfy a test, and this card does not make one.

**What CAN be proven, and was.** `scripts/poc-free/check-reconciliation.mjs` gains
section 11, which reads the implementation's own source and asserts that the guard
is still written (`canRecordDerivedPartial && derivedRoute.routeToPartial`), that
the column is written under the very same condition and never behind it, and that
the gate still sits after `effectiveStatus` and before `storedStatus` so it feeds
neither. **That is a guard against the branch being deleted. It is not a proof of
the runtime behaviour when the column is absent**, and section 11's own comment
says so in those words.

Section 11 also adds the thing the repository had no no-database proof of at all:
**the predicate itself**, as a specification table of eleven shapes, in the style
sections 1 and 10 of that file already use and for the reason they already give
(the end-to-end spec proves the rule is WIRED IN and needs a database; this proves
the RULE IS RIGHT and needs nothing; they fail for different reasons). The eleven
shapes include a one-line document whose only total was calculated, every line
calculated (the count is a floor, not an equality), zero lines, the unknown value
`Derived`, the sender's own code winning under R-190, and one of our own `failed`
verdicts not being softened. It runs in `quality` already, unfiltered, at the step
"Check the reconciliation tolerance": no new workflow step was added.

## FOR IVAN: what is proven, what is not, and how you will see it happen

**What the suite proves today.** `tests/e2e/extraction-derived-line-routes-partial.spec.ts`,
five cases (lines 164, 208, 244, 273, 308), green in CI since run 35380235203 on
2026-09-18 and again on this card's run. A payload the reader calls `extracted`,
with no `error_code` of its own, carrying at least one line whose
`line_total_source` is `derived`, is stored `partial` with
`platform_derived_partial = true`, on digital and on scan, with every line kept
and no code invented, and the Romanian reason on the review row. Nothing else
moves: your own `error_code` is authoritative (R-190) and our own `failed` stays
failed. Plus, from this card, `npm run check:reconciliation` section 11, which
proves the predicate with no database at all.

**What is NOT proven, and this is F27's real content.** **The gate has never run
on a real document.** Lumicast, order `d6feecef`, was `partial` because the SENDER
said `partial`, so our gate was never asked. A production proof needs Andre to
send a document whose reader reports `status: "extracted"` with at least one line
carrying `line_total_source: "derived"`. As far as the stored column can say, that
has not happened yet. No terminal here can make it happen, and no terminal here
reads production to check: this machine has no production credentials and may not
fetch any.

**How it will be visible the moment it does happen.** Three places, in order of
how early you see it:

1. **The stored column flips.** `extraction_drafts.platform_derived_partial` goes
   from `false` to `true` on that document's draft row, and `status` reads
   `partial` while the payload Andre sent said `extracted`. Those two together are
   the whole signature: the sender said one thing and we stored another, recorded.
2. **The review screen says why, in Romanian.** On the document's row in the
   review queue (`/incarca-comanda`, component
   `components/orders/ExtractionReviewPanel.tsx`, test id
   `draft-derived-partial`), one sentence appears under the row:
   *"Marcat parțial de platformă: totalul cel puțin unei poziții a fost calculat
   la citire, nu tipărit pe document. Comparați acea poziție cu hârtia."*
   The exact position is labelled underneath it, by "Totalul liniei: calculat".
   The string lives once, in `lib/data/extraction-types.ts` as
   `DERIVED_PARTIAL_NOTICE`, so the screen and the proof cannot drift.
3. **Max can ask the database himself**, without a terminal and without asking
   anybody: `scripts/poc-free/count-derived-partial-drafts.sql`. One read-only
   SELECT, run by hand in the Supabase SQL editor of project RC_inventory,
   returning how many drafts the platform has ever marked partial by itself,
   split into the rows our own test fixtures wrote (supplier name prefixed `TEST`)
   and the rows a real document wrote, plus the first and last time it happened.
   `total` is expected to stay 0 until Andre sends such a document. A number in
   `from_real_documents` is the production proof F27 asks for, and it names the
   row worth opening on screen. **No terminal runs that file, ever.** It is
   committed as a question Max can ask, not as a script anything executes here.

**Nothing on the wire changed.** No route file was edited for behaviour. What the
callback route accepts, refuses or returns to Andre is byte-identical: no status
code moved, no error text changed, no payload shape is newly accepted or newly
refused. Andre was not told, because there is nothing to tell him.

## What did NOT change, and the proof of it

`git diff --name-only origin/main...HEAD` carries **no file under
`supabase/migrations/`**, and **no change to `lib/data/reconciliation.ts` or
`app/api/extraction/callback/route.ts`**. The gate was not found broken, so the
gate's rule, the route's ordering and the set of payloads it may move are all
untouched. Migration 0054 already added the column; this card adds none.

No existing assertion was weakened, skipped or deleted. Cases 1 to 4 of the spec
are unchanged in what they assert, and the payloads they send are numerically
identical to the ones that passed in run 35380235203.

## Files changed

| File | What |
|---|---|
| `tests/e2e/extraction-derived-line-routes-partial.spec.ts` | Case 5 appended (five lines, only the fourth derived). `body()` takes a `Source[]`; `LINE_SHAPES` keeps cases 1 to 4 numerically identical. Header note recording that P3-106 added to this file rather than copying it. |
| `scripts/poc-free/check-reconciliation.mjs` | Section 11: the gate's predicate as an eleven-shape specification, plus source guards on the unwritable-column branch and on the gate's position between `effectiveStatus` and `storedStatus`. |
| `scripts/poc-free/count-derived-partial-drafts.sql` | NEW. One read-only SELECT for Max, by hand, in the Supabase SQL editor. No terminal runs it. |
| `docs/board/rc-board-phase3.json` | Card P3-106, authored and shipped in this pull request. |
| `docs/LEARNINGS.md` | One entry: a card whose brief asks for a test that already exists. |
| `docs/reports/2026-09-27-executor-g63-derived-partial-proof.md` | This report. |

## Commands run, on this machine, each exit 0

`npx tsc --noEmit`, `npm run build`, the board validator on all three boards
before every commit, `npm run check:reconciliation` (section 11 included, 17 new
ok lines), `check:card-ids`, `check:board-edit`, `check:unique-ids`,
`check:open-branch-ids`, `check:no-destructive-migration`,
`check:conflict-residue` (after `git add`, per the learning about new files being
invisible to it), `check:categories`, `check:ledger-rows`, `check:no-prod-target`,
`check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`,
`check:callback-keys`, `check:numeric-field`, `check:board-clock`.

**Run only in CI, and not skipped silently:** the Playwright suite (`npm run
test:e2e`), `check:migrations`, `prove:applier`, `prove:assertions`. This machine
has no Docker and no Supabase CLI.

## Judged against G63, clause by clause

| G63 asked | Delivered |
|---|---|
| A fixture where the sender declares `extracted` with at least one derived line | Existed already: case 1, line 164. Extended by case 5, line 308, to five lines with one derived. |
| A named e2e test that our gate moves it to partial and sets `platform_derived_partial = true` | Existed already: the same file, asserted at lines 189 and 190, green in run 35380235203. Named on card P3-80's acceptance and now on P3-106's. |
| If the test shows the gate does NOT fire, fix it in the same pull request | The gate fires. Nothing was fixed, because nothing was broken, and the report says so rather than claiming a repair. |
| A production proof needs Andre to send such a document; the report says so as a note for Ivan | The section "FOR IVAN" above, plus the read-only SQL Max can run himself. |

Role EXECUTOR. Card P3-106.
