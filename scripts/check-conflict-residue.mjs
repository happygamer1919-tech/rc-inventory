#!/usr/bin/env node
// check-conflict-residue.mjs - card GUARD-01, ruling R-052.
//
// Refuses to let a botched merge resolution reach `main`.
//
// WHY THIS EXISTS. Three incidents, all the same shape, none caught by anything:
//
//   1. `555b725`. `docs/board/rc-board-phase2.json` was committed carrying
//      conflict markers whose LEADING CHARACTERS had been stripped, leaving the
//      tails behind as file content:
//
//          "phase": "phase-2-build",
//         triage/20260827-220052
//          "as_of": "2026-08-28T10:55:00Z",
//
//          "as_of": "2026-08-28T11:35:00Z",
//         main
//
//      The file did not parse. `grep '<<<<<<<'` finds NOTHING there, which is
//      precisely why it survived a commit: the characters that a marker grep
//      looks for are the characters the bad resolution deleted.
//
//   2. `docs/LEARNINGS.md` lines 1536 and 1636, landed by `d66a28e` and live on
//      `main` until this card. Identical residue, in markdown. Markdown has no
//      parser to offend, so NOTHING caught it, and ` poc/19-harness-caps` sat in
//      the middle of the learnings file reading as though someone had typed a
//      branch name on a line of its own.
//
//   3. PR #94, resolved by the owner in the GitHub web editor, produced the same
//      residue FOUR times across two files, including a board JSON that both
//      failed to parse AND carried a duplicated `as_of` key.
//
// The three checks below are one per failure mode, in the order the residue
// degrades: markers intact, markers half-stripped, markers fully stripped and
// only a broken structure left behind.
//
// FENCED CODE BLOCKS ARE SKIPPED FOR CHECKS 1 AND 2, and that is load-bearing
// rather than a convenience. Every report in `docs/reports/` that describes one
// of these incidents QUOTES the residue, and a guard that cannot tell a quoted
// example from the real thing is a guard that forbids writing about the bug it
// exists to catch. All three incidents occurred outside a fence; every quotation
// of them in this repository is inside one. Check 3 does not skip anything,
// because a JSON file has no fences.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Extensions that are never text. Anything else is sniffed for a NUL byte. */
const BINARY_EXT = new Set([
  "pdf", "png", "jpg", "jpeg", "gif", "ico", "webp", "woff", "woff2",
  "ttf", "otf", "eot", "zip", "gz", "tgz", "mp4", "mov", "webm",
]);

const failures = [];
const fail = (msg) => failures.push(msg);

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8" });
  return out.split("\0").filter(Boolean);
}

function readText(path) {
  let buf;
  try {
    buf = readFileSync(resolve(REPO, path));
  } catch {
    return null; // deleted from the working tree, still in the index
  }
  if (buf.includes(0)) return null; // binary
  return buf.toString("utf8");
}

/**
 * Line numbers (1-based) that sit inside a fenced code block.
 *
 * The fence line itself counts as inside, so a fence that opens with ``` and a
 * residue line immediately after it are both skipped. Both ``` and ~~~ fences
 * are recognised, with up to three leading spaces, per CommonMark.
 */
function fencedLines(lines) {
  const inside = new Set();
  let fence = null; // the character run that opened the current fence
  lines.forEach((line, i) => {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === null) {
      if (m) {
        fence = m[1][0];
        inside.add(i + 1);
      }
    } else {
      inside.add(i + 1);
      if (m && m[1][0] === fence) fence = null;
    }
  });
  return inside;
}

// ---------------------------------------------------------------------------
// CHECK 1: conflict markers, intact.
// ---------------------------------------------------------------------------
//
// The easy case, and the only one anybody greps for. `^=======$` is matched at
// exactly seven characters. A setext H1 underline (`=====` under a title) would
// collide, so this is worth knowing: no file in this repository uses setext
// headings, and if one ever does, the fix is to write it as `#` and not to
// weaken this line.

const MARKER_RE = /^(<{7} |={7}$|>{7} )/;

