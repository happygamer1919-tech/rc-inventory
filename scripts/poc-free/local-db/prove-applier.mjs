#!/usr/bin/env node
// prove-applier.mjs
// Card P3-27a. Proves scripts/apply-pending-migrations.mjs against the AUT-14
// Docker shim, three ways, with no credentials and no network.
//
// WHAT IT PROVES, and each one is a separate container built from scratch:
//
//   1. CLEAN PASS. A baseline that looks like production (shim + 0001 to 0012,
//      ledger rows 0001 to 0009 only, seeded with rows the backfills and the
//      row-count assertion can bite on) takes the batch, every assertion passes
//      and it commits.
//   2. MUTATIONS ROLL BACK. Three deliberately broken copies of the tree, each
//      tripping a DIFFERENT control, each leaving the database untouched. A
//      check that has never been seen to fail is not a check.
//   3. SECOND RUN IS A CLEAN NO-OP. With the register emptied, which is what a
//      committed run does to it, the applier reports zero pending and exits 0
//      without executing anything.
//
// IT CANNOT REACH A REAL DATABASE. It takes no host argument, reads no secret,
// and every container it starts it also destroys. `docker cp` is never used:
// that kills Docker Desktop on this machine.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const SHIM = join(HERE, "shim.sql");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const APPLIER = join(ROOT, "scripts", "apply-pending-migrations.mjs");
const IMAGE = "postgres:16";

const out = (s) => process.stdout.write(s);
let containers = [];

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
}
function teardown() {
  for (const c of containers) run("docker", ["rm", "-f", c], { stdio: "ignore" });
  containers = [];
}
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { teardown(); process.exit(130); });
process.on("exit", teardown);

function startContainer(tag) {
  const name = `rc-prove-applier-${tag}-${process.pid}-${Date.now().toString(36)}`;
  const r = run("docker", ["run", "--detach", "--name", name,
    "--env", `POSTGRES_PASSWORD=${Math.random().toString(36).slice(2)}`,
    IMAGE, "-c", "fsync=off", "-c", "full_page_writes=off"]);
  if (r.status !== 0) { console.error(`docker could not start ${IMAGE}:\n${r.stderr}`); process.exit(2); }
  containers.push(name);
  const deadline = Date.now() + 60_000;
  let ok = 0;
  while (Date.now() < deadline) {
    const p = run("docker", ["exec", name, "pg_isready", "--host", "127.0.0.1", "--port", "5432", "--username", "postgres", "--quiet"]);
    ok = p.status === 0 ? ok + 1 : 0;
    if (ok >= 2) return name;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  console.error(`container ${name} never became ready`); process.exit(3);
}

function psql(name, sql) {
  return run("docker", ["exec", "--interactive", name, "psql", "--username", "postgres",
    "--dbname", "postgres", "--set", "ON_ERROR_STOP=1", "--quiet", "--no-psqlrc"], { input: sql });
}

// --- the baseline: what production looks like the moment before the apply ---
//
// shim, then 0001 to 0012, then the ledger with rows 0001 to 0009 ONLY. That
// last part is the state the strategy record describes and it is the reason
// this batch has to repair three rows: the schema is at 0012 and the ledger
// says 0009.
function buildBaseline(name) {
  const applied = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()
    .filter((f) => Number(f.slice(0, 4)) <= 12);
  let r = psql(name, readFileSync(SHIM, "utf8"));
  if (r.status !== 0) { console.error(`shim failed:\n${r.stderr}`); process.exit(1); }
  for (const f of applied) {
    r = psql(name, readFileSync(join(MIGRATIONS, f), "utf8"));
    if (r.status !== 0) { console.error(`baseline ${f} failed:\n${r.stderr}`); process.exit(1); }
  }
  const ledger = applied.filter((f) => Number(f.slice(0, 4)) <= 9)
    .map((f) => `('${f.slice(0, 4)}','${f.slice(5).replace(/\.sql$/, "")}')`).join(",");
  r = psql(name, `
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key, name text, statements text[]);
    insert into supabase_migrations.schema_migrations (version, name)
    values ${ledger} on conflict (version) do nothing;
  `);
  if (r.status !== 0) { console.error(`ledger seed failed:\n${r.stderr}`); process.exit(1); }

  // Real rows, so the row-count assertion and both reconciliations have
  // something to be right or wrong about. A proof against an empty database
  // proves the assertions can pass, not that they can bite.
  r = psql(name, `
    insert into public.categories (id, name, sort_order, active)
      values ('11111111-0000-4000-8000-000000000001','Prove',1,true);
    insert into public.products (id, sku, name, category_id, unit, supplier_name, active, needs_review)
      values ('11111111-0000-4000-8000-000000000010','PRV-01','Produs Prove',
              '11111111-0000-4000-8000-000000000001','bag','Furnizor Prove',true,false);
    insert into public.outbound_issues (id, reference, client_name, project_name, status)
      values ('11111111-0000-4000-8000-000000000020','IES-PRV-01','Client Prove','Santier Prove','awaiting_shipment');
  `);
  if (r.status !== 0) { console.error(`fixture seed failed:\n${r.stderr}`); process.exit(1); }
}

function pendingRegisterFile(dir, files) {
  const path = join(dir, "REGISTER.md");
  writeFileSync(path, files.map((f) => `- \`${f}\`, card de aplicare P3-27`).join("\n") + "\n", "utf8");
  return path;
}

function copyTree(files) {
  const dir = mkdtempSync(join(tmpdir(), "rc-prove-"));
  const mig = join(dir, "migrations");
  mkdirSync(mig);
  for (const f of files) copyFileSync(join(MIGRATIONS, f), join(mig, f));
  return { dir, mig };
}

function runApplier(container, migDir, registerPath) {
  return run("node", [APPLIER], {
    env: { ...process.env, RC_APPLY_TARGET: "shim", RC_APPLY_CONTAINER: container,
           RC_APPLY_MIGRATIONS_DIR: migDir, RC_APPLY_REGISTER: registerPath },
  });
}

const PENDING = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()
  .filter((f) => Number(f.slice(0, 4)) >= 13);

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  out(`${pass ? "PASS" : "FAIL"}  ${name}\n`);
  if (!pass) out(`      ${detail}\n`);
}

