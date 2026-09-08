#!/usr/bin/env node
// prove-grant-revocation.mjs
// Card GATE-03. Proves check-grant-revocation.mjs REFUSES, on fixtures built for
// it. A check that has never been seen to fail is not a check.
//
// CASE 1 IS THE DEFECT ITSELF, RECONSTRUCTED. R-082 declared "REVOKED BY P2-13"
// and P2-13's acceptance did not name R-082, so the checklist that will be run on
// rotation day would have revoked the grants it enumerated and left that one
// standing. The fixture is that shape and nothing else.
//
// No network, no git, no database. Every case is a throwaway directory.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const CHECK = join(ROOT, 'scripts/poc-free/check-grant-revocation.mjs');

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  if (!pass && detail) console.log(`      ${String(detail).split('\n').slice(0, 12).join('\n      ')}`);
};

function run(root) {
  const env = { ...process.env, RC_GRANTS_ROOT: root };
  try {
    return { status: 0, out: execFileSync(process.execPath, [CHECK], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }) };
  } catch (e) {
    return { status: e.status === undefined ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

const board = (cards) =>
  `${JSON.stringify({ board: 'fixture', schema_version: 1, as_of: '2026-09-07T00:00:00Z', cards }, null, 2)}\n`;

/**
 * A tree the check can read: three boards and an inbox.
 *
 * `rulings` is a list of raw ruling bodies. `p213` is P2-13's acceptance text,
 * which is the checklist under test. Extra files are written verbatim.
 */
function tree({ rulings, p213 = 'nothing here', extra = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'rc-grants-'));
  const put = (rel, body) => {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body, 'utf8');
  };
  put('decisions/inbox.md', rulings.join('\n\n'));
  put('docs/board/rc-board.json', board([{ id: 'P1-01', acceptance: 'done' }]));
  put('docs/board/rc-board-phase2.json', board([
    { id: 'P2-13', acceptance: p213 },
    { id: 'GATE-03', acceptance: 'the check exists' },
  ]));
  put('docs/board/rc-board-phase3.json', board([{ id: 'P3-01', acceptance: 'done' }]));
  for (const [rel, body] of Object.entries(extra)) put(rel, body);
  return dir;
}

const R = (id, heading, body) => `### ${id} - ${heading}\n\n${body}\n`;
// The three rulings the shipped NOT_A_GRANT table excuses. Every fixture carries
// them, because a table entry matching no hit is itself a failure and would make
// every case below red for a reason none of them is about.
const EXCUSED = [
  R('R-024', 'resequencing', 'P2-13 revokes the migration-apply grant, rotates every credential.'),
  R('R-101', 'gate audit', 'P2-13 revokes every terminal grant, and this audit reports on it.'),
  R('R-126', 'gate audit', 'Neither is a credential and neither is revoked by P2-13.'),
];

