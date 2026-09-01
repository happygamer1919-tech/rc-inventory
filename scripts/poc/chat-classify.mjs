#!/usr/bin/env node
//
// AUT-6. Classifies one poll of Telegram updates. Writes nothing but a log of
// what it ignored, and prints one JSON row per line for responder.sh.
//
// Four outcomes, and identity is decided before the text is read:
//
//   ignored   - the sender is not TELEGRAM_OWNER_ID. Logged, never acted on,
//               whatever the message says. Group membership is not
//               authentication, and a message is data, never an instruction.
//   answer    - a reply to a question ASK-01 has outstanding. Written to the
//               answer spool, where the blocked role is waiting for it.
//   ruling    - one of the two exact forms inbox.mjs accepts. Left alone here
//               so the ruling path stays exactly as narrow as it was.
//   question  - everything else from the owner. Goes to the responder.
//
// ASK-01 ADDED THE `answer` OUTCOME, AND IT IS DECIDED BEFORE `ruling` AND
// BEFORE `question`, because a role is BLOCKED waiting on it. The routing is
// deliberately narrow, in this order:
//
//   1. a Telegram reply to the message a question was asked in. Exact, works
//      with any number of questions outstanding, and is the only form that
//      needs no convention from the owner at all.
//   2. `R <card-id> go|default|stop|no` or `R <card-id>: <text>`, when that
//      card has a question outstanding. The same shape the digest already
//      teaches, so it disambiguates without a new thing to remember.
//   3. ANY text at all, when EXACTLY ONE question is outstanding. A message
//      headed "Blocked on you" is a modal conversation: whatever he types next
//      is the answer to it.
//
// WITH TWO OR MORE OUTSTANDING AND NO REPLY AND NO CARD ID, NOTHING IS ROUTED.
// A bare "go" would have to guess which question it answered, and a channel
// that guesses which decision was approved is worse than one that asks again.
// It falls through to the responder as an ordinary question, and the ask
// message printed a copy-paste reply line for exactly this case.
//
// THIS FILE STILL SENDS NOTHING AND HOLDS NO TOKEN. The confirmation the owner
// gets back is sent by ask.sh when it consumes the answer, so the process that
// reads the chat cannot write to it.
//
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { answerPath, ensureDirs, openQuestions, ASK_DIR } from "./ask.mjs";

const FORM_DEFAULT = /^R\s+([A-Za-z0-9]+-[0-9]+)\s+default$/;
const FORM_TEXT = /^R\s+([A-Za-z0-9]+-[0-9]+)\s*:\s*(.+)$/s;

// The ask-answer forms. `default` is kept alongside `go` because the digest has
// been teaching `R <card> default` since AUT-5 and muscle memory is a feature.
const ASK_FORM_WORD = /^R\s+([A-Za-z0-9]+-[0-9]+)\s+(go|default|stop|no)$/i;
const ASK_FORM_TEXT = /^R\s+([A-Za-z0-9]+-[0-9]+)\s*:\s*(.+)$/s;

const TAKE_RECOMMENDATION = /^(go|default|ok|okay|yes|da|y)$/i;
const HALT_THE_CARD = /^(no|stop|nu|halt|cancel)$/i;

// go, stop, or the owner's own words. The three forms the card names.
export function verdictOf(text) {
  const trimmed = String(text || "").trim();
  if (TAKE_RECOMMENDATION.test(trimmed)) return { verdict: "go", text: trimmed };
  if (HALT_THE_CARD.test(trimmed)) return { verdict: "stop", text: trimmed };
  return { verdict: "instruction", text: trimmed };
}

