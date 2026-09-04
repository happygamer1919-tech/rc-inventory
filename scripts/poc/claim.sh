#!/bin/bash
#
# Claim lease. Lets a human terminal and the unattended harness agree, without
# talking to each other, about who is working which card.
#
# The collision this prevents actually happened on 2026-08-27: EXECUTOR was
# working P2-09 by hand in /Users/ivan/rc-inventory while the scheduled harness
# picked up the same card in its own worktree, four times a day, with neither
# able to see the other.
#
# A claim is advisory and it expires. Six hours, deliberately: long enough to
# cover a working session, short enough that a claim left behind by a terminal
# that closed does not park a card forever.
#
# Usage:
#   scripts/poc/claim.sh claim   P2-09 executor    take a card
#   scripts/poc/claim.sh release P2-09             give it back
#   scripts/poc/claim.sh list                      show live claims
#   scripts/poc/claim.sh check   P2-09             exit 0 free, 3 claimed
#
# The claim is written to docs/poc/state.json through a PR, like every other
# change to that file. Never a direct push to main.
#
set -u -o pipefail

POC_STATE=docs/poc/state.json
POC_CLAIM_TTL_SECONDS=21600   # 6 hours, matches run.sh and eligible.mjs

# launchd hands over a minimal PATH, so the machine's own tool paths are named
# here. THE INHERITED PATH IS KEPT ON THE END rather than replaced: this script
# is now invoked by scripts/poc/test-board-set.sh in the quality job, where node
# lives somewhere else entirely and replacing PATH produced
# `claim.sh: line 79: node: command not found`. Prepending keeps the launchd
# case working and stops the script from being unrunnable anywhere else.
PATH=/Users/ivan/.local/bin:/Users/ivan/.local/share/mise/installs/node/22/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}
export PATH

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
cd "$REPO_ROOT" || { echo "FATAL: cannot enter $REPO_ROOT"; exit 1; }

ACTION=${1:-}
CARD_TYPED=${2:-}
ACTOR=${3:-$(whoami)}

usage() {
  echo "usage: scripts/poc/claim.sh claim|release|check <card-id> [actor]"
  echo "       scripts/poc/claim.sh list"
  exit 64
}

[ -z "$ACTION" ] && usage
if [ "$ACTION" != "list" ] && [ -z "$CARD_TYPED" ]; then usage; fi

