#!/usr/bin/env node
// prove-schema-direction.mjs
// Card P3-11c. Both outages, reconstructed as fixtures, each failing the guard
// that exists for its direction.
//
// A CHECK THAT HAS NEVER BEEN SEEN TO FAIL IS NOT A CHECK, and these two have
// each already failed in production rather than in a test. This file makes them
// fail on demand instead.
//
//   INC-05, the FORWARD case: code reads schema a pending migration ADDS.
//           Caught by check:pending-schema-reads.
//   INC-06, the REVERSE case: code reads schema a pending migration REMOVES.
//           Caught by check:removal-safety, which did not exist when it happened.
//
// Each fixture is a tiny tree: one migration, one register naming it, one source
// file. The checks are pointed at that tree with environment overrides and must
// exit NON-ZERO. A fixture that passes is reported as a failure of this proof,
// because a guard that does not fire on a reconstruction of the exact outage it
// was written for is not guarding anything.

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) console.log(`      ${detail}`);
}

function build(files) {
  const dir = mkdtempSync(join(tmpdir(), "rc-direction-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body, "utf8");
  }
  return dir;
}

function run(script, env) {
  return spawnSync("node", [join(ROOT, script)], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

// ===========================================================================
// INC-05, THE FORWARD CASE
// ===========================================================================
// A migration ADDS products.supplier_id and is PENDING. Merged code already
// selects it. On production the column does not exist yet, so every read is
// 42703 and every screen answering with it is a 500. That is what happened.
{
  const dir = build({
    "migrations/0019_suppliers.sql":
      "begin;\nalter table public.products add column supplier_id uuid null;\ncommit;\n",
    "REGISTER.md": "- `0019_suppliers.sql`, card de aplicare P3-27\n",
    "src/lib/data/products.ts":
      'import { createClient } from "@/lib/supabase/server";\n' +
      "export async function listProducts() {\n" +
      "  const supabase = await createClient();\n" +
      '  return supabase.from("products").select("id, sku, supplier_id, needs_review");\n' +
      "}\n",
  });
  const r = run("scripts/poc-free/check-pending-schema-reads.mjs", {
    RC_PENDING_REGISTER: join(dir, "REGISTER.md"),
    RC_PENDING_MIGRATIONS: join(dir, "migrations"),
    RC_PENDING_SOURCE: join(dir, "src"),
  });
  const out = (r.stdout || "") + (r.stderr || "");
  record(
    "INC-05 forward: merged code reading schema a pending migration ADDS is refused",
    r.status !== 0 && /supplier_id/.test(out),
    `exit ${r.status}. If this passed, the additive guard stopped guarding.\n${out.slice(0, 400)}`,
  );
  rmSync(dir, { recursive: true, force: true });
}

// ===========================================================================
// INC-06, THE REVERSE CASE
// ===========================================================================
// A migration REMOVES products.supplier_name and is PENDING. Deployed code still
// selects it. Applying now takes the column away underneath the running site.
//
// THE READER IS PLACED IN A FILE NAMED FOR EXTRACTION ON PURPOSE. During P3-05b a
// search for the column name with `grep -v extraction` skipped exactly this shape
// and the reader shipped. If this fixture ever passes, the enumeration has gone
// back to filtering by file name instead of finding the table.
{
  const dir = build({
    "migrations/0027_drop_products_supplier_name.sql":
      "begin;\nalter table public.products drop column supplier_name;\ncommit;\n",
    "REGISTER.md": "- `0027_drop_products_supplier_name.sql`, card de aplicare P3-05b\n",
    "src/lib/data/extraction-actions.ts":
      'import { createClient } from "@/lib/supabase/server";\n' +
      "export async function confirmDraft(name, supplierName) {\n" +
      "  const supabase = await createClient();\n" +
      '  return supabase.from("products").insert({ name, supplier_name: supplierName });\n' +
      "}\n",
  });
  const r = run("scripts/poc-free/check-removal-safety.mjs", {
    RC_REMOVAL_REGISTER: join(dir, "REGISTER.md"),
    RC_REMOVAL_MIGRATIONS: join(dir, "migrations"),
    RC_REMOVAL_SOURCE: join(dir, "src"),
  });
  const out = (r.stdout || "") + (r.stderr || "");
  record(
    "INC-06 reverse: code still reading schema a pending migration REMOVES is refused",
    r.status !== 0 && /supplier_name/.test(out),
    `exit ${r.status}. If this passed, the removal guard stopped guarding.\n${out.slice(0, 400)}`,
  );
  record(
    "  ...and it found the reader in a file named for something else",
    /extraction-actions/.test(out),
    "the reader was not named in the output, so the enumeration is filtering by file name again",
  );
  rmSync(dir, { recursive: true, force: true });
}

// ===========================================================================
// THE CLEAN CASE
// ===========================================================================
// The same removal, with no reader left. This must PASS, or the guard refuses
// every removal forever and nobody can ever drop a column.
{
  const dir = build({
    "migrations/0027_drop_products_supplier_name.sql":
      "begin;\nalter table public.products drop column supplier_name;\ncommit;\n",
    "REGISTER.md": "- `0027_drop_products_supplier_name.sql`, card de aplicare P3-05b\n",
    "src/lib/data/products.ts":
      'import { createClient } from "@/lib/supabase/server";\n' +
      "export async function listProducts() {\n" +
      "  const supabase = await createClient();\n" +
      '  return supabase.from("products").select("id, sku, supplier_id, suppliers(name)");\n' +
      "}\n",
  });
  const r = run("scripts/poc-free/check-removal-safety.mjs", {
    RC_REMOVAL_REGISTER: join(dir, "REGISTER.md"),
    RC_REMOVAL_MIGRATIONS: join(dir, "migrations"),
    RC_REMOVAL_SOURCE: join(dir, "src"),
  });
  record(
    "clean: a removal with no reader left is allowed",
    r.status === 0,
    `exit ${r.status}, so the guard would block every drop forever.\n${((r.stdout || "") + (r.stderr || "")).slice(0, 400)}`,
  );
  rmSync(dir, { recursive: true, force: true });
}

// ===========================================================================
// THE APPLIER REFUSES A REMOVAL UNTIL PRODUCTION SAYS IT IS RUNNING THE CODE
// ===========================================================================
//
// REWRITTEN BY P3-11e. This block used to assert RC_DEPLOY_CONFIRMED: the
// applier refused a removal until the OPERATOR STATED that the deploy had
// landed, and accepted it the moment they did. That statement is exactly the
// guess that produced INC-06, and it is gone.
//
// What is asserted now is the wiring: the applier runs
// check-deployed-commit.mjs, refuses when it refuses, and proceeds when it
// passes. The check's own eleven refusals are proved separately by
// scripts/poc-free/prove-deployed-commit.mjs; this block is about the applier
// being connected to it at all.
//
// Both cases are DRY RUNS, which evaluate every gate and exit before the first
// psql call, so the fixture tree can never reach a database.
{
  const dir = build({
    "mig/0027_drop_products_supplier_name.sql":
      "begin;\nalter table public.products drop column supplier_name;\ncommit;\n",
    "REG.md": "- `0027_drop_products_supplier_name.sql`, card de aplicare P3-05b\n",
  });
  const base = {
    RC_APPLY_TARGET: "production",
    RC_APPLY_DRY_RUN: "yes",
    RC_APPLY_MIGRATIONS_DIR: join(dir, "mig"),
    RC_APPLY_REGISTER: join(dir, "REG.md"),
  };

  // --- 1. THE HEALTH ROUTE IS UNREACHABLE ----------------------------------
  // Port 1 is never listening. No server is needed to prove a refusal, and not
  // needing one is worth having: this case cannot pass because a fixture failed
  // to start.
  const refused = run("scripts/apply-pending-migrations.mjs", {
    ...base,
    RC_HEALTH_ORIGIN: "http://127.0.0.1:1",
  });
  const rOut = (refused.stdout || "") + (refused.stderr || "");
  record(
    "applier refuses a removal when production cannot be asked what it is running",
    refused.status === 2 && /the DEPLOY is not proven/.test(rOut),
    `exit ${refused.status}. A removal applying without a proven deploy is INC-06 again.\n${rOut.slice(-500)}`,
  );

  // --- 2. RC_DEPLOY_CONFIRMED IS DEAD AND DOES NOT REVIVE IT ---------------
  // The old escape hatch, set exactly as the old instructions said. It must
  // change nothing: a statement that still works beside a machine check is the
  // one that gets used at three in the morning.
  const stated = run("scripts/apply-pending-migrations.mjs", {
    ...base,
    RC_HEALTH_ORIGIN: "http://127.0.0.1:1",
    RC_DEPLOY_CONFIRMED: "yes",
  });
  const sOut = (stated.stdout || "") + (stated.stderr || "");
  record(
    "  ...and RC_DEPLOY_CONFIRMED=yes no longer buys past that refusal",
    stated.status === 2 && /the DEPLOY is not proven/.test(sOut),
    `exit ${stated.status}. The operator statement is supposed to be dead.\n${sOut.slice(-500)}`,
  );

  // --- 3. IT PROCEEDS WHEN PRODUCTION REPORTS A COMMIT CONTAINING THIS TREE -
  //
  // WITHOUT THIS CONTROL THE TWO REFUSALS ABOVE PROVE NOTHING: an applier that
  // refused every removal unconditionally would satisfy both, and no column
  // could ever be dropped again.
  //
  // The fake route runs in ANOTHER PROCESS. run() is spawnSync and blocks the
  // event loop, so a server in this process could never answer, and the control
  // would fail while looking like a refusal that fired correctly.
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" })
    .stdout.trim();
  const fake = spawn("node", [join(HERE, "fake-health-server.mjs"), "--commit", head, "--ledger", "0028"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const origin = await new Promise((resolveOrigin, rejectOrigin) => {
    const timer = setTimeout(() => rejectOrigin(new Error("the fake health route did not start")), 10000);
    let buf = "";
    fake.stdout.on("data", (d) => {
      buf += d;
      const line = buf.split("\n")[0].trim();
      if (line.startsWith("http://")) {
        clearTimeout(timer);
        resolveOrigin(line);
      }
    });
  }).catch((e) => {
    record("  ...and proceeds once production reports a commit containing this tree", false, e.message);
    return null;
  });

  if (origin) {
    const allowed = run("scripts/apply-pending-migrations.mjs", { ...base, RC_HEALTH_ORIGIN: origin });
    const aOut = (allowed.stdout || "") + (allowed.stderr || "");
    record(
      "  ...and proceeds once production reports a commit containing this tree",
      allowed.status === 0 && /\nOK: production is running exactly the commit|already deployed/.test(aOut),
      `exit ${allowed.status}. If this fails the gate can never be satisfied and no column can ever be dropped.\n${aOut.slice(-600)}`,
    );
    fake.kill();
  }

  rmSync(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
