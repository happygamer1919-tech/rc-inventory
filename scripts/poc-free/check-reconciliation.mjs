#!/usr/bin/env node
// check-reconciliation.mjs
// Card EXT-16. The tolerance arithmetic, checked on its own, with no database,
// no server and no browser.
//
// WHY A SEPARATE CHECK AND NOT ONLY THE END-TO-END CASES. The suite proves the
// RULE IS WIRED IN; this proves the ARITHMETIC IS RIGHT. They fail for different
// reasons and a card that only had the first would pass with a tolerance off by
// an order of magnitude, because every end-to-end fixture misses by thousands.
//
// ANDRE'S THREE FIXTURE VALUES ARE HERE BY NAME, from the card's acceptance:
// a 7-line document tolerates 0.07, a 54-line document tolerates 0.54, and a
// 3-line document tolerates 0.05 BECAUSE THE FLOOR WINS. The third is the one
// worth having: it is the only one where max() does anything.
//
// THE MATNORD RESULT IS COMMITTED AS OBSERVED AND NOT ROUNDED. Runs of one
// 7-line page with a printed total of 50336.40 excluding VAT returned 49035.40,
// 39242.00 and 38429.40, every one of them with status extracted and reason null.
//
// A FOURTH SUM WAS ADDED ON 2026-09-04 AND IT IS OBSERVED, NOT INVENTED. Andre's
// fourth run came in 2276.00 short of the printed total, which is 48060.40. The
// sentence this file used to carry, "there is no fourth invented sum", was about
// FABRICATING one to make the set look tidier, and it still binds. A run that
// actually happened is evidence; a number chosen to round the set out is not.
//
// FIVE DISTINCT NUMBERS NOW SIT ON ONE UNCHANGED FILE: the printed 50336.40 and
// four model readings of it, none equal to another.
//
// AMENDED 2026-09-09 BY RULING R-185, AND THE ORIGINAL CLAUSE IS KEPT BELOW
// RATHER THAN DELETED, per CLAUDE.md section 9c. The spread was read as evidence
// that the READING moves. It is not. Andre measured the same document at the
// LINE level across four passes: ONE UNIT PRICE MOVES, THREE LINES ARE
// BYTE-IDENTICAL AND CORRECT EVERY PASS, AND ONE IS BYTE-IDENTICAL AND WRONG
// EVERY PASS. One walking field produces four distinct totals. The failure is a
// DETERMINISTIC MISREAD, not variance, and multi-pass comparison and majority
// voting are ruled out permanently by R-185: a vote agrees with itself on a
// deterministically wrong line and reports it as unanimous.
//
// The superseded clause, kept verbatim:
//
//   "spread across 10606.00 against a tolerance of 0.07."
//
// THE ASSERTIONS BELOW ARE NOT AMENDED AND MUST NOT BE. The spread is a true
// measurement and section 4 asserting it is correct. Only the inference drawn
// from it was wrong.

import { readFileSync } from 'node:fs';

const ROOT = new URL('../..', import.meta.url).pathname;

// The implementation is TypeScript and this check is not compiled, so the two
// expressions are kept in step by ASSERTION rather than by import: the formula
// is read out of the source and compared, character by character, against what
// this file computes. A drift between them fails here.
const SOURCE = readFileSync(`${ROOT}/lib/data/reconciliation.ts`, 'utf8');

const problems = [];
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => { problems.push(m); console.log(`  FAIL  ${m}`); };

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const toleranceFor = (lineCount) => round2(Math.max(0.05, 0.01 * lineCount));

