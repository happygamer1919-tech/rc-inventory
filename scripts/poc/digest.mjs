#!/usr/bin/env node
//
// DIGEST-01. The scheduled plain digest.
//
// AUT-5 built the digest Ivan can read. It only ever went out when a work run
// finished, which means the report he gets is timed by the build cycle rather
// than by his day, and a night where nothing ran is a night he hears nothing
// and cannot tell that apart from a night where nothing happened.
//
// This sends it twice a day on a clock, from a launchd agent of its own, and
// SHUTS UP when there is nothing to say.
//
// WHY SILENCE IS A FEATURE AND NOT A MISSING ONE. A digest that arrives every
// morning saying the same thing is a digest that gets skimmed, then filed, then
// ignored, and the one that mattered is ignored with it. So it sends only when
// one of four things is true:
//
//   1. a card shipped since the last digest
//   2. a card became blocked since the last digest
//   3. a question is outstanding
//   4. a run failed, which is read as a new escalation in docs/poc/state.json
//
// AND AN OUTSTANDING QUESTION LEADS EVERY DIGEST UNTIL IT IS ANSWERED. That is
// deliberate nagging. An unanswered question is the one thing in this system
// that must never go quiet, because the whole loop is stopped behind it.
//
// Usage:
//   node digest.mjs decide --board B --state S           prints the verdict as JSON
//   node digest.mjs render --board B --state S           prints the text, sends nothing
//   node digest.mjs run    --board B --state S [--force] decides, sends, records
//
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlainDigest, assertPlain, sanitize } from "./plain-digest.mjs";
import { openQuestions, ASK_DIR } from "./ask.mjs";

const DEFAULT_DIGEST_STATE =
  process.env.POC_DIGEST_STATE || "/Users/ivan/rc-poc-logs/digest-state.json";

