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
// THE MATNORD RESULT IS COMMITTED AS OBSERVED AND NOT ROUNDED, AND THERE IS NO
// FOURTH INVENTED SUM. Three runs of one 7-line page with a printed total of
// 50336.40 excluding VAT returned 49035.40, 39242.00 and 38429.40, every one of
// them with status extracted and reason null. A fabricated fourth value would
// make the set look tidier and would be evidence of nothing.

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
  const observed = [49035.40, 39242.00, 38429.40];
  for (const sum of observed) {
    const diff = round2(Math.abs(round2(sum) - round2(target)));
    if (diff <= tol) bad(`sum ${sum.toFixed(2)} passed reconciliation, and every observed run must FAIL`);
    else ok(`sum ${sum.toFixed(2).padStart(9)} misses by ${diff.toFixed(2).padStart(9)}, over the ${tol.toFixed(2)} tolerance`);
  }
  const spread = round2(Math.max(...observed) - Math.min(...observed));
  if (spread > tol * 1000) ok(`the three runs disagree with EACH OTHER by ${spread.toFixed(2)}, on one unchanged page`);
  else bad(`the observed spread is ${spread}, which is not the result this fixture records`);
  if (observed.length === 3) ok('exactly three observed sums, and no fourth invented one');
  else bad(`${observed.length} sums, and the dispatch forbids adding one`);
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

console.log('');
if (problems.length > 0) {
  console.error(`check-reconciliation: ${problems.length} assertion(s) failed.`);
  process.exit(1);
}
console.log('check-reconciliation: every tolerance assertion passed.');
