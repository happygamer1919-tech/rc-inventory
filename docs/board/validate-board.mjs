#!/usr/bin/env node
// validate-board.mjs - zero-dependency, read-only board validator.
// Usage: node docs/board/validate-board.mjs <board.json> [<board2.json> ...]
// Exit 0 when every file is valid. Exit 1 with every violation printed.
// This script never writes, never mutates, and never touches the network.

import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Hardcoded contract. These are the pinned values the board system enforces.
// ---------------------------------------------------------------------------

const BOARD_NAMES = [
  'PROJECT - Board Name',
  'RC-INVENTORY - Phase 1 Preview',
];

const LANE_IDS = [
  'launch_gate',
  'blocked_on_people',
  'in_flight',
  'rodica_batch',
  'incidents',
  'loose_ends',
  'shipped',
];

const LAUNCH_GATE_DENOMINATOR = 9;

const CONDITION_STATES = ['pass', 'fail'];
const CARD_STATUSES = ['todo', 'in_flight', 'halted', 'blocked', 'shipped'];
const CARD_PRIORITIES = ['high', 'medium', 'low'];
const CARD_HOME_LANES = ['in_flight', 'rodica_batch', 'incidents', 'loose_ends'];
const CARD_GATES = ['green_self_merge', 'cyan_clear', 'owner_merge', 'owner_authorizo', 'stakeholder'];
const EVIDENCE_KINDS = ['pr', 'journal', 'sha256', 'e2e', 'screenshot'];

const INFRA = 'infra';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const list = (arr) => arr.map((s) => JSON.stringify(s)).join(', ');

