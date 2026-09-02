#!/usr/bin/env node
// prove-unique-ids.mjs
// Card RULE-02. THE THREE COLLISIONS THE CHECK MUST REFUSE, PROVED ON FIXTURES.
//
// check-unique-ids.mjs reports OK against the real record, which is what it
// should do, and which tells you nothing about whether it would notice a
// collision. A duplicate check that parses zero ids also reports OK.
//
// So each refusal is driven here against a throwaway tree: a repository with a
// real git history, its own boards and its own inbox, and its own origin/main to
// compare against. Each negative case is paired with a CONTROL that must exit
// ZERO on the same fixture, so a fixture that fails to build cannot satisfy
// every assertion while proving nothing. That is the standard the other proofs
// in this directory hold to.
//
// NO NETWORK, NO DATABASE, NO CREDENTIALS. It builds git repositories in a temp
// directory and deletes them.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

let failures = 0;
const pass = (m) => console.log("  ok    " + m);
const fail = (m, d) => {
  console.log("  FAIL  " + m);
  if (d) console.log("        " + String(d).split("\n").slice(0, 6).join("\n        "));
  failures += 1;
};

const BOARD = (cards) =>
  JSON.stringify(
    {
      board: "fixture",
      schema_version: 1,
      phase: "fixture",
      as_of: "2026-09-02T00:00:00Z",
      cards: cards.map((id) => ({ id })),
    },
    null,
    2,
  ) + "\n";

const INBOX = (ids) =>
  "# fixture inbox\n\n### R-NNN - <one line naming the decision>\n\n" +
  ids.map((i) => `### ${i} - a decision about ${i}\n\nbody\n`).join("\n") +
  "\n";

function git(dir, argv) {
  return execFileSync("git", argv, { cwd: dir, encoding: "utf8" });
}

/**
 * A fixture repository with a real origin/main.
 *
 * THE ORIGIN IS REAL AND THAT MATTERS. The check's load-bearing question is
 * whether this branch REDEFINES an id that main already uses, and it answers it
 * with `git show origin/main:decisions/inbox.md`. A fixture with no origin would
 * exercise every other branch of the file and skip the one the card is about.
 */
function fixture({ mainBoards, mainInbox, boards, inbox, counter }) {
  const dir = mkdtempSync(join(tmpdir(), "rc-unique-ids-"));
  const origin = join(dir, "origin");
  const work = join(dir, "work");

  mkdirSync(join(origin, "docs", "board"), { recursive: true });
  mkdirSync(join(origin, "decisions"), { recursive: true });
  mkdirSync(join(origin, "scripts", "poc-free"), { recursive: true });

  const write = (base, rel, body) => {
    mkdirSync(dirname(join(base, rel)), { recursive: true });
    writeFileSync(join(base, rel), body);
  };

  for (const [name, cards] of Object.entries(mainBoards)) write(origin, `docs/board/${name}`, BOARD(cards));
  write(origin, "decisions/inbox.md", INBOX(mainInbox));
  write(origin, "decisions/NEXT-RULING-ID", (counter || "R-999") + "\n");
  cpSync(join(HERE, "check-unique-ids.mjs"), join(origin, "scripts/poc-free/check-unique-ids.mjs"));

  git(origin, ["init", "--quiet", "-b", "main"]);
  git(origin, ["config", "user.email", "fixture@example.invalid"]);
  git(origin, ["config", "user.name", "fixture"]);
  git(origin, ["add", "-A"]);
  git(origin, ["commit", "--quiet", "-m", "fixture main"]);

  execFileSync("git", ["clone", "--quiet", origin, work], { encoding: "utf8" });
  git(work, ["config", "user.email", "fixture@example.invalid"]);
  git(work, ["config", "user.name", "fixture"]);

  // Now the branch's own state, which is what the check reads from the tree.
  for (const [name, cards] of Object.entries(boards)) write(work, `docs/board/${name}`, BOARD(cards));
  write(work, "decisions/inbox.md", INBOX(inbox));
  write(work, "decisions/NEXT-RULING-ID", (counter || "R-999") + "\n");

  return { dir, work };
}

