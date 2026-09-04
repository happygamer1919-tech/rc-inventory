#!/usr/bin/env node
// check-board-edit.mjs
// Card RULE-06. THE PULL REQUEST THAT CARRIES A CARD'S CODE CARRIES THAT CARD'S
// BOARD EDIT, AND A CHECK SAYS SO RATHER THAN A PARAGRAPH.
//
// ===========================================================================
// WHAT WENT WRONG, TWICE, IN ONE SESSION, AND WHY A MECHANISM
// ===========================================================================
//
// CLAUDE.md section 2 has said since it was written:
//
//     "The PR that carries the card's code also carries the board edit for that
//      card: status, evidence, last_checkpoint, notes, and the top-level as_of.
//      A code PR with a stale board is incomplete."
//
// On 2026-09-04 it was broken twice, by terminals that believed they were
// obeying it:
//
//   #192  AUT-17's harness code was authored with the card left `in_flight` and
//         `evidence: null`. It was caught on the branch and corrected before the
//         merge, and the shipped card's own evidence records that.
//
//   #195  EXT-16's application code merged to main with the card still `todo`.
//         This one was NOT caught before the merge. It merged an hour after the
//         same terminal had flagged #192 for the same rule.
//
// #195 IS THE CASE THAT SETTLES THE DESIGN, and it is the reason this file asks
// the question PER CARD ID rather than per file. That pull request DID modify
// `docs/board/rc-board-phase3.json`. It modified it by exactly two lines, and
// those lines were EXT-19's `notes`. A check that asked "was a board file
// touched" would have reported #195 green. The board was touched. The card that
// shipped was not.
//
// A RULE OBEYED BY EVERYONE WHO BELIEVED THEY WERE OBEYING IT NEEDS A MECHANISM.
// That sentence is the owner's and it is the whole justification for this file.
//
// ===========================================================================
// THE QUESTION IT ASKS
// ===========================================================================
//
//   1. Which card ids does this branch touch?  From the branch name and from
//      every commit subject prefix on the branch.
//   2. Does this pull request change any file that is CODE?
//   3. If it does, then for every one of those card ids: did that card's
//      `status` change on the board set, in this same pull request, and did it
//      land on a status that means the work is finished?
//
// If the answer to 3 is no for any card id, the pull request is refused.
//
// ===========================================================================
// THE THREE REFUSALS, NAMED, AND WHICH INCIDENT EACH ONE CLOSES
// ===========================================================================
//
// REFUSAL: status-unchanged
//   A card id whose code this pull request carries, whose `status` is IDENTICAL
//   at the merge base and at the head. This is #195 exactly.
//
// REFUSAL: not-terminal
//   A card id whose code this pull request carries and whose status at the head
//   is `todo` or `in_flight`. CLAUDE.md 2 says one card, one branch, one pull
//   request: a card's code arrives in exactly one pull request, so at the end of
//   that pull request the card is `shipped`, `blocked` or `halted`. This is #192
//   exactly, and `status-unchanged` alone would NOT have caught it, because
//   #192 as authored did move the card, from `todo` to `in_flight`.
//
//   The other half of #192, `evidence: null`, is NOT re-checked here.
//   `docs/board/validate-board.mjs` already fails the build on
//   `status: shipped` with `evidence: null`, it runs in the same job, and two
//   checks asking one question is how one of them stops being read. What the
//   validator cannot see is that the card was left short of `shipped` at all,
//   and that is this refusal.
//
// REFUSAL: code-with-no-card
//   A pull request that changes CODE and touches no card id at all. CLAUDE.md 2:
//   "Nothing is worked that is not a card." This is the fail-closed branch for
//   the shape the check cannot classify: it does not know what board edit to
//   look for, so it refuses rather than reporting clean.
//
// AND TWO REFUSALS ABOUT THE CHECK'S OWN INPUT, which exit 2 rather than 1
// because they mean the check could not do its job rather than that the pull
// request is wrong:
//
// REFUSAL: unresolved-card-id
//   A token shaped like a card id that resolves to no card on any board. "A card
//   id it cannot resolve is a failure, never a pass." `check-card-ids` asks the
//   same question of `origin/main`'s history; this asks it of the branch in
//   hand, which is the moment the id can still be fixed.
//
// REFUSAL: unclassified-path
//   A changed path that matches no rule in CLASSES below. The classifier is an
//   ordered list with a reason on every line, and anything it has not been
//   taught stops the merge until somebody classifies it. Adding a rule is a line
//   in a diff.
//
// ===========================================================================
// WHAT SATISFIES THE RULE, AND THE ONE HOLE THAT IS LEFT OPEN DELIBERATELY
// ===========================================================================
//
// A card id is satisfied when its status CHANGED between base and head, or when
// the card is NEW at the head. A card that does not exist on main has no status
// to change, and its arrival on the board IS the board edit for it; RULE-06
// itself is authored and shipped in the pull request that carries its code, and
// so was EXT-21 in #196.
//
// THAT IS A HOLE AND IT IS NAMED RATHER THAN CLOSED. A pull request could author
// a card directly at `shipped` and satisfy this check having never shown the
// work. Three things already stand in front of that, none of them this file:
// `validate-board.mjs` requires `evidence` on a shipped card, `check-card-ids`
// requires the id to resolve, and section 6 requires the acceptance to have been
// run. This check exists to catch FORGETTING, which is what happened twice on
// 2026-09-04, and a check aimed at a determined bypass would have to be a
// different and much noisier thing.
//
// ===========================================================================
// WHAT IT DOES NOT SEE, STATED RATHER THAN LEFT TO BE FOUND
// ===========================================================================
//
//   1. WHETHER THE BOARD EDIT IS TRUE. It reads that `status` moved. It cannot
//      read whether the evidence describes work that happened. Section 6 says
//      that part is on the executor and that lying about it is the one failure
//      this project has no recovery path for. Still true.
//   2. `evidence`, `last_checkpoint`, `notes` and `as_of`, all of which
//      CLAUDE.md 2 also requires. `validate-board.mjs` owns the evidence half.
//      The rest is not mechanised by anything and this file does not pretend
//      otherwise.
//   3. A CARD ID A BRANCH TOUCHES WITHOUT NAMING. If a pull request changes a
//      card's code and neither its branch name nor any commit subject carries
//      the id, the id is invisible here. What catches that is
//      `code-with-no-card`, which refuses the pull request outright, so the
//      failure mode is a refusal rather than a silent pass.
//   4. A CARD ID WRITTEN AFTER THE COLON. `BOARD: EXT-21, a state endpoint ...`
//      is a real subject on main and this check reads only the text BEFORE the
//      first colon, exactly as `check-card-ids` does. That is how a card is
//      AUTHORED without being claimed as worked, which is a shape this
//      repository uses on purpose: #196 authored EXT-21 that way and RULE-06's
//      own pull request authors AUT-23 that way. It is also, unavoidably, a way
//      to hide an id from this check. The reason it is tolerable is that hiding
//      the id does not hide the CODE: the pull request still has to name some
//      card whose status moves, or be refused by `code-with-no-card`.
//
// No network, no database, no secret.

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

