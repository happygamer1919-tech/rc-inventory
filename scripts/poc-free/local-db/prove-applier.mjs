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

// APPLY-01. A BOOLEAN READ OUT OF psql OUTPUT, WITHOUT READING THE HEADER.
//
// THIS EXISTS BECAUSE THE OBVIOUS VERSION WAS WRONG AND HAD BEEN PASSING
// VACUOUSLY. Four assertions in this file read a one-column boolean with
// `(out.stdout || "").includes("t")`. psql prints the COLUMN NAME above the
// value, and every one of those columns is named `untouched`, which contains a
// `t`. The test was therefore true whatever the database said, and the three
// "...and the database is untouched" assertions had never once been capable of
// failing. It surfaced only when a new case expected FALSE and got a pass.
//
// docs/LEARNINGS.md names the class: a matcher that cannot fail is not a check.
// So the value is taken from the line before `(N rows)`, and a shape that does
// not parse is a hard false rather than a shrug.
function booleanFrom(result) {
  const lines = (result.stdout || "").split("\n").map((l) => l.trim());
  const marker = lines.findIndex((l) => /^\(\d+ rows?\)$/.test(l));
  if (marker < 1) return null;
  const value = lines[marker - 1];
  if (value === "t") return true;
  if (value === "f") return false;
  return null;
}

