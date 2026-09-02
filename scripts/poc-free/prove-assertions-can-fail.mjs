#!/usr/bin/env node
// prove-assertions-can-fail.mjs
// Card PROVE-01. EVERY ASSERTION IN THE APPLIER, PROVED TO BE ABLE TO FAIL.
//
// WHY THIS EXISTS, AND IT IS NOT A HYPOTHETICAL.
//
// The applier is the only lawful route from a merged migration file to the
// production database, and its assertions are what stand between a bad batch and
// that database. Three defects of the same class were found in and around it on
// 2026-09-02:
//
//   1. Three assertions in prove-applier.mjs read a psql boolean with
//      `includes("t")` against a column named `untouched`. They matched the
//      COLUMN NAME and had reported passing since they were written.
//   2. outbound-destination-backfill and supplier-backfill sat in the assertion
//      list with a body whose only statement is `raise notice`. They have no
//      `raise exception` on any path, so they COULD NOT FAIL, and they were
//      counted in "N assertions passed" and in the row written to
//      docs/PRODUCTION-WRITES.md.
//   3. The one before those was a hardcoded signature that could only ever fail
//      for the wrong reason.
//
// An assertion nobody has watched fail is an assertion nobody has tested. This
// file watches every one of them fail.
//
// HOW, AND WHY IT IS ONE CONTAINER AND NOT ELEVEN.
//
// The assertion BODIES are read from the applier itself through its documented
// RC_APPLY_PRINT_ASSERTIONS mode, so what is proved is the SHIPPED text and not
// a copy that can drift. One postgres container is brought to the state the
// applier leaves behind: shim, every migration, ledger complete. Then, per
// assertion:
//
//   CONTROL      run the body on the correct database. It must NOT raise.
//   PERTURBATION open a transaction, break exactly the thing the assertion is
//                about, run the body. It MUST raise. Roll back.
//
// Both halves are required. A body that raises on everything would pass the
// perturbation and fail the control; a body that raises on nothing passes the
// control and fails the perturbation. Only an assertion that does both is doing
// its job.
//
// NO NETWORK BEYOND DOCKER, no credentials, no production, no secret read.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const SHIM = join(HERE, "local-db/shim.sql");
const IMAGE = "postgres:16";

let failures = 0;
const pass = (m) => console.log("  ok    " + m);
const fail = (m, d) => {
  console.log("  FAIL  " + m);
  if (d) console.log("        " + String(d).split("\n").slice(0, 5).join("\n        "));
  failures += 1;
};

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

const NAME = `rc-prove-assertions-${process.pid}`;
let started = false;
function teardown() {
  if (started) run("docker", ["rm", "-f", NAME], { stdio: "ignore" });
  started = false;
}
process.on("exit", teardown);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { teardown(); process.exit(130); });

function psql(sql) {
  return run("docker", ["exec", "--interactive", NAME, "psql", "--username", "postgres",
    "--dbname", "postgres", "--set", "ON_ERROR_STOP=1", "--quiet", "--no-psqlrc"], { input: sql });
}

// --- the container, at the state the applier leaves behind -------------------
console.log("prove-assertions-can-fail: every applier assertion, control and perturbation\n");
{
  const r = run("docker", ["run", "-d", "--name", NAME, "-e", "POSTGRES_PASSWORD=postgres", IMAGE]);
  if (r.status !== 0) {
    console.error(`docker could not start ${IMAGE}:\n${r.stderr}`);
    process.exit(2);
  }
  started = true;
}
for (let i = 0; i < 60; i += 1) {
  if (run("docker", ["exec", NAME, "pg_isready", "-U", "postgres"]).status === 0) break;
  execFileSync("sleep", ["1"]);
}