// ---------------------------------------------------------------------------
// CHECK 2: conflict markers with their leading characters stripped.
// ---------------------------------------------------------------------------
//
// THE SIGNATURE, and why it is this precise. `<<<<<<< some-branch` is seven
// markers, a space, then the ref. Deleting the seven markers leaves EXACTLY
// ` some-branch`: leading whitespace, a bare git ref, nothing else. Same for
// `>>>>>>> main` becoming ` main`. So the thing to look for is not a branch
// name, which appears in prose constantly, but a line whose ENTIRE content is
// whitespace followed by a bare ref token.
//
// A ref token here is `main`, `HEAD`, or anything shaped `<word>/<word>`, which
// covers every branch this repository has used (`card/rst-01`, `poc/19-...`,
// `board/aut-12-14-...`, `triage/20260827-220052`).
//
// DELIBERATE DEVIATION FROM THE CARD, RECORDED RATHER THAN QUIETLY MADE. The
// card scopes this rule to lines "inside a JSON object or between two adjacent
// identical JSON keys". That condition cannot catch incident 2, which is
// markdown and has no JSON object to be inside, and incident 2 is one of the
// three the card requires this guard to fail on. So the rule is applied to
// every text file, and the JSON context is reported as an ADDITIONAL detail
// when it applies rather than used as a precondition. The false-positive cost
// of the wider rule is zero on this repository, measured rather than assumed:
// outside fenced blocks, the only lines that match are the two real residues.

