#!/usr/bin/env node
// prove-board-edit.mjs
// Card RULE-06. Proves check-board-edit.mjs REFUSES, on fixtures written for it.
// A check that has never been seen to fail is not a check.
//
// EVERY REFUSING CASE HERE IS PAIRED WITH A CONTROL THAT MUST PASS ON THE SAME
// FIXTURE HARNESS. That pairing is the whole design and this repository has paid
// for it: a fixture that silently fails to run satisfies every negative
// assertion while proving nothing, and a check that refuses everything passes
// every negative assertion too. Only a check that does both halves is working.
//
// Each scenario is a throwaway git repository with its own base commit, its own
// branch, its own board set and its own commit subjects. No network, no
// database, no secret, and nothing read from this repository's own history.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const CHECK = join(ROOT, "scripts/poc-free/check-board-edit.mjs");

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass && detail) console.log(`      ${String(detail).split("\n").slice(0, 12).join("\n      ")}`);
};

/** A board file with exactly the two fields the check reads, plus enough shape
 *  to look like the real thing to anyone opening the fixture. */
const board = (cards) =>
  JSON.stringify({ board: "fixture", schema_version: 1, as_of: "2026-09-04T00:00:00Z", cards }, null, 2) + "\n";

const P2 = "docs/board/rc-board-phase2.json";
const P3 = "docs/board/rc-board-phase3.json";
const P1 = "docs/board/rc-board.json";

/**
 * Build a repository, put `base` on the base commit, put `head` on a branch, and
 * run the check across the two.
 *
 * `base` and `head` are maps of relative path -> file contents. A path present
 * in `base` and absent from `head` is DELETED on the branch.
 */
