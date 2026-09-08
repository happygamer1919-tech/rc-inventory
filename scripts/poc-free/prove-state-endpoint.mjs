#!/usr/bin/env node
// prove-state-endpoint.mjs
// Card EXT-21. Proves check-state-endpoint.mjs REFUSES. A check that has never
// been seen to fail is not a check, and this one guards a PUBLIC endpoint read
// by a third party, so its passing path being reachable without the condition
// holding would be worse than having no check.
//
// EVERY REFUSING CASE IS PAIRED WITH A CONTROL THAT MUST PASS ON THE SAME
// HARNESS, built by mutating the REAL route file rather than by writing a
// fixture that looks like it. A fixture drifts from the file it stands for; a
// mutation of the shipped file cannot.
//
// No container, no database, no network, no credential.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const CHECK = join(ROOT, "scripts/poc-free/check-state-endpoint.mjs");
const ROUTE = join(ROOT, "app/api/state/route.ts");

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass && detail) console.log(`      ${detail}`);
};

const dir = mkdtempSync(join(tmpdir(), "rc-state-endpoint-"));
const REAL = readFileSync(ROUTE, "utf8");

/** Runs the check against `source`, returns { code, out }. */
function run(source) {
  const path = join(dir, "route.ts");
  writeFileSync(path, source);
  try {
    const out = execFileSync(process.execPath, [CHECK], {
      encoding: "utf8",
      env: { ...process.env, RC_STATE_ROUTE: path },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

/** A mutant refuses, and names the check that caught it. */
function refuses(name, source, marker) {
  const r = run(source);
  record(
    name,
    r.code !== 0 && r.out.includes(marker),
    `exit ${r.code}, expected non-zero mentioning ${JSON.stringify(marker)}\n${r.out}`,
  );
}

/** A control passes on the same harness. */
function passes(name, source) {
  const r = run(source);
  record(name, r.code === 0, `exit ${r.code}, expected 0\n${r.out}`);
}

// --- the control, first, so a refusal below cannot be the harness -----------
passes("CONTROL: the shipped route passes", REAL);

// --- 1. a third table -------------------------------------------------------
// The exact shape the check exists for: one more field, added in good faith,
// on an endpoint a third party reads.
refuses(
  "a third table (suppliers) is refused by name",
  REAL.replace('.from("categories")', '.from("suppliers")'),
  "CHECK 1",
);
refuses(
  "a client table added beside the two is refused",
  REAL.replace(
    '    supabase.rpc("applied_ledger_version"),',
    '    supabase.from("clients").select("name").eq("active", true),\n    supabase.rpc("applied_ledger_version"),',
  ),
  "CHECK 1",
);

// --- 2. a second rpc --------------------------------------------------------
// A function can return anything the database holds, so the rpc list is closed
// for the same reason the table list is.
refuses(
  "an rpc outside the allow-list is refused",
  REAL.replace('.rpc("applied_ledger_version")', '.rpc("owner_reminder_recipients")'),
  "CHECK 2",
);

// --- 3. a lost active filter ------------------------------------------------
// The silent one. Still 200, still well formed, and now telling Andre we accept
// a category somebody retired.
refuses(
  "a select that loses .eq(\"active\", true) is refused",
  REAL.replace('.eq("active", true)', ""),
  "CHECK 3",
);

// --- 4. a cacheable response ------------------------------------------------
refuses(
  "a response without no-store is refused",
  REAL.replace(/"cache-control":[^\n]*\n/, '"cache-control": "public, max-age=300",\n'),
  "CHECK 4",
);

// --- 5. a route that is not dynamic -----------------------------------------
refuses(
  "a route without force-dynamic is refused",
  REAL.replace('export const dynamic = "force-dynamic";', ""),
  "CHECK 5",
);

// --- 6. the fail-closed branch ----------------------------------------------
// Silence must never read as clean. A route that cannot be read is a refusal,
// and so is a route that reads no table at all.
{
  const r = (() => {
    try {
      const out = execFileSync(process.execPath, [CHECK], {
        encoding: "utf8",
        env: { ...process.env, RC_STATE_ROUTE: join(dir, "does-not-exist.ts") },
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { code: 0, out };
    } catch (e) {
      return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
    }
  })();
  record(
    "a missing route file is refused, not reported clean",
    r.code !== 0 && r.out.includes("could not be read"),
    `exit ${r.code}\n${r.out}`,
  );
}
refuses(
  "a route that selects from nothing is refused",
  REAL.replace(/\.from\("(categories|units)"\)/g, ".select"),
  "CHECK 1",
);

rmSync(dir, { recursive: true, force: true });

const passed = results.filter((r) => r.pass).length;
console.log(`\nprove-state-endpoint: ${passed} of ${results.length}`);
process.exit(passed === results.length ? 0 : 1);
