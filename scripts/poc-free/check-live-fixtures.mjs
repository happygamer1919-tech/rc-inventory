#!/usr/bin/env node
// check-live-fixtures.mjs
// Card FIXTURE-01. A TEST WHOSE FIXTURE IS LIVE STATE PASSES ON AN ACCIDENTAL
// PROPERTY OF THAT STATE.
//
// ===========================================================================
// THE INSTANCE, MEASURED RATHER THAN IMAGINED
// ===========================================================================
//
// `scripts/poc/test-ask-digest.sh` case 6 asserts the digest is SILENT with
// nothing outstanding, and it built its fixture by copying the LIVE phase 2
// board. `digest.mjs` counts a card that is `status: blocked` with
// `blocked_on: "ivan"` as an outstanding question, and it is right to: that is an
// owner action nobody else can discharge.
//
// So the assertion held only while the live board happened to contain no such
// card. THE NUMBER OF CARDS BLOCKED ON IVAN ON `main` WAS ZERO, and the assertion
// had been passing on that and on nothing else since it was written. On
// 2026-09-03 card MIG-01 was authored blocked on Ivan, exactly as CLAUDE.md
// section 4 requires of a decision a terminal may not make, and three assertions
// turned red:
//
//     FAIL  the first run sent 1 digest(s) with nothing outstanding
//     FAIL  an unchanged board produced 3 digest(s)
//     FAIL  the digest kept nagging after the question was answered
//
// The card was correct. The digest was correct. The fixture was wrong.
//
// A GATE THAT GOES RED WHEN THE DOCTRINE IS OBEYED TRAINS TERMINALS OUT OF
// OBEYING IT. The cheap exit was to drop MIG-01's `blocked_on` and go green.
//
// ===========================================================================
// WHAT THIS FILE REFUSES
// ===========================================================================
//
// Every place under `scripts/poc/` or `tests/` that COPIES a live artefact out of
// this repository into a fixture. Each such place must be declared, in one of two
// tables, and a place in neither is a failure:
//
//   NEUTRALISED  the fixture is copied and then the property the assertion
//                depends on is CLEARED, and the file says so out loud. The entry
//                names a `marker` that must still be present, so deleting the
//                neutralisation turns this check red rather than turning the
//                assertion silently accidental again.
//
//   EXEMPT       the assertion does depend on a property of live state, and when
//                that property fails the file FAILS LOUDLY AND NAMES IT rather
//                than passing. The entry names the `property` in words and the
//                `loud` string the file prints, and that string must still be
//                present. An exemption with no loud failure is not an exemption,
//                it is the defect with a note attached.
//
// A TABLE ENTRY THAT MATCHES NO SITE IS ALSO A FAILURE. An exemption for a copy
// that no longer exists sits there covering whatever takes its place, which is
// the stale-allow-list failure `check-action-pins` already refuses.
//
// NEUTRALISE, DO NOT FREEZE. A checked-in snapshot of the board would be
// reproducible and would then ROT: it would keep passing against a board shape
// the product no longer has, which is worse because it is silent. Copying the
// live file and then clearing the specific property keeps the fixture current AND
// makes the dependency explicit.
//
// THIS IS ABOUT FIXTURES, NOT ABOUT READING LIVE STATE. `check-card-ids`, the
// board validators, `notify.mjs`, `ask.sh` and `digest.sh` all read the live
// board deliberately, to assert something about it or to do their job with it.
// That is correct and is out of scope. The defect is a test that reads live state
// and then asserts something the live state is not guaranteed to satisfy.
//
// SCOPE IS `scripts/poc/` AND `tests/`, which is what the card names.
// `scripts/poc-free/` was surveyed on 2026-09-07 and has NO sites:
// `prove-claim-merge.mjs` and `prove-open-branch-ids.mjs` both build their
// fixtures from scratch. Adding that directory is a one-line change to ROOTS
// below on the day one of them starts copying.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.env.RC_FIXTURES_ROOT || new URL('../..', import.meta.url).pathname;
const ROOTS = ['scripts/poc', 'tests'];

// A live artefact: the product's own record, not a test's. A path matching one of
// these under the repository root is state that moves when the work moves.
const ARTEFACT = /docs\/board\/[A-Za-z0-9._-]+\.json|docs\/poc\/[A-Za-z0-9._-]+\.json|decisions\/[A-Za-z0-9._-]+/;

