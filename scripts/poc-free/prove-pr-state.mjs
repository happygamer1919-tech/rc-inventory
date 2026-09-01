#!/usr/bin/env node
// prove-pr-state.mjs
// Card P3-11d. The staleness reporter, proven against the states that actually
// occurred rather than against invented ones.
//
// dirty-but-green.json  is PR #148 as it stood during INC-06: the fix for a
//                       six-screen production outage, pushed, CONFLICTING, no run
//                       started, and `gh pr checks` reporting quality SUCCESS from
//                       the previous sha. That is the state that cost the hour.
// behind-but-green.json is PR #130 as it stood on 2026-08-31: green on its head,
//                       BEHIND its base, and unmergeable because the required
//                       check is strict.
// clean-and-green.json  must PASS, or the tool cries stale at every healthy pull
//                       request and nobody reads it twice.

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "pr-check-state.mjs");
const FIX = join(HERE, "pr-state-fixtures");

const results = [];
function check(name, fixture, wantExit, wantText) {
  const r = spawnSync("node", [TOOL, "--fixture", join(FIX, fixture)], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const pass = r.status === wantExit && (!wantText || out.includes(wantText));
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) console.log(`      exit ${r.status}, wanted ${wantExit}\n${out.slice(0, 400)}`);
}

check(
  "a green check on a DIRTY pull request is reported as STALE, exit 1",
  "dirty-but-green.json",
  1,
  "STALE, NOT GREEN",
);
check(
  "  ...and it says a conflicting PR triggers zero workflows",
  "dirty-but-green.json",
  1,
  "triggers ZERO workflows",
);
check(
  "a green check on a BEHIND pull request is reported as STALE, exit 1",
  "behind-but-green.json",
  1,
  "STALE, NOT GREEN",
);
check(
  "a green check on a CLEAN pull request is trusted, exit 0",
  "clean-and-green.json",
  0,
  "can be trusted",
);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} of ${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
