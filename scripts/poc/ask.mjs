#!/usr/bin/env node
//
// ASK-01. The node half of the blocking question channel.
//
// scripts/poc/ask.sh owns the wall clock, the secrets and the git commit. This
// file owns everything else: rendering the message, sending it, recording the
// open question, reading an answer off the spool, and writing an expired
// question onto its card.
//
// WHY THE ANSWER ARRIVES THROUGH A SPOOL AND NOT THROUGH getUpdates.
//
// Telegram's getUpdates is DESTRUCTIVE. Acknowledging an offset deletes every
// update below it server side, so two processes polling the same bot do not
// share a queue, they race for it and the loser never sees the message. The
// responder already polls every 60 seconds and already acknowledges everything
// it reads. An ask.sh that also called getUpdates would lose the owner's answer
// to the responder within a minute, or take the responder's questions away from
// it, depending on which one won the race.
//
// So exactly one process reads Telegram, and it is the one that already did:
// chat-classify.mjs, invoked by responder.sh. It writes an answer file into the
// spool; this file reads it. Nothing else changes about the responder, and an
// already installed responder.sh needs no reinstall for the answer path to
// work, because it skips every classified kind that is not `question` already.
//
// Usage:
//   node ask.mjs open    --card P2-13 --question ... --recommendation ...
//                        --if-silent ... --deadline-epoch 1700000000
//   node ask.mjs poll    --card P2-13
//   node ask.mjs confirm --card P2-13 --verdict go
//   node ask.mjs expire  --card P2-13 --board <path> [--board <path> ...]
//   node ask.mjs render  --card P2-13 --question ... (prints, sends nothing)
//
import {
  appendFileSync,
  existsSync,
  realpathSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPlain, sanitize } from "./plain-digest.mjs";

export const ASK_DIR = process.env.POC_ASK_DIR || "/Users/ivan/rc-poc-logs/asks";
export const OPEN_DIR = path.join(ASK_DIR, "open");
export const ANSWER_DIR = path.join(ASK_DIR, "answers");
export const ARCHIVE_DIR = path.join(ASK_DIR, "answered");

// The four exit codes ask.sh turns into its own. Documented in CLAUDE.md.
export const VERDICT_GO = "go";
export const VERDICT_STOP = "stop";
export const VERDICT_INSTRUCTION = "instruction";

function log(message) {
  console.error("[ask] " + message);
}

export function ensureDirs(base = ASK_DIR) {
  for (const dir of [base, path.join(base, "open"), path.join(base, "answers"), path.join(base, "answered")]) {
    mkdirSync(dir, { recursive: true });
  }
}

function parseArgs(argv) {
  const args = {};
  const repeated = { board: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    const value = next === undefined || next.startsWith("--") ? "true" : next;
    if (value !== "true") i += 1;
    if (key === "board") repeated.board.push(value);
    else args[key] = value;
  }
  args.boards = repeated.board;
  return args;
}

// ---------------------------------------------------------------------------
// The spool. One file per open question, named by card id, so a second ask on
// the same card replaces the first rather than accumulating two questions the
// owner cannot tell apart.
// ---------------------------------------------------------------------------
export function openPath(cardId, base = ASK_DIR) {
  return path.join(base, "open", cardId.toUpperCase() + ".json");
}

export function answerPath(cardId, base = ASK_DIR) {
  return path.join(base, "answers", cardId.toUpperCase() + ".json");
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// Every question currently outstanding, oldest first. Read by chat-classify.mjs
// to route a reply, and by the digest to lead with what is still waiting.
export function openQuestions(base = ASK_DIR) {
  const dir = path.join(base, "open");
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const q = readJson(path.join(dir, name));
    if (q && q.card_id) out.push(q);
  }
  out.sort((a, b) => String(a.asked_at || "").localeCompare(String(b.asked_at || "")));
  return out;
}

