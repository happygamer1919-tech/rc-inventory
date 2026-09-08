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
//
// ===========================================================================
// CARD RULE-09, 2026-09-07: IT NOW GATES AUTHORING TOO, AND THE COUNTER NOTE
// WAS A FALSE GREEN POINTED AT THE WRONG EVIDENCE
// ===========================================================================
//
// R-128 is the FOURTH misallocation, after R-096, R-098 and the R-090/R-091
// pair. Everything above is still true and still the design: this file gates
// MERGES and said so in terms. What it did not do is answer the question at the
// moment somebody allocates, which is hours earlier, and the one authoring-time
// signal it did emit pointed at the wrong branches.
//
// THE NOTE WAS AN EQUALITY TEST ON THE COUNTER. It said "branch X also points at
// R-128" only when X's counter EQUALLED ours. A branch that has consumed R-128
// through R-134 has a counter reading R-135, which is not equal to R-128, so it
// produced SILENCE. Run at allocation time on 2026-09-06 the check exited 0 and
// printed three notes naming poc/state-20260906-040016, poc/report-20260905-010004
// and poc/report-20260904-220003, whose counters all read R-128 and which had
// WRITTEN NOTHING, while saying nothing at all about triage/20260904-220003 and
// triage/20260905-010004, which held fourteen ids between them. It was loudest
// about the branches claiming least.
//
// THREE THINGS CHANGED, AND NOTHING ABOUT THE MERGE-TIME REFUSAL DID:
//
//   1. `--free <ID>` answers "is this id free" BEFORE the ruling is written, and
//      names the lowest id that actually is. Advisory at authoring time and
//      binding at merge time: R-098 proved a sweep can be right and collide
//      anyway, and this does not pretend otherwise. It removes the case that has
//      now happened four times; the merge-time refusal still catches the residue.
//   2. THE COMPARISON IS A CONSUMED RANGE, NOT AN EQUALITY. A source's counter at
//      R-K means every id below R-K is spoken for from that source's point of
//      view, whether or not it was written. That is not pedantry: R-087 to R-095
//      are absent from `main` while `main` sat at R-097, because a branch
//      advanced its counter and never merged. Those ids are a permanent hole and
//      must never be handed out, which is exactly what a high-water rule does and
//      what a gap-filling rule would not.
//   3. CARD IDS ARE READ TOO. This file used to open `decisions/` and nothing
//      else, so card ids had NO cross-branch check of any kind. `RULE-07` and
//      `RULE-08` sat on those same two branches and a session allocating the next
//      `RULE` id from `main` alone would have taken `RULE-07` and collided on its
//      first try. The board paths come from `scripts/poc/boards.mjs`, which is
//      the one place a board file is named and whose `CLOSED_BOARDS` comment says
//      in terms that it exists so a tool wanting it for id resolution need not
//      hardcode a path.
//
// SILENCE MEANS NOTHING IS CLAIMED, NEVER THAT IT COULD NOT LOOK. Every source is
// read or REFUSED, the count of sources read is asserted against the count of
// sources offered, and a source that cannot be read exits non-zero. That contract
// already governed the branch list; it now governs each branch's inbox, counter
// and boards individually.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// The board set, from the ONE place a board file is named. boards.mjs is inert on
// import and its CLOSED_BOARDS comment authorises exactly this use: "so that a
// tool which wants it for id resolution can name it without hardcoding a path".
import { WORKING_BOARDS, CLOSED_BOARDS } from '../poc/boards.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
// TESTABILITY OVERRIDE, the pattern check-pending-schema-reads and
// check-no-destructive-migration both use. It lets prove-open-branch-ids.mjs
// point the whole check at a throwaway repository containing two branches that
// genuinely collide, so the REFUSAL is exercised rather than asserted. A check
// that has never been seen to fail is not a check.
const GITROOT = process.env.RC_IDS_GITROOT || ROOT;
const INBOX = 'decisions/inbox.md';
const COUNTER = 'decisions/NEXT-RULING-ID';

const RULING = /^#{1,6}\s*(R-\d{3})\b/;
const SHAPED = /^#{1,6}\s*R-/;

