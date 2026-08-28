#!/usr/bin/env node
//
// AUT-5. The digest Ivan actually reads.
//
// The old digest leaked card ids, ruling ids, PR numbers, CI status, claim
// mechanics and file paths. He can act on none of that, so it trained him to
// skim, and skimming is how a real escalation gets missed. This file renders
// only what he can act on, and everything else goes to a full digest written to
// a log file that nothing links to.
//
// THE RULES, enforced by assertPlain() below rather than by good intentions:
//   - no card ids, no ruling ids, no PR numbers
//   - no CI status, no links, no file paths
//   - no claim mechanics, no lock files, no run ids
//   - no counts of things Ivan cannot act on
//   - under 150 words unless something needs him
//
// THE ONE DELIBERATE EXCEPTION: the reply line in NEEDS YOU. It is the literal
// string he must send back for the system to receive an answer, so it is a
// copy-paste payload rather than a reference he has to decode. The assertion
// checks the prose and skips that line. See the README note in the PR.
//
// Source of truth for wording is the card's `plain` field (AUT-7). Where a card
// has none, the title is printed and the gap is flagged, so a missing plain
// field is visible rather than silently papered over. The id is NEVER a
// fallback.
//
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyse, daysSince } from "./eligible.mjs";

// Card ids (P2-15, AUT-1, CRIT-14), ruling ids (R-026), PR numbers (#45).
const CARD_ID = /\b[A-Z][A-Z0-9]{0,5}-\d{1,3}[a-z]?\b/g;
const RULING_ID = /\bR-\d{2,4}\b/g;
const PR_NUMBER = /#\d+\b/g;
const GATE_ID = /\bG\d\b/g;

// Strip anything that looks like an internal reference out of prose bound for
// Ivan. Applied to every string that reaches him, not only the ones expected to
// be dirty, because the dirty ones are the ones nobody expected.
export function sanitize(text) {
  if (!text) return "";
  return String(text)
    .replace(CARD_ID, "")
    .replace(RULING_ID, "")
    .replace(PR_NUMBER, "")
    .replace(GATE_ID, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b(?:\/)?(?:Users|home|docs|scripts|supabase|lib|components|app|tests)\/\S*/g, "")
    .replace(/\b[\w.-]+\.(md|json|mjs|sh|ts|tsx|sql|yml)\b/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/^[\s:,.-]+/, "")
    .trim();
}

// The plain description of a card. `plain` is authoritative; a string is used
// as is, an object may carry {summary, ask, why, needs}. With neither, the
// title is used and the gap is reported.
export function plainOf(card) {
  const p = card.plain;
  if (typeof p === "string" && p.trim()) return { text: sanitize(p), gap: false };
  if (p && typeof p === "object" && typeof p.summary === "string" && p.summary.trim()) {
    return { text: sanitize(p.summary), gap: false, fields: p };
  }
  return { text: sanitize(card.title || "this task"), gap: true };
}

// The plain fields are authored as "what" in the first sentence and "why it
// matters" in the sentences after it. Splitting on that is how the digest gets
// its Why line without going back to the card's jargon-heavy question text.
export function splitPlain(text) {
  const clean = sanitize(text);
  if (!clean) return { what: "", why: "" };
  const m = clean.match(/^([\s\S]*?[.!?])(\s+)([\s\S]+)$/);
  if (!m) return { what: clean, why: "" };
  return { what: m[1].trim(), why: m[3].trim() };
}

function firstSentence(text, limit = 160) {
  const clean = sanitize(text);
  if (!clean) return "";
  const stop = clean.search(/[.!?](\s|$)/);
  let out = stop > 20 ? clean.slice(0, stop + 1) : clean;
  if (out.length > limit) out = out.slice(0, limit - 1).replace(/\s\S*$/, "") + "…";
  return out.trim();
}

// Pull a line out of the structured decision-needed text, sanitized.
function fromQuestion(card, label) {
  const q = String(card.question || "");
  const m = q.match(new RegExp(label + ":\\s*([\\s\\S]*?)(?:\\n[A-Z][A-Z ]{3,}:|$)"));
  return m ? firstSentence(m[1]) : "";
}