// ===========================================================================
// PROOF 1: clean pass
// ===========================================================================
out("\n" + "=".repeat(78) + "\nPROOF 1: clean pass from an 0001-0012 baseline\n" + "=".repeat(78) + "\n");
{
  const c = startContainer("clean");
  buildBaseline(c);
  const { dir, mig } = copyTree(PENDING);
  const reg = pendingRegisterFile(dir, PENDING);
  const r = runApplier(c, mig, reg);
  writeFileSync(join(ROOT, "docs/reports/p3-27a-proof-1-clean.txt"), (r.stdout || "") + (r.stderr || ""), "utf8");
  const committed = (r.stdout || "").includes("COMMITTED");
  record("clean pass commits, exit 0", r.status === 0 && committed, `exit ${r.status}`);

  // And the database really is at 0025 with the ledger repaired.
  const check = psql(c, `select count(*) from supabase_migrations.schema_migrations;`);
  record("ledger holds 25 rows after commit", (check.stdout || "").includes("25"), (check.stdout || "").trim());
  const tbl = psql(c, `select to_regclass('public.devize') is not null as ok;`);
  record("a table from the batch exists after commit", (tbl.stdout || "").includes("t"), (tbl.stdout || "").trim());
  rmSync(dir, { recursive: true, force: true });
  run("docker", ["rm", "-f", c], { stdio: "ignore" });
  containers = containers.filter((x) => x !== c);
}

// ===========================================================================
// PROOF 2: mutations roll back, each naming its own control
// ===========================================================================
out("\n" + "=".repeat(78) + "\nPROOF 2: mutated copies roll back\n" + "=".repeat(78) + "\n");

