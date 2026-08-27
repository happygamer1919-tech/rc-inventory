#!/usr/bin/env node
//
// AUT-6. Sends one answer back to the owner.
//
// Separate from notify.mjs on purpose: that file sends the scheduled digest and
// its failure modes belong to the work harness. This one belongs to the chat
// poller and must never be able to take the digest down with it.
//
// The token is in the request URL, so no URL and no caught network error is
// ever printed.
//
import { readFileSync } from "node:fs";

const TELEGRAM_MAX = 4096;

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

const token = process.env.TELEGRAM_BOT_TOKEN;
const ownerId = process.env.TELEGRAM_OWNER_ID;
if (!token || !ownerId) {
  console.error("FATAL: TELEGRAM_BOT_TOKEN or TELEGRAM_OWNER_ID is not set");
  process.exit(1);
}

let text;
try {
  text = readFileSync(args.answer, "utf8").trim();
} catch {
  console.error("FATAL: could not read the answer file");
  process.exit(1);
}
if (!text) {
  console.error("FATAL: the answer is empty, nothing sent");
  process.exit(1);
}

// The answer always goes back to the owner, never to a chat id taken from the
// incoming message. A reply that followed the message would answer whoever sent
// it; this one can only ever reach Ivan.
if (text.length > TELEGRAM_MAX) {
  text = text.slice(0, TELEGRAM_MAX - 30) + "\n… (answer shortened)";
}

let response;
try {
  response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: ownerId, text, disable_web_page_preview: true }),
  });
} catch {
  console.error("FATAL: the Telegram request did not complete");
  process.exit(1);
}

let payload;
try {
  payload = await response.json();
} catch {
  console.error("FATAL: Telegram replied HTTP " + response.status + " with no JSON");
  process.exit(1);
}

if (!payload.ok) {
  console.error("FATAL: Telegram refused the answer, HTTP " + response.status + ", " + (payload.description || "no description"));
  process.exit(1);
}

console.log("answer delivered, message_id " + (payload.result || {}).message_id);
