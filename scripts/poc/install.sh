#!/bin/bash
#
# Installs the POC schedule. Idempotent: safe to run again after any change to
# run.sh or to the plist template.
#
# Three agents are installed, each with its own stable copy under
# /Users/ivan/rc-poc-bin and its own plist under ~/Library/LaunchAgents:
#   1. com.ai.rc-poc        run.sh,      the work harness, four times a day
#   2. com.ai.rc-poc-chat   responder.sh the conversational responder, every 60s
#   3. com.ai.rc-poc-digest digest.sh    the scheduled plain digest, twice a day
#
# The stable copy exists because run.sh hard resets the run worktree while it is
# running. Executing the copy that lives inside that worktree would mean the
# script is rewritten underneath its own interpreter on the first run after
# run.sh changes on main, and bash reads a script by byte offset as it goes.
#
# RUN THIS AFTER EVERY CHANGE TO run.sh. The repository is the source of truth;
# /Users/ivan/rc-poc-bin/run.sh is a deployed artifact and is never edited in
# place.
#
set -u -o pipefail

POC_LABEL=com.ai.rc-poc
POC_CHAT_LABEL=com.ai.rc-poc-chat
POC_DIGEST_LABEL=com.ai.rc-poc-digest
POC_BIN_DIR=/Users/ivan/rc-poc-bin
POC_LOG_DIR=/Users/ivan/rc-poc-logs
POC_AGENT_DIR=/Users/ivan/Library/LaunchAgents
POC_PLIST=/Users/ivan/Library/LaunchAgents/com.ai.rc-poc.plist
POC_CHAT_PLIST=/Users/ivan/Library/LaunchAgents/com.ai.rc-poc-chat.plist
POC_DIGEST_PLIST=/Users/ivan/Library/LaunchAgents/com.ai.rc-poc-digest.plist

# Resolve the repository this script was invoked from, so the install works
# from any worktree without being told which one.
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SOURCE_RUN_SH=$REPO_ROOT/scripts/poc/run.sh
SOURCE_PLIST=$REPO_ROOT/docs/poc/com.ai.rc-poc.plist.template
SOURCE_RESPONDER=$REPO_ROOT/scripts/poc/responder.sh
SOURCE_CHAT_PLIST=$REPO_ROOT/docs/poc/com.ai.rc-poc-chat.plist.template
SOURCE_DIGEST=$REPO_ROOT/scripts/poc/digest.sh
SOURCE_DIGEST_PLIST=$REPO_ROOT/docs/poc/com.ai.rc-poc-digest.plist.template

echo "installing from $REPO_ROOT"

for REQUIRED in "$SOURCE_RUN_SH" "$SOURCE_PLIST" "$SOURCE_RESPONDER" "$SOURCE_CHAT_PLIST" \
                "$SOURCE_DIGEST" "$SOURCE_DIGEST_PLIST"; do
  if [ ! -f "$REQUIRED" ]; then
    echo "FATAL: missing $REQUIRED"
    exit 1
  fi
done

# Refuse while a work run is in flight. launchctl bootout TERMINATES a running
# job, so reinstalling mid-run kills it: on 2026-08-27 a reinstall stopped an
# EXECUTOR that was 36 minutes into its work, which then reported exit 143 and
# looked like a model failure. Worse, bootstrap then failed with "Input/output
# error" and the script exited before installing the responder at all, so a
# reinstall that appeared to have run had silently deployed half of itself.
POC_RUN_LOCK=/Users/ivan/rc-poc-logs/run.lock
if [ -e "$POC_RUN_LOCK" ]; then
  echo "REFUSED: a work run is in flight and reinstalling would kill it."
  echo "holder: $(tr '\n' ' ' < "$POC_RUN_LOCK" 2>/dev/null)"
  echo "Wait for it to finish, or pass --force to install anyway."
  if [ "${1:-}" != "--force" ]; then
    exit 3
  fi
  echo "--force given, installing over a live run."
fi

# asks/ is the ASK-01 spool: open questions, answers landing from the chat
# poller, and the archive of both. It is created here rather than lazily,
# because the process that WRITES an answer into it is chat-classify.mjs, which
# runs inside the responder and must never be the thing that creates a
# directory it then races another poll to fill.
mkdir -p "$POC_BIN_DIR" "$POC_LOG_DIR" "$POC_LOG_DIR/chat" "$POC_AGENT_DIR" \
         "$POC_LOG_DIR/asks" "$POC_LOG_DIR/asks/open" "$POC_LOG_DIR/asks/answers" \
         "$POC_LOG_DIR/asks/answered"