// TESTABILITY OVERRIDES, the same pattern check-no-destructive-migration uses,
// so prove-board-edit.mjs can point every input at a throwaway repository and
// watch each refusal fire on a fixture built for it. Without them the whole
// selection half of this check is a claim rather than a proof.
const GITROOT = process.env.RC_BOARD_EDIT_GITROOT || ROOT;
const HEAD = process.env.RC_BOARD_EDIT_HEAD || "HEAD";
const BASE =
  process.env.RC_BOARD_EDIT_BASE ||
  (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/main");

// --- THE BOARD SET -----------------------------------------------------------
// Explicit and not a directory glob, for the reason check-card-ids gives for its
// own list: a board file appearing in docs/board/ is somebody adding a board and
// it should be a line in a diff rather than a silent widening of what this check
// reads.
const BOARDS = [
  "docs/board/rc-board.json",
  "docs/board/rc-board-phase2.json",
  "docs/board/rc-board-phase3.json",
];

// --- A STATUS THAT MEANS THE WORK IS FINISHED --------------------------------
// CLAUDE.md 2's lifecycle: todo -> in_flight -> shipped or blocked, with halted
// reserved for the failure ceiling in section 10. The first two mean the work is
// still in hand, and a pull request that has already merged the code is not
// still in hand.
const TERMINAL_STATUSES = new Set(["shipped", "blocked", "halted"]);

// --- THE PATH CLASSIFIER, ORDERED, FIRST MATCH WINS --------------------------
// Every rule carries its reason. `code: true` means "a change here is work under
// a card and the board must move". Anything matching nothing is UNCLASSIFIED and
// refuses the pull request.
const CLASSES = [
  {
    name: "board",
    code: false,
    why: "the board set itself. Its edit is the thing being asked for, so it cannot also be the thing that demands one.",
    test: (p) => BOARDS.includes(p),
  },
  {
    name: "record",
    code: false,
    why: "the board TEMPLATE and its readme. A template carries no card and describes the shape a board takes.",
    test: (p) => p === "docs/board/BOARD-TEMPLATE.json" || p === "docs/board/BOARD-TEMPLATE.README.md",
  },
  {
    name: "code",
    code: true,
    why: "the board renderer, the validator and the board app are programs, and they live under docs/board/ for historical reasons only.",
    test: (p) => p.startsWith("docs/board/"),
  },
  {
    name: "record",
    code: false,
    why: "reports, learnings, contracts, runbooks, migration logs and the doctrine files. Section 9b calls a report a committed artefact; it is a record of work, never work.",
    test: (p) => p.startsWith("docs/") || p.startsWith("decisions/"),
  },
  {
    name: "record",
    code: false,
    why: "the standing rules and the repository readme. A doctrine edit is a decision, and decisions are rulings rather than cards.",
    test: (p) => p === "CLAUDE.md" || p === "README.md",
  },
  {
    name: "record",
    code: false,
    why: ".gitignore changes what git tracks and executes nothing.",
    test: (p) => p === ".gitignore",
  },
  {
    name: "code",
    code: true,
    why: "the product, its libraries, its tests, its schema, its scripts and its workflows.",
    test: (p) =>
      p.startsWith("app/") ||
      p.startsWith("components/") ||
      p.startsWith("lib/") ||
      p.startsWith("scripts/") ||
      p.startsWith("tests/") ||
      p.startsWith("supabase/") ||
      p.startsWith("public/") ||
      p.startsWith(".github/"),
  },
  {
    name: "code",
    code: true,
    why: "a configuration or source file at the repository root. package.json, tsconfig.json, next.config.ts, proxy.ts and playwright.config.ts all change how the product builds or runs.",
    test: (p) => !p.includes("/") && /\.(ts|tsx|js|jsx|mjs|cjs|json|yml|yaml)$/.test(p),
  },
];

// --- CARD ID SHAPE, AND THE NON-CARD PREFIXES --------------------------------
// Both are copied in spirit from check-card-ids.mjs and are deliberately NOT
// imported from it. That file answers a question about origin/main's history and
// this one answers a question about a branch; binding them into one module would
// mean a change made for one surface silently changes the other, and the two are
// allowed to diverge.
//
// A card id starts with a letter, so `TRIAGE 20260904-071258: ...`, which is a
// real subject shape on main, does not read a run id as a card id.
const CARD_ID = /^[A-Za-z][A-Za-z0-9]*-[0-9]+[a-z]?$/;

const NON_CARD_PREFIXES = [
  { prefix: "R-", why: "a ruling in decisions/inbox.md. A decision is not a unit of work and is never on a board." },
  { prefix: "POC-", why: "a harness commit, per CLAUDE.md section 13." },
  { prefix: "INC-", why: "an incident record. A thing that happened, not a card somebody picked up." },
];

// =============================================================================

const git = (args, opts = {}) =>
  execFileSync("git", args, { cwd: GITROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });

/** Exit 2. The check could not do its job. Never renders as clean. */
function cannotClassify(lines) {
  console.error("");
  console.error("check-board-edit: FAIL-CLOSED. The check cannot establish what it is looking at.");
  for (const l of lines) console.error(`  ${l}`);
  console.error("");
  console.error('"I could not look" and "nothing is wrong" must never render as the same result.');
  process.exit(2);
}

// --- 1. RESOLVE THE TWO ENDS -------------------------------------------------

// THE WORKFLOW RUNS ON `push` TO main AS WELL AS ON PULL REQUESTS, and on that
// run there is no branch, no card and nothing to ask. It is answered here, before
// any ref is resolved, rather than by relying on the ancestry test below: on a
// push run the base ref may not have been fetched at all, and "I could not
// resolve origin/main" would then turn main red for a reason that is not about
// anybody's board.
const EVENT = process.env.GITHUB_EVENT_NAME || "";
if (EVENT && EVENT !== "pull_request" && EVENT !== "pull_request_target") {
  console.log("check-board-edit");
  console.log(`  event       ${EVENT}`);
  console.log("");
  console.log(`check-board-edit: NOT A PULL REQUEST. The ${EVENT} event carries no branch and no`);
  console.log("card to ask about. Nothing was checked.");
  process.exit(0);
}

let baseSha;
let headSha;
let mergeBase;
try {
  try {
    baseSha = git(["rev-parse", "--verify", `${BASE}^{commit}`]).trim();
  } catch {
    // A shallow or single-ref checkout may not carry the base branch. Fetch it
    // once, exactly as check-card-ids does for origin/main, rather than falling
    // back to something that is not the base.
    const short = BASE.replace(/^origin\//, "");
    git(["fetch", "--no-tags", "--quiet", "origin", `+refs/heads/${short}:refs/remotes/origin/${short}`]);
    baseSha = git(["rev-parse", "--verify", `refs/remotes/origin/${short}^{commit}`]).trim();
  }
  headSha = git(["rev-parse", "--verify", `${HEAD}^{commit}`]).trim();
  mergeBase = git(["merge-base", baseSha, headSha]).trim();
} catch (err) {
  cannotClassify([
    `could not resolve base=${BASE} head=${HEAD} in ${GITROOT}`,
    String((err && err.message) || err).split("\n")[0],
  ]);
}

console.log("check-board-edit");
console.log(`  base        ${BASE} (${baseSha.slice(0, 7)})`);
console.log(`  head        ${HEAD} (${headSha.slice(0, 7)})`);
console.log(`  merge base  ${mergeBase.slice(0, 7)}`);

// A HEAD THAT IS ALREADY IN THE BASE IS NOT A PULL REQUEST. This is the push-to-
// main run of the workflow, where there is no branch and no card to ask about.
// It is stated out loud rather than passed silently, so a reader of the log can
// tell "there was nothing to check" apart from "everything checked out".
if (mergeBase === headSha) {
  console.log("");
  console.log("check-board-edit: NOT A PULL REQUEST. The head is already contained in the base,");
  console.log("so there is no branch and no card to ask about. Nothing was checked.");
  process.exit(0);
}

// --- 2. CLASSIFY EVERY CHANGED PATH ------------------------------------------

let changed;
try {
  changed = git(["diff", "--name-only", `${mergeBase}...${headSha}`])
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
} catch (err) {
  cannotClassify([`git diff failed`, String((err && err.message) || err).split("\n")[0]]);
}

const byClass = new Map();
const unclassified = [];
for (const path of changed) {
  const rule = CLASSES.find((c) => c.test(path));
  if (!rule) {
    // REFUSAL: unclassified-path
    unclassified.push(path);
    continue;
  }
  if (!byClass.has(rule.name)) byClass.set(rule.name, []);
  byClass.get(rule.name).push({ path, why: rule.why, code: rule.code });
}

const codeFiles = [...byClass.values()].flat().filter((e) => e.code);

console.log(`  changed     ${changed.length} path(s)`);
for (const [name, entries] of [...byClass.entries()].sort()) {
  console.log(`    ${name.padEnd(8)} ${String(entries.length).padStart(3)}`);
}
if (unclassified.length > 0) console.log(`    ${"UNKNOWN".padEnd(8)} ${String(unclassified.length).padStart(3)}`);

// THE FIRST COUNT ASSERTION. Every path handed in is either in a class or in the
// unclassified list. They diverge exactly when a path was silently dropped, and
// a check that silently skips its input reports success about work it did not do.
const classified = [...byClass.values()].flat().length;
if (classified + unclassified.length !== changed.length) {
  cannotClassify([
    "INPUT AND CLASSIFICATION COUNT DIVERGE.",
    `handed in: ${changed.length}`,
    `accounted for: ${classified + unclassified.length} (${classified} classified, ${unclassified.length} unclassified)`,
    "A path that was neither classified nor refused was silently dropped.",
  ]);
}

if (unclassified.length > 0) {
  console.error("");
  console.error("REFUSED. This pull request changes paths this check has not been taught to classify.");
  for (const p of unclassified) console.error(`  ${p}`);
  console.error("");
  console.error("It cannot tell whether these are work under a card or a record of work, so it");
  console.error("refuses rather than guessing. Add a rule to CLASSES in this file, with its");
  console.error("reason next to it, so the decision is readable in a diff.");
  process.exit(1);
}

// --- 3. HARVEST THE CARD IDS THE BRANCH TOUCHES ------------------------------

const branch =
  process.env.RC_BOARD_EDIT_BRANCH ||
  process.env.GITHUB_HEAD_REF ||
  (() => {
    try {
      const b = git(["rev-parse", "--abbrev-ref", HEAD]).trim();
      return b === "HEAD" ? "" : b;
    } catch {
      return "";
    }
  })();

/** Tokens from the branch name, when it is a `card/<id>` branch. */
function tokensFromBranch(name) {
  const m = /^card\/(.+)$/.exec(name || "");
  if (!m) return [];
  const rest = m[1];
  if (CARD_ID.test(rest)) return [rest];
  // A branch named beyond the bare id (`card/ext-16-tolerance`) still yields its
  // id. The commit subjects are the authoritative source, so a branch name this
  // cannot read contributes nothing rather than refusing.
  const lead = /^[A-Za-z][A-Za-z0-9]*-[0-9]+[a-z]?/.exec(rest);
  return lead ? [lead[0]] : [];
}

/** Tokens from every commit subject prefix on the branch. */
function tokensFromSubjects() {
  const subjects = git(["log", `${mergeBase}..${headSha}`, "--format=%s"])
    .split("\n")
    .filter(Boolean);
  const out = [];
  for (const subject of subjects) {
    const colon = subject.indexOf(":");
    if (colon < 0) continue;
    for (const token of subject.slice(0, colon).split(/[,\s]+/).filter(Boolean)) out.push(token);
  }
  return { subjects, out };
}

const { subjects, out: subjectTokens } = tokensFromSubjects();
if (subjects.length === 0) {
  cannotClassify([
    `${mergeBase.slice(0, 7)}..${headSha.slice(0, 7)} yielded zero commit subjects`,
    "A branch with no commits of its own cannot be the branch of a pull request.",
    "An empty list satisfies every assertion below while reading nothing.",
  ]);
}

const candidates = [...tokensFromBranch(branch), ...subjectTokens];
const shaped = candidates.filter((t) => CARD_ID.test(t));

console.log(`  branch      ${branch || "(detached, no name available)"}`);
console.log(`  commits     ${subjects.length}`);
console.log(`  id tokens   ${shaped.length} of ${candidates.length} candidate(s) are shaped like a card id`);

// --- 4. RESOLVE EVERY SHAPED TOKEN AGAINST THE BOARD SET AT THE HEAD ---------

/** The board set at one ref. Returns id -> status, canonicalised by lower case. */
function boardAt(ref) {
  const byLower = new Map();
  let present = 0;
  for (const rel of BOARDS) {
    let text;
    try {
      text = git(["show", `${ref}:${rel}`]);
    } catch {
      // A board that does not exist at this ref. At the BASE that is a board
      // being introduced, which is legitimate. At the HEAD it is checked below.
      continue;
    }
    present += 1;
    let board;
    try {
      board = JSON.parse(text);
    } catch (err) {
      cannotClassify([
        `${rel} does not parse at ${ref}`,
        String((err && err.message) || err).split("\n")[0],
        "Refusing to report OK against a board that cannot be read.",
      ]);
    }
    const cards = board.cards || [];
    if (cards.length === 0) {
      cannotClassify([
        `${rel} carries zero cards at ${ref}`,
        "A board with no cards makes every id unresolvable, or worse, makes an empty",
        "card list look clean.",
      ]);
    }
    for (const card of cards) {
      if (card && card.id) byLower.set(String(card.id).toLowerCase(), { id: card.id, status: card.status, board: rel });
    }
  }
  return { byLower, present };
}

const head = boardAt(headSha);
if (head.present === 0) {
  cannotClassify([
    `none of the ${BOARDS.length} board files exist at the head`,
    "The board set is the thing this check reads. Without it there is nothing to say.",
  ]);
}
const base = boardAt(mergeBase);

const skipped = [];
const resolved = new Map(); // canonical id -> its entry at the head
const unresolved = [];
let resolvedTokens = 0;
for (const token of shaped) {
  const exempt = NON_CARD_PREFIXES.find((e) => token.toUpperCase().startsWith(e.prefix));
  if (exempt) {
    skipped.push({ token, why: exempt.why });
    continue;
  }
  const hit = head.byLower.get(token.toLowerCase());
  if (!hit) {
    // REFUSAL: unresolved-card-id
    unresolved.push(token);
    continue;
  }
  resolvedTokens += 1;
  resolved.set(hit.id, hit);
}

// THE SECOND COUNT ASSERTION, AND IT IS THE ONE THE DISPATCH NAMES. Every token
// shaped like a card id leaves this loop through exactly one of three doors. A
// token that fell out of all three is a token this check read and then forgot,
// and the result would be a clean report covering an id nobody looked at.
if (skipped.length + resolvedTokens + unresolved.length !== shaped.length) {
  cannotClassify([
    "TOKEN AND OUTCOME COUNT DIVERGE.",
    `shaped like a card id: ${shaped.length}`,
    `accounted for: ${skipped.length + resolvedTokens + unresolved.length}` +
      ` (${skipped.length} skipped, ${resolvedTokens} resolved, ${unresolved.length} unresolved)`,
    "A token that was neither skipped, resolved nor refused was silently dropped.",
  ]);
}
if (resolved.size > resolvedTokens) {
  cannotClassify([
    "DISTINCT IDS EXCEED RESOLVED TOKENS.",
    `${resolvedTokens} token(s) resolved but ${resolved.size} distinct id(s) are held for checking`,
    "An id entered the map without a token behind it.",
  ]);
}

console.log(`    resolved  ${resolvedTokens} token(s) -> ${resolved.size} distinct card id(s): ${[...resolved.keys()].sort().join(", ") || "(none)"}`);
console.log(`    skipped   ${skipped.length} non-card prefix(es)`);
for (const e of NON_CARD_PREFIXES) {
  const hits = skipped.filter((s) => s.why === e.why).length;
  if (hits > 0) console.log(`      ${e.prefix.padEnd(6)} ${String(hits).padStart(3)}  ${e.why}`);
}

if (unresolved.length > 0) {
  console.error("");
  console.error(`REFUSED. ${unresolved.length} token(s) shaped like a card id resolve to no card on any board.`);
  for (const t of [...new Set(unresolved)]) console.error(`  ${t}`);
  console.error("");
  console.error("A card id this check cannot resolve is a failure and never a pass: it cannot");
  console.error("ask whether a card moved when it cannot find the card. Author the card, or, if");
  console.error("the prefix is genuinely not a card id, add it to NON_CARD_PREFIXES in this file");
  console.error("with the reason next to it.");
  process.exit(2);
}

// --- 5. THE RULE ITSELF ------------------------------------------------------

if (codeFiles.length === 0) {
  console.log("");
  console.log("check-board-edit: OK. This pull request changes no code, so CLAUDE.md 2's");
  console.log("board-edit requirement does not bind it. Record-only pull requests -- reports,");
  console.log("rulings, doctrine, the board itself -- pass here by design.");
  process.exit(0);
}

console.log(`  code        ${codeFiles.length} file(s) carry the rule`);
for (const f of codeFiles.slice(0, 12)) console.log(`    ${f.path}`);
if (codeFiles.length > 12) console.log(`    ... and ${codeFiles.length - 12} more`);

if (resolved.size === 0) {
  // REFUSAL: code-with-no-card
  console.error("");
  console.error("REFUSED. This pull request changes code and names no card id anywhere.");
  console.error("");
  console.error(`  branch:   ${branch || "(no name available)"}`);
  console.error(`  commits:  ${subjects.length}`);
  for (const s of subjects.slice(0, 8)) console.error(`    ${s}`);
  console.error("");
  console.error('CLAUDE.md 2: "Nothing is worked that is not a card." This check does not know');
  console.error("which board edit to look for, so it refuses rather than reporting clean. Name");
  console.error("the card in the branch (card/<id>) or in a commit subject prefix (<ID>: ...).");
  process.exit(1);
}

const verdicts = [];
for (const [id, at] of resolved) {
  const before = base.byLower.get(id.toLowerCase());
  if (!before) {
    verdicts.push({ id, outcome: "new-card", from: "(absent)", to: at.status, board: at.board });
  } else if (before.status !== at.status) {
    verdicts.push({ id, outcome: "flipped", from: before.status, to: at.status, board: at.board });
  } else {
    // REFUSAL: status-unchanged
    verdicts.push({ id, outcome: "status-unchanged", from: before.status, to: at.status, board: at.board });
  }
  const last = verdicts[verdicts.length - 1];
  if (last.outcome !== "status-unchanged" && !TERMINAL_STATUSES.has(at.status)) {
    // REFUSAL: not-terminal
    last.outcome = "not-terminal";
  }
}

// THE THIRD COUNT ASSERTION. One verdict per resolved card id, no more and no
// fewer. A card id that reached this point without a verdict would be a card
// nobody asked about, inside a report that says everything is fine.
if (verdicts.length !== resolved.size) {
  cannotClassify([
    "RESOLVED AND VERDICT COUNT DIVERGE.",
    `resolved: ${resolved.size}`,
    `verdicts: ${verdicts.length}`,
    "A card id reached the rule and produced no answer.",
  ]);
}

console.log("");
console.log("  card id      board                             status at base -> at head   verdict");
for (const v of verdicts.sort((a, b) => a.id.localeCompare(b.id))) {
  console.log(
    `  ${v.id.padEnd(12)} ${v.board.replace("docs/board/", "").padEnd(24)} ${String(v.from).padEnd(12)} -> ${String(v.to).padEnd(12)} ${v.outcome}`,
  );
}

const bad = verdicts.filter((v) => v.outcome === "status-unchanged" || v.outcome === "not-terminal");
const satisfied = verdicts.length - bad.length;
console.log("");
console.log(`  satisfied ${satisfied} of ${verdicts.length} card id(s)`);

if (bad.length > 0) {
  console.error("");
  console.error("REFUSED. This pull request carries code under a card whose board edit is missing.");
  console.error("");
  for (const v of bad) {
    if (v.outcome === "status-unchanged") {
      console.error(`  ${v.id}: status is "${v.to}" at the merge base AND at the head. It did not move.`);
    } else {
      console.error(`  ${v.id}: status is "${v.to}" at the head, which means the work is still in hand.`);
    }
  }
  console.error("");
  console.error("CLAUDE.md 2: the pull request that carries the card's code also carries the board");
  console.error("edit for that card. A code pull request with a stale board is incomplete, and a");
  console.error("board edit landed separately from its code is a board that lies about a commit");
  console.error("that does not exist yet.");
  console.error("");
  console.error("It was broken twice on 2026-09-04 by terminals that believed they were obeying");
  console.error("it. #195 merged EXT-16's code with the card still todo, and the board file WAS");
  console.error("touched in that pull request, which is why this check asks per card id and not");
  console.error("per file. Flip the card in this pull request. Do not land the board edit");
  console.error("separately.");
  process.exit(1);
}

console.log("");
console.log("check-board-edit: OK. Every card id this branch touches carries its board edit here.");
