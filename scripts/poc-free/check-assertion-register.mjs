#!/usr/bin/env node
// check-assertion-register.mjs
// Card PROVE-01. AN ASSERTION WITH NO FAILING CASE FAILS THE BUILD.
//
// docs/ASSERTION-REGISTER.md names every assertion and every refusal in the four
// guards that stand between a bad batch and the production database, together
// with the case that proves each one can fail. This file keeps that register
// honest in both directions:
//
//   an assertion in the source with no row here      -> fail
//   a row here naming an assertion that is gone      -> fail
//   a row whose failing case is NONE                 -> fail
//
// WHY A REGISTER AND NOT JUST THE PROOFS. The proofs answer "do these cases
// pass". They cannot answer "is there a case for every assertion", because an
// assertion nobody wrote a case for is invisible to them: adding one to the
// applier and no perturbation for it makes the proof cover ten of eleven and
// still print all-passed. This file is what notices.
//
// IT ASSERTS ITS OWN INPUT COUNT AGAINST ITS MATCH COUNT, because a register
// check that parses zero assertions finds zero gaps. Every source file must
// yield at least one name, and a file that yields none is a hard failure rather
// than a quiet skip. That is docs/LEARNINGS.md's named class, and this file is
// exactly the shape that falls into it.
//
// No network, no database, no secret.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const REGISTER = join(ROOT, "docs/ASSERTION-REGISTER.md");

// THE SOURCES, EXPLICIT AND NOT A GLOB. A file appearing under scripts/poc-free
// should be a line in a diff rather than a silent widening of what this check
// covers, the same reason check-card-ids gives for its board list.
const SOURCES = [
  {
    rel: "scripts/apply-pending-migrations.mjs",
    what: "SQL assertions and notices",
    // A("name", and N("name", are the two declarations.
    extract: (s) => [...s.matchAll(/\b[AN]\("([a-z0-9-]+)"/g)].map((m) => m[1]),
  },
  {
    rel: "scripts/poc-free/check-removal-safety.mjs",
    what: "refusals",
    extract: (s) => [...s.matchAll(/\/\/ REFUSAL: ([a-z0-9-]+)/g)].map((m) => m[1]),
  },
  {
    rel: "scripts/poc-free/check-pending-schema-reads.mjs",
    what: "refusals",
    extract: (s) => [...s.matchAll(/\/\/ REFUSAL: ([a-z0-9-]+)/g)].map((m) => m[1]),
  },
];

const problems = [];
console.log("check-assertion-register");

if (!existsSync(REGISTER)) {
  console.error(`check-assertion-register: ${REGISTER} does not exist.`);
  console.error("Refusing to report OK against a register that is not there.");
  process.exit(2);
}
const registerText = readFileSync(REGISTER, "utf8");

// Every `name` in a table row of the register, with the rest of its row, so the
// failing case can be read.
const rows = new Map();
for (const line of registerText.split("\n")) {
  const m = /^\|\s*`([a-z0-9-]+)`\s*\|\s*(.+?)\s*\|\s*$/.exec(line.trim());
  if (m) rows.set(m[1], m[2]);
}
console.log(`  register      ${rows.size} row(s) with a named assertion`);
if (rows.size === 0) {
  console.error("check-assertion-register: the register parsed ZERO rows.");
  console.error("A register check that reads nothing reports no gaps.");
  process.exit(2);
}

const seen = new Set();
for (const src of SOURCES) {
  const file = join(ROOT, src.rel);
  if (!existsSync(file)) {
    console.error(`check-assertion-register: source not found: ${src.rel}`);
    process.exit(2);
  }
  const names = src.extract(readFileSync(file, "utf8"));
  console.log(`  ${src.rel}: ${names.length} ${src.what}`);
  if (names.length === 0) {
    problems.push(
      `${src.rel} yielded ZERO ${src.what}. Either the declaration shape changed and this ` +
        `check has stopped reading it, or the file lost its assertions. Both are failures.`,
    );
    continue;
  }
  for (const name of names) {
    seen.add(name);
    const row = rows.get(name);
    if (row === undefined) {
      problems.push(
        `${name} (${src.rel}) has NO ROW in docs/ASSERTION-REGISTER.md.\n` +
          `      Add it with the case that proves it can fail, or delete the assertion.`,
      );
      continue;
    }
    if (/\bNONE\b/.test(row)) {
      problems.push(
        `${name} (${src.rel}) is registered with NO failing case.\n` +
          `      An assertion with no failing case is deleted or fixed, never left.`,
      );
    }
  }
}

// The other direction: a register that has rotted is a register that will be
// trusted about something that is gone.
for (const name of rows.keys()) {
  if (!seen.has(name)) {
    problems.push(
      `${name} is in the register and exists in none of the sources.\n` +
        `      A rotting register is how a missing assertion goes unnoticed.`,
    );
  }
}

console.log("");
if (problems.length > 0) {
  console.error("check-assertion-register: THE REGISTER AND THE SOURCE DISAGREE\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nAn assertion nobody has watched fail is an assertion nobody has tested, and\n" +
      "three of these had reported passing for weeks while being incapable of failing.\n" +
      "docs/ASSERTION-REGISTER.md is the list of what has been watched.\n",
  );
  process.exit(1);
}
console.log(
  `check-assertion-register: OK. ${seen.size} assertion(s) and refusal(s) across ` +
    `${SOURCES.length} file(s), each with a failing case on the record.`,
);
