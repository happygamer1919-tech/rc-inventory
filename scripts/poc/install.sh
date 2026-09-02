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

# P3-11b. THE ROOT IS A VARIABLE, SO THIS SCRIPT CAN BE PROVED BY RUNNING IT.
#
# Every path below used to be a literal under /Users/ivan, which meant the only
# way to find out whether the installer works was to run it over the owner's live
# installation. So nobody ran it, and DIGEST-01 shipped an installer that carried
# the digest and a machine that did not: `bash /Users/ivan/rc-poc-bin/digest.sh
# --force` answered "No such file or directory" for a day, with the code to
# install it sitting on main the whole time.
#
# POC_INSTALL_ROOT lets scripts/poc/test-install.sh install into a temporary
# directory and then INVOKE what it installed. The default is unchanged, so a
# real install is still `bash scripts/poc/install.sh` with no environment at all.
POC_INSTALL_ROOT=${POC_INSTALL_ROOT:-/Users/ivan}

POC_LABEL=com.ai.rc-poc
POC_CHAT_LABEL=com.ai.rc-poc-chat
POC_DIGEST_LABEL=com.ai.rc-poc-digest
POC_BIN_DIR=$POC_INSTALL_ROOT/rc-poc-bin
POC_LOG_DIR=$POC_INSTALL_ROOT/rc-poc-logs
POC_AGENT_DIR=$POC_INSTALL_ROOT/Library/LaunchAgents
POC_PLIST=$POC_AGENT_DIR/com.ai.rc-poc.plist
POC_CHAT_PLIST=$POC_AGENT_DIR/com.ai.rc-poc-chat.plist
POC_DIGEST_PLIST=$POC_AGENT_DIR/com.ai.rc-poc-digest.plist

# launchctl and plutil are macOS and they act on the LIVE session, so they are
# skipped when the root is not the real one. A temporary prefix that bootstrapped
# an agent would install a launchd job pointing at a directory the test is about
# to delete.
if [ "$POC_INSTALL_ROOT" = "/Users/ivan" ]; then
  POC_LIVE_INSTALL=yes
else
  POC_LIVE_INSTALL=no
  echo "POC_INSTALL_ROOT=$POC_INSTALL_ROOT, so launchctl and plutil are skipped"
fi

# Resolve the repository this script was invoked from, so the install works
# from any worktree without being told which one.
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
# POC_INSTALL_REPO_ROOT exists for one caller: scripts/poc/test-install.sh runs a
# MUTATED COPY of this file from a temporary directory, and a copy resolves its
# repository from its own location, which is the temporary directory. Without the
# override the mutant dies on "missing .../scripts/poc/run.sh", which installs no
# digest either and would satisfy the assertion it is supposed to fail.
REPO_ROOT=${POC_INSTALL_REPO_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}
# P3-11b. THE MANIFEST. ONE LIST, AND EVERY LOOP BELOW DERIVES FROM IT.
#
# Three agents used to be three copy-pasted blocks of eight lines each. Adding a
# fourth meant remembering eight lines in three places, and the failure mode of
# forgetting one is an installer that reports success having deployed part of
# itself. That has already happened here once, in a different form, and the
# comment about --force below is what it left behind.
#
# Each row: LABEL|SOURCE|DESTINATION|MODE|DESCRIPTION
# The plist row of each agent immediately follows its script row, because the
# order below is the install order and a plist that is bootstrapped before its
# script exists points at nothing.
POC_MANIFEST="\
$POC_LABEL|$REPO_ROOT/scripts/poc/run.sh|$POC_BIN_DIR/run.sh|755|the work harness
$POC_LABEL|$REPO_ROOT/docs/poc/com.ai.rc-poc.plist.template|$POC_PLIST|644|its agent
$POC_CHAT_LABEL|$REPO_ROOT/scripts/poc/responder.sh|$POC_BIN_DIR/responder.sh|755|the conversational responder
$POC_CHAT_LABEL|$REPO_ROOT/docs/poc/com.ai.rc-poc-chat.plist.template|$POC_CHAT_PLIST|644|its agent
$POC_DIGEST_LABEL|$REPO_ROOT/scripts/poc/digest.sh|$POC_BIN_DIR/digest.sh|755|the scheduled digest
$POC_DIGEST_LABEL|$REPO_ROOT/docs/poc/com.ai.rc-poc-digest.plist.template|$POC_DIGEST_PLIST|644|its agent"

# THE SPOOL DIRECTORIES, ALSO A LIST AND ALSO DERIVED.
#
# asks/ is the ASK-01 spool and rulings/ is the P3-11a spool. Both are created
# HERE rather than lazily by the process that writes into them, and the reason is
# the same for both: the writer is chat-classify.mjs, running inside the
# responder, and it must never be the thing that creates a directory it then
# races the next poll to fill.
#
# rulings/ WAS MISSING UNTIL THIS CARD. P3-11a added the spool and its module
# creates the directory on first write, which is exactly the race the paragraph
# above exists to prevent. Found by reading this list against that card rather
# than by anything going red, which is why the list is now one place.
POC_SPOOL_DIRS="\
$POC_BIN_DIR
$POC_LOG_DIR
$POC_LOG_DIR/chat
$POC_AGENT_DIR
$POC_LOG_DIR/asks
$POC_LOG_DIR/asks/open
$POC_LOG_DIR/asks/answers
$POC_LOG_DIR/asks/answered
$POC_LOG_DIR/rulings
$POC_LOG_DIR/rulings/pending
$POC_LOG_DIR/rulings/consumed"