# ---------------------------------------------------------------------------
# AUT-16. THE CARD ID IS RESOLVED AGAINST THE BOARD SET, AND THE BOARD'S OWN
# SPELLING IS WHAT GETS WRITTEN.
#
# This used to be `tr '[:lower:]' '[:upper:]'` and nothing else. Two defects came
# out of that. A claim on a phase 3 card was accepted against a harness that
# could not see phase 3 at all; and P3-04b was written into the claims map as
# P3-04B, which eligible.mjs then looked up verbatim and never found, so the
# lease silently protected nothing. Ids in this repository carry lower case
# suffixes and the owner types from a phone: fold the input, resolve it, and
# write back what the board says.
#
# An id on no board is REFUSED and named. A lease on a card that does not exist
# parks nothing and hides a typo.
# ---------------------------------------------------------------------------
if [ "$ACTION" != "list" ]; then
  CARD_ID=$(node -e '
    const typed = String(process.argv[1] || "").toUpperCase();
    import("./scripts/poc/boards.mjs").then((m) => {
      const index = m.cardIndex(m.loadBoards({ root: process.cwd() }));
      const hit = index.get(typed);
      if (!hit) {
        console.error("REFUSED: no card " + typed + " on any board in the set");
        process.exit(4);
      }
      console.log(hit.card.id);
    }).catch((err) => {
      console.error("REFUSED: " + err.message);
      process.exit(4);
    });
  ' "$CARD_TYPED") || exit 4
else
  CARD_ID=""
fi

# ---------------------------------------------------------------------------
# All claim reading and writing goes through node, so the TTL arithmetic and the
# JSON shape live in one place and match eligible.mjs exactly.
# ---------------------------------------------------------------------------
claims_tool() {
  node -e '
    const fs = require("fs");
    const [statePath, action, cardId, actor, ttlRaw] = process.argv.slice(1);
    const ttl = Number(ttlRaw);
    const now = Date.now();

    let state;
    try {
      state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch {
      console.error("FATAL: cannot read " + statePath);
      process.exit(1);
    }
    state.claims = state.claims || {};

    const live = (entry) => {
      if (!entry || !entry.claimed_by || !entry.claimed_at) return false;
      const at = Date.parse(entry.claimed_at);
      if (Number.isNaN(at)) return false;
      return (now - at) / 1000 <= ttl;
    };
    const ageOf = (entry) => Math.floor((now - Date.parse(entry.claimed_at)) / 60000);

    // Expired claims are dropped whenever the file is touched, so the file does
    // not accumulate leases nobody holds.
    for (const [id, entry] of Object.entries(state.claims)) {
      if (!live(entry)) delete state.claims[id];
    }

    if (action === "list") {
      const ids = Object.keys(state.claims).sort();
      if (ids.length === 0) console.log("no live claims");
      for (const id of ids) {
        const c = state.claims[id];
        console.log(id + " claimed by " + c.claimed_by + " at " + c.claimed_at + " (" + ageOf(c) + " minutes ago)");
      }
      process.exit(0);
    }

    const held = state.claims[cardId];

    if (action === "check") {
      if (held) {
        console.log(cardId + " is claimed by " + held.claimed_by + ", " + ageOf(held) + " minutes ago");
        process.exit(3);
      }
      console.log(cardId + " is free");
      process.exit(0);
    }

    if (action === "claim") {
      if (held && held.claimed_by !== actor) {
        console.log("REFUSED: " + cardId + " is claimed by " + held.claimed_by + ", " + ageOf(held) + " minutes ago");
        console.log("A claim expires after " + Math.floor(ttl / 3600) + " hours. Wait, or have them release it.");
        process.exit(3);
      }
      state.claims[cardId] = {
        claimed_by: actor,
        claimed_at: new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z"),
      };
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
      console.log(cardId + " claimed by " + actor);
      process.exit(0);
    }

    if (action === "release") {
      if (!held) {
        console.log(cardId + " was not claimed, nothing to release");
        process.exit(0);
      }
      if (held.claimed_by !== actor) {
        console.log("REFUSED: " + cardId + " is claimed by " + held.claimed_by + ", not by " + actor);
        console.log("Release it as that actor, or wait for the claim to expire.");
        process.exit(3);
      }
      delete state.claims[cardId];
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
      console.log(cardId + " released by " + actor);
      process.exit(0);
    }

    console.error("unknown action " + action);
    process.exit(64);
  ' "$POC_STATE" "$ACTION" "$CARD_ID" "$ACTOR" "$POC_CLAIM_TTL_SECONDS"
}

# list and check never write, so they never need a branch or a PR.
if [ "$ACTION" = "list" ] || [ "$ACTION" = "check" ]; then
  claims_tool
  exit $?
fi

# claim and release change state.json, which lands through a PR like every other
# change to that file.
git fetch origin --prune --quiet

BEFORE=$(git hash-object "$POC_STATE" 2>/dev/null)
claims_tool
TOOL_EXIT=$?
if [ "$TOOL_EXIT" -ne 0 ]; then
  git checkout -- "$POC_STATE" 2>/dev/null
  exit "$TOOL_EXIT"
fi
AFTER=$(git hash-object "$POC_STATE" 2>/dev/null)

if [ "$BEFORE" = "$AFTER" ]; then
  echo "state unchanged, no PR opened"
  exit 0
fi

CLAIM_BRANCH=poc/claim-$(echo "$CARD_ID" | tr '[:upper:]' '[:lower:]')-$(date +%Y%m%d-%H%M%S)
STASHED=$POC_STATE.claim-tmp
cp "$POC_STATE" "$STASHED"
git checkout -- "$POC_STATE" 2>/dev/null

# A branch off origin/main so the PR is never BEHIND on arrival, which is the
# state that stranded PR #44 for three runs.
git checkout -b "$CLAIM_BRANCH" origin/main --quiet
cp "$STASHED" "$POC_STATE"
rm -f "$STASHED"

git add "$POC_STATE"
if git diff --cached --quiet; then
  echo "nothing staged, no PR opened"
  git checkout --detach --force origin/main --quiet
  exit 0
fi

git -c user.name="POC" -c user.email="happygamer1919@gmail.com" \
  commit -q -m "POC: $ACTION $CARD_ID for $ACTOR

Claim lease bookkeeping only. docs/poc/state.json and nothing else.
No board file, no application code, no migration.

A claim is advisory and expires after $((POC_CLAIM_TTL_SECONDS / 3600)) hours."

git push -q -u origin "$CLAIM_BRANCH"
CLAIM_PR=$(gh pr create --base main --head "$CLAIM_BRANCH" \
  --title "POC: $ACTION $CARD_ID for $ACTOR" \
  --body "Claim lease bookkeeping. \`docs/poc/state.json\` only.

Actor: $ACTOR
Card: $CARD_ID
Action: $ACTION
Lease: expires after $((POC_CLAIM_TTL_SECONDS / 3600)) hours.

The harness reads this before it picks a card and skips anything claimed by
another actor within the lease window.

Acceptance: the file parses and \`scripts/poc/claim.sh list\` shows the change.
Migration files added: none." 2>/dev/null | tail -1)

echo "claim PR: $CLAIM_PR"
echo "The claim is live locally as soon as that PR merges. Until then the harness"
echo "still reads the old state from main."
