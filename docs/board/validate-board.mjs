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
  'RC-INVENTORY - Phase 2 Build',
  'RC-INVENTORY - Phase 3 - CRM and Density',
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

// Boards that carry the phase 2 PLANNING CONTRACT on top of the base card
// contract above: `defaults`, `acceptance`, `depends_on` and `question` on
// every card, plus the rule that a blocked card must name both the question and
// the person who owes the answer.
//
// Keyed on the board NAME on purpose, rather than applied to every board.
//
// The phase 1 board shipped 13 cards without those fields and is closed at 9/9.
// Retro-fitting a contract onto a finished board would turn a true historical
// record red for a rule it was never authored under, and the first thing anyone
// would do is edit the history to make the validator quiet. Name-keying is also
// STRICTER than the obvious alternative, "enforce each field only when it is
// present": that version lets a phase 2 card silently drop `acceptance` and
// still pass, which is exactly the failure the contract exists to stop.
const PLANNING_CONTRACT_BOARDS = [
  'RC-INVENTORY - Phase 2 Build',
  // Phase 3 is authored under the same contract from its first commit, which is
  // the whole reason it is name-keyed rather than presence-keyed: every card on
  // that board carries `defaults`, `acceptance`, `depends_on` and `question`
  // because the contract demanded them at authoring time, not because an author
  // remembered. Adding the name here is what makes a phase 3 card that drops
  // `acceptance` a hard failure rather than a silent pass.
  'RC-INVENTORY - Phase 3 - CRM and Density',
];

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

  // Does this board carry the phase 2 planning contract? Read once, here, so
  // every rule below reads the same answer.
  const planning = PLANNING_CONTRACT_BOARDS.includes(board.board);

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

        // Same rule as a card, same reason. A launch gate is the shortest
        // answer to "are we ready", and its title is written in the build's
        // vocabulary. Card AUT-7.
        if (!isNonEmptyString(c.plain)) {
          fail(`${at}.plain: must be a non-empty string. One sentence of ordinary business English naming the condition this gate actually represents, with no build vocabulary. A gate the owner cannot read is a readiness score he has to take on trust.`);
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
  // id -> the depends_on array as authored, collected during the pass and
  // resolved afterwards, because a card may legally depend on a card declared
  // later in the array.
  const dependsOn = new Map();

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

    // plain: the card in ordinary business English, one or two sentences,
    // saying what it means for the product and for the client. Card AUT-7.
    //
    // THIS SITS IN THE BASE CONTRACT, not the phase 2 planning contract, so it
    // binds the closed phase 1 board too. That board is otherwise never
    // retro-fitted, for the reason written above: turning a true historical
    // record red for a rule it was never authored under invites somebody to
    // edit the history rather than the rule. `plain` is the one exception and
    // it earns it, because it does not describe how a card was worked. It
    // describes what the card MEANS, which is as true of finished work as of
    // work in flight, and the owner reads both boards.
    //
    // The title is written for whoever builds the card. `plain` is written for
    // whoever paid for it. A board that speaks only the first language forces
    // every status question through a translator, which is the dependency this
    // project exists to remove.
    if (!isNonEmptyString(card.plain)) {
      fail(`${at}.plain: must be a non-empty string. One or two sentences of ordinary business English saying what this card means for the product and for the client, with no card ids, file paths, pull request numbers or build vocabulary. A card without one is a card the owner cannot read.`);
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

    // --- phase 2 planning contract -------------------------------------------
    if (!planning) return;

    // owner_merge is RETIRED on a planning-contract board (ruling R-002,
    // 2026-08-25). It stays in CARD_GATES because the closed phase 1 board
    // carries it on nine shipped cards and a closed board is not rewritten, so
    // the rejection has to live here rather than in the shared gate list.
    if (card.gate === 'owner_merge') {
      fail(`${at}.gate: "owner_merge" is retired on this board (ruling R-002). Cards ship on "green_self_merge" (green quality plus the named acceptance passing); "stakeholder" is for client acceptance only. Defect review is not a merge gate.`);
    }

    // defaults: the pre-authorized answers to this card's expected ambiguities.
    // Empty defaults is not a neutral omission, it is a card that will halt on
    // the first question, which is the failure mode this field was added to fix.
    if (!isNonEmptyString(card.defaults)) {
      fail(`${at}.defaults: must be a non-empty string. A card with no defaults halts on its first ambiguity, which is what defaults exist to prevent.`);
    }

    // acceptance: the machine-checkable proof line. No acceptance, no ship.
    if (!isNonEmptyString(card.acceptance)) {
      fail(`${at}.acceptance: must be a non-empty string naming a command with an expected exit code, a URL with expected content, or a named test.`);
    }

    // question: null when nothing is being asked, otherwise the structured
    // decision-needed text. An empty string is neither, and reads on the board
    // as "asked but blank".
    if (!(card.question === null || isNonEmptyString(card.question))) {
      fail(`${at}.question: must be null or a non-empty string, found ${JSON.stringify(card.question)}.`);
    }

    // depends_on: the eligibility edges. Existence and acyclicity are checked
    // after the pass, once every id is known.
    if (!Array.isArray(card.depends_on)) {
      fail(`${at}.depends_on: must be an array of card ids (use [] for no dependencies), found ${JSON.stringify(card.depends_on)}.`);
    } else {
      if (!card.depends_on.every(isNonEmptyString)) {
        fail(`${at}.depends_on: every entry must be a non-empty card id string.`);
      }
      if (new Set(card.depends_on).size !== card.depends_on.length) {
        fail(`${at}.depends_on: duplicate ids.`);
      }
      if (isNonEmptyString(card.id) && card.depends_on.includes(card.id)) {
        fail(`${at}.depends_on: a card cannot depend on itself.`);
      }
      if (isNonEmptyString(card.id)) {
        dependsOn.set(card.id, card.depends_on.filter(isNonEmptyString));
      }
    }

    // A blocked card owes the board both halves: what is being asked, and who
    // owes the answer. Either half missing is a card that stalls the run with
    // nobody able to act on it.
    if (card.status === 'blocked') {
      if (!isNonEmptyString(card.question)) {
        fail(`${at}: status=blocked requires a non-null question carrying the structured decision-needed text and a recommendation.`);
      }
      if (blockedOn === null) {
        fail(`${at}: status=blocked requires blocked_on to name who owes the answer, found null.`);
      }
    }
  });

  // --- depends_on graph: existence, then acyclicity --------------------------
  // Both are deferred to here because forward references are legal: P2-01 may be
  // authored after P2-02 depends on it.
  if (planning) {
    for (const [id, deps] of dependsOn) {
      for (const dep of deps) {
        if (!seenCardIds.has(dep)) {
          fail(`cards (${id}).depends_on: ${JSON.stringify(dep)} is not a card id on this board.`);
        }
      }
    }

    // Three-colour DFS. A cycle is a set of cards that can never become
    // eligible: each one waits on another one in the set, forever. The board
    // would show work remaining and no next card, with nothing marked blocked.
    const WHITE = 0;
    const GREY = 1;
    const BLACK = 2;
    const colour = new Map([...dependsOn.keys()].map((id) => [id, WHITE]));
    const reported = new Set();

    const report = (cycle) => {
      // Canonicalise by rotating the smallest id to the front, so the same
      // cycle found from two different entry points is reported once.
      const min = cycle.indexOf([...cycle].sort()[0]);
      const rotated = [...cycle.slice(min), ...cycle.slice(0, min)];
      const key = rotated.join('>');
      if (reported.has(key)) return;
      reported.add(key);
      fail(`cards.depends_on: dependency cycle ${[...rotated, rotated[0]].join(' -> ')}. Every card in a cycle waits on another card in the same cycle, so none can ever become eligible.`);
    };

    const walk = (id, path) => {
      colour.set(id, GREY);
      for (const dep of dependsOn.get(id) ?? []) {
        // Unknown ids are already reported above; following them would throw.
        if (!dependsOn.has(dep)) continue;
        if (colour.get(dep) === GREY) {
          report(path.slice(path.indexOf(dep)));
        } else if (colour.get(dep) === WHITE) {
          walk(dep, [...path, dep]);
        }
      }
      colour.set(id, BLACK);
    };

    for (const id of dependsOn.keys()) {
      if (colour.get(id) === WHITE) walk(id, [id]);
    }
  }

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
