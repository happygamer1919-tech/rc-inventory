#!/usr/bin/env node
// pr-check-state.mjs
// Card P3-11d. A GREEN CHECK ON A CONFLICTING PULL REQUEST IS STALE, NOT GREEN.
//
// WHAT THIS EXISTS FOR, AND IT COST AN HOUR OF THE INC-06 OUTAGE.
//
// A pull request that conflicts with its base triggers ZERO workflows. Nothing
// runs. But the check result from the PREVIOUS head sha stays attached to the
// pull request, and `gh pr checks` keeps reporting it, so the terminal waiting on
// a fix sees:
//
//     quality   pass   15m48s
//
// while its pushed fix has not run and will not run. During INC-06 the fix for a
// six-screen production outage sat in exactly that state: pushed, conflicting, no
// run, and every tool reporting green.
//
// CLAUDE.md section 3 already names this trap FOR MERGING. Section 3.1 forbids
// merging on anything but a run for the head sha. Neither covers the case where
// nobody is merging yet and somebody is simply WAITING, which is the case that
// hurt.
//
// SO THIS IS A REPORTING TOOL, NOT A GATE. It prints the required check beside
// mergeStateStatus and the head sha, and it EXITS NON-ZERO when the check reads
// green while the pull request is DIRTY or BEHIND, because that green belongs to
// a commit nobody is proposing to merge.
//
// IT DOES NOT SOLVE THE PROBLEM BY POLLING HARDER. mergeStateStatus is available
// immediately and for free; staleness is read from it rather than inferred from a
// run that never appears.
//
// Usage:
//   node scripts/poc-free/pr-check-state.mjs <pr-number>
//   node scripts/poc-free/pr-check-state.mjs --fixture <path-to-json>
//
// EXIT CODES:
//   0  the check result can be trusted: it belongs to the current head
//   1  STALE: a result is reported but the pull request conflicts or is behind,
//      so no run exists for what would actually be merged; or (P3-265) the
//      green belongs to a draft run, whose heavy steps were skipped
//   2  usage, or the state could not be read

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const REQUIRED_CHECK = "quality";
// A pull request in one of these states has NOT run its checks against what
// would be merged. DIRTY is a conflict and triggers nothing at all. BEHIND means
// the base has moved and, with a strict required check, the recorded run is not
// the run that will decide the merge.
const NOT_CURRENT = new Set(["DIRTY", "BEHIND"]);

function usage(msg) {
  process.stderr.write(`${msg}\n\nusage: pr-check-state.mjs <pr-number>\n       pr-check-state.mjs --fixture <file.json>\n`);
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length === 0) usage("no pull request given");

let state;
if (args[0] === "--fixture") {
  if (!args[1] || !existsSync(args[1])) usage("fixture not found");
  state = JSON.parse(readFileSync(args[1], "utf8"));
} else {
  const pr = args[0];
  const res = spawnSync(
    "gh",
    ["pr", "view", pr, "--json", "number,headRefOid,mergeStateStatus,mergeable,statusCheckRollup,isDraft"],
    { encoding: "utf8" },
  );
  if (res.status !== 0) usage(`gh pr view failed: ${(res.stderr || "").trim()}`);
  state = JSON.parse(res.stdout);
  // P3-265. When the pull request was last marked ready for review. One jq
  // result per page, so the last non-empty line is the latest event.
  const tl = spawnSync(
    "gh",
    [
      "api",
      "--paginate",
      `repos/{owner}/{repo}/issues/${pr}/timeline`,
      "--jq",
      '[.[] | select(.event == "ready_for_review") | .created_at] | last // ""',
    ],
    { encoding: "utf8" },
  );
  if (tl.status !== 0) usage(`gh api timeline failed: ${(tl.stderr || "").trim()}`);
  state.readyAt = tl.stdout.split("\n").map((l) => l.trim()).filter(Boolean).pop() || null;
}

