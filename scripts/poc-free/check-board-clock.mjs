#!/usr/bin/env node
// check-board-clock.mjs
// Card BOARD-02. A BOARD TIMESTAMP THAT IS AHEAD OF THE COMMIT THAT WROTE IT IS
// A VALUE NOBODY READ FROM ANY CLOCK, BECAUSE THAT TIME HAD NOT HAPPENED YET.
//
// THE DRIFT THIS EXISTS TO END, measured across eleven consecutive commits on the
// phase 3 board: 3, 21, 62, 150, 226, 300, 398, 467, 521, 557 and 554 minutes
// ahead. Each session read the PREVIOUS as_of instead of a clock and moved it
// forward a little, because correcting it would have made the number jump
// backwards on a board whose whole purpose is to say when it last told the truth.
// No session wanted to be the one that moved it back. A check is what ends that
// argument.
//
// AHEAD ONLY, NOT A WINDOW, AND THAT IS THE WHOLE DESIGN. A board written twenty
// minutes BEFORE the commit that carries it is normal: a session finishes its
// board edit, runs the validator, then commits. Only the ahead direction is an
// error, so this has one bound. A symmetric window would fail honest commits and
// would have to be loosened until it stopped catching anything.
//
// TWO THRESHOLDS, AND THEY ARE DIFFERENT ON PURPOSE.
//   as_of              60 minutes of slack, for a long commit sequence. It is
//                      NOT a tolerance for drift: the measured series above is
//                      caught on its third commit and on every one after.
//   last_checkpoint    ZERO. A per-card checkpoint in the future has no honest
//   and evidence.at    reading at all.
//
// IT SAYS WHICH COMMIT IT READ, ON EVERY RUN. In the quality job the checkout may
// be shallow, or the ref may be a merge commit made for the pull request. This
// compares against the commit that last touched the file when that is available
// and against HEAD otherwise, and PRINTS which of the two it used. A check whose
// comparison basis is invisible produces a failure nobody can reproduce locally.
//
// RC_BOARD_CLOCK_REF points every read at a historical commit. It exists so a
// pull request can prove the check refuses against a state already in the
// history, rather than against a failure somebody manufactured.

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const BOARD_DIR = path.join(ROOT, "docs", "board");
const REF = process.env.RC_BOARD_CLOCK_REF ?? "";

const AS_OF_SLACK_MINUTES = 60;
const CHECKPOINT_SLACK_MINUTES = 0;

let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => {
  console.error(`  FAIL  ${m}`);
  failures += 1;
};

const git = (args) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** The commit this run compares against, and how it was found. Never guessed. */
function basisFor(relative) {
  if (REF) {
    return { iso: git(["log", "-1", "--format=%cI", REF]), how: `RC_BOARD_CLOCK_REF=${REF}` };
  }
  // A FILE WITH UNCOMMITTED CHANGES IS BEING WRITTEN NOW, so the honest basis is
  // the clock rather than the last commit. Without this the check would refuse
  // its own author: a checkpoint read from a clock a minute ago is "ahead" of a
  // commit made an hour ago, and CLAUDE.md 2 expects the gates to be runnable
  // BEFORE the commit. In CI the tree is clean, so this branch never fires and
  // the comparison is always against a real commit.
  let dirty = "";
  try {
    dirty = git(["status", "--porcelain", "--", relative]);
  } catch {
    dirty = "";
  }
  if (dirty) {
    return { iso: new Date().toISOString(), how: `the current clock, because ${relative} has uncommitted changes` };
  }

  let iso = "";
  try {
    iso = git(["log", "-1", "--format=%cI", "--", relative]);
  } catch {
    iso = "";
  }
  if (iso) return { iso, how: `the commit that last touched ${relative}` };
  // A shallow checkout may carry no history for the file. HEAD is the honest
  // fallback and it is SAID rather than assumed.
  return { iso: git(["log", "-1", "--format=%cI", "HEAD"]), how: "HEAD, because no commit for that file is in this checkout" };
}

function readBoard(relative) {
  const text = REF ? git(["show", `${REF}:${relative}`]) : execFileSync("cat", [path.join(ROOT, relative)], { encoding: "utf8" });
  return JSON.parse(text);
}