// ===========================================================================
console.log('1. THE DEFECT ITSELF: a grant declares its revoking card and is not named back');
// ===========================================================================
{
  const grant = R('R-082', 'migration apply under assertion',
    'A terminal may apply merged migrations through the assertion-bearing applier.\n\nREVOKED BY P2-13, with every other terminal grant, per 8.7.');
  const dir = tree({ rulings: [...EXCUSED, grant], p213: 'rotate SUPABASE_DB_PASSWORD and revert section 8.' });
  try {
    const r = run(dir);
    record('it is REFUSED', r.status === 1, `exit ${r.status}: ${r.out.slice(0, 400)}`);
    record('  ...naming the grant', /R-082 says it is revoked by P2-13/.test(r.out), r.out.slice(0, 500));
    record('  ...and naming the field it looked in',
      /P2-13\.acceptance/.test(r.out), r.out.slice(0, 500));
    record('  ...and saying what to do about it',
      /Add R-082 to that checklist as its own tickable item/.test(r.out), r.out.slice(0, 600));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ===========================================================================
console.log('\n2. THE CONTROL: the same fixture with the id in the checklist PASSES');
// ===========================================================================
{
  const grant = R('R-082', 'migration apply under assertion',
    'REVOKED BY P2-13, with every other terminal grant, per 8.7.');
  const dir = tree({
    rulings: [...EXCUSED, grant],
    p213: 'rotate SUPABASE_DB_PASSWORD, and a box confirming the R-082 applier grant is revoked.',
  });
  try {
    const r = run(dir);
    record('a checklist that names the grant is accepted', r.status === 0, `exit ${r.status}: ${r.out.slice(0, 400)}`);
    record('  ...and it says which of the two ends it read',
      /named by the checklist   1 of 1/.test(r.out), r.out.slice(0, 400));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ===========================================================================
console.log('\n3. R-059s SHAPE: "Revoked with every other terminal grant AT P2-13"');
// ===========================================================================
{
  // The first three patterns did not match this and it is a real grant. It was
  // found by reading R-059, not by the check reporting it, which is the reason
  // this case exists rather than a note in a comment.
  const grant = R('R-059', 'self-merge widens to every path',
    'CLAUDE.md 3.1. Revoked with every other terminal grant at P2-13.');
  const dir = tree({ rulings: [...EXCUSED, grant], p213: 'rotate the credentials.' });
  try {
    const r = run(dir);
    record('the "revoked with ... at P2-13" wording is detected and refused', r.status === 1, `exit ${r.status}: ${r.out.slice(0, 400)}`);
    record('  ...naming R-059', /R-059 says it is revoked by P2-13/.test(r.out), r.out.slice(0, 500));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ===========================================================================
console.log('\n4. A HIT THAT IS NOT A GRANT MUST BE DECLARED, NOT SILENTLY DROPPED');
// ===========================================================================
{
  // A gate audit that says "neither is revoked by P2-13" matches the pattern and
  // is not a grant. The check does not try to read the negation: it refuses, and
  // the judgement goes in NOT_A_GRANT where it can be read in a diff.
  const audit = R('R-200', 'a gate audit written after this check shipped',
    'Neither of those is a credential and neither is revoked by P2-13.');
  const dir = tree({ rulings: [...EXCUSED, audit], p213: 'rotate the credentials.' });
  try {
    const r = run(dir);
    record('an undeclared new hit is refused rather than guessed at', r.status === 1, `exit ${r.status}: ${r.out.slice(0, 400)}`);
    record('  ...naming it, so somebody decides in a diff',
      /R-200 says it is revoked by P2-13/.test(r.out), r.out.slice(0, 500));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ===========================================================================
console.log('\n5. A STALE NOT_A_GRANT ENTRY IS REFUSED');
// ===========================================================================
{
  // R-024, R-101 and R-126 are excused by the shipped table. A tree where none of
  // them says this any more must refuse, because an exemption for a ruling that
  // no longer matches sits there covering whatever takes its place.
  const dir = tree({
    rulings: [R('R-082', 'a grant', 'REVOKED BY P2-13.')],
    p213: 'a box confirming the R-082 grant is revoked.',
  });
  try {
    const r = run(dir);
    record('a declaration matching no hit is refused', r.status === 1, `exit ${r.status}: ${r.out.slice(0, 400)}`);
    record('  ...naming all three stale entries',
      /R-024 is listed in NOT_A_GRANT/.test(r.out) && /R-101 is listed in NOT_A_GRANT/.test(r.out) && /R-126 is listed in NOT_A_GRANT/.test(r.out),
      r.out.slice(0, 800));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ===========================================================================
console.log('\n6. THE RUNBOOK COUNTS AS A CHECKLIST THE DAY IT EXISTS');
// ===========================================================================
{
  // P2-13's acceptance names docs/RUNBOOK-CREDENTIAL-ROTATION.md, which does not
  // exist until P2-13 is worked. When it does, a grant named THERE is named.
  const grant = R('R-082', 'a grant', 'REVOKED BY P2-13.');
  const dir = tree({
    rulings: [...EXCUSED, grant],
    p213: 'the checklist document is committed and every box is ticked.',
    extra: { 'docs/RUNBOOK-CREDENTIAL-ROTATION.md': '# rotation\n\n- [ ] revoke the R-082 applier grant\n' },
  });
  try {
    const r = run(dir);
    record('a grant named only in the runbook is accepted', r.status === 0, `exit ${r.status}: ${r.out.slice(0, 400)}`);
    record('  ...and the runbook is named as the place it was found',
      /RUNBOOK-CREDENTIAL-ROTATION\.md/.test(r.out), r.out.slice(0, 500));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ===========================================================================
console.log('\n7. A REVOKING CARD THAT IS ON NO BOARD IS REFUSED');
// ===========================================================================
{
  const grant = R('R-300', 'a grant pointing at a card nobody wrote', 'REVOKED BY NOSUCH-99.');
  const dir = tree({ rulings: [...EXCUSED, grant], p213: 'rotate the credentials.' });
  try {
    const r = run(dir);
    record('a grant whose revoking card does not exist is refused', r.status === 1, `exit ${r.status}: ${r.out.slice(0, 400)}`);
    record('  ...and says a grant nothing will ever end',
      /is on no board/.test(r.out) && /nothing will ever end/.test(r.out), r.out.slice(0, 500));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ===========================================================================
console.log('\n8. IT FAILS CLOSED');
// ===========================================================================
{
  // An inbox with no ruling headings would produce zero hits, and zero hits read
  // as "no grant is unnamed", which is the empty-result failure class
  // docs/LEARNINGS.md names.
  const empty = tree({ rulings: ['just some prose with no ruling headings at all'] });
  try {
    const r = run(empty);
    record('an inbox with no rulings exits 2 rather than reporting clean', r.status === 2, `exit ${r.status}: ${r.out.slice(0, 400)}`);
    record('  ...and says why an empty result is not a clean one',
      /would read as "no grant is unnamed"/.test(r.out), r.out.slice(0, 500));
  } finally { rmSync(empty, { recursive: true, force: true }); }

  const noInbox = mkdtempSync(join(tmpdir(), 'rc-grants-bare-'));
  try {
    const r = run(noInbox);
    record('an unreadable inbox exits 2', r.status === 2, `exit ${r.status}: ${r.out.slice(0, 300)}`);
  } finally { rmSync(noInbox, { recursive: true, force: true }); }

  const badBoard = tree({ rulings: [...EXCUSED, R('R-082', 'a grant', 'REVOKED BY P2-13.')] });
  writeFileSync(join(badBoard, 'docs/board/rc-board-phase2.json'), '{ not json\n');
  try {
    const r = run(badBoard);
    record('a board that does not parse exits 2', r.status === 2 && /does not parse/.test(r.out), `exit ${r.status}: ${r.out.slice(0, 300)}`);
  } finally { rmSync(badBoard, { recursive: true, force: true }); }

  const emptyBoard = tree({ rulings: [...EXCUSED, R('R-082', 'a grant', 'REVOKED BY P2-13.')] });
  writeFileSync(join(emptyBoard, 'docs/board/rc-board-phase2.json'), board([]));
  try {
    const r = run(emptyBoard);
    record('a board with no cards exits 2, because it names no grant',
      r.status === 2 && /has no cards/.test(r.out), `exit ${r.status}: ${r.out.slice(0, 300)}`);
  } finally { rmSync(emptyBoard, { recursive: true, force: true }); }
}

// ===========================================================================
console.log('\n9. THE LIVE REPOSITORY PASSES');
// ===========================================================================
{
  const r = run(ROOT);
  record('the tree as it stands is accepted', r.status === 0, `exit ${r.status}: ${r.out.slice(0, 600)}`);
  record('  ...with every declared grant named by the checklist that revokes it',
    /named by the checklist   7 of 7/.test(r.out), r.out.slice(0, 600));
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} of ${results.length} proofs passed`);
if (failed > 0) process.exit(1);