for (const file of [SHIM, ...readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort().map((f) => join(MIGRATIONS, f))]) {
  const r = psql(readFileSync(file, "utf8"));
  if (r.status !== 0) {
    console.error(`baseline failed at ${file}:\n${(r.stderr || "").slice(-800)}`);
    process.exit(1);
  }
}
// The ledger the applier writes. Every version, so every-pending-applied and the
// gap check have something correct to hold against.
const versions = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
psql(
  "create schema if not exists supabase_migrations;\n" +
    "create table if not exists supabase_migrations.schema_migrations (version text primary key, name text);\n" +
    versions
      .map((f) => `insert into supabase_migrations.schema_migrations (version, name) values ('${f.slice(0, 4)}', '${f.slice(5).replace(/\.sql$/, "")}') on conflict do nothing;`)
      .join("\n"),
);

// --- the shipped assertion bodies -------------------------------------------
//
// POINTED AT THE FULL WAVE-1 BATCH, NOT AT WHATEVER HAPPENS TO BE PENDING TODAY.
//
// The assertions are DERIVED from the batch: promised-tables-exist is about the
// tables THIS batch creates, declared-column-drops-only about the columns THIS
// batch declares dropped. Read against today's register, which holds one
// migration, almost every promised set is empty and almost every assertion is
// vacuously true. The proof would then have watched eleven assertions hold and
// none of them bite, which is the exact shape this card exists to remove.
//
// So the register handed to the print mode is the same one prove-applier.mjs
// builds: every migration from 0013 up, which is the batch these assertions were
// written for.
const BATCH = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()
  .filter((f) => Number(f.slice(0, 4)) >= 13);
const regDir = mkdtempSync(join(tmpdir(), "rc-prove-assert-"));
const REGISTER = join(regDir, "REGISTER.md");
writeFileSync(REGISTER, BATCH.map((f) => `- \`${f}\`, card de aplicare P3-27`).join("\n") + "\n", "utf8");

const printed = run("node", [join(ROOT, "scripts/apply-pending-migrations.mjs")], {
  env: {
    ...process.env,
    RC_APPLY_PRINT_ASSERTIONS: "yes",
    RC_APPLY_TARGET: "shim",
    RC_APPLY_REGISTER: REGISTER,
    RC_APPLY_MIGRATIONS_DIR: MIGRATIONS,
  },
});
let payload;
try {
  payload = JSON.parse((printed.stdout || "").slice((printed.stdout || "").indexOf("{")));
} catch {
  console.error("could not read the assertion bodies from the applier:\n" + (printed.stderr || "").slice(-600));
  process.exit(2);
}
const { assertions, notices } = payload;

// zero-rows-deleted reads rc_rowcounts_before, which the applier creates inside
// its own transaction. The perturbation harness creates it the same way, so the
// body under test is unmodified.
const COLUMNS = `create temporary table if not exists rc_columns_before (tbl text, col text);
  insert into rc_columns_before
    select table_name, column_name from information_schema.columns where table_schema = 'public';`;

const ROWCOUNTS = `create temporary table if not exists rc_rowcounts_before as
  select c.relname::text as tbl,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint as n
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r';`;

// --- the perturbations -------------------------------------------------------
//
// One per assertion, each breaking EXACTLY the thing that assertion is about and
// nothing else. Written by hand, because a generated perturbation would be a
// second implementation of the assertion and would agree with it by construction.
const PERTURB = {
  "every-pending-applied":
    "delete from supabase_migrations.schema_migrations where version = '0025';",
  "ledger-no-gaps-ends-at-highest":
    "delete from supabase_migrations.schema_migrations where version = '0007';",
  "ledger-0010-0011-0012-present":
    "delete from supabase_migrations.schema_migrations where version = '0011';",
  "promised-tables-exist": "drop table public.devize cascade;",
  "promised-columns-exist": "alter table public.products drop column supplier_id cascade;",
  "promised-functions-exist": "drop function public.find_supplier_by_folded_name(text);",
  // The batch declares this function dropped. Bringing it back is the failure.
  "declared-function-drops-happened":
    "create function public.backfill_product_suppliers(x integer) returns integer language sql as $p$ select x $p$;",
  // A column gone that no pending migration declared dropping.
  "declared-column-drops-only": "alter table public.clients drop column notes;",
  "zero-rows-deleted":
    "delete from public.categories where id = (select id from public.categories order by sort_order limit 1);",
  // A signature the batch declared, removed.
  "declared-function-signatures-exist":
    "drop function public.create_outbound_issue(text, text, text, jsonb, uuid);",
  // A second overload of a name the batch created.
  "declared-function-versions-only":
    "create function public.create_outbound_issue(a text) returns uuid language sql as $p$ select null::uuid $p$;",
};