function scenario({ base, head, branch = "card/fix-01", subjects = ["FIX-01: do the thing"] }) {
  const dir = mkdtempSync(join(tmpdir(), "rc-board-edit-"));
  const git = (...a) =>
    execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (rel, body) => {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body, "utf8");
  };
  try {
    git("init", "-q", ".");
    git("config", "user.email", "proof@example.invalid");
    git("config", "user.name", "proof");
    for (const [rel, body] of Object.entries(base)) put(rel, body);
    git("add", "-A");
    git("commit", "-qm", "base");
    git("branch", "-q", "base-ref");
    git("checkout", "-qb", branch);
    for (const rel of Object.keys(base)) if (!(rel in head)) rmSync(join(dir, rel), { force: true });
    for (const [rel, body] of Object.entries(head)) put(rel, body);
    git("add", "-A");
    // One commit per subject, so the subject harvester sees a real log rather
    // than one synthetic line. The first commit carries the whole diff and the
    // rest are EMPTY: a filler file would be a changed path of its own, and the
    // classifier would then be answering a question the scenario did not ask.
    for (let i = 0; i < subjects.length; i += 1) {
      git("commit", "-qm", subjects[i], "--allow-empty");
    }
    try {
      const out = execFileSync(process.execPath, [CHECK], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          RC_BOARD_EDIT_GITROOT: dir,
          RC_BOARD_EDIT_BASE: "base-ref",
          RC_BOARD_EDIT_HEAD: branch,
          RC_BOARD_EDIT_BRANCH: branch,
          GITHUB_HEAD_REF: "",
          GITHUB_BASE_REF: "",
          // PINNED, NOT INHERITED. The check short-circuits on any event that is
          // not a pull request, and this proof runs inside the same workflow on
          // push to main. Inheriting the ambient value would make every scenario
          // below exit 0 on that run, and thirty of these assertions would flip
          // for a reason that has nothing to do with the check.
          GITHUB_EVENT_NAME: "pull_request",
        },
      });
      return { status: 0, out };
    } catch (e) {
      return { status: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The board set as it stands before any scenario touches it.
const BASE_BOARDS = {
  [P1]: board([{ id: "RC-01", status: "shipped" }]),
  [P2]: board([{ id: "FIX-01", status: "todo" }, { id: "FIX-02", status: "shipped" }]),
  [P3]: board([{ id: "EXT-16", status: "todo" }]),
};
const CODE = "lib/data/thing.ts";
const REPORT = "docs/reports/2026-09-04-executor-a-report.md";

// ===========================================================================
console.log("\n1. THE FAILING HALF THE DISPATCH NAMES: code under a card whose status does not move");
// ===========================================================================
{
  // This is #195, reduced to its bones. The branch carries application code
  // under EXT-16 and the board file IS edited in the same pull request, just not
  // for EXT-16. A check keyed on "was a board file touched" reports this green.
  const r = scenario({
    base: BASE_BOARDS,
    head: {
      ...BASE_BOARDS,
      [P3]: board([{ id: "EXT-16", status: "todo", notes: "a note edited on some other card's behalf" }]),
      [CODE]: "export const x = 1;\n",
    },
    branch: "card/ext-16",
    subjects: ["EXT-16: reconciliation moves onto our wire"],
  });
  record("a mutant carrying code with no board flip is REFUSED", r.status === 1, `exit ${r.status}\n${r.out}`);
  record("  ...and the refusal names the card and both statuses", /EXT-16: status is "todo" at the merge base AND at the head/.test(r.out), r.out);
  record("  ...and it is the status-unchanged verdict, not another one", /EXT-16.*status-unchanged/.test(r.out), r.out);
  record("  ...and the board file WAS modified in that same pull request", /board\s+1/.test(r.out), r.out);
}

// ===========================================================================
console.log("\n2. THE CONTROL, ON THE SAME FIXTURE: flip the card and it goes quiet");
// ===========================================================================
{
  const r = scenario({
    base: BASE_BOARDS,
    head: {
      ...BASE_BOARDS,
      [P3]: board([{ id: "EXT-16", status: "shipped" }]),
      [CODE]: "export const x = 1;\n",
    },
    branch: "card/ext-16",
    subjects: ["EXT-16: reconciliation moves onto our wire"],
  });
  record("the SAME pull request with the flip present PASSES", r.status === 0, `exit ${r.status}\n${r.out}`);
  record("  ...and the verdict reads todo -> shipped, flipped", /EXT-16.*todo\s+->\s+shipped\s+flipped/.test(r.out), r.out);
  record("  ...so the check is not simply refusing every branch that carries code", r.status === 0);
}

// ===========================================================================
console.log("\n3. THE CONTROL THE DISPATCH NAMES: a docs-only and a report-only pull request stay silent");
// ===========================================================================
{
  const docs = scenario({
    base: BASE_BOARDS,
    head: { ...BASE_BOARDS, "docs/LEARNINGS.md": "# learnings\na new entry\n", "decisions/inbox.md": "### R-125\n", "CLAUDE.md": "# rules\n" },
    branch: "doctrine/merge-is-apply",
    subjects: ["R-125: a ruling, which is a decision and never a card"],
  });
  record("a docs-and-doctrine pull request PASSES", docs.status === 0, `exit ${docs.status}\n${docs.out}`);
  record("  ...and says why, rather than passing silently", /changes no code/.test(docs.out), docs.out);

  const report = scenario({
    base: BASE_BOARDS,
    head: { ...BASE_BOARDS, [REPORT]: "# a report\n" },
    branch: "drain/final",
    subjects: ["REPORT: the queue drained to zero"],
  });
  record("a report-only pull request PASSES", report.status === 0, `exit ${report.status}\n${report.out}`);

  // AND THE BOARD ITSELF IS NOT CODE. A pull request that only moves cards is
  // exactly what the harness opens, and it must not be caught demanding a board
  // edit for a board edit.
  const boardOnly = scenario({
    base: BASE_BOARDS,
    head: { ...BASE_BOARDS, [P2]: board([{ id: "FIX-01", status: "in_flight" }, { id: "FIX-02", status: "shipped" }]) },
    branch: "board/dispatch",
    subjects: ["BOARD: FIX-01 picked up"],
  });
  record("a board-only pull request PASSES", boardOnly.status === 0, `exit ${boardOnly.status}\n${boardOnly.out}`);
}

// ===========================================================================
console.log("\n4. #192's shape: the card moved, and it did not move FAR ENOUGH");
// ===========================================================================
{
  // status-unchanged alone does NOT catch this: todo -> in_flight is a change.
  // The card's code merged while the board said the work was still in hand.
  const r = scenario({
    base: BASE_BOARDS,
    head: {
      ...BASE_BOARDS,
      [P2]: board([{ id: "FIX-01", status: "in_flight" }, { id: "FIX-02", status: "shipped" }]),
      "scripts/poc/run.sh": "#!/bin/sh\necho hi\n",
    },
    branch: "card/fix-01",
    subjects: ["FIX-01: the harness change"],
  });
  record("a card left in_flight at the head is REFUSED", r.status === 1, `exit ${r.status}\n${r.out}`);
  record("  ...with the not-terminal verdict, and a status change was present", /FIX-01.*todo\s+->\s+in_flight\s+not-terminal/.test(r.out), r.out);
  record("  ...and the message says the work is still in hand", /still in hand/.test(r.out), r.out);

  const blocked = scenario({
    base: BASE_BOARDS,
    head: {
      ...BASE_BOARDS,
      [P2]: board([{ id: "FIX-01", status: "blocked" }, { id: "FIX-02", status: "shipped" }]),
      "scripts/poc/run.sh": "#!/bin/sh\necho hi\n",
    },
    branch: "card/fix-01",
    subjects: ["FIX-01: the harness change"],
  });
  record("the CONTROL: blocked is a finished status and PASSES", blocked.status === 0, `exit ${blocked.status}\n${blocked.out}`);
}

// ===========================================================================
console.log("\n5. A CARD ALREADY SHIPPED IS NOT A LICENCE TO KEEP EDITING ITS CODE");
// ===========================================================================
{
  const r = scenario({
    base: BASE_BOARDS,
    head: { ...BASE_BOARDS, [CODE]: "export const x = 2;\n" },
    branch: "card/fix-02",
    subjects: ["FIX-02: one more change to the card that already shipped"],
  });
  record("shipped -> shipped with new code is REFUSED", r.status === 1 && /FIX-02.*status-unchanged/.test(r.out), `exit ${r.status}\n${r.out}`);
  record("  ...which is CLAUDE.md 2's answer: the follow-up work is a new card", /did not move/.test(r.out), r.out);
}

// ===========================================================================
console.log("\n6. FAIL CLOSED: code, and no card id anywhere");
// ===========================================================================
{
  const r = scenario({
    base: BASE_BOARDS,
    head: { ...BASE_BOARDS, [CODE]: "export const x = 3;\n" },
    branch: "hotfix/quick",
    subjects: ["fix the thing quickly"],
  });
  record("code under no card id at all is REFUSED", r.status === 1, `exit ${r.status}\n${r.out}`);
  record("  ...naming CLAUDE.md 2 rather than guessing a card", /Nothing is worked that is not a card/.test(r.out), r.out);

  // A RULING PREFIX IS NOT A CARD ID, and it does not become one by carrying
  // code. This is #179's shape, which merged on 2026-09-03, and the refusal is
  // correct: a ruling is a decision, and the work a decision causes is a card.
  const ruling = scenario({
    base: BASE_BOARDS,
    head: { ...BASE_BOARDS, "scripts/ext/serve-sample-documents.mjs": "// ttl\n" },
    branch: "board/dispatch",
    subjects: ["R-096, R-097: sample TTL becomes 24h"],
  });
  record("an R- prefixed pull request carrying code is REFUSED, not exempted", ruling.status === 1 && /names no card id/.test(ruling.out), `exit ${ruling.status}\n${ruling.out}`);

  // THE CONTROL FOR THE SAME ALLOW-LIST: the ruling prefix IS skipped, and a
  // ruling pull request that carries no code passes. Without this the case above
  // proves only that the check refuses, not that the allow-list works.
  const rulingDocs = scenario({
    base: BASE_BOARDS,
    head: { ...BASE_BOARDS, "decisions/inbox.md": "### R-096\n" },
    branch: "board/dispatch",
    subjects: ["R-096, R-097: sample TTL becomes 24h"],
  });
  record("the CONTROL: the same subjects with no code PASS, and the R- prefix is SKIPPED", rulingDocs.status === 0 && /R-\s+2/.test(rulingDocs.out), `exit ${rulingDocs.status}\n${rulingDocs.out}`);
}

// ===========================================================================
console.log("\n7. AN ID IT CANNOT RESOLVE IS A FAILURE, NEVER A PASS");
// ===========================================================================
{
  const r = scenario({
    base: BASE_BOARDS,
    head: { ...BASE_BOARDS, [CODE]: "export const x = 4;\n" },
    branch: "card/fix-99",
    subjects: ["FIX-99: a card nobody authored"],
  });
  record("a card id on no board REFUSES with exit 2", r.status === 2, `exit ${r.status}\n${r.out}`);
  record("  ...and names the token it could not resolve", /FIX-99/.test(r.out), r.out);

  // AND IT REFUSES ON A RECORD-ONLY PULL REQUEST TOO. The id question is asked
  // before the code question, because an unresolvable id is wrong whatever the
  // pull request touches.
  const docsOnly = scenario({
    base: BASE_BOARDS,
    head: { ...BASE_BOARDS, "docs/LEARNINGS.md": "# x\n" },
    branch: "card/fix-99",
    subjects: ["FIX-99: a card nobody authored"],
  });
  record("  ...on a record-only pull request as well", docsOnly.status === 2, `exit ${docsOnly.status}\n${docsOnly.out}`);

  // THE CONTROL: a run id in a subject prefix is not a card id and must not be
  // dragged into the resolver. `TRIAGE 20260904-071258: ...` is a real subject
  // shape on main.
  const runId = scenario({
    base: BASE_BOARDS,
    head: { ...BASE_BOARDS, "docs/poc/triage-latest.json": "{}\n" },
    branch: "triage/20260904-071258",
    subjects: ["TRIAGE 20260904-071258: rulings from the overnight run"],
  });
  record("the CONTROL: a run id is not read as a card id", runId.status === 0, `exit ${runId.status}\n${runId.out}`);
}

// ===========================================================================
console.log("\n8. FAIL CLOSED: a path the classifier has not been taught");
// ===========================================================================
{
  const r = scenario({
    base: BASE_BOARDS,
    head: { ...BASE_BOARDS, "Makefile": "all:\n\techo hi\n" },
    branch: "card/fix-01",
    subjects: ["FIX-01: add a Makefile"],
  });
  record("an unclassifiable path REFUSES the pull request", r.status === 1 && /not been taught to classify/.test(r.out), `exit ${r.status}\n${r.out}`);
  record("  ...naming the path, so the fix is one line in CLASSES", /Makefile/.test(r.out), r.out);
}

// ===========================================================================
console.log("\n9. A NEW CARD IS A BOARD EDIT, AND THE HOLE IS THE ONE THAT IS NAMED");
// ===========================================================================
{
  const r = scenario({
    base: BASE_BOARDS,
    head: {
      ...BASE_BOARDS,
      [P2]: board([
        { id: "FIX-01", status: "todo" },
        { id: "FIX-02", status: "shipped" },
        { id: "RULE-06", status: "shipped" },
      ]),
      "scripts/poc-free/check-board-edit.mjs": "// the check\n",
    },
    branch: "card/rule-06",
    subjects: ["RULE-06: the board-edit check"],
  });
  record("a card authored AND shipped in the same pull request PASSES", r.status === 0, `exit ${r.status}\n${r.out}`);
  record("  ...with the new-card verdict, said out loud rather than hidden", /RULE-06.*\(absent\)\s+->\s+shipped\s+new-card/.test(r.out), r.out);

  // AND THE SAME SHAPE LEFT AT todo IS STILL REFUSED, so "new card" is not a way
  // through: the card has to reach a finished status like any other.
  const stillTodo = scenario({
    base: BASE_BOARDS,
    head: {
      ...BASE_BOARDS,
      [P2]: board([
        { id: "FIX-01", status: "todo" },
        { id: "FIX-02", status: "shipped" },
        { id: "RULE-06", status: "todo" },
      ]),
      "scripts/poc-free/check-board-edit.mjs": "// the check\n",
    },
    branch: "card/rule-06",
    subjects: ["RULE-06: the board-edit check"],
  });
  record("  ...and a NEW card left at todo is still REFUSED", stillTodo.status === 1 && /not-terminal/.test(stillTodo.out), `exit ${stillTodo.status}\n${stillTodo.out}`);
}

// ===========================================================================
console.log("\n10. EVERY CARD ID ON THE BRANCH IS ASKED ABOUT, NOT ONLY THE FIRST");
// ===========================================================================
{
  const r = scenario({
    base: BASE_BOARDS,
    head: {
      ...BASE_BOARDS,
      [P2]: board([{ id: "FIX-01", status: "shipped" }, { id: "FIX-02", status: "shipped" }]),
      [P3]: board([{ id: "EXT-16", status: "todo" }]),
      [CODE]: "export const x = 5;\n",
    },
    branch: "card/fix-01",
    subjects: ["FIX-01: the first card", "EXT-16: the second card, whose board edit is missing"],
  });
  record("two card ids across two boards are both resolved", /2 distinct card id\(s\): EXT-16, FIX-01/.test(r.out), r.out);
  record("  ...and the one without a flip REFUSES the pull request", r.status === 1 && /EXT-16.*status-unchanged/.test(r.out), `exit ${r.status}\n${r.out}`);
  record("  ...while the one WITH a flip is reported satisfied", /satisfied 1 of 2/.test(r.out), r.out);
}

// ===========================================================================
console.log("\n11. THE COUNT LEDGERS, WHICH ARE WHAT KEEP A SILENT SKIP FROM READING AS CLEAN");
// ===========================================================================
{
  const r = scenario({
    base: BASE_BOARDS,
    head: {
      ...BASE_BOARDS,
      [P2]: board([{ id: "FIX-01", status: "shipped" }, { id: "FIX-02", status: "shipped" }]),
      [CODE]: "export const x = 6;\n",
      [REPORT]: "# report\n",
      "docs/LEARNINGS.md": "# l\n",
    },
    branch: "card/fix-01",
    subjects: ["FIX-01: the change", "R-125: a ruling written on the same branch"],
  });
  record("every changed path lands in a named class", r.status === 0 && /UNKNOWN/.test(r.out) === false, `exit ${r.status}\n${r.out}`);
  record("  ...the token ledger separates skipped from resolved", /resolved\s+2 token\(s\) -> 1 distinct card id\(s\)/.test(r.out) && /skipped\s+1 non-card prefix/.test(r.out), r.out);
  record("  ...and one verdict is produced for the one resolved card", /satisfied 1 of 1 card id\(s\)/.test(r.out), r.out);
}

// ===========================================================================
console.log("\n12. IT REFUSES RATHER THAN REPORTING CLEAN WHEN IT CANNOT READ ITS INPUTS");
// ===========================================================================
{
  const unparseable = scenario({
    base: BASE_BOARDS,
    head: { ...BASE_BOARDS, [P3]: "{ this is not json\n", [CODE]: "export const x = 7;\n" },
    branch: "card/fix-01",
    subjects: ["FIX-01: the change"],
  });
  record("a board that does not parse at the head REFUSES with exit 2", unparseable.status === 2 && /does not parse/.test(unparseable.out), `exit ${unparseable.status}\n${unparseable.out}`);

  const empty = scenario({
    base: BASE_BOARDS,
    head: { ...BASE_BOARDS, [P3]: board([]), [CODE]: "export const x = 8;\n" },
    branch: "card/fix-01",
    subjects: ["FIX-01: the change"],
  });
  record("a board with zero cards REFUSES with exit 2", empty.status === 2 && /zero cards/.test(empty.out), `exit ${empty.status}\n${empty.out}`);

  const gone = scenario({
    base: BASE_BOARDS,
    head: { [CODE]: "export const x = 9;\n" },
    branch: "card/fix-01",
    subjects: ["FIX-01: the change"],
  });
  record("a head with no board set at all REFUSES with exit 2", gone.status === 2 && /none of the 3 board files exist/.test(gone.out), `exit ${gone.status}\n${gone.out}`);

  const nobase = (() => {
    try {
      const out = execFileSync(process.execPath, [CHECK], {
        cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, RC_BOARD_EDIT_BASE: "refs/heads/a-ref-that-does-not-exist", GITHUB_BASE_REF: "", GITHUB_HEAD_REF: "", GITHUB_EVENT_NAME: "pull_request" },
      });
      return { status: 0, out };
    } catch (e) { return { status: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") }; }
  })();
  record("a base it cannot resolve REFUSES with exit 2", nobase.status === 2 && /FAIL-CLOSED/.test(nobase.out), `exit ${nobase.status}\n${nobase.out}`);
}

// ===========================================================================
console.log("\n13. THE PUSH-TO-MAIN RUN SAYS NOTHING WAS CHECKED, RATHER THAN SAYING IT IS CLEAN");
// ===========================================================================
{
  // The workflow runs on push to main as well as on pull requests. There the head
  // is already inside the base and there is no branch to ask about. The output
  // has to be distinguishable from a real pass, or a reader counts a check that
  // examined nothing as a check that examined everything.
  const dir = mkdtempSync(join(tmpdir(), "rc-board-edit-main-"));
  const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    mkdirSync(join(dir, "docs/board"), { recursive: true });
    for (const [rel, body] of Object.entries(BASE_BOARDS)) writeFileSync(join(dir, rel), body, "utf8");
    git("init", "-q", ".");
    git("config", "user.email", "proof@example.invalid");
    git("config", "user.name", "proof");
    git("add", "-A");
    git("commit", "-qm", "FIX-01: base");
    git("branch", "-q", "base-ref");
    let r;
    try {
      r = { status: 0, out: execFileSync(process.execPath, [CHECK], {
        cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, RC_BOARD_EDIT_GITROOT: dir, RC_BOARD_EDIT_BASE: "base-ref", RC_BOARD_EDIT_HEAD: "HEAD", GITHUB_BASE_REF: "", GITHUB_HEAD_REF: "", GITHUB_EVENT_NAME: "pull_request" },
      }) };
    } catch (e) { r = { status: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") }; }
    record("a head already contained in the base exits 0", r.status === 0, `exit ${r.status}\n${r.out}`);
    record("  ...and says NOT A PULL REQUEST, so the log distinguishes the two", /NOT A PULL REQUEST/.test(r.out) && /Nothing was checked/.test(r.out), r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ===========================================================================
console.log("\n14. AND THE SAME ANSWER FROM THE EVENT NAME, BEFORE ANY REF IS RESOLVED");
// ===========================================================================
{
  // The ancestry test above needs the base ref to exist. On a push run it may not
  // have been fetched, and "I could not resolve origin/main" would turn main red
  // for a reason that is about nobody's board. The event name is checked first,
  // and this is the case that proves it: an unresolvable base, on a push event,
  // exits 0 saying nothing was checked, where case 12 showed the SAME base exits
  // 2 on a pull request event.
  let r;
  try {
    r = { status: 0, out: execFileSync(process.execPath, [CHECK], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, RC_BOARD_EDIT_BASE: "refs/heads/a-ref-that-does-not-exist", GITHUB_EVENT_NAME: "push", GITHUB_BASE_REF: "", GITHUB_HEAD_REF: "" },
    }) };
  } catch (e) { r = { status: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") }; }
  record("a push event exits 0 before resolving anything", r.status === 0, `exit ${r.status}\n${r.out}`);
  record("  ...and says NOT A PULL REQUEST rather than reporting a clean check", /NOT A PULL REQUEST/.test(r.out) && /Nothing was checked/.test(r.out), r.out);
  record("  ...where the SAME unresolvable base exits 2 on a pull request event", results.find((x) => x.name === "a base it cannot resolve REFUSES with exit 2")?.pass === true);
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} of ${results.length} proofs passed`);
if (failed > 0) process.exit(1);
