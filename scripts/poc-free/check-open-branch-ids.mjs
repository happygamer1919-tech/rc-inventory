#!/usr/bin/env node
// check-open-branch-ids.mjs
// Card RULE-04. AN ID CLAIMED ON ANOTHER OPEN BRANCH IS NOT FREE.
//
// ===========================================================================
// WHY THIS EXISTS: IT HAS BITTEN THREE TIMES, NOT ONCE
// ===========================================================================
//
//   R-096   PR #179 took it from main's counter and merged it, while PR #157
//           had already advanced its own counter to R-096 on an open branch.
//   R-098   allocated on board/dispatch-20260903 after a manual sweep of main
//           and six open branches found it free. By the next morning PR #184
//           existed and had also taken it. The sweep was TRUE WHEN IT RAN.
//   R-090   and R-091 are written by BOTH #172 and #157, with different
//           headings, neither merged.
//
// IN EVERY CASE `check:unique-ids` WAS GREEN ON BOTH SIDES, because it compares
// each branch against MAIN and within each side the ids are perfectly unique.
// The collision only becomes visible when the second branch merges, which is
// after somebody has already written the ruling.
//
// CLAUDE.md 8b's counter does not prevent it either, and the reason is worth
// stating: the counter turns a race into a MERGE CONFLICT, and two branches that
// never merge into each other never conflict. Both were cut from main
// independently. THE COUNTER CONVERTS A RACE INTO A CONFLICT ONLY AT MERGE TIME,
// AND ALLOCATION HAPPENS HOURS EARLIER.
//
// ===========================================================================
// A SWEEP IS ONLY TRUE AT THE MOMENT IT RUNS
// ===========================================================================
//
// That is why this is a CHECK IN `quality` and not a procedure in a document.
// Under `required_status_checks.strict` a branch must be up to date with main
// before it can merge, so this check's last run is the one immediately before
// the merge. That is as close to merge time as a pull request check can get, and
// it is the only moment at which the answer is worth anything.
//
// A HUMAN SWEEP CANNOT BE THIS. R-098 is the proof: it was swept correctly and
// collided anyway, because branches are opened while you work.
//
// ===========================================================================
// IT FAILS CLOSED, AND THAT IS THE DESIGN
// ===========================================================================
//
// If the open branch list cannot be obtained, this REFUSES rather than reporting
// clean. `check-removal-safety` already follows that rule and `docs/LEARNINGS.md`
// names the class: a matcher whose empty result means "nothing to do" reports a
// broken scanner as a clean tree. A check that silently skips when a token is
// missing is a check that is absent on exactly the runs that matter.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const INBOX = 'decisions/inbox.md';
const COUNTER = 'decisions/NEXT-RULING-ID';

const RULING = /^#{1,6}\s*(R-\d{3})\b/;
const SHAPED = /^#{1,6}\s*R-/;

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts,
  });
}

/** Ruling ids and their heading text, with the input/parse counts asserted. */
function rulingsIn(text) {
  const rulings = [];
  let shaped = 0;
  for (const line of text.split('\n')) {
    if (SHAPED.test(line)) shaped += 1;
    const m = RULING.exec(line);
    if (m) rulings.push({ id: m[1], heading: line.trim() });
  }
  return { rulings, shaped };
}

const problems = [];
const say = (m) => console.log(m);

