#!/usr/bin/env node
// prove-live-fixtures.mjs
// Card FIXTURE-01. Proves check-live-fixtures.mjs REFUSES, on fixtures built for
// it. A check that has never been seen to fail is not a check.
//
// THE FIRST CASE IS NOT A FIXTURE AT ALL. It runs the check against
// `scripts/poc/test-ask-digest.sh` AS IT ACTUALLY STOOD on 2026-09-03, read out
// of this repository's own history at 4b2b853, which is the last commit to touch
// that file before the incident and before the neutralisation landed in d3a8474
// on 2026-09-04. The card asks for exactly that: the case must FAIL against the
// file as it stood and PASS against it as it stands now. A hand-written
// approximation of the old file would prove that the approximation fails.
//
// Every other case is a throwaway tree. No network, no database, no secret.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const CHECK = join(ROOT, 'scripts/poc-free/check-live-fixtures.mjs');
const PRE_NEUTRALISATION = '4b2b853';

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  if (!pass && detail) console.log(`      ${String(detail).split('\n').slice(0, 12).join('\n      ')}`);
};

function run(root) {
  const env = { ...process.env, RC_FIXTURES_ROOT: root };
  try {
    return { status: 0, out: execFileSync(process.execPath, [CHECK], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }) };
  } catch (e) {
    return { status: e.status === undefined ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

/** A tree with `scripts/poc/` and `tests/`, and whatever files are handed in. */
function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'rc-fixtures-'));
  mkdirSync(join(dir, 'scripts/poc'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body, 'utf8');
  }
  return dir;
}