function run(work) {
  const r = spawnSync("node", [join(work, "scripts/poc-free/check-unique-ids.mjs")], {
    cwd: work,
    encoding: "utf8",
  });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// The three boards the check reads by name. A fixture must supply all three or
// the check exits 2 for a missing board, which is a different refusal.
const THREE = (a, b, c) => ({
  "rc-board.json": a,
  "rc-board-phase2.json": b,
  "rc-board-phase3.json": c,
});

console.log("prove-unique-ids: every collision refused, each with a control\n");

// --- CONTROL: a clean record passes -----------------------------------------
{
  const f = fixture({
    mainBoards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    mainInbox: ["R-001", "R-002"],
    boards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    inbox: ["R-001", "R-002"],
  });
  const r = run(f.work);
  if (r.code === 0) pass("CONTROL: a record with no duplicate id passes");
  else fail("CONTROL failed, so every refusal below proves nothing", r.out);
  rmSync(f.dir, { recursive: true, force: true });
}

// --- 1. TWO CARDS WITH THE SAME ID ON ONE BOARD -----------------------------
{
  const f = fixture({
    mainBoards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    mainInbox: ["R-001"],
    boards: THREE(["P1-01"], ["P2-01", "P2-01"], ["P3-01"]),
    inbox: ["R-001"],
  });
  const r = run(f.work);
  if (r.code !== 0 && /card id P2-01 appears 2 times/.test(r.out))
    pass("REFUSES two cards with the same id on ONE board");
  else fail("a duplicate id on one board was accepted", r.out);
  rmSync(f.dir, { recursive: true, force: true });
}

// --- 2. THE SAME CARD ID ON TWO DIFFERENT BOARDS ----------------------------
{
  const f = fixture({
    mainBoards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    mainInbox: ["R-001"],
    boards: THREE(["P1-01"], ["SHARED-01"], ["SHARED-01"]),
    inbox: ["R-001"],
  });
  const r = run(f.work);
  if (r.code !== 0 && /card id SHARED-01 appears 2 times/.test(r.out))
    pass("REFUSES the same card id on TWO boards, which no single board can see");
  else fail("a cross-board duplicate was accepted", r.out);
  rmSync(f.dir, { recursive: true, force: true });
}

// --- 3. TWO RULINGS WITH THE SAME ID ----------------------------------------
{
  const f = fixture({
    mainBoards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    mainInbox: ["R-001"],
    boards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    inbox: ["R-001", "R-002", "R-002"],
  });
  const r = run(f.work);
  if (r.code !== 0 && /ruling id R-002 appears 2 times/.test(r.out))
    pass("REFUSES two rulings with the same id in the inbox");
  else fail("a duplicate ruling id was accepted", r.out);
  rmSync(f.dir, { recursive: true, force: true });
}

// --- 4. THE #143 CASE: AN ID REDEFINED AGAINST MAIN -------------------------
//
// This is the one the card exists for. Within each side the ids are perfectly
// unique, there is no merge conflict, and nothing else in the repository asks
// the question.
{
  const dir = mkdtempSync(join(tmpdir(), "rc-unique-ids-"));
  const origin = join(dir, "origin");
  const work = join(dir, "work");
  mkdirSync(join(origin, "docs", "board"), { recursive: true });
  mkdirSync(join(origin, "decisions"), { recursive: true });
  mkdirSync(join(origin, "scripts", "poc-free"), { recursive: true });
  const write = (base, rel, body) => {
    mkdirSync(dirname(join(base, rel)), { recursive: true });
    writeFileSync(join(base, rel), body);
  };
  write(origin, "docs/board/rc-board.json", BOARD(["P1-01"]));
  write(origin, "docs/board/rc-board-phase2.json", BOARD(["P2-01"]));
  write(origin, "docs/board/rc-board-phase3.json", BOARD(["P3-01"]));
  write(
    origin,
    "decisions/inbox.md",
    "# fixture inbox\n\n### R-NNN - <one line naming the decision>\n\n### R-083 - deviz is internal only\n\nbody\n",
  );
  write(origin, "decisions/NEXT-RULING-ID", "R-999\n");
  cpSync(join(HERE, "check-unique-ids.mjs"), join(origin, "scripts/poc-free/check-unique-ids.mjs"));
  git(origin, ["init", "--quiet", "-b", "main"]);
  git(origin, ["config", "user.email", "fixture@example.invalid"]);
  git(origin, ["config", "user.name", "fixture"]);
  git(origin, ["add", "-A"]);
  git(origin, ["commit", "--quiet", "-m", "fixture main"]);
  execFileSync("git", ["clone", "--quiet", origin, work], { encoding: "utf8" });

  // The branch: the SAME id, a DIFFERENT decision. Exactly #143's shape.
  write(
    work,
    "decisions/inbox.md",
    "# fixture inbox\n\n### R-NNN - <one line naming the decision>\n\n### R-083 - the input this run was handed was not the newest report\n\nbody\n",
  );
  const r = run(work);
  if (r.code !== 0 && /ruling id R-083 is REDEFINED against origin\/main/.test(r.out))
    pass("REFUSES an id that means something else on main. THIS IS THE #143 CASE");
  else fail("an id redefined against main was accepted, which is the whole card", r.out);

  // CONTROL on the same fixture: a NEW id on the branch is fine.
  write(
    work,
    "decisions/inbox.md",
    "# fixture inbox\n\n### R-NNN - <one line naming the decision>\n\n### R-083 - deviz is internal only\n\nbody\n\n### R-084 - something new\n\nbody\n",
  );
  const ok = run(work);
  if (ok.code === 0) pass("  ...and a genuinely NEW ruling id on the same branch passes");
  else fail("a new ruling id was refused, so the check would block all authoring", ok.out);
  rmSync(dir, { recursive: true, force: true });
}

// --- 5. THE COUNTER MUST BE AHEAD OF WHAT IS WRITTEN ------------------------
{
  const f = fixture({
    mainBoards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    mainInbox: ["R-001"],
    boards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    inbox: ["R-001", "R-002"],
    counter: "R-002",
  });
  const r = run(f.work);
  if (r.code !== 0 && /did not advance the counter/.test(r.out))
    pass("REFUSES a counter that has not moved past the ruling just written");
  else fail("a stale counter was accepted, so the next author collides", r.out);
  rmSync(f.dir, { recursive: true, force: true });
}

{
  const f = fixture({
    mainBoards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    mainInbox: ["R-001"],
    boards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    inbox: ["R-001", "R-002"],
    counter: "R-003",
  });
  const r = run(f.work);
  if (r.code === 0) pass("  ...and accepts a counter that IS ahead");
  else fail("an advanced counter was refused", r.out);
  rmSync(f.dir, { recursive: true, force: true });
}

// --- 6. THE COUNT ASSERTION: a heading the regex stopped matching -----------
//
// The defect class docs/LEARNINGS.md names. A ruling-shaped heading that parses
// as nothing must be a hard failure and not a silent skip, because the silent
// skip is what a broken regex looks like.
{
  const f = fixture({
    mainBoards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    mainInbox: ["R-001"],
    boards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    inbox: ["R-001"],
  });
  const inboxPath = join(f.work, "decisions/inbox.md");
  writeFileSync(
    inboxPath,
    "# fixture inbox\n\n### R-NNN - <one line naming the decision>\n\n### R-001 - a decision about R-001\n\nbody\n\n### RULING-42 - a shape nobody planned for\n\nbody\n",
  );
  const r = run(f.work);
  if (r.code !== 0 && /explained by nothing/.test(r.out))
    pass("REFUSES a ruling-shaped heading it cannot parse, rather than skipping it");
  else fail("an unparseable ruling heading was skipped in silence", r.out);
  rmSync(f.dir, { recursive: true, force: true });
}

// --- 7. AN EMPTY BOARD IS A REFUSAL, NOT A CLEAN RESULT ---------------------
{
  const f = fixture({
    mainBoards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    mainInbox: ["R-001"],
    boards: THREE(["P1-01"], [], ["P3-01"]),
    inbox: ["R-001"],
  });
  const r = run(f.work);
  if (r.code === 2 && /carries zero cards/.test(r.out))
    pass("REFUSES a board with zero cards, which would make an empty duplicate set look clean");
  else fail("a board with zero cards was read as clean", r.out);
  rmSync(f.dir, { recursive: true, force: true });
}

// --- FINAL CONTROL ----------------------------------------------------------
{
  const f = fixture({
    mainBoards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    mainInbox: ["R-001", "R-002"],
    boards: THREE(["P1-01"], ["P2-01"], ["P3-01"]),
    inbox: ["R-001", "R-002"],
  });
  const r = run(f.work);
  if (r.code === 0) pass("FINAL CONTROL: the passing case still passes after all of the above");
  else fail("FINAL CONTROL failed, so the harness broke and the refusals prove nothing", r.out);
  rmSync(f.dir, { recursive: true, force: true });
}

console.log("");
if (failures > 0) {
  console.error(`prove-unique-ids: ${failures} case(s) failed.`);
  process.exit(1);
}
console.log("prove-unique-ids: every collision is refused and every control passes.");
