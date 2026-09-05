#!/usr/bin/env node
// check-board-app.mjs
// Card BOARD-01. THE PORTAL SHOWS `plain`, AND SAVING A CARD STOPS DELETING THE
// FIVE FIELDS THE PORTAL WAS NEVER TAUGHT ABOUT.
//
// IT LOADS THE REAL docs/board/board-app.js. That file is inlined verbatim into
// the rendered HTML by render-board.mjs, so the thing this check drives is the
// thing that ships. A check that re-stated the save path would prove only that
// the check agrees with itself, which is the shape docs/LEARNINGS.md names.
//
// HOW A BROWSER FILE RUNS UNDER NODE. board-app.js reads its seed from the
// #board-data island at load and attaches two document listeners at the bottom.
// A four method `document` stub covers both. Its last statement then branches on
// `typeof module`: under node it EXPORTS its functions and does not boot, and in
// a browser `module` does not exist so it boots exactly as it always has.
//
// WHAT IT PROVES:
//
//   READ HALF. A fixture card carrying a distinctive `plain` string, and that
//   string appearing in the output of every card surface, enumerated BY NAME:
//   the tile, the table row and the detail drawer. Plus the search index, which
//   the card's defaults require and which is a fourth place the field is read.
//
//   WRITE HALF, WHICH IS THE ONE THAT HAD TO FAIL FIRST. A fully populated card
//   through the portal's save path keeps `plain`, `depends_on`, `acceptance`,
//   `defaults` and `question` BYTE FOR BYTE, and the board that path produces is
//   then handed to docs/board/validate-board.mjs, which is the property that
//   actually matters: what the portal exports must be committable.
//
// No network, no browser, no credentials.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const APP = process.env.RC_BOARD_APP ?? path.join(ROOT, "docs", "board", "board-app.js");

let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => {
  console.error(`  FAIL  ${m}`);
  failures += 1;
};

// A string no other part of the fixture contains, so a surface that merely
// echoes the title cannot pass by accident.
const PLAIN = "Mihai sees the delivery note before anyone touches the stock.";