const gitShow = (rev, path) =>
  execFileSync('git', ['show', `${rev}:${path}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// ===========================================================================
console.log('1. THE FILE AS IT ACTUALLY STOOD ON 2026-09-03 IS REFUSED');
// ===========================================================================
{
  let old = null;
  try { old = gitShow(PRE_NEUTRALISATION, 'scripts/poc/test-ask-digest.sh'); } catch { old = null; }
  if (old === null) {
    record(`the pre-neutralisation revision ${PRE_NEUTRALISATION} is readable`, false,
      'This case is about a real historical file. A hand-written stand-in would prove nothing about it.');
  } else {
    record(`the pre-neutralisation revision ${PRE_NEUTRALISATION} carries NO neutralisation`,
      !old.includes('neutralised'), 'the fixture already has one, so this revision is the wrong one');
    const dir = tree({ 'scripts/poc/test-ask-digest.sh': old });
    try {
      const r = run(dir);
      record('the check REFUSES it', r.status === 1, `exit ${r.status}: ${r.out.slice(0, 500)}`);
      record('  ...and names the case 6 copy, the one that was bitten',
        /test-ask-digest\.sh::WORK/.test(r.out), r.out.slice(0, 700));
      record('  ...and says the neutralisation it was declared to have is not there',
        /no longer contains the neutralisation/.test(r.out), r.out.slice(0, 700));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
}

// ===========================================================================
console.log('\n2. THE CONTROL: the tree as it stands now PASSES');
// ===========================================================================
{
  const r = run(ROOT);
  record('the live tree is accepted', r.status === 0, `exit ${r.status}: ${r.out.slice(0, 500)}`);
  record('  ...and it found the three sites rather than none',
    /3 site\(s\)/.test(r.out), r.out.slice(0, 400));
  record('  ...and read the tree rather than reporting clean about nothing',
    /file\(s\) under scripts\/poc, tests/.test(r.out) && !/ 0 file\(s\)/.test(r.out), r.out.slice(0, 400));
}

// ===========================================================================
console.log('\n3. A COPY DECLARED NOWHERE IS REFUSED');
// ===========================================================================
{
  const dir = tree({
    'scripts/poc/test-new-thing.sh': [
      '#!/bin/bash',
      'WORK=$(mktemp -d)',
      'NEWFIX=$WORK/board.json',
      'cp "$REPO_ROOT/docs/board/rc-board-phase2.json" "$NEWFIX"',
      'echo done',
      '',
    ].join('\n'),
  });
  try {
    const r = run(dir);
    record('an undeclared live-artefact copy is refused', r.status === 1, `exit ${r.status}: ${r.out.slice(0, 400)}`);
    record('  ...and it is named by file and destination',
      /test-new-thing\.sh::NEWFIX/.test(r.out), r.out.slice(0, 500));
    record('  ...and the line number is given, so it can be found',
      /line\(s\) 4/.test(r.out), r.out.slice(0, 500));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ===========================================================================
console.log('\n4. A NEUTRALISATION THAT IS DELETED TURNS IT RED');
// ===========================================================================
{
  const live = readFileSync(join(ROOT, 'scripts/poc/test-ask-digest.sh'), 'utf8');
  const MARKER = 'neutralised " + n + " card(s) blocked on ivan for the quiet baseline';
  if (!live.includes(MARKER)) {
    record('the live file carries the neutralisation marker', false, 'the marker has changed shape, so this case is stale');
  } else {
    const dir = tree({ 'scripts/poc/test-ask-digest.sh': live.replace(MARKER, 'quietly did something') });
    try {
      const r = run(dir);
      record('deleting the neutralisation refuses', r.status === 1, `exit ${r.status}: ${r.out.slice(0, 400)}`);
      record('  ...naming the site whose declaration no longer describes it',
        /test-ask-digest\.sh::WORK/.test(r.out) && /no longer contains the neutralisation/.test(r.out), r.out.slice(0, 600));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
}

// ===========================================================================
console.log('\n5. AN EXEMPTION WHOSE LOUD FAILURE IS DELETED TURNS IT RED');
// ===========================================================================
{
  // An exemption says: this DOES depend on live state, and when that dependency
  // fails the file says so instead of passing. Delete the saying-so and the
  // exemption is the defect with a note attached.
  const live = readFileSync(join(ROOT, 'scripts/poc/test-ask-digest.sh'), 'utf8');
  const LOUD = 'no todo card on the fixture board to expire against';
  if (!live.includes(LOUD)) {
    record('the live file carries the loud failure', false, 'the message has changed, so this case is stale');
  } else {
    const dir = tree({ 'scripts/poc/test-ask-digest.sh': live.replace(LOUD, 'skipping') });
    try {
      const r = run(dir);
      record('deleting the loud failure refuses', r.status === 1, `exit ${r.status}: ${r.out.slice(0, 400)}`);
      record('  ...naming the exempt site that stopped failing loudly',
        /test-ask-digest\.sh::FIXTURE/.test(r.out) && /no longer contains the loud failure/.test(r.out), r.out.slice(0, 600));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
}

// ===========================================================================
console.log('\n6. A DECLARATION FOR A COPY THAT NO LONGER EXISTS IS REFUSED');
// ===========================================================================
{
  // The stale-allow-list failure check-action-pins already refuses: an entry
  // sitting there covering whatever takes its place.
  const dir = tree({ 'scripts/poc/nothing-copies-here.sh': '#!/bin/bash\necho hello\n' });
  try {
    const r = run(dir);
    record('every declaration with no matching copy is refused', r.status === 1, `exit ${r.status}: ${r.out.slice(0, 400)}`);
    record('  ...and says a stale entry covers whatever takes its place',
      /no such copy any more/.test(r.out), r.out.slice(0, 500));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ===========================================================================
console.log('\n7. IT FAILS CLOSED ON A TREE IT DID NOT OPEN');
// ===========================================================================
{
  const dir = mkdtempSync(join(tmpdir(), 'rc-fixtures-empty-'));
  try {
    const r = run(dir);
    record('a tree with no readable files exits 2 rather than reporting clean', r.status === 2, `exit ${r.status}: ${r.out.slice(0, 400)}`);
    record('  ...and says it is refusing to report clean about a tree it did not open',
      /Refusing to report clean/.test(r.out), r.out.slice(0, 400));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ===========================================================================
console.log('\n8. THE CONTROLS THAT MUST NOT BE FLAGGED');
// ===========================================================================
{
  // (a) A second-order copy: the source is already a fixture, so the decision
  // about live state was made where the fixture was built.
  // (b) Production code READING live state, which the card's defaults put out of
  // scope in terms: the defect is a test asserting something live state is not
  // guaranteed to satisfy, not a program doing its job with it.
  const dir = tree({
    'scripts/poc/test-second-order.sh': [
      '#!/bin/bash',
      'FIXTURE=$WORK/repo',
      'cp "$FIXTURE/docs/board/rc-board-phase2.json" "$RE_BOARD"',
      '',
    ].join('\n'),
    'scripts/poc/reader.mjs': [
      'import { readFileSync } from "node:fs";',
      'import { join } from "node:path";',
      'const REPO_ROOT = "/somewhere";',
      'const board = readFileSync(join(REPO_ROOT, "docs", "board", "rc-board-phase2.json"), "utf8");',
      'console.log(board.length);',
      '',
    ].join('\n'),
    'scripts/poc/commented.sh': [
      '#!/bin/bash',
      '# cp "$REPO_ROOT/docs/board/rc-board-phase2.json" "$WORK/x.json"  <- a comment, not a copy',
      'echo hi',
      '',
    ].join('\n'),
  });
  try {
    const r = run(dir);
    record('none of the three is treated as a live-artefact fixture copy',
      /live-artefact copies 0 site\(s\)/.test(r.out), r.out.slice(0, 500));
    // The run still fails, because the real declarations are stale against this
    // tree. That is case 6's property and it is asserted there; here the only
    // question is whether these three produced a SITE, and they did not.
    record('  ...so the only complaint is the stale declarations, not a new site',
      !/test-second-order/.test(r.out) && !/reader\.mjs/.test(r.out) && !/commented\.sh/.test(r.out), r.out.slice(0, 600));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} of ${results.length} proofs passed`);
if (failed > 0) process.exit(1);
