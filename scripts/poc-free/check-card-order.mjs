#!/usr/bin/env node
// check-card-order.mjs
// Card BOARD-03. THE NEXT-CARD PICK COUNTS NUMBERS AS NUMBERS.
//
// `localeCompare` on the raw id puts AUT-16 before AUT-8, because it compares the
// characters "1" and "8". The pick takes the head of that list, so AUT-8 and
// AUT-9 queued behind every AUT-1x card authored days later and would have stayed
// there for ever: a lane only ever grows, so nothing removes the newer ids from
// in front of them.
//
// IT DRIVES scripts/poc/eligible.mjs AS A PROCESS, not the comparator alone. The
// defect was never in a comparator; it was in what the selector returned, and the
// selector is what the harness reads. RC_ELIGIBLE_MJS points at a different copy
// of that file, which is how the three cases are proved to FAIL FIRST against the
// pre-change one.
//
// No network, no credentials, no board of its own except the fixtures it writes
// into a temporary directory and deletes.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const ELIGIBLE = process.env.RC_ELIGIBLE_MJS ?? path.join(ROOT, "scripts", "poc", "eligible.mjs");

let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => {
  console.error(`  FAIL  ${m}`);
  failures += 1;
};

const work = mkdtempSync(path.join(tmpdir(), "check-card-order-"));

function card(id, over = {}) {
  return {
    id,
    title: `card ${id}`,
    plain: `what ${id} means for the client, in ordinary words.`,
    lane: "in_flight",
    home_lane: "in_flight",
    status: "todo",
    priority: "medium",
    owner_terminal: "executor",
    gate: "green_self_merge",
    depends_on: [],
    blocked_on: null,
    question: null,
    acceptance: "COMMAND: a named test exits 0.",
    defaults: "THE FIXTURE ANSWERS ITS OWN AMBIGUITIES.",
    last_checkpoint: "2026-09-05T00:00:00Z",
    evidence: null,
    notes: "",
    ...over,
  };
}

function boardWith(ids) {
  return {
    board: "fixture",
    schema_version: 3,
    phase: 2,
    as_of: "2026-09-05T00:00:00Z",
    renders_to: "none",
    doctrine: "fixture",
    lanes: {},
    launch_gate: { denominator: 9, readiness_passed: 0, conditions: [] },
    cards: ids.map((id) => card(id)),
  };
}

/** The selector's own answer, as the harness reads it: a comma separated list. */
function eligibleIds(board, name) {
  const file = path.join(work, `${name}.json`);
  writeFileSync(file, JSON.stringify(board, null, 2) + "\n");
  try {
    return execFileSync("node", [ELIGIBLE, "--board", file, "--ids"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    bad(`the selector exited non-zero on the ${name} fixture: ${String(error.message).split("\n")[0]}`);
    return "";
  }
}

console.log("check-card-order");
console.log(`  selector    ${path.relative(ROOT, ELIGIBLE) || ELIGIBLE}`);

try {
  // -------------------------------------------------------------------------
  // 1. THE LIVE CASE. The single digit ids come first.
  //
  // The card names AUT-8 and AUT-9 behind AUT-16, AUT-17 and AUT-18. Those three
  // shipped before this check was written, so the case is built from the SHAPE
  // rather than from the ids that happened to be eligible on one day: a lane with
  // single and double digit numbers must come out in numeric order.
  // -------------------------------------------------------------------------
  const live = eligibleIds(boardWith(["AUT-16", "AUT-17", "AUT-18", "AUT-8", "AUT-9", "AUT-21"]), "live");
  const wantLive = "AUT-8,AUT-9,AUT-16,AUT-17,AUT-18,AUT-21";
  if (live === wantLive) {
    ok(`the single digit ids come first: ${live}`);
  } else {
    bad(`the eligible order is "${live}", expected "${wantLive}"`);
  }

  // -------------------------------------------------------------------------
  // 2. THE SUFFIX PROPERTY, WHICH IS THE HALF MOST LIKELY TO BE BROKEN BY THE FIX.
  //
  // A key of (prefix, number) alone leaves P3-04 and P3-04b tied, so their order
  // would depend on the sort's stability rather than on anything anyone chose.
  // -------------------------------------------------------------------------
  const suffix = eligibleIds(boardWith(["P3-05", "P3-04b", "P3-04"]), "suffix");
  const wantSuffix = "P3-04,P3-04b,P3-05";
  if (suffix === wantSuffix) {
    ok(`the suffix keeps its place: ${suffix}`);
  } else {
    bad(`the suffixed order is "${suffix}", expected "${wantSuffix}"`);
  }

  // -------------------------------------------------------------------------
  // 3. AN UNPARSEABLE ID IS NOT SILENTLY DROPPED, ASSERTED BY COUNT.
  //
  // A selector that omits a card is worse than one that orders it oddly, and
  // docs/LEARNINGS.md names the class where an empty result reads as nothing to
  // do. The order it lands in is not asserted, only that it is deterministic and
  // that it is THERE.
  // -------------------------------------------------------------------------
  const oddIds = ["P3-04", "ODDBALL", "AUT-8", "no-number-here"];
  const odd = eligibleIds(boardWith(oddIds), "odd");
  const oddOut = odd ? odd.split(",") : [];
  if (oddOut.length === oddIds.length) {
    ok(`every id survives the sort, ${oddOut.length} in and ${oddOut.length} out: ${odd}`);
  } else {
    bad(`${oddIds.length} ids went in and ${oddOut.length} came out: ${odd}`);
  }
  for (const id of oddIds) {
    if (!oddOut.includes(id)) bad(`${id} vanished from the eligible set`);
  }
  const again = eligibleIds(boardWith(oddIds), "odd-again");
  if (again === odd) ok("and the order is deterministic across runs");
  else bad(`the order changed between runs: "${odd}" then "${again}"`);

  // -------------------------------------------------------------------------
  // ONE SORT, ONE PLACE. A second comparator is the defect this card removes.
  // -------------------------------------------------------------------------
  const grep = (() => {
    try {
      // Keyed on .id, not on any localeCompare. scripts/poc/ask.mjs sorts open
      // questions by asked_at, which is a timestamp and a correct use of it: a
      // grep broad enough to catch that would be a grep nobody could keep green.
      return execFileSync(
        "grep",
        ["-rnE", "localeCompare\\(String\\([ab]\\.id\\)|\\.id\\)\\.localeCompare", path.join(ROOT, "scripts", "poc")],
        { encoding: "utf8" }
      );
    } catch {
      return "";
    }
  })();
  const offenders = grep
    .split("\n")
    .filter(Boolean)
    .filter((l) => !l.includes("card-order.mjs"));
  if (offenders.length === 0) {
    ok("no script under scripts/poc/ sorts ids with its own localeCompare");
  } else {
    bad(`${offenders.length} place(s) still sort ids with their own comparator`);
    for (const o of offenders.slice(0, 5)) console.error(`        ${o.replace(ROOT + "/", "")}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log("");
if (failures === 0) {
  console.log("check-card-order: the pick counts numbers as numbers.");
  process.exit(0);
}
console.error(`check-card-order: ${failures} assertion(s) failed`);
process.exit(1);
