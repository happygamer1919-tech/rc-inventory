#!/usr/bin/env node
// claims.mjs
// Card CLAIM-01. ONE FILE PER CLAIM, BECAUSE TWO BRANCHES CANNOT MERGE ONE MAP.
//
// ===========================================================================
// THE COLLISION, WHICH IS THE MECHANISM FAILING IN ITS DESIGN CASE
// ===========================================================================
//
// Claims used to live in a single `claims` object inside `docs/poc/state.json`.
// Two branches cut from one base, each claiming a DIFFERENT card, each rewrite
// that object. The first merges clean. The second CONFLICTS, and the conflict
// boundary runs THROUGH the JSON: the HEAD side keeps its claim's opening brace
// and the incoming side keeps its claim's closing brace, so a resolution that
// deletes only the marker characters yields a claims map that does not parse.
// That is the file the harness reads before it picks a card.
//
// TWO DIFFERENT ACTORS CLAIMING TWO DIFFERENT CARDS AT THE SAME TIME IS NOT AN
// EDGE CASE. It is the normal operation of a lease shared by a headless harness
// and a human terminal that cannot see each other. The mechanism failed exactly
// where it was needed.
//
// THE FIX IS TO MAKE THE WRITE MERGEABLE, NOT TO SERIALISE THE CLAIMS. Each
// claim is its own file, `docs/poc/claims/<CARD-ID>.json`. Two claims on two
// branches are two ADDS OF DIFFERENT PATHS, which git merges without overlap by
// construction and not by a merge driver anybody has to configure. A release is
// a file DELETION, which merges the same way. There is no shared line for two
// authors to land on.
//
// ===========================================================================
// THE LEGACY OBJECT IS STILL READ, AND THERE IS A REASON WITH A DATE ON IT
// ===========================================================================
//
// `scripts/poc/run.sh` writes the harness's own claim into `state.claims`, and
// run.sh is a DEPLOYED copy: `scripts/poc/install.sh` installs it into
// POC_BIN_DIR and installing is an owner action. A reader that stopped looking
// at `state.claims` would go blind to every harness claim between this merge and
// the next install, which is the split brain this card exists to avoid rather
// than create.
//
// So the reader is a UNION: the directory first, `state.claims` behind it. It
// costs one directory read and it removes the window entirely.
//
// THE HARNESS HALF IS NOT MOVED IN THIS CARD, AND THAT IS A DECISION NOT AN
// OVERSIGHT. Two runs never overlap, because `run.sh` takes a lock before it
// starts, so the single-object writer has no concurrent peer of its own kind.
// The pair that DID collide is a claim against a claim, and a claim against a
// harness state write, and both of those are now writes to different paths.
//
// ===========================================================================
// USAGE
// ===========================================================================
//
//   node scripts/poc/claims.mjs ttl-hours
//   node scripts/poc/claims.mjs list    [--state <path>]
//   node scripts/poc/claims.mjs check   <CARD-ID> [--state <path>]
//   node scripts/poc/claims.mjs claim   <CARD-ID> <actor> [--state <path>]
//   node scripts/poc/claims.mjs release <CARD-ID> <actor> [--state <path>]
//
// `check` exits 3 when the card is claimed, matching what `claim.sh check`
// has always exited. `claim` and `release` exit 3 when the lease belongs to
// somebody else. Nothing here touches git; `claim.sh` owns the branch and the
// pull request.
//
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

// 6 hours. THE ONE DEFINITION. eligible.mjs imports it from here rather than
// carrying its own copy, and run.sh and claim.sh name it in a comment beside
// their own constant so a drift is visible in a diff.
export const CLAIM_TTL_SECONDS = 21600;

export const DEFAULT_STATE_PATH = 'docs/poc/state.json';

/** The claims directory that belongs to a given state.json path. */
export function claimsDirFor(statePath) {
  return join(dirname(statePath), 'claims');
}

