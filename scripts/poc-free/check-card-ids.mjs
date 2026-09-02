#!/usr/bin/env node
// check-card-ids.mjs
// Card AUT-11. A COMMIT WHOSE CARD ID RESOLVES TO NO CARD IS REFUSED.
//
// WHAT WENT WRONG, AND WHY A CHECK RATHER THAN A HABIT.
//
// AUT-5 and AUT-6 were built, committed and merged under those ids, and neither
// id existed on any board. The board therefore undercounted the work that had
// actually been done, and nothing anywhere was red. Finding 2 of
// docs/reports/2026-08-28-executor-critic-acceptance-pass.md is where it was
// caught, by a human reading a log, which is the one detection method this
// repository cannot schedule.
//
// AUT-10 put the two missing cards on the board. This file makes the gap
// impossible to reopen: from here on, a card id in a commit subject on main that
// resolves to nothing fails `quality`.
//
// WHAT IT READS.
//
// Every commit subject on origin/main. The prefix is the text before the first
// colon, which is the shape CLAUDE.md section 11 mandates:
//
//     P2-04: <what changed>
//
// EVERY id in that prefix is resolved, not only the first. Real subjects on main
// carry two and three of them ("AUT-12, AUT-13, AUT-14: ...", "ASK-01,
// DIGEST-01: ..."), and a check that stopped at the first token would have let
// the second and third through unread, which is the same silence this card is
// about.
//
// IT RUNS AGAINST origin/main, NOT AGAINST THE BRANCH.
//
// A branch mid-work legitimately carries commits for a card that is being
// authored in the same pull request: the card is on the branch's board and not
// yet on main's. Running against HEAD would fire on the normal case and teach
// everybody to ignore it. Running against origin/main asks the only question
// that matters, which is whether the RECORD is complete.
//
// HISTORY IS NEVER REWRITTEN TO MAKE THIS PASS.
//
// If an old commit carries an id that resolves to nothing, the fix is a card on
// a board, or an entry in the allow-list below with the reason next to it. It is
// never an edit to the log. That is the card's own default and it is repeated
// here because this is the file somebody will be staring at when it fires.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

// THE BOARDS. The card names the phase 1 and phase 2 boards; the phase 3 board
// is here because forty-seven P3 ids are already on main and the check has to
// exit 0 there. The list is explicit rather than a directory glob: a board file
// appearing in docs/board/ is somebody adding a board, and it should be a line
// in a diff rather than a silent widening of what this check will accept.
//
// AUT-16 generalises id resolution for the HARNESS, which is a different surface
// (the digest, the Telegram reply routing). This list is not that card and does
// not wait on it.
const DEFAULT_BOARDS = [
  "docs/board/rc-board.json",
  "docs/board/rc-board-phase2.json",
  "docs/board/rc-board-phase3.json",
];

// THE NON-CARD PREFIX ALLOW-LIST. EXPLICIT, SHORT, AND EACH ENTRY CARRIES ITS
// REASON. Inferring these from a regex would mean the check quietly stops
// looking at a whole class of commit and nobody can see when that happened.
// Adding an entry here is a decision somebody made, readable in a diff.
const NON_CARD_PREFIXES = [
  {
    prefix: "R-",
    why: "a ruling in decisions/inbox.md. R-006, R-011 and R-026 are on main. A ruling is a decision, not a unit of work, and it is never on a board.",
  },
  {
    prefix: "POC-",
    why: "a harness commit. scripts/poc/ is the run harness and its own bookkeeping is not the product's work, per CLAUDE.md section 13.",
  },
  {
    prefix: "INC-",
    why: "an incident record. INC-05 and INC-06 are the two production outages of 2026-08-31 and 2026-09-01. An incident is a thing that happened, not a card somebody picked up.",
  },
];

// A CARD ID STARTS WITH A LETTER. "TRIAGE 20260830-220004: ..." is a real
// subject on main and 20260830-220004 is a run id, so the leading-letter
// requirement is what keeps a timestamp out of the resolver.
const CARD_ID = /^[A-Za-z][A-Za-z0-9]*-[0-9]+[a-z]?$/;

function loadBoardIds(boardPaths) {
  const ids = new Set();
  for (const rel of boardPaths) {
    const file = rel.startsWith("/") ? rel : join(ROOT, rel);
    if (!existsSync(file)) {
      console.error(`check-card-ids: board not found: ${rel}`);
      console.error("Refusing to report OK against a board list that does not resolve.");
      process.exit(2);
    }
    let board;
    try {
      board = JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      console.error(`check-card-ids: ${rel} does not parse: ${err.message}`);
      process.exit(2);
    }
    const cards = board.cards || [];
    if (cards.length === 0) {
      console.error(`check-card-ids: ${rel} carries zero cards`);
      console.error("A board with no cards would make every id unresolvable or, worse, make");
      console.error("an empty subject list look clean. Refusing to report OK.");
      process.exit(2);
    }
    for (const card of cards) if (card.id) ids.add(card.id);
  }
  return ids;
}

function allowed(id) {
  return NON_CARD_PREFIXES.find((entry) => id.toUpperCase().startsWith(entry.prefix));
}

// The whole check, as a function, so the self-test below can run it against
// fixture subjects without a git repository or a temporary directory.
function inspect(subjects, boardIds) {
  const failures = [];
  const skipped = [];
  let resolved = 0;
  for (const subject of subjects) {
    const colon = subject.indexOf(":");
    if (colon < 0) continue;
    const prefix = subject.slice(0, colon);
    for (const token of prefix.split(/[,\s]+/).filter(Boolean)) {
      if (!CARD_ID.test(token)) continue;
      const exempt = allowed(token);
      if (exempt) {
        skipped.push({ token, subject, why: exempt.why });
        continue;
      }
      if (boardIds.has(token)) {
        resolved += 1;
        continue;
      }
      failures.push({ token, subject });
    }
  }
  return { failures, skipped, resolved };
}

