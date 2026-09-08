#!/usr/bin/env node
// check-grant-revocation.mjs
// Card GATE-03. A GRANT THAT NAMES ITS REVOKING CARD MUST BE NAMED BACK.
//
// ===========================================================================
// THE EDGE, AND WHY IT IS DIRECTIONAL
// ===========================================================================
//
// R-072 wrote P2-13's capability clause. R-082 created a NEW grant of exactly
// the class that clause exists to revoke, AFTER it was written, so the clause
// could not have known about it. `CLAUDE.md` 8.7 covered it only through the
// blanket phrase "reverting section 8 to Ivan-only applies".
//
// A CHECKLIST THAT NAMES TWO GRANTS BY ID AND LEAVES THE THIRD TO A BLANKET
// PHRASE WILL REVOKE TWO.
//
// The link was never absent in both directions. R-082 ends "REVOKED BY P2-13,
// with every other terminal grant, per 8.7", so the RULING pointed at the
// checklist. The CHECKLIST did not point back. That asymmetry is what this file
// checks, and it is why the check has almost no false positives: it never has to
// guess whether a ruling is a grant. **The ruling has already said so**, by
// naming the card that revokes it.
//
// ===========================================================================
// WHAT IT ASKS
// ===========================================================================
//
//   1. Which rulings in `decisions/inbox.md` name a card that revokes them?
//   2. For each, does that card's acceptance field on the board name the ruling?
//
// A ruling that fails 2 is refused unless it is in `NOT_A_GRANT` below, with a
// written reason. That table is the false-positive half, and it is a table rather
// than a cleverer regex on purpose: `check-pending-schema-reads` keeps its twelve
// exemptions the same way, so that every exclusion is a decision somebody made
// and can be read in a diff. A TABLE ENTRY MATCHING NO HIT IS ALSO A FAILURE,
// because an exemption for a ruling that no longer says this sits there covering
// whatever takes its place.
//
// ===========================================================================
// WHAT IT DOES NOT CATCH, STATED RATHER THAN LEFT TO BE DISCOVERED
// ===========================================================================
//
// A GRANT THAT NEVER NAMES A REVOKING CARD IS INVISIBLE HERE. This file reads an
// edge, and an edge needs one end to exist. A ruling that hands a terminal a
// capability and says nothing about how it ends is a defect this check cannot
// see, and the honest thing is to say so rather than to imply coverage it does
// not have.
//
// THE ALTERNATIVE WAS CONSIDERED AND REJECTED. Detecting "this ruling grants a
// capability" from its prose was tried first: a regex over `is authorized`,
// `grant`, `permission`, `may apply` and `self-merge` matched 36 of 129 rulings,
// most of them gate audits and reports that merely DISCUSS a grant. A check whose
// table of exceptions is thirty entries long is a table, not a check. The
// declared-edge test matches TEN and needs THREE exceptions, and all three are
// gate audits or resequencings that describe the checklist rather than join it.
//
// THE CHECKLIST IS P2-13's ACCEPTANCE FIELD ON THE BOARD, and today that is the
// only checklist there is: `docs/RUNBOOK-CREDENTIAL-ROTATION.md`, which P2-13's
// acceptance names, DOES NOT EXIST YET, because P2-13 is unshipped. When it
// exists it becomes a second place a grant may be named, and adding it is one
// line in `checklistTextFor` below.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { WORKING_BOARDS, CLOSED_BOARDS } from '../poc/boards.mjs';

const ROOT = process.env.RC_GRANTS_ROOT || new URL('../..', import.meta.url).pathname;
const INBOX = 'decisions/inbox.md';
const BOARDS = [...WORKING_BOARDS, ...CLOSED_BOARDS].map((b) => b.path);

// A ruling naming the card that ends it. Every shape this repository has actually
// used, and the shapes are listed rather than generalised so that adding one is a
// decision in a diff.
//
// IT DELIBERATELY READS QUOTED LINES TOO. R-049 and R-056 declare their
// revocation only inside a `>` quotation of the text they are amending, and
// skipping quotations would drop two real grants to tidy the parser.
const DECLARES = [
  /\bREVOKED\s+BY\s+([A-Z][A-Z0-9]*-\d+)/gi,
  /\bexpires?\s+at\s+([A-Z][A-Z0-9]*-\d+)/gi,
  /\b([A-Z][A-Z0-9]*-\d+)\s+revokes\b/g,
  // "Revoked with every other terminal grant AT P2-13." R-059 is written that
  // way and the first three patterns did not match it, which was this check
  // failing at the thing the card is about: a grant covered by a phrase nobody
  // enumerated. Found by reading R-059, not by the check reporting it.
  /\bRevoked\b[^.\n]{0,80}?\b(?:by|at)\s+([A-Z][A-Z0-9]*-\d+)/gi,
];

// ---------------------------------------------------------------------------
// THE JUDGED EXCEPTIONS. Every entry is a ruling that matches the shape above and
// is NOT a grant, with the reason it is not.
// ---------------------------------------------------------------------------
const NOT_A_GRANT = [
  {
    id: 'R-024',
    why: 'A RESEQUENCING ruling: it moves P2-15 and P2-13 behind the build tail. Its matched sentence, "P2-13 revokes the migration-apply grant, rotates every credential", DESCRIBES what P2-13 does and hands nobody anything. R-001 is the grant it is describing, and R-001 is named in its own right.',
  },
  {
    id: 'R-101',
    why: 'A TRIAGE gate audit. It DISCUSSES P2-13s capability edges, in the sentence "P2-13 revokes every ...", and hands nobody anything. A gate audit that names the revoking card is reporting on the checklist, not joining it.',
  },
  {
    id: 'R-126',
    why: 'A TRIAGE gate audit, and the matched sentence is a NEGATION: "neither is a credential and neither is revoked by P2-13." It says the opposite of what the pattern reads.',
  },
];

