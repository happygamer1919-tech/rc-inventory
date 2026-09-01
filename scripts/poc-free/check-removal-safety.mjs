#!/usr/bin/env node
// check-removal-safety.mjs
// Card P3-11c. THE GUARD FOR THE DIRECTION check:pending-schema-reads CANNOT SEE.
//
// TWO OUTAGES, ONE DEFECT, TWO DIRECTIONS.
//
//   INC-05, 2026-08-31. Code was MERGED that read schema which was not yet
//   APPLIED. Every screen answered 500. check:pending-schema-reads was built for
//   this and catches it: it compares merged code against the pending register.
//
//   INC-06, 2026-09-01. A migration was APPLIED that removed schema which
//   deployed code was still READING. Six screens answered 500.
//   check:pending-schema-reads cannot catch this AND NEVER COULD, by
//   construction: the code doing the reading is already on main, and the register
//   is about to be cleared. It asks "does this code read something not yet
//   there?", which is the wrong question in this direction.
//
// THIS FILE ASKS THE OTHER QUESTION: does anything still read something a pending
// migration is about to take away?
//
// THE ORDERING RULE, AS A MACHINE CONDITION RATHER THAN PROSE:
//
//   an ADDITIVE migration applies BEFORE the code that reads it merges
//   a REMOVAL migration applies AFTER the code that stops reading it is merged
//                            AND DEPLOYED
//
// DEPLOYED IS NOT MERGED, AND THAT DISTINCTION IS THE WHOLE OF INC-06. This file
// asserts the MERGED half. The DEPLOYED half is an open question to the owner,
// asked through scripts/poc/ask.sh on card P3-11c, because there is no usable
// Vercel credential in the permitted secret read and inventing a substitute for
// "deployed" is the exact class of mistake this card exists to stop. Until it is
// answered, the applier refuses every batch containing a removal.
//
// HOW READERS ARE FOUND, AND WHY IT IS NOT A GREP FOR THE COLUMN NAME.
//
// During P3-05b a search for `supplier_name` with `grep -v extraction` skipped
// lib/data/extraction-actions.ts:269, which writes products.supplier_name from a
// file named for extraction. The exclusion was there to filter out
// extraction_drafts.supplier_name, a genuinely different column, and it hid a
// real reader of the one being dropped. That reader shipped and took production
// down.
//
// So the enumeration is TABLE FIRST. Every file that touches the table at all is
// found, by the table's name, with no exclusions. Only then is each of those
// files examined for the object being removed. A file that never mentions the
// table cannot be reading its column; a file that mentions the table is read in
// full.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModule, parseSync } from "pgsql-parser";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const APPLY_LOG = process.env.RC_REMOVAL_REGISTER || join(ROOT, "docs/migrations/APPLY-LOG.md");
const MIGRATIONS = process.env.RC_REMOVAL_MIGRATIONS || join(ROOT, "supabase/migrations");
// An override may be absolute. path.join would glue it onto ROOT and produce a
// directory that does not exist, which existsSync then filters away silently,
// leaving the check with nothing to scan and reporting OK. That is the same
// shape of silent-pass this whole card exists to stop, so it is handled here.
const abs = (d) => (d.startsWith("/") ? d : join(ROOT, d));

// A PATH IS ONLY SHORTENED WHEN IT IS ACTUALLY UNDER THE REPO ROOT.
// Slicing by ROOT.length assumes every scanned file lives in the repository. The
// fixtures do not: they live in a temporary directory, and the slice then cut a
// tmp path at an arbitrary offset and printed a mangled name. It passed locally
// and failed on the CI runner purely because the two machines make tmp paths of
// different lengths, which is the kind of luck that hides a defect until it
// matters.
const shown = (f) => (f.startsWith(ROOT + "/") ? f.slice(ROOT.length + 1) : f);
const SOURCE_DIRS = (process.env.RC_REMOVAL_SOURCE || "lib,app,components")
  .split(",")
  .map((d) => abs(d.trim()))
  .filter((d) => existsSync(d));

if (SOURCE_DIRS.length === 0) {
  console.error("check-removal-safety: no source directory to scan, refusing to report OK");
  process.exit(2);
}

await loadModule();

function pendingFiles() {
  if (!existsSync(APPLY_LOG)) return [];
  const out = [];
  for (const line of readFileSync(APPLY_LOG, "utf8").split("\n")) {
    const m = /^-\s+`(\d{4}_[a-z0-9_]+\.sql)`\s*,\s*card de aplicare\s+[A-Za-z0-9-]+\s*$/.exec(
      line.trim(),
    );
    if (m) out.push(m[1]);
  }
  return out;
}