// --- THE OPEN BRANCH LIST, AND IT REFUSES WITHOUT ONE -----------------------
let openBranches = [];
let how = '';
if (process.env.RC_OPEN_BRANCHES !== undefined) {
  // Testability override, the pattern check-pending-schema-reads already uses.
  // An empty string is a DELIBERATE empty list, which is why the check is for
  // undefined rather than for falsiness.
  openBranches = process.env.RC_OPEN_BRANCHES.split(',').map((b) => b.trim()).filter(Boolean);
  how = 'from RC_OPEN_BRANCHES';
} else {
  try {
    const out = execFileSync('gh', ['pr', 'list', '--state', 'open', '--limit', '200',
      '--json', 'number,headRefName', '--jq', '.[] | "\\(.number)\\t\\(.headRefName)"'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    openBranches = out.split('\n').map((l) => l.trim()).filter(Boolean)
      .map((l) => { const [n, b] = l.split('\t'); return { pr: n, branch: b }; });
    how = 'from the GitHub API';
  } catch (err) {
    console.error('check-open-branch-ids: THE OPEN PULL REQUEST LIST COULD NOT BE OBTAINED.');
    console.error(`  ${String(err && err.message ? err.message : err).split('\n')[0]}`);
    console.error('');
    console.error('This check REFUSES rather than reporting clean. Its whole subject is ids');
    console.error('claimed on branches it cannot see, so "I could not look" and "nothing is');
    console.error('claimed" must never render as the same result.');
    process.exit(2);
  }
}
if (typeof openBranches[0] === 'string') {
  openBranches = openBranches.map((b) => ({ pr: '?', branch: b }));
}

// --- WHICH BRANCH IS THIS ---------------------------------------------------
let self = process.env.RC_SELF_BRANCH || '';
if (!self) {
  try { self = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim(); } catch { self = ''; }
}
if (self === 'HEAD' && process.env.GITHUB_HEAD_REF) self = process.env.GITHUB_HEAD_REF;

// --- WHAT MAIN ALREADY HAS --------------------------------------------------
let mainText = null;
for (const rev of ['origin/main', 'refs/remotes/origin/main']) {
  try { git(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]); mainText = git(['show', `${rev}:${INBOX}`]); break; } catch { /* next */ }
}
if (mainText === null) {
  try {
    git(['fetch', '--no-tags', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
    mainText = git(['show', `refs/remotes/origin/main:${INBOX}`]);
  } catch {
    console.error('check-open-branch-ids: origin/main could not be resolved. Refusing to report OK.');
    process.exit(2);
  }
}
const onMain = new Map(rulingsIn(mainText).rulings.map((r) => [r.id, r.heading]));

// --- WHAT THIS BRANCH ADDS --------------------------------------------------
const hereText = readFileSync(join(ROOT, INBOX), 'utf8');
const here = rulingsIn(hereText);
if (here.shaped !== here.rulings.length) {
  problems.push(
    `${INBOX}: ${here.shaped} ruling-shaped heading(s) read but ${here.rulings.length} parsed. ` +
    'A parser that silently drops headings finds no collisions in them.',
  );
}
const hereAdds = new Map(here.rulings.filter((r) => !onMain.has(r.id)).map((r) => [r.id, r.heading]));

say(`check-open-branch-ids: ${openBranches.length} open pull request(s) ${how}`);
say(`  this branch          ${self || '(unknown)'}`);
say(`  ids added vs main    ${hereAdds.size ? [...hereAdds.keys()].join(', ') : 'none'}`);

let compared = 0;
let unreadable = 0;

for (const { pr, branch } of openBranches) {
  if (branch === self) continue;
  let text;
  try {
    try { git(['fetch', '--no-tags', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`]); } catch { /* may already be present */ }
    text = git(['show', `refs/remotes/origin/${branch}:${INBOX}`]);
  } catch {
    // A branch whose inbox cannot be read is COUNTED, not skipped, and the count
    // is asserted below. Skipping silently is how a check reports clean about
    // work it did not do.
    unreadable += 1;
    problems.push(`branch ${branch} (#${pr}): ${INBOX} could not be read. It may claim ids this branch also claims.`);
    continue;
  }
  compared += 1;
  const theirs = rulingsIn(text);
  const theirAdds = new Map(theirs.rulings.filter((r) => !onMain.has(r.id)).map((r) => [r.id, r.heading]));
  for (const [id, heading] of hereAdds) {
    if (!theirAdds.has(id)) continue;
    if (theirAdds.get(id) === heading) continue; // the same ruling on both, e.g. a shared base
    problems.push(
      `ruling id ${id} is ALSO CLAIMED, with a different heading, on open branch ${branch} (#${pr})\n` +
      `      here:  ${heading.slice(0, 110)}\n` +
      `      there: ${theirAdds.get(id).slice(0, 110)}`,
    );
  }
}

// --- THE COUNT ASSERTION ----------------------------------------------------
const expected = openBranches.filter((b) => b.branch !== self).length;
if (compared + unreadable !== expected) {
  problems.push(
    `input and comparison count diverge: ${expected} other open branch(es), ` +
    `${compared} compared and ${unreadable} refused. One was silently skipped.`,
  );
}
say(`  compared             ${compared} of ${expected} other open branch(es)`);

// --- THE COUNTER, WHICH IS A RESERVATION AND NOT ONLY A NUMBER --------------
const nextHere = readFileSync(join(ROOT, COUNTER), 'utf8').trim();
for (const { pr, branch } of openBranches) {
  if (branch === self) continue;
  let theirNext;
  try { theirNext = git(['show', `refs/remotes/origin/${branch}:${COUNTER}`]).trim(); } catch { continue; }
  if (theirNext === nextHere) {
    say(`  note: ${branch} (#${pr}) also points at ${nextHere}. Whoever writes second must re-read it.`);
  }
}

if (problems.length > 0) {
  console.error('\ncheck-open-branch-ids: AN ID IS CLAIMED TWICE ACROSS OPEN BRANCHES.\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nNEITHER BRANCH IS WRONG AND NEITHER IS ON MAIN, so nothing has gone red until');
  console.error('now. Renumber THE ONE MERGING SECOND, never the one already on main, and say');
  console.error('so in its heading. CLAUDE.md 8b forbids renumbering an id that has LANDED; an');
  console.error('id that never left a branch is not history.');
  process.exit(1);
}

console.log('check-open-branch-ids: OK. No id added by this branch is claimed on another open branch.');