// ISO 8601 date or date-time that also has to parse to a real calendar date.
// Accepts 2026-08-18 and 2026-08-18T19:48:26Z / +02:00 / .123Z forms.
// Date.parse alone is not enough: it silently rolls 2026-02-30 over to March 2,
// so the Y-M-D components are round-tripped against a UTC date and compared.
const ISO_8601 =
  /^(\d{4})-(\d{2})-(\d{2})(T([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d|60)(\.\d+)?)?(Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?$/;
function isIso8601(v) {
  if (typeof v !== 'string') return false;
  const m = ISO_8601.exec(v);
  if (!m) return false;
  if (Number.isNaN(Date.parse(v))) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === mo - 1 &&
    probe.getUTCDate() === d
  );
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function validateBoard(board) {
  const violations = [];
  const fail = (msg) => violations.push(msg);

  if (!isPlainObject(board)) {
    fail('root: board must be a JSON object.');
    return violations;
  }

  // --- board name -----------------------------------------------------------
  if (!BOARD_NAMES.includes(board.board)) {
    fail(`board: ${JSON.stringify(board.board)} is not a known board name. Allowed: ${list(BOARD_NAMES)}.`);
  }

  // --- lanes ----------------------------------------------------------------
  let peopleColumns = [];
  if (!Array.isArray(board.lanes)) {
    fail('lanes: must be an array.');
  } else {
    const actual = board.lanes.map((l) => (isPlainObject(l) ? l.id : l));
    const sameOrder =
      actual.length === LANE_IDS.length && actual.every((id, i) => id === LANE_IDS[i]);
    if (!sameOrder) {
      fail(`lanes: ids must be exactly [${list(LANE_IDS)}] in that order. Found [${list(actual)}].`);
    }

    const people = board.lanes.find((l) => isPlainObject(l) && l.id === 'blocked_on_people');
    if (!people) {
      fail('lanes.blocked_on_people: lane is missing.');
    } else if (!Array.isArray(people.columns)) {
      fail('lanes.blocked_on_people.columns: must be an array of person ids.');
    } else if (!people.columns.every(isNonEmptyString)) {
      fail('lanes.blocked_on_people.columns: every column must be a non-empty person id string.');
    } else {
      peopleColumns = people.columns;
      if (new Set(peopleColumns).size !== peopleColumns.length) {
        fail('lanes.blocked_on_people.columns: person ids must be unique.');
      }
    }
  }
  const legalBlockedOn = [INFRA, ...peopleColumns];

  // --- launch gate ----------------------------------------------------------
  const gate = board.launch_gate;
  if (!isPlainObject(gate)) {
    fail('launch_gate: must be an object.');
  } else {
    if (gate.denominator !== LAUNCH_GATE_DENOMINATOR) {
      fail(`launch_gate.denominator: must be ${LAUNCH_GATE_DENOMINATOR}, found ${JSON.stringify(gate.denominator)}.`);
    }

    if (!Array.isArray(gate.conditions)) {
      fail('launch_gate.conditions: must be an array.');
    } else {
      if (gate.conditions.length !== LAUNCH_GATE_DENOMINATOR) {
        fail(`launch_gate.conditions: length must equal the denominator ${LAUNCH_GATE_DENOMINATOR}, found ${gate.conditions.length}.`);
      }

      const seen = new Set();
      let counted = 0;

      gate.conditions.forEach((c, i) => {
        const where = `launch_gate.conditions[${i}]`;
        if (!isPlainObject(c)) {
          fail(`${where}: must be an object.`);
          return;
        }
        const id = isNonEmptyString(c.id) ? c.id : `#${i}`;
        const at = `launch_gate.conditions[${i}] (${id})`;

        if (!isNonEmptyString(c.id)) {
          fail(`${at}: id must be a non-empty string.`);
        } else if (seen.has(c.id)) {
          fail(`${at}: duplicate condition id ${JSON.stringify(c.id)}.`);
        } else {
          seen.add(c.id);
        }

        if (!CONDITION_STATES.includes(c.state)) {
          fail(`${at}.state: must be one of ${list(CONDITION_STATES)}, found ${JSON.stringify(c.state)}.`);
        }
        if (c.state === 'pass') {
          counted += 1;
          if (c.evidence === null || c.evidence === undefined) {
            fail(`${at}: state=pass with evidence=null is a hard failure. A passing gate must carry its proof.`);
          }
        }
      });

      if (gate.readiness_passed !== counted) {
        fail(`launch_gate.readiness_passed: must equal the counted number of conditions at state=pass (${counted}), found ${JSON.stringify(gate.readiness_passed)}.`);
      }
    }
  }

  // --- cards ----------------------------------------------------------------
  if (!Array.isArray(board.cards)) {
    fail('cards: must be an array.');
    return violations;
  }

  const seenCardIds = new Set();

  board.cards.forEach((card, i) => {
    const where = `cards[${i}]`;
    if (!isPlainObject(card)) {
      fail(`${where}: must be an object.`);
      return;
    }
    const id = isNonEmptyString(card.id) ? card.id : `#${i}`;
    const at = `cards[${i}] (${id})`;

    if (!isNonEmptyString(card.id)) {
      fail(`${at}.id: must be a non-empty string.`);
    } else if (seenCardIds.has(card.id)) {
      fail(`${at}.id: duplicate card id ${JSON.stringify(card.id)}.`);
    } else {
      seenCardIds.add(card.id);
    }

    if (!isNonEmptyString(card.title)) {
      fail(`${at}.title: must be a non-empty string.`);
    }
    if (!CARD_STATUSES.includes(card.status)) {
      fail(`${at}.status: must be one of ${list(CARD_STATUSES)}, found ${JSON.stringify(card.status)}.`);
    }
    if (!CARD_PRIORITIES.includes(card.priority)) {
      fail(`${at}.priority: must be one of ${list(CARD_PRIORITIES)}, found ${JSON.stringify(card.priority)}.`);
    }
    if (!CARD_HOME_LANES.includes(card.home_lane)) {
      fail(`${at}.home_lane: must be one of ${list(CARD_HOME_LANES)}, found ${JSON.stringify(card.home_lane)}.`);
    }
    if (!CARD_GATES.includes(card.gate)) {
      fail(`${at}.gate: must be one of ${list(CARD_GATES)}, found ${JSON.stringify(card.gate)}.`);
    }

    // blocked_on: null, "infra", or one of the blocked_on_people columns.
    const blockedOn = card.blocked_on === undefined ? null : card.blocked_on;
    const blockedOnLegal = blockedOn === null || legalBlockedOn.includes(blockedOn);
    if (!blockedOnLegal) {
      fail(`${at}.blocked_on: must be null, ${JSON.stringify(INFRA)}, or one of the blocked_on_people columns [${list(peopleColumns)}], found ${JSON.stringify(card.blocked_on)}.`);
    }

    if (!isIso8601(card.last_checkpoint)) {
      fail(`${at}.last_checkpoint: must be an ISO 8601 string that parses to a real date, found ${JSON.stringify(card.last_checkpoint)}.`);
    }

    // evidence: null, or {kind, ref, at}
    const ev = card.evidence === undefined ? null : card.evidence;
    if (ev !== null) {
      if (!isPlainObject(ev)) {
        fail(`${at}.evidence: must be null or an object, found ${JSON.stringify(ev)}.`);
      } else {
        if (!EVIDENCE_KINDS.includes(ev.kind)) {
          fail(`${at}.evidence.kind: must be one of ${list(EVIDENCE_KINDS)}, found ${JSON.stringify(ev.kind)}.`);
        }
        if (!isNonEmptyString(ev.ref)) {
          fail(`${at}.evidence.ref: must be a non-empty string, found ${JSON.stringify(ev.ref)}.`);
        }
        if (!isIso8601(ev.at)) {
          fail(`${at}.evidence.at: must be an ISO 8601 string that parses to a real date, found ${JSON.stringify(ev.at)}.`);
        }
      }
    }

    if (card.status === 'shipped' && ev === null) {
      fail(`${at}: status=shipped with evidence=null is a hard failure. A shipped card must carry its proof.`);
    }

    // lane is derived, never authored freely.
    const namesAPerson = blockedOn !== null && blockedOn !== INFRA && peopleColumns.includes(blockedOn);
    let derived;
    if (card.status === 'shipped') {
      derived = 'shipped';
    } else if (card.home_lane === 'in_flight' && card.status === 'blocked' && namesAPerson) {
      derived = 'blocked_on_people';
    } else {
      derived = card.home_lane;
    }
    if (card.lane !== derived) {
      fail(`${at}.lane: is derived and must be ${JSON.stringify(derived)} (from status=${JSON.stringify(card.status)}, home_lane=${JSON.stringify(card.home_lane)}, blocked_on=${JSON.stringify(blockedOn)}), found ${JSON.stringify(card.lane)}.`);
    }
  });

  return violations;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node docs/board/validate-board.mjs <board.json> [<board2.json> ...]');
  process.exit(1);
}

let failed = 0;

for (const file of files) {
  let violations;
  try {
    violations = validateBoard(JSON.parse(readFileSync(file, 'utf8')));
  } catch (err) {
    violations = [`file: could not read or parse - ${err.message}`];
  }

  if (violations.length === 0) {
    console.log(`PASS  ${file}  (0 violations)`);
  } else {
    failed += 1;
    console.log(`FAIL  ${file}  (${violations.length} violation${violations.length === 1 ? '' : 's'})`);
    for (const v of violations) console.log(`  - ${v}`);
  }
}

process.exit(failed === 0 ? 0 : 1);