// RULE-09. Every board, working and closed, because a card id is unique across
// all three and an id authored on any of them is taken.
const BOARDS = [...WORKING_BOARDS, ...CLOSED_BOARDS].map((b) => b.path);

// An id this file can reason about: `R-143`, `RULE-09`, `P3-04b`. The suffix is
// kept because `P3-04` and `P3-04b` are two cards, and dropping it would let one
// answer for the other.
const ANY_ID = /^([A-Za-z][A-Za-z0-9]*)-(\d+)([A-Za-z]*)$/;

function parseId(raw) {
  const m = ANY_ID.exec(String(raw).trim());
  if (!m) return null;
  return { prefix: m[1].toUpperCase(), number: Number(m[2]), suffix: m[3].toLowerCase(), raw: String(raw).trim() };
}

/** The number in a counter line like `R-143`, or null when it does not parse. */
function counterNumber(text) {
  const k = parseId(text);
  return k && k.prefix === 'R' ? k.number : null;
}

const asRuling = (n) => `R-${String(n).padStart(3, '0')}`;

// Headings that LOOK like a ruling and deliberately are not, each with its
// reason. Kept in step with the same list in check-unique-ids.mjs, and kept
// SHORT and EXPLICIT so that adding to it is a decision that can be read in a
// diff rather than a silent widening of what the parser ignores.
const NOT_A_RULING = new Set([
  // The template at the top of decisions/inbox.md. NNN is a placeholder.
  '### R-NNN - <one line naming the decision>',
]);

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: GITROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts,
  });
}

/** Ruling ids and their heading text, with the input/parse counts asserted. */
function rulingsIn(text) {
  const rulings = [];
  let shaped = 0;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (NOT_A_RULING.has(t)) continue;
    if (SHAPED.test(line)) shaped += 1;
    const m = RULING.exec(line);
    if (m) rulings.push({ id: m[1], heading: t });
  }
  return { rulings, shaped };
}

/**
 * Card ids on one board.
 *
 * A BOARD THAT DOES NOT PARSE, OR THAT HAS NO CARDS, THROWS. It is not returned
 * as an empty set: an empty set reads as "this board claims nothing", which is
 * the shape that turns a broken reader into a clean report. The caller counts
 * the throw as an unread source and refuses.
 */
function cardIdsIn(boardText, where) {
  const board = JSON.parse(boardText);
  const cards = board.cards;
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error(`${where}: no cards array, or it is empty`);
  }
  const ids = [];
  for (const c of cards) {
    if (typeof c.id !== 'string' || c.id.trim() === '') throw new Error(`${where}: a card has no id`);
    ids.push(c.id.trim());
  }
  return ids;
}

const problems = [];
const say = (m) => console.log(m);

// --- ARGUMENTS --------------------------------------------------------------
// One flag, and everything else is the merge-time check exactly as it was.
let freeArg = null;
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--free') { freeArg = argv[i + 1]; i += 1; continue; }
    if (argv[i].startsWith('--free=')) { freeArg = argv[i].slice('--free='.length); continue; }
    console.error(`check-open-branch-ids: unknown argument ${argv[i]}`);
    console.error('usage: check-open-branch-ids.mjs [--free <ID>]');
    process.exit(2);
  }
}

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
      cwd: GITROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
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