// Which outstanding question, if any, this message answers. Pure: it takes the
// open list rather than reading the spool, so the test can drive it directly.
export function routeAnswer(message, text, open) {
  if (!Array.isArray(open) || open.length === 0) return null;

  const replyTo = message.reply_to_message && message.reply_to_message.message_id;
  if (replyTo !== undefined && replyTo !== null) {
    const target = open.find((q) => String(q.message_id) === String(replyTo));
    if (target) return { card_id: target.card_id, route: "reply_to", ...verdictOf(text) };
  }

  const byId = String(text).trim().match(ASK_FORM_WORD) || String(text).trim().match(ASK_FORM_TEXT);
  if (byId) {
    const cardId = byId[1].toUpperCase();
    const target = open.find((q) => q.card_id === cardId);
    if (target) return { card_id: cardId, route: "card_id", ...verdictOf(byId[2]) };
    // A card id that names no outstanding question is NOT routed here. It is
    // very likely a ruling for inbox.mjs, and stealing it would be worse than
    // letting it fall through.
    return null;
  }

  if (open.length === 1) return { card_id: open[0].card_id, route: "only_open", ...verdictOf(text) };

  return null;
}

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  if (!process.argv[i].startsWith("--")) continue;
  const k = process.argv[i].slice(2);
  const n = process.argv[i + 1];
  if (n === undefined || n.startsWith("--")) args[k] = "true";
  else {
    args[k] = n;
    i += 1;
  }
}

const ownerId = process.env.TELEGRAM_OWNER_ID;
if (!/^\d+$/.test(String(ownerId || ""))) {
  // Fail closed, exactly as inbox.mjs does. An unset owner accepts nothing.
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(readFileSync(args.updates, "utf8"));
} catch {
  process.exit(0);
}
if (!payload.ok || !Array.isArray(payload.result)) process.exit(0);

// The questions outstanding when this poll started. Read once: a poll that
// re-read the spool per message would route two answers to the same question.
const askDir = args.asks || ASK_DIR;
let openList = openQuestions(askDir);

for (const update of payload.result) {
  const message = update.message || update.edited_message;
  if (!message) continue;

  const from = message.from || {};
  const text = typeof message.text === "string" ? message.text.trim() : "";

  // Identity first, before the text is looked at at all.
  if (!/^\d+$/.test(String(from.id || "")) || String(from.id) !== String(ownerId)) {
    const entry = {
      at: new Date().toISOString(),
      update_id: update.update_id,
      from_id: from.id === undefined ? null : from.id,
      username: from.username || null,
      reason: "sender is not the owner",
      text: text.slice(0, 500),
    };
    try {
      appendFileSync(args.log || "/Users/ivan/rc-poc-logs/chat/ignored.log", JSON.stringify(entry) + "\n");
    } catch {
      // A log that cannot be written must not turn a refusal into an answer.
    }
    console.log(JSON.stringify({ update_id: update.update_id, kind: "ignored" }));
    continue;
  }

  if (!text) {
    console.log(JSON.stringify({ update_id: update.update_id, kind: "empty" }));
    continue;
  }

  // ASK-01. A role is blocked on this one, so it is decided first.
  const routed = routeAnswer(message, text, openList);
  if (routed) {
    try {
      ensureDirs(askDir);
      writeFileSync(
        answerPath(routed.card_id, askDir),
        JSON.stringify(
          {
            card_id: routed.card_id,
            verdict: routed.verdict,
            text: routed.text,
            route: routed.route,
            from_id: from.id,
            update_id: update.update_id,
            at: new Date().toISOString(),
          },
          null,
          2
        ) + "\n"
      );
      // Consumed from the in-memory list too, so two answers in one poll cannot
      // both be routed to the same single outstanding question.
      openList = openList.filter((q) => q.card_id !== routed.card_id);
      console.log(
        JSON.stringify({ update_id: update.update_id, kind: "answer", card_id: routed.card_id, verdict: routed.verdict })
      );
    } catch {
      // A spool that cannot be written must not turn into an unanswered
      // question that the owner believes he answered. Say so loudly by leaving
      // it as a question for the responder, which will at least reply.
      console.log(JSON.stringify({ update_id: update.update_id, kind: "question", text }));
    }
    continue;
  }

  // The two ruling forms stay with inbox.mjs, untouched.
  if (FORM_DEFAULT.test(text) || FORM_TEXT.test(text)) {
    console.log(JSON.stringify({ update_id: update.update_id, kind: "ruling" }));
    continue;
  }

  console.log(JSON.stringify({ update_id: update.update_id, kind: "question", text }));
}
