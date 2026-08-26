#!/bin/bash
#
# Installs the POC schedule. Idempotent: safe to run again after any change to
# run.sh or to the plist template.
#
# Two things are installed:
#   1. a stable copy of run.sh at /Users/ivan/rc-poc-bin/run.sh
#   2. the launchd agent at /Users/ivan/Library/LaunchAgents/com.ai.rc-poc.plist
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
POC_BIN_DIR=/Users/ivan/rc-poc-bin
POC_LOG_DIR=/Users/ivan/rc-poc-logs
POC_AGENT_DIR=/Users/ivan/Library/LaunchAgents
POC_PLIST=/Users/ivan/Library/LaunchAgents/com.ai.rc-poc.plist

# Resolve the repository this script was invoked from, so the install works
# from any worktree without being told which one.
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SOURCE_RUN_SH=$REPO_ROOT/scripts/poc/run.sh
SOURCE_PLIST=$REPO_ROOT/docs/poc/com.ai.rc-poc.plist.template

echo "installing from $REPO_ROOT"

for REQUIRED in "$SOURCE_RUN_SH" "$SOURCE_PLIST"; do
  if [ ! -f "$REQUIRED" ]; then
    echo "FATAL: missing $REQUIRED"
    exit 1
  fi
done

mkdir -p "$POC_BIN_DIR" "$POC_LOG_DIR" "$POC_AGENT_DIR"

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

if ! launchctl bootstrap "gui/$(id -u)" "$POC_PLIST"; then
  echo "FATAL: launchctl bootstrap failed"
  exit 1
fi
echo "bootstrapped $POC_LABEL"

echo "---"
echo "launchctl list:"
launchctl list | grep "$POC_LABEL" || echo "WARNING: label not listed"
echo "---"
echo "next scheduled runs: 22:00, 01:00, 04:00, 07:00 local"
echo "run one now with: launchctl kickstart -k gui/$(id -u)/$POC_LABEL"