// A copy, in the two languages this repository writes tests in.
const COPY = /(^|[\s;(&|])cp\s|cpSync\s*\(|copyFileSync\s*\(/;

// The source is the LIVE repository and not another fixture. `cp "$FIXTURE/..."`
// is a second-order copy of something already neutralised or already exempt, and
// flagging it would demand a second declaration of one decision.
const LIVE_SOURCE = /\$\{?REPO_ROOT\}?|\$\{?ASK_REPO_ROOT\}?|\bROOT\s*,\s*['"]docs|join\(\s*ROOT\s*,|\$\{?HERE\}?\/\.\.\/\.\./;

// ---------------------------------------------------------------------------
// THE DECLARED SITES
// ---------------------------------------------------------------------------
// Keyed by `<file>::<destination>`, where the destination is the shell or node
// variable the copy lands in. A line number would drift on every edit above it;
// a destination names the fixture the copy is FOR, which is the thing being
// declared about.

const NEUTRALISED = [
  {
    site: 'scripts/poc/test-ask-digest.sh::WORK',
    what: 'case 6, the quiet baseline. Every card blocked on ivan is set back to todo before the digest is asked whether it should speak.',
    marker: 'neutralised " + n + " card(s) blocked on ivan for the quiet baseline',
  },
];

const EXEMPT = [
  {
    site: 'scripts/poc/test-ask-digest.sh::FIXTURE',
    property: 'at least one card on the phase 2 board is `todo` with `blocked_on: null`, so ask.sh has something whose transition to blocked is visible.',
    why: 'Neutralising would mean INJECTING a card, and the fixture runs the real validate-board.mjs over the result, so an injected card has to satisfy the whole planning contract. The property is cheap to state and the file already refuses loudly when it fails.',
    loud: 'no todo card on the fixture board to expire against',
  },
  {
    site: 'scripts/poc/test-ask-digest.sh::DT_DIR',
    property: 'the rendered full digest exceeds 4096 characters, so case 10s restored-cap mutant reaches the boundary it is about.',
    why: 'The length comes from the real boards plus four padding escalations the case writes itself. Freezing the boards would make the case stop tracking the digest the product actually renders. The case asserts separately that the restored cap FIRED, so a board set that shrinks below the boundary reports itself.',
    loud: 'so this digest is under 4096 and the case proves nothing',
  },
];

// ---------------------------------------------------------------------------

const problems = [];
const say = (m) => console.log(m);

function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * Logical lines: a shell continuation is one statement written over several
 * lines, and `cp a \` on one line with its destination on the next is one copy.
 * Reading them separately would put the source in one line and the destination in
 * another, and the destination is the key this file is grouped by.
 */
function logicalLines(text) {
  const raw = text.split('\n');
  const out = [];
  let buf = '';
  let start = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i];
    if (buf === '') start = i + 1;
    if (line.endsWith('\\')) { buf += line.slice(0, -1) + ' '; continue; }
    out.push({ text: buf + line, line: start });
    buf = '';
  }
  if (buf !== '') out.push({ text: buf, line: start });
  return out;
}

/** The fixture a copy lands in: the first variable in its last token. */
function destinationOf(text) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const m = /\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/.exec(tokens[i]);
    if (m) return m[1];
  }
  return '(unknown)';
}

const files = ROOTS.flatMap((r) => walk(join(ROOT, r)));
const sites = new Map();
let scanned = 0;

for (const file of files) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  // A binary fixture is not a copy of live state; skip it without counting it as
  // scanned, so the count below is the count of files actually read.
  if (text.includes(' ')) continue;
  scanned += 1;
  const rel = relative(ROOT, file);
  for (const { text: line, line: no } of logicalLines(text)) {
    const bare = line.trim();
    if (bare.startsWith('#') || bare.startsWith('//') || bare.startsWith('*')) continue;
    if (!COPY.test(line)) continue;
    if (!ARTEFACT.test(line)) continue;
    if (!LIVE_SOURCE.test(line)) continue;
    const key = `${rel}::${destinationOf(line)}`;
    if (!sites.has(key)) sites.set(key, { key, rel, lines: [] });
    sites.get(key).lines.push(no);
  }
}

say(`check-live-fixtures: ${scanned} file(s) under ${ROOTS.join(', ')}`);
say(`  live-artefact copies ${sites.size} site(s)`);

const declared = new Map();
for (const e of NEUTRALISED) declared.set(e.site, { ...e, kind: 'neutralised' });
for (const e of EXEMPT) declared.set(e.site, { ...e, kind: 'exempt' });

for (const [key, site] of [...sites].sort()) {
  const d = declared.get(key);
  if (!d) {
    problems.push(
      `${key} copies a live artefact into a fixture and is declared nowhere.\n` +
      `      line(s) ${site.lines.join(', ')}\n` +
      '      Neutralise the property the assertion depends on and add it to NEUTRALISED,\n' +
      '      or add it to EXEMPT naming that property and the message the file prints\n' +
      '      when it fails. A fixture built from live state passes on whatever that state\n' +
      '      happens to be.',
    );
    continue;
  }
  const text = readFileSync(join(ROOT, site.rel), 'utf8');
  const needle = d.kind === 'neutralised' ? d.marker : d.loud;
  if (!text.includes(needle)) {
    problems.push(
      `${key} is declared ${d.kind}, but the file no longer contains the ${d.kind === 'neutralised' ? 'neutralisation' : 'loud failure'} it names.\n` +
      `      expected to find: ${JSON.stringify(needle)}\n` +
      '      A declaration that outlives the thing it describes is a note, not a guard.',
    );
    continue;
  }
  say(`  ${d.kind === 'neutralised' ? 'neutralised' : 'exempt    '}  ${key}  (line ${site.lines.join(', ')})`);
}

for (const [key, d] of declared) {
  if (sites.has(key)) continue;
  problems.push(
    `${key} is declared ${d.kind} and there is no such copy any more.\n` +
    '      A stale entry sits there covering whatever takes its place. Remove it.',
  );
}

// THE COUNT IS ASSERTED. A walker that returned nothing would report a clean tree,
// which is the failure class docs/LEARNINGS.md names: an empty result reading as
// nothing to do.
if (scanned === 0) {
  console.error('\ncheck-live-fixtures: NO FILES WERE READ under ' + ROOTS.join(', ') + '.');
  console.error('  Refusing to report clean about a tree this did not open.');
  process.exit(2);
}

if (problems.length > 0) {
  console.error('\ncheck-live-fixtures: A FIXTURE IS BUILT FROM LIVE STATE AND NOT DECLARED.\n');
  for (const p of problems) console.error(`  ${p}\n`);
  console.error('A test whose fixture is live state passes on an accidental property of that');
  console.error('state. It does not fail when the code breaks, it fails when the data moves,');
  console.error('and the work gets blamed instead of the test. FIXTURE-01.');
  process.exit(1);
}

console.log(`check-live-fixtures: OK. ${sites.size} live-artefact fixture copy site(s), every one neutralised or exempt with its reason.`);
