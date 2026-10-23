#!/usr/bin/env node
// check-tests-run.mjs
// Card P3-335. A TEST FILE THAT NO COMMAND RUNS IS REFUSED.
//
// Seven files under tests/ (price-input, outbound-slip-year, import-batches,
// combobox-commit, import-sheet-close, client-import-instructions,
// parse-project-query) sat there green in nobody's run: playwright.config.ts reads
// only ./tests/e2e and `npm test` ran one other file, through a loader that was
// not even installed. Nothing was red, because nothing ran.
//
// WHAT IT CHECKS. Every *.test.ts and *.spec.ts under tests/ must sit where one
// of three configs reads it, and that config must still say so:
//   tests/e2e/**              playwright.config.ts       testDir ./tests/e2e
//   tests/perf/**             playwright.perf.config.ts  testDir ./tests/perf
//   tests/*.test.ts           playwright.unit.config.ts  testDir ./tests, `*.test.ts`
// The unit suite is `npm test`, and the quality workflow must run `npm test`.
// A file anywhere else (tests/helpers/x.test.ts, tests/x.spec.ts) fails, with the
// path, so a new test cannot be written into a folder nobody reads.
//
// No network, no credentials, no browser. `--root <dir>` points it at another
// tree, which is how the cases below are proved to fail.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argRoot = process.argv.indexOf("--root");
const ROOT = argRoot > -1 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(HERE, "..", "..");

const problems = [];
const read = (rel) => (existsSync(path.join(ROOT, rel)) ? readFileSync(path.join(ROOT, rel), "utf8") : null);

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Each reader: the config file, the text that proves it still reads that place.
const READERS = {
  e2e: { file: "playwright.config.ts", needs: /testDir:\s*"\.\/tests\/e2e"/ },
  perf: { file: "playwright.perf.config.ts", needs: /testDir:\s*"\.\/tests\/perf"/ },
  unit: {
    file: "playwright.unit.config.ts",
    needs: /testDir:\s*"\.\/tests"[\s\S]*testMatch:\s*"\*\.test\.ts"/,
  },
};

const used = new Set();
const files = walk(path.join(ROOT, "tests")).map((f) => path.relative(ROOT, f).split(path.sep).join("/"));

for (const rel of files) {
  const parts = rel.split("/");
  if (parts[1] === "e2e") used.add("e2e");
  else if (parts[1] === "perf") used.add("perf");
  else if (parts.length === 2 && rel.endsWith(".test.ts")) used.add("unit");
  else problems.push(`${rel} is outside every folder a test config reads (tests/e2e, tests/perf, or tests/*.test.ts).`);
}

for (const kind of used) {
  const { file, needs } = READERS[kind];
  const text = read(file);
  if (text === null) problems.push(`${file} is missing, but ${kind} test files exist.`);
  else if (!needs.test(text)) problems.push(`${file} no longer reads the ${kind} test files.`);
}

if (used.has("unit")) {
  const pkg = JSON.parse(read("package.json") ?? "{}");
  if (!/playwright test --config playwright\.unit\.config\.ts/.test(pkg.scripts?.test ?? "")) {
    problems.push("package.json `test` does not run playwright.unit.config.ts.");
  }
  const workflow = read(".github/workflows/quality.yml") ?? "";
  if (!/^\s*run:\s*npm test\s*$/m.test(workflow)) {
    problems.push(".github/workflows/quality.yml has no step that runs `npm test`.");
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.error(`check-tests-run: ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`check-tests-run: ${files.length} test file(s), every one is read by a config CI runs.`);
