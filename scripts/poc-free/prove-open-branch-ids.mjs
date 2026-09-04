#!/usr/bin/env node
// prove-open-branch-ids.mjs
// Card RULE-04. Proves check-open-branch-ids.mjs REFUSES a cross-branch
// collision, on fixtures built for it. A check that has never been seen to fail
// is not a check.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} of ${results.length} proofs passed`);
if (failed > 0) process.exit(1);