function log(message) {
  console.error("[digest] " + message);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = "true";
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// The signals. Everything the send decision turns on, and nothing else, so the
// decision can be tested without a board, a chat or a clock.
// ---------------------------------------------------------------------------
export function signalsOf(board, runState, openQs) {
  const cards = board.cards || [];
  const outstanding = new Set(openQs.map((q) => String(q.card_id).toUpperCase()));
  // A card the board says is blocked on Ivan is an outstanding question too,
  // whether or not it came through ask.sh. He owes an answer either way.
  for (const card of cards) {
    if (card.blocked_on === "ivan" && card.status === "blocked") outstanding.add(card.id);
  }

  let newestEscalation = "";
  for (const e of (runState && runState.escalations) || []) {
    const at = String(e.raised_at || "");
    if (at > newestEscalation) newestEscalation = at;
  }

  return {
    shipped: cards.filter((c) => c.status === "shipped").map((c) => c.id).sort(),
    blocked: cards.filter((c) => c.status === "blocked").map((c) => c.id).sort(),
    outstanding: [...outstanding].sort(),
    newest_escalation: newestEscalation,
  };
}

export function fingerprint(signals) {
  return createHash("sha256").update(JSON.stringify(signals)).digest("hex");
}

// ---------------------------------------------------------------------------
// The decision.
//
// STALENESS IS BY CONTENT, NEVER BY DATE. Two digests on the same day with
// different content are two different digests, and a date comparison would hide
// the second one. The fingerprint is over the signals themselves.
// ---------------------------------------------------------------------------
export function decide(signals, previous, opts = {}) {
  const reasons = [];
  const fp = fingerprint(signals);

  if (opts.force) {
    // A forced digest still reports what actually moved, when there is a
    // baseline to compare against. Forcing is for proving the channel works, and
    // a proof that says "nothing finished" when three cards shipped proves the
    // wrong thing.
    const wasShippedForced = new Set((previous && previous.shipped) || []);
    return {
      send: true,
      reasons: ["forced by hand"],
      fingerprint: fp,
      first: !previous,
      newly_shipped: previous ? signals.shipped.filter((id) => !wasShippedForced.has(id)) : [],
    };
  }

  // The first run has no baseline, so everything looks new. Record it and stay
  // quiet: a digest whose whole content is "here is the state of a system you
  // have been watching for a week" is the noise this card exists to remove. An
  // outstanding question or a failed run still speaks up, because those are
  // conditions rather than changes.
  if (!previous) {
    if (signals.outstanding.length > 0) reasons.push("a question is outstanding");
    if (signals.newest_escalation) reasons.push("a run failed");
    return {
      send: reasons.length > 0,
      reasons,
      fingerprint: fp,
      first: true,
      newly_shipped: [],
    };
  }

  const wasShipped = new Set(previous.shipped || []);
  const wasBlocked = new Set(previous.blocked || []);
  const newlyShipped = signals.shipped.filter((id) => !wasShipped.has(id));
  const newlyBlocked = signals.blocked.filter((id) => !wasBlocked.has(id));

  if (newlyShipped.length > 0) reasons.push("a card shipped");
  if (newlyBlocked.length > 0) reasons.push("a card became blocked");
  if (signals.outstanding.length > 0) reasons.push("a question is outstanding");
  if (signals.newest_escalation && signals.newest_escalation > (previous.newest_escalation || "")) {
    reasons.push("a run failed");
  }

  return { send: reasons.length > 0, reasons, fingerprint: fp, first: false, newly_shipped: newlyShipped };
}

// ---------------------------------------------------------------------------
// The outstanding-question block, which LEADS the digest.
//
// Rendered from the payload ask.sh already forced into the plain register, so
// there is nothing here to sanitize a second time beyond the standing rule that
// everything reaching him goes through sanitize().
// ---------------------------------------------------------------------------
export function renderOutstanding(openQs) {
  if (openQs.length === 0) return "";
  const lines = ["STILL WAITING ON YOU"];
  const ambiguous = openQs.length > 1;
  for (const q of openQs) {
    lines.push(sanitize(q.question));
    lines.push("My recommendation: " + sanitize(q.recommendation));
    if (q.if_silent) lines.push("If I hear nothing: " + sanitize(q.if_silent));
    if (ambiguous) lines.push("Reply: R " + String(q.card_id).toUpperCase() + " go");
    lines.push("");
  }
  if (!ambiguous) {
    lines.push('Reply "go" to take the recommendation, or reply with what to do instead.');
    lines.push("");
  }
  return lines.join("\n");
}

export function renderDigest(board, runState, openQs, verdict, nowMs = Date.now()) {
  const cardsArg = (verdict.newly_shipped || []).map((id) => id + ":shipped").join(",");
  const plain = buildPlainDigest(board, runState, { cards: cardsArg, nowMs });
  const head = renderOutstanding(openQs);
  const text = (head ? head + "\n" : "") + plain.text;
  return { text: text.trim(), gaps: plain.gaps, words: plain.words };
}

// ---------------------------------------------------------------------------
// Sending. Same discipline as notify.mjs: the token is in the URL, so no URL
// and no caught error is ever printed.
// ---------------------------------------------------------------------------
async function sendMessage(text) {
  // The same test seam ask.mjs documents, for the same reason and with the same
  // loud announcement. See the comment there.
  const outbox = process.env.POC_DIGEST_OUTBOX;
  if (outbox) {
    log("OUTBOX MODE: nothing was sent to Telegram, the digest went to a file");
    appendFileSync(outbox, JSON.stringify({ at: new Date().toISOString(), text }) + "\n");
    return true;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_OWNER_ID;
  if (!token || !chatId) {
    log("FATAL: the Telegram configuration is incomplete, nothing sent");
    return false;
  }
  let response;
  try {
    response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch {
    log("FATAL: the Telegram request did not complete");
    return false;
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    log("FATAL: Telegram replied HTTP " + response.status + " with no JSON");
    return false;
  }
  if (!payload.ok) {
    log("Telegram refused the digest: HTTP " + response.status + ", " + (payload.description || "no description"));
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  const boardPath = args.board;
  if (!boardPath) {
    log("FATAL: --board is required");
    return 2;
  }
  const board = readJson(boardPath, null);
  if (!board) {
    log("FATAL: the board did not parse: " + boardPath);
    return 2;
  }
  const runState = args.state ? readJson(args.state, {}) : {};
  const askDir = args.asks || ASK_DIR;
  const digestStatePath = args["digest-state"] || DEFAULT_DIGEST_STATE;
  const previous = readJson(digestStatePath, null);

  const openQs = openQuestions(askDir);
  const signals = signalsOf(board, runState, openQs);
  const verdict = decide(signals, previous, { force: args.force === "true" });

  if (command === "decide") {
    console.log(JSON.stringify({ ...verdict, signals }, null, 2));
    return 0;
  }

  const rendered = renderDigest(board, runState, openQs, verdict);
  const violations = assertPlain(rendered.text);

  if (command === "render") {
    console.log(rendered.text);
    if (violations.length > 0) {
      log("FAIL: " + violations.join("; "));
      return 1;
    }
    return 0;
  }

  if (command !== "run") {
    log("usage: digest.mjs decide|render|run --board <path> [--state <path>]");
    return 2;
  }

  if (!verdict.send) {
    log("silent: nothing changed and nothing is outstanding");
    // The baseline is still recorded, so the first digest after a quiet period
    // reports against what was actually true and not against a week ago.
    writeFileSync(
      digestStatePath,
      JSON.stringify({ ...signals, fingerprint: verdict.fingerprint, last_checked_at: new Date().toISOString(), last_sent_at: previous ? previous.last_sent_at || null : null }, null, 2) + "\n"
    );
    return 0;
  }

  // A digest that leaks a card id, a pull request number or a file path is not
  // sent. He gets nothing rather than something he has to decode, and the log
  // says why.
  if (violations.length > 0) {
    log("FATAL: the rendered digest is not in the plain register: " + violations.join("; "));
    return 1;
  }

  log("sending: " + verdict.reasons.join(", "));
  if (args["dry-run"] === "true") {
    console.log(rendered.text);
    return 0;
  }
  if (!(await sendMessage(rendered.text))) return 1;

  const at = new Date().toISOString();
  writeFileSync(
    digestStatePath,
    JSON.stringify({ ...signals, fingerprint: verdict.fingerprint, last_checked_at: at, last_sent_at: at, last_reasons: verdict.reasons }, null, 2) + "\n"
  );
  log("digest delivered");
  return 0;
}

// REAL PATHS ON BOTH SIDES, AND THAT IS NOT PEDANTRY. `import.meta.url` is
// already symlink-resolved; `process.argv[1]` is not. On macOS /var is a symlink
// to /private/var, so this file invoked by a path under /var compared unequal to
// itself, main() never ran, AND THE PROCESS EXITED 0. A caller reading that exit
// code sees a question that was sent and answered when nothing happened at all.
// Silent success is the worst failure this file could have.
function isEntryPoint(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

if (isEntryPoint(import.meta.url)) {
  main().then((code) => process.exit(code));
}
