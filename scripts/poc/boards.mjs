#!/usr/bin/env node
//
// AUT-16. THE BOARD SET, AND THE ONLY PLACE IT IS WRITTEN DOWN.
//
// Until this file existed the harness knew about one board. run.sh line 23,
// inbox.mjs line 39 and notify.mjs line 27 each hardcoded
// docs/board/rc-board-phase2.json, so three separate components were blind to
// every phase 3 card at once:
//
//   - the Telegram reader answered `R P3-27 default` with "no card P3-27 on the
//     board", which is the owner's own decision channel refusing his decisions
//   - the digest counted shipped cards and the launch gate off that one board,
//     so twelve phase 3 cards shipped since 2026-08-30 were invisible
//   - the eligible-card selector, the claim writer and the silence rule all
//     computed against a board nobody was working, which is how a claim on
//     AUT-10 came to be written at the end of a run that spent its time on P3-11
//
// THE SET IS A LIST, NOT A REPOINT. Pointing the old constant at the phase 3
// board would have moved the blindness rather than removed it.
//
// ORDER MATTERS AND IS DELIBERATE: phase 3 first, then phase 2. The owner's
// stated priority is wave 1 and wave 2 of phase 3 (R-061 verbatim), and
// CLAUDE.md section 2's lowest-id rule applies WITHIN a board rather than across
// two id namespaces that were never designed to sort against each other. So the
// eligible list is: every eligible card of the first board in id order, then
// every eligible card of the second.
//
// A FOURTH BOARD IS A ONE-LINE CHANGE HERE and nothing else.
//
// Usage:
//   node scripts/poc/boards.mjs --paths            relative paths, one per line
//   node scripts/poc/boards.mjs --paths --absolute
//
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");

// The working set. Eligibility, claims, the digest and the answer channel all
// resolve against exactly these, in this order.
export const WORKING_BOARDS = [
  {
    path: "docs/board/rc-board-phase3.json",
    // Plain language, because the digest prints this to the owner and section 2
    // of CLAUDE.md forbids build vocabulary there.
    label: "the client and project work",
  },
  {
    path: "docs/board/rc-board-phase2.json",
    label: "the launch work",
  },
];

// The closed phase 1 board. NOT in the working set: a closed board has no
// eligible cards and no claims. It is listed here so that a tool which wants it
// for id resolution can name it without hardcoding a path, which is AUT-11's
// decision to make and not this card's.
export const CLOSED_BOARDS = [
  { path: "docs/board/rc-board.json", label: "the first phase, finished" },
];

export function boardPaths({ absolute = false, root = REPO_ROOT } = {}) {
  return WORKING_BOARDS.map((b) => (absolute ? path.join(root, b.path) : b.path));
}

// Load the working set. A board that cannot be read is reported rather than
// skipped in silence: silently working three boards when the set names four is
// the exact failure this file was written to end.
export function loadBoards({ root = REPO_ROOT, paths = null } = {}) {
  const entries = paths
    ? paths.map((p) => ({ path: p, label: labelFor(p) }))
    : WORKING_BOARDS;
  return entries.map((entry) => {
    const full = path.isAbsolute(entry.path) ? entry.path : path.join(root, entry.path);
    let board;
    try {
      board = JSON.parse(readFileSync(full, "utf8"));
    } catch (err) {
      throw new Error("board " + entry.path + " could not be read: " + err.message);
    }
    return { path: full, relative: entry.path, label: entry.label, board };
  });
}

function labelFor(p) {
  const base = path.basename(p);
  const known = [...WORKING_BOARDS, ...CLOSED_BOARDS].find((b) => path.basename(b.path) === base);
  return known ? known.label : base.replace(/\.json$/, "");
}

// Every card on the set, in board order then id order, each carrying the board
// it came from so a writer can put a ruling back where it belongs.
export function allCards(boards) {
  const out = [];
  for (const entry of boards) {
    const cards = (entry.board.cards || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    for (const card of cards) out.push({ card, board: entry });
  }
  return out;
}

// AMBIGUOUS CARD ID IS A BOARD DEFECT AND FAILS LOUDLY. Picking one of two
// cards wearing the same id is how a ruling lands on the wrong card, and
// CLAUDE.md section 8b already says an id names exactly one unit of work.
export function duplicateIds(boards) {
  const seen = new Map();
  const dupes = [];
  for (const { card, board } of allCards(boards)) {
    const key = String(card.id).toUpperCase();
    if (seen.has(key)) dupes.push({ id: card.id, boards: [seen.get(key), board.relative] });
    else seen.set(key, board.relative);
  }
  return dupes;
}

// Folded on BOTH sides. Ids carry lower-case suffixes (P3-04b, P3-11a) and the
// owner types from his phone; comparing a folded id against verbatim board ids
// rejected every ruling on every one of those cards.
export function cardIndex(boards) {
  const dupes = duplicateIds(boards);
  if (dupes.length) {
    throw new Error(
      "the same card id appears on more than one board, which is a board defect: " +
        dupes.map((d) => d.id + " on " + d.boards.join(" and ")).join("; "),
    );
  }
  const index = new Map();
  for (const { card, board } of allCards(boards)) index.set(String(card.id).toUpperCase(), { card, board });
  return index;
}

export function knownCardIds(boards) {
  return new Set(cardIndex(boards).keys());
}

const RUN_DIRECTLY = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (RUN_DIRECTLY) {
  const argv = process.argv.slice(2);
  if (argv.includes("--paths")) {
    for (const p of boardPaths({ absolute: argv.includes("--absolute") })) console.log(p);
  } else {
    console.error("usage: boards.mjs --paths [--absolute]");
    process.exit(2);
  }
}