// The applier creates two temporary tables in its pre-check, INSIDE the
// transaction, and two assertions read them. They are created here the same way
// and BEFORE the perturbation, because both are snapshots of the state the batch
// started from: taking them afterwards would snapshot the damage and the
// assertion would compare the broken database against itself.
function runBody(body, before = "") {
  const needs = [];
  if (body.includes("rc_rowcounts_before")) needs.push(ROWCOUNTS);
  if (body.includes("rc_columns_before")) needs.push(COLUMNS);
  const sql =
    "begin;\n" +
    needs.join("\n") + "\n" +
    before +
    "\ndo $rc$ " + body + " $rc$;\nrollback;\n";
  return psql(sql);
}

console.log(`  ${assertions.length} assertion(s) read from the applier, ${notices.length} notice(s)\n`);

// EVERY ASSERTION HAS A PERTURBATION, AND A MISSING ONE IS A FAILURE, NOT A SKIP.
// A proof that quietly skipped an assertion it had no case for would report the
// same "all passed" as one that covered them all. That is the defect class this
// card exists to remove, and it is available here too.
for (const a of assertions) {
  if (!(a.name in PERTURB)) {
    fail(`${a.name}: NO PERTURBATION IS WRITTEN FOR IT, so nothing proves it can fail`);
    continue;
  }
}

for (const a of assertions) {
  const perturbation = PERTURB[a.name];
  if (!perturbation) continue;

  // CONTROL: it must hold on a correct database.
  const control = runBody(a.body);
  if (control.status === 0) pass(`${a.name}: holds on a correct database`);
  else fail(`${a.name}: raised on a CORRECT database, so it is not a guard, it is a wall`,
    (control.stderr || "").slice(-400));

  // PERTURBATION: it must raise.
  const broken = runBody(a.body, perturbation);
  const raised = broken.status !== 0 && /ASSERTION FAILED \[/.test((broken.stderr || "") + (broken.stdout || ""));
  if (raised) pass(`  ...and RAISES when the thing it is about is broken`);
  else fail(`  ...and did NOT raise when broken, so it can never fail`,
    `exit ${broken.status}\n${((broken.stderr || "") + (broken.stdout || "")).slice(-400)}`);
}

// --- the notices, asserted to be notices ------------------------------------
//
// They are kept and they are useful. What must stay true is that they are NOT
// counted as guards, and the way to keep that true is to assert the property
// that makes them notices: no `raise exception` on any path.
console.log("");
for (const n of notices) {
  if (!/raise\s+exception/i.test(n.body)) {
    pass(`${n.name} is a notice: it carries no raise exception, and is not counted as an assertion`);
  } else {
    fail(`${n.name} carries a raise exception, so it is an assertion and belongs in the assertion list with a perturbation`);
  }
}

// And the inverse, on every assertion: one that cannot raise is not an assertion.
for (const a of assertions) {
  if (/raise\s+exception/i.test(a.body)) continue;
  fail(`${a.name} carries NO raise exception, so it cannot fail and must not be counted as an assertion`);
}

teardown();
console.log("");
if (failures > 0) {
  console.error(`prove-assertions-can-fail: ${failures} case(s) failed.`);
  process.exit(1);
}
console.log(
  `prove-assertions-can-fail: ${assertions.length} assertion(s), each holds on a correct database and raises when broken.`,
);
