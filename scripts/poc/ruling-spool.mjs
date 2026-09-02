//
// P3-11a. The ruling spool. One process reads Telegram; the other reads a file.
//
// THE DEFECT THIS EXISTS TO CLOSE, AND IT WAS LIVE IN THE OWNER'S OWN DECISION
// PATH.
//
// Telegram's getUpdates is DESTRUCTIVE: calling it with an offset deletes every
// update below that offset, server side, for everybody. responder.sh polls every
// 60 seconds, classifies, deliberately does NOT answer ruling forms because
// inbox.mjs owns them, and then acknowledges the offset past EVERY update it
// read, rulings included. The comment above that acknowledgement explains why it
// acknowledges everything, and it is right: acknowledging only what it answered
// would leave every ignored message to be reclassified forever.
//
// So the ruling was deleted from Telegram within a minute of being sent, and
// inbox.mjs, which runs on the three hour harness cycle, never saw it. inbox.mjs
// already prints a line describing exactly this failure mode, which is how long
// it had been known.
//
// THE FIX IS ONE READER, NOT A CLEVERER OFFSET, and that is the card's default
// in the owner's words. Narrowing the acknowledgement re-opens the reclassify
// loop the current code exists to avoid.
//
// THIS IS THE SHAPE ASK-01 ALREADY USES, deliberately. ask.mjs says it in its
// own header: exactly one process reads Telegram, and it is the one that already
// did. chat-classify.mjs writes an answer file into the ask spool and ask.mjs
// reads it. Rulings now travel the same way through this file. A second spool
// rather than the same one, because an ask answer is consumed by a BLOCKED role
// within seconds and a ruling is consumed by the next harness run: one directory
// holding two lifetimes is a directory whose cleanup rule cannot be stated.
//
// NOTHING HERE TOUCHES THE NETWORK, HOLDS A TOKEN OR READS A SECRET.
//
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const RULING_DIR = process.env.POC_RULING_DIR || "/Users/ivan/rc-poc-logs/rulings";
export const PENDING_DIR = "pending";
export const CONSUMED_DIR = "consumed";

const pendingDir = (dir) => path.join(dir || RULING_DIR, PENDING_DIR);
const consumedDir = (dir) => path.join(dir || RULING_DIR, CONSUMED_DIR);

export function ensureRulingDirs(dir) {
  mkdirSync(pendingDir(dir), { recursive: true });
  mkdirSync(consumedDir(dir), { recursive: true });
}

/** The spool file for one update. Named by update_id, which Telegram makes unique. */
export function rulingPath(updateId, dir) {
  return path.join(pendingDir(dir), String(updateId) + ".json");
}

/**
 * Write one ruling-form message to the spool.
 *
 * THROWS ON FAILURE, DELIBERATELY. The caller must be able to tell a spooled
 * ruling from a lost one, because the caller is what decides whether the update
 * may be acknowledged to Telegram. A write that fails silently here would be
 * indistinguishable from a ruling that arrived, which is the exact defect this
 * file was written to remove.
 */
export function spoolRuling(entry, dir) {
  ensureRulingDirs(dir);
  const record = {
    update_id: entry.update_id,
    message_id: entry.message_id === undefined ? null : entry.message_id,
    from_id: entry.from_id === undefined ? null : entry.from_id,
    text: entry.text,
    at: new Date().toISOString(),
  };
  writeFileSync(rulingPath(entry.update_id, dir), JSON.stringify(record, null, 2) + "\n");
  return record;
}

/**
 * Every ruling waiting to be consumed, oldest first.
 *
 * SORTED BY update_id AND NOT BY FILENAME. Filenames sort as strings, so
 * update 100 would come before update 99 and two rulings on the same card would
 * be applied in the wrong order.
 *
 * A file that does not parse is REPORTED, not skipped silently: it carries a
 * decision the owner made, and losing it quietly is the thing this whole file
 * is about.
 */
export function pendingRulings(dir) {
  const from = pendingDir(dir);
  if (!existsSync(from)) return { rulings: [], unreadable: [] };
  const rulings = [];
  const unreadable = [];
  for (const name of readdirSync(from)) {
    if (!name.endsWith(".json")) continue;
    const full = path.join(from, name);
    try {
      const record = JSON.parse(readFileSync(full, "utf8"));
      if (!Number.isFinite(Number(record.update_id)) || typeof record.text !== "string") {
        unreadable.push({ path: full, reason: "no update_id or no text" });
        continue;
      }
      rulings.push({ ...record, _path: full });
    } catch (error) {
      unreadable.push({ path: full, reason: error.message });
    }
  }
  rulings.sort((a, b) => Number(a.update_id) - Number(b.update_id));
  return { rulings, unreadable };
}

/**
 * Move one consumed ruling out of pending.
 *
 * MOVED, NOT DELETED. The consumed directory is the record that the ruling
 * existed and was acted on, and it is the only copy: Telegram deleted the
 * original the moment the responder acknowledged it.
 */
export function archiveRuling(ruling, dir) {
  ensureRulingDirs(dir);
  const target = path.join(consumedDir(dir), path.basename(ruling._path));
  renameSync(ruling._path, target);
  return target;
}
