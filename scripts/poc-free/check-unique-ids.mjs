#!/usr/bin/env node
// check-unique-ids.mjs
// Card RULE-02. A DUPLICATE RULING ID OR CARD ID FAILS THE BUILD.
//
// WHAT WENT WRONG, TWICE.
//
// "Namespaced by author" was doctrine and was enforced by nothing. On
// 2026-09-01 a TRIAGE branch authored R-083 through R-089 while R-083 through
// R-086 were being authored on main, with COMPLETELY DIFFERENT MEANINGS. On
// main, R-083 is the owner's ruling that deviz is internal only; on that branch
// it is about the input a run was handed. Three ruling ids ended up stranded on
// a pull request that was then closed unmerged, and the only thing that caught
// it was a human reading both.
//
// THE COLLISION IS INVISIBLE TO GIT, AND THAT IS THE WHOLE PROBLEM. The two
// branches appended to DIFFERENT PARTS of decisions/inbox.md, so there was no
// merge conflict to notice. Two authors each believed they held R-083.
//
// SO THIS FILE ASKS TWO QUESTIONS.
//
//   1. Is any id duplicated WITHIN the record? Two cards with the same id on one
//      board or across boards, two rulings with the same id in the inbox.
//
//   2. Does this branch REDEFINE an id that origin/main already uses? That is
//      the question that would have caught the incident above, because within
//      each side the ids were perfectly unique. An id present on both sides
//      whose heading text differs is two different decisions wearing one number.
//
// THE SECOND QUESTION IS THE LOAD-BEARING ONE and it is why this reads
// origin/main rather than only the working tree, the same way check-card-ids
// does and for the same reason: the question is whether the RECORD is coherent,
// and the record is main plus what is being proposed.
//
// IT ASSERTS ITS OWN INPUT COUNT AGAINST ITS MATCH COUNT.
//
// docs/LEARNINGS.md names the class: a matcher whose empty result means "nothing
// to do" reports a broken scanner as a clean tree. A duplicate check that parses
// zero ids finds zero duplicates. So every heading that LOOKS like a ruling is
// counted, every one that is PARSED as a ruling is counted, and a divergence
// between those two numbers that is not explained by the documented exceptions
// is a hard failure.
//
// NO ID IS EVER RENUMBERED TO MAKE THIS PASS. History is not rewritten. Where
// two ids already collide, the pair goes in the baseline below with its reason,
// exactly as check-card-ids keeps an allow-list rather than editing the log.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

const BOARDS = [
  "docs/board/rc-board.json",
  "docs/board/rc-board-phase2.json",
  "docs/board/rc-board-phase3.json",
];
const INBOX = "decisions/inbox.md";

// A ruling heading. `### R-083 - some words` or `### R-083` on its own.
const RULING_HEADING = /^###\s+(R-\d+)\b/;
// Anything that starts like one. The gap between this and the line above is what
// the count assertion measures.
const RULING_SHAPED = /^###\s+R[-A-Z0-9]/i;

// Headings that LOOK like a ruling and are deliberately not one. Each carries its
// reason, and the list is short and explicit so that adding to it is a decision
// somebody made and can be read in a diff.
const NOT_A_RULING = [
  {
    text: "### R-NNN - <one line naming the decision>",
    why: "the template at the top of decisions/inbox.md. NNN is a placeholder, not a number.",
  },
];

// Ids that already collide on main. EMPTY, and it is committed empty on purpose:
// the check was written against a record that has no duplicates, so the first
// entry anybody adds here is a decision to tolerate one, with a reason next to
// it, rather than a silent widening.
const TOLERATED = [];

function git(argv) {
  return execFileSync("git", argv, { cwd: ROOT, encoding: "utf8" });
}