// Ends a fragment as one clean sentence: no double stops, no trailing comma.
function sentence(text) {
  const clean = sanitize(text).replace(/[\s.;,]+$/, "");
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1) + ".";
}

function plural(n, one, many) {
  return n + " " + (n === 1 ? one : many);
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// The digest
// ---------------------------------------------------------------------------
export function buildPlainDigest(board, state, opts = {}) {
  const now = Math.floor((opts.nowMs || Date.now()) / 1000);
  const view = analyse(board, state, "harness", now);
  const cards = board.cards || [];
  const byId = new Map(cards.map((c) => [c.id, c]));
  const gaps = [];
  const noWhy = [];

  const describe = (card) => {
    const p = plainOf(card);
    if (p.gap) gaps.push(card.id);
    return p;
  };

  const lines = [];

  // 1. What got done, in plain terms, counted.
  const moved = String(opts.cards || "")
    .split(",")
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(":");
      return { id: parts[0], status: parts[parts.length - 1], kind: parts.length >= 3 ? parts[1] : "main" };
    });
  const shipped = moved.filter((m) => m.status === "shipped" && m.kind === "main");
  const partBuilt = moved.filter((m) => m.kind === "branch");

  if (shipped.length > 0) {
    const names = shipped.map((m) => splitPlain(describe(byId.get(m.id) || { title: "" }).text).what)
      .map((t) => t.replace(/[\s.]+$/, "")).filter(Boolean);
    lines.push(
      "Finished " + plural(shipped.length, "task", "tasks") + " since the last update" +
        (names.length ? ": " + names.join("; ") : "") + "."
    );
  } else if (partBuilt.length > 0) {
    const names = partBuilt.map((m) => splitPlain(describe(byId.get(m.id) || { title: "" }).text).what)
      .map((t) => t.replace(/[\s.]+$/, "")).filter(Boolean);
    lines.push(
      "Nothing finished. " + plural(partBuilt.length, "task is", "tasks are") +
        " part built and not ready yet" + (names.length ? ": " + names.join("; ") : "") + "."
    );
  } else {
    lines.push("Nothing finished since the last update.");
  }

  // 2. NEEDS YOU. Omitted entirely when nothing needs him.
  const needsYou = view.blockedAnswerable;
  if (needsYou.length > 0) {
    lines.push("");
    lines.push("NEEDS YOU");
    for (const entry of needsYou) {
      const card = entry.card;
      const p = describe(card);
      const fields = p.fields || {};
      // Rendered from the plain field only. Mining the card's question text
      // produced mangled half sentences full of the jargon this digest exists
      // to remove, so a card without a plain field says so instead of guessing.
      // Rendered from the plain field only. Its first sentence is the ask and
      // the rest is why it matters; a plain field with no second sentence gets
      // no invented Why, and is counted so the gap is visible rather than
      // papered over with the card's jargon.
      const split = splitPlain(p.text);
      const ask = sanitize(fields.ask) || split.what || p.text;
      const why = sanitize(fields.why) || split.why;
      lines.push("- " + sentence(ask));
      if (why) lines.push("  Why: " + sentence(why));
      else if (p.gap) lines.push("  Why: not yet written in plain terms.");
      else noWhy.push(card.id);
      // The one place an id appears, because it is what he must literally send.
      lines.push("  Reply: R " + card.id + " default");
    }
  }

  // 3. WAITING ON OTHERS. Who owes what, in plain words, days outstanding.
  if (view.waitingOnOthers.length > 0) {
    lines.push("");
    lines.push("WAITING ON OTHERS");
    for (const entry of view.waitingOnOthers) {
      const card = byId.get(entry.id);
      const p = card ? describe(card) : { text: "" };
      const days = entry.days_outstanding;
      const age = days === null ? "" : ", " + plural(days, "day", "days") + " so far";
      const who = sanitize(entry.owed_by) || "someone else";
      const what = (splitPlain(p.text).what || "an outstanding item").replace(/[\s.]+$/, "");
      lines.push("- " + who + ": " + sentence(what + age));
    }
  }

  // 4. NOT STARTED. One line, what it needs first.
  if (view.unreachable.length > 0) {
    lines.push("");
    lines.push("NOT STARTED");
    for (const entry of view.unreachable) {
      const card = byId.get(entry.id);
      const p = card ? describe(card) : { text: "" };
      const blockers = (entry.missing || [])
        .map((id) => {
          const dep = byId.get(id);
          return dep ? splitPlain(describe(dep).text).what : "";
        })
        .filter(Boolean);
      const needs = blockers.length ? " Needs first: " + sentence(blockers.join("; ")) : "";
      lines.push("- " + sentence(splitPlain(p.text).what || "a later task") + needs);
    }
  }

  // 5. Progress.
  const total = cards.length;
  const done = cards.filter((c) => c.status === "shipped").length;
  const gate = board.launch_gate || {};
  const gatePassed = gate.readiness_passed || 0;
  const gateTotal = gate.denominator || 9;
  lines.push("");
  lines.push(done + " of " + total + " tasks done. " + gatePassed + " of " + gateTotal + " launch conditions met.");

  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, gaps, noWhy, needsYou: needsYou.length > 0, words: wordCount(text) };
}

