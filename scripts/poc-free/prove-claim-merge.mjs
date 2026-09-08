#!/usr/bin/env node
// prove-claim-merge.mjs
// Card CLAIM-01. TWO CLAIMS CUT FROM ONE BASE MUST MERGE, AND THE SHAPE THAT
// COULD NOT IS RUN BESIDE THEM AND MUST STILL FAIL.
//
// ===========================================================================
// WHAT THIS PROVES, AND WHY IT IS A GIT MERGE AND NOT AN ASSERTION ABOUT ONE
// ===========================================================================
//
// The defect is a git merge conflict, so the proof performs git merges. Two
// branches are cut from one base, each takes a claim on a DIFFERENT card through
// the SHIPPED writer in scripts/poc/claims.mjs, the first is merged, then the
// second. The result must be a clean merge whose claims map carries BOTH.
//
// THE CONTROL IS THE OLD SHAPE, ON THE SAME HARNESS. The same two claims are
// written the way they were written before this card, as two keys added to one
// `claims` object inside docs/poc/state.json, and the second merge MUST
// CONFLICT. A proof of a fix that never shows the defect proves that the proof
// agrees with itself.
//
// AND THE CONFLICT IS INSPECTED, NOT JUST COUNTED. The old shape's failure is
// not "git said conflict", it is that the conflict boundary runs THROUGH the
// JSON object: the HEAD side keeps its claim's opening brace and the incoming
// side keeps its claim's closing brace. A resolution that deletes only the
// marker characters therefore yields a claims map that does not parse, which is
// the failure class docs/LEARNINGS.md already names and which would land in the
// one file the harness reads before it picks a card. This asserts that shape
// explicitly, so the control cannot quietly become a merge that conflicts for
// some other reason.
//
// THE SHIPPED WRITER IS DRIVEN, NOT RESTATED. claims.mjs is imported and called.
// Before this card the same logic was a `node -e` program inline in claim.sh and
// could not be reached from a test at all, which is why it moved.
//
// No network, no gh, no database, no secret. Every case is a throwaway git
// repository built for it.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readClaims, writeClaim, removeClaimFile, claimPathFor } from "../poc/claims.mjs";

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass && detail) console.log(`      ${String(detail).split("\n").slice(0, 14).join("\n      ")}`);
};

const STATE = "docs/poc/state.json";
const NOW = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/** A repository with docs/poc/state.json on its base commit, and nothing else. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), "rc-claim-merge-"));
  const git = (...a) =>
    execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-q", "-b", "main", ".");
  git("config", "user.email", "proof@example.invalid");
  git("config", "user.name", "proof");
  mkdirSync(join(dir, "docs/poc/claims"), { recursive: true });
  writeFileSync(join(dir, STATE), `${JSON.stringify({ schema_version: 2, claims: {} }, null, 2)}\n`);
  writeFileSync(join(dir, "docs/poc/claims/README.md"), "claim leases, one file each\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  return { dir, git, statePath: join(dir, STATE) };
}

/** Merge `branch` into main. Returns { clean, output }. */
function merge(git, branch) {
  try {
    git("merge", "--no-edit", branch);
    return { clean: true, output: "" };
  } catch (e) {
    return { clean: false, output: (e.stdout || "") + (e.stderr || "") };
  }
}

// ===========================================================================
console.log("1. THE FIX: two claims cut from one base, taken through the shipped writer");
// ===========================================================================
{
  const { dir, git, statePath } = repo();
  const base = git("rev-parse", "HEAD").trim();

  git("checkout", "-q", "-b", "poc/claim-a", base);
  writeClaim({ statePath, cardId: "AAA-01", actor: "executor", at: NOW });
  git("add", "-A");
  git("commit", "-q", "-m", "POC: claim AAA-01 for executor");

  git("checkout", "-q", "-b", "poc/claim-b", base);
  writeClaim({ statePath, cardId: "BBB-02", actor: "harness", at: NOW });
  git("add", "-A");
  git("commit", "-q", "-m", "POC: claim BBB-02 for harness");

  git("checkout", "-q", "main");
  const first = merge(git, "poc/claim-a");
  record("the first claim merges clean", first.clean, first.output);

  const second = merge(git, "poc/claim-b");
  record("the SECOND claim merges clean, which is the whole card", second.clean, second.output);

  const claims = readClaims({ statePath, nowSeconds: Math.floor(Date.now() / 1000) });
  record("the merged result carries BOTH claims", Boolean(claims["AAA-01"] && claims["BBB-02"]), JSON.stringify(claims));
  record("  ...and names the right actor on each",
    claims["AAA-01"]?.claimed_by === "executor" && claims["BBB-02"]?.claimed_by === "harness",
    JSON.stringify(claims));

  // "parsing as JSON" is asserted on every file, not on the map the reader
  // returned: readClaims SKIPS a file it cannot parse, so a reader that answered
  // correctly would hide a broken file rather than reveal it.
  let allParse = true;
  let parseDetail = "";
  for (const id of ["AAA-01", "BBB-02"]) {
    const p = claimPathFor(statePath, id);
    try { JSON.parse(readFileSync(p, "utf8")); } catch (e) { allParse = false; parseDetail += `${p}: ${e.message}\n`; }
  }
  record("  ...and every claim file on disk parses as JSON", allParse, parseDetail);
  // `git grep` exits 1 when it finds NOTHING, so the absence of a marker is a
  // non-zero exit and has to be read from the status. execFileSync throws on
  // that, which would turn the passing case into a crash.
  const grep = spawnSync("git", ["grep", "-l", "-e", "<<<<<<<", "--", "."], { cwd: dir, encoding: "utf8" });
  record("  ...with no conflict marker anywhere in the tree",
    grep.status === 1 && grep.stdout.trim() === "", `exit ${grep.status}` + "\n" + grep.stdout);
}