install -m 755 "$SOURCE_RUN_SH" "$POC_BIN_DIR/run.sh"
echo "installed $POC_BIN_DIR/run.sh"

# Copied verbatim. The template carries no secret and no placeholder, so there
# is nothing to substitute and no rendered variant to drift from it.
install -m 644 "$SOURCE_PLIST" "$POC_PLIST"
echo "installed $POC_PLIST"

if ! plutil -lint "$POC_PLIST"; then
  echo "FATAL: the installed plist does not parse"
  exit 1
fi

# bootout first so a reinstall replaces the definition rather than layering on
# it. A missing agent is not an error here.
launchctl bootout "gui/$(id -u)/$POC_LABEL" 2>/dev/null

# A bootstrap failure on the first agent must not abandon the second one
# half-installed. Recorded and carried, then reported at the end.
BOOTSTRAP_FAILURES=""
if ! launchctl bootstrap "gui/$(id -u)" "$POC_PLIST"; then
  echo "WARNING: launchctl bootstrap failed for $POC_LABEL"
  BOOTSTRAP_FAILURES="$BOOTSTRAP_FAILURES $POC_LABEL"
else
  echo "bootstrapped $POC_LABEL"
fi

# ---------------------------------------------------------------------------
# The responder, AUT-6. A second agent on its own 60 second schedule, so a
# question never waits on the three hour build cycle and never delays it.
# ---------------------------------------------------------------------------
install -m 755 "$SOURCE_RESPONDER" "$POC_BIN_DIR/responder.sh"
echo "installed $POC_BIN_DIR/responder.sh"

install -m 644 "$SOURCE_CHAT_PLIST" "$POC_CHAT_PLIST"
echo "installed $POC_CHAT_PLIST"

if ! plutil -lint "$POC_CHAT_PLIST"; then
  echo "FATAL: the installed chat plist does not parse"
  exit 1
fi

launchctl bootout "gui/$(id -u)/$POC_CHAT_LABEL" 2>/dev/null

if ! launchctl bootstrap "gui/$(id -u)" "$POC_CHAT_PLIST"; then
  echo "WARNING: launchctl bootstrap failed for $POC_CHAT_LABEL"
  BOOTSTRAP_FAILURES="$BOOTSTRAP_FAILURES $POC_CHAT_LABEL"
else
  echo "bootstrapped $POC_CHAT_LABEL"
fi

# ---------------------------------------------------------------------------
# The scheduled digest, DIGEST-01. A third agent on a wall clock schedule, so a
# report arrives when Ivan starts and when he stops rather than when the build
# cycle happens to finish. It is silent unless something changed.
# ---------------------------------------------------------------------------
install -m 755 "$SOURCE_DIGEST" "$POC_BIN_DIR/digest.sh"
echo "installed $POC_BIN_DIR/digest.sh"

install -m 644 "$SOURCE_DIGEST_PLIST" "$POC_DIGEST_PLIST"
echo "installed $POC_DIGEST_PLIST"

if ! plutil -lint "$POC_DIGEST_PLIST"; then
  echo "FATAL: the installed digest plist does not parse"
  exit 1
fi

launchctl bootout "gui/$(id -u)/$POC_DIGEST_LABEL" 2>/dev/null

if ! launchctl bootstrap "gui/$(id -u)" "$POC_DIGEST_PLIST"; then
  echo "WARNING: launchctl bootstrap failed for $POC_DIGEST_LABEL"
  BOOTSTRAP_FAILURES="$BOOTSTRAP_FAILURES $POC_DIGEST_LABEL"
else
  echo "bootstrapped $POC_DIGEST_LABEL"
fi

echo "---"
echo "launchctl list:"
launchctl list | grep "$POC_LABEL" || echo "WARNING: $POC_LABEL not listed"
launchctl list | grep "$POC_CHAT_LABEL" || echo "WARNING: $POC_CHAT_LABEL not listed"
launchctl list | grep "$POC_DIGEST_LABEL" || echo "WARNING: $POC_DIGEST_LABEL not listed"
echo "---"
echo "work harness runs at: 22:00, 01:00, 04:00, 07:00 local"
echo "responder polls every 60 seconds"
echo "digest runs at: 08:00 and 19:00 local, and is silent when nothing changed"
echo "run the work harness now with: launchctl kickstart -k gui/$(id -u)/$POC_LABEL"
echo "send a proof digest now with:  bash $POC_BIN_DIR/digest.sh --force"

if [ -n "$BOOTSTRAP_FAILURES" ]; then
  echo "---"
  echo "FAILED to bootstrap:$BOOTSTRAP_FAILURES"
  echo "Both files are installed. Re-run this script when nothing is in flight."
  exit 1
fi