echo "installing from $REPO_ROOT into $POC_INSTALL_ROOT"

# Every source is checked BEFORE anything is written, so a missing file cannot
# leave half an installation behind.
while IFS='|' read -r M_LABEL M_SRC M_DEST M_MODE M_DESC; do
  [ -z "$M_LABEL" ] && continue
  if [ ! -f "$M_SRC" ]; then
    echo "FATAL: missing $M_SRC ($M_DESC)"
    exit 1
  fi
done <<< "$POC_MANIFEST"

# Refuse while a work run is in flight. launchctl bootout TERMINATES a running
# job, so reinstalling mid-run kills it: on 2026-08-27 a reinstall stopped an
# EXECUTOR that was 36 minutes into its work, which then reported exit 143 and
# looked like a model failure. Worse, bootstrap then failed with "Input/output
# error" and the script exited before installing the responder at all, so a
# reinstall that appeared to have run had silently deployed half of itself.
POC_RUN_LOCK=$POC_LOG_DIR/run.lock
if [ -e "$POC_RUN_LOCK" ]; then
  echo "REFUSED: a work run is in flight and reinstalling would kill it."
  echo "holder: $(tr '\n' ' ' < "$POC_RUN_LOCK" 2>/dev/null)"
  echo "Wait for it to finish, or pass --force to install anyway."
  if [ "${1:-}" != "--force" ]; then
    exit 3
  fi
  echo "--force given, installing over a live run."
fi

while IFS= read -r SPOOL_DIR; do
  [ -z "$SPOOL_DIR" ] && continue
  mkdir -p "$SPOOL_DIR"
done <<< "$POC_SPOOL_DIRS"

# ---------------------------------------------------------------------------
# THE INSTALL, ONE LOOP OVER THE MANIFEST.
#
# A bootstrap failure on one agent must not abandon the next one half-installed.
# Recorded and carried, then reported at the end. That is not a hypothetical:
# on 2026-08-27 a bootstrap failed with "Input/output error" and the old script
# exited before installing the responder at all, so a reinstall that appeared to
# have run had silently deployed half of itself.
# ---------------------------------------------------------------------------
BOOTSTRAP_FAILURES=""
INSTALLED_COUNT=0

while IFS='|' read -r M_LABEL M_SRC M_DEST M_MODE M_DESC; do
  [ -z "$M_LABEL" ] && continue

  install -m "$M_MODE" "$M_SRC" "$M_DEST"
  INSTALLED_COUNT=$(( INSTALLED_COUNT + 1 ))
  echo "installed $M_DEST ($M_DESC)"

  # Only plists are linted and bootstrapped, and a plist is exactly a 644 row.
  case "$M_DEST" in
    *.plist) ;;
    *) continue ;;
  esac

  if [ "$POC_LIVE_INSTALL" = yes ]; then
    if ! plutil -lint "$M_DEST"; then
      echo "FATAL: the installed plist does not parse: $M_DEST"
      exit 1
    fi

    # bootout first so a reinstall replaces the definition rather than layering
    # on it. A missing agent is not an error here.
    launchctl bootout "gui/$(id -u)/$M_LABEL" 2>/dev/null

    if ! launchctl bootstrap "gui/$(id -u)" "$M_DEST"; then
      echo "WARNING: launchctl bootstrap failed for $M_LABEL"
      BOOTSTRAP_FAILURES="$BOOTSTRAP_FAILURES $M_LABEL"
    else
      echo "bootstrapped $M_LABEL"
    fi
  fi
done <<< "$POC_MANIFEST"

# THE COUNT IS ASSERTED AGAINST THE MANIFEST, and that is the whole reason the
# manifest is a list. A loop that reads zero rows installs nothing and reports
# every step it did not take as a step that did not fail. docs/LEARNINGS.md
# names that class: any matcher whose empty result means "nothing to do" asserts
# its input count against its match count.
POC_MANIFEST_ROWS=$(printf '%s\n' "$POC_MANIFEST" | grep -c '|')
if [ "$INSTALLED_COUNT" -ne "$POC_MANIFEST_ROWS" ]; then
  echo "FATAL: the manifest has $POC_MANIFEST_ROWS row(s) and $INSTALLED_COUNT were installed."
  echo "An installer that skipped a row silently is the defect this count exists to catch."
  exit 1
fi
echo "installed $INSTALLED_COUNT of $POC_MANIFEST_ROWS manifest row(s)"

if [ "$POC_LIVE_INSTALL" != yes ]; then
  echo "---"
  echo "prefix install complete under $POC_INSTALL_ROOT, no agent was bootstrapped"
  exit 0
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