console.log('\n1. the tolerance is ONE named expression, read from one place');
if (/export function toleranceFor\(/.test(SOURCE)) ok('toleranceFor is exported from lib/data/reconciliation.ts');
else bad('toleranceFor is not exported from lib/data/reconciliation.ts');
if (/Math\.max\(0\.05,\s*0\.01 \* lineCount\)/.test(SOURCE)) ok("the formula in the source is Andre's, verbatim");
else bad("the source does not carry max(0.05, 0.01 * lineCount) verbatim");
{
  // THE COUPLING IS BY SOURCE TEXT AND ITS LIMIT IS STATED. This check is not
  // compiled, so it cannot import the TypeScript implementation, and its own
  // arithmetic is therefore a SPECIFICATION rather than a call into the thing
  // that ships. Text assertions are what tie the two together, so they have to
  // cover BEHAVIOUR and not only the formula: a mutant that keeps the formula
  // string and flips the comparison would otherwise pass here. The end-to-end
  // cases exercise the real implementation; these pin the parts a passing suite
  // could still get wrong.
  const shape = [
    [/Math\.abs\(sum - target\) <= tolerance/, 'the comparison is <= tolerance, inclusive at the boundary'],
    [/round2\(raw\)/, 'the target is rounded before the comparison'],
    [/reduce\(\(a, b\) => a \+ b, 0\)/, 'the line sum is a plain total with nothing dropped'],
    [/input\.pricesIncludeVat === false/, 'prices_include_vat false selects the subtotal'],
    [/input\.pricesIncludeVat === true/, 'prices_include_vat true selects the document total'],
    // MATCHED ON THE RETURN, NOT ON THE TYPE. The first version of these two
    // matched `reason: "target_missing"` anywhere, and the union at the top of
    // the file contains exactly that string, so a mutant that turned the refusal
    // into `ok: true` still passed. Caught by running that mutant.
    [/return \{ ok: false, reason: "target_missing" \}/, 'a missing target REJECTS rather than passing'],
    [/return \{ ok: false, reason: "line_total_missing" \}/, 'a null line_total REJECTS rather than passing'],
  ];
  for (const [re, what] of shape) {
    if (re.test(SOURCE)) ok(what);
    else bad(`the implementation no longer shows: ${what}`);
  }
}

{
  // One place, not two: no other file may compute it.
  const others = ['app/api/extraction/callback/route.ts', 'lib/data/extraction.ts'];
  let dup = 0;
  for (const f of others) {
    let src = '';
    try { src = readFileSync(`${ROOT}/${f}`, 'utf8'); } catch { continue; }
    if (/0\.01\s*\*/.test(src) && /0\.05/.test(src)) dup += 1;
  }
  if (dup === 0) ok('no second file computes a tolerance of its own');
  else bad(`${dup} other file(s) compute a tolerance, and two answers to one question is the defect`);
}

console.log("\n2. Andre's three fixture values");
for (const [lines, want, note] of [[7, 0.07, ''], [54, 0.54, ''], [3, 0.05, ' (the floor wins)']]) {
  const got = toleranceFor(lines);
  if (got === want) ok(`${String(lines).padStart(2)} lines -> ${got.toFixed(2)}${note}`);
  else bad(`${lines} lines -> ${got}, expected ${want}`);
}
{
  // The floor is only meaningful if it actually binds below 5 lines and stops
  // binding at 5. A tolerance of max(0.05, ...) with the floor never reached
  // would pass every case above and mean nothing.
  if (toleranceFor(5) === 0.05 && toleranceFor(6) === 0.06) ok('the floor binds below 5 lines and releases at 6');
  else bad(`the floor boundary is wrong: 5 -> ${toleranceFor(5)}, 6 -> ${toleranceFor(6)}`);
}

console.log('\n3. rounding happens BEFORE the comparison, on both sides');
if (/round2\(/.test(SOURCE) && /Math\.round\(\(n \+ Number\.EPSILON\) \* 100\) \/ 100/.test(SOURCE)) {
  ok('round2 is defined once and used by the comparison');
} else {
  bad('round2 is missing or is not the two-decimal form');
}
{
  // A CASE WHERE THE ORDERING ACTUALLY DECIDES THE ANSWER, because an assertion
  // that passes under both orderings proves nothing about which one is coded.
  //
  // 100.054 against 100.00, tolerance 0.05:
  //   round FIRST  -> |100.05 - 100.00| = 0.05  <= 0.05   ACCEPTED
  //   do not round -> |100.054 - 100.00| = 0.054 > 0.05   REFUSED
  //
  // The contract says both sides are rounded to two decimals BEFORE comparing,
  // so the accepted answer is the correct one, and this document must pass.
  const sum = 100.054, target = 100.0, tol = 0.05;
  const rounded = Math.abs(round2(sum) - round2(target)) <= tol;
  const unrounded = Math.abs(sum - target) <= tol;
  if (rounded && !unrounded) {
    ok('100.054 against 100.00 is ACCEPTED rounded and REFUSED unrounded, so the ordering is load-bearing here');
  } else {
    bad(`this case no longer discriminates: rounded=${rounded} unrounded=${unrounded}`);
  }
}

console.log('\n4. the Matnord scan, observed and not rounded, three runs of three');
{
  const target = 50336.40, lineCount = 7;
  const tol = toleranceFor(lineCount);
  if (tol !== 0.07) bad(`the Matnord tolerance is ${tol}, expected 0.07`);
  const observed = [49035.40, 48060.40, 39242.00, 38429.40];
  for (const sum of observed) {
    const diff = round2(Math.abs(round2(sum) - round2(target)));
    if (diff <= tol) bad(`sum ${sum.toFixed(2)} passed reconciliation, and every observed run must FAIL`);
    else ok(`sum ${sum.toFixed(2).padStart(9)} misses by ${diff.toFixed(2).padStart(9)}, over the ${tol.toFixed(2)} tolerance`);
  }
  const spread = round2(Math.max(...observed) - Math.min(...observed));
  if (spread > tol * 1000) ok(`the three runs disagree with EACH OTHER by ${spread.toFixed(2)}, on one unchanged page`);
  else bad(`the observed spread is ${spread}, which is not the result this fixture records`);
  if (observed.length === 4) ok('four observed sums, every one of them a run that happened');
  else bad(`${observed.length} sums, and only OBSERVED runs may be added`);
  if (new Set(observed).size === 4) ok('the four readings are DISTINCT from each other');
  else bad('two of the four readings are the same number, which is not the record');
  if (!observed.includes(target)) ok(`and none of them is the printed ${target.toFixed(2)}: five distinct numbers on one file`);
  else bad('a reading equals the printed total, which is not what was observed');
  // THE FOURTH, BY THE ARITHMETIC THE DISPATCH GAVE IT, so a transcription slip
  // in either number fails here rather than being carried forward silently.
  if (round2(target - 2276.00) === 48060.40) ok('the fourth run is the printed total less 2276.00, which is 48060.40');
  else bad(`50336.40 less 2276.00 is ${round2(target - 2276.00)}, not the 48060.40 recorded`);
}

console.log('\n5. a document that DOES reconcile is accepted, so this is not a check that only refuses');
{
  const target = 1000.00, lines = [400.00, 599.97];
  const sum = round2(lines.reduce((a, b) => a + b, 0));
  const tol = toleranceFor(lines.length);
  const diff = round2(Math.abs(sum - round2(target)));
  if (diff <= tol) ok(`sum ${sum.toFixed(2)} against ${target.toFixed(2)} is inside ${tol.toFixed(2)}`);
  else bad(`a document inside the tolerance was refused: ${diff} > ${tol}`);
}

console.log('\n6. EXT-18: the header checks are the SAME expression, extended and not duplicated');
{
  // THE COUPLING IS BY SOURCE TEXT, exactly as section 1's is, and for the same
  // reason: this check is not compiled and cannot import the implementation.
  const shape = [
    [/export function headerConsistency\(/, 'headerConsistency is exported from lib/data/reconciliation.ts'],
    [/const tolerance = toleranceFor\(input\.lineCount\)/, "the header tolerance CALLS toleranceFor rather than restating it"],
    [/round2\(input\.subtotal! \+ input\.vatAmount!\) - round2\(input\.documentTotal!\)/, 'check A is subtotal + vat against document_total, rounded before subtracting'],
    [/round2\(\(input\.subtotal! \* input\.vatRate!\) \/ 100\) - round2\(input\.vatAmount!\)/, 'check B is subtotal * rate against vat_amount, rounded before subtracting'],
    [/diff <= tolerance \? "passed" : "failed"/, 'the comparison is <= tolerance, inclusive, on both checks'],
    [/outcome: "not_run" as HeaderCheckOutcome, diff: null/, 'a missing figure is NOT_RUN and carries no diff'],
    [/sum\.outcome !== "failed" && vat\.outcome !== "failed"/, 'ok is false EXACTLY when one of the two FAILED, so not_run does not reject'],
  ];
  for (const [re, what] of shape) {
    if (re.test(SOURCE)) ok(what);
    else bad(`the header implementation no longer shows: ${what}`);
  }

  // ONE FORMULA, COUNTED. A second Math.max(0.05, ...) anywhere in this file is
  // the duplication the card forbids in terms, and a regex that only asserts the
  // first one would not see it.
  const formulas = (SOURCE.match(/Math\.max\(0\.05,/g) || []).length;
  if (formulas === 1) ok('Math.max(0.05, ...) appears EXACTLY ONCE in the source');
  else bad(`the tolerance formula appears ${formulas} times; the card requires one named expression read from one place`);
}

console.log('\n7. EXT-18: both header checks hold on ALL FOUR sample documents');
{
  // A GUARD THAT HAS ONLY EVER RUN AGAINST DOCUMENTS IT REJECTS HAS NOT BEEN
  // SHOWN TO ACCEPT A CORRECT ONE. These are the four documents Andre was sent,
  // read from the files themselves on 2026-09-04 with `pdftotext -layout`, not
  // transcribed from anybody's summary.
  //
  // THE MATNORD FIGURES ARE THE ONE EXCEPTION AND THE REASON IS THE CARD'S OWN
  // SUBJECT: that file is a scan with NO TEXT LAYER, `pdftotext` returns one
  // byte, so its header comes from the record instead, where 50336.40 has been
  // the printed subtotal since EXT-16.
  const samples = [
    // name, lines, subtotal, vat_amount, document_total, vat_rate
    ['aviz-scan-matnord-0021884', 7, 50336.40, 10067.28, 60403.68, 20],
    ['confirmare-comanda-mpc-8842', 6, 23199.50, 4407.91, 27607.41, 19],
    ['factura-betonmix-4417', 5, 89609.38, 17921.87, 107531.25, 20],
    ['factura-tehnocom-0009312', 54, 1077347.00, 215469.40, 1292816.40, 20],
  ];
  for (const [name, lines, sub, vat, total, rate] of samples) {
    const t = toleranceFor(lines);
    const a = round2(Math.abs(round2(sub + vat) - round2(total)));
    const b = round2(Math.abs(round2((sub * rate) / 100) - round2(vat)));
    if (a <= t) ok(`${name.padEnd(28)} A: sub+vat vs total misses by ${a.toFixed(2)}, inside ${t.toFixed(2)}`);
    else bad(`${name}: sub+vat vs total misses by ${a.toFixed(2)}, over ${t.toFixed(2)}`);
    if (b <= t) ok(`${name.padEnd(28)} B: sub*rate vs vat misses by ${b.toFixed(2)}, inside ${t.toFixed(2)}`);
    else bad(`${name}: sub*rate vs vat misses by ${b.toFixed(2)}, over ${t.toFixed(2)}`);
  }

  // AND THE TOLERANCE IS DOING WORK ON AT LEAST ONE OF THEM. Betonmix's check B
  // misses by a cent, because 89609.38 * 0.20 is 17921.876 and the document
  // prints 17921.87. Four documents that all landed at exactly zero would not
  // show that the tolerance is reachable at all.
  const bx = round2(Math.abs(round2((89609.38 * 20) / 100) - round2(17921.87)));
  if (bx > 0) ok(`Betonmix check B misses by ${bx.toFixed(2)}, so the tolerance is load-bearing here and not decoration`);
  else bad('Betonmix check B now lands at zero, and no sample exercises the tolerance');
}

// ===========================================================================
// EXT-23, SECTION 9. WHICH CODE CARRIES THE REFUSAL, ARM BY ARM.
//
// WHY THIS IS A SPECIFICATION AND NOT A CALL. Same limit as the rest of this
// file and it is stated in the header: the implementation is TypeScript, this
// check is not compiled, so it cannot import classifyScan. The decision table
// below is a SPECIFICATION of what that function must do, and the source-text
// assertions beside it are what tie the two together.
//
// WHAT ACTUALLY PROVES "NO INPUT REACHES THE DEFAULT". Not this file: it is
// `npx tsc --noEmit`, which runs as its own step in `quality`. The default
// branch of classifyScan assigns `verdict` to a `const unreachable: never`, and
// that assignment only compiles while typescript has exhausted the union. Add a
// fourth ReconcileVerdict reason and the build stops. This section asserts the
// guard is STILL THERE, because a guard somebody quietly deleted proves nothing
// and typescript would then be silent.
// ===========================================================================

console.log('\n9. EXT-23: which code carries the refusal, arm by arm');
{
  // The six arms, and the code each one carries. Copied from the ruled split in
  // R-187 plus the two arms the owner classified in EXT-23, NOT from the
  // implementation: a table read out of the thing it checks asserts nothing.
  const ARMS = [
    ['header_inconsistent', 'unreadable_document'],
    ['no_lines', 'unreadable_document'],
    ['line_total_missing', 'unreadable_document'],
    ['target_missing', 'unreadable_document'],
    ['anchor_unknown', 'unreadable_document'],
    ['line_sum_missed', 'reconciliation_failed'],
  ];

  const IMPL = readFileSync(`${ROOT}/lib/data/reconciliation.ts`, 'utf8');

  // 9a. EVERY ARM IN THE TYPE IS PRODUCED, AND EVERY ARM PRODUCED IS IN THE
  //     TYPE. An arm declared and never returned is dead vocabulary; an arm
  //     returned and never declared does not compile, but the set comparison is
  //     what notices the first one.
  const declared = new Set(
    // The trailing `;` is optional: the LAST member of the union carries one and
    // the others do not, and a regex that forgets it reports the last arm as
    // undeclared. It did, on the first run of this section.
    [...IMPL.matchAll(/^\s*\|\s*"([a-z_]+)";?$/gm)].map((m) => m[1]),
  );
  const produced = new Set(
    [...IMPL.matchAll(/arm:\s*"([a-z_]+)"/g)].map((m) => m[1]),
  );
  const want = new Set(ARMS.map(([a]) => a));
  for (const arm of want) {
    if (declared.has(arm)) ok(`arm ${arm.padEnd(20)} is declared in ScanArm`);
    else bad(`arm ${arm} is not declared in ScanArm`);
    if (produced.has(arm)) ok(`arm ${arm.padEnd(20)} is returned by classifyScan`);
    else bad(`arm ${arm} is never returned by classifyScan`);
  }
  for (const arm of produced) {
    if (!want.has(arm)) bad(`classifyScan returns arm ${arm}, which the ruled split does not name`);
  }
  if (produced.size === want.size) ok(`exactly ${want.size} arms, no more`);
  else bad(`classifyScan returns ${produced.size} arms and the ruled split names ${want.size}`);

  // 9b. EACH ARM CARRIES THE CODE THE SPLIT GIVES IT, read off the source as the
  //     pair that appears in one return statement.
  const pairs = [...IMPL.matchAll(/code:\s*"([a-z_]+)",\s*arm:\s*"([a-z_]+)"/g)].map(
    (m) => [m[2], m[1]],
  );
  for (const [arm, code] of ARMS) {
    const found = pairs.filter(([a]) => a === arm).map(([, c]) => c);
    if (found.length === 0) bad(`no return in classifyScan pairs arm ${arm} with a code`);
    else if (found.every((c) => c === code)) ok(`${arm.padEnd(20)} -> ${code}`);
    else bad(`arm ${arm} carries ${found.join(', ')} and the split says ${code}`);
  }

  // 9c. EXACTLY ONE ARM CARRIES reconciliation_failed. This is the whole shape
  //     of the ruling: a refusal means "the numbers do not add up" only when
  //     there was a trustworthy anchor for them to fail to add up TO.
  const recon = pairs.filter(([, c]) => c === 'reconciliation_failed');
  if (recon.length === 1 && recon[0][0] === 'line_sum_missed') {
    ok('exactly one arm carries reconciliation_failed, and it is line_sum_missed');
  } else {
    bad(`reconciliation_failed is carried by ${recon.length} arm(s): ${recon.map(([a]) => a).join(', ') || 'none'}`);
  }

  // 9d. THE HEADER ARM IS FIRST AND IT DOMINATES. The ORDER is the only part of
  //     this that is observable from outside: a document whose header does not
  //     add up AND whose line sum missed would otherwise get a different code
  //     depending on which check happened to be evaluated first.
  const iHeader = IMPL.indexOf('arm: "header_inconsistent"');
  const iNoLines = IMPL.indexOf('arm: "no_lines"');
  const iReconcileCall = IMPL.indexOf('const verdict = reconcile(input)');
  if (iHeader > 0 && iNoLines > iHeader && iReconcileCall > iNoLines) {
    ok('the header arm is evaluated first, then zero lines, then reconcile()');
  } else {
    bad('the arm order changed: header must dominate, and zero lines must be asked before reconcile()');
  }

  // 9e. ZERO LINES IS ASKED BEFORE reconcile(), AND THIS IS THE DEFECT R-187
  //     MEASURED. reconcile() on an empty list returns matched against a printed
  //     total of 0, because |0 - 0| <= 0.05. A zero-line payload was therefore
  //     stored `extracted` and never refused at all.
  {
    const sum = round2([].reduce((a, b) => a + b, 0));
    const tol = toleranceFor(0);
    if (sum === 0 && tol === 0.05 && Math.abs(sum - 0) <= tol) {
      ok('reconcile() alone WOULD accept zero lines against a printed 0, which is why the arm is ordered before it');
    } else {
      bad('the zero-line arithmetic changed, and this assertion no longer describes the defect it guards');
    }
  }

  // 9f. THE EXHAUSTIVENESS GUARD IS STILL THERE. tsc is what enforces it; this
  //     is what notices it being deleted.
  if (/const unreachable: never = verdict;/.test(IMPL)) {
    ok('the never-guard on the default branch is present, so tsc proves no input reaches it');
  } else {
    bad('the never-guard is gone from classifyScan, and nothing now proves the default is unreachable');
  }

  // 9g. THE CAPABILITY GATE IS NOT REMOVED, AND IT IS NARROWED TO THE ONE CODE
  //     MIGRATION 0034 ADDED. R-187 asks in terms that a fix must not remove it.
  const ROUTE = readFileSync(`${ROOT}/app/api/extraction/callback/route.ts`, 'utf8');
  if (/scanVerdict\.code === "reconciliation_failed" && !canFlagReconciliation/.test(ROUTE)) {
    ok('the 0034 capability gate still guards reconciliation_failed, and only it');
  } else {
    bad('the capability gate no longer guards reconciliation_failed on its own');
  }
  if (/documentSource === "scan" && status === "extracted"/.test(ROUTE)) {
    ok('the surface is unchanged: scan-sourced and extracted only, so the digital path stays untouched');
  } else {
    bad('the gate on document_source or status moved, which EXT-23 does not authorise');
  }
}

console.log('\n8. EXT-18: what the header checks do NOT do');
{
  // THE FABRICATION THE OWNER CONFIRMED, RUN THROUGH BOTH CHECKS. Andre's Matnord
  // scan carried FOUR FABRICATED LINES and a correctly read header. Both checks
  // land at EXACTLY ZERO on it. This case exists so that nobody can read the
  // section above as "the header check catches invented lines".
  const t = toleranceFor(7);
  const a = round2(Math.abs(round2(50336.40 + 10067.28) - round2(60403.68)));
  const b = round2(Math.abs(round2((50336.40 * 20) / 100) - round2(10067.28)));
  if (a === 0 && b === 0) {
    ok('the scan with four fabricated lines passes BOTH header checks at exactly zero');
  } else {
    bad(`the fabricated-line scan no longer lands at zero: A=${a} B=${b}`);
  }
  // AND EXT-16 IS WHAT CAUGHT IT, on the same document, which is the whole
  // asymmetry: the header agreed with itself and the line table did not agree
  // with the header.
  const lineSum = 49035.40;
  const missed = round2(Math.abs(round2(lineSum) - round2(50336.40)));
  if (missed > t) ok(`while the LINE sum on the same run misses by ${missed.toFixed(2)}, over ${t.toFixed(2)}, which is what refused it`);
  else bad('the line sum no longer refuses that run, and the asymmetry this case records is gone');
}

console.log('');
if (problems.length > 0) {
  console.error(`check-reconciliation: ${problems.length} assertion(s) failed.`);
  process.exit(1);
}
console.log('check-reconciliation: every tolerance assertion passed.');
