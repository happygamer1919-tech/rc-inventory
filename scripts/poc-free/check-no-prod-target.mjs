#!/usr/bin/env node
// check-no-prod-target.mjs - static half of CRIT-15.
//
// The runtime half is a CI step that runs the guard with a production ref
// deliberately in the environment and asserts it REFUSES. That proves the guard
// still stops an illegitimate run.
//
// This half proves the workflow is not pointed at production in the first
// place. Both are required, and a future edit has to defeat both: one to make
// CI target production, and another to stop the guard noticing.
//
// It needs no credential and no connection, which is why it can run on every
// push. It reads workflow files as text and never resolves a secret.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTION_REFS } from "../production-refs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const WORKFLOW_DIR = join(ROOT, ".github/workflows");

const failures = [];
const fail = (m) => failures.push(m);

// --- 1. the blocklist is not empty ------------------------------------------
// Same reasoning as inside the guard: a list that is empty allows everything
// while reading as protection. Checked here too, because this script's other
// checks are meaningless without it.
if (Array.isArray(PRODUCTION_REFS) && PRODUCTION_REFS.length > 0) {
  console.log(`CHECK 1 blocklist: OK, ${PRODUCTION_REFS.length} production ref(s) listed`);
} else {
  fail("CHECK 1 blocklist: scripts/production-refs.mjs is empty. A guard whose list is empty allows everything while reading as protection.");
}

const files = readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
if (files.length === 0) fail("CHECK 1b: no workflow files found, so nothing was checked");

// --- 2. no workflow mentions a production ref -------------------------------
for (const f of files) {
  const text = readFileSync(join(WORKFLOW_DIR, f), "utf8");
  for (const ref of PRODUCTION_REFS) {
    // The deliberate-refusal step is ALLOWED to name the ref: proving the guard
    // refuses requires handing it something to refuse. It is recognised by the
    // marker below, and only on lines that also invoke the guard.
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (!line.includes(ref)) return;
      const isRefusalProof =
        line.includes("assert-not-prod") || line.includes("CRIT-15-REFUSAL-PROOF");
      if (!isRefusalProof) {
        fail(`CHECK 2 no production target: ${f}:${i + 1} names the production ref outside the deliberate refusal proof`);
      }
    });
  }
}
if (!failures.some((m) => m.startsWith("CHECK 2"))) {
  console.log("CHECK 2 no production target: OK, no workflow points a Supabase URL at a production ref");
}

// --- 3. no workflow reads a Supabase or database secret ---------------------
// The repository has no secrets today. This is what notices when one is added
// and wired into the suite's environment.
const SENSITIVE = /secrets\.[A-Za-z0-9_]*(SUPABASE|DATABASE|DB_|POSTGRES|SERVICE_ROLE|ANON_KEY)[A-Za-z0-9_]*/i;
for (const f of files) {
  const lines = readFileSync(join(WORKFLOW_DIR, f), "utf8").split("\n");
  lines.forEach((line, i) => {
    const m = SENSITIVE.exec(line);
    if (m) {
      fail(`CHECK 3 no database secret: ${f}:${i + 1} reads ${m[0]}. A database credential on the runner is how the suite reaches a project it should not.`);
    }
  });
}
if (!failures.some((m) => m.startsWith("CHECK 3"))) {
  console.log("CHECK 3 no database secret: OK, no workflow reads a Supabase or database secret");
}

// --- 4. the guard is still wired into the suite -----------------------------
// The guard only protects the suite while globalSetup points at it. Deleting
// that one line would disable it everywhere and break nothing visibly.
const config = readFileSync(join(ROOT, "playwright.config.ts"), "utf8");
const setup = readFileSync(join(ROOT, "tests/e2e/global-setup.ts"), "utf8");
if (/globalSetup:\s*["'`]\.\/tests\/e2e\/global-setup\.ts["'`]/.test(config)) {
  console.log("CHECK 4 guard wired: OK, playwright.config.ts still declares globalSetup");
} else {
  fail("CHECK 4 guard wired: playwright.config.ts no longer declares globalSetup pointing at tests/e2e/global-setup.ts, so the guard runs for no spec");
}
if (setup.includes("scripts/assert-not-prod.mjs") && /run\.status\s*!==\s*0/.test(setup)) {
  console.log("CHECK 5 guard enforced: OK, global-setup runs the guard and throws on a non-zero exit");
} else {
  fail("CHECK 5 guard enforced: tests/e2e/global-setup.ts no longer runs the guard, or no longer throws on a non-zero exit");
}

console.log("");
if (failures.length > 0) {
  console.error(`check-no-prod-target: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("check-no-prod-target: 5 checks passed. Nothing in CI points at production and the guard is still wired.");
process.exit(0);