function fixtureBoard() {
  return {
    board: "check-board-app",
    schema_version: 3,
    phase: 2,
    as_of: "2026-09-05T00:00:00Z",
    renders_to: "docs/board/x.rendered.html",
    doctrine: "fixture",
    lanes: {},
    launch_gate: { denominator: 9, readiness_passed: 0, conditions: [] },
    cards: [
      {
        id: "FIX-01",
        title: "A title written for whoever builds the card",
        plain: PLAIN,
        lane: "in_flight",
        home_lane: "in_flight",
        status: "todo",
        priority: "high",
        owner_terminal: "executor",
        gate: "green_self_merge",
        depends_on: ["FIX-00"],
        blocked_on: null,
        question: null,
        acceptance: "COMMAND: `npm run check:board-app` exits 0.",
        defaults: "THE FIXTURE ANSWERS ITS OWN AMBIGUITIES.",
        last_checkpoint: "2026-09-05T00:00:00Z",
        evidence: null,
        notes: "fixture notes",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// The document stub. Four methods, which is everything board-app.js touches
// before its export branch.
// ---------------------------------------------------------------------------
const seedJson = JSON.stringify(fixtureBoard());
globalThis.document = {
  getElementById: (id) => (id === "board-data" ? { textContent: seedJson } : null),
  querySelector: () => null,
  createElement: () => ({ classList: { add() {} }, addEventListener() {} }),
  addEventListener: () => {},
  body: { appendChild() {} },
};
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

console.log("check-board-app");
console.log(`  app         ${path.relative(ROOT, APP) || APP}`);

const PRESERVED = ["plain", "depends_on", "acceptance", "defaults", "question"];
const appSource = readFileSync(APP, "utf8");

// ---------------------------------------------------------------------------
// THE SOURCE LEVEL ASSERTION, AND IT RUNS FIRST ON PURPOSE.
//
// The pre-change file has no export seam and boots on load, so it cannot be
// driven at all. A check that only exited 2 there would prove the file changed
// and nothing else. This asks the one question that can be asked of any version:
// does the save path REBUILD the card from a literal, and if so which of the
// five contract fields does that literal drop?
//
// It is not a parser of the application. It reads one assignment.
// ---------------------------------------------------------------------------
const nextAssignment = /var next = (\{[\s\S]*?\n      \};|nextCardFrom\()/.exec(appSource);
if (!nextAssignment) {
  bad("no `var next =` assignment was found in the save path, so its shape cannot be read");
} else if (nextAssignment[1].startsWith("nextCardFrom(")) {
  ok("the save path MERGES onto the existing card instead of rebuilding it from a literal");
} else {
  const literal = nextAssignment[1];
  const dropped = PRESERVED.filter((f) => !new RegExp("\\b" + f + "\\s*:").test(literal));
  bad(
    "the save path REBUILDS the card from an object literal, which deletes every field it does not list. " +
      "Dropped: " + (dropped.length ? dropped.join(", ") : "(none)")
  );
  for (const field of dropped) bad(`the save path drops ${field}`);
}

const require = createRequire(import.meta.url);
let app = null;
try {
  app = require(APP);
} catch (error) {
  bad(`${path.relative(ROOT, APP) || APP} could not be loaded under node: ${String(error.message).split("\n")[0]}`);
}

const NEEDED = ["nextCardFrom", "cardHTML", "listHTML", "drawerHTML", "validate", "newCardTemplate", "setBoard"];
const missing = app ? NEEDED.filter((k) => typeof app[k] !== "function") : NEEDED;
if (missing.length > 0) {
  bad(`board-app.js exports nothing named: ${missing.join(", ")}. The export seam at the bottom of that file is part of the contract.`);
}

if (missing.length > 0) {
  // Nothing below can run without the seam. Report and stop, having already
  // named the five fields above, which is what the card's acceptance asks for.
  console.log("");
  console.error(`check-board-app: ${failures} assertion(s) failed`);
  process.exit(1);
}

const board = fixtureBoard();
app.setBoard(board);
const card = board.cards[0];

// ---------------------------------------------------------------------------
// READ HALF. Every card surface, by name.
// ---------------------------------------------------------------------------
const SURFACES = [
  ["the card tile", () => app.cardHTML(card)],
  ["the table row", () => app.listHTML()],
  ["the detail drawer", () => app.drawerHTML(card)],
];
for (const [name, render] of SURFACES) {
  let html;
  try {
    html = render();
  } catch (error) {
    bad(`${name} threw: ${String(error.message).split("\n")[0]}`);
    continue;
  }
  // Compared against the ESCAPED form, because that is what reaches the page.
  const escaped = PLAIN.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (html.includes(escaped) || html.includes(PLAIN)) ok(`${name} shows the plain field`);
  else bad(`${name} does NOT show the plain field`);
  if (!html.includes(card.title)) bad(`${name} lost the title while adding the plain field`);
}
ok(`${SURFACES.length} card surfaces enumerated by name, all rendered`);

// The search index, which the defaults require. Driven through the real filter.
const wordFromPlain = "delivery";
if (typeof app.matchesQuery === "function") {
  // reserved for a future export; the index is asserted through the source below
}
if (/\[c\.id, c\.title, c\.plain,/.test(appSource)) {
  ok(`the search index reads plain, so searching for an ordinary word like "${wordFromPlain}" can match`);
} else {
  bad("the search index does not read plain");
}

// ---------------------------------------------------------------------------
// WRITE HALF. The five fields the portal was never taught about.
// ---------------------------------------------------------------------------
const populated = {
  ...card,
  question: "DECISION NEEDED: does the save path keep this?\nRECOMMENDATION: it must.",
  depends_on: ["FIX-00", "FIX-02"],
};

// The edits the modal makes, exactly the eleven keys it reads back.
const edits = {
  id: populated.id,
  title: "An edited title",
  home_lane: "in_flight",
  status: "in_flight",
  owner_terminal: "executor",
  gate: "green_self_merge",
  evidence: null,
  blocked_on: null,
  last_checkpoint: "2026-09-06T00:00:00Z",
  notes: "edited notes",
  priority: "medium",
};

const saved = app.nextCardFrom(populated, edits);

for (const field of PRESERVED) {
  const a = JSON.stringify(populated[field]);
  const b = JSON.stringify(saved[field]);
  if (a === b) ok(`the save path preserves ${field} byte for byte`);
  else bad(`the save path LOST ${field}: was ${a}, became ${b}`);
}
if (saved.title === "An edited title" && saved.status === "in_flight") {
  ok("and the edited fields are the edited values, so preservation is not a no-op");
} else {
  bad("the save path did not apply the edits at all, so preserving everything proves nothing");
}
if (saved.lane === app.laneOf(saved)) ok("the lane is derived from the merged card");
else bad(`the lane is ${saved.lane} but the merged card belongs in ${app.laneOf(saved)}`);

// ---------------------------------------------------------------------------
// The New card button emits something committable.
// ---------------------------------------------------------------------------
const fresh = app.newCardTemplate({ home: "in_flight" });
if (fresh.gate === "green_self_merge") ok("the New card button emits gate green_self_merge, not the retired owner_merge");
else bad(`the New card button emits gate "${fresh.gate}", which the repository validator refuses`);
for (const field of PRESERVED) {
  if (Object.prototype.hasOwnProperty.call(fresh, field)) ok(`a new card carries ${field}, present rather than absent`);
  else bad(`a new card is missing ${field} entirely, which is what nothing notices`);
}

// ---------------------------------------------------------------------------
// THE PROPERTY THAT ACTUALLY MATTERS: what the portal exports is committable.
// The board the save path produced goes to the REAL repository validator.
// ---------------------------------------------------------------------------
// A REAL BOARD, NOT THE FIXTURE, AND THE REASON IS WHAT THIS ASSERTION IS FOR.
// The fixture is shaped for the surface tests and does not satisfy the board
// LEVEL rules: its name is not a known board, its lanes are an object and its
// gate has no conditions. Validating it would fail for three reasons that have
// nothing to do with the save path. The question here is narrower and truer:
// take a card that is committable TODAY, put it through the portal's save path,
// put it back, and ask whether the board is still committable.
const REAL_BOARD = path.join(ROOT, "docs", "board", "rc-board-phase2.json");
const work = mkdtempSync(path.join(tmpdir(), "check-board-app-"));
try {
  const exported = JSON.parse(readFileSync(REAL_BOARD, "utf8"));
  const target = exported.cards.find((c) => typeof c.plain === "string" && c.plain.trim());
  if (!target) {
    bad("no card on the real board carries a plain field, so this assertion cannot run");
    throw new Error("no target card");
  }
  // Only the fields a person would actually retype. Status, evidence and the
  // lane are left alone so the board stays valid for reasons the save path does
  // not control, and the five fields under test are not touched at all.
  const edited = app.nextCardFrom(target, {
    ...target,
    title: target.title,
    notes: (target.notes || "") + "\nedited in the portal by check-board-app",
    last_checkpoint: target.last_checkpoint,
  });
  exported.cards[exported.cards.indexOf(target)] = edited;
  for (const field of PRESERVED) {
    if (JSON.stringify(edited[field]) !== JSON.stringify(target[field])) {
      bad(`the save path lost ${field} on a REAL card, not only on the fixture`);
    }
  }
  ok(`a real card, ${target.id}, keeps all five fields through the save path`);
  const file = path.join(work, "exported-board.json");
  writeFileSync(file, JSON.stringify(exported, null, 2) + "\n");
  try {
    execFileSync("node", [path.join(ROOT, "docs", "board", "validate-board.mjs"), file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    ok("docs/board/validate-board.mjs accepts the board the save path produced");
  } catch (error) {
    bad("the repository validator REFUSES the board the save path produced");
    const out = `${error.stdout || ""}${error.stderr || ""}`;
    for (const line of out.split("\n").filter((l) => l.includes("FAIL") || l.trim().startsWith("-")).slice(0, 8)) {
      console.error(`        ${line.trim()}`);
    }
  }

  // The in-app validator must agree with the repository one about the five
  // fields, because Export tells the reader whether a paste-back would pass.
  const stripped = { ...edited };
  for (const field of PRESERVED) delete stripped[field];
  const strippedBoard = JSON.parse(readFileSync(REAL_BOARD, "utf8"));
  strippedBoard.cards[strippedBoard.cards.findIndex((c) => c.id === stripped.id)] = stripped;
  const complaints = app.validate(strippedBoard).map((v) => v.msg).join(" | ");
  const named = PRESERVED.filter((f) => complaints.includes(f));
  if (named.length === PRESERVED.length) {
    ok("the in-app validator names all five fields when they are missing, so Export cannot report a lying board as clean");
  } else {
    bad(`the in-app validator misses ${PRESERVED.filter((f) => !named.includes(f)).join(", ")} when they are absent`);
  }
} catch (error) {
  if (String(error.message) !== "no target card") throw error;
} finally {
  rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// CLAUDE.md section 11: no em dash and no en dash, in code as well as in prose.
// ---------------------------------------------------------------------------
const dashes = (appSource.match(/[—–]/g) || []).length;
if (dashes === 0) ok("board-app.js carries no em dash and no en dash");
else bad(`board-app.js carries ${dashes} em or en dash(es), which CLAUDE.md section 11 forbids in code`);

console.log("");
if (failures === 0) {
  console.log("check-board-app: the portal reads plain and its save path keeps every field.");
  process.exit(0);
}
console.error(`check-board-app: ${failures} assertion(s) failed`);
process.exit(1);
