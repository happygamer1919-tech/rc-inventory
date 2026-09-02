#!/usr/bin/env node
// check-deployed-commit.mjs
// Card P3-11e. THE DEPLOYED HALF, WHICH INC-06 IS ENTIRELY ABOUT.
//
// THE ORDERING RULE, RESTATED FROM check-removal-safety.mjs:
//
//   an ADDITIVE migration applies BEFORE the code that reads it merges
//   a REMOVAL migration applies AFTER the code that stops reading it is merged
//                            AND DEPLOYED
//
// check-removal-safety proves the MERGED half: no reader remains on main. Until
// this file, the DEPLOYED half had no proof at all, and the applier asked the
// operator to type RC_DEPLOY_CONFIRMED=yes instead. An operator statement is
// exactly the guess that produced INC-06: six screens answered 500 because a
// removal was applied against a database whose live code still read the object.
//
// WHAT IT ASKS, AND WHY THAT QUESTION AND NOT ANOTHER.
//
// It asks production which commit it is running, and then asks git whether the
// commit being applied against is an ANCESTOR of that one. If it is, then every
// line of code in the tree being applied is already live, including the line
// that stopped reading the removed object. If it is not, then production is
// running something older, or something unrelated, and either way the removal is
// premature.
//
// `git merge-base --is-ancestor HEAD <live>` is the whole test, and it is worth
// noticing that it is stronger than "the deploy of my branch finished": it is
// true only when the live commit CONTAINS this tree.
//
// NO VERCEL_TOKEN AND NO VERCEL API, on the owner's instruction. Vercel exposes
// VERCEL_GIT_COMMIT_SHA to the APPLICATION at build time, so the deployment
// states its own commit through /api/health with no credential anywhere. This
// survives P2-13's credential revocation, and that is the point: a check that
// dies when the keys rotate is a check that dies on the day it matters.
//
// EVERY FAILURE IS A REFUSAL. Unreachable, not JSON, no commit, a commit git has
// never heard of, a commit that is not a descendant: all exit non-zero. There is
// no path on which not knowing is treated as yes, because "I could not tell, so
// I assumed it was fine" is a one-sentence description of INC-06.

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_MISUSE = 2;

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  if (!process.argv[i].startsWith("--")) continue;
  const k = process.argv[i].slice(2);
  const n = process.argv[i + 1];
  if (n === undefined || n.startsWith("--")) args[k] = "true";
  else {
    args[k] = n;
    i += 1;
  }
}

const ORIGIN = (args.origin || process.env.RC_HEALTH_ORIGIN || "https://www.rapidconstructmd.com")
  .replace(/\/+$/, "");
const HEALTH_URL = `${ORIGIN}/api/health`;
const EXPECT = args.commit || "HEAD";
const TIMEOUT_MS = Number(args.timeout || 20000);

const out = (s) => console.log(s);
const err = (s) => console.error(s);

function git(argv) {
  return execFileSync("git", argv, { cwd: ROOT, encoding: "utf8" }).trim();
}

function refuse(reason, detail) {
  err("\n" + "!".repeat(78));
  err("REFUSED. The deployed half cannot be proven, so nothing may be applied.");
  err("!".repeat(78));
  err(`\n${reason}\n`);
  if (detail) err(detail + "\n");
  err(
    "A removal migration applies only AFTER the code that stopped reading the removed\n" +
      "object is merged AND DEPLOYED. check:removal-safety proves merged. This proves\n" +
      "deployed, and it did not. That is INC-06's exact precondition.\n",
  );
  process.exit(EXIT_REFUSED);
}

// --- what we are applying ---------------------------------------------------
let head;
try {
  head = git(["rev-parse", "--verify", `${EXPECT}^{commit}`]);
} catch {
  err(`check-deployed-commit: '${EXPECT}' does not resolve to a commit in this repository.`);
  process.exit(EXIT_MISUSE);
}

out("check-deployed-commit");
out(`  health route  ${HEALTH_URL}`);
out(`  applying at   ${head.slice(0, 12)}`);

// --- what production says it is running -------------------------------------
let response;
try {
  response = await fetch(HEALTH_URL, {
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
} catch (error) {
  refuse(
    `The health route could not be reached: ${error && error.message ? error.message : error}`,
    "Not knowing is never read as yes. Fix the reachability, then re-run.",
  );
}

// A redirect is a login page, not an answer. proxy.ts must carry /api/health in
// its allow-list; without it every request here is a 307 and this check would
// refuse forever, for the wrong reason.
if (response.status >= 300 && response.status < 400) {
  refuse(
    `The health route answered ${response.status}, a redirect.`,
    `Location: ${response.headers.get("location") || "(none)"}\n` +
      "That is the authentication proxy, not the route. proxy.ts isPublic() must\n" +
      "carry /api/health.",
  );
}

const body = await response.text();
const contentType = response.headers.get("content-type") || "";
if (!response.ok) {
  refuse(`The health route answered ${response.status}.`, body.slice(0, 300));
}
if (!contentType.includes("application/json")) {
  refuse(
    `The health route answered ${contentType || "no content-type"}, not JSON.`,
    body.slice(0, 300),
  );
}

let payload;
try {
  payload = JSON.parse(body);
} catch {
  refuse("The health route's body is not JSON.", body.slice(0, 300));
}

const live = typeof payload.commit === "string" ? payload.commit.trim() : "";
if (live.length === 0) {
  refuse(
    "The health route reported no commit.",
    "VERCEL_GIT_COMMIT_SHA is set by the platform at build time. An empty value\n" +
      "means this deployment was not built by Vercel, or the variable was stripped.",
  );
}

out(`  live commit   ${live.slice(0, 12)}`);
out(`  ledger        ${payload.ledger_version === null ? "not reported" : payload.ledger_version}`);

// --- the question -----------------------------------------------------------
try {
  git(["rev-parse", "--verify", `${live}^{commit}`]);
} catch {
  refuse(
    `This repository has never heard of the live commit ${live.slice(0, 12)}.`,
    "Either the checkout is stale (fetch and re-run) or production is running a\n" +
      "commit from somewhere else. Neither is a state in which to remove schema.",
  );
}

if (live === head) {
  out("\nOK: production is running exactly the commit being applied against.");
  process.exit(EXIT_OK);
}

try {
  execFileSync("git", ["merge-base", "--is-ancestor", head, live], { cwd: ROOT });
} catch {
  let behindBy = "";
  try {
    behindBy = git(["rev-list", "--count", `${live}..${head}`]);
  } catch {
    /* the count is a courtesy, not the verdict */
  }
  refuse(
    `Production is NOT running the code being applied against.`,
    `The live commit ${live.slice(0, 12)} does not contain ${head.slice(0, 12)}.` +
      (behindBy ? `\nProduction is missing ${behindBy} commit(s) that this tree has.` : "") +
      "\nWait for the deployment to finish, then re-run. Do not apply.",
  );
}

out(`\nOK: the live commit ${live.slice(0, 12)} contains ${head.slice(0, 12)}.`);
out("Every line being applied against is already deployed.");
process.exit(EXIT_OK);