// ===========================================================================
console.log("\n2. THE CONTROL: the same two claims in one object, which is what shipped before");
// ===========================================================================
{
  const { dir, git, statePath } = repo();
  const base = git("rev-parse", "HEAD").trim();

  // The pre-CLAIM-01 writer, restated here on purpose. This is the ONE place a
  // copy of the old logic is allowed, because the old logic no longer exists to
  // import and the control has to be able to fail.
  const legacyClaim = (cardId, actor) => {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.claims = state.claims || {};
    state.claims[cardId] = { claimed_by: actor, claimed_at: NOW };
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  };

  git("checkout", "-q", "-b", "legacy/claim-a", base);
  legacyClaim("AAA-01", "executor");
  git("add", "-A");
  git("commit", "-q", "-m", "POC: claim AAA-01 for executor");

  git("checkout", "-q", "-b", "legacy/claim-b", base);
  legacyClaim("BBB-02", "harness");
  git("add", "-A");
  git("commit", "-q", "-m", "POC: claim BBB-02 for harness");

  git("checkout", "-q", "main");
  const first = merge(git, "legacy/claim-a");
  record("the first legacy claim merges clean, exactly as it always did", first.clean, first.output);

  const second = merge(git, "legacy/claim-b");
  record("the SECOND legacy claim CONFLICTS, which is the defect this card removes",
    !second.clean, second.clean ? "it merged, so this control proves nothing" : "");

  const conflicted = existsSync(statePath) ? readFileSync(statePath, "utf8") : "";
  record("  ...and the conflict boundary runs THROUGH the claims object",
    /<{7}/.test(conflicted) && /"claims"/.test(conflicted) && /AAA-01/.test(conflicted) && /BBB-02/.test(conflicted),
    conflicted.slice(0, 900));

  // The failure that actually reached main three times: delete the marker
  // CHARACTERS and the JSON is broken, which no grep for markers would find.
  const stripped = conflicted.split("\n").filter((l) => !/^[<>=]{7}/.test(l)).join("\n");
  let strippedParses = true;
  try { JSON.parse(stripped); } catch { strippedParses = false; }
  record("  ...so deleting only the markers leaves a claims map that does NOT parse",
    !strippedParses, "the stripped file parsed, so this case no longer models the failure");

  git("merge", "--abort");
}

// ===========================================================================
console.log("\n3. A RELEASE AND A CLAIM, TAKEN AT THE SAME TIME, ALSO MERGE");
// ===========================================================================
{
  // A release is a DELETION. An add and a delete of two different paths merge
  // the same way two adds do, and asserting it is cheap: under the old shape
  // this pair conflicted exactly like the other one.
  const { git, statePath } = repo();
  writeClaim({ statePath, cardId: "AAA-01", actor: "executor", at: NOW });
  git("add", "-A");
  git("commit", "-q", "-m", "POC: claim AAA-01 for executor");
  const base = git("rev-parse", "HEAD").trim();

  git("checkout", "-q", "-b", "poc/release-a", base);
  removeClaimFile({ statePath, cardId: "AAA-01" });
  git("add", "-A");
  git("commit", "-q", "-m", "POC: release AAA-01 for executor");

  git("checkout", "-q", "-b", "poc/claim-c", base);
  writeClaim({ statePath, cardId: "CCC-03", actor: "harness", at: NOW });
  git("add", "-A");
  git("commit", "-q", "-m", "POC: claim CCC-03 for harness");

  git("checkout", "-q", "main");
  const first = merge(git, "poc/release-a");
  const second = merge(git, "poc/claim-c");
  record("a release on one branch and a claim on another both merge clean",
    first.clean && second.clean, first.output + second.output);

  const claims = readClaims({ statePath, nowSeconds: Math.floor(Date.now() / 1000) });
  record("  ...and the released card is gone while the new one is held",
    !claims["AAA-01"] && claims["CCC-03"]?.claimed_by === "harness", JSON.stringify(claims));
}