/** What a pending migration TAKES AWAY. */
function removalsIn(sql) {
  const cols = [];
  const tables = [];
  const funcs = [];
  for (const s of parseSync(sql).stmts ?? []) {
    const kind = Object.keys(s.stmt ?? {})[0];
    const node = s.stmt[kind];
    if (kind === "AlterTableStmt" && node?.relation?.relname) {
      const rel = node.relation.relname;
      for (const w of node.cmds ?? []) {
        const cmd = w?.AlterTableCmd;
        if (cmd?.subtype === "AT_DropColumn" && cmd?.name) cols.push({ table: rel, column: cmd.name });
      }
    }
    if (kind === "DropStmt") {
      for (const o of node.objects ?? []) {
        if (node.removeType === "OBJECT_TABLE") {
          const names = (o?.List?.items ?? []).map((x) => x?.String?.sval).filter(Boolean);
          if (names.length) tables.push(names[names.length - 1]);
        }
        if (node.removeType === "OBJECT_FUNCTION") {
          const names = (o?.ObjectWithArgs?.objname ?? []).map((x) => x?.String?.sval).filter(Boolean);
          if (names.length) funcs.push(names[names.length - 1]);
        }
      }
    }
  }
  return { cols, tables, funcs };
}

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
    }
  };
  for (const d of SOURCE_DIRS) walk(d);
  return out;
}

// TABLE FIRST. Every file that names the table in any way that could reach it:
// a PostgREST .from(), an embedded relation in a select string, or a schema
// qualified reference in SQL. No exclusions, ever.
function filesTouching(table, files) {
  const patterns = [
    new RegExp(`\\.from\\(\\s*["'\`]${table}["'\`]`),
    new RegExp(`\\bpublic\\.${table}\\b`),
    new RegExp(`\\b${table}\\s*\\(`), // embedded relation inside a select string
    new RegExp(`["'\`][^"'\`]*\\b${table}\\b[^"'\`]*["'\`]`),
  ];
  return files.filter((f) => {
    const src = readFileSync(f, "utf8");
    return patterns.some((p) => p.test(src));
  });
}

const pending = pendingFiles();
const files = sourceFiles();
const findings = [];

for (const f of pending) {
  const full = join(MIGRATIONS, f);
  if (!existsSync(full)) continue;
  const { cols, tables, funcs } = removalsIn(readFileSync(full, "utf8"));

  for (const { table, column } of cols) {
    for (const src of filesTouching(table, files)) {
      const text = readFileSync(src, "utf8");
      text.split("\n").forEach((line, i) => {
        if (new RegExp(`\\b${column}\\b`).test(line) && !/^\s*(\/\/|\*|--)/.test(line))
          findings.push({ file: f, kind: `column ${table}.${column}`, at: `${shown(src)}:${i + 1}`, line: line.trim().slice(0, 110) });
      });
    }
  }

  for (const table of tables) {
    for (const src of filesTouching(table, files))
      findings.push({ file: f, kind: `table ${table}`, at: shown(src), line: "file references the table" });
  }

  for (const fn of funcs) {
    for (const src of files) {
      const text = readFileSync(src, "utf8");
      text.split("\n").forEach((line, i) => {
        if (new RegExp(`\\.rpc\\(\\s*["'\`]${fn}["'\`]`).test(line))
          findings.push({ file: f, kind: `function ${fn}`, at: `${shown(src)}:${i + 1}`, line: line.trim().slice(0, 110) });
      });
    }
  }
}

if (pending.length === 0) {
  console.log("check-removal-safety: no pending migrations, nothing to check");
  process.exit(0);
}

if (findings.length > 0) {
  console.error("check-removal-safety: CODE STILL READS SCHEMA A PENDING MIGRATION REMOVES\n");
  for (const v of findings) {
    console.error(`  ${v.file} removes ${v.kind}`);
    console.error(`      still read at ${v.at}`);
    console.error(`        ${v.line}`);
  }
  console.error(
    "\nA REMOVAL MIGRATION APPLIES AFTER THE CODE THAT STOPS READING IT IS MERGED AND DEPLOYED.",
  );
  console.error(
    "Applying it now is INC-06: the column goes, the deployed code keeps asking for it,",
  );
  console.error("PostgREST answers 42703 and every screen that reads it answers 500.");
  process.exit(1);
}

console.log(
  `check-removal-safety: OK, ${pending.length} pending migration(s) checked, no reader remains on main`,
);