/** Ruling ids and their heading text, plus the counts the assertion needs. */
export function rulingsIn(text) {
  const rulings = [];
  let shaped = 0;
  const unparsed = [];
  for (const line of text.split("\n")) {
    if (!RULING_SHAPED.test(line)) continue;
    shaped += 1;
    const m = RULING_HEADING.exec(line);
    if (m) rulings.push({ id: m[1], heading: line.trim() });
    else unparsed.push(line.trim());
  }
  return { rulings, shaped, unparsed };
}

export function cardsIn(boardText) {
  const board = JSON.parse(boardText);
  const cards = board.cards || [];
  return { ids: cards.map((c) => c.id).filter(Boolean), total: cards.length };
}

const problems = [];
const say = (s) => console.log(s);

say("check-unique-ids");

// ---------------------------------------------------------------------------
// 1. CARD IDS, within each board and across all of them
// ---------------------------------------------------------------------------
const seenCard = new Map(); // id -> [board, ...]
let cardTotal = 0;
let cardIdTotal = 0;
for (const rel of BOARDS) {
  const file = join(ROOT, rel);
  if (!existsSync(file)) {
    console.error(`check-unique-ids: board not found: ${rel}`);
    console.error("Refusing to report OK against a board list that does not resolve.");
    process.exit(2);
  }
  const { ids, total } = cardsIn(readFileSync(file, "utf8"));
  if (total === 0) {
    console.error(`check-unique-ids: ${rel} carries zero cards.`);
    console.error("A board with no cards would make an empty duplicate set look clean.");
    process.exit(2);
  }
  // EVERY CARD HAS AN ID. A card without one is not a card this check skipped,
  // it is a board the validator should have refused.
  if (ids.length !== total) {
    problems.push(`${rel}: ${total} cards but only ${ids.length} carry an id`);
  }
  cardTotal += total;
  cardIdTotal += ids.length;
  for (const id of ids) {
    if (!seenCard.has(id)) seenCard.set(id, []);
    seenCard.get(id).push(rel);
  }
}
say(`  boards        ${BOARDS.length}, ${cardTotal} card(s), ${cardIdTotal} id(s) read`);

for (const [id, where] of seenCard) {
  if (where.length === 1) continue;
  if (TOLERATED.includes(id)) continue;
  problems.push(`card id ${id} appears ${where.length} times: ${where.join(", ")}`);
}

// ---------------------------------------------------------------------------
// 2. RULING IDS in the working tree
// ---------------------------------------------------------------------------
const inboxPath = join(ROOT, INBOX);
if (!existsSync(inboxPath)) {
  console.error(`check-unique-ids: ${INBOX} not found.`);
  process.exit(2);
}
const here = rulingsIn(readFileSync(inboxPath, "utf8"));

// THE COUNT ASSERTION. Every heading that looks like a ruling is either parsed
// as one or named in NOT_A_RULING. Anything else means the regex has stopped
// matching a real shape and the check is reporting on fewer ids than exist.
const unexplained = here.unparsed.filter((line) => !NOT_A_RULING.some((n) => n.text === line));
if (unexplained.length > 0) {
  problems.push(
    `${here.shaped} ruling-shaped heading(s) read, ${here.rulings.length} parsed, and ` +
      `${unexplained.length} explained by nothing:\n      ` +
      unexplained.slice(0, 5).join("\n      "),
  );
}
say(
  `  ${INBOX}   ${here.shaped} ruling-shaped heading(s), ${here.rulings.length} parsed, ` +
    `${here.unparsed.length} skipped with a reason`,
);

if (here.rulings.length === 0) {
  console.error("check-unique-ids: zero ruling ids parsed, which cannot be right.");
  console.error("A duplicate check that reads nothing reports no duplicates.");
  process.exit(2);
}

const seenRuling = new Map();
for (const r of here.rulings) {
  if (!seenRuling.has(r.id)) seenRuling.set(r.id, []);
  seenRuling.get(r.id).push(r.heading);
}
for (const [id, headings] of seenRuling) {
  if (headings.length === 1) continue;
  if (TOLERATED.includes(id)) continue;
  problems.push(`ruling id ${id} appears ${headings.length} times in ${INBOX}`);
}

