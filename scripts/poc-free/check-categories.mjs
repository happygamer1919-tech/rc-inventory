#!/usr/bin/env node
// check-categories.mjs - proves the committed category vocabulary and the
// committed migration agree, WITHOUT a database.
//
// P2-17. docs/contracts/categories.json is EXPORTED from the live schema, and
// supabase/migrations/0007_seed_categories.sql is what put those rows there.
// Two files, one fact, and nothing but discipline keeping them in step: an
// entry renamed in the migration and not re-exported, or a file hand-edited
// after export, leaves the extraction mapping in P2-09 reading a list the
// database does not have.
//
// So the check is a set comparison in both directions, and it runs in CI on
// every push. It needs no credential and no connection, which is why it can.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = resolve(HERE, "../../docs/contracts/categories.json");
// P3-34. THE VOCABULARY IS SEEDED BY MORE THAN ONE MIGRATION NOW.
//
// 0007 seeded the first eighteen. 0029 adds the nineteenth. The list is EXPLICIT
// and in apply order rather than a glob over supabase/migrations: a migration
// that touches public.categories should be a line in this diff, and a glob would
// silently widen what this check accepts the day somebody adds one.
const SQL_PATHS = [
  resolve(HERE, "../../supabase/migrations/0007_seed_categories.sql"),
  resolve(HERE, "../../supabase/migrations/0029_category_paints.sql"),
];

// EXPLICIT, AND IT CHANGES DELIBERATELY. Derived from the JSON it would agree
// with itself whatever the JSON said, which is a check whose passing path is
// reachable without the condition being true. docs/LEARNINGS.md names that class.
const EXPECTED_COUNT = 19;
/** Belongs to P2-15 and to the owner decision recorded there, never to the vocabulary. */
const RESIDUE = "TEST-Categorie";

const failures = [];
const fail = (m) => failures.push(m);

// --- the committed export ---------------------------------------------------
let doc;
try {
  doc = JSON.parse(readFileSync(JSON_PATH, "utf8"));
} catch (error) {
  console.error("CHECK 1 categories.json parses: FAIL");
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
}
const entries = Array.isArray(doc?.categories) ? doc.categories : [];
console.log(`CHECK 1 categories.json parses: OK, ${entries.length} entries`);

// --- 2. the count is what the card says -------------------------------------
if (entries.length === EXPECTED_COUNT && doc.count === EXPECTED_COUNT) {
  console.log(`CHECK 2 count: OK, ${EXPECTED_COUNT}`);
} else {
  fail(`CHECK 2 count: expected ${EXPECTED_COUNT}, found ${entries.length} entries with a declared count of ${doc.count}`);
}

// --- 3. the residue row is not in the vocabulary ----------------------------
if (!entries.some((e) => e.name === RESIDUE)) {
  console.log(`CHECK 3 residue excluded: OK, ${RESIDUE} is not in the vocabulary`);
} else {
  fail(`CHECK 3 residue excluded: ${RESIDUE} appears in categories.json. It is CRIT-11 e2e residue and belongs to P2-15.`);
}

// --- 4. names are unique and sort_order is 1..N with no gaps ----------------
const names = entries.map((e) => e.name);
if (new Set(names).size !== names.length) {
  fail("CHECK 4 shape: duplicate names in categories.json");
} else {
  const orders = entries.map((e) => e.sort_order).sort((a, b) => a - b);
  const contiguous = orders.every((o, i) => o === i + 1);
  if (contiguous) {
    console.log(`CHECK 4 shape: OK, names unique, sort_order 1 to ${orders.length} with no gaps`);
  } else {
    fail(`CHECK 4 shape: sort_order is not 1..${orders.length} contiguous, found [${orders.join(", ")}]`);
  }
}

// --- 5 and 6. the migration and the export agree, both directions -----------
// Read the VALUES list out of the committed migration rather than trusting a
// second hand-maintained copy of the names.
const sql = SQL_PATHS.map((f) => readFileSync(f, "utf8")).join("\n");
const fromSql = [...sql.matchAll(/^\s*\('([^']+)',\s*(\d+)\)/gm)].map((m) => ({
  name: m[1],
  sort_order: Number(m[2]),
}));

if (fromSql.length === 0) {
  fail("CHECK 5 migration parsed: no VALUES rows found in 0007_seed_categories.sql");
} else {
  console.log(`CHECK 5 migration parsed: OK, ${fromSql.length} rows in the VALUES list`);

  const jsonSet = new Set(names);
  const sqlSet = new Set(fromSql.map((r) => r.name));
  const missingFromJson = [...sqlSet].filter((n) => !jsonSet.has(n));
  const missingFromSql = [...jsonSet].filter((n) => !sqlSet.has(n));

  if (missingFromJson.length === 0 && missingFromSql.length === 0) {
    console.log("CHECK 6 both directions agree: OK, every migration entry is exported and every exported entry is in the migration");
  } else {
    for (const n of missingFromJson) fail(`CHECK 6: "${n}" is in the migration and NOT in categories.json. Re-export.`);
    for (const n of missingFromSql) fail(`CHECK 6: "${n}" is in categories.json and NOT in the migration. The file was hand-edited.`);
  }

  const orderMismatch = fromSql.filter((r) => {
    const e = entries.find((x) => x.name === r.name);
    return e && e.sort_order !== r.sort_order;
  });
  if (orderMismatch.length === 0) {
    console.log("CHECK 7 sort_order agrees: OK");
  } else {
    for (const r of orderMismatch) fail(`CHECK 7: "${r.name}" is sort_order ${r.sort_order} in the migration and something else in categories.json`);
  }
}

// --- 8. the migration stays non-destructive ---------------------------------
// It is applied to the client's project. CLAUDE.md 8.6 forbids auto-applying a
// destructive statement, and this is the check that keeps a later edit honest.
const destructive = /\b(drop\s+table|truncate|delete\s+from|update\s+public\.)/i;
const codeLines = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");
if (!destructive.test(codeLines)) {
  console.log("CHECK 8 non-destructive: OK, INSERT only outside the comments");
} else {
  fail("CHECK 8 non-destructive: the migration contains a destructive or updating statement outside its comments");
}

console.log("");
console.log("The vocabulary, in display order:");
for (const e of [...entries].sort((a, b) => a.sort_order - b.sort_order)) {
  console.log(`  ${String(e.sort_order).padStart(2, " ")}. ${e.name}`);
}
console.log("");

if (failures.length > 0) {
  console.error(`check-categories: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("check-categories: 8 checks passed.");
process.exit(0);