// ---------------------------------------------------------------------------

const problems = [];
const say = (m) => console.log(m);

function rulingBodies(text) {
  const out = new Map();
  let cur = null;
  for (const line of text.split('\n')) {
    const m = /^#{1,6}\s*(R-\d{3})\b/.exec(line);
    if (m) { cur = m[1]; out.set(cur, [line]); continue; }
    if (cur) out.get(cur).push(line);
  }
  return out;
}

/** Every place a card's checklist could name a ruling id. */
function checklistTextFor(cardId, boards) {
  const parts = [];
  for (const { rel, board } of boards) {
    const card = (board.cards || []).find((c) => c.id === cardId);
    if (!card) continue;
    // THE ACCEPTANCE FIELD, and not the whole card. `notes` records what was
    // discussed; `acceptance` is what has to be true before the card ships, which
    // is the only field a rotation is actually run against.
    parts.push({ where: `${rel}:${cardId}.acceptance`, text: String(card.acceptance || '') });
  }
  // The runbook P2-13's acceptance names. It does not exist until P2-13 is
  // worked; when it does, it counts.
  const runbook = join(ROOT, 'docs/RUNBOOK-CREDENTIAL-ROTATION.md');
  if (existsSync(runbook)) {
    parts.push({ where: 'docs/RUNBOOK-CREDENTIAL-ROTATION.md', text: readFileSync(runbook, 'utf8') });
  }
  return parts;
}

let inboxText;
try {
  inboxText = readFileSync(join(ROOT, INBOX), 'utf8');
} catch (err) {
  console.error(`check-grant-revocation: ${INBOX} could not be read. Refusing to report clean.`);
  console.error(`  ${String(err && err.message ? err.message : err).split('\n')[0]}`);
  process.exit(2);
}

const boards = [];
for (const rel of BOARDS) {
  const full = join(ROOT, rel);
  if (!existsSync(full)) {
    console.error(`check-grant-revocation: board not found: ${rel}`);
    console.error('  Refusing to report clean against a board list that does not resolve.');
    process.exit(2);
  }
  let parsed;
  try { parsed = JSON.parse(readFileSync(full, 'utf8')); } catch (err) {
    console.error(`check-grant-revocation: ${rel} does not parse. Refusing to report clean.`);
    console.error(`  ${String(err && err.message ? err.message : err).split('\n')[0]}`);
    process.exit(2);
  }
  if (!Array.isArray(parsed.cards) || parsed.cards.length === 0) {
    console.error(`check-grant-revocation: ${rel} has no cards. A board with no cards names no grant.`);
    process.exit(2);
  }
  boards.push({ rel, board: parsed });
}

const bodies = rulingBodies(inboxText);
if (bodies.size === 0) {
  console.error(`check-grant-revocation: no rulings parsed out of ${INBOX}.`);
  console.error('  An empty result would read as "no grant is unnamed", which is the failure');
  console.error('  class docs/LEARNINGS.md names. Refusing to report clean.');
  process.exit(2);
}

const declared = [];
for (const [id, lines] of bodies) {
  const body = lines.join('\n');
  const cards = new Set();
  for (const re of DECLARES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(body))) cards.add(m[1].toUpperCase());
  }
  for (const card of cards) declared.push({ id, card });
}

say(`check-grant-revocation: ${bodies.size} ruling(s) in ${INBOX}, ${boards.length} board(s)`);
say(`  declare a revoking card  ${declared.length} edge(s)`);

const excused = new Map(NOT_A_GRANT.map((e) => [e.id, e]));
const usedExcuses = new Set();
let named = 0;

for (const { id, card } of declared.sort((a, b) => a.id.localeCompare(b.id))) {
  if (excused.has(id)) {
    usedExcuses.add(id);
    say(`  not a grant  ${id} -> ${card}`);
    continue;
  }
  const places = checklistTextFor(card, boards);
  if (places.length === 0) {
    problems.push(
      `${id} says it is revoked by ${card}, and ${card} is on no board.\n` +
      '      A grant whose revoking card does not exist is a grant nothing will ever end.',
    );
    continue;
  }
  const found = places.find((p) => p.text.includes(id));
  if (!found) {
    problems.push(
      `${id} says it is revoked by ${card}, and ${card} does not name ${id}.\n` +
      `      looked in: ${places.map((p) => p.where).join(', ')}\n` +
      `      Add ${id} to that checklist as its own tickable item. A checklist that names\n` +
      '      some grants by id and leaves the rest to a blanket phrase will revoke some.',
    );
    continue;
  }
  named += 1;
  say(`  named        ${id} -> ${card}  (${found.where})`);
}

for (const e of NOT_A_GRANT) {
  if (usedExcuses.has(e.id)) continue;
  problems.push(
    `${e.id} is listed in NOT_A_GRANT and no longer declares a revoking card.\n` +
    '      A stale entry sits there covering whatever takes its place. Remove it.',
  );
}

say(`  named by the checklist   ${named} of ${declared.length - usedExcuses.size}`);

if (problems.length > 0) {
  console.error('\ncheck-grant-revocation: A GRANT NAMES ITS REVOKING CARD AND IS NOT NAMED BACK.\n');
  for (const p of problems) console.error(`  ${p}\n`);
  console.error('R-082 is why this exists: it was created AFTER P2-13s capability clause was');
  console.error('written, so the clause could not have known about it, and CLAUDE.md 8.7 covered');
  console.error('it only by a blanket phrase. GATE-03.');
  process.exit(1);
}

console.log(`check-grant-revocation: OK. ${named} declared grant(s) are each named by the checklist that revokes them, ${usedExcuses.size} judged not a grant.`);
