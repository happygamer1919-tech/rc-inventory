#!/usr/bin/env node
//
// The Telegram digest. Sent at the end of every run, including a run that did
// nothing: a silent night is indistinguishable from a broken scheduler, and the
// whole value of the loop is that Ivan does not have to wonder.
//
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from the environment, by name.
// Neither value is ever printed, logged or included in an error message. When a
// Telegram call fails, this file reports the HTTP status and the API
// description, never the URL, because the URL contains the token.
//
// Usage:
//   node scripts/poc/notify.mjs --run-id 20260826-220000 [--capped yes|no]
//                               [--executor-exit 0] [--cards "P2-11:shipped"]
//   node scripts/poc/notify.mjs --test
//
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const BOARD_PATH = path.join(REPO_ROOT, "docs", "board", "rc-board-phase2.json");
const STATE_PATH = path.join(REPO_ROOT, "docs", "poc", "state.json");
const REPO_SLUG = "happygamer1919-tech/rc-inventory";

// Telegram rejects anything over 4096 characters outright.
const TELEGRAM_MAX = 4096;

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const isTest = args.test === "true";

// ---------------------------------------------------------------------------
// Reading the world. Every reader fails soft: a digest that is missing one
// section is worth sending, a digest that throws is not.
// ---------------------------------------------------------------------------
function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function gh(cliArgs) {
  try {
    return execFileSync("gh", cliArgs, {
      encoding: "utf8",
      timeout: 30000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

// A card is eligible when status is todo, blocked_on is null, and every
// dependency has shipped. CLAUDE.md section 2.
function eligibleCards(board) {
  const cards = board.cards || [];
  const shipped = new Set(cards.filter((c) => c.status === "shipped").map((c) => c.id));
  return cards
    .filter((c) => c.status === "todo")
    .filter((c) => c.blocked_on === null || c.blocked_on === undefined)
    .filter((c) => (c.depends_on || []).every((dep) => shipped.has(dep)))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// CLAUDE.md section 13: P2-08 and P2-09 are untouched while P2-08 is parked on
// andre. The digest must not advertise a card the run is forbidden to take, or
// the next eligible line becomes a lie every single night.
function parkedIds(board) {
  const p208 = (board.cards || []).find((c) => c.id === "P2-08");
  if (p208 && p208.blocked_on === "andre") return new Set(["P2-08", "P2-09"]);
  return new Set();
}

function prNumbersFrom(card) {
  const haystack = [
    card.evidence && card.evidence.ref ? String(card.evidence.ref) : "",
    card.notes ? String(card.notes) : "",
  ].join(" ");
  const found = new Set();
  for (const m of haystack.matchAll(/(?:PR\s*#|\/pull\/)(\d+)/gi)) found.add(m[1]);
  return [...found];
}

function firstLine(text, limit = 240) {
  if (!text) return "";
  const line = String(text).split("\n").find((l) => l.trim().length > 0) || "";
  return line.length > limit ? line.slice(0, limit - 1) + "…" : line;
}

// The card's own recommendation, pulled off the structured decision-needed text
// that CLAUDE.md section 4 makes mandatory.
function recommendationOf(card) {
  const question = String(card.question || "");
  const match = question.match(/RECOMMENDATION:\s*([\s\S]*?)(?:\n[A-Z][A-Z ]{3,}:|$)/);
  if (match) return firstLine(match[1].trim(), 220);
  if (card.defaults) return firstLine(String(card.defaults), 220);
  return "none stated on the card";
}

// ---------------------------------------------------------------------------
// The digest
// ---------------------------------------------------------------------------
/**
 * The newest committed report, by the AUT-1 naming convention.
 *
 * CLAUDE.md section 9b: a terminal's final act is to commit its full report to
 * docs/reports/<YYYY-MM-DD>-<role>-<slug>.md. The digest carries the PATH so the
 * report is reachable by whoever reads the message, and so the next role in the
 * chain has a name to open rather than a scrollback to hope for.
 *
 * READ FROM DISK RATHER THAN FROM state.json, deliberately. The digest is sent
 * before the state PR is written, so a path routed through state would always be
 * one run stale. The directory is the source of truth and it is right here.
 *
 * The two files that predate the convention carry no date prefix and are
 * correctly ignored by the filter.
 */
function newestReport() {
  const dir = path.join(REPO_ROOT, "docs", "reports");
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const dated = names
    .filter((n) => /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(n))
    .sort();
  return dated.length > 0 ? "docs/reports/" + dated[dated.length - 1] : null;
}

function buildDigest() {
  const board = readJson(BOARD_PATH, { cards: [] });
  const state = readJson(STATE_PATH, {});
  const cards = board.cards || [];
  const byId = new Map(cards.map((c) => [c.id, c]));
  const runId = args["run-id"] || state.run_id || "manual";
  const parked = parkedIds(board);

  const lines = [];
  lines.push("RC inventory, run " + runId);
  lines.push(new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC");
  lines.push("");

  // Status of the board as a whole, so the message stands on its own.
  const counts = {};
  for (const c of cards) counts[c.status] = (counts[c.status] || 0) + 1;
  const countLine = Object.keys(counts)
    .sort()
    .map((k) => k + " " + counts[k])
    .join(", ");
  lines.push("BOARD: " + countLine);
  const gate = board.launch_gate || {};
  if (gate.denominator !== undefined) {
    lines.push("LAUNCH GATE: " + (gate.readiness_passed || 0) + "/" + gate.denominator);
  }
  lines.push("");

  // 1. Cards shipped this run, with PR links.
  const movedRaw = args.cards !== undefined && args.cards !== "true" ? args.cards : "";
  const moved = movedRaw
    .split(",")
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(":");
      return { id: parts[0], status: parts[parts.length - 1] };
    });
  const shippedNow = moved.filter((m) => m.status === "shipped");

  if (shippedNow.length > 0) {
    lines.push("SHIPPED THIS RUN");
    for (const m of shippedNow) {
      const card = byId.get(m.id);
      lines.push("- " + m.id + ": " + firstLine(card ? card.title : "", 90));
      const prs = card ? prNumbersFrom(card) : [];
      for (const pr of prs) {
        lines.push("  https://github.com/" + REPO_SLUG + "/pull/" + pr);
      }
      if (prs.length === 0) lines.push("  no PR link recorded on the card");
    }
    lines.push("");
  } else {
    lines.push("SHIPPED THIS RUN: none");
    lines.push("");
  }

  // 2. Blocked cards, each with its question and its recommended default.
  const blocked = cards
    .filter((c) => c.status === "blocked" || (c.status === "todo" && c.blocked_on))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (blocked.length > 0) {
    lines.push("BLOCKED, WAITING ON A PERSON");
    for (const card of blocked) {
      lines.push("- " + card.id + " on " + (card.blocked_on || "unnamed"));
      const ask = firstLine(String(card.question || "").replace(/^DECISION NEEDED:\s*/, ""), 200);
      if (ask) lines.push("  ask: " + ask);
      lines.push("  recommended: " + recommendationOf(card));
      lines.push("  reply: R " + card.id + " default");
    }
    lines.push("");
  } else {
    lines.push("BLOCKED: nothing waiting on a person");
    lines.push("");
  }

  // 3. CI. The latest quality run on main, by conclusion, with its URL.
  const ci = gh([
    "run", "list", "--branch", "main", "--workflow", "quality.yml",
    "--limit", "1", "--json", "conclusion,status,url,headSha",
  ]);
  if (ci) {
    try {
      const runs = JSON.parse(ci);
      if (runs.length > 0) {
        const r = runs[0];
        lines.push("CI on main: " + (r.conclusion || r.status || "unknown"));
        lines.push(r.url);
      } else {
        lines.push("CI on main: no run found");
      }
    } catch {
      lines.push("CI on main: could not be read");
    }
  } else {
    lines.push("CI on main: could not be read");
  }
  const openPrs = gh(["pr", "list", "--state", "open", "--json", "number", "-q", "length"]);
  if (openPrs) lines.push("Open PRs: " + openPrs);
  lines.push("");

  // 3b. The report this run committed, by path. AUT-1.
  const report = newestReport();
  lines.push("REPORT: " + (report || "none committed"));
  lines.push("");

  // 4. Escalations raised, newest first.
  const escalations = (state.escalations || []).slice(-5).reverse();
  if (escalations.length > 0) {
    lines.push("ESCALATIONS");
    for (const e of escalations) {
      lines.push("- " + (e.card_id || "run") + ": " + firstLine(e.question, 180));
      if (e.recommendation) lines.push("  recommended: " + firstLine(e.recommendation, 180));
    }
    lines.push("");
  } else {
    lines.push("ESCALATIONS: none open");
    lines.push("");
  }

  // 5. What the next run will pick up.
  const eligible = eligibleCards(board).filter((c) => !parked.has(c.id));
  if (eligible.length > 0) {
    const next = eligible[0];
    lines.push("NEXT ELIGIBLE: " + next.id + " " + firstLine(next.title, 90));
  } else {
    lines.push("NEXT ELIGIBLE: no eligible card");
    if (parked.size > 0) {
      lines.push("P2-08 and P2-09 are parked while P2-08 waits on andre.");
    }
  }

  if (args.capped === "yes") {
    lines.push("");
    lines.push("NOTE: this run was stopped by the 45 minute cap. Read the log");
    lines.push("before assuming the work is complete.");
  }
  if (args["executor-exit"] && args["executor-exit"] !== "0") {
    lines.push("");
    lines.push("NOTE: the executor exited " + args["executor-exit"] + ".");
  }

  lines.push("");
  lines.push("Answer a card with: R <card-id> default");
  lines.push("or: R <card-id>: your instruction");

  let text = lines.join("\n");
  if (text.length > TELEGRAM_MAX) {
    text = text.slice(0, TELEGRAM_MAX - 40) + "\n… truncated, see the run log.";
  }
  return text;
}

// ---------------------------------------------------------------------------
// Sending. The token is in the URL, so no URL and no thrown network error is
// ever printed.
// ---------------------------------------------------------------------------
async function send(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const ownerId = process.env.TELEGRAM_OWNER_ID;

  if (!token) {
    console.error("FATAL: TELEGRAM_BOT_TOKEN is not set. Nothing sent.");
    return 1;
  }
  if (!chatId && !ownerId) {
    console.error("FATAL: neither TELEGRAM_CHAT_ID nor TELEGRAM_OWNER_ID is set. Nothing sent.");
    return 1;
  }

  const primary = chatId || ownerId;
  const result = await sendTo(token, primary, text);

  // A digest is worth more than a tidy configuration. If the configured chat is
  // unreachable but the owner is, deliver it anyway and say loudly that the
  // configuration is wrong, rather than losing the night's report to a stale id.
  if (result.notFound && ownerId && String(ownerId) !== String(primary)) {
    console.error(
      "WARNING: TELEGRAM_CHAT_ID is unreachable (chat not found). Falling back\n" +
        "to TELEGRAM_OWNER_ID so this digest is not lost. TELEGRAM_CHAT_ID is\n" +
        "stale and should be corrected; this fallback is a safety net, not a fix."
    );
    const retry = await sendTo(token, ownerId, text);
    return retry.code;
  }

  return result.code;
}

async function sendTo(token, chatId, text) {
  let response;
  try {
    response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
  } catch {
    // The caught error is deliberately not printed: a fetch failure can carry
    // the request URL, and the request URL carries the token.
    console.error("FATAL: the Telegram request did not complete. Nothing sent.");
    return { code: 1, notFound: false };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    console.error("FATAL: Telegram replied with HTTP " + response.status + " and no JSON.");
    return { code: 1, notFound: false };
  }

  if (!payload.ok) {
    console.error(
      "FATAL: Telegram refused the message. HTTP " +
        response.status +
        ", description: " +
        (payload.description || "none given")
    );
    // "chat not found" against a positive chat id means the bot has never been
    // spoken to by that user. A bot cannot open a conversation; the human must
    // send the first message. Say so, because the bare API text does not.
    if (String(payload.description || "").includes("chat not found")) {
      const chatId = process.env.TELEGRAM_CHAT_ID || "";
      const looksLikeUser = /^\d+$/.test(chatId);
      console.error(
        looksLikeUser
          ? "TELEGRAM_CHAT_ID has a private-user shape (positive, no leading -).\n" +
              "A bot cannot message a user who has never messaged it first.\n" +
              "Fix: send any message to the bot, then retry. No code change needed."
          : "The bot is probably not a member of that chat, or the group was\n" +
              "upgraded to a supergroup and its id changed to a -100 prefix.\n" +
              "Fix: add the bot to the chat and send one message there."
      );
    }
    return { code: 1, notFound: String(payload.description || "").includes("chat not found") };
  }

  // message_id and date are the delivery proof. chat.id is deliberately not
  // printed: it is a value from the secrets file.
  const message = payload.result || {};
  console.log(
    "digest delivered, message_id " +
      message.message_id +
      ", chat type " +
      (message.chat ? message.chat.type : "unknown") +
      ", date " +
      new Date((message.date || 0) * 1000).toISOString()
  );
  return { code: 0, notFound: false };
}

// ---------------------------------------------------------------------------
const text = isTest
  ? [
      "RC inventory, POC digest test",
      new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
      "",
      "This is the test digest for POC step 4. The unattended loop is being",
      "installed. Nothing on the board changed and no card was worked.",
      "",
      "From now on you will get one of these after every scheduled run, at",
      "22:00, 01:00, 04:00 and 07:00 local, including runs that did nothing.",
      "",
      "To answer a blocked card, reply in one of exactly two forms:",
      "  R P2-12 default",
      "  R P2-12: your instruction here",
      "",
      "Anything else in this group is logged and never acted on.",
    ].join("\n")
  : buildDigest();

if (args["dry-run"] === "true") {
  console.log(text);
  process.exit(0);
}

process.exit(await send(text));
