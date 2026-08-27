#!/usr/bin/env node
//
// The single definition of what the POC loop may work, and of what it may ask
// Ivan about. run.sh, notify.mjs and claim.sh all read it from here, because
// three copies of an eligibility rule is three chances for them to disagree
// about which card is next.
//
// Four questions, kept separate on purpose:
//
//   eligible     - CLAUDE.md section 2: status todo, blocked_on null, every
//                  depends_on shipped. This is what the harness may pick up.
//   reachable    - every depends_on shipped, whatever the status. A blocked card
//                  whose dependencies have not shipped cannot be unstuck by an
//                  answer, so asking for one is noise.
//   answerable   - blocked_on is ivan. A card blocked on andre or client is not
//                  something Ivan can unstick by typing, and offering him a
//                  reply line for it says otherwise.
//   claimed      - another actor holds a lease on it, per docs/poc/state.json.
//
// Usage:
//   node scripts/poc/eligible.mjs --board <path> --ids
//   node scripts/poc/eligible.mjs --board <path> --json [--state <path>]
//   node scripts/poc/eligible.mjs --board <path> --ids --actor harness
//
import { readFileSync } from "node:fs";

const CLAIM_TTL_SECONDS = 21600; // 6 hours, matches POC_CLAIM_TTL_SECONDS in run.sh

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = "true";
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export function shippedIds(board) {
  return new Set((board.cards || []).filter((c) => c.status === "shipped").map((c) => c.id));
}

// Every entry in depends_on has shipped. A card that fails this cannot be
// started and cannot be unblocked by an answer, no matter who is named on it.
export function isReachable(card, shipped) {
  return (card.depends_on || []).every((dep) => shipped.has(dep));
}

// CLAUDE.md section 2.
export function isEligible(card, shipped) {
  if (card.status !== "todo") return false;
  if (card.blocked_on !== null && card.blocked_on !== undefined) return false;
  return isReachable(card, shipped);
}

// Only Ivan can answer a card blocked on Ivan. Everything else is somebody
// else's turn, and the digest says so without inviting a reply.
export function isAnswerable(card) {
  return card.blocked_on === "ivan";
}

// A live claim held by somebody other than this actor. Expired claims are
// ignored: a lease that outlives the session that took it would park a card
// forever if a run died holding one.
export function claimFor(cardId, state, nowSeconds) {
  const claims = (state && state.claims) || {};
  const claim = claims[cardId];
  if (!claim || !claim.claimed_by || !claim.claimed_at) return null;
  const at = Date.parse(claim.claimed_at);
  if (Number.isNaN(at)) return null;
  const ageSeconds = nowSeconds - Math.floor(at / 1000);
  if (ageSeconds > CLAIM_TTL_SECONDS) return null;
  return { ...claim, age_seconds: ageSeconds };
}

// How long a card has been sitting, from its last checkpoint. last_checkpoint is
// date-only on some cards and a full ISO stamp on others, so both are parsed.
export function daysSince(checkpoint, nowSeconds) {
  if (!checkpoint) return null;
  const at = Date.parse(String(checkpoint).length === 10 ? checkpoint + "T00:00:00Z" : checkpoint);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((nowSeconds - Math.floor(at / 1000)) / 86400));
}

export function analyse(board, state, actor, nowSeconds) {
  const shipped = shippedIds(board);
  const cards = (board.cards || []).slice().sort((a, b) => a.id.localeCompare(b.id));

  const eligible = [];
  const blockedAnswerable = [];
  const waitingOnOthers = [];
  const unreachable = [];

  for (const card of cards) {
    if (card.status === "shipped") continue;
    const reachable = isReachable(card, shipped);
    const claim = claimFor(card.id, state, nowSeconds);

    if (isEligible(card, shipped)) {
      const entry = { id: card.id, title: card.title, claim };
      if (claim && claim.claimed_by !== actor) entry.skip_reason = "claimed by " + claim.claimed_by;
      eligible.push(entry);
      continue;
    }

    if (card.blocked_on) {
      if (!reachable) {
        unreachable.push({
          id: card.id,
          blocked_on: card.blocked_on,
          missing: (card.depends_on || []).filter((d) => !shipped.has(d)),
        });
      } else if (isAnswerable(card)) {
        blockedAnswerable.push({ id: card.id, title: card.title, card });
      } else {
        waitingOnOthers.push({
          id: card.id,
          title: card.title,
          owed_by: card.blocked_on,
          days_outstanding: daysSince(card.last_checkpoint, nowSeconds),
          card,
        });
      }
    }
  }

  return { eligible, blockedAnswerable, waitingOnOthers, unreachable };
}

// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2));
if (args.board) {
  const board = readJson(args.board, { cards: [] });
  const state = args.state ? readJson(args.state, {}) : {};
  const actor = args.actor || "harness";
  const now = Math.floor(Date.now() / 1000);
  const result = analyse(board, state, actor, now);

  if (args.json === "true") {
    // The full card objects are for importers, not for a log line. Strip them.
    const slim = {
      ...result,
      blockedAnswerable: result.blockedAnswerable.map(({ card, ...rest }) => rest),
      waitingOnOthers: result.waitingOnOthers.map(({ card, ...rest }) => rest),
    };
    console.log(JSON.stringify(slim, null, 2));
  } else if (args.ids === "true") {
    // Ids the harness may actually take: eligible and not claimed by anyone else.
    console.log(result.eligible.filter((e) => !e.skip_reason).map((e) => e.id).join(","));
  } else if (args["ids-all"] === "true") {
    // Every eligible id, claimed or not, so a run can tell "nothing eligible"
    // apart from "everything eligible is claimed".
    console.log(result.eligible.map((e) => e.id).join(","));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}