const STRIPPED_RE = /^[ \t]+(main|HEAD|[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+)[ \t]*$/;

/** True when this line of a JSON file sits inside an object, brace-counted. */
function insideJsonObject(lines, lineNo) {
  let depth = 0, inStr = false, esc = false;
  for (let i = 0; i < lineNo - 1; i++) {
    for (const ch of lines[i]) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    esc = false;
  }
  return depth > 0;
}

/** The key name when the lines either side of `lineNo` declare the same key. */
function adjacentIdenticalKey(lines, lineNo) {
  const keyOf = (s) => (s && /^\s*"([^"]+)"\s*:/.exec(s)?.[1]) ?? null;
  for (let back = lineNo - 2; back >= 0 && back >= lineNo - 4; back--) {
    const before = keyOf(lines[back]);
    if (!before) continue;
    for (let fwd = lineNo; fwd < lines.length && fwd < lineNo + 3; fwd++) {
      const after = keyOf(lines[fwd]);
      if (!after) continue;
      return before === after ? before : null;
    }
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// CHECK 3: every JSON under docs/ parses, and no object repeats a key.
// ---------------------------------------------------------------------------
//
// THE LAST STAGE OF THE SAME DECAY. Strip a conflict's markers completely and
// keep both sides, and a JSON file is left holding the same key twice. It parses
// clean. `JSON.parse` takes the LAST one silently, so the file is valid, the
// validator is green, and the board is quietly reporting whichever half of the
// conflict happened to be second. PR #94's board carries exactly this: two
// `as_of` keys, one from each side of a resolution nobody finished.
//
// A minimal parser rather than `JSON.parse`, because `JSON.parse` has already
// discarded the duplicate by the time any reviver can see it.

function parseStrict(text, path) {
  const dups = [];
  let i = 0;

  const lineOf = (pos) => text.slice(0, pos).split("\n").length;
  const err = (msg, pos) => {
    throw new Error(`${msg} at line ${lineOf(pos)}`);
  };
  const ws = () => { while (i < text.length && " \t\n\r".includes(text[i])) i++; };

  function value(path) {
    ws();
    const ch = text[i];
    if (ch === "{") return object(path);
    if (ch === "[") return array(path);
    if (ch === '"') return string();
    const rest = text.slice(i);
    for (const lit of ["true", "false", "null"]) {
      if (rest.startsWith(lit)) { i += lit.length; return null; }
    }
    const num = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(rest);
    if (num) { i += num[0].length; return null; }
    err(`unexpected character ${JSON.stringify(ch ?? "<eof>")}`, i);
  }

  function string() {
    if (text[i] !== '"') err("expected a string", i);
    i++;
    let out = "";
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\\") { out += text[i] + text[i + 1]; i += 2; continue; }
      if (ch === '"') { i++; return out; }
      out += ch; i++;
    }
    err("unterminated string", i);
  }

  function object(path) {
    i++; // {
    const seen = new Map();
    ws();
    if (text[i] === "}") { i++; return; }
    for (;;) {
      ws();
      const keyPos = i;
      const key = string();
      if (seen.has(key)) {
        dups.push({ key, path: path ? `${path}.${key}` : key, line: lineOf(keyPos), first: seen.get(key) });
      } else {
        seen.set(key, lineOf(keyPos));
      }
      ws();
      if (text[i] !== ":") err("expected ':'", i);
      i++;
      value(path ? `${path}.${key}` : key);
      ws();
      if (text[i] === ",") { i++; continue; }
      if (text[i] === "}") { i++; return; }
      err("expected ',' or '}'", i);
    }
  }

  function array(path) {
    i++; // [
    ws();
    if (text[i] === "]") { i++; return; }
    let n = 0;
    for (;;) {
      value(`${path}[${n++}]`);
      ws();
      if (text[i] === ",") { i++; continue; }
      if (text[i] === "]") { i++; return; }
      err("expected ',' or ']'", i);
    }
  }

  value("");
  ws();
  if (i < text.length) err("trailing content after the top-level value", i);
  return dups;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const files = trackedFiles();
let scanned = 0, markerHits = 0, strippedHits = 0, jsonChecked = 0, dupHits = 0;

for (const file of files) {
  const ext = file.includes(".") ? file.split(".").pop().toLowerCase() : "";
  if (BINARY_EXT.has(ext)) continue;
  const text = readText(file);
  if (text === null) continue;
  scanned++;

  const lines = text.split("\n");
  const fenced = fencedLines(lines);
  const isJson = ext === "json";

  lines.forEach((line, idx) => {
    const no = idx + 1;
    if (fenced.has(no)) return;

    if (MARKER_RE.test(line)) {
      markerHits++;
      fail(`CHECK 1 conflict marker: ${file}:${no}: ${JSON.stringify(line.slice(0, 60))}`);
      return;
    }

    if (STRIPPED_RE.test(line)) {
      strippedHits++;
      let detail = "";
      if (isJson) {
        const dupKey = adjacentIdenticalKey(lines, no);
        if (dupKey) detail = `, between two adjacent "${dupKey}" keys`;
        else if (insideJsonObject(lines, no)) detail = ", inside a JSON object";
      }
      fail(
        `CHECK 2 stripped conflict marker: ${file}:${no}: ${JSON.stringify(line)}` +
        `${detail}. A bare git ref alone on a line is what "<<<<<<< ${line.trim()}" or ` +
        `">>>>>>> ${line.trim()}" becomes when the marker characters are deleted and the ` +
        `tail is left behind. Nothing greps for this, which is why it survives a commit.`
      );
    }
  });
}

for (const file of files) {
  if (!file.startsWith("docs/") || !file.endsWith(".json")) continue;
  const text = readText(file);
  if (text === null) continue;
  jsonChecked++;
  let dups;
  try {
    dups = parseStrict(text, file);
  } catch (error) {
    fail(`CHECK 3 JSON parse: ${file}: ${error.message}`);
    continue;
  }
  for (const d of dups) {
    dupHits++;
    fail(
      `CHECK 3 duplicate JSON key: ${file}:${d.line}: "${d.path}" was already declared ` +
      `at line ${d.first}. JSON.parse accepts this silently and keeps the LAST one, so a ` +
      `half-resolved conflict can leave the file valid and quietly wrong.`
    );
  }
}

console.log(`CHECK 1 conflict markers: ${markerHits === 0 ? "OK" : "FAIL"}, ${scanned} text files scanned outside fenced blocks`);
console.log(`CHECK 2 stripped markers: ${strippedHits === 0 ? "OK" : "FAIL"}, same ${scanned} files, bare-ref-token lines`);
console.log(`CHECK 3 JSON under docs/: ${dupHits === 0 && !failures.some((f) => f.startsWith("CHECK 3 JSON parse")) ? "OK" : "FAIL"}, ${jsonChecked} files parsed strictly, duplicate keys rejected`);

if (failures.length > 0) {
  console.error("");
  console.error(`check-conflict-residue: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error("");
  console.error("Resolve the conflict locally against the full tree, per CLAUDE.md 3 and ruling R-052.");
  console.error("Never in the GitHub web editor: it shows one file at a time and runs no validator.");
  process.exit(1);
}

console.log("check-conflict-residue: 3 checks passed, no conflict residue in the tree.");
process.exit(0);