// ---------------------------------------------------------------------------
// The message. Plain register, exactly as AUT-5 defined it: no card mechanics,
// no pull request numbers, no CI, nothing he cannot act on.
//
// THE ONE EXEMPT LINE is a `Reply: R <card-id> go` line, and it is only printed
// when more than one question is outstanding, because that is the only case
// where "go" on its own cannot be routed. It is the same exemption the digest
// takes and for the same reason: it is a payload he copies, not a reference he
// decodes.
// ---------------------------------------------------------------------------
export function renderAsk(payload, opts = {}) {
  const question = sanitize(payload.question);
  const recommendation = sanitize(payload.recommendation);
  const ifSilent = sanitize(payload.if_silent);

  const lines = ["Blocked on you.", question, "My recommendation: " + recommendation];

  // WHAT HAPPENS IF HE SAYS NOTHING IS IN THE MESSAGE, and the dispatch's four
  // line shape did not show it. It is a required payload field, and a message
  // headed "Blocked on you" that does not say what silence costs is exactly the
  // message that gets left unread. Deviation recorded in the card notes.
  if (ifSilent) {
    const by = opts.deadlineLabel ? " by " + opts.deadlineLabel : "";
    lines.push("If I hear nothing" + by + ": " + ifSilent);
  }

  lines.push('Reply "go" to take the recommendation, or reply with what to do instead.');

  if (opts.ambiguous) {
    lines.push("Reply: R " + String(payload.card_id).toUpperCase() + " go");
  }

  return lines.join("\n");
}

// Local time, because the deadline is a wall clock promise made to a person in
// a timezone, not a timestamp for a log.
export function deadlineLabel(deadlineEpoch, nowMs = Date.now()) {
  const at = new Date(deadlineEpoch * 1000);
  const sameDay = at.toDateString() === new Date(nowMs).toDateString();
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  return sameDay ? hh + ":" + mm + " today" : hh + ":" + mm + " tomorrow";
}

