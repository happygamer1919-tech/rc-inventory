#!/usr/bin/env node
// check-state-endpoint.mjs
// Card EXT-21. THE PUBLIC STATE ENDPOINT READS TWO TABLES AND NEVER A THIRD.
//
// WHY A CHECK AND NOT A REVIEW. app/api/health/route.ts says it in its own
// header: a health route is the endpoint everyone adds one more field to. The
// same sentence applies here with more force, because this response is read by a
// THIRD PARTY. The first extra field is always harmless. The third one is a
// supplier name, and nothing between here and there would have gone red.
//
// SO THE ALLOW-LIST IS THE CONTROL. Every `.from(...)` in the route file must
// name `categories` or `units`, and every `.rpc(...)` must name
// `applied_ledger_version`. Anything else is refused BY NAME, on the line it
// appears on, and adding a third table means editing this file in the same diff
// as the route, which is a decision somebody made and can be read.
//
// IT ALSO GUARDS THE THREE PROPERTIES THAT MAKE THE ANSWER TRUE, because each of
// them fails SILENTLY and each of them would still return 200:
//
//   `active` filter   a select that loses `.eq("active", true)` starts telling
//                     Andre we accept a category that was retired. The response
//                     stays well formed and nothing goes red.
//   `no-store`        a cached answer to "what do you accept now" is the whole
//                     defect this card removes, served with a 200.
//   `force-dynamic`   without it Next may statically render the route at build
//                     time, which is the same lie one layer down: the answer
//                     would be frozen at the moment of the deploy, which is
//                     exactly the moment the card says must stop mattering.
//
// IT IS A TEXT READ, ON PURPOSE. No parser, no database, no network, no
// credential, so it runs on every pull request in a second. A file that defeats
// this by computing its table name at runtime defeats it, and that is a shape
// nobody in this repository writes; the check is aimed at the field somebody
// adds in good faith, which is the one that has actually happened.
//
// RC_STATE_ROUTE points the read at another file, so prove-state-endpoint.mjs
// can show every refusal firing against a mutant rather than against a failure
// somebody manufactured by hand.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const ROUTE = process.env.RC_STATE_ROUTE || resolve(ROOT, "app/api/state/route.ts");

const ALLOWED_TABLES = ["categories", "units"];
const ALLOWED_RPC = ["applied_ledger_version"];

const failures = [];
const fail = (m) => failures.push(m);
const ok = (m) => console.log(`  ok    ${m}`);

console.log(`check-state-endpoint  ${ROUTE}`);

let source;
try {
  source = readFileSync(ROUTE, "utf8");
} catch {
  // FAIL CLOSED. A missing route is not a route with no violations. This is the
  // shape check-live-fixtures already refuses: silence must never read as clean.
  console.error(`  FAIL  the route file could not be read: ${ROUTE}`);
  console.error("check-state-endpoint: FAILED (1 problem)");
  process.exit(1);
}

const lines = source.split("\n");

// --- 1. every table the route selects from is on the allow-list -------------
const tables = [];
lines.forEach((line, i) => {
  for (const m of line.matchAll(/\.from\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
    tables.push({ name: m[1], line: i + 1 });
  }
});
if (tables.length === 0) {
  fail("CHECK 1 tables: the route selects from no table at all, so either it stopped reading the database or this check stopped seeing it. Both are refusals.");
} else {
  for (const t of tables) {
    if (!ALLOWED_TABLES.includes(t.name)) {
      fail(`CHECK 1 tables: ${ROUTE}:${t.line} selects from "${t.name}", which is not on the allow-list [${ALLOWED_TABLES.join(", ")}]. This endpoint is public and unauthenticated: a third table is a decision that needs a card, not a line.`);
    }
  }
  if (!failures.some((m) => m.startsWith("CHECK 1"))) {
    ok(`tables: ${tables.length} select(s), all on the allow-list [${ALLOWED_TABLES.join(", ")}]`);
  }
}

// --- 2. every rpc is on the allow-list --------------------------------------
const rpcs = [];
lines.forEach((line, i) => {
  for (const m of line.matchAll(/\.rpc\(\s*["'`]([^"'`]+)["'`]/g)) {
    rpcs.push({ name: m[1], line: i + 1 });
  }
});
for (const r of rpcs) {
  if (!ALLOWED_RPC.includes(r.name)) {
    fail(`CHECK 2 rpc: ${ROUTE}:${r.line} calls "${r.name}", which is not on the allow-list [${ALLOWED_RPC.join(", ")}]. A function can return anything the database holds.`);
  }
}
if (!failures.some((m) => m.startsWith("CHECK 2"))) {
  ok(`rpc: ${rpcs.length} call(s), all on the allow-list [${ALLOWED_RPC.join(", ")}]`);
}

// --- 3. both selects filter on active ---------------------------------------
// Counted rather than merely found: two selects and one filter is the mutant
// where somebody adds a table and forgets the filter on it.
const activeFilters = (source.match(/\.eq\(\s*["'`]active["'`]\s*,\s*true\s*\)/g) ?? []).length;
if (tables.length > 0 && activeFilters < tables.length) {
  fail(`CHECK 3 active filter: ${tables.length} select(s) and only ${activeFilters} .eq("active", true) filter(s). A select that loses the filter reports a retired value as accepted, with a 200 and nothing red.`);
} else if (tables.length > 0) {
  ok(`active filter: ${activeFilters} filter(s) for ${tables.length} select(s)`);
}

// --- 4. the response is not cacheable ---------------------------------------
if (!/["'`]cache-control["'`]\s*:\s*["'`][^"'`]*no-store/.test(source)) {
  fail('CHECK 4 no-store: the route does not set a cache-control header containing "no-store". A cached answer to "what do you accept now" is the defect this card exists to remove, served with a 200.');
} else {
  ok("no-store: cache-control is set and contains no-store");
}

// --- 5. the route is dynamic ------------------------------------------------
if (!/export\s+const\s+dynamic\s*=\s*["'`]force-dynamic["'`]/.test(source)) {
  fail('CHECK 5 force-dynamic: the route does not export dynamic = "force-dynamic". Without it Next may render this at build time, which freezes the answer at the moment of the deploy, which is the moment this card says must stop mattering.');
} else {
  ok('force-dynamic: exported');
}

if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`check-state-endpoint: FAILED (${failures.length} problem${failures.length === 1 ? "" : "s"})`);
  process.exit(1);
}
console.log("check-state-endpoint: PASS");