function subjectsFromGit() {
  const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  let rev = null;
  for (const candidate of ["origin/main", "refs/remotes/origin/main"]) {
    try {
      git(["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]);
      rev = candidate;
      break;
    } catch {
      /* try the next one */
    }
  }
  if (!rev) {
    // A shallow or single-ref checkout has no origin/main. Fetch it once rather
    // than falling back to HEAD: HEAD is the branch, and checking the branch is
    // the one thing this file must not do.
    try {
      git(["fetch", "--no-tags", "--quiet", "origin", "+refs/heads/main:refs/remotes/origin/main"]);
      git(["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"]);
      rev = "refs/remotes/origin/main";
    } catch (err) {
      console.error("check-card-ids: cannot resolve origin/main");
      console.error(String(err.message || err).split("\n")[0]);
      console.error("Refusing to fall back to HEAD: the branch is not the record.");
      process.exit(2);
    }
  }
  const out = git(["log", rev, "--format=%s"]);
  return { rev, subjects: out.split("\n").filter((line) => line.length > 0) };
}

// THE FAILING CASE, PROVED BEFORE THE PASSING ONE IS BELIEVED.
//
// A check that has only ever been seen to pass is a check nobody has watched
// work. Every case below that must FAIL is paired with a control that must PASS
// on the same fixture harness, because a fixture that silently fails to run
// satisfies every negative assertion while proving nothing.
function selfTest(boardIds) {
  const cases = [
    {
      name: "control: a real card id on main resolves",
      subjects: ["P2-01: schema and RLS"],
      expect: 0,
    },
    {
      name: "an id that resolves to no card on any board is refused",
      subjects: ["P2-99: a card that was never authored"],
      expect: 1,
    },
    {
      name: "an allow-listed ruling prefix is not a card id",
      subjects: ["R-006: the Telegram owner id is a public identifier"],
      expect: 0,
    },
    {
      name: "every id in a multi-id prefix is resolved, not only the first",
      subjects: ["P2-01, P2-99: two ids, the second of which is not a card"],
      expect: 1,
    },
    {
      name: "a run id in a subject prefix is not read as a card id",
      subjects: ["TRIAGE 20260830-220004: rulings from the overnight run"],
      expect: 0,
    },
    {
      name: "a subject with no colon carries no prefix and is not read",
      subjects: ["P2-99 was never a card and this subject has no prefix"],
      expect: 0,
    },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = inspect(c.subjects, boardIds).failures.length;
    const ok = got === c.expect;
    if (!ok) bad += 1;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${c.name} (expected ${c.expect} failures, got ${got})`);
  }
  if (bad > 0) {
    console.error(`check-card-ids: ${bad} self-test case(s) did not behave as required.`);
    console.error("The check cannot be trusted against real history until they do.");
    process.exit(2);
  }
}

const boardArg = process.env.RC_CARD_ID_BOARDS;
const boardPaths = boardArg ? boardArg.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_BOARDS;
const boardIds = loadBoardIds(boardPaths);

const fixtureFile = process.env.RC_CARD_ID_SUBJECTS;
let subjects;
let source;
if (fixtureFile) {
  // The fixture path exists so the failing case can be handed to this file
  // directly, from a terminal or from a report, without a repository whose
  // history has been doctored to produce it.
  if (!existsSync(fixtureFile)) {
    console.error(`check-card-ids: fixture subject list not found: ${fixtureFile}`);
    process.exit(2);
  }
  subjects = readFileSync(fixtureFile, "utf8").split("\n").filter((line) => line.length > 0);
  source = `fixture ${fixtureFile}`;
} else {
  console.log("check-card-ids: self-test");
  selfTest(boardIds);
  const git = subjectsFromGit();
  subjects = git.subjects;
  source = git.rev;
}

if (subjects.length === 0) {
  console.error(`check-card-ids: ${source} yielded zero commit subjects`);
  console.error("An empty list passes every assertion below while reading nothing.");
  process.exit(2);
}

const { failures, skipped, resolved } = inspect(subjects, boardIds);

console.log(`check-card-ids: ${subjects.length} commit subject(s) from ${source}`);
console.log(`  boards: ${boardPaths.join(", ")} (${boardIds.size} card ids)`);
console.log(`  card ids resolved: ${resolved}`);
console.log(`  non-card prefixes skipped: ${skipped.length}`);
for (const entry of NON_CARD_PREFIXES) {
  const hits = skipped.filter((s) => s.why === entry.why).length;
  console.log(`    ${entry.prefix.padEnd(6)} ${String(hits).padStart(3)}  ${entry.why}`);
}

if (failures.length > 0) {
  console.error("");
  console.error(`check-card-ids: ${failures.length} commit(s) carry a card id that resolves to no card.`);
  for (const f of failures) {
    console.error(`  ${f.token}  ->  ${f.subject}`);
  }
  console.error("");
  console.error("The board undercounts work that was actually done. Fix it by authoring the");
  console.error("card, or, if the prefix is genuinely not a card id, by adding it to");
  console.error("NON_CARD_PREFIXES in this file with the reason next to it. Never by editing");
  console.error("the commit log.");
  process.exit(1);
}

console.log("check-card-ids: OK, every card id on the record resolves to a card.");
