#!/usr/bin/env node
// prove-open-branch-ids.mjs
// Cards RULE-04 and RULE-09. Proves check-open-branch-ids.mjs REFUSES, on
// fixtures built for it. A check that has never been seen to fail is not a check.
//
// Sections 1 to 6 are RULE-04: the MERGE-TIME refusal, unchanged.
// Sections 7 onward are RULE-09: the AUTHORING-TIME answer, --free <ID>, the
// holdings report that replaced an equality test, and card ids, which had no
// cross-branch check of any kind before that card.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const CHECK = join(ROOT, 'scripts/poc-free/check-open-branch-ids.mjs');
const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  if (!pass && detail) console.log(`      ${detail}`);
};

/** A throwaway repository: main, plus branches each with their own inbox. */
function repo(mainIds, branches) {
  const dir = mkdtempSync(join(tmpdir(), 'rc-ids-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  mkdirSync(join(dir, 'decisions'), { recursive: true });
  const inbox = (ids) => ids.map(([id, words]) => `### ${id} - ${words}`).join('\n\n') + '\n';
  writeFileSync(join(dir, 'decisions/inbox.md'), inbox(mainIds));
  writeFileSync(join(dir, 'decisions/NEXT-RULING-ID'), 'R-900\n');
  git('init', '-q', '.');
  git('config', 'user.email', 'proof@example.invalid');
  git('config', 'user.name', 'proof');
  git('add', '-A'); git('commit', '-qm', 'main');
  git('branch', '-M', 'main');
  git('remote', 'add', 'origin', dir);
  for (const [name, ids, next] of branches) {
    git('checkout', '-q', '-b', name, 'main');
    writeFileSync(join(dir, 'decisions/inbox.md'), inbox(mainIds.concat(ids)));
    writeFileSync(join(dir, 'decisions/NEXT-RULING-ID'), (next || 'R-900') + '\n');
    git('add', '-A'); git('commit', '-qm', name);
  }
  git('fetch', '-q', 'origin');
  return { dir, git };
}

function run(dir, self, openBranches) {
  const env = { ...process.env, RC_IDS_GITROOT: dir, RC_SELF_BRANCH: self, RC_OPEN_BRANCHES: openBranches.join(',') };
  try {
    return { status: 0, out: execFileSync(process.execPath, [CHECK], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }) };
  } catch (e) {
    return { status: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

const MAIN = [['R-001', 'the first'], ['R-002', 'the second']];

console.log('\n1. TWO OPEN BRANCHES CLAIMING ONE ID, WHICH IS THE R-090 CASE');
{
  const { dir, git } = repo(MAIN, [
    ['feat-a', [['R-003', 'a decision about widgets']], 'R-004'],
    ['feat-b', [['R-003', 'a completely different decision about invoices']], 'R-004'],
  ]);
  try {
    git('checkout', '-q', 'feat-a');
    const r = run(dir, 'feat-a', ['feat-a', 'feat-b']);
    record('the collision is refused', r.status === 1 && r.out.includes('R-003'), `exit ${r.status}: ${r.out.slice(0, 300)}`);
    record('  ...and BOTH headings are shown, so a reader can tell which to renumber',
      r.out.includes('widgets') && r.out.includes('invoices'), r.out.slice(0, 400));
    record('  ...and the other branch is NAMED', r.out.includes('feat-b'), r.out.slice(0, 300));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log('\n2. THE CONTROL: different ids on both branches PASS');
{
  const { dir, git } = repo(MAIN, [
    ['feat-a', [['R-003', 'a decision about widgets']], 'R-004'],
    ['feat-b', [['R-004', 'a decision about invoices']], 'R-005'],
  ]);
  try {
    git('checkout', '-q', 'feat-a');
    const r = run(dir, 'feat-a', ['feat-a', 'feat-b']);
    record('two branches allocating DIFFERENT ids are not refused', r.status === 0, `exit ${r.status}: ${r.out.slice(0, 300)}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log('\n3. THE SAME RULING ON BOTH BRANCHES, from a shared base, is NOT a collision');
{
  const { dir, git } = repo(MAIN, [
    ['feat-a', [['R-003', 'one decision, one heading']], 'R-004'],
    ['feat-b', [['R-003', 'one decision, one heading']], 'R-004'],
  ]);
  try {
    git('checkout', '-q', 'feat-a');
    const r = run(dir, 'feat-a', ['feat-a', 'feat-b']);
    record('identical headings are one ruling on two branches, not two wearing one id', r.status === 0, `exit ${r.status}: ${r.out.slice(0, 300)}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log('\n4. AN ID ALREADY ON MAIN IS NOT THE SUBJECT OF THIS CHECK');
{
  // check-unique-ids owns redefinition against main. This one must not
  // double-report it, or the two checks fight over the same finding.
  const { dir, git } = repo(MAIN, [
    ['feat-a', [['R-001', 'a redefinition of something on main']], 'R-900'],
    ['feat-b', [['R-005', 'unrelated']], 'R-900'],
  ]);
  try {
    git('checkout', '-q', 'feat-a');
    const r = run(dir, 'feat-a', ['feat-a', 'feat-b']);
    record('a main redefinition is left to check-unique-ids', r.status === 0, `exit ${r.status}: ${r.out.slice(0, 300)}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log('\n5. IT FAILS CLOSED WHEN IT CANNOT SEE THE BRANCHES');
{
  const { dir, git } = repo(MAIN, [['feat-a', [['R-003', 'x']], 'R-004']]);
  try {
    git('checkout', '-q', 'feat-a');
    // A branch named as open that does not exist cannot be read. It must be
    // REFUSED, not skipped: "I could not look" and "nothing is claimed" are
    // different answers and only one of them is safe.
    const r = run(dir, 'feat-a', ['feat-a', 'does-not-exist']);
    record('an unreadable branch refuses rather than reporting clean',
      r.status === 1 && r.out.includes('could not be read'), `exit ${r.status}: ${r.out.slice(0, 300)}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log('\n6. THE INPUT COUNT IS ASSERTED AGAINST THE COMPARISON COUNT');
{
  const { dir, git } = repo(MAIN, [
    ['feat-a', [['R-003', 'x']], 'R-004'],
    ['feat-b', [['R-004', 'y']], 'R-005'],
    ['feat-c', [['R-005', 'z']], 'R-006'],
  ]);
  try {
    git('checkout', '-q', 'feat-a');
    const r = run(dir, 'feat-a', ['feat-a', 'feat-b', 'feat-c']);
    record('all other open branches are compared, and the count says so',
      r.status === 0 && /compared\s+2 of 2/.test(r.out), r.out.slice(0, 300));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ===========================================================================
// CARD RULE-09. THE AUTHORING-TIME ANSWER, --free <ID>
// ===========================================================================
//
// THE FIXTURE IS THE STATE THAT ACTUALLY EXISTED ON 2026-09-06, reconstructed
// rather than invented, because the acceptance names it:
//
//   main         R-001 to R-127 written, counter R-128, boards carry RULE-02..RULE-06
//   triage-a     writes R-128 to R-134, counter R-135, board adds RULE-07
//   triage-b     writes R-135 to R-141, counter R-142, board adds RULE-08
//   poc-1..3     write NOTHING, counter R-128
//
// On that input the pre-RULE-09 check exited 0 and named poc-1, poc-2 and poc-3,
// which held nothing, and said nothing about triage-a or triage-b, which held
// fourteen ids between them.
//
// EVERY CLAUSE HAS A MUTANT. A mutant is a WHOLE TREE and not one file, for the
// reason test-ask-digest.sh records: the check imports ../poc/boards.mjs by
// relative path, so a lone mutated file cannot resolve it, dies on the import and
// writes nothing, which looks exactly like a mutant the guard correctly refused.
// Each mutant is also proved to RUN on a case it must pass before its failing
// case is believed.
// ===========================================================================

const RULE_BOARDS = ['docs/board/rc-board.json', 'docs/board/rc-board-phase2.json', 'docs/board/rc-board-phase3.json'];
const BASE_CARDS = ['RULE-02', 'RULE-03', 'RULE-04', 'RULE-05', 'RULE-06'];

/** A board file with just enough shape for cardIdsIn to accept it. */
function boardFile(ids) {
  return JSON.stringify({ board: 'fixture', schema_version: 1, as_of: '2026-09-06T00:00:00Z', cards: ids.map((id) => ({ id })) }, null, 2) + '\n';
}

const rulingSeq = (from, to) => {
  const out = [];
  for (let n = from; n <= to; n += 1) out.push('R-' + String(n).padStart(3, '0'));
  return out;
};

/**
 * The 2026-09-06 repository: main plus five open branches, with boards.
 *
 * What each branch adds to the phase 2 board is what that branch claims, so the
 * fixture says the same thing the real state did: RULE-07 and RULE-08 exist on
 * two open branches and nowhere else.
 */
function repo0906() {
  const dir = mkdtempSync(join(tmpdir(), 'rc-free-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const put = (rel, body) => {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body, 'utf8');
  };
  const inboxOf = (ids) => ids.map((id) => '### ' + id + ' - a ruling').join('\n\n') + '\n';
  const mainRulings = rulingSeq(1, 127);

  git('init', '-q', '.');
  git('config', 'user.email', 'proof@example.invalid');
  git('config', 'user.name', 'proof');
  put('decisions/inbox.md', inboxOf(mainRulings));
  put('decisions/NEXT-RULING-ID', 'R-128\n');
  put(RULE_BOARDS[0], boardFile(['P1-01']));
  put(RULE_BOARDS[1], boardFile(BASE_CARDS));
  put(RULE_BOARDS[2], boardFile(['P3-01']));
  git('add', '-A'); git('commit', '-qm', 'main');
  git('branch', '-M', 'main');
  git('remote', 'add', 'origin', dir);

  // EVERY BRANCH GETS ITS OWN COMMIT, including the three that claim nothing.
  // They are poc state and report branches in the real state: they change
  // docs/poc/state.json and touch decisions/ only by carrying main's copy
  // forward. Without a distinct file git refuses the commit as empty and the
  // fixture quietly becomes five branches that are all just main.
  const branch = (name, rulings, next, extraCards) => {
    git('checkout', '-q', '-b', name, 'main');
    put('decisions/inbox.md', inboxOf(mainRulings.concat(rulings)));
    put('decisions/NEXT-RULING-ID', next + '\n');
    put(RULE_BOARDS[1], boardFile(BASE_CARDS.concat(extraCards)));
    put('docs/poc/state.json', JSON.stringify({ schema_version: 2, run_id: name }, null, 2) + '\n');
    git('add', '-A'); git('commit', '-qm', name);
  };
  branch('triage-a', rulingSeq(128, 134), 'R-135', ['RULE-07']);
  branch('triage-b', rulingSeq(135, 141), 'R-142', ['RULE-08']);
  branch('poc-1', [], 'R-128', []);
  branch('poc-2', [], 'R-128', []);
  branch('poc-3', [], 'R-128', []);
  git('checkout', '-q', 'main');
  git('fetch', '-q', 'origin');
  return { dir, git };
}

const OPEN_0906 = ['triage-a', 'triage-b', 'poc-1', 'poc-2', 'poc-3'];

/** Run a check binary in --free mode against a fixture. */
function free(check, dir, id, openBranches, self) {
  const env = {
    ...process.env,
    RC_IDS_GITROOT: dir,
    RC_SELF_BRANCH: self || 'main',
    RC_OPEN_BRANCHES: (openBranches || OPEN_0906).join(','),
  };
  try {
    return { status: 0, out: execFileSync(process.execPath, [check, '--free', id], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }) };
  } catch (e) {
    return { status: e.status === undefined ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

/** Run a check binary in its ordinary merge-time mode against a fixture. */
function mergeMode(check, dir, self, openBranches) {
  const env = {
    ...process.env,
    RC_IDS_GITROOT: dir,
    RC_SELF_BRANCH: self || 'main',
    RC_OPEN_BRANCHES: (openBranches || OPEN_0906).join(','),
  };
  try {
    return { status: 0, out: execFileSync(process.execPath, [check], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }) };
  } catch (e) {
    return { status: e.status === undefined ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

/**
 * A mutant of the whole tree, with one edit applied to the check.
 *
 * A MUTANT IS A WHOLE TREE AND NOT ONE FILE. The check imports
 * ../poc/boards.mjs by relative path; a lone mutated file cannot resolve it,
 * dies on the import and writes nothing, which looks exactly like a mutant the
 * guard correctly refused. test-ask-digest.sh records the same trap.
 *
 * `path` is null when the edit did not apply, which is a failure in its own
 * right: an anchor that no longer matches means the check has changed shape and
 * the case is stale rather than passing.
 */
function mutantCheck(edit) {
  const dir = mkdtempSync(join(tmpdir(), 'rc-free-mut-'));
  mkdirSync(join(dir, 'scripts/poc-free'), { recursive: true });
  mkdirSync(join(dir, 'scripts/poc'), { recursive: true });
  for (const f of readdirSync(join(ROOT, 'scripts/poc'))) {
    if (f.endsWith('.mjs')) cpSync(join(ROOT, 'scripts/poc', f), join(dir, 'scripts/poc', f));
  }
  const src = readFileSync(CHECK, 'utf8');
  const out = edit(src);
  if (out === src) return { path: null, dir };
  const path = join(dir, 'scripts/poc-free/check-open-branch-ids.mjs');
  writeFileSync(path, out, 'utf8');
  return { path, dir };
}

console.log('\n7. RULE-09: --free REFUSES AN ID TWO OPEN BRANCHES HAVE CONSUMED');
{
  const { dir } = repo0906();
  try {
    const r = free(CHECK, dir, 'R-128');
    record('R-128 is REFUSED on the 2026-09-06 state', r.status === 1, 'exit ' + r.status + ': ' + r.out.slice(0, 400));
    record('  ...and triage-a is named, which wrote R-128', /triage-a/.test(r.out), r.out.slice(0, 500));
    record('  ...and triage-b is named, whose counter consumed past it', /triage-b/.test(r.out), r.out.slice(0, 500));
    record('  ...and NOT one of the three branches that wrote nothing is named',
      !/poc-1/.test(r.out) && !/poc-2/.test(r.out) && !/poc-3/.test(r.out), r.out.slice(0, 700));
    record('  ...and it names the lowest id that is actually free, R-142', /Take R-142\./.test(r.out), r.out.slice(0, 500));

    const ok = free(CHECK, dir, 'R-142');
    record('R-142, which is genuinely free, is ACCEPTED', ok.status === 0 && /is FREE/.test(ok.out), 'exit ' + ok.status + ': ' + ok.out.slice(0, 400));

    const inRange = free(CHECK, dir, 'R-130');
    record('an id inside a consumed range is refused too, not only the one at its start',
      inRange.status === 1, 'exit ' + inRange.status + ': ' + inRange.out.slice(0, 300));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log('\n7a. MUTANT: the high water ignores counters, so a consumed hole is offered');
{
  // The R-087 to R-095 case, which this check's own header names: a branch
  // advanced its counter past ids it never wrote and never merged. Those ids are
  // a permanent hole. A written-ids-only rule offers one of them.
  const { dir } = repo0906();
  const m = mutantCheck((src) =>
    src.replace('      if (src.counter !== null && src.counter > mark) mark = src.counter;\n', ''));
  try {
    if (!m.path) {
      record('mutant 7a applied', false, 'the counter line no longer matches, so this case is stale');
    } else {
      const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      git('checkout', '-q', '-b', 'abandoned', 'main');
      writeFileSync(join(dir, 'decisions/NEXT-RULING-ID'), 'R-150\n');
      git('add', '-A'); git('commit', '-qm', 'abandoned');
      git('checkout', '-q', 'main');
      git('fetch', '-q', 'origin');
      const open = OPEN_0906.concat(['abandoned']);

      const control = free(m.path, dir, 'R-150', open);
      record('mutant 7a runs and still accepts a genuinely free id, so it executes',
        control.status === 0, 'exit ' + control.status + ': ' + control.out.slice(0, 300));
      const bad = free(m.path, dir, 'R-145', open);
      record('  ...and it OFFERS R-145, which a counter at R-150 already consumed',
        bad.status === 0, 'exit ' + bad.status + ': ' + bad.out.slice(0, 300));
      const good = free(CHECK, dir, 'R-145', open);
      record('  ...where the shipped check REFUSES it and names R-150',
        good.status === 1 && /Take R-150\./.test(good.out), 'exit ' + good.status + ': ' + good.out.slice(0, 400));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(m.dir, { recursive: true, force: true }); }
}

console.log('\n7b. MUTANT: card ids are not read, which is the state before this card');
{
  const { dir } = repo0906();
  const m = mutantCheck((src) =>
    src.replace('      for (const rel of BOARDS) held.cardIds.push(...cardIdsIn(read(rel), rel));\n', ''));
  try {
    if (!m.path) {
      record('mutant 7b applied', false, 'the board read no longer matches, so this case is stale');
    } else {
      const control = free(m.path, dir, 'R-142');
      record('mutant 7b runs and still answers about rulings, so it executes',
        control.status === 0, 'exit ' + control.status + ': ' + control.out.slice(0, 300));
      const bad = free(m.path, dir, 'RULE-07');
      record('  ...and it reports RULE-07 FREE, which is exactly the gap before RULE-09',
        bad.status === 0, 'exit ' + bad.status + ': ' + bad.out.slice(0, 300));

      const good = free(CHECK, dir, 'RULE-07');
      record('  ...where the shipped check REFUSES RULE-07 and names triage-a',
        good.status === 1 && /triage-a/.test(good.out), 'exit ' + good.status + ': ' + good.out.slice(0, 400));
      const eight = free(CHECK, dir, 'RULE-08');
      record('  ...and REFUSES RULE-08, naming triage-b, so it is not one branch it happens to read',
        eight.status === 1 && /triage-b/.test(eight.out), 'exit ' + eight.status + ': ' + eight.out.slice(0, 400));
      const nine = free(CHECK, dir, 'RULE-09');
      record('  ...and ACCEPTS RULE-09, which is on no board anywhere, naming RULE-09 as next',
        nine.status === 0 && /is FREE/.test(nine.out), 'exit ' + nine.status + ': ' + nine.out.slice(0, 300));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(m.dir, { recursive: true, force: true }); }
}

console.log('\n7c. MUTANT: an unreadable source is treated as empty instead of refused');
{
  const { dir } = repo0906();
  const m = mutantCheck((src) =>
    src.replace(
      "      unread.push({ ...src, why: String(err && err.message ? err.message : err).split('\\n')[0] });",
      '      holdings.push(held);',
    ));
  try {
    if (!m.path) {
      record('mutant 7c applied', false, 'the refusal push no longer matches, so this case is stale');
    } else {
      const open = OPEN_0906.concat(['does-not-exist']);
      const control = free(m.path, dir, 'R-142');
      record('mutant 7c runs and still answers on a readable fixture, so it executes',
        control.status === 0, 'exit ' + control.status + ': ' + control.out.slice(0, 300));
      const bad = free(m.path, dir, 'R-142', open);
      record('  ...and with a branch it cannot read it reports FREE anyway',
        bad.status === 0, 'exit ' + bad.status + ': ' + bad.out.slice(0, 300));

      const good = free(CHECK, dir, 'R-142', open);
      record('  ...where the shipped check exits 2 and names the source it could not read',
        good.status === 2 && /does-not-exist/.test(good.out) && /COULD NOT BE READ/.test(good.out),
        'exit ' + good.status + ': ' + good.out.slice(0, 400));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(m.dir, { recursive: true, force: true }); }
}

console.log('\n7d. MUTANT: a source is dropped from the list, and the count assertion catches it');
{
  const { dir } = repo0906();
  const DROP_ANCHOR = '    sources.push({ label: branch, ref: `refs/remotes/origin/${branch}`, pr });';
  const DROP_EDIT = '    if (branch !== "triage-a") sources.push({ label: branch, ref: `refs/remotes/origin/${branch}`, pr });';
  const COUNT_ANCHOR = '  if (all.length + unread.length !== offered) {';

  // BOTH ANCHORS ARE REQUIRED BEFORE EITHER EDIT IS MADE. An edit function that
  // applies one of two replacements still returns a changed file, so mutantCheck
  // would report it applied while the mutation it was built to make had silently
  // not happened. That is exactly how this case first passed against a check that
  // had already been fixed underneath it.
  const bothAnchors = (src) => src.includes(DROP_ANCHOR) && src.includes(COUNT_ANCHOR);

  // Skipping AND unasserted: the shape a silent skip has when nobody is counting.
  const blind = mutantCheck((src) =>
    (bothAnchors(src) ? src.replace(DROP_ANCHOR, DROP_EDIT).replace(COUNT_ANCHOR, '  if (false) {') : src));
  // Skipping only: the SAME skip with the assertion intact.
  const watched = mutantCheck((src) => (bothAnchors(src) ? src.replace(DROP_ANCHOR, DROP_EDIT) : src));
  try {
    if (!blind.path || !watched.path) {
      record('the source push and count assertion still match', false, 'the source loop has changed shape, so this case is stale');
    } else {
      const control = free(blind.path, dir, 'R-142');
      record('mutant 7d runs and still answers, so it executes',
        control.status === 0 || control.status === 1, 'exit ' + control.status + ': ' + control.out.slice(0, 300));
      const skipped = free(blind.path, dir, 'R-128');
      record('  ...and with triage-a dropped and nobody counting, it answers anyway',
        skipped.status === 0 || skipped.status === 1, 'exit ' + skipped.status + ': ' + skipped.out.slice(0, 300));
      const caught = free(watched.path, dir, 'R-128');
      record('  ...where the SAME skip with the assertion intact exits 2 and says one was skipped',
        caught.status === 2 && /silently skipped/.test(caught.out), 'exit ' + caught.status + ': ' + caught.out.slice(0, 400));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(blind.dir, { recursive: true, force: true });
    rmSync(watched.dir, { recursive: true, force: true });
  }
}

console.log('\n7e. MUTANT: the holdings report goes back to an equality test');
{
  // Clause (b) on the MERGE-TIME path: the note that named three branches
  // holding nothing and stayed silent about two holding fourteen ids.
  const { dir } = repo0906();
  const m = mutantCheck((src) =>
    src.replace('  const consumedAbove = base !== null && theirNext > base;',
      '  const consumedAbove = base !== null && theirNext === base;'));
  try {
    if (!m.path) {
      record('mutant 7e applied', false, 'the consumed-range line no longer matches, so this case is stale');
    } else {
      const bad = mergeMode(m.path, dir, 'main');
      record('mutant 7e runs and still reports, so it executes', bad.out.length > 0, bad.out.slice(0, 300));
      record('  ...and with an equality test it names poc-1, which holds nothing',
        /poc-1/.test(bad.out), bad.out.slice(0, 800));

      const good = mergeMode(CHECK, dir, 'main');
      record('  ...where the shipped check names triage-a and triage-b, which hold the ids',
        /holds: triage-a/.test(good.out) && /holds: triage-b/.test(good.out), good.out.slice(0, 800));
      record('  ...and names NONE of the three that hold nothing',
        !/holds: poc-1/.test(good.out) && !/holds: poc-2/.test(good.out) && !/holds: poc-3/.test(good.out), good.out.slice(0, 800));
      record('  ...and gives each one a CEILING a reader can act on, not an overlapping range',
        /counter R-135, so no id below R-135 is free/.test(good.out)
        && /counter R-142, so no id below R-142 is free/.test(good.out), good.out.slice(0, 800));
      record('  ...and lists what each actually wrote beyond main',
        /wrote R-128, R-129, R-130, R-131, R-132, R-133, R-134/.test(good.out)
        && /wrote R-135, R-136, R-137, R-138, R-139, R-140, R-141/.test(good.out), good.out.slice(0, 800));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(m.dir, { recursive: true, force: true }); }
}

console.log('\n7f. AN ID IT CANNOT READ IS REFUSED, NOT GUESSED AT');
{
  const { dir } = repo0906();
  try {
    const r = free(CHECK, dir, 'not-an-id');
    record('a malformed id exits 2 rather than answering about it',
      r.status === 2 && /is not an id/.test(r.out), 'exit ' + r.status + ': ' + r.out.slice(0, 300));
    const u = free(CHECK, dir, 'R-142', []);
    record('an empty open branch list still answers, because main is a source on its own',
      u.status === 0, 'exit ' + u.status + ': ' + u.out.slice(0, 300));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}


const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} of ${results.length} proofs passed`);
if (failed > 0) process.exit(1);
