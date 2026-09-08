#!/usr/bin/env node
// check-action-pins.mjs
// Card CI-01. NO ACTION IN THE quality WORKFLOW FLOATS.
//
// WHAT WENT WRONG. On 2026-09-03, run 33810964883 on pull request #177 failed at
// `Start local Supabase`, before a single test ran:
//
//     ##[error]Failed to resolve latest Supabase CLI release: rate limit exceeded
//
// Re-running it passed with no change to the code, which is the signature of a
// flake rather than a defect in the branch.
//
// TWO DEFECTS IN ONE LINE, AND THE TRANSIENT ONE IS THE LESS IMPORTANT.
//
//   1. `version: latest` has to RESOLVE, and resolving costs an API call that
//      rate-limits. Six pull requests in one evening was enough on this account.
//   2. `latest` ALSO MAKES CI NON-REPRODUCIBLE. The same commit can pass today and
//      fail tomorrow because a release in between changed behaviour, and the
//      failure presents as the pull request's fault. That is not theoretical
//      here: P3-33 had to split migration 0030 from 0031 because
//      `supabase db reset` wraps each FILE in one transaction, which is exactly
//      the kind of behaviour a CLI release can change.
//
// The second is why the card is not "add a token". A token removes the rate limit
// and leaves the reproducibility half untouched, which is the larger problem.
//
// WHAT THIS REFUSES, and it reads the workflow rather than a list of what is in
// it: every `uses:` reference pinned to a tag rather than a commit sha, and every
// `version:` input set to a moving target such as `latest` or `beta`.
//
// THE ALLOW-LIST CARRIES ITS REASONS, the way EXEMPT in
// scripts/poc-free/check-pending-schema-reads.mjs does. An entry is a decision
// somebody made and can be read in a diff, not a silence.
//
// A STALE ALLOW-LIST ENTRY IS A FAILURE, not a pass. An entry naming a `uses:`
// that is no longer in the file is an exemption nobody is using, and it would sit
// there covering whatever took its place.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const WORKFLOW = process.env.RC_ACTION_PINS_WORKFLOW ?? path.join(ROOT, ".github", "workflows", "quality.yml");

// ---------------------------------------------------------------------------
// THE ALLOW-LIST. Every entry says WHY, and the reason is the point of it.
//
// THE LINE THIS DRAWS IS BETWEEN A PUBLISHER'S PROMISE AND A VERSION THAT HAS TO
// BE RESOLVED. `actions/checkout@v4` is a major tag GitHub maintains on its own
// repository and promises not to break within; it is fetched by ref and costs no
// resolution. `version: latest` is neither: nobody promises what it means
// tomorrow, and finding out costs the API call that failed on 2026-09-03.
//
// THAT IS A JUDGEMENT AND IT IS RECORDED AS ONE. Pinning these three to shas
// would be stricter and is not free: nothing in this repository updates a pinned
// sha, so each one becomes a quietly ageing dependency with no path forward and
// no signal when it matters. The card leaves the call to the executor and asks
// that it be written down if they stay floating. It is written down here.
// ---------------------------------------------------------------------------
const ALLOWED_FLOATING = {
  "actions/checkout@v4":
    "GitHub's own action, on a major tag GitHub maintains and promises not to break within. It is fetched by ref and needs no resolution, so neither of CI-01's two defects applies: no API call to rate-limit, and no version that can change under a commit that did not.",
  "actions/setup-node@v4":
    "Same publisher, same promise, same reasoning. The node version this job runs is pinned separately, in the step's own `node-version: 20`, which is the input that could actually change the suite's behaviour.",
  "actions/upload-artifact@v4":
    "Same publisher and same promise, and it runs only on failure, so it cannot affect whether a green run is green.",
};

let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => {
  console.error(`  FAIL  ${m}`);
  failures += 1;
};

let text;
try {
  text = readFileSync(WORKFLOW, "utf8");
} catch (error) {
  console.error(`check-action-pins: ${WORKFLOW} could not be read: ${String(error.message).split("\n")[0]}`);
  process.exit(2);
}

console.log("check-action-pins");
console.log(`  workflow    ${path.relative(ROOT, WORKFLOW) || WORKFLOW}`);

const SHA = /^[0-9a-f]{40}$/;
const MOVING_VERSION = /^(latest|beta|next|canary|\*)$/i;

const lines = text.split("\n");
const uses = [];
const versions = [];
for (let i = 0; i < lines.length; i += 1) {
  const u = /^\s*(?:-\s*)?uses:\s*(\S+)/.exec(lines[i]);
  if (u) uses.push({ line: i + 1, ref: u[1] });
  const v = /^\s*version:\s*(\S+)/.exec(lines[i]);
  if (v) versions.push({ line: i + 1, value: v[1].replace(/^['"]|['"]$/g, "") });
}

console.log(`  uses        ${uses.length}`);
console.log(`  version:    ${versions.length}`);

// THE COUNT ASSERTION. A regex that matched nothing would satisfy every check
// below while reading no action at all, which is the defect class
// docs/LEARNINGS.md names: a matcher whose empty result means nothing to do.
if (uses.length === 0) {
  bad("not one `uses:` was found in the workflow, so nothing below was checked");
}

for (const { line, ref } of uses) {
  const at = ref.lastIndexOf("@");
  const rev = at >= 0 ? ref.slice(at + 1) : "";
  if (SHA.test(rev)) {
    ok(`${ref.slice(0, at)} is pinned to a commit sha`);
    continue;
  }
  if (Object.prototype.hasOwnProperty.call(ALLOWED_FLOATING, ref)) {
    ok(`${ref} floats, by a recorded decision: ${ALLOWED_FLOATING[ref]}`);
    continue;
  }
  bad(
    `${WORKFLOW.split("/").pop()}:${line} uses ${ref}, which is a floating tag. ` +
      "Pin it to a commit sha, or add it to ALLOWED_FLOATING in this file WITH THE REASON, " +
      "so the decision can be read in a diff."
  );
}

// A `version:` input is a different thing from a `uses:` ref: it is resolved at
// run time by the action, and that resolution is what rate-limited.
for (const { line, value } of versions) {
  if (MOVING_VERSION.test(value)) {
    bad(
      `${WORKFLOW.split("/").pop()}:${line} sets version: ${value}, which is a moving target. ` +
        "The same commit can pass today and fail tomorrow because a release in between changed " +
        "behaviour, and resolving it costs the API call that rate-limited on 2026-09-03. " +
        "Pin an exact version."
    );
  } else {
    ok(`version: ${value} is an exact version`);
  }
}

// A STALE ALLOW-LIST ENTRY IS A FAILURE. An exemption for something that is no
// longer in the file covers whatever took its place.
const present = new Set(uses.map((u) => u.ref));
for (const ref of Object.keys(ALLOWED_FLOATING)) {
  if (!present.has(ref)) {
    bad(`ALLOWED_FLOATING names ${ref}, which the workflow no longer uses. Remove the entry.`);
  }
}
if (Object.keys(ALLOWED_FLOATING).every((r) => present.has(r))) {
  ok(`all ${Object.keys(ALLOWED_FLOATING).length} allow-list entries name an action the workflow still uses`);
}

console.log("");
if (failures === 0) {
  console.log("check-action-pins: nothing in the quality workflow floats without a written reason.");
  process.exit(0);
}
console.error(`check-action-pins: ${failures} assertion(s) failed`);
process.exit(1);
