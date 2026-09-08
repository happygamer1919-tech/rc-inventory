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
# CLAIM-01. One file per claim, so two claims never land on one line. The TTL
# itself lives in scripts/poc/claims.mjs, which is the only place that computes
# it; run.sh names 21600 beside its own copy so a drift shows in a diff.
POC_CLAIMS_DIR=docs/poc/claims

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

# The lease window, READ FROM THE MODULE THAT DEFINES IT rather than restated
# here. It only ever appears in prose printed to a human, so a stale copy would
# be a message that lies about the mechanism it is describing.
POC_CLAIM_TTL_HOURS=$(node "$SCRIPT_DIR/claims.mjs" ttl-hours 2>/dev/null)
POC_CLAIM_TTL_HOURS=${POC_CLAIM_TTL_HOURS:-6}

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
# All claim reading and writing goes through scripts/poc/claims.mjs, so the TTL
# arithmetic and the JSON shape live in ONE place and match eligible.mjs exactly.
# eligible.mjs imports the same module.
#
# CARD CLAIM-01 MOVED THE STORE OUT OF ONE JSON OBJECT. A claim is now its own
# file, docs/poc/claims/<CARD-ID>.json, so two claims taken at the same time on
# two branches are two adds of DIFFERENT paths and git merges them without
# overlap. The single `claims` object in docs/poc/state.json conflicted THROUGH
# the JSON, and the resolution that deleted only the marker characters left a
# claims map that did not parse. The module still READS that object, because
# run.sh is a deployed copy that writes it until somebody reinstalls.
#
# This block used to be a node -e program written inline here. It moved so that
# scripts/poc-free/prove-claim-merge.mjs can drive the SHIPPED writer rather than
# a copy of it: a proof that exercises a re-statement of the logic proves only
# that the proof agrees with itself.
# ---------------------------------------------------------------------------
claims_tool() {
  node "$SCRIPT_DIR/claims.mjs" "$ACTION" ${CARD_ID:+"$CARD_ID"} ${ACTOR:+"$ACTOR"} --state "$POC_STATE"
}

# list and check never write, so they never need a branch or a PR.
if [ "$ACTION" = "list" ] || [ "$ACTION" = "check" ]; then
  claims_tool
  exit $?
fi

# claim and release change docs/poc/claims/, which lands through a PR like every
# other change under docs/poc/.
git fetch origin --prune --quiet

# WHERE THIS TERMINAL WAS BEFORE, so it can be put back. CLAIM-01's defaults name
# the defect: this script used to leave the working tree ON the claim branch, so
# a SECOND claim in the same session was cut from the first claim's tree and
# carried the first claim in its diff. If the first pull request was then closed
# unmerged, which is what happened to #86, merging the second silently
# reinstated a claim the owner had declined.
CLAIM_RETURN_TO=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || git rev-parse HEAD)

# ON A TRAP AND NOT AT THE END, so it holds however this script stops. A caller
# that pipes this into `head` closes the pipe early and the script dies on
# SIGPIPE partway through, which would leave the tree on the claim branch and
# re-create the defect for the next claim in that session. Measured: piping the
# second claim of a session into `head -1` left the terminal on
# poc/claim-bbb-02 until this trap existed.
claim_return() {
  [ -n "${CLAIM_RETURN_TO:-}" ] || return 0
  [ "$(git symbolic-ref --quiet --short HEAD 2>/dev/null || git rev-parse HEAD)" = "$CLAIM_RETURN_TO" ] && return 0
  if git rev-parse --verify --quiet "$CLAIM_RETURN_TO" >/dev/null 2>&1; then
    git checkout --quiet "$CLAIM_RETURN_TO" 2>/dev/null \
      || git checkout --quiet --detach "$CLAIM_RETURN_TO" 2>/dev/null
  else
    git checkout --quiet --detach origin/main 2>/dev/null
  fi
}
trap claim_return EXIT PIPE TERM INT