// ===========================================================================
// RULE-09. THE AUTHORING-TIME ANSWER: `--free <ID>`
// ===========================================================================
//
// Asked BEFORE the ruling or the card exists. Everything below reads; nothing
// writes, and nothing advances a counter. A check that picked the next free id
// for the author would make the collision invisible again in the other
// direction, and CLAUDE.md 8b's counter still turns two simultaneous writes into
// a merge conflict, which is the loud signal it was designed for.
// ===========================================================================
if (freeArg !== null) {
  const want = parseId(freeArg);
  if (!want) {
    console.error(`check-open-branch-ids: ${JSON.stringify(freeArg)} is not an id this file can read.`);
    console.error('Expected the shape R-143, RULE-09 or P3-04b.');
    process.exit(2);
  }

  // --- EVERY SOURCE, READ OR REFUSED ---------------------------------------
  //
  // One entry per place an id can be taken: `main`, and every open pull request
  // branch INCLUDING this one. Self is not excluded here and is excluded in the
  // merge-time check below, and the difference is deliberate: at merge time the
  // question is "does anyone else claim what I add", and at authoring time it is
  // "has anyone at all taken this", which includes the branch under your feet.
  const sources = [{ label: 'main', ref: 'refs/remotes/origin/main', pr: null }];
  for (const { pr, branch } of openBranches) {
    sources.push({ label: branch, ref: `refs/remotes/origin/${branch}`, pr });
  }

  const holdings = [];
  const unread = [];
  for (const src of sources) {
    const read = (path) => {
      try { git(['fetch', '--no-tags', '--quiet', 'origin', `+refs/heads/${src.label === 'main' ? 'main' : src.label}:${src.ref}`]); } catch { /* may already be present */ }
      return git(['show', `${src.ref}:${path}`]);
    };
    const held = { ...src, rulings: [], counter: null, cardIds: [] };
    try {
      const inbox = read(INBOX);
      const parsed = rulingsIn(inbox);
      if (parsed.shaped !== parsed.rulings.length) {
        throw new Error(`${parsed.shaped} ruling-shaped heading(s) read but ${parsed.rulings.length} parsed`);
      }
      held.rulings = parsed.rulings.map((r) => r.id);
      held.counter = counterNumber(read(COUNTER));
      if (held.counter === null) throw new Error(`${COUNTER} does not hold an id of the shape R-NNN`);
      for (const rel of BOARDS) held.cardIds.push(...cardIdsIn(read(rel), rel));
      holdings.push(held);
    } catch (err) {
      // COUNTED AND NAMED, NEVER SKIPPED. This is the whole contract: an
      // unreadable source and a source that claims nothing must not render as
      // the same answer.
      unread.push({ ...src, why: String(err && err.message ? err.message : err).split('\n')[0] });
    }
  }

  // THE WORKING TREE IS A SOURCE TOO, and it is the one the author is standing
  // in. An id already written here is taken, by you, and saying so is more use
  // than a green answer that ignores your own uncommitted ruling.
  const tree = { label: 'this working tree', pr: null, rulings: [], counter: null, cardIds: [] };
  let treeRead = true;
  try {
    const parsed = rulingsIn(readFileSync(join(GITROOT, INBOX), 'utf8'));
    tree.rulings = parsed.rulings.map((r) => r.id);
    tree.counter = counterNumber(readFileSync(join(GITROOT, COUNTER), 'utf8'));
    for (const rel of BOARDS) tree.cardIds.push(...cardIdsIn(readFileSync(join(GITROOT, rel), 'utf8'), rel));
  } catch (err) {
    treeRead = false;
    unread.push({ label: 'this working tree', pr: null, why: String(err && err.message ? err.message : err).split('\n')[0] });
  }
  const all = treeRead ? holdings.concat([tree]) : holdings;

  say(`check-open-branch-ids --free ${want.raw}`);
  say(`  open pull requests   ${openBranches.length} ${how}`);
  // THE COUNT IS ASSERTED AGAINST THE INPUT, NOT AGAINST A LIST DERIVED FROM IT.
  // That distinction is the whole assertion. An earlier version compared the
  // sources READ against `sources.length`, which is the list the loop above
  // built: a bug that dropped a branch while building it shrank both sides
  // equally and the assertion held. The input is the open pull request list, plus
  // main, plus this working tree, and it is counted before anything is derived
  // from it. A mutant that skips one branch is caught by this line and by nothing
  // else in the file.
  const offered = openBranches.length + 2;
  say(`  sources              ${all.length} read, ${unread.length} refused, of ${offered} offered`);

  if (all.length + unread.length !== offered) {
    console.error('\ncheck-open-branch-ids: SOURCE COUNT DIVERGES.');
    console.error(`  ${offered} offered (${openBranches.length} open pull request(s), main, this working tree),`);
    console.error(`  ${all.length} read and ${unread.length} refused.`);
    console.error('  One was silently skipped, so this answer is about less than it claims.');
    process.exit(2);
  }

  if (unread.length > 0) {
    console.error('\ncheck-open-branch-ids: A SOURCE COULD NOT BE READ, SO NO ID IS REPORTED FREE.');
    for (const u of unread) console.error(`  ${u.label}${u.pr ? ` (#${u.pr})` : ''}: ${u.why}`);
    console.error('');
    console.error('"I could not look" and "nothing is claimed" must never render as the same');
    console.error('result. Fix the source or fetch the branch, then ask again.');
    process.exit(2);
  }

  if (want.prefix === 'R') {
    // --- RULINGS: A HIGH-WATER MARK, NOT A GAP SEARCH -----------------------
    //
    // Free means AT OR ABOVE the highest point any source has reached, counting
    // both what was written and what a counter says was consumed. R-087 to R-095
    // are the reason: a branch advanced its counter past them and never merged,
    // so they are absent from `main` and are still not free. A gap-filling answer
    // would hand one of them out.
    let mark = 0;
    const byCounter = [];
    const byWriting = [];
    for (const src of all) {
      if (src.counter !== null && src.counter > mark) mark = src.counter;
      if (src.counter !== null && src.counter > want.number) {
        byCounter.push(`${src.label}${src.pr ? ` (#${src.pr})` : ''} at ${asRuling(src.counter)}`);
      }
      for (const id of src.rulings) {
        const k = parseId(id);
        if (!k || k.prefix !== 'R') continue;
        if (k.number + 1 > mark) mark = k.number + 1;
        if (k.number === want.number) byWriting.push(`${src.label}${src.pr ? ` (#${src.pr})` : ''}`);
      }
    }
    say(`  ruling high water    ${asRuling(mark)}`);

    if (want.number >= mark) {
      say(`  ${want.raw} is FREE`);
      say('');
      say(`check-open-branch-ids: ${want.raw} is free across main, ${openBranches.length} open pull request(s) and this working tree.`);
      say('Advisory. It can stop being true the moment after this ran, which is what');
      say('the merge-time refusal in this same file is for.');
      process.exit(0);
    }

    console.error(`  ${want.raw} is CLAIMED`);
    if (byWriting.length > 0) console.error(`    written on         ${[...new Set(byWriting)].join(', ')}`);
    if (byCounter.length > 0) console.error(`    consumed by        ${[...new Set(byCounter)].join('\n                       ')}`);
    console.error(`    lowest free id     ${asRuling(mark)}`);
    console.error('');
    console.error(`check-open-branch-ids: ${want.raw} IS NOT FREE. Take ${asRuling(mark)}.`);
    console.error('A source whose counter is above this id has consumed it whether or not it');
    console.error('wrote it, and CLAUDE.md 8b forbids renumbering an id that has landed.');
    process.exit(1);
  }

  // --- CARD IDS: USED OR NOT USED, PLUS THE NEXT IN THE LANE ---------------
  //
  // There is no counter for cards, so "consumed" has no meaning here and the
  // only question is whether the exact id is in use anywhere. The lane's next
  // free id is reported beside the verdict, because an answer that only refuses
  // leaves the next reader guessing.
  const holders = [];
  let laneMax = 0;
  for (const src of all) {
    for (const id of src.cardIds) {
      const k = parseId(id);
      if (!k || k.prefix !== want.prefix) continue;
      if (k.number > laneMax) laneMax = k.number;
      if (k.number === want.number && k.suffix === want.suffix) {
        holders.push(`${src.label}${src.pr ? ` (#${src.pr})` : ''}`);
      }
    }
  }
  const nextInLane = `${want.prefix}-${String(laneMax + 1).padStart(2, '0')}`;
  say(`  lane highest         ${want.prefix}-${String(laneMax).padStart(2, '0')}`);

  if (holders.length === 0) {
    say(`  ${want.raw} is FREE`);
    say('');
    say(`check-open-branch-ids: ${want.raw} is on no board on main, on any of the ${openBranches.length} open pull request(s), or in this working tree.`);
    say(`The next id in that lane is ${nextInLane}. Advisory, for the reason above.`);
    process.exit(0);
  }

  console.error(`  ${want.raw} is CLAIMED`);
  console.error(`    on a board of      ${[...new Set(holders)].join(', ')}`);
  console.error(`    next free in lane  ${nextInLane}`);
  console.error('');
  console.error(`check-open-branch-ids: ${want.raw} IS NOT FREE. Take ${nextInLane}.`);
  console.error('Card ids are unique across all three boards, and this file reads every one of');
  console.error('them on every open branch, which is the half that did not exist before RULE-09.');
  process.exit(1);
}

// --- WHAT THIS BRANCH ADDS --------------------------------------------------
const hereText = readFileSync(join(GITROOT, INBOX), 'utf8');
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

// --- WHAT EACH OPEN BRANCH ACTUALLY HOLDS -----------------------------------
//
// RULE-09. THIS BLOCK USED TO BE AN EQUALITY TEST AND IT WAS A FALSE GREEN
// POINTED AT THE WRONG EVIDENCE. It read:
//
//     if (theirNext === nextHere) {
//       say(`  note: ${branch} (#${pr}) also points at ${nextHere}. ...`);
//     }
//
// A branch that has consumed R-128 through R-134 has a counter reading R-135,
// which is not equal to R-128, so the branch holding the ids produced SILENCE
// while three branches holding NOTHING produced notes. Measured on 2026-09-06:
// three notes naming poc/state-20260906-040016, poc/report-20260905-010004 and
// poc/report-20260904-220003, and not one word about triage/20260904-220003 or
// triage/20260905-010004, which held fourteen ids between them.
//
// It now reports what each branch HOLDS, which is the ids it wrote beyond main
// plus the range its counter says it consumed. A branch holding nothing is not
// named, and a branch whose counter could not be read is a PROBLEM rather than a
// blank line, so silence here means nothing is claimed and never that it could
// not look.
const nextHereNum = counterNumber(readFileSync(join(GITROOT, COUNTER), 'utf8'));
const mainCounterNum = (() => {
  try { return counterNumber(git(['show', `refs/remotes/origin/main:${COUNTER}`])); } catch { return null; }
})();
let named = 0;
for (const { pr, branch } of openBranches) {
  if (branch === self) continue;
  let theirNext;
  try {
    theirNext = counterNumber(git(['show', `refs/remotes/origin/${branch}:${COUNTER}`]));
  } catch {
    problems.push(`branch ${branch} (#${pr}): ${COUNTER} could not be read. It may have consumed ids this branch is about to take.`);
    continue;
  }
  if (theirNext === null) {
    problems.push(`branch ${branch} (#${pr}): ${COUNTER} does not hold an id of the shape R-NNN, so what it has consumed cannot be read.`);
    continue;
  }
  // Written beyond main is the loud half; the counter range is the quiet half
  // that nobody was looking at.
  let wrote = [];
  try {
    wrote = rulingsIn(git(['show', `refs/remotes/origin/${branch}:${INBOX}`])).rulings
      .filter((r) => !onMain.has(r.id)).map((r) => r.id);
  } catch { /* already counted as unreadable above */ }
  const base = mainCounterNum === null ? null : mainCounterNum;
  const consumedAbove = base !== null && theirNext > base;
  if (wrote.length === 0 && !consumedAbove) continue;
  named += 1;
  // THE CEILING, NOT A RANGE FROM MAIN'S BASELINE. Two branches cut from one
  // main both advance past it, so ranges expressed from that baseline OVERLAP
  // and read as if each had taken the other's ids. What a reader can act on is
  // the ceiling: no id below this branch's counter is free, whoever took it.
  say(
    `  holds: ${branch} (#${pr}) wrote ${wrote.length ? wrote.join(', ') : 'nothing beyond main'}, ` +
    `counter ${asRuling(theirNext)}, so no id below ${asRuling(theirNext)} is free`,
  );
}
if (named === 0) {
  say(`  holds: no open branch holds a ruling id beyond main${nextHereNum === null ? '' : `, and this branch points at ${asRuling(nextHereNum)}`}`);
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
