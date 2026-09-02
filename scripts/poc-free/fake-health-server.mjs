#!/usr/bin/env node
// fake-health-server.mjs
// Card P3-11e. A stand-in for /api/health, for proofs only.
//
// WHY IT IS A SEPARATE PROCESS AND NOT A FUNCTION.
//
// The proofs that need it drive the applier with spawnSync, which BLOCKS the
// event loop. A server running in the same process can never accept the
// connection the child opens: every case times out and every refusal "passes"
// for the wrong reason. That happened once already while building
// prove-deployed-commit.mjs, controls included, which is how it was caught.
//
// So this runs on its own, prints the origin it is listening on as its first
// line of stdout, and is killed by the parent when the proof is done.
//
// IT IS NEVER REACHED BY THE APPLICATION. check-deployed-commit.mjs has no file
// seam and no fixture mode: it always speaks HTTP, and the only thing a proof
// can change is WHICH origin. A seam that let the check be satisfied without a
// server is a seam somebody could set in production.
//
// Usage: node fake-health-server.mjs --commit <sha> [--ledger 0028]
//        node fake-health-server.mjs --html          serves a login page
//        node fake-health-server.mjs --status 500

import { createServer } from "node:http";

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

const server = createServer((req, res) => {
  if (args.html === "true") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!DOCTYPE html><html>autentificare</html>");
    return;
  }
  const status = Number(args.status || 200);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({
      commit: args.commit || null,
      ledger_version: args.ledger === undefined ? null : args.ledger,
      at: new Date().toISOString(),
    }),
  );
});

server.listen(0, "127.0.0.1", () => {
  // First line of stdout is the origin. The parent reads exactly this.
  console.log(`http://127.0.0.1:${server.address().port}`);
});