BEFORE=$(git status --porcelain -- "$POC_CLAIMS_DIR" "$POC_STATE" | sort)
claims_tool
TOOL_EXIT=$?
if [ "$TOOL_EXIT" -ne 0 ]; then
  git checkout -- "$POC_STATE" 2>/dev/null
  git clean -fdq "$POC_CLAIMS_DIR" 2>/dev/null
  git checkout -- "$POC_CLAIMS_DIR" 2>/dev/null
  exit "$TOOL_EXIT"
fi
AFTER=$(git status --porcelain -- "$POC_CLAIMS_DIR" "$POC_STATE" | sort)

if [ "$BEFORE" = "$AFTER" ]; then
  echo "state unchanged, no PR opened"
  exit 0
fi

CLAIM_BRANCH=poc/claim-$(echo "$CARD_ID" | tr '[:upper:]' '[:lower:]')-$(date +%Y%m%d-%H%M%S)

# THE EDIT IS CARRIED ACROSS THE CHECKOUT, NOT RE-DERIVED ON THE OTHER SIDE. It
# is at most two paths: the claim file, and state.json only when a legacy entry
# had to be dropped. A patch is used rather than a copy of one named file,
# because a release DELETES a file and a copy cannot carry a deletion.
CLAIM_PATCH=$(mktemp)
git add -A -- "$POC_CLAIMS_DIR" "$POC_STATE"
git diff --cached --binary -- "$POC_CLAIMS_DIR" "$POC_STATE" > "$CLAIM_PATCH"
git reset -q -- "$POC_CLAIMS_DIR" "$POC_STATE"
git checkout -- "$POC_STATE" 2>/dev/null
git clean -fdq "$POC_CLAIMS_DIR" 2>/dev/null
git checkout -- "$POC_CLAIMS_DIR" 2>/dev/null

# A branch off origin/main so the PR is never BEHIND on arrival, which is the
# state that stranded PR #44 for three runs.
git checkout -b "$CLAIM_BRANCH" origin/main --quiet
git apply --index "$CLAIM_PATCH"
rm -f "$CLAIM_PATCH"

git add -A -- "$POC_CLAIMS_DIR" "$POC_STATE"
if git diff --cached --quiet; then
  echo "nothing staged, no PR opened"
  git checkout --detach --force origin/main --quiet
  exit 0
fi

git -c user.name="POC" -c user.email="happygamer1919@gmail.com" \
  commit -q -m "POC: $ACTION $CARD_ID for $ACTOR

Claim lease bookkeeping only. docs/poc/claims/ and, when a legacy entry had to
be dropped, docs/poc/state.json. No board file, no application code, no
migration.

A claim is advisory and expires after $POC_CLAIM_TTL_HOURS hours."

git push -q -u origin "$CLAIM_BRANCH"
CLAIM_PR=$(gh pr create --base main --head "$CLAIM_BRANCH" \
  --title "POC: $ACTION $CARD_ID for $ACTOR" \
  --body "Claim lease bookkeeping. \`docs/poc/claims/\` only, unless a legacy entry in \`docs/poc/state.json\` had to be dropped.

Actor: $ACTOR
Card: $CARD_ID
Action: $ACTION
Lease: expires after $POC_CLAIM_TTL_HOURS hours.

The harness reads this before it picks a card and skips anything claimed by
another actor within the lease window.

Acceptance: the file parses and \`scripts/poc/claim.sh list\` shows the change.
Migration files added: none." 2>/dev/null | tail -1)

echo "claim PR: $CLAIM_PR"
echo "The claim is live locally as soon as that PR merges. Until then the harness"
echo "still reads the old state from main."

# BACK WHERE THIS TERMINAL WAS. Card CLAIM-01: leaving the tree on the claim
# branch made the next claim in the same session carry this one in its diff, and
# if the first claim's pull request was then closed unmerged, which is what
# happened to #86, merging the second silently reinstated it. The move itself is
# in the EXIT trap above; this line only reports it.
claim_return
echo "returned to ${CLAIM_RETURN_TO}"