const head = String(state.headRefOid || "").slice(0, 7);
const mergeState = String(state.mergeStateStatus || "UNKNOWN");
const rollup = Array.isArray(state.statusCheckRollup) ? state.statusCheckRollup : [];
// P3-265. THE NEWEST RUN, NOT THE FIRST. Marking a draft ready runs `quality`
// again on the same head sha, so the rollup then carries two entries for it, the
// draft run first. Taking the first read the draft run's green and refused a
// pull request whose ready run had passed (#507). Ties and entries without a
// start time keep rollup order, last wins.
const required = rollup
  .filter((c) => (c.name || c.context) === REQUIRED_CHECK)
  .reduce((newest, c) => {
    if (!newest) return c;
    const a = Date.parse(newest.startedAt || "");
    const b = Date.parse(c.startedAt || "");
    return Number.isFinite(a) && Number.isFinite(b) && b < a ? newest : c;
  }, undefined);
const verdict = required ? String(required.conclusion || required.state || "").toUpperCase() : "ABSENT";

process.stdout.write(`pull request      #${state.number ?? "?"}\n`);
process.stdout.write(`head              ${head}\n`);
process.stdout.write(`mergeStateStatus  ${mergeState}\n`);
process.stdout.write(`${REQUIRED_CHECK.padEnd(18)}${verdict}\n`);

const green = verdict === "SUCCESS";

// P3-265. A DRAFT GREEN IS NOT A MERGE GREEN. The quality workflow skips Build,
// the migration apply, the applier proofs and End to end on a draft, so a draft
// run says nothing about them. Marking the draft ready starts a full run on the
// SAME head sha, and until GitHub registers it, the draft run's success is still
// the result attached to that sha: a merge in those seconds would rest on a run
// whose heavy steps never ran. Both cases below refuse that green.
//
// THEY COME BEFORE THE STALENESS CHECK, so a BEHIND pull request still reports
// them. The factory's auto-merger merges a BEHIND pull request that is green on
// its head, and it reads "NOT A MERGE GREEN" in this output to refuse a draft
// green there too.
if (green && state.isDraft === true) {
  process.stderr.write(
    `\nDRAFT, NOT A MERGE GREEN.\n\n` +
      `This pull request is a draft. Its ${REQUIRED_CHECK} run skipped the heavy steps.\n` +
      `Run \`gh pr ready ${state.number ?? "<pr>"}\` and wait for the run that starts.\n`,
  );
  process.exit(1);
}
const startedAt = required ? Date.parse(required.startedAt || "") : NaN;
const readyAt = Date.parse(state.readyAt || "");
if (green && Number.isFinite(readyAt) && (!Number.isFinite(startedAt) || startedAt < readyAt)) {
  process.stderr.write(
    `\nGREEN FROM BEFORE READY, NOT A MERGE GREEN.\n\n` +
      `The ${REQUIRED_CHECK} result started ${required.startedAt || "at an unknown time"}, before this pull\n` +
      `request was marked ready at ${state.readyAt}. It is the draft run, with the heavy\n` +
      `steps skipped. Wait for the run that marking it ready started.\n`,
  );
  process.exit(1);
}

if (green && NOT_CURRENT.has(mergeState)) {
  process.stderr.write(
    `\nSTALE, NOT GREEN.\n\n` +
      `The ${REQUIRED_CHECK} check reads SUCCESS while this pull request is ${mergeState}.\n` +
      (mergeState === "DIRTY"
        ? "A conflicting pull request triggers ZERO workflows, so nothing ran for the current\n" +
          "head and that success belongs to an earlier sha. A fix pushed onto a conflicting\n" +
          "branch does not run and does not report.\n"
        : "The base has moved and the required check is strict, so the recorded run is not the\n" +
          "run that will decide this merge.\n") +
      `\nResolve the conflict or sync the branch, then wait for a run on ${head}.\n`,
  );
  process.exit(1);
}

if (green) {
  process.stdout.write(`\nthe ${REQUIRED_CHECK} result belongs to head ${head} and can be trusted\n`);
  process.exit(0);
}

process.stdout.write(`\nnot green, nothing to mistake for green\n`);
process.exit(0);
