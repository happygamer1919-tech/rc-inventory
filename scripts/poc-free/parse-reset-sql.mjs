#!/usr/bin/env node
// parse-reset-sql.mjs - proves scripts/reset-test-data.sql is what the card says
// it is, WITHOUT a database.
//
// WHY THIS EXISTS. P2-15 authored nine DELETE statements against the client's
// production project and handed them to the owner to run. They were written
// against the committed schema and reviewed by eye, and the card said so in
// as many words: "THE SCRIPT IS AUTHORED BUT UNPARSED. There is no PostgreSQL
// binary and no running Docker on this machine, so no parser has seen this
// SQL." A file nobody has parsed, aimed at production, is a file whose first
// syntax check happens in the Supabase SQL editor with the owner watching.
//
// This script closes that. pgsql-parser is the real PostgreSQL grammar
// compiled to WebAssembly, so a parse here is the same parse the server does.
// It needs no connection, no credentials and no Docker, which is exactly why
// it can run in CI on every push.
//
// WHAT IT ASSERTS, and one honest deviation from how the check was requested.
//
// The request was "statement count is 9, every statement is a DELETE". The
// file parses to more than that, and that is correct rather than a
// defect: it opens a transaction, builds four temporary tables that freeze the
// target set, prints a pre-check, runs the nine deletes, prints two
// post-checks, and commits. Asserting "every statement is a DELETE" would fail
// on a correct file, and the only ways to make it pass would be to weaken the
// assertion or to gut the file of the transaction and the checks that make it
// safe to run.
//
// So the assertion is the one that carries the intent: EVERY STATEMENT THAT
// CAN MUTATE DATA IS A DELETE, there are exactly ELEVEN of them since the
// extraction drafts were added under R-033, and every other statement is from a
// short allowed list of things that cannot change a row.
// An INSERT or an UPDATE appearing in this file would fail check 3 as loudly
// as a TRUNCATE fails check 4.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModule, parseSync } from "pgsql-parser";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(HERE, "../reset-test-data.sql");

/** The nine tables P2-15 is allowed to delete from, and no others. */
const ALLOWED_DELETE_TARGETS = new Set([
  "public.status_history",
  // Added 2026-08-27 under ruling R-033. The extraction lane creates rows in
  // both of these on every acceptance run and nothing cleaned them, so the
  // review panel on production would have opened with a list of TEST-
  // documents waiting for Mihai to verify.
  "public.extraction_draft_lines",
  "public.extraction_drafts",
  "public.batches",
  "public.outbound_lines",
  "public.order_lines",
  "public.outbound_issues",
  "public.inbound_orders",
  "public.reminders",
  "public.products",
  "public.categories",
]);

/**
 * Statement kinds allowed in this file.
 *
 * DeleteStmt is the only one that can change a row. The other three are the
 * transaction that makes the whole file atomic, the temporary tables that
 * freeze the target set before the first delete, and the read-only pre-check
 * and post-check grids the owner reads before letting it commit.
 */
const ALLOWED_KINDS = new Set([
  "TransactionStmt",
  "CreateTableAsStmt",
  "SelectStmt",
  "DeleteStmt",
]);

/** Anything here is an instant failure, by name, however it got in. */
const FORBIDDEN_KINDS = new Set([
  "TruncateStmt",
  "DropStmt",
  "DropdbStmt",
  "DropRoleStmt",
  "DropTableSpaceStmt",
  "InsertStmt",
  "UpdateStmt",
  "AlterTableStmt",
  "GrantStmt",
  "CreateRoleStmt",
]);

// Eleven since 2026-08-27, was nine. The two new ones are the extraction
// drafts and their lines. This constant is deliberately a literal rather than
// a lower bound: a delete appearing in this file that nobody expected is the
// thing this check exists to notice, and "at least nine" would not notice it.
const EXPECTED_DELETE_COUNT = 11;

const failures = [];
const fail = (msg) => failures.push(msg);

function qualified(relation) {
  const schema = relation?.schemaname ?? "public";
  const name = relation?.relname ?? "<unknown>";
  return `${schema}.${name}`;
}

let parsed;
try {
  await loadModule();
  parsed = parseSync(readFileSync(TARGET, "utf8"));
} catch (error) {
  // Check 1 is fatal on its own: nothing below can run against a file the
  // grammar rejected, and the card wants the failure quoted verbatim.
  console.error("CHECK 1 parse: FAIL");
  console.error(String(error instanceof Error ? error.stack ?? error.message : error));
  process.exit(1);
}

const statements = Array.isArray(parsed?.stmts) ? parsed.stmts : [];
const kinds = statements.map((s) => Object.keys(s.stmt ?? {})[0] ?? "<empty>");
console.log(`CHECK 1 parse: OK, ${statements.length} statements, PostgreSQL grammar ${parsed.version}`);