// ===========================================================================
console.log("\n4. THE LEGACY OBJECT IS STILL READ, so a run.sh nobody reinstalled is not invisible");
// ===========================================================================
{
  const { statePath } = repo();
  writeFileSync(statePath, `${JSON.stringify({
    schema_version: 2,
    claims: { "DDD-04": { claimed_by: "harness", claimed_at: NOW } },
  }, null, 2)}\n`);
  writeClaim({ statePath, cardId: "EEE-05", actor: "executor", at: NOW });

  const claims = readClaims({ statePath, nowSeconds: Math.floor(Date.now() / 1000) });
  record("a claim in state.json and a claim in the directory are BOTH seen",
    claims["DDD-04"]?.claimed_by === "harness" && claims["EEE-05"]?.claimed_by === "executor",
    JSON.stringify(claims));
  record("  ...and each says which store it came from",
    claims["DDD-04"]?.source === "state.json" && claims["EEE-05"]?.source === "claims/",
    JSON.stringify(claims));
}

// ===========================================================================
console.log("\n5. THE DIRECTORY WINS over a stale legacy entry for the same card");
// ===========================================================================
{
  const { statePath } = repo();
  const older = new Date(Date.now() - 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  writeFileSync(statePath, `${JSON.stringify({
    schema_version: 2,
    claims: { "FFF-06": { claimed_by: "harness", claimed_at: older } },
  }, null, 2)}\n`);
  writeClaim({ statePath, cardId: "FFF-06", actor: "executor", at: NOW });

  const claims = readClaims({ statePath, nowSeconds: Math.floor(Date.now() / 1000) });
  record("the file beats the object when both name the same card",
    claims["FFF-06"]?.claimed_by === "executor" && claims["FFF-06"]?.source === "claims/",
    JSON.stringify(claims));
}

// ===========================================================================
console.log("\n6. EXPIRY IS UNCHANGED, and a directory that is not there is an empty set");
// ===========================================================================
{
  const { statePath } = repo();
  const stale = new Date(Date.now() - 7 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  writeClaim({ statePath, cardId: "GGG-07", actor: "executor", at: stale });
  const claims = readClaims({ statePath, nowSeconds: Math.floor(Date.now() / 1000) });
  record("a claim older than six hours is not live", claims["GGG-07"] === undefined, JSON.stringify(claims));

  const missing = readClaims({ statePath: join(mkdtempSync(join(tmpdir(), "rc-claim-empty-")), STATE) });
  record("  ...and a repository with no claims directory reads as no claims, not as an error",
    Object.keys(missing).length === 0, JSON.stringify(missing));
}

// ===========================================================================
console.log("\n7. A CLAIM FILE THAT DOES NOT PARSE IS NAMED, not silently counted as absent");
// ===========================================================================
{
  const { statePath } = repo();
  writeClaim({ statePath, cardId: "HHH-08", actor: "executor", at: NOW });
  writeFileSync(claimPathFor(statePath, "III-09"), "{ this is not json\n");

  // spawnSync, so stdout AND stderr are both readable whatever the exit code.
  // execFileSync hands back stderr only when the child THROWS, and this child
  // deliberately does not throw: one unreadable claim file must not take the
  // reader down. Reading the warning through a thrown error would therefore
  // require the very failure this case says must not happen.
  const MOD = JSON.stringify(new URL("../poc/claims.mjs", import.meta.url).href);
  const r = spawnSync(process.execPath, [
    "-e",
    `import(${MOD}).then((m) => { const c = m.readClaims({ statePath: ${JSON.stringify(statePath)} }); console.log(JSON.stringify(Object.keys(c).sort())); });`,
  ], { encoding: "utf8" });

  record("it exits 0 rather than taking the reader down", r.status === 0, `exit ${r.status}` + "\n" + r.stderr);
  record("  ...the readable claim is still read", /HHH-08/.test(r.stdout), r.stdout);
  record("  ...the unreadable one is NOT reported as a live claim", !/III-09/.test(r.stdout), r.stdout);
  record("  ...and it is named on stderr rather than passed over in silence",
    /does not parse and was skipped/.test(r.stderr) && /III-09/.test(r.stderr), r.stderr);
}

// ===========================================================================
console.log("\n8. THE SHIPPED claim.sh, DRIVEN TWICE IN ONE SESSION, against a local origin");
// ===========================================================================
//
// The other cases drive the writer. This one drives the whole script, because
// the second half of CLAIM-01 is not about the file format at all: claim.sh used
// to LEAVE THE WORKING TREE ON THE CLAIM BRANCH, so the second claim of a
// session was cut from the first claim's tree and carried it in its diff. If the
// first pull request was then closed unmerged, which is what happened to #86,
// merging the second silently reinstated a claim the owner had declined.
//
// IT COPIES THE SHIPPED FILE RATHER THAN RESTATING IT. claim.sh resolves its own
// repository root from its own location, so it has to live inside the fixture.
// What runs is the bytes on disk today.
//
// `origin` is a bare repository on this machine, so the push is real and offline.
// `gh pr create` fails there, exactly as it would with no network, and that is
// the point: the branch, the patch and the return all happen before it and must
// survive a failed pull request creation.
{
  const dir = mkdtempSync(join(tmpdir(), "rc-claim-sh-"));
  const bare = join(dir, "origin.git");
  const work = join(dir, "work");
  const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8" });
  const git = (...a) => execFileSync("git", a, { cwd: work, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  execFileSync("git", ["init", "-q", "--bare", bare], { encoding: "utf8" });
  execFileSync("git", ["clone", "-q", bare, work], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("config", "user.email", "proof@example.invalid");
  git("config", "user.name", "proof");

  const here = new URL("../poc/", import.meta.url).pathname;
  mkdirSync(join(work, "scripts/poc"), { recursive: true });
  mkdirSync(join(work, "docs/poc/claims"), { recursive: true });
  mkdirSync(join(work, "docs/board"), { recursive: true });
  for (const f of ["claim.sh", "claims.mjs", "boards.mjs", "card-order.mjs", "eligible.mjs"]) {
    writeFileSync(join(work, "scripts/poc", f), readFileSync(join(here, f), "utf8"));
  }
  writeFileSync(join(work, STATE), `${JSON.stringify({ schema_version: 2, claims: {} }, null, 2)}\n`);
  writeFileSync(join(work, "docs/poc/claims/README.md"), "claim leases, one file each\n");
  const board = (name, cards) => `${JSON.stringify({ board: name, schema_version: 1, phase: "fixture", as_of: "2026-09-06T00:00:00Z", cards }, null, 2)}\n`;
  writeFileSync(join(work, "docs/board/rc-board-phase2.json"), board("p2", [{ id: "AAA-01" }, { id: "BBB-02" }]));
  writeFileSync(join(work, "docs/board/rc-board-phase3.json"), board("p3", []));
  writeFileSync(join(work, "docs/board/rc-board.json"), board("p1", []));
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  git("branch", "-M", "main");
  git("push", "-q", "-u", "origin", "main");
  git("checkout", "-q", "-b", "card/x");

  const first = run("bash", ["scripts/poc/claim.sh", "claim", "AAA-01", "executor"], work);
  const afterFirst = git("rev-parse", "--abbrev-ref", "HEAD").trim();
  const second = run("bash", ["scripts/poc/claim.sh", "claim", "BBB-02", "harness"], work);
  const afterSecond = git("rev-parse", "--abbrev-ref", "HEAD").trim();

  record("the first claim is written", /AAA-01 claimed by executor/.test(first.stdout), first.stdout + first.stderr);
  record("  ...and the terminal is put back on the branch it was on", afterFirst === "card/x", afterFirst);
  record("the second claim is written", /BBB-02 claimed by harness/.test(second.stdout), second.stdout + second.stderr);
  record("  ...and the terminal is put back again", afterSecond === "card/x", afterSecond);

  const branches = git("branch", "--list", "poc/*").split("\n").map((b) => b.replace(/^[ *]+/, "").trim()).filter(Boolean);
  record("two claim branches exist, one per claim", branches.length === 2, branches.join(", "));

  const diffOf = (b) => git("diff", "--name-only", `main..${b}`).split("\n").filter(Boolean).sort();
  const a = branches.find((b) => b.includes("aaa-01"));
  const bb = branches.find((b) => b.includes("bbb-02"));
  record("the FIRST branch carries only its own claim file",
    JSON.stringify(diffOf(a)) === JSON.stringify(["docs/poc/claims/AAA-01.json"]), JSON.stringify(diffOf(a)));
  record("the SECOND branch carries only its own claim file, and NOT the first one",
    JSON.stringify(diffOf(bb)) === JSON.stringify(["docs/poc/claims/BBB-02.json"]), JSON.stringify(diffOf(bb)));

  git("checkout", "-q", "main");
  const m1 = merge(git, a);
  const m2 = merge(git, bb);
  record("and both merge into main, in order, clean", m1.clean && m2.clean, m1.output + m2.output);
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} of ${results.length} proofs passed`);
if (failed > 0) process.exit(1);