// ---------------------------------------------------------------------------
// The assertion. Run against the rendered text, in the test and at send time.
// Prose is checked; the literal reply line is exempt because it is the payload
// Ivan copies rather than a reference he decodes.
// ---------------------------------------------------------------------------
// Jargon that can only arrive through a flagged fallback title. Reported as a
// warning rather than a failure: the fix is a plain field on the card, not a
// regex here mangling the title into something less true.
export function jargonWarnings(text) {
  const prose = text.split("\n").filter((l) => !/^\s*Reply:\s*R\s/.test(l)).join("\n");
  const hits = prose.match(/\b(quality|CI|workflow|merge|branch|commit|claim|lock|worktree|migration|RLS|schema|endpoint|webhook)\b/gi);
  return hits ? [...new Set(hits.map((h) => h.toLowerCase()))] : [];
}

export function assertPlain(text) {
  const prose = text
    .split("\n")
    .filter((line) => !/^\s*Reply:\s*R\s/.test(line))
    .join("\n");

  const violations = [];
  const check = (re, name) => {
    const hits = prose.match(re);
    if (hits && hits.length) violations.push(name + ": " + [...new Set(hits)].join(", "));
  };
  check(CARD_ID, "card id");
  check(RULING_ID, "ruling id");
  check(PR_NUMBER, "PR number");
  check(/https?:\/\//g, "link");
  check(/\/Users\/\S+/g, "file path");
  return violations;
}

// ---------------------------------------------------------------------------
const args = (() => {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (n === undefined || n.startsWith("--")) a[k] = "true";
    else {
      a[k] = n;
      i += 1;
    }
  }
  return a;
})();

// Only when run directly, so notify.mjs can import this without triggering it.
const RUN_DIRECTLY =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (RUN_DIRECTLY && args.board) {
  const board = JSON.parse(readFileSync(args.board, "utf8"));
  const state = args.state ? JSON.parse(readFileSync(args.state, "utf8")) : {};
  const result = buildPlainDigest(board, state, { cards: args.cards });
  console.log(result.text);
  if (args.assert === "true") {
    const violations = assertPlain(result.text);
    const warnings = jargonWarnings(result.text);
    console.log("\n--- assertion ---");
    console.log("words: " + result.words + (result.needsYou ? " (needs him, 150 cap lifted)" : " / 150"));
    console.log("cards with no plain field: " + result.gaps.length);
    if (result.noWhy.length) console.log("needs-you cards whose plain has no why sentence: " + result.noWhy.length);
    if (warnings.length) console.log("WARN jargon via fallback titles: " + warnings.join(", "));
    if (violations.length === 0) {
      console.log("PASS: zero card ids, ruling ids, PR numbers, links or file paths in prose");
    } else {
      console.log("FAIL:");
      for (const v of violations) console.log("  " + v);
      process.exit(1);
    }
  }
}