// --- 2. exactly eleven deletes ----------------------------------------------
const deletes = statements
  .map((s) => s.stmt?.DeleteStmt)
  .filter((d) => d !== undefined);

if (deletes.length === EXPECTED_DELETE_COUNT) {
  console.log(`CHECK 2 delete count: OK, ${deletes.length}`);
} else {
  fail(`CHECK 2 delete count: expected ${EXPECTED_DELETE_COUNT}, found ${deletes.length}`);
}

// --- 3. every mutating statement is a delete, and nothing else is unexpected -
const unexpected = kinds.filter((k) => !ALLOWED_KINDS.has(k));
if (unexpected.length === 0) {
  console.log(`CHECK 3 mutations: OK, the only data-changing statement kind is DeleteStmt`);
} else {
  fail(`CHECK 3 mutations: statement kinds outside the allowed set: ${[...new Set(unexpected)].join(", ")}`);
}

// --- 4. no TRUNCATE and no DROP, by name ------------------------------------
const forbidden = kinds.filter((k) => FORBIDDEN_KINDS.has(k));
if (forbidden.length === 0) {
  console.log("CHECK 4 forbidden kinds: OK, no TRUNCATE, no DROP, no INSERT, no UPDATE, no ALTER, no GRANT");
} else {
  fail(`CHECK 4 forbidden kinds: found ${[...new Set(forbidden)].join(", ")}`);
}

// --- 5. every delete carries a WHERE clause ---------------------------------
// A DELETE without one empties the table. This is the single check that would
// have caught the worst possible edit to this file.
const unguarded = deletes
  .map((d, i) => ({ i, target: qualified(d.relation), where: d.whereClause }))
  .filter((d) => d.where === undefined || d.where === null);

if (unguarded.length === 0) {
  console.log(`CHECK 5 where clauses: OK, all ${deletes.length} deletes are guarded`);
} else {
  for (const u of unguarded) {
    fail(`CHECK 5 where clauses: delete ${u.i + 1} on ${u.target} has NO WHERE CLAUSE and would empty the table`);
  }
}

// --- 6. no table outside the expected set is targeted ------------------------
const targets = deletes.map((d) => qualified(d.relation));
const strays = targets.filter((t) => !ALLOWED_DELETE_TARGETS.has(t));
if (strays.length === 0) {
  console.log(`CHECK 6 delete targets: OK, ${new Set(targets).size} distinct tables, all inside the expected set`);
} else {
  fail(`CHECK 6 delete targets: outside the expected set: ${[...new Set(strays)].join(", ")}`);
}

// --- 7. nothing permanent is created ----------------------------------------
// The four working tables must be TEMPORARY. A permanent one would survive the
// run and sit in the client's schema forever.
const created = statements
  .map((s) => s.stmt?.CreateTableAsStmt)
  .filter((c) => c !== undefined)
  .map((c) => ({
    name: qualified(c.into?.rel),
    persistence: c.into?.rel?.relpersistence ?? "?",
  }));
const permanent = created.filter((c) => c.persistence !== "t");
if (permanent.length === 0) {
  console.log(`CHECK 7 created tables: OK, ${created.length} created, all TEMPORARY`);
} else {
  fail(`CHECK 7 created tables: not temporary: ${permanent.map((p) => `${p.name} (relpersistence ${p.persistence})`).join(", ")}`);
}

// --- 8. the deletes cannot run outside a transaction ------------------------
// One BEGIN, first. One COMMIT, last. Without both, a partial run is possible,
// and a partial run of this file is a half-cleaned production database.
const firstKind = kinds[0];
const lastKind = kinds[kinds.length - 1];
const txKinds = statements
  .map((s) => s.stmt?.TransactionStmt)
  .filter((t) => t !== undefined)
  .map((t) => t.kind);
const opensAndCloses =
  firstKind === "TransactionStmt" &&
  lastKind === "TransactionStmt" &&
  txKinds.length === 2 &&
  txKinds[0] === "TRANS_STMT_BEGIN" &&
  txKinds[1] === "TRANS_STMT_COMMIT";

if (opensAndCloses) {
  console.log("CHECK 8 atomicity: OK, one BEGIN first, one COMMIT last, every delete inside them");
} else {
  fail(`CHECK 8 atomicity: expected exactly BEGIN first and COMMIT last, found first=${firstKind} last=${lastKind} transaction kinds=[${txKinds.join(", ")}]`);
}

// --- the deletes, printed ---------------------------------------------------
console.log("");
console.log(`The ${deletes.length} deletes, in the order the file runs them:`);
deletes.forEach((d, i) => {
  console.log(`  ${String(i + 1).padStart(2, " ")}. DELETE  ${qualified(d.relation)}`);
});
console.log("");

if (failures.length > 0) {
  console.error(`parse-reset-sql: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("parse-reset-sql: 8 checks passed, scripts/reset-test-data.sql is safe to hand to the owner.");
process.exit(0);