// ---------------------------------------------------------------------------
// 3. THE ONE THAT WOULD HAVE CAUGHT #143: an id redefined against main
// ---------------------------------------------------------------------------
let mainText = null;
for (const rev of ["origin/main", "refs/remotes/origin/main"]) {
  try {
    git(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]);
    mainText = git(["show", `${rev}:${INBOX}`]);
    break;
  } catch {
    /* try the next one */
  }
}

if (mainText === null) {
  // A shallow checkout has no origin/main. Fetch it once rather than skipping:
  // skipping is the silence this whole file is about.
  try {
    git(["fetch", "--no-tags", "--quiet", "origin", "+refs/heads/main:refs/remotes/origin/main"]);
    mainText = git(["show", `refs/remotes/origin/main:${INBOX}`]);
  } catch {
    console.error("check-unique-ids: origin/main could not be resolved or fetched.");
    console.error("The redefinition check needs it. Refusing to report OK without it.");
    process.exit(2);
  }
}

const there = rulingsIn(mainText);
const onMain = new Map(there.rulings.map((r) => [r.id, r.heading]));
say(`  origin/main   ${there.rulings.length} ruling id(s)`);

let redefined = 0;
for (const r of here.rulings) {
  const mainHeading = onMain.get(r.id);
  if (mainHeading === undefined) continue;
  if (mainHeading === r.heading) continue;
  if (TOLERATED.includes(r.id)) continue;
  redefined += 1;
  problems.push(
    `ruling id ${r.id} is REDEFINED against origin/main\n` +
      `      on main:  ${mainHeading.slice(0, 120)}\n` +
      `      on this:  ${r.heading.slice(0, 120)}`,
  );
}

const added = here.rulings.filter((r) => !onMain.has(r.id)).map((r) => r.id);
say(`  this branch   ${added.length} new ruling id(s)${added.length ? ": " + added.join(", ") : ""}`);

// ---------------------------------------------------------------------------
// 4. THE COUNTER, which is how allocation stops being a race
// ---------------------------------------------------------------------------
const COUNTER = "decisions/NEXT-RULING-ID";
const counterPath = join(ROOT, COUNTER);
if (!existsSync(counterPath)) {
  problems.push(`${COUNTER} does not exist. Id allocation has nothing atomic behind it.`);
} else {
  const raw = readFileSync(counterPath, "utf8").trim();
  if (!/^R-\d{3}$/.test(raw)) {
    problems.push(`${COUNTER} holds "${raw}", which is not a single id of the form R-NNN.`);
  } else {
    const next = Number(raw.slice(2));
    const highest = Math.max(...here.rulings.map((r) => Number(r.id.slice(2))));
    say(`  ${COUNTER}  ${raw}, highest allocated ${String(highest).padStart(3, "0")}`);
    if (next <= highest) {
      problems.push(
        `${COUNTER} says the next id is ${raw}, but R-${String(highest).padStart(3, "0")} is already written.\n` +
          `      Whoever wrote that ruling did not advance the counter, so the next author collides with them.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
say("");
if (problems.length > 0) {
  console.error("check-unique-ids: THE RECORD HAS AMBIGUOUS IDS\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nAn id names exactly one decision or one unit of work. Two things wearing one number\n" +
      "is how R-083 through R-086 came to mean different things on a branch and on main,\n" +
      "and the only thing that caught it was a human reading both.\n" +
      "\nNO ID IS RENUMBERED TO MAKE THIS PASS. Allocate a fresh one from " +
      COUNTER +
      " and\nadvance it in the same commit.\n",
  );
  process.exit(1);
}

say(
  `check-unique-ids: OK. ${cardIdTotal} card id(s) across ${BOARDS.length} boards and ` +
    `${here.rulings.length} ruling id(s) are each unique, ${redefined} redefined against main.`,
);
