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

import { spawnSync } from "node:child_process";
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
// THE APPLIER REFUSES A REMOVAL, AND REFUSES IT TWICE OVER
// ===========================================================================
// Both refusals are exercised as a DRY RUN, which evaluates every gate and exits
// before the first psql call, so the fixture tree can never reach a database.
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
    RC_DEPLOY_CONFIRMED: "",
  };

  const refused = run("scripts/apply-pending-migrations.mjs", base);
  const rOut = (refused.stdout || "") + (refused.stderr || "");
  record(
    "applier refuses a removal when the deploy is not confirmed",
    refused.status === 2 && /DEPLOY cannot be verified/.test(rOut),
    `exit ${refused.status}. A removal applying without a confirmed deploy is INC-06 again.`,
  );

  const allowed = run("scripts/apply-pending-migrations.mjs", {
    ...base,
    RC_DEPLOY_CONFIRMED: "yes",
  });
  const aOut = (allowed.stdout || "") + (allowed.stderr || "");
  record(
    "  ...and allows it once the operator confirms, recorded as a statement",
    allowed.status === 0 && /deploy confirmed by the operator/.test(aOut),
    `exit ${allowed.status}. If this fails the gate can never be satisfied and no column can ever be dropped.`,
  );
  rmSync(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