/**
 * The file a claim on `cardId` lives in.
 *
 * THE BOARD'S OWN SPELLING IS THE FILE NAME. `claim.sh` resolves what it was
 * typed against the board set before it gets here, for the reason AUT-16
 * records: a lease taken on `P3-04b` and stored as `P3-04B` was looked up
 * verbatim by the reader and never found, so it protected nothing and said
 * nothing. The reader below folds case anyway, so a file left by an older
 * writer is still seen.
 */
export function claimPathFor(statePath, cardId) {
  return join(claimsDirFor(statePath), `${cardId}.json`);
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function live(entry, nowSeconds) {
  if (!entry || !entry.claimed_by || !entry.claimed_at) return false;
  const at = Date.parse(entry.claimed_at);
  if (Number.isNaN(at)) return false;
  return nowSeconds - Math.floor(at / 1000) <= CLAIM_TTL_SECONDS;
}

/**
 * Every live claim, keyed by card id.
 *
 * THE DIRECTORY WINS OVER THE LEGACY OBJECT. If both carry the same card, the
 * file is the newer writer and the object is what an un-reinstalled run.sh left
 * behind. Preferring the object would let a stale deployed copy override a claim
 * somebody took today.
 *
 * A DIRECTORY THAT DOES NOT EXIST IS AN EMPTY SET AND NOT AN ERROR. A fresh
 * clone, or a fixture that only writes a state.json, must read as "no claims"
 * rather than throwing. A file inside it that does not parse is SKIPPED and
 * named on stderr, because a lease nobody can read is not a lease, and silence
 * about it is how a broken scanner reports a clean tree.
 */
export function readClaims({ statePath = DEFAULT_STATE_PATH, state = null, nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
  const claims = {};

  const legacy = (state === null ? readJson(statePath, {}) : state) || {};
  for (const [id, entry] of Object.entries(legacy.claims || {})) {
    if (live(entry, nowSeconds)) claims[id] = { ...entry, source: 'state.json' };
  }

  const dir = claimsDirFor(statePath);
  let names = [];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    names = [];
  }
  for (const name of names.sort()) {
    const entry = readJson(join(dir, name), null);
    if (entry === null) {
      process.stderr.write(`claims: ${join(dir, name)} does not parse and was skipped\n`);
      continue;
    }
    const id = entry.card || basename(name, '.json');
    if (live(entry, nowSeconds)) claims[id] = { ...entry, source: 'claims/' };
  }

  return claims;
}

/** The live claim on one card, folding case on both sides, or null. */
export function claimOn(cardId, claims) {
  const folded = String(cardId).toUpperCase();
  const key = Object.prototype.hasOwnProperty.call(claims, cardId)
    ? cardId
    : Object.keys(claims).find((k) => String(k).toUpperCase() === folded);
  return key === undefined ? null : claims[key];
}

/**
 * Write one claim file. Returns the path written.
 *
 * IT WRITES ONE PATH AND NOTHING ELSE. No expiry sweep, no rewrite of the other
 * claims, no touch of state.json. A writer that also tidied its neighbours would
 * put every claim back into one diff and re-create the collision this card
 * removes. Expiry is a READ concern here: an expired file is ignored by
 * `readClaims`, and it is deleted by whoever next claims or releases that card.
 */
export function writeClaim({ statePath = DEFAULT_STATE_PATH, cardId, actor, at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') }) {
  const dir = claimsDirFor(statePath);
  mkdirSync(dir, { recursive: true });
  const path = claimPathFor(statePath, cardId);
  writeFileSync(path, `${JSON.stringify({ card: cardId, claimed_by: actor, claimed_at: at }, null, 2)}\n`);
  return path;
}

/** Delete one claim file if it is there. Returns the path, or null. */
export function removeClaimFile({ statePath = DEFAULT_STATE_PATH, cardId }) {
  const path = claimPathFor(statePath, cardId);
  if (!existsSync(path)) return null;
  rmSync(path);
  return path;
}

/**
 * Drop a card from the legacy `state.claims` object, if it is there.
 *
 * THIS IS THE ONLY WRITE TO state.json LEFT ON THE CLAIM PATH, and it happens
 * only when there is a legacy entry to remove. Without it a release could not
 * end a lease an un-reinstalled run.sh had written, and a release that cannot
 * release is worse than the collision.
 */
export function removeLegacyClaim({ statePath = DEFAULT_STATE_PATH, cardId }) {
  const state = readJson(statePath, null);
  if (!state || !state.claims) return false;
  const claim = claimOn(cardId, state.claims);
  if (!claim) return false;
  const folded = String(cardId).toUpperCase();
  for (const key of Object.keys(state.claims)) {
    if (key === cardId || String(key).toUpperCase() === folded) delete state.claims[key];
  }
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return true;
}

function ageMinutes(entry, nowSeconds) {
  return Math.floor((nowSeconds - Math.floor(Date.parse(entry.claimed_at) / 1000)) / 60);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function main(argv) {
  const positional = [];
  let statePath = DEFAULT_STATE_PATH;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--state') { statePath = argv[i + 1]; i += 1; continue; }
    positional.push(argv[i]);
  }
  const [action, cardId, actor] = positional;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const claims = readClaims({ statePath, nowSeconds });

  // The lease window in hours, for callers that only want to PRINT it. claim.sh
  // asks rather than restating 21600 in shell, so the prose it shows a human
  // cannot drift from the arithmetic that decides the lease.
  if (action === 'ttl-hours') {
    console.log(String(Math.floor(CLAIM_TTL_SECONDS / 3600)));
    return 0;
  }

  if (action === 'list') {
    const ids = Object.keys(claims).sort();
    if (ids.length === 0) console.log('no live claims');
    for (const id of ids) {
      const c = claims[id];
      console.log(`${id} claimed by ${c.claimed_by} at ${c.claimed_at} (${ageMinutes(c, nowSeconds)} minutes ago, in ${c.source})`);
    }
    return 0;
  }

  if (!action || !cardId) {
    console.error('usage: node scripts/poc/claims.mjs list|check|claim|release <CARD-ID> [actor] [--state <path>]');
    return 64;
  }

  const held = claimOn(cardId, claims);

  if (action === 'check') {
    if (held) {
      console.log(`${cardId} is claimed by ${held.claimed_by}, ${ageMinutes(held, nowSeconds)} minutes ago`);
      return 3;
    }
    console.log(`${cardId} is free`);
    return 0;
  }

  if (action === 'claim') {
    if (held && held.claimed_by !== actor) {
      console.log(`REFUSED: ${cardId} is claimed by ${held.claimed_by}, ${ageMinutes(held, nowSeconds)} minutes ago`);
      console.log(`A claim expires after ${Math.floor(CLAIM_TTL_SECONDS / 3600)} hours. Wait, or have them release it.`);
      return 3;
    }
    writeClaim({ statePath, cardId, actor });
    console.log(`${cardId} claimed by ${actor}`);
    return 0;
  }

  if (action === 'release') {
    if (!held) {
      // An expired file is still on disk and is still worth removing, so this
      // is not a no-op even when nothing live was found.
      removeClaimFile({ statePath, cardId });
      console.log(`${cardId} was not claimed, nothing to release`);
      return 0;
    }
    if (held.claimed_by !== actor) {
      console.log(`REFUSED: ${cardId} is claimed by ${held.claimed_by}, not by ${actor}`);
      console.log('Release it as that actor, or wait for the claim to expire.');
      return 3;
    }
    removeClaimFile({ statePath, cardId });
    removeLegacyClaim({ statePath, cardId });
    console.log(`${cardId} released by ${actor}`);
    return 0;
  }

  console.error(`unknown action ${action}`);
  return 64;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  process.exit(main(process.argv.slice(2)));
}
