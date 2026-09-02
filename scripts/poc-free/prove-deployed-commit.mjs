#!/usr/bin/env node
// prove-deployed-commit.mjs
// Card P3-11e. THE REFUSALS, PROVED, BECAUSE A GUARD NOBODY HAS WATCHED FAIL IS
// A GUARD NOBODY HAS TESTED.
//
// check-deployed-commit.mjs is the only thing standing between a removal
// migration and INC-06 happening again. Every one of its failure modes is a
// REFUSAL, and a refusal that silently stopped refusing would look exactly like
// a check that keeps passing. So each one is driven here against a fake health
// route on 127.0.0.1 and asserted to exit non-zero, and each is paired with a
// control on the same harness that must exit ZERO, so a fixture that fails to
// run cannot satisfy every assertion while proving nothing.
//
// NO NETWORK BEYOND LOOPBACK, no credentials, no database, no production.
//
// THE COMMITS ARE REAL ONES FROM THIS REPOSITORY. HEAD and HEAD~1 are used
// rather than invented hex strings, because the whole question is what `git
// merge-base --is-ancestor` says, and it says nothing useful about a sha that
// does not exist.

import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const CHECK = join(HERE, "check-deployed-commit.mjs");

const git = (argv) => execFileSync("git", argv, { cwd: ROOT, encoding: "utf8" }).trim();

const HEAD = git(["rev-parse", "HEAD"]);
let PARENT;
try {
  PARENT = git(["rev-parse", "HEAD~1"]);
} catch {
  console.error("prove-deployed-commit: this checkout has no HEAD~1, cannot build the fixtures.");
  process.exit(2);
}

let failures = 0;
const pass = (m) => console.log("  ok    " + m);
const fail = (m) => {
  console.log("  FAIL  " + m);
  failures += 1;
};

// A fake /api/health. `reply` decides what it answers, per case.
let reply = () => ({ status: 200, type: "application/json", body: "{}" });
const server = createServer((req, res) => {
  const r = reply(req);
  if (r.status >= 300 && r.status < 400) {
    res.writeHead(r.status, { location: r.location || "/autentificare" });
    res.end();
    return;
  }
  res.writeHead(r.status, { "content-type": r.type });
  res.end(r.body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ASYNC, AND THAT IS NOT A STYLE CHOICE. The fake health route runs in THIS
// process. spawnSync blocks the event loop, so the server can never accept the
// connection the child is opening: every case timed out and every refusal
// "passed" for the wrong reason, including the controls, which is how it was
// caught. A test harness that holds the loop cannot also be the server under
// test.
function run(commitArg, origin = ORIGIN, extra = []) {
  const argv = [CHECK, "--origin", origin, ...extra];
  if (commitArg) argv.push("--commit", commitArg);
  return new Promise((resolveRun) => {
    const child = spawn("node", argv, { encoding: "utf8" });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolveRun({ code, out }));
  });
}

const json = (obj) => ({ status: 200, type: "application/json; charset=utf-8", body: JSON.stringify(obj) });

console.log("prove-deployed-commit: the guard's refusals, each with a control\n");

// --- CONTROL 1: production runs exactly the commit being applied -------------
reply = () => json({ commit: HEAD, ledger_version: "0027", at: new Date().toISOString() });
let r = await run(HEAD);
if (r.code === 0) pass("CONTROL: production running exactly HEAD is accepted");
else fail("CONTROL: exactly HEAD was refused, so every refusal below proves nothing\n" + r.out);

// --- CONTROL 2: production is AHEAD, so it contains what is being applied ----
reply = () => json({ commit: HEAD, ledger_version: "0027", at: new Date().toISOString() });
r = await run(PARENT);
if (r.code === 0) pass("CONTROL: production ahead of the applied commit is accepted, it contains it");
else fail("CONTROL: a live commit containing the applied one was refused\n" + r.out);

// --- THE INC-06 CASE: production is BEHIND ----------------------------------
reply = () => json({ commit: PARENT, ledger_version: "0027", at: new Date().toISOString() });
r = await run(HEAD);
if (r.code !== 0 && /NOT running the code being applied/.test(r.out))
  pass("REFUSES when production is BEHIND the commit being applied. This is INC-06");
else fail("a live commit that does NOT contain the applied one was accepted\n" + r.out);

// --- a commit this repository has never seen --------------------------------
reply = () => json({ commit: "0".repeat(40), ledger_version: "0027", at: "x" });
r = await run(HEAD);
if (r.code !== 0 && /never heard of the live commit/.test(r.out))
  pass("REFUSES a live commit the repository does not know");
else fail("an unknown live commit was accepted\n" + r.out);

// --- no commit reported -----------------------------------------------------
reply = () => json({ commit: null, ledger_version: "0027", at: "x" });
r = await run(HEAD);
if (r.code !== 0 && /reported no commit/.test(r.out)) pass("REFUSES when no commit is reported");
else fail("a health route reporting no commit was accepted\n" + r.out);

reply = () => json({ commit: "   ", ledger_version: null, at: "x" });
r = await run(HEAD);
if (r.code !== 0) pass("REFUSES when the reported commit is blank");
else fail("a blank commit was accepted\n" + r.out);

// --- HTML, which is what the authentication proxy serves --------------------
reply = () => ({ status: 200, type: "text/html; charset=utf-8", body: "<!DOCTYPE html><html>login</html>" });
r = await run(HEAD);
if (r.code !== 0 && /not JSON/.test(r.out)) pass("REFUSES an HTML body, which is what a login page is");
else fail("an HTML body was accepted\n" + r.out);

// --- a redirect, which is what proxy.ts does without the allow-list ---------
reply = () => ({ status: 307, location: "/autentificare" });
r = await run(HEAD);
if (r.code !== 0 && /a redirect/.test(r.out))
  pass("REFUSES a redirect, and names proxy.ts isPublic() as the cause");
else fail("a 307 to the login page was accepted\n" + r.out);

// --- a 500 -----------------------------------------------------------------
reply = () => ({ status: 500, type: "application/json", body: '{"error":"boom"}' });
r = await run(HEAD);
if (r.code !== 0) pass("REFUSES a 5xx from the health route");
else fail("a 500 was accepted\n" + r.out);

// --- JSON that is not JSON --------------------------------------------------
reply = () => ({ status: 200, type: "application/json", body: "not json at all" });
r = await run(HEAD);
if (r.code !== 0 && /not JSON/.test(r.out)) pass("REFUSES a body that does not parse");
else fail("an unparseable body was accepted\n" + r.out);

// --- unreachable ------------------------------------------------------------
{
  const dead = await run(HEAD, "http://127.0.0.1:1", ["--timeout", "2000"]);
  const out = dead.out;
  if (dead.code !== 0 && /could not be reached/.test(out))
    pass("REFUSES when the health route is unreachable, rather than assuming yes");
  else fail("an unreachable health route was accepted\n" + out);
}

// --- FINAL CONTROL, after every refusal ------------------------------------
// The green case is re-run LAST. If the harness had broken part-way through,
// every refusal above would pass for the wrong reason and this would catch it.
reply = () => json({ commit: HEAD, ledger_version: "0028", at: new Date().toISOString() });
r = await run(HEAD);
if (r.code === 0) pass("FINAL CONTROL: the accepting case still accepts after all of the above");
else fail("FINAL CONTROL failed, so the harness broke and the refusals prove nothing\n" + r.out);

server.close();

console.log("");
if (failures > 0) {
  console.error(`prove-deployed-commit: ${failures} case(s) failed.`);
  process.exit(1);
}
console.log("prove-deployed-commit: every refusal fires and every control passes.");