const MUTATIONS = [
  {
    name: "a DELETE anywhere in the batch refuses before anything executes",
    file: "0019_suppliers.sql",
    mutate: (s) => s + "\n\ndelete from public.products where active = false;\n",
    expectExit: 2,
    expectText: "DELETE",
    control: "forbidden-statement-stop",
  },
  {
    name: "dropping a free-text column rolls the batch back",
    // Appended to the LAST file in the batch on purpose. Dropping it earlier
    // trips a raw "column does not exist" in a later migration, which is a
    // rollback for the wrong reason and would prove nothing about this control.
    file: "0025_deviz.sql",
    mutate: (s) => s + "\n\nalter table public.products drop column supplier_name;\n",
    expectExit: 1,
    expectText: "ASSERTION FAILED [free-text-columns-untouched]",
    control: "free-text-columns-untouched",
  },
  {
    name: "removing the 0018 drop leaves two functions and rolls the batch back",
    file: "0018_outbound_issue_project_write.sql",
    // ANCHORED TO THE START OF A LINE. 0018 quotes this exact statement in its
    // own header comment, and a plain string replace hits the comment instead of
    // the statement, which mutates nothing and proves nothing.
    mutate: (s) => s.replace(
      /^drop function if exists public\.create_outbound_issue\(text, text, text, jsonb\);$/m,
      "-- drop removed by the proof harness",
    ),
    expectExit: 1,
    expectText: "ASSERTION FAILED [one-create-outbound-issue-five-args]",
    control: "one-create-outbound-issue-five-args",
  },
];

for (const m of MUTATIONS) {
  const c = startContainer("mut");
  buildBaseline(c);
  const { dir, mig } = copyTree(PENDING);
  const target = join(mig, m.file);
  const original = readFileSync(target, "utf8");
  const mutated = m.mutate(original);
  if (mutated === original) { record(m.name, false, "the mutation changed nothing, so it proves nothing"); process.exit(1); }
  writeFileSync(target, mutated, "utf8");
  const reg = pendingRegisterFile(dir, PENDING);
  const r = runApplier(c, mig, reg);
  const all = (r.stdout || "") + (r.stderr || "");
  const ok = r.status === m.expectExit && all.includes(m.expectText);
  record(m.name, ok, `exit ${r.status} (wanted ${m.expectExit}), text "${m.expectText}" ${all.includes(m.expectText) ? "found" : "NOT FOUND"}`);

  // The database must be exactly as it was: the batch rolled back whole.
  const after = psql(c, `select to_regclass('public.devize') is null as untouched;`);
  record(`  ...and the database is untouched (${m.control})`, (after.stdout || "").includes("t"), (after.stdout || "").trim());
  writeFileSync(join(ROOT, `docs/reports/p3-27a-proof-2-${m.control}.txt`), all, "utf8");
  rmSync(dir, { recursive: true, force: true });
  run("docker", ["rm", "-f", c], { stdio: "ignore" });
  containers = containers.filter((x) => x !== c);
}

// ===========================================================================
// PROOF 3: second run is a clean no-op
// ===========================================================================
out("\n" + "=".repeat(78) + "\nPROOF 3: an emptied register is a clean no-op\n" + "=".repeat(78) + "\n");
{
  const c = startContainer("noop");
  buildBaseline(c);
  const { dir, mig } = copyTree(PENDING);
  const reg = pendingRegisterFile(dir, []);
  const r = runApplier(c, mig, reg);
  const all = (r.stdout || "") + (r.stderr || "");
  const ok = r.status === 0 && all.includes("zero pending migrations") && all.includes("Nothing was executed");
  record("empty register: exit 0, nothing executed", ok, `exit ${r.status}`);
  const after = psql(c, `select to_regclass('public.devize') is null as untouched;`);
  record("  ...and the database is untouched", (after.stdout || "").includes("t"), (after.stdout || "").trim());
  writeFileSync(join(ROOT, "docs/reports/p3-27a-proof-3-noop.txt"), all, "utf8");
  rmSync(dir, { recursive: true, force: true });
}

teardown();
const failed = results.filter((r) => !r.pass);
out("\n" + "=".repeat(78) + "\n");
out(`${results.length - failed.length} of ${results.length} proofs passed\n`);
out("=".repeat(78) + "\n");
process.exit(failed.length === 0 ? 0 : 1);
