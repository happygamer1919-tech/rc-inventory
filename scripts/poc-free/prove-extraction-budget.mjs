#!/usr/bin/env node
// prove-extraction-budget.mjs
// Card EXT-12. The named unit case for the extraction latency budget.
//
// AND WHY IT IMPORTS A .mjs. `quality` runs node 20, which cannot strip type
// annotations: importing a .ts from here fails with ERR_UNKNOWN_FILE_EXTENSION,
// and it did, on this card's first CI run. It works locally on node 22 and not on
// the runner, which is the whole reason the budget lives in plain JavaScript with
// its types beside it, exactly as EXT-08 decided for document-url-contract.mjs.
//
// WHY A prove-* SCRIPT AND NOT A UNIT TEST FRAMEWORK. This repository has no
// vitest, no jest and no unit runner at all: `npm run test:e2e` is Playwright and
// nothing else. Every other unit-shaped assertion here is a `prove-*.mjs` wired
// into `quality` by name, which is what the card means by "a named unit case".
// Adding a second test framework for three assertions would be a dependency
// nobody asked for, and CLAUDE.md forbids taking one without asking.
//
// WHAT IT ASSERTS, which is exactly the card's clause:
//
//   a document ABOVE the threshold gets the LONGER budget
//   a document BELOW the threshold gets the SHORTER budget
//
// PLUS the case the card decided in advance: an UNKNOWN line count gets the
// LONGER budget, because the count does not exist at fire time and the defaults
// say the longer budget then applies to every document.
//
// AND the boundary, because "above 20" and "20 or more" are different rules and
// only one of them is the owner's.

import {
  ACK_TIMEOUT_MS,
  EXTRACTION_BUDGET_ABOVE_MS,
  EXTRACTION_BUDGET_BELOW_MS,
  EXTRACTION_LINE_THRESHOLD,
  extractionBudgetMs,
} from "../../lib/data/extraction-budget.mjs";

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass && detail) console.log(`      ${detail}`);
};

console.log("1. THE OWNER'S NUMBERS, NAMED ONCE");
record("the threshold is 20 lines", EXTRACTION_LINE_THRESHOLD === 20, String(EXTRACTION_LINE_THRESHOLD));
record("the budget above it is 120 seconds", EXTRACTION_BUDGET_ABOVE_MS === 120_000, String(EXTRACTION_BUDGET_ABOVE_MS));
record("the budget below it is 60 seconds", EXTRACTION_BUDGET_BELOW_MS === 60_000, String(EXTRACTION_BUDGET_BELOW_MS));

console.log("\n2. A DOCUMENT ABOVE THE THRESHOLD GETS THE LONGER BUDGET");
record("21 lines gets 120 seconds", extractionBudgetMs(21) === EXTRACTION_BUDGET_ABOVE_MS, String(extractionBudgetMs(21)));
record("200 lines gets 120 seconds", extractionBudgetMs(200) === EXTRACTION_BUDGET_ABOVE_MS, String(extractionBudgetMs(200)));

console.log("\n3. A DOCUMENT BELOW THE THRESHOLD GETS THE SHORTER BUDGET");
record("19 lines gets 60 seconds", extractionBudgetMs(19) === EXTRACTION_BUDGET_BELOW_MS, String(extractionBudgetMs(19)));
record("1 line gets 60 seconds", extractionBudgetMs(1) === EXTRACTION_BUDGET_BELOW_MS, String(extractionBudgetMs(1)));
record("0 lines gets 60 seconds", extractionBudgetMs(0) === EXTRACTION_BUDGET_BELOW_MS, String(extractionBudgetMs(0)));

console.log("\n4. THE BOUNDARY, BECAUSE 'ABOVE 20' AND '20 OR MORE' ARE DIFFERENT RULES");
record(
  "exactly 20 lines gets the SHORTER budget, because the rule is ABOVE 20",
  extractionBudgetMs(20) === EXTRACTION_BUDGET_BELOW_MS,
  String(extractionBudgetMs(20)),
);

console.log("\n5. AN UNKNOWN LINE COUNT GETS THE LONGER BUDGET");
// The card decided this in advance: "if the count is not knowable at fire time,
// the longer budget applies to every document". It is not knowable at fire time,
// so this is the case that actually runs in production.
record("null gets 120 seconds", extractionBudgetMs(null) === EXTRACTION_BUDGET_ABOVE_MS, String(extractionBudgetMs(null)));
record("NaN gets 120 seconds rather than falling through to the short one",
  extractionBudgetMs(Number.NaN) === EXTRACTION_BUDGET_ABOVE_MS, String(extractionBudgetMs(Number.NaN)));

console.log("\n6. THE ACK CLOCK IS A DIFFERENT NUMBER AND STAYS SHORT");
// If these ever became equal, somebody would have raised the operator's screen
// wait to two minutes, which the card's own note forbids in terms.
record("the ack timeout is 15 seconds", ACK_TIMEOUT_MS === 15_000, String(ACK_TIMEOUT_MS));
record(
  "and it is NOT the extraction budget",
  ACK_TIMEOUT_MS !== EXTRACTION_BUDGET_ABOVE_MS && ACK_TIMEOUT_MS !== EXTRACTION_BUDGET_BELOW_MS,
  `${ACK_TIMEOUT_MS}`,
);

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} of ${results.length} assertions passed`);
if (failed > 0) process.exit(1);
