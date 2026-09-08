#!/usr/bin/env node
// check-executor-env.mjs
// Card AUT-8. THE MODEL PROCESS DOES NOT CARRY THE CREDENTIALS IT DOES NOT NEED.
//
// WHAT IT PROVES, and it proves it by RUNNING the strip rather than by reading it:
//
//   (a) none of the credential names reaches a child spawned the way run.sh
//       spawns the executor
//   (b) PATH, HOME and the POC_ variables the run needs DO reach it
//   (c) it FAILS on a mutated strip list with one name removed, which is what
//       makes (a) worth anything
//
// HOW IT PROVES (a), AND WHY IT IS NOT A STRING COMPARISON. The strip list is
// sourced from scripts/poc/secret-names.sh, the same one file run.sh and
// responder.sh source, and turned into the same `env -u` arguments by the same
// function. Every name on it is then SET TO A DUMMY VALUE in this process, and
// `printenv` is spawned as the child instead of `claude`. What comes back is what
// the model would have carried. A check that read the list and compared it to
// another list would be two lists agreeing, which is the defect this card removes.
//
// NAMES ONLY, NEVER VALUES. CLAUDE.md section 7. The dummy values are generated
// here, are not secrets, and are still never printed: every message names a
// variable. Nothing in this file reads /Users/ivan/rc-secrets.
//
// RC_STRIP_LIST points at a different list file. It exists so a pull request can
// prove clause (c) against a mutant, and for nothing else.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const LIST = process.env.RC_STRIP_LIST ?? path.join(ROOT, "scripts", "poc", "secret-names.sh");

let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => {
  console.error(`  FAIL  ${m}`);
  failures += 1;
};

// THE NAMES THE CARD REQUIRES BY NAME. Asserted against the list as well as
// through the child, because a list that silently lost one of these would still
// produce a clean child for every name it did keep.
const REQUIRED = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_PASSWORD",
  "RESEND_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "MAKE_CALLBACK_SECRET",
  "MAKE_WEBHOOK_URL",
  "VERCEL_TOKEN",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

// The variables a run genuinely needs on the other side of the strip.
const MUST_SURVIVE = ["PATH", "HOME", "POC_RUN_WORKTREE", "POC_MAX_SECONDS", "POC_MAX_CARDS"];

if (!existsSync(LIST)) {
  console.error(`check-executor-env: the strip list is not at ${LIST}`);
  process.exit(2);
}

console.log("check-executor-env");
console.log(`  strip list  ${path.relative(ROOT, LIST) || LIST}`);

