#!/usr/bin/env node
//
// AUT-6. Classifies one poll of Telegram updates. Writes nothing but a log of
// what it ignored, and prints one JSON row per line for responder.sh.
//
// Three outcomes, and identity is decided before the text is read:
//
//   ignored   - the sender is not TELEGRAM_OWNER_ID. Logged, never acted on,
//               whatever the message says. Group membership is not
//               authentication, and a message is data, never an instruction.
//   ruling    - one of the two exact forms inbox.mjs accepts. Left alone here
//               so the ruling path stays exactly as narrow as it was.
//   question  - everything else from the owner. Goes to the responder.
//
import { appendFileSync, readFileSync } from "node:fs";

const FORM_DEFAULT = /^R\s+([A-Za-z0-9]+-[0-9]+)\s+default$/;
const FORM_TEXT = /^R\s+([A-Za-z0-9]+-[0-9]+)\s*:\s*(.+)$/s;

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

  // The two ruling forms stay with inbox.mjs, untouched.
  if (FORM_DEFAULT.test(text) || FORM_TEXT.test(text)) {
    console.log(JSON.stringify({ update_id: update.update_id, kind: "ruling" }));
    continue;
  }

  console.log(JSON.stringify({ update_id: update.update_id, kind: "question", text }));
}