/** Every timestamp on a board that claims WHEN something was true, by path. */
function timestamps(board) {
  const out = [];
  const add = (where, value) => {
    if (typeof value === "string" && value.trim()) out.push({ where, value });
  };
  for (const card of board.cards || []) {
    add(`card ${card.id}.last_checkpoint`, card.last_checkpoint);
    if (card.evidence && typeof card.evidence === "object") add(`card ${card.id}.evidence.at`, card.evidence.at);
  }
  const gate = board.launch_gate || {};
  for (const cond of gate.conditions || []) {
    add(`gate ${cond.id}.last_checkpoint`, cond.last_checkpoint);
    if (cond.evidence && typeof cond.evidence === "object") add(`gate ${cond.id}.evidence.at`, cond.evidence.at);
  }
  return out;
}

const boards = readdirSync(BOARD_DIR)
  .filter((n) => /^rc-board.*\.json$/.test(n))
  .sort()
  .map((n) => path.posix.join("docs", "board", n));

if (boards.length === 0) {
  console.error("check-board-clock: no board JSON found under docs/board/");
  process.exit(2);
}

console.log("check-board-clock");
console.log(`  boards      ${boards.length}`);

for (const relative of boards) {
  let board;
  try {
    board = readBoard(relative);
  } catch (error) {
    if (REF) {
      console.log(`  ${relative}: not present at ${REF}, skipped`);
      continue;
    }
    console.error(`check-board-clock: ${relative} did not parse: ${String(error.message).split("\n")[0]}`);
    process.exit(2);
  }

  const basis = basisFor(relative);
  const basisMs = Date.parse(basis.iso);
  if (!Number.isFinite(basisMs)) {
    console.error(`check-board-clock: could not read a commit time for ${relative}`);
    process.exit(2);
  }
  console.log("");
  console.log(`  ${relative}`);
  console.log(`    basis     ${new Date(basisMs).toISOString()}  (${basis.how})`);

  const asOfMs = Date.parse(board.as_of);
  if (!Number.isFinite(asOfMs)) {
    bad(`${relative}: as_of "${board.as_of}" is not a date`);
  } else {
    const ahead = Math.round((asOfMs - basisMs) / 60000);
    if (ahead > AS_OF_SLACK_MINUTES) {
      bad(
        `${relative}: as_of ${new Date(asOfMs).toISOString()} is ${ahead} minutes AHEAD of the commit ` +
          `${new Date(basisMs).toISOString()}, past the ${AS_OF_SLACK_MINUTES} minute slack. ` +
          "That time had not happened when the value was written, so it was read from the previous as_of rather than from a clock."
      );
    } else {
      ok(`as_of is ${ahead >= 0 ? ahead + " minute(s) ahead" : -ahead + " minute(s) behind"}, within the ${AS_OF_SLACK_MINUTES} minute slack`);
    }
  }

  const stamps = timestamps(board);
  // THE COUNT ASSERTION. A board whose timestamps were all skipped would satisfy
  // every comparison below while measuring nothing, which is the defect class
  // docs/LEARNINGS.md names.
  if (stamps.length === 0) {
    bad(`${relative}: not one card or gate timestamp was read, so the checks below measured nothing`);
    continue;
  }
  const future = [];
  for (const stamp of stamps) {
    const ms = Date.parse(stamp.value);
    if (!Number.isFinite(ms)) {
      bad(`${relative}: ${stamp.where} = "${stamp.value}" is not a date`);
      continue;
    }
    const ahead = Math.round((ms - basisMs) / 60000);
    if (ahead > CHECKPOINT_SLACK_MINUTES) future.push({ ...stamp, ahead });
  }
  if (future.length === 0) {
    ok(`all ${stamps.length} card and gate timestamp(s) are at or before the commit`);
  } else {
    bad(`${relative}: ${future.length} of ${stamps.length} timestamp(s) are AHEAD of the commit that wrote them`);
    for (const f of future.slice(0, 12)) {
      console.error(`        ${f.where} = ${f.value}, ${f.ahead} minute(s) ahead`);
    }
    if (future.length > 12) console.error(`        ... and ${future.length - 12} more`);
  }
}

console.log("");
if (failures === 0) {
  console.log("check-board-clock: every board timestamp was read from a clock that had already struck.");
  process.exit(0);
}
console.error(`check-board-clock: ${failures} assertion(s) failed`);
process.exit(1);