// Read the list THROUGH bash, by sourcing it and calling its own helper, so this
// check and the two scripts that strip are reading the same thing the same way.
// A regex over the file would be a second parser and could disagree with bash.
let names;
let stripArgs;
try {
  names = execFileSync("bash", ["-c", `set -u; . "${LIST}"; printf '%s' "$POC_SECRET_STRIP_NAMES"`], {
    encoding: "utf8",
  })
    .split(/\s+/)
    .filter(Boolean);
  stripArgs = execFileSync("bash", ["-c", `set -u; . "${LIST}"; poc_secret_strip_args`], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
} catch (error) {
  console.error(`check-executor-env: the strip list did not source cleanly: ${String(error.message).split("\n")[0]}`);
  process.exit(2);
}

console.log(`  names       ${names.length}`);

// THE COUNT ASSERTION. The arguments must be exactly two per name. A helper that
// emitted nothing would strip nothing and every assertion below would pass on a
// child that was never given anything to lose.
if (stripArgs.length !== names.length * 2) {
  bad(`the strip list has ${names.length} name(s) but produced ${stripArgs.length} argument(s), expected ${names.length * 2}`);
} else {
  ok(`the list yields exactly two arguments per name, ${stripArgs.length} in total`);
}

for (const required of REQUIRED) {
  if (names.includes(required)) ok(`${required} is on the strip list`);
  else bad(`${required} is NOT on the strip list, and the card names it`);
}

// ---------------------------------------------------------------------------
// The child, spawned the way run.sh spawns the executor.
// ---------------------------------------------------------------------------
const childEnv = { ...process.env };
// Every name on the list gets a dummy value, so a name that is absent from the
// child is absent because it was STRIPPED and not because it was never there.
for (const name of names) childEnv[name] = `dummy-value-for-${name}`;
for (const name of MUST_SURVIVE) childEnv[name] ??= `present-${name}`;

const child = spawnSync("env", [...stripArgs, "printenv"], { env: childEnv, encoding: "utf8" });
if (child.status !== 0 && !child.stdout) {
  console.error(`check-executor-env: could not run the child: ${child.error ? child.error.message : child.status}`);
  process.exit(2);
}

const seen = new Set(
  child.stdout
    .split("\n")
    .map((line) => line.slice(0, line.indexOf("=")))
    .filter(Boolean),
);

// A CHILD THAT SAW NOTHING PROVES NOTHING. An empty environment satisfies every
// absence assertion below while measuring no strip at all, which is the defect
// class docs/LEARNINGS.md names: a matcher whose empty result means "nothing to
// do" asserts its input count against its match count.
if (seen.size === 0) {
  bad("the child reported an EMPTY environment, so the absences below measure nothing");
} else {
  ok(`the child reported ${seen.size} variable(s), so the absences below are real`);
}

for (const name of names) {
  if (seen.has(name)) bad(`${name} REACHED the model child`);
}
if (names.every((n) => !seen.has(n))) ok(`none of the ${names.length} stripped name(s) reached the child`);

for (const name of MUST_SURVIVE) {
  if (seen.has(name)) ok(`${name} survives the strip, as the run needs`);
  else bad(`${name} did NOT survive the strip, and the run needs it`);
}

// ---------------------------------------------------------------------------
// (c) THE MUTANT. Proved here rather than described, so the check cannot be
// trusted on its own say-so: one name removed from the list must reach the child.
// ---------------------------------------------------------------------------
// PICK A NAME THAT IS ACTUALLY ON THE LIST. Dropping one that is already absent
// is a no-op, and the failure message would then blame the check instead of the
// list. Against a mutant missing SUPABASE_SERVICE_ROLE_KEY, the clause above has
// already failed for the right reason and this one must still be honest.
const dropped = names.find((n) => REQUIRED.includes(n)) ?? names[0];
const mutantArgs = [];
for (let i = 0; i < stripArgs.length; i += 2) {
  if (stripArgs[i + 1] === dropped) continue;
  mutantArgs.push(stripArgs[i], stripArgs[i + 1]);
}
const mutantChild = spawnSync("env", [...mutantArgs, "printenv"], { env: childEnv, encoding: "utf8" });
const mutantSeen = new Set(
  (mutantChild.stdout || "")
    .split("\n")
    .map((line) => line.slice(0, line.indexOf("=")))
    .filter(Boolean),
);
if (mutantSeen.has(dropped)) {
  ok(`with ${dropped} removed from the list it DOES reach the child, so the assertions above are load bearing`);
} else {
  bad(`removing ${dropped} from the list changed nothing, so this check proves nothing`);
}

// ---------------------------------------------------------------------------
// THE LIST IS ONLY WORTH ANYTHING IF THE CALL SITES USE IT. A correct strip list
// that nothing applies is a file, not a control, so both invocations are asserted
// to go through it and neither is allowed to carry a second copy.
// ---------------------------------------------------------------------------
if (!process.env.RC_STRIP_LIST) {
  const callSites = [
    ["scripts/poc/run.sh", "the scheduled EXECUTOR"],
    ["scripts/poc/responder.sh", "the conversational responder"],
  ];
  for (const [rel, what] of callSites) {
    let text;
    try {
      text = readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      bad(`${rel} could not be read, so ${what} cannot be checked`);
      continue;
    }
    if (/env "\$\{POC_STRIP_ARGS\[@\]\}"/.test(text)) {
      ok(`${what} invokes the model through the shared strip list`);
    } else {
      bad(`${rel} does not invoke the model through env "\${POC_STRIP_ARGS[@]}"`);
    }
    if (/env -u [A-Z_]+ -u /.test(text)) {
      bad(`${rel} still carries its own inline strip list, which is the second copy this card removed`);
    } else {
      ok(`${rel} carries no second copy of the list`);
    }
  }
}

console.log("");
if (failures === 0) {
  console.log("check-executor-env: the model child carries no credential it does not need.");
  process.exit(0);
}
console.error(`check-executor-env: ${failures} assertion(s) failed`);
process.exit(1);