// ---------------------------------------------------------------------------
// Telegram. Same discipline as notify.mjs: the token is in the URL, so no URL
// and no caught error is ever printed.
// ---------------------------------------------------------------------------
async function sendMessage(text) {
  // THE TEST SEAM, AND IT IS DELIBERATE. scripts/poc/test-ask-digest.sh runs the
  // real ask.sh end to end: the real deadline loop, the real spool, the real
  // board write, the real commit and the real exit codes. Every one of those is
  // worth proving and none of them can be proved through a stub of ask.sh.
  // What cannot run in CI is the HTTPS call, so that one call is redirected to a
  // file and everything else stays real.
  //
  // IT ANNOUNCES ITSELF ON EVERY CALL. An outbox left set in a launchd
  // environment would mean the owner silently stops being asked anything, which
  // is precisely the failure this card exists to remove, so it is never quiet
  // about being on.
  const outbox = process.env.POC_ASK_OUTBOX;
  if (outbox) {
    log("OUTBOX MODE: nothing was sent to Telegram, the message went to a file");
    let count = 0;
    try {
      count = readFileSync(outbox, "utf8").split("\n").filter(Boolean).length;
    } catch {
      count = 0;
    }
    const messageId = 1000 + count;
    appendFileSync(outbox, JSON.stringify({ at: new Date().toISOString(), message_id: messageId, text }) + "\n");
    return { message_id: messageId };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_OWNER_ID;
  if (!token) {
    log("FATAL: TELEGRAM_BOT_TOKEN is not set, nothing sent");
    return null;
  }
  if (!chatId) {
    log("FATAL: neither TELEGRAM_CHAT_ID nor TELEGRAM_OWNER_ID is set, nothing sent");
    return null;
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
    return null;
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    log("FATAL: Telegram replied HTTP " + response.status + " with no JSON");
    return null;
  }
  if (!payload.ok) {
    log("Telegram refused the message: HTTP " + response.status + ", " + (payload.description || "no description"));
    return null;
  }
  return payload.result || {};
}

// ---------------------------------------------------------------------------
// open. Sends the question and records it. The message_id comes back from
// Telegram and is stored, because a Telegram reply carries the id of the
// message it replies to and that is the only unambiguous way to route an answer
// when more than one question is outstanding.
// ---------------------------------------------------------------------------
async function cmdOpen(args) {
  const cardId = String(args.card || "").toUpperCase();
  const payload = {
    card_id: cardId,
    question: String(args.question || ""),
    recommendation: String(args.recommendation || ""),
    if_silent: String(args["if-silent"] || ""),
  };

  for (const [field, value] of Object.entries(payload)) {
    if (!value.trim()) {
      log("FATAL: --" + field.replace(/_/g, "-") + " is required and was empty");
      return 2;
    }
  }
  if (!/^[A-Z][A-Z0-9]{0,7}-[0-9]{1,3}[A-Za-z]?$/.test(cardId)) {
    log("FATAL: " + JSON.stringify(cardId) + " is not a card id");
    return 2;
  }

  const deadlineEpoch = Number(args["deadline-epoch"]);
  if (!Number.isFinite(deadlineEpoch) || deadlineEpoch <= 0) {
    log("FATAL: --deadline-epoch must be a positive epoch second");
    return 2;
  }

  ensureDirs();
  const alreadyOpen = openQuestions().filter((q) => q.card_id !== cardId);
  const text = renderAsk(payload, {
    deadlineLabel: deadlineLabel(deadlineEpoch),
    ambiguous: alreadyOpen.length > 0,
  });

  // The register is asserted, not trusted. A caller that pastes a card id or a
  // pull request number into its question gets refused here rather than sending
  // the owner something he has to decode.
  const violations = assertPlain(text);
  if (violations.length > 0) {
    log("FATAL: the question does not render in the plain register: " + violations.join("; "));
    return 2;
  }

  if (args["dry-run"] === "true") {
    console.log(text);
    return 0;
  }

  const sent = await sendMessage(text);
  if (sent === null) return 3;

  const record = {
    card_id: cardId,
    asked_at: new Date().toISOString(),
    deadline_epoch: deadlineEpoch,
    question: payload.question,
    recommendation: payload.recommendation,
    if_silent: payload.if_silent,
    message_id: sent.message_id === undefined ? null : sent.message_id,
    run_id: args["run-id"] || "manual",
    role: args.role || "unknown",
    rendered: text,
  };
  writeFileSync(openPath(cardId), JSON.stringify(record, null, 2) + "\n");
  log("question opened on " + cardId + ", message_id " + record.message_id);
  return 0;
}

// ---------------------------------------------------------------------------
// poll. One look at the spool, no waiting: ask.sh owns the clock.
//
// Prints the verdict word on the first line and, for an instruction, the
// owner's words verbatim on the lines after it. Exit 1 means no answer yet.
// ---------------------------------------------------------------------------
function cmdPoll(args) {
  const cardId = String(args.card || "").toUpperCase();
  const file = answerPath(cardId);
  if (!existsSync(file)) return 1;

  const answer = readJson(file);
  // THE VERDICT MUST BE ONE OF THE THREE, and an unknown one is not merely
  // logged, it leaves the question OPEN. Consuming an answer this file cannot
  // interpret would close the open record and then leave the expiry path with
  // nothing to write onto the card: the caller would get neither an answer nor a
  // blocked card, which is the one outcome worse than either.
  const KNOWN = [VERDICT_GO, VERDICT_STOP, VERDICT_INSTRUCTION];
  if (!answer || !KNOWN.includes(answer.verdict)) {
    ensureDirs();
    renameSync(file, path.join(ARCHIVE_DIR, cardId + "-" + Date.now() + ".unparseable.json"));
    log("an answer file for " + cardId + " did not parse or carried an unknown verdict, archived, the question stays open");
    return 1;
  }

  console.log(answer.verdict);
  if (answer.verdict === VERDICT_INSTRUCTION) console.log(String(answer.text || ""));

  ensureDirs();
  renameSync(file, path.join(ARCHIVE_DIR, cardId + "-" + Date.now() + ".json"));
  rmSync(openPath(cardId), { force: true });
  return 0;
}

// ---------------------------------------------------------------------------
// confirm. The loop closes visibly. chat-classify.mjs cannot do this: it runs
// without the bot token on purpose, so the process that reads the chat cannot
// write to it.
// ---------------------------------------------------------------------------
async function cmdConfirm(args) {
  const verdict = String(args.verdict || "");
  const text = String(args.text || "");
  let body;
  if (verdict === VERDICT_GO) body = "Got it. Going with my recommendation.";
  else if (verdict === VERDICT_STOP) body = "Got it. Stopping that one and leaving it for you.";
  else body = "Got it. Taking it as: " + sanitize(text);
  if (args["dry-run"] === "true") {
    console.log(body);
    return 0;
  }
  return (await sendMessage(body)) === null ? 3 : 0;
}

// ---------------------------------------------------------------------------
// expire. The whole point of the deadline.
//
// THE RECOMMENDATION IS NOT TAKEN. Silence is not consent: an owner who never
// saw the message and an owner who read it and approved it produce the same
// empty spool, and a channel that cannot tell them apart must choose the one
// that is recoverable. The question goes onto the card, blocked on him, with
// the full payload, and the harness moves to something else.
// ---------------------------------------------------------------------------
export function structuredQuestion(record) {
  return [
    "DECISION NEEDED: " + record.question,
    "",
    "CONTEXT: raised by the " + (record.role || "unknown") + " role in run " +
      (record.run_id || "manual") + " on " + String(record.asked_at || "").slice(0, 10) +
      ", sent to Ivan on Telegram, and unanswered when the " +
      Math.round((record.deadline_epoch - Math.floor(Date.parse(record.asked_at || 0) / 1000)) / 3600) +
      " hour deadline passed.",
    "",
    "OPTIONS: take the recommendation below, or reply with what to do instead.",
    "",
    "RECOMMENDATION: " + record.recommendation,
    "",
    "IMPACT IF UNANSWERED: " + record.if_silent,
  ].join("\n");
}

// lane is derived by docs/board/validate-board.mjs, never authored freely, so
// it is derived here by the same rule rather than guessed.
export function deriveLane(card) {
  if (card.status === "shipped") return "shipped";
  if (card.home_lane === "in_flight" && card.status === "blocked" && card.blocked_on === "ivan") {
    return "blocked_on_people";
  }
  return card.home_lane;
}

export function applyExpiry(board, record, nowIso) {
  const card = (board.cards || []).find((c) => c.id === record.card_id);
  if (!card) return null;
  card.status = "blocked";
  card.blocked_on = "ivan";
  card.question = structuredQuestion(record);
  card.last_checkpoint = nowIso;
  card.lane = deriveLane(card);
  card.notes =
    (card.notes ? card.notes.trimEnd() + "\n\n" : "") +
    "BLOCKED BY AN UNANSWERED QUESTION on " + nowIso.slice(0, 10) + ". The " +
    (record.role || "unknown") + " role asked Ivan on Telegram in run " +
    (record.run_id || "manual") + " and got no reply before the deadline. The " +
    "recommendation was NOT taken: silence is not consent, and an owner who " +
    "never saw the message looks identical to one who approved it.";
  board.as_of = nowIso.replace(/\.\d{3}Z$/, "Z");
  return card;
}

function cmdExpire(args) {
  const cardId = String(args.card || "").toUpperCase();
  const record = readJson(openPath(cardId));
  if (!record) {
    log("FATAL: no open question recorded for " + cardId);
    return 2;
  }
  const boards = args.boards.length > 0 ? args.boards : [];
  if (boards.length === 0) {
    log("FATAL: at least one --board is required");
    return 2;
  }

  const nowIso = new Date().toISOString();
  for (const boardPath of boards) {
    const board = readJson(boardPath);
    if (!board) continue;
    if (!applyExpiry(board, record, nowIso)) continue;
    writeFileSync(boardPath, JSON.stringify(board, null, 2) + "\n");
    ensureDirs();
    renameSync(openPath(cardId), path.join(ARCHIVE_DIR, cardId + "-" + Date.now() + ".expired.json"));
    // stdout is the board path, so ask.sh knows exactly what to stage.
    console.log(boardPath);
    log(cardId + " written blocked on ivan, the recommendation was NOT taken");
    return 0;
  }

  log("FATAL: no board named " + cardId);
  return 2;
}

// ---------------------------------------------------------------------------
async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (command) {
    case "open":
      return cmdOpen(args);
    case "poll":
      return cmdPoll(args);
    case "confirm":
      return cmdConfirm(args);
    case "expire":
      return cmdExpire(args);
    case "render":
      console.log(
        renderAsk(
          {
            card_id: args.card,
            question: args.question,
            recommendation: args.recommendation,
            if_silent: args["if-silent"],
          },
          { deadlineLabel: args["deadline-label"], ambiguous: args.ambiguous === "true" }
        )
      );
      return 0;
    default:
      log("usage: ask.mjs open|poll|confirm|expire|render");
      return 2;
  }
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