// --- the baseline: what production looks like the moment before the apply ---
//
// shim, then 0001 to 0012, then the ledger with rows 0001 to 0009 ONLY. That
// last part is the state the strategy record describes and it is the reason
// this batch has to repair three rows: the schema is at 0012 and the ledger
// says 0009.
function buildBaseline(name, opts = {}) {
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
  `);
  if (r.status !== 0) { console.error(`fixture seed failed:\n${r.stderr}`); process.exit(1); }

  // AN OUTBOUND ISSUE WITH A DESTINATION NOTHING CAN MATCH.
  //
  // Only for the proof that asks for it. 0017's backfill matches client_name and
  // project_name against public.clients and public.projects, and on a baseline
  // built from 0001 to 0012 those tables do not exist yet and are empty when they
  // do, so a historical row like this can NEVER be matched. 0026 then refuses to
  // make project_id NOT NULL and the whole batch rolls back, which is the
  // behaviour P3-04b depends on: if production had held unreconciled rows, the
  // drop would have refused rather than destroyed the only record of where
  // materials went.
  if (opts.unmatchedIssue) {
    r = psql(name, `
      insert into public.outbound_issues (id, reference, client_name, project_name, status)
        values ('11111111-0000-4000-8000-000000000020','IES-PRV-01','Client Prove','Santier Prove','awaiting_shipment');
    `);
    if (r.status !== 0) { console.error(`unmatched issue seed failed:\n${r.stderr}`); process.exit(1); }
  }
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
  // DERIVED, NOT HARDCODED. This said 25 and broke the moment a 26th migration
  // was authored, which is a proof harness failing for a reason that has nothing
  // to do with what it proves.
  const expectedLedger = 12 + PENDING.length;
  const check = psql(c, `select count(*) as n from supabase_migrations.schema_migrations;`);
  record(
    `ledger holds ${expectedLedger} rows after commit`,
    new RegExp(`\\b${expectedLedger}\\b`).test(check.stdout || ""),
    (check.stdout || "").trim(),
  );
  const tbl = psql(c, `select to_regclass('public.devize') is not null as ok;`);
  record("a table from the batch exists after commit", booleanFrom(tbl) === true, (tbl.stdout || "").trim());
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
    name: "an UNDECLARED column drop rolls the batch back",
    // Appended to the LAST file in the batch on purpose. Dropping it earlier
    // trips a raw "column does not exist" in a later migration, which is a
    // rollback for the wrong reason and would prove nothing about this control.
    file: "0025_deviz.sql",
    // A PRE-EXISTING, DEPENDENCY-FREE COLUMN, AND BOTH WORDS MATTER.
    // PRE-EXISTING: the assertion snapshots the columns that exist BEFORE the
    // batch, so a column the batch itself creates and drops is invisible to it.
    // clients.notes was tried and committed cleanly for exactly that reason:
    // public.clients is created by 0013, inside the batch.
    // DEPENDENCY-FREE: products.needs_review was tried too and PostgreSQL refused
    // the drop first, because a policy from 0012 reads it, so the batch rolled
    // back proving the server's dependency tracking rather than this assertion.
    // inbound_orders.document_uploaded_at is from 0001 and is read only from a
    // plpgsql body, which creates no catalogue dependency.
    // AND IT IS DROPPED THROUGH DYNAMIC SQL, WHICH IS THE ONLY WAY TO MAKE THE
    // DROP UNDECLARED. A plain `alter table ... drop column` appended to a
    // migration is parsed as a DECLARED drop, so the assertion allows it and the
    // mutation tests nothing: that version committed cleanly. Inside `execute`
    // the statement is a string the grammar never sees as a drop, which is also
    // the realistic shape of the accident this assertion exists to catch.
    mutate: (s) =>
      s +
      "\n\ndo $mut$ begin execute 'alter table public.inbound_orders drop column document_uploaded_at'; end $mut$;\n",
    expectExit: 1,
    expectText: "ASSERTION FAILED [declared-column-drops-only]",
    control: "declared-column-drops-only",
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
    expectText: "ASSERTION FAILED [declared-function-versions-only]",
    control: "declared-function-versions-only",
  },
  {
    // APPLY-01. THE CASE THAT USED TO BE IMPOSSIBLE.
    //
    // The assertion this replaces pinned create_outbound_issue to the literal
    // argument list (text, text, text, jsonb, uuid), unconditionally, on every
    // future run. A migration that legitimately changed that signature, and a
    // deviz-aware outbound issue is a near reason to, would have rolled back the
    // WHOLE batch it travelled in, including every unrelated migration in it.
    //
    // This mutation is that migration. It drops the five-argument function and
    // creates a six-argument one, exactly as a real card would, and the batch
    // must COMMIT. Under the old assertion it rolled back.
    name: "APPLY-01: a batch that legitimately changes create_outbound_issue's signature COMMITS",
    file: "0018_outbound_issue_project_write.sql",
    mutate: (s) =>
      s +
      "\n\n-- Added by the proof harness: a legitimate later change of signature,\n" +
      "-- exactly the shape a deviz-aware outbound issue would take. The batch\n" +
      "-- drops the signature it declared earlier in this same file and declares a\n" +
      "-- six-argument one instead, which is what a change of signature IS.\n" +
      "create or replace function public.rc_apply01_shim()\n" +
      "returns uuid language sql as $shim$ select null::uuid $shim$;\n" +
      "drop function if exists public.create_outbound_issue(text, text, text, jsonb, uuid);\n" +
      "create function public.create_outbound_issue(\n" +
      "  p_destination text, p_note text, p_requested_by text, p_lines jsonb,\n" +
      "  p_project_id uuid, p_deviz_id uuid)\n" +
      "returns uuid language plpgsql security definer set search_path = public as $apply01$\n" +
      "begin\n" +
      "  return public.rc_apply01_shim();\n" +
      "end $apply01$;\n",
    expectExit: 0,
    expectText: "applied and committed",
    control: "apply-01-signature-change",
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

  // A REFUSAL must leave the database exactly as it was: the batch rolled back
  // whole. A mutation that is EXPECTED TO COMMIT must have done the opposite,
  // and asserting "untouched" on it would be asserting that the apply failed.
  const after = psql(c, `select to_regclass('public.devize') is null as untouched;`);
  const untouched = booleanFrom(after);
  if (m.expectExit === 0) {
    record(`  ...and the database CARRIES the batch (${m.control})`, untouched === false, (after.stdout || "").trim());
  } else {
    record(`  ...and the database is untouched (${m.control})`, untouched === true, (after.stdout || "").trim());
  }
  writeFileSync(join(ROOT, `docs/reports/p3-27a-proof-2-${m.control}.txt`), all, "utf8");
  rmSync(dir, { recursive: true, force: true });
  run("docker", ["rm", "-f", c], { stdio: "ignore" });
  containers = containers.filter((x) => x !== c);
}

// ===========================================================================
// PROOF 3: second run is a clean no-op
// ===========================================================================
out("\n" + "=".repeat(78) + "\nPROOF 2b: an unreconciled outbound issue refuses the free-text drop\n" + "=".repeat(78) + "\n");
{
  const c = startContainer("unmatched");
  buildBaseline(c, { unmatchedIssue: true });
  const { dir, mig } = copyTree(PENDING);
  const reg = pendingRegisterFile(dir, PENDING);
  const r = runApplier(c, mig, reg);
  const all = (r.stdout || "") + (r.stderr || "");
  const refused = r.status !== 0 && /contains null values/.test(all);
  record("an unmatched historical row rolls the batch back", refused, `exit ${r.status}`);
  const after = psql(c, `select to_regclass('public.devize') is null as untouched;`);
  record("  ...and the database is untouched", booleanFrom(after) === true, (after.stdout || "").trim());
  // The columns it protects are still there, which is the whole point.
  const cols = psql(c, `select count(*) as n from information_schema.columns
    where table_schema='public' and table_name='outbound_issues'
      and column_name in ('client_name','project_name');`);
  record("  ...and client_name and project_name survived", /\b2\b/.test(cols.stdout || ""), (cols.stdout || "").trim());
  writeFileSync(join(ROOT, "docs/reports/p3-27a-proof-2b-unreconciled-refuses.txt"), all, "utf8");
  rmSync(dir, { recursive: true, force: true });
  run("docker", ["rm", "-f", c], { stdio: "ignore" });
  containers = containers.filter((x) => x !== c);
}

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
  record("  ...and the database is untouched", booleanFrom(after) === true, (after.stdout || "").trim());
  writeFileSync(join(ROOT, "docs/reports/p3-27a-proof-3-noop.txt"), all, "utf8");
  rmSync(dir, { recursive: true, force: true });
}

teardown();
const failed = results.filter((r) => !r.pass);
out("\n" + "=".repeat(78) + "\n");
out(`${results.length - failed.length} of ${results.length} proofs passed\n`);
out("=".repeat(78) + "\n");
process.exit(failed.length === 0 ? 0 : 1);
